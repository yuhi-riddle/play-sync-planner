import { createHmac } from "node:crypto";

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { recordWebVital } from "@/lib/server/admin/cron-notifications";
import { timed } from "@/lib/server/timing";

const MAX_BODY_BYTES = 1024;
const MIN_HMAC_SECRET_BYTES = 32;

const pageSchema = z.enum([
  "home",
  "events",
  "event-detail",
  "calendar",
  "connections",
  "other"
]);
const deviceSchema = z.enum(["mobile", "desktop"]);
const webVitalSchema = z.discriminatedUnion("name", [
  z.object({
    page: pageSchema,
    name: z.literal("LCP"),
    value: z.number().finite().min(0).max(120_000),
    device: deviceSchema
  }).strict(),
  z.object({
    page: pageSchema,
    name: z.literal("INP"),
    value: z.number().finite().min(0).max(120_000),
    device: deviceSchema
  }).strict(),
  z.object({
    page: pageSchema,
    name: z.literal("CLS"),
    value: z.number().finite().min(0).max(10),
    device: deviceSchema
  }).strict()
]);

class BodyTooLargeError extends Error {}

async function readLimitedBody(request: NextRequest): Promise<string> {
  const declaredLength = request.headers.get("content-length");
  if (declaredLength !== null) {
    const parsedLength = Number(declaredLength);
    if (!Number.isSafeInteger(parsedLength) || parsedLength < 0) {
      throw new BodyTooLargeError();
    }
    if (parsedLength > MAX_BODY_BYTES) throw new BodyTooLargeError();
  }

  if (!request.body) return "";
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let byteLength = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    byteLength += value.byteLength;
    if (byteLength > MAX_BODY_BYTES) {
      await reader.cancel();
      throw new BodyTooLargeError();
    }
    chunks.push(value);
  }

  const bytes = new Uint8Array(byteLength);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
}

function anonymousSubject(request: NextRequest): string {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",", 1)[0]?.trim();
  return (request.headers.get("x-real-ip")?.trim() || forwarded || "unknown").slice(0, 256);
}

function subjectHash(request: NextRequest): string | null {
  const secret = process.env.RATE_LIMIT_HMAC_SECRET;
  if (!secret || Buffer.byteLength(secret, "utf8") < MIN_HMAC_SECRET_BYTES) {
    return null;
  }
  return createHmac("sha256", secret)
    .update(`web_vital:${anonymousSubject(request)}`)
    .digest("hex");
}

export async function POST(request: NextRequest) {
  let text: string;
  try {
    text = await readLimitedBody(request);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof BodyTooLargeError ? "Payload too large" : "Invalid request" },
      { status: error instanceof BodyTooLargeError ? 413 : 400 }
    );
  }

  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const parsed = webVitalSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const hash = subjectHash(request);
  if (!hash) {
    return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
  }

  try {
    const retryAfter = await timed(
      "performance.web_vital.record",
      () => recordWebVital(parsed.data, hash)
    );
    if (retryAfter > 0) {
      return new NextResponse(null, {
        status: 429,
        headers: { "Retry-After": String(Math.min(60, Math.max(1, retryAfter))) }
      });
    }
    return new NextResponse(null, { status: 204 });
  } catch {
    return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
  }
}
