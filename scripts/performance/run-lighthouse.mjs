import { execFile as execFileCallback } from "node:child_process";
import { promisify } from "node:util";
import { isAbsolute, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import {
  requirePerfValue,
  safePerformanceConfig,
  writeJsonArtifact
} from "./safety.mjs";

const execFile = promisify(execFileCallback);

export const LIGHTHOUSE_RUNS = 3;
export const LIGHTHOUSE_PATHS = ["/connections", "/plans", "eventDetail"];
export const LIGHTHOUSE_THROTTLING_METHOD = "simulate";
export const LIGHTHOUSE_CPU_SLOWDOWN = 4;
export const LIGHTHOUSE_LCP_LIMIT_MS = 3_000;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

function safeAppOrigin(env) {
  const rawValue = requirePerfValue(env, "PERF_APP_URL");
  let url;
  try {
    url = new URL(rawValue);
  } catch {
    throw new Error("PERF_APP_URL is malformed.");
  }
  const isLocal = LOCAL_HOSTS.has(url.hostname);
  if (
    (url.protocol !== "https:" && !(isLocal && url.protocol === "http:")) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    (url.pathname !== "/" && url.pathname !== "")
  ) {
    throw new Error("PERF_APP_URL is malformed.");
  }
  if (!isLocal && env.PERF_EXPECTED_APP_HOST !== url.hostname) {
    throw new Error("PERF_EXPECTED_APP_HOST must exactly match the remote test application.");
  }
  if (env.PERF_PRODUCTION_APP_URL) {
    let productionOrigin;
    try {
      productionOrigin = new URL(env.PERF_PRODUCTION_APP_URL).origin;
    } catch {
      throw new Error("PERF_PRODUCTION_APP_URL is malformed.");
    }
    if (productionOrigin === url.origin) throw new Error("Production Lighthouse runs are not allowed.");
  }
  return url.origin;
}

function routeDefinitions(env) {
  const eventId = requirePerfValue(env, "PERF_EVENT_ID");
  if (!UUID_PATTERN.test(eventId)) throw new Error("PERF_EVENT_ID must be an exact UUID.");
  return [
    { name: "connections", path: "/connections" },
    { name: "plans", path: "/plans" },
    { name: "event-detail", path: `/events/${eventId}` }
  ];
}

export function lighthouseArguments({ url, userDataDir, profileDirectory }) {
  validateChromeProfile(userDataDir, profileDirectory);
  return [
    resolve(process.cwd(), "node_modules/lighthouse/cli/index.js"),
    url,
    "--quiet",
    "--output=json",
    "--output-path=stdout",
    `--throttling-method=${LIGHTHOUSE_THROTTLING_METHOD}`,
    "--throttling.rttMs=150",
    "--throttling.throughputKbps=1638.4",
    `--throttling.cpuSlowdownMultiplier=${LIGHTHOUSE_CPU_SLOWDOWN}`,
    "--screenEmulation.mobile=true",
    "--only-categories=performance",
    `--chrome-flags=--headless=new --user-data-dir="${userDataDir}" --profile-directory="${profileDirectory}"`
  ];
}

export function validateChromeProfile(userDataDir, profileDirectory) {
  if (
    typeof userDataDir !== "string" ||
    !isAbsolute(userDataDir) ||
    /[\u0000-\u001f"']|--/.test(userDataDir) ||
    typeof profileDirectory !== "string" ||
    !/^[a-z0-9][a-z0-9 ._-]{0,79}$/i.test(profileDirectory) ||
    profileDirectory.includes("--")
  ) {
    throw new Error("An explicit safe Chrome test profile is required.");
  }
  return { userDataDir, profileDirectory };
}

function metric(lhr, auditId) {
  const value = lhr?.audits?.[auditId]?.numericValue;
  if (!Number.isFinite(value)) throw new Error("Lighthouse result is missing a required metric.");
  return Number(value.toFixed(2));
}

async function runOnce(options) {
  const { stdout } = await execFile(process.execPath, lighthouseArguments(options), {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
    timeout: 120_000,
    windowsHide: true
  });
  const lhr = JSON.parse(stdout);
  return {
    lcpMs: metric(lhr, "largest-contentful-paint"),
    performanceScore: Number(((lhr?.categories?.performance?.score ?? 0) * 100).toFixed(1))
  };
}

export async function runLighthouseChecks({ env = process.env, write = console.error } = {}) {
  try {
    const config = safePerformanceConfig(env);
    const appOrigin = safeAppOrigin(env);
    const userDataDir = requirePerfValue(env, "PERF_CHROME_USER_DATA_DIR");
    const profileDirectory = requirePerfValue(env, "PERF_CHROME_PROFILE_DIRECTORY");
    const results = [];

    for (const route of routeDefinitions(env)) {
      const runs = [];
      for (let run = 0; run < LIGHTHOUSE_RUNS; run += 1) {
        runs.push(await runOnce({
          url: new URL(route.path, appOrigin).toString(),
          userDataDir,
          profileDirectory
        }));
      }
      results.push({ name: route.name, runs });
    }

    const passed = results.every((route) => route.runs.every((run) => run.lcpMs <= LIGHTHOUSE_LCP_LIMIT_MS));
    await writeJsonArtifact("lighthouse.json", {
      schemaVersion: 1,
      runId: config.runId,
      targetRef: config.projectRef,
      measuredAt: new Date().toISOString(),
      runsPerRoute: LIGHTHOUSE_RUNS,
      throttling: {
        method: LIGHTHOUSE_THROTTLING_METHOD,
        rttMs: 150,
        throughputKbps: 1638.4,
        cpuSlowdownMultiplier: LIGHTHOUSE_CPU_SLOWDOWN
      },
      lcpThresholdMs: LIGHTHOUSE_LCP_LIMIT_MS,
      passed,
      results
    });
    if (!passed) {
      write("Lighthouse performance verification failed: LCP exceeded the threshold.");
      return 1;
    }
    write("Lighthouse performance verification passed.");
    return 0;
  } catch {
    write("Lighthouse performance verification failed.");
    return 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runLighthouseChecks().then((exitCode) => {
    process.exitCode = exitCode;
  });
}
