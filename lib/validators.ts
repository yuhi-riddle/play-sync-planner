import { z } from "zod";

import { EVENT_CATEGORIES, EVENT_STATUSES } from "@/lib/constants";

const emptyToNull = (value: unknown) => {
  if (typeof value !== "string") {
    return value ?? null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

const nullableText = z.preprocess(emptyToNull, z.string().nullable());

const nullableInteger = z.preprocess((value) => {
  const normalized = emptyToNull(value);
  if (normalized === null) {
    return null;
  }

  return Number(normalized);
}, z.number().int().nonnegative().nullable());

const nullableDate = z.preprocess(emptyToNull, z.string().nullable());

const nullableDateTime = z.preprocess(emptyToNull, z.string().nullable());

export const eventSchema = z.object({
  category: z.enum(EVENT_CATEGORIES),
  title: z.string().trim().min(1, "タイトルを入力してください"),
  url: nullableText.default(null),
  location_name: nullableText.default(null),
  address: nullableText.default(null),
  start_date: nullableDate.default(null),
  end_date: nullableDate.default(null),
  price: nullableInteger.default(null),
  capacity: nullableInteger.default(null),
  status: z.enum(EVENT_STATUSES),
  memo: nullableText.default(null)
});

const newlineList = (message: string) =>
  z.preprocess((value) => {
    if (Array.isArray(value)) {
      return value;
    }

    return String(value ?? "")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
  }, z.array(z.string().min(1)).min(1, message));

export const planSchema = z.object({
  title: nullableText.default(null),
  participantNames: newlineList("参加者を1人以上入力してください"),
  candidateDates: newlineList("候補日を1つ以上入力してください"),
  answer_deadline_at: nullableDateTime.default(null),
  memo: nullableText.default(null)
});

export type EventFormValues = z.infer<typeof eventSchema>;
export type PlanFormValues = z.infer<typeof planSchema>;
