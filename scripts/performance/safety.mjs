import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve, sep } from "node:path";

export const MAX_WRITE_BATCH_SIZE = 500;

const RUN_ID_PATTERN = /^[a-z0-9](?:[a-z0-9_-]{1,62}[a-z0-9])?$/i;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PROJECT_REF_PATTERN = /^[a-z0-9]{20}$/;
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);
const ARTIFACT_ROOT = resolve(process.cwd(), "artifacts/performance");

function parseTarget(rawValue) {
  if (typeof rawValue !== "string" || !rawValue.trim()) {
    throw new Error("PERF_SUPABASE_URL is required.");
  }

  let target;
  try {
    target = new URL(rawValue);
  } catch {
    throw new Error("Performance target is malformed.");
  }

  const isLocal = LOCAL_HOSTS.has(target.hostname);
  const isAllowedProtocol = target.protocol === "https:" || (isLocal && target.protocol === "http:");
  if (
    !isAllowedProtocol ||
    target.username ||
    target.password ||
    target.search ||
    target.hash ||
    (target.pathname !== "/" && target.pathname !== "")
  ) {
    throw new Error("Performance target is malformed.");
  }

  if (isLocal) {
    return { normalizedUrl: target.origin, isLocal, projectRef: null };
  }

  const match = target.hostname.match(/^([a-z0-9]{20})\.supabase\.co$/);
  if (!match) {
    throw new Error("Performance target must be a local or Supabase test project.");
  }

  return { normalizedUrl: target.origin, isLocal, projectRef: match[1] };
}

function comparableUrl(rawValue) {
  if (typeof rawValue !== "string" || !rawValue.trim()) return null;
  try {
    return new URL(rawValue).origin;
  } catch {
    return null;
  }
}

export function assertSafePerformanceTarget(env = process.env) {
  const target = parseTarget(env.PERF_SUPABASE_URL);
  const runId = env.PERF_RUN_ID;
  if (typeof runId !== "string" || !RUN_ID_PATTERN.test(runId)) {
    throw new Error("PERF_RUN_ID must contain only safe letters, numbers, dashes, or underscores.");
  }

  const knownApplicationTargets = [
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.SUPABASE_URL,
    env.PERF_PRODUCTION_SUPABASE_URL
  ].map(comparableUrl).filter(Boolean);
  if (knownApplicationTargets.includes(target.normalizedUrl)) {
    throw new Error("Performance target must not reuse a production or public application target.");
  }

  if (!target.isLocal) {
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
  return Object.freeze({
    baseUrl: target.normalizedUrl,
    isLocal: target.isLocal,
    projectRef: target.projectRef ?? "local",
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
  if (!RUN_ID_PATTERN.test(runId)) throw new Error("Invalid performance run id.");
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
