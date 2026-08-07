import { z } from "zod";
import { jstTimeFromDateTimeLocal } from "@/lib/shared/jst";

import { EVENT_CATEGORIES, EVENT_STATUSES } from "@/lib/shared/constants";

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

const nullableReminderOffset = z.preprocess((value) => {
  const normalized = emptyToNull(value);
  if (normalized === null) {
    return null;
  }

  return Number(normalized);
}, z.number().int().nonnegative().nullable());

const reminderOffsetList = z.preprocess((value) => {
  const values = Array.isArray(value) ? value : value === undefined ? [] : [value];
  return values
    .map((entry) => emptyToNull(entry))
    .filter((entry): entry is string => entry !== null)
    .map((entry) => Number(entry));
}, z.array(z.number().int().positive("リマインドは1分以上で入力してください")).max(5, "リマインドは5件までにしてください"));

const nullableDate = z.preprocess(emptyToNull, z.string().nullable());

const nullableUrl = z.preprocess(
  emptyToNull,
  z
    .string()
    .url("URLは https://... の形式で入力してください")
    .refine((value) => /^https?:\/\//i.test(value), "URLは https://... の形式で入力してください")
    .nullable()
);

const MAX_YEN_AMOUNT = 100_000_000;

const positiveInteger = (requiredMessage: string, positiveMessage: string) =>
  z.preprocess((value) => {
    const normalized = emptyToNull(value);
    if (normalized === null) {
      return undefined;
    }

    return Number(normalized);
  }, z.number({ required_error: requiredMessage, invalid_type_error: requiredMessage }).int("金額は1円単位で入力してください").positive(positiveMessage).max(MAX_YEN_AMOUNT, "金額は1億円以下で入力してください"));

const optionalStringList = () =>
  z.preprocess((value) => {
    if (Array.isArray(value)) {
      return value.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0);
    }

    const normalized = emptyToNull(value);
    return normalized === null ? [] : [String(normalized)];
  }, z.array(z.string().min(1)));

const optionalPositiveIntegerList = () =>
  z.preprocess((value) => {
    const values = Array.isArray(value) ? value : value === undefined ? [] : [value];
    return values
      .map((entry) => emptyToNull(entry))
      .filter((entry): entry is string => entry !== null)
      .map((entry) => Number(entry));
  }, z.array(z.number().int("金額は1円単位で入力してください").positive("個別金額は1円以上で入力してください")));

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

const checkboxBoolean = () =>
  z.preprocess((value) => value === true || value === "true" || value === "on", z.boolean()).default(false);

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

export const eventDraftSchema = z.object({
  category: z.preprocess(emptyToNull, z.enum(EVENT_CATEGORIES).nullable()).default(null),
  title: nullableText.default(null),
  url: nullableUrl.default(null),
  location_name: nullableText.default(null),
  memo: nullableText.default(null)
});

export const expenseSchema = z
  .object({
    title: z.string().trim().min(1, "支払い内容を入力してください"),
    payer_participant_id: z.string().trim().min(1, "支払った人を選択してください"),
    amount: positiveInteger("金額を入力してください", "金額は1円以上で入力してください"),
    split_mode: z.enum(["equal", "individual"], {
      required_error: "割り方を選択してください",
      invalid_type_error: "割り方を選択してください"
    }),
    split_participant_ids: optionalStringList().default([]),
    individual_participant_ids: optionalStringList().default([]),
    individual_split_amounts: optionalPositiveIntegerList().default([]),
    memo: nullableText.default(null),
    payment_url: nullableUrl.default(null),
    is_important: checkboxBoolean()
  })
  .superRefine((values, context) => {
    if (values.split_mode === "equal") {
      if (values.split_participant_ids.length === 0) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["split_participant_ids"],
          message: "負担者を1人以上選択してください"
        });
      }
      return;
    }

    if (values.individual_participant_ids.length === 0) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["individual_participant_ids"],
        message: "負担者を1人以上選択してください"
      });
    }

    if (values.individual_participant_ids.length !== values.individual_split_amounts.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["individual_split_amounts"],
        message: "個別金額は負担者ごとに入力してください"
      });
      return;
    }

    const splitTotal = values.individual_split_amounts.reduce((total, amount) => total + amount, 0);
    if (splitTotal !== values.amount) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["individual_split_amounts"],
        message: "個別金額の合計を支払い金額と同じにしてください"
      });
    }
  });

export const settlementPaymentSchema = z.object({
  amount: positiveInteger("支払い金額を入力してください", "支払い金額は1円以上で入力してください"),
  payment_url: nullableUrl.default(null),
  memo: nullableText.default(null)
});

export const settlementPaymentInstructionSchema = z.object({
  payment_url: nullableUrl.default(null),
  memo: nullableText.default(null)
});

export const participantSettlementPaymentMethodSchema = z.object({
  settlement_payment_method: nullableText.default(null)
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
    reminder_offset_minutes: nullableReminderOffset.default(1440),
    reminder_offsets_minutes: reminderOffsetList.default([]),
    memo: nullableText.default(null)
  })
  .superRefine((values, context) => {
    const now = Date.now();
    // 値は datetime-local の生文字列（オフセット無し）なので、new Date() に直接渡すと
    // 実行環境の TZ で解釈される。候補どうしの比較は同じずれ方をするので気づけないが、
    // now との比較だけは絶対時刻との突き合わせなので、Vercel(UTC) では判定が9時間甘くなり
    // 「JST ではもう過ぎている候補」が通ってしまう。JST に直してから比べる。
    const toJstTime = jstTimeFromDateTimeLocal;
    const candidateTimes = values.candidateDates.map(toJstTime);
    const firstCandidateTime = Math.min(...candidateTimes);
    const deadlineTime = toJstTime(values.answer_deadline_at);

    values.candidateDates.forEach((candidateDate, index) => {
      const startTime = toJstTime(candidateDate);
      const endDate = values.candidateEndDates[index];

      if (startTime < now) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["candidateDates", index],
          message: "過去の日時は候補にできません"
        });
      }

      if (endDate && toJstTime(endDate) <= startTime) {
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
export type ExpenseFormValues = z.infer<typeof expenseSchema>;
export type SettlementPaymentFormValues = z.infer<typeof settlementPaymentSchema>;
export type SettlementPaymentInstructionFormValues = z.infer<typeof settlementPaymentInstructionSchema>;
