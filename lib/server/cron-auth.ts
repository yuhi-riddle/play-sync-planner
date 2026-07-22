import type { NextRequest } from "next/server";

export function isAuthorizedCron(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  return Boolean(secret)
    && request.headers.get("authorization") === `Bearer ${secret}`;
}
