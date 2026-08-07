import { describe, expect, it } from "vitest";

import { buildPreviousAnswerMap, canApplyPreviousAnswers } from "@/lib/domain/previous-answers";

describe("buildPreviousAnswerMap", () => {
  it("候補日IDをキーにして戻す", () => {
    const map = buildPreviousAnswerMap([
      { candidate_date_id: "date-1", answer: "yes", comment: "昼からなら" },
      { candidate_date_id: "date-2", answer: "no", comment: null }
    ]);

    expect(map).toEqual({
      "date-1": { answer: "yes", comment: "昼からなら" },
      "date-2": { answer: "no", comment: "" }
    });
  });

  it("未回答は戻さない", () => {
    // 戻すとラジオのどれにも当たらず、送信ボタンが押せない状態を復元してしまう
    const map = buildPreviousAnswerMap([
      { candidate_date_id: "date-1", answer: "unanswered", comment: "" },
      { candidate_date_id: "date-2", answer: "maybe", comment: "" }
    ]);

    expect(map).toEqual({ "date-2": { answer: "maybe", comment: "" } });
  });

  it("知らない値は捨てる", () => {
    const map = buildPreviousAnswerMap([
      { candidate_date_id: "date-1", answer: "perhaps", comment: "" },
      { candidate_date_id: "date-2", answer: null, comment: "" },
      { candidate_date_id: "", answer: "yes", comment: "" }
    ]);

    expect(map).toEqual({});
  });
});

describe("canApplyPreviousAnswers", () => {
  it("何も入っていなければそのまま当てる", () => {
    expect(canApplyPreviousAnswers({ answeredCount: 0, commentCount: 0 })).toBe(true);
  });

  it("回答を選んでいたら当てない", () => {
    expect(canApplyPreviousAnswers({ answeredCount: 1, commentCount: 0 })).toBe(false);
  });

  it("コメントだけでも当てない", () => {
    // 回答より先にコメントを書く人がいる。消したら気づけない
    expect(canApplyPreviousAnswers({ answeredCount: 0, commentCount: 1 })).toBe(false);
  });
});
