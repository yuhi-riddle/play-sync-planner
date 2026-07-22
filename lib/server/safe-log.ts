export type SafeStatusLogEntry = {
  operation: string;
  code: string;
  status: number;
  durationMs: number;
};

export type SafeTimingLogEntry = {
  operation: string;
  durationMs: number;
  code?: never;
  status?: never;
};

export type SafeLogEntry = SafeStatusLogEntry | SafeTimingLogEntry;

export function safeLog(entry: SafeLogEntry): void {
  const payload = "code" in entry && "status" in entry
    ? {
        operation: entry.operation,
        code: entry.code,
        status: entry.status,
        durationMs: entry.durationMs
      }
    : {
        operation: entry.operation,
        durationMs: entry.durationMs
      };
  console.info(JSON.stringify(payload));
}
