import { safeLog } from "@/lib/server/safe-log";

export type TimedOperation =
  | "performance.web_vital.record"
  | "events.list"
  | "calendar.list"
  | "connections.load"
  | "event-detail.load";

const timedOperations = new Set<TimedOperation>([
  "performance.web_vital.record",
  "events.list",
  "calendar.list",
  "connections.load",
  "event-detail.load"
]);

export async function timed<T>(
  operation: TimedOperation,
  fn: () => Promise<T>
): Promise<T> {
  if (!timedOperations.has(operation)) {
    throw new Error("Unsupported timed operation");
  }

  const startedAt = performance.now();

  try {
    return await fn();
  } finally {
    safeLog({
      operation,
      durationMs: Math.max(0, Math.round(performance.now() - startedAt))
    });
  }
}
