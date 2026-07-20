import { z } from "zod";

export const connectionCategorySchema = z.enum(["favorites", "mutual", "following", "shared", "blocked"]);
export type ConnectionCategory = z.infer<typeof connectionCategorySchema>;

export const calendarMonthSchema = z
  .string()
  .regex(/^\d{4}-(0[1-9]|1[0-2])$/)
  .refine((value) => {
    const [year, month] = value.split("-").map(Number);
    return new Date(Date.UTC(year, month - 1, 1)).getUTCMonth() === month - 1;
  });

export const eventIdSchema = z.string().uuid();

export const eventInviteCandidateQuerySchema = z.string().max(100);

const connectionCursorSchema = z.object({
  cursorAt: z.string().datetime({ offset: true }),
  cursorUserId: z.string().uuid()
}).strict();

export type ConnectionCursor = z.infer<typeof connectionCursorSchema>;

const eventMessageCursorSchema = z.object({
  createdAt: z.string().datetime({ offset: true }),
  id: z.string().uuid()
}).strict();

export type EventMessageCursor = z.infer<typeof eventMessageCursorSchema>;

function parseEncodedCursor<T>(value: string | null, schema: z.ZodType<T>): T | null {
  if (value === null) return null;
  if (value.length === 0 || value.length > 200 || !/^[A-Za-z0-9_-]+$/.test(value)) {
    throw new Error("Invalid cursor");
  }

  let decoded: string;
  try {
    const bytes = Buffer.from(value, "base64url");
    if (bytes.toString("base64url") !== value) throw new Error("Invalid cursor");
    decoded = bytes.toString("utf8");
  } catch {
    throw new Error("Invalid cursor");
  }

  try {
    return schema.parse(JSON.parse(decoded));
  } catch {
    throw new Error("Invalid cursor");
  }
}

export function parseConnectionCursor(value: string | null): ConnectionCursor | null {
  return parseEncodedCursor(value, connectionCursorSchema);
}

export function encodeConnectionCursor(cursor: ConnectionCursor): string {
  return Buffer.from(JSON.stringify(connectionCursorSchema.parse(cursor))).toString("base64url");
}

export function parseEventMessageCursor(value: string | null): EventMessageCursor | null {
  return parseEncodedCursor(value, eventMessageCursorSchema);
}

export function encodeEventMessageCursor(cursor: EventMessageCursor): string {
  return Buffer.from(JSON.stringify(eventMessageCursorSchema.parse(cursor))).toString("base64url");
}
