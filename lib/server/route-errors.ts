import { NextResponse } from "next/server";
import { ZodError } from "zod";

import {
  RateLimitConfigurationError,
  RateLimitError
} from "@/lib/server/rate-limit";
import { RequestGuardError } from "@/lib/server/request-guards";

const privateHeaders = {
  "Cache-Control": "private, no-store"
};

export class RouteError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "RouteError";
    this.status = status;
    this.code = code;
  }
}

function jsonError(
  status: number,
  error: string,
  code: string,
  headers?: Record<string, string>
) {
  return NextResponse.json(
    { error, code },
    {
      status,
      headers: {
        ...privateHeaders,
        ...headers
      }
    }
  );
}

export function toRouteError(error: unknown): NextResponse {
  if (error instanceof RateLimitError) {
    return jsonError(
      429,
      error.message,
      "rate_limited",
      { "Retry-After": String(error.retryAfterSeconds) }
    );
  }

  if (error instanceof RequestGuardError || error instanceof RouteError) {
    return jsonError(error.status, error.message, error.code);
  }

  if (error instanceof ZodError) {
    return jsonError(
      400,
      "リクエストの入力内容を確認してください。",
      "invalid_request"
    );
  }

  if (error instanceof RateLimitConfigurationError) {
    return jsonError(
      503,
      "現在リクエストを処理できません。時間をおいて再試行してください。",
      error.code
    );
  }

  return jsonError(
    500,
    "処理中に問題が発生しました。時間をおいて再試行してください。",
    "internal_error"
  );
}
