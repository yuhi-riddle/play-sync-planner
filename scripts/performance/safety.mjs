import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve, sep } from "node:path";

export const MAX_WRITE_BATCH_SIZE = 500;

const RUN_ID_PATTERN = /^[a-z0-9](?:[a-z0-9_-]*[a-z0-9])?$/i;
const RUN_ID_MAX_LENGTH = 64;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PROJECT_REF_PATTERN = /^[a-z0-9]{20}$/;
const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);
const ARTIFACT_ROOT = resolve(process.cwd(), "artifacts/performance");

function validRunId(value) {
  return typeof value === "string" && value.length <= RUN_ID_MAX_LENGTH && RUN_ID_PATTERN.test(value);
}

function withoutTrailingDot(hostname) {
  return hostname.endsWith(".") ? hostname.slice(0, -1) : hostname;
}

export function canonicalizePerformanceUrl(rawValue) {
  if (typeof rawValue !== "string" || !rawValue.trim()) {
    throw new Error("Performance target URL is required.");
  }

  let url;
  try {
    url = new URL(rawValue.trim());
  } catch {
    throw new Error("Performance target URL is malformed.");
  }

  const hostname = withoutTrailingDot(url.hostname.toLowerCase());
  const isLoopback = LOOPBACK_HOSTS.has(hostname);
  const isAllowedProtocol = url.protocol === "https:" || (isLoopback && url.protocol === "http:");
  if (
    !isAllowedProtocol ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== "/"
  ) {
    throw new Error("Performance target URL is malformed.");
  }

  const protocol = url.protocol.slice(0, -1);
  const defaultPort = protocol === "https" ? "443" : "80";
  const effectivePort = url.port || defaultPort;
  const explicitPort = url.port ? `:${url.port}` : "";
  const canonicalHostname = isLoopback ? "loopback" : hostname;
  return Object.freeze({
    normalizedOrigin: `${url.protocol}//${hostname}${explicitPort}`,
    canonicalOrigin: `${url.protocol}//${canonicalHostname}${explicitPort}`,
    canonicalHostname,
    effectivePort,
    hostname,
    isLoopback,
    protocol
  });
}

function parseTarget(rawValue) {
  if (typeof rawValue !== "string" || !rawValue.trim()) {
    throw new Error("PERF_SUPABASE_URL is required.");
  }
  const target = canonicalizePerformanceUrl(rawValue);
  if (target.isLoopback) return { ...target, projectRef: null };

  const match = target.hostname.match(/^([a-z0-9]{20})\.supabase\.co$/);
  if (!match) {
    throw new Error("Performance target must be a local or Supabase test project.");
  }

  return { ...target, projectRef: match[1] };
}

function knownCanonicalOrigin(rawValue, name) {
  if (typeof rawValue !== "string" || !rawValue.trim()) return null;
  try {
    return canonicalizePerformanceUrl(rawValue).canonicalOrigin;
  } catch {
    throw new Error(`${name} is malformed.`);
  }
}

export function assertSafePerformanceTarget(env = process.env) {
  const target = parseTarget(env.PERF_SUPABASE_URL);
  const runId = env.PERF_RUN_ID;
  if (!validRunId(runId)) {
    throw new Error(`PERF_RUN_ID must be 1-${RUN_ID_MAX_LENGTH} safe letters, numbers, dashes, or underscores.`);
  }

  const knownApplicationTargets = [
    [env.NEXT_PUBLIC_SUPABASE_URL, "NEXT_PUBLIC_SUPABASE_URL"],
    [env.SUPABASE_URL, "SUPABASE_URL"],
    [env.PERF_PRODUCTION_SUPABASE_URL, "PERF_PRODUCTION_SUPABASE_URL"]
  ].map(([value, name]) => knownCanonicalOrigin(value, name)).filter(Boolean);
  if (knownApplicationTargets.includes(target.canonicalOrigin)) {
    throw new Error("Performance target must not reuse a production or public application target.");
  }

  if (!target.isLoopback) {
    const expectedRef = env.PERF_EXPECTED_PROJECT_REF;
    if (typeof expectedRef !== "string" || !PROJECT_REF_PATTERN.test(expectedRef)) {
      throw new Error("PERF_EXPECTED_PROJECT_REF is required for a remote test target.");
    }
    if (target.projectRef !== expectedRef) {
      throw new Error("Performance target project ref does not match the verified ref.");
    }
  }
}

export function safePerformanceConfig(env = process.env) {
  assertSafePerformanceTarget(env);
  const target = parseTarget(env.PERF_SUPABASE_URL);
  const targetRef = target.projectRef ?? `local:${target.protocol}:loopback:${target.effectivePort}`;
  return Object.freeze({
    baseUrl: target.normalizedOrigin,
    isLocal: target.isLoopback,
    targetRef,
    runId: env.PERF_RUN_ID
  });
}

export function requirePerfValue(env, name) {
  if (!name.startsWith("PERF_") || typeof env[name] !== "string" || !env[name].trim()) {
    throw new Error(`Missing required performance setting: ${name}.`);
  }
  return env[name].trim();
}

export function performanceLabel(runId, value) {
  if (!validRunId(runId)) throw new Error("Invalid performance run id.");
  return `[perf:${runId}] ${String(value)}`;
}

export function chunkRows(rows, size = MAX_WRITE_BATCH_SIZE) {
  if (!Number.isInteger(size) || size < 1 || size > MAX_WRITE_BATCH_SIZE) {
    throw new Error(`Write batches must contain at most ${MAX_WRITE_BATCH_SIZE} rows.`);
  }
  const chunks = [];
  for (let index = 0; index < rows.length; index += size) {
    chunks.push(rows.slice(index, index + size));
  }
  return chunks;
}

export function assertExactCleanupIds({ runId, manifestRunId, targetRef, manifestTargetRef, ids }) {
  if (runId !== manifestRunId) throw new Error("Cleanup manifest belongs to a different run.");
  if ((targetRef || manifestTargetRef) && targetRef !== manifestTargetRef) {
    throw new Error("Cleanup manifest belongs to a different target.");
  }
  if (!Array.isArray(ids) || ids.some((id) => typeof id !== "string" || !UUID_PATTERN.test(id))) {
    throw new Error("Cleanup accepts exact UUID values only.");
  }
  return [...new Set(ids)];
}

export function artifactPath(fileName) {
  if (typeof fileName !== "string" || !/^[a-z0-9][a-z0-9._-]*\.json$/i.test(fileName)) {
    throw new Error("Invalid performance artifact name.");
  }
  const target = resolve(ARTIFACT_ROOT, fileName);
  if (!target.startsWith(`${ARTIFACT_ROOT}${sep}`)) throw new Error("Invalid performance artifact path.");
  return target;
}

export async function writeJsonArtifact(fileName, value) {
  const target = artifactPath(fileName);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, `${JSON.stringify(value, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
}

export async function createJsonArtifact(fileName, value) {
  const target = artifactPath(fileName);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, `${JSON.stringify(value, null, 2)}\n`, {
    encoding: "utf8",
    flag: "wx",
    mode: 0o600
  });
}

export async function readJsonArtifact(fileName) {
  return JSON.parse(await readFile(artifactPath(fileName), "utf8"));
}
