import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { errorState, failWith, successState } from "@/lib/domain/action-state";

describe("errorState", () => {
  it("statusをerrorにしてメッセージを持たせる", () => {
    expect(errorState("失敗しました")).toEqual({ status: "error", message: "失敗しました" });
  });

  it("fieldErrorsを添えられる", () => {
    expect(errorState("入力を確認してください", { title: "必須です" })).toEqual({
      status: "error",
      message: "入力を確認してください",
      fieldErrors: { title: "必須です" }
    });
  });
});

describe("successState", () => {
  it("statusをsuccessにする", () => {
    expect(successState("保存しました")).toEqual({ status: "success", message: "保存しました" });
  });

  it("メッセージ無しでも呼べる", () => {
    expect(successState()).toEqual({ status: "success", message: undefined });
  });
});

describe("failWith", () => {
  const originalError = console.error;

  beforeEach(() => {
    console.error = vi.fn();
  });

  afterEach(() => {
    console.error = originalError;
  });

  it("ユーザーには日本語の定型文だけを返す", () => {
    const dbError = new Error("duplicate key value violates unique constraint \"plans_pkey\"");

    const result = failWith("日程を保存できませんでした。", dbError);

    expect(result).toEqual({ status: "error", message: "日程を保存できませんでした。" });
  });

  it("原因はconsole.errorに残す(Supabaseの生エラーを画面に出さないため)", () => {
    const dbError = new Error("duplicate key value violates unique constraint");

    failWith("日程を保存できませんでした。", dbError);

    expect(console.error).toHaveBeenCalledWith("日程を保存できませんでした。", dbError);
  });
});
