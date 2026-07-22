import { safeLog } from "@/lib/server/safe-log";

export type TimedOperation = "performance.web_vital.record";

const timedOperations = new Set<TimedOperation>([
  "performance.web_vital.record"
]);

export async function timed<T>(
  operation: TimedOperation,
  fn: () => Promise<T>
): Promise<T> {
  if (!timedOperations.has(operation)) {
    throw new Error("Unsupported timed operation");
  }

  const startedAt = performance.now();
  let code = "completed";
  let status = 200;

  try {
    return await fn();
  } catch (error) {
    code = "failed";
    status = 500;
    throw error;
  } finally {
    safeLog({
      operation,
      code,
      status,
      durationMs: Math.max(0, Math.round(performance.now() - startedAt))
    });
  }
}
