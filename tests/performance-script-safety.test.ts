import { describe, expect, it } from "vitest";

import {
  assertExactCleanupIds,
  assertSafePerformanceTarget,
  canonicalizePerformanceUrl,
  chunkRows,
  performanceLabel,
  safePerformanceConfig
// @ts-expect-error -- performance tools intentionally run as Node ESM scripts.
} from "../scripts/performance/safety.mjs";
import {
  assertResultCap,
  percentile,
  RPC_ITERATIONS,
  RPC_P95_LIMIT_MS
// @ts-expect-error -- performance tools intentionally run as Node ESM scripts.
} from "../scripts/performance/benchmark-rpcs.mjs";
import {
  DATASET_TARGETS,
  MAX_WRITE_BATCH_SIZE,
  performanceNickname
// @ts-expect-error -- performance tools intentionally run as Node ESM scripts.
} from "../scripts/performance/seed-large-dataset.mjs";
import {
  LIGHTHOUSE_CPU_SLOWDOWN,
  LIGHTHOUSE_LCP_LIMIT_MS,
  LIGHTHOUSE_PATHS,
  LIGHTHOUSE_RUNS,
  LIGHTHOUSE_THROTTLING_METHOD,
  lighthouseArguments,
  safeLighthouseTarget,
  validateChromeProfile
// @ts-expect-error -- performance tools intentionally run as Node ESM scripts.
} from "../scripts/performance/run-lighthouse.mjs";

const localEnv = {
  PERF_SUPABASE_URL: "http://127.0.0.1:54321",
  PERF_RUN_ID: "local-check-001"
};

describe("performance target safety", () => {
  it("accepts an explicitly configured local target", () => {
    expect(() => assertSafePerformanceTarget(localEnv)).not.toThrow();
  });

  it.each([
    [{ PERF_RUN_ID: "run-001" }, "PERF_SUPABASE_URL"],
    [{ PERF_SUPABASE_URL: localEnv.PERF_SUPABASE_URL }, "PERF_RUN_ID"],
    [{ ...localEnv, PERF_SUPABASE_URL: "not-a-url" }, "target"],
    [{ ...localEnv, PERF_SUPABASE_URL: "https://example.com" }, "Supabase"],
    [{ ...localEnv, PERF_RUN_ID: "../unsafe" }, "PERF_RUN_ID"]
  ])("rejects unsafe configuration %#", (env, message) => {
    expect(() => assertSafePerformanceTarget(env)).toThrow(message);
  });

  it("rejects reuse of the application's public target", () => {
    expect(() => assertSafePerformanceTarget({
      ...localEnv,
      NEXT_PUBLIC_SUPABASE_URL: localEnv.PERF_SUPABASE_URL
    })).toThrow("public");
  });

  it("requires the exact project ref for a non-local test project", () => {
    const env = {
      PERF_SUPABASE_URL: "https://abcdefghijklmnopqrst.supabase.co",
      PERF_RUN_ID: "preview-001"
    };

    expect(() => assertSafePerformanceTarget(env)).toThrow("PERF_EXPECTED_PROJECT_REF");
    expect(() => assertSafePerformanceTarget({
      ...env,
      PERF_EXPECTED_PROJECT_REF: "zzzzzzzzzzzzzzzzzzzz"
    })).toThrow("project ref");
    expect(() => assertSafePerformanceTarget({
      ...env,
      PERF_EXPECTED_PROJECT_REF: "abcdefghijklmnopqrst"
    })).not.toThrow();
  });

  it("canonicalizes loopback aliases and includes the scheme and port in the local target identity", () => {
    const aliases = ["localhost", "localhost.", "127.0.0.1", "[::1]"];
    const targetRefs = aliases.map((host) => safePerformanceConfig({
      PERF_SUPABASE_URL: `http://${host}:54321`,
      PERF_RUN_ID: "local-check-001"
    }).targetRef);

    expect(new Set(targetRefs)).toEqual(new Set(["local:http:loopback:54321"]));
    expect(safePerformanceConfig({
      PERF_SUPABASE_URL: "http://localhost:54322",
      PERF_RUN_ID: "local-check-001"
    }).targetRef).not.toBe(targetRefs[0]);
    expect(() => assertExactCleanupIds({
      runId: "local-check-001",
      manifestRunId: "local-check-001",
      targetRef: targetRefs[0],
      manifestTargetRef: "local:http:loopback:54322",
      ids: []
    })).toThrow("target");
  });

  it("rejects public Supabase targets despite trailing-dot, loopback-alias, or default-port differences", () => {
    expect(() => assertSafePerformanceTarget({
      PERF_SUPABASE_URL: "https://abcdefghijklmnopqrst.supabase.co:443",
      PERF_EXPECTED_PROJECT_REF: "abcdefghijklmnopqrst",
      PERF_RUN_ID: "preview-001",
      NEXT_PUBLIC_SUPABASE_URL: "https://abcdefghijklmnopqrst.supabase.co."
    })).toThrow("public");
    expect(() => assertSafePerformanceTarget({
      PERF_SUPABASE_URL: "http://127.0.0.1:54321",
      PERF_RUN_ID: "local-check-001",
      NEXT_PUBLIC_SUPABASE_URL: "http://localhost.:54321"
    })).toThrow("public");
  });

  it("uses one strict canonical URL parser", () => {
    expect(canonicalizePerformanceUrl("https://EXAMPLE.com.:443").canonicalOrigin).toBe("https://example.com");
    expect(canonicalizePerformanceUrl("http://localhost:80").canonicalOrigin).toBe("http://loopback");
    expect(() => canonicalizePerformanceUrl("ftp://localhost/file")).toThrow("URL");
    expect(() => canonicalizePerformanceUrl("https://user:pass@example.com")).toThrow("URL");
  });

  it("labels every generated value and chunks writes at 500 rows", () => {
    expect(performanceLabel("run-001", "event 42")).toBe("[perf:run-001] event 42");
    expect(chunkRows(Array.from({ length: 1001 }, (_, index) => index))).toEqual([
      Array.from({ length: 500 }, (_, index) => index),
      Array.from({ length: 500 }, (_, index) => index + 500),
      [1000]
    ]);
  });

  it("keeps the exact run prefix and a deterministic profile nickname within 40 characters", () => {
    const longestRunId = "a".repeat(28);
    const nickname = performanceNickname(longestRunId, 5_000);

    expect(nickname.startsWith(`[perf:${longestRunId}]`)).toBe(true);
    expect(nickname).toHaveLength(40);
    expect(performanceNickname(longestRunId, 5_000)).toBe(nickname);
    expect(() => assertSafePerformanceTarget({
      PERF_SUPABASE_URL: localEnv.PERF_SUPABASE_URL,
      PERF_RUN_ID: "a".repeat(29)
    })).toThrow("PERF_RUN_ID");
  });

  it("allows cleanup only for exact UUIDs recorded by the same run", () => {
    const ids = [
      "00000000-0000-4000-8000-000000000001",
      "00000000-0000-4000-8000-000000000002"
    ];

    expect(assertExactCleanupIds({
      runId: "run-001",
      manifestRunId: "run-001",
      targetRef: "local",
      manifestTargetRef: "local",
      ids
    })).toEqual(ids);
    expect(() => assertExactCleanupIds({ runId: "run-001", manifestRunId: "run-002", ids })).toThrow("run");
    expect(() => assertExactCleanupIds({
      runId: "run-001",
      manifestRunId: "run-001",
      targetRef: "project-a",
      manifestTargetRef: "project-b",
      ids
    })).toThrow("target");
    expect(() => assertExactCleanupIds({ runId: "run-001", manifestRunId: "run-001", ids: ["[perf:run-001]%"] })).toThrow("exact UUID");
  });
});

describe("large-data and measurement contracts", () => {
  it("defines the requested dataset sizes and batch ceiling", () => {
    expect(DATASET_TARGETS).toEqual({
      ownedEvents: 10_000,
      connectionCandidates: 5_000,
      scheduleRows: 10_000,
      messages: 10_000
    });
    expect(MAX_WRITE_BATCH_SIZE).toBe(500);
  });

  it("uses twenty RPC samples, p50/p95, the one-second limit, and hard row caps", () => {
    expect(RPC_ITERATIONS).toBe(20);
    expect(RPC_P95_LIMIT_MS).toBe(1_000);
    expect(percentile(Array.from({ length: 20 }, (_, index) => index + 1), 50)).toBe(10);
    expect(percentile(Array.from({ length: 20 }, (_, index) => index + 1), 95)).toBe(19);
    expect(() => assertResultCap("list", Array(20), 20)).not.toThrow();
    expect(() => assertResultCap("list", Array(21), 20)).toThrow("cap");
    expect(() => assertResultCap("messages", Array(51), 51)).not.toThrow();
    expect(() => assertResultCap("messages", Array(52), 51)).toThrow("cap");
  });

  it("pins three simulated slow-4G Lighthouse runs and a three-second LCP limit", () => {
    expect(LIGHTHOUSE_RUNS).toBe(3);
    expect(LIGHTHOUSE_PATHS).toEqual(["/connections", "/plans", "eventDetail"]);
    expect(LIGHTHOUSE_THROTTLING_METHOD).toBe("simulate");
    expect(LIGHTHOUSE_CPU_SLOWDOWN).toBe(4);
    expect(LIGHTHOUSE_LCP_LIMIT_MS).toBe(3_000);
  });

  it("quotes the explicit Chrome profile and rejects flag injection", () => {
    const args = lighthouseArguments({
      url: "http://localhost:3000/connections",
      userDataDir: "C:\\Perf Profile",
      profileDirectory: "Profile 2"
    });
    expect(args.at(-1)).toContain('--user-data-dir="C:\\Perf Profile"');
    expect(args.at(-1)).toContain('--profile-directory="Profile 2"');
    expect(() => validateChromeProfile("C:\\Perf", "Default --remote-debugging-port=1")).toThrow("profile");
  });

  it("fails remote Lighthouse targets closed and rejects known public URL aliases", () => {
    const remote = {
      PERF_APP_URL: "https://preview.example.com:443",
      PERF_EXPECTED_APP_HOST: "preview.example.com"
    };
    expect(() => safeLighthouseTarget(remote)).toThrow("known");
    expect(() => safeLighthouseTarget({
      ...remote,
      NEXT_PUBLIC_SITE_URL: "https://preview.example.com."
    })).toThrow("public");
    expect(safeLighthouseTarget({
      ...remote,
      PERF_EXPECTED_APP_HOST: "preview.example.com.",
      NEXT_PUBLIC_SITE_URL: "https://www.example.com"
    })).toBe("https://preview.example.com");
    expect(() => safeLighthouseTarget({
      PERF_APP_URL: "https://user:pass@preview.example.com",
      PERF_EXPECTED_APP_HOST: "preview.example.com",
      NEXT_PUBLIC_SITE_URL: "https://www.example.com"
    })).toThrow("URL");
    expect(() => safeLighthouseTarget({
      PERF_APP_URL: "http://127.0.0.1:3000",
      NEXT_PUBLIC_SITE_URL: "http://localhost.:3000"
    })).toThrow("public");
  });
});
