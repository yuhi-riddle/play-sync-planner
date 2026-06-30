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

const requiredDateTime = (requiredMessage: string, formatMessage: string) =>
  z.preprocess(
    emptyToNull,
    z
      .string({
        required_error: requiredMessage,
        invalid_type_error: requiredMessage
      })
      .refine(isValidDateTimeLocal, formatMessage)
  );

const optionalDateTimeList = (dateTimeMessage: string) =>
  optionalNewlineList().pipe(z.array(z.string().refine(isValidDateTimeLocal, dateTimeMessage)));

const booleanList = () =>
  z.preprocess((value) => {
    const values = Array.isArray(value) ? value : value === undefined ? [] : [value];
    return values.map((entry) => entry === true || entry === "true" || entry === "on");
  }, z.array(z.boolean()));

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

const dateTimeList = (requiredMessage: string, dateTimeMessage: string) =>
  newlineList(requiredMessage).pipe(
    z.array(z.string().refine(isValidDateTimeLocal, dateTimeMessage))
  );

export const planSchema = z
  .object({
    title: nullableText.default(null),
    participantNames: optionalNewlineList().default([]),
    candidateDates: dateTimeList(
      "候補日時を1つ以上選択してください",
      "候補日時は YYYY-MM-DDTHH:mm 形式で入力してください"
    ),
    candidateEndDates: optionalDateTimeList("終了日時は YYYY-MM-DDTHH:mm 形式で入力してください").default([]),
    candidateAllDays: booleanList().default([]),
    answer_deadline_at: requiredDateTime(
      "回答期限を選択してください",
      "回答期限は YYYY-MM-DDTHH:mm 形式で入力してください"
    ),
    memo: nullableText.default(null)
  })
  .superRefine((values, context) => {
    const now = Date.now();
    const candidateTimes = values.candidateDates.map((candidateDate) => new Date(candidateDate).getTime());
    const firstCandidateTime = Math.min(...candidateTimes);
    const deadlineTime = new Date(values.answer_deadline_at).getTime();

    values.candidateDates.forEach((candidateDate, index) => {
      const startTime = new Date(candidateDate).getTime();
      const endDate = values.candidateEndDates[index];

      if (startTime < now) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["candidateDates", index],
          message: "過去の日時は候補にできません"
        });
      }

      if (endDate && new Date(endDate).getTime() <= startTime) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["candidateEndDates", index],
          message: "終了時間は開始時間より後にしてください"
        });
      }
    });

    if (deadlineTime >= firstCandidateTime) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["answer_deadline_at"],
        message: "回答期限は最初の候補日時より前にしてください"
      });
    }
  });

export type EventFormValues = z.infer<typeof eventSchema>;
export type PlanFormValues = z.infer<typeof planSchema>;
