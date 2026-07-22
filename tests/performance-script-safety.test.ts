import { describe, expect, it } from "vitest";

import {
  assertExactCleanupIds,
  assertSafePerformanceTarget,
  chunkRows,
  performanceLabel
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
  MAX_WRITE_BATCH_SIZE
// @ts-expect-error -- performance tools intentionally run as Node ESM scripts.
} from "../scripts/performance/seed-large-dataset.mjs";
import {
  LIGHTHOUSE_CPU_SLOWDOWN,
  LIGHTHOUSE_LCP_LIMIT_MS,
  LIGHTHOUSE_PATHS,
  LIGHTHOUSE_RUNS,
  LIGHTHOUSE_THROTTLING_METHOD,
  lighthouseArguments,
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

  it("labels every generated value and chunks writes at 500 rows", () => {
    expect(performanceLabel("run-001", "event 42")).toBe("[perf:run-001] event 42");
    expect(chunkRows(Array.from({ length: 1001 }, (_, index) => index))).toEqual([
      Array.from({ length: 500 }, (_, index) => index),
      Array.from({ length: 500 }, (_, index) => index + 500),
      [1000]
    ]);
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
});
