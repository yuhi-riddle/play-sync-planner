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

const dateTimeLocalPattern = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;

function isValidDateTimeLocal(value: string) {
  const match = dateTimeLocalPattern.exec(value);
  if (!match) {
    return false;
  }

  const [, year, month, day, hour, minute] = match.map(Number);
  const date = new Date(year, month - 1, day, hour, minute);

  return (
    date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day &&
    date.getHours() === hour &&
    date.getMinutes() === minute
  );
}

function isValidQuarterHourDateTimeLocal(value: string) {
  const match = dateTimeLocalPattern.exec(value);
  return isValidDateTimeLocal(value) && match !== null && Number(match[5]) % 15 === 0;
}

const nullableDateTime = (formatMessage: string, stepMessage: string) =>
  z.preprocess(
    emptyToNull,
    z
      .string()
      .refine(isValidDateTimeLocal, formatMessage)
      .refine(isValidQuarterHourDateTimeLocal, stepMessage)
      .nullable()
  );

export const eventSchema = z.object({
  category: z.preprocess(
    emptyToNull,
    z.enum(EVENT_CATEGORIES, {
      required_error: "カテゴリを選択してください",
      invalid_type_error: "カテゴリを選択してください"
    })
  ),
  title: z.string().trim().min(1, "タイトルを入力してください"),
  url: nullableText.default(null),
  location_name: nullableText.default(null),
  address: nullableText.default(null),
  start_date: nullableDate.default(null),
  end_date: nullableDate.default(null),
  price: nullableInteger.default(null),
  capacity: nullableInteger.default(null),
  status: z.enum(EVENT_STATUSES).default("interested"),
  memo: nullableText.default(null)
});

const newlineList = (message: string) =>
  z.preprocess((value) => {
    if (Array.isArray(value)) {
      return value.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0);
    }

    return String(value ?? "")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
  }, z.array(z.string().min(1)).min(1, message));

const optionalNewlineList = () =>
  z.preprocess((value) => {
    if (Array.isArray(value)) {
      return value.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0);
    }

    return String(value ?? "")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
  }, z.array(z.string().min(1)));

const dateTimeList = (requiredMessage: string, dateTimeMessage: string, stepMessage: string) =>
  newlineList(requiredMessage).pipe(
    z.array(z.string().refine(isValidDateTimeLocal, dateTimeMessage).refine(isValidQuarterHourDateTimeLocal, stepMessage))
  );

export const planSchema = z.object({
  title: nullableText.default(null),
  participantNames: optionalNewlineList().default([]),
  candidateDates: dateTimeList(
    "候補日を1つ以上入力してください",
    "候補日は YYYY-MM-DDTHH:mm 形式で入力してください",
    "候補日時は15分単位で入力してください"
  ),
  answer_deadline_at: nullableDateTime(
    "回答期限は YYYY-MM-DDTHH:mm 形式で入力してください",
    "回答期限は15分単位で入力してください"
  ).default(null),
  memo: nullableText.default(null)
});

export type EventFormValues = z.infer<typeof eventSchema>;
export type PlanFormValues = z.infer<typeof planSchema>;
