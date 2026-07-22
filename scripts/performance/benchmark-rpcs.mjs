import { pathToFileURL } from "node:url";

import { createClient } from "@supabase/supabase-js";

import {
  requirePerfValue,
  safePerformanceConfig,
  writeJsonArtifact
} from "./safety.mjs";

export const RPC_ITERATIONS = 20;
export const RPC_P95_LIMIT_MS = 1_000;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function percentile(values, percent) {
  if (!Array.isArray(values) || values.length === 0 || values.some((value) => !Number.isFinite(value))) {
    throw new Error("Percentile requires finite samples.");
  }
  if (!Number.isFinite(percent) || percent < 0 || percent > 100) {
    throw new Error("Percentile must be between 0 and 100.");
  }
  const sorted = [...values].sort((left, right) => left - right);
  const rank = Math.max(0, Math.ceil((percent / 100) * sorted.length) - 1);
  return sorted[rank];
}

export function assertResultCap(name, rows, maxRows) {
  if (!Array.isArray(rows)) throw new Error(`${name} did not return a row array.`);
  if (rows.length > maxRows) throw new Error(`${name} exceeded its row cap.`);
}

function assertUuid(name, value) {
  if (!UUID_PATTERN.test(value)) throw new Error(`${name} must be an exact UUID.`);
  return value;
}

function unwrapRows(name, response) {
  if (response.error) throw new Error(`${name} request failed.`);
  return response.data ?? [];
}

function benchmarkDefinitions(client, env) {
  const eventId = assertUuid("PERF_EVENT_ID", requirePerfValue(env, "PERF_EVENT_ID"));
  const month = requirePerfValue(env, "PERF_MONTH");
  if (!/^\d{4}-(?:0[1-9]|1[0-2])-01$/.test(month)) {
    throw new Error("PERF_MONTH must be the first day of a month.");
  }

  return [
    {
      name: "list_owned_event_ids",
      maxRows: 20,
      call: async () => {
        const rows = unwrapRows("list_owned_event_ids", await client.rpc("list_owned_event_ids", {
          p_filter: "all",
          p_category: "all",
          p_sort: "latest",
          p_limit: 20,
          p_offset: 0
        }));
        const ids = Array.isArray(rows[0]?.event_ids) ? rows[0].event_ids : [];
        return ids;
      }
    },
    {
      name: "get_connection_counts",
      maxRows: 5,
      call: async () => unwrapRows("get_connection_counts", await client.rpc("get_connection_counts"))
    },
    {
      name: "list_connections",
      maxRows: 20,
      call: async () => unwrapRows("list_connections", await client.rpc("list_connections", {
        p_category: "shared",
        p_cursor_at: null,
        p_cursor_user_id: null,
        p_limit: 20
      }))
    },
    {
      name: "list_received_event_invitations",
      maxRows: 20,
      call: async () => unwrapRows("list_received_event_invitations", await client.rpc("list_received_event_invitations", {
        p_limit: 20
      }))
    },
    {
      name: "list_calendar_items",
      maxRows: 20,
      call: async () => unwrapRows("list_calendar_items", await client.rpc("list_calendar_items", {
        p_month: month
      }))
    },
    {
      name: "list_event_invite_candidates",
      maxRows: 20,
      call: async () => unwrapRows("list_event_invite_candidates", await client.rpc("list_event_invite_candidates", {
        p_event_id: eventId,
        p_query: "",
        p_cursor_at: null,
        p_cursor_user_id: null,
        p_limit: 20
      }))
    },
    {
      name: "event_messages",
      maxRows: 51,
      call: async () => unwrapRows("event_messages", await client
        .from("event_messages")
        .select("id")
        .eq("event_id", eventId)
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .limit(51))
    }
  ];
}

export async function benchmarkOperation(definition, { iterations = RPC_ITERATIONS, now = performance.now.bind(performance) } = {}) {
  const durationsMs = [];
  let maximumRows = 0;
  for (let iteration = 0; iteration < iterations; iteration += 1) {
    const startedAt = now();
    const rows = await definition.call();
    const elapsedMs = now() - startedAt;
    assertResultCap(definition.name, rows, definition.maxRows);
    durationsMs.push(elapsedMs);
    maximumRows = Math.max(maximumRows, rows.length);
  }

  return {
    name: definition.name,
    iterations,
    rowCap: definition.maxRows,
    maximumRows,
    p50Ms: Number(percentile(durationsMs, 50).toFixed(2)),
    p95Ms: Number(percentile(durationsMs, 95).toFixed(2))
  };
}

export async function runRpcBenchmarks({ env = process.env, write = console.error } = {}) {
  let config;
  try {
    config = safePerformanceConfig(env);
    const apiKey = requirePerfValue(env, "PERF_SUPABASE_ANON_KEY");
    const userJwt = requirePerfValue(env, "PERF_TEST_USER_JWT");
    const client = createClient(config.baseUrl, apiKey, {
      auth: { autoRefreshToken: false, detectSessionInUrl: false, persistSession: false },
      global: { headers: { Authorization: `Bearer ${userJwt}` } }
    });

    const results = [];
    for (const definition of benchmarkDefinitions(client, env)) {
      results.push(await benchmarkOperation(definition));
    }
    const passed = results.every((result) => result.p95Ms <= RPC_P95_LIMIT_MS);
    await writeJsonArtifact("rpc-benchmark.json", {
      schemaVersion: 1,
      runId: config.runId,
      targetRef: config.projectRef,
      measuredAt: new Date().toISOString(),
      thresholdMs: RPC_P95_LIMIT_MS,
      passed,
      results
    });
    if (!passed) {
      write("RPC performance verification failed: p95 exceeded the threshold.");
      return 1;
    }
    write("RPC performance verification passed.");
    return 0;
  } catch {
    write("RPC performance verification failed.");
    return 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runRpcBenchmarks().then((exitCode) => {
    process.exitCode = exitCode;
  });
}
