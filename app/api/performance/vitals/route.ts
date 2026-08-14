import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { deviceClasses, pageTemplates } from "@/lib/domain/shared/web-vitals";
import { createSupabaseAdminClient, hasSupabaseAdminEnv } from "@/lib/supabase/server";

const MAX_BODY_BYTES = 1024;

const pageSchema = z.enum(pageTemplates);
const deviceSchema = z.enum(deviceClasses);
const rpcResultSchema = z.object({
  accepted: z.boolean(),
  retry_after_seconds: z.number().int().nonnegative().optional()
});
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
 * Supabase管理用envが無い環境（ローカル開発など）では console.info のみで保存しない。
 * ある場合は record_web_vital RPC 経由で private.web_vital_samples に保存する
 * （レート制限はDB関数側で行う。supabase/migrations/033_web_vital_samples.sql 参照）。
 */
function clientIp(request: NextRequest): string | null {
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (!forwardedFor) return null;
  const [first] = forwardedFor.split(",");
  const trimmed = first?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : null;
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

  const metric = parsed.data;

  if (!hasSupabaseAdminEnv()) {
    console.info("[web-vitals]", metric);
    return new NextResponse(null, { status: 204 });
  }

  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase.rpc("record_web_vital", {
    p_page_template: metric.page,
    p_metric_name: metric.name,
    p_metric_value: metric.value,
    p_device_class: metric.device,
    p_client_ip: clientIp(request)
  });

  if (error) {
    console.error("[web-vitals] failed to record", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }

  const result = rpcResultSchema.safeParse(data);
  if (!result.success) {
    console.error("[web-vitals] unexpected rpc response", data);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }

  if (!result.data.accepted) {
    const retryAfter = result.data.retry_after_seconds ?? 60;
    return NextResponse.json(
      { error: "Too Many Requests" },
      { status: 429, headers: { "Retry-After": String(retryAfter) } }
    );
  }

  return new NextResponse(null, { status: 204 });
}
