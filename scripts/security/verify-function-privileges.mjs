import { randomUUID } from "node:crypto";
import { pathToFileURL } from "node:url";

const protectedCalls = () => [
  ["is_event_owner", { target_event_id: randomUUID() }],
  ["is_joined_event_member", { target_event_id: randomUUID() }],
  ["have_shared_event", { first_user_id: randomUUID(), second_user_id: randomUUID() }],
  ["is_user_blocked", { first_user_id: randomUUID(), second_user_id: randomUUID() }],
  ["is_following", { follower_id: randomUUID(), followed_id: randomUUID() }],
  ["list_owned_event_ids", { p_filter: "all", p_category: "all", p_sort: "latest", p_limit: 1, p_offset: 0 }]
];

function isUuid(value) {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function normalizedUrl(value) {
  try {
    const url = new URL(value);
    const isLocalHttp = url.protocol === "http:" && ["localhost", "127.0.0.1", "::1"].includes(url.hostname);

    if ((url.protocol !== "https:" && !isLocalHttp) || url.username || url.password || url.search || url.hash) {
      return null;
    }

    return url.toString().replace(/\/$/, "");
  } catch {
    return null;
  }
}

function jwtSubject(token) {
  try {
    const payload = JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString("utf8"));
    return isUuid(payload.sub) ? payload.sub : null;
  } catch {
    return null;
  }
}

function isDenied(status) {
  return status === 401 || status === 403;
}

async function rpc({ baseUrl, apiKey, token, functionName, args, fetchImpl, timeoutMs, setTimeoutImpl, clearTimeoutImpl }) {
  const headers = {
    apikey: apiKey,
    "content-type": "application/json"
  };

  if (token) {
    headers.authorization = `Bearer ${token}`;
  }

  const controller = new AbortController();
  const timeoutId = setTimeoutImpl(() => controller.abort(), timeoutMs);

  try {
    return await fetchImpl(`${baseUrl}/rest/v1/rpc/${functionName}`, {
      method: "POST",
      headers,
      body: JSON.stringify(args),
      signal: controller.signal
    });
  } finally {
    clearTimeoutImpl(timeoutId);
  }
}

async function json(response) {
  try {
    return await response.json();
  } catch {
    return undefined;
  }
}

async function checkAnonymous({ baseUrl, apiKey, fetchImpl, requestOptions }) {
  for (const [functionName, args] of protectedCalls()) {
    const response = await rpc({ baseUrl, apiKey, functionName, args, fetchImpl, ...requestOptions });
    if (!isDenied(response.status)) {
      return false;
    }
  }

  return true;
}

async function checkAuthenticatedUser({ baseUrl, apiKey, token, userId, counterpartUserId, ownEventId, counterpartEventId, fetchImpl, requestOptions }) {
  for (const functionName of ["is_event_owner", "is_joined_event_member"]) {
    const response = await rpc({
      baseUrl,
      apiKey,
      token,
      functionName,
      args: { target_event_id: ownEventId },
      fetchImpl,
      ...requestOptions
    });

    if (response.status !== 200 || (await json(response)) !== true) {
      return false;
    }

    const counterpartResponse = await rpc({
      baseUrl,
      apiKey,
      token,
      functionName,
      args: { target_event_id: counterpartEventId },
      fetchImpl,
      ...requestOptions
    });
    if (!isDenied(counterpartResponse.status) && (counterpartResponse.status !== 200 || (await json(counterpartResponse)) !== false)) {
      return false;
    }
  }

  for (const [functionName, args] of [
    ["have_shared_event", { first_user_id: userId, second_user_id: counterpartUserId }],
    ["is_user_blocked", { first_user_id: userId, second_user_id: counterpartUserId }],
    ["is_following", { follower_id: userId, followed_id: counterpartUserId }]
  ]) {
    const response = await rpc({ baseUrl, apiKey, token, functionName, args, fetchImpl, ...requestOptions });
    if (!isDenied(response.status) && (response.status !== 200 || (await json(response)) !== false)) {
      return false;
    }
  }

  const response = await rpc({
    baseUrl,
    apiKey,
    token,
    functionName: "list_owned_event_ids",
    args: { p_filter: "all", p_category: "all", p_sort: "latest", p_limit: 1, p_offset: 0 },
    fetchImpl,
    ...requestOptions
  });
  const rows = await json(response);
  const eventIds = Array.isArray(rows) && Array.isArray(rows[0]?.event_ids) ? rows[0].event_ids : [];

  return response.status === 200 && eventIds.includes(ownEventId) && !eventIds.includes(counterpartEventId);
}

export async function runSecurityProbe({ env = process.env, fetchImpl = fetch, write = console.error, timeoutMs, setTimeoutImpl = setTimeout, clearTimeoutImpl = clearTimeout } = {}) {
  const baseUrl = normalizedUrl(env.SECURITY_TEST_SUPABASE_URL);
  const apiKey = env.SECURITY_TEST_ANON_KEY;
  const mode = env.SECURITY_TEST_MODE ?? "anon-only";
  const productionUrl = normalizedUrl(env.NEXT_PUBLIC_SUPABASE_URL);
  const requestTimeoutMs = Number(timeoutMs ?? env.SECURITY_TEST_TIMEOUT_MS ?? 10_000);

  if (!baseUrl || !apiKey || !["anon-only", "full"].includes(mode) || !Number.isFinite(requestTimeoutMs) || requestTimeoutMs <= 0) {
    write("Security verification failed: invalid configuration.");
    return 1;
  }

  if (baseUrl === productionUrl && env.ALLOW_PRODUCTION_SECURITY_PROBE !== "true") {
    write("Security verification failed: production probe is not allowed.");
    return 1;
  }

  try {
    const requestOptions = { timeoutMs: requestTimeoutMs, setTimeoutImpl, clearTimeoutImpl };
    if (!(await checkAnonymous({ baseUrl, apiKey, fetchImpl, requestOptions }))) {
      write("Security verification failed: anonymous access was not denied.");
      return 1;
    }

    if (mode === "anon-only") {
      write("Security verification passed.");
      return 0;
    }

    const users = [
      {
        token: env.SECURITY_TEST_USER_A_JWT,
        userId: jwtSubject(env.SECURITY_TEST_USER_A_JWT ?? ""),
        counterpartUserId: jwtSubject(env.SECURITY_TEST_USER_B_JWT ?? ""),
        ownEventId: env.SECURITY_TEST_USER_A_EVENT_ID,
        counterpartEventId: env.SECURITY_TEST_USER_B_EVENT_ID
      },
      {
        token: env.SECURITY_TEST_USER_B_JWT,
        userId: jwtSubject(env.SECURITY_TEST_USER_B_JWT ?? ""),
        counterpartUserId: jwtSubject(env.SECURITY_TEST_USER_A_JWT ?? ""),
        ownEventId: env.SECURITY_TEST_USER_B_EVENT_ID,
        counterpartEventId: env.SECURITY_TEST_USER_A_EVENT_ID
      }
    ];

    if (users.some(({ token, userId, counterpartUserId, ownEventId, counterpartEventId }) => !token || !userId || !counterpartUserId || !isUuid(ownEventId) || !isUuid(counterpartEventId))) {
      write("Security verification failed: invalid full-mode configuration.");
      return 1;
    }

    for (const user of users) {
      if (!(await checkAuthenticatedUser({ baseUrl, apiKey, fetchImpl, requestOptions, ...user }))) {
        write("Security verification failed: authenticated access contract did not match.");
        return 1;
      }
    }
  } catch {
    write("Security verification failed: request could not be verified.");
    return 1;
  }

  write("Security verification passed.");
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runSecurityProbe().then((exitCode) => {
    process.exitCode = exitCode;
  });
}
