export type SafeLogEntry = {
  operation: string;
  code: string;
  status: number;
  durationMs: number;
};

export function safeLog({
  operation,
  code,
  status,
  durationMs
}: SafeLogEntry): void {
  console.info(JSON.stringify({
    operation,
    code,
    status,
    durationMs
  }));
}
