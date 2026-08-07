import { describe, expect, it } from "vitest";

import { buildPreviousAnswerMap } from "@/lib/domain/plan/previous-answers";

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
