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

const connectionCursorSchema = z.object({
  cursorAt: z.string().datetime({ offset: true }),
  cursorUserId: z.string().uuid()
}).strict();

export type ConnectionCursor = z.infer<typeof connectionCursorSchema>;

export function parseConnectionCursor(value: string | null): ConnectionCursor | null {
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
    return connectionCursorSchema.parse(JSON.parse(decoded));
  } catch {
    throw new Error("Invalid cursor");
  }
}

export function encodeConnectionCursor(cursor: ConnectionCursor): string {
  return Buffer.from(JSON.stringify(connectionCursorSchema.parse(cursor))).toString("base64url");
}
