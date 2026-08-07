import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { deviceClasses, pageTemplates } from "@/lib/domain/shared/web-vitals";

const MAX_BODY_BYTES = 1024;

const pageSchema = z.enum(pageTemplates);
const deviceSchema = z.enum(deviceClasses);
const webVitalSchema = z.discriminatedUnion("name", [
  z
    .object({
      page: pageSchema,
      name: z.literal("LCP"),
      value: z.number().finite().min(0).max(120_000),
      device: deviceSchema
    })
    .strict(),
  z
    .object({
      page: pageSchema,
      name: z.literal("INP"),
      value: z.number().finite().min(0).max(120_000),
      device: deviceSchema
    })
    .strict(),
  z
    .object({
      page: pageSchema,
      name: z.literal("CLS"),
      value: z.number().finite().min(0).max(10),
      device: deviceSchema
    })
    .strict()
]);

class BodyTooLargeError extends Error {}

async function readLimitedBody(request: NextRequest): Promise<string> {
  const declaredLength = request.headers.get("content-length");
  if (declaredLength !== null) {
    const parsedLength = Number(declaredLength);
    if (!Number.isSafeInteger(parsedLength) || parsedLength < 0 || parsedLength > MAX_BODY_BYTES) {
      throw new BodyTooLargeError();
    }
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

/**
 * まずは計測値を可視化するだけの最小構成。
 * 保存・レート制限付きの本格的な取り込みは、DBスキーマを伴う別途の作業として扱う。
 */
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

  console.info("[web-vitals]", parsed.data);
  return new NextResponse(null, { status: 204 });
}
