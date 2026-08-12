type TimeoutHandle = number | ReturnType<typeof setTimeout>;

type SecurityProbeOptions = {
  env?: Record<string, string | undefined>;
  fetchImpl?: (url: string, init: RequestInit) => Promise<Response>;
  write?: (message: string) => void;
  timeoutMs?: number;
  setTimeoutImpl?: (callback: () => void, delay: number) => TimeoutHandle;
  clearTimeoutImpl?: (handle: TimeoutHandle) => void;
};

export function runSecurityProbe(options?: SecurityProbeOptions): Promise<0 | 1>;
