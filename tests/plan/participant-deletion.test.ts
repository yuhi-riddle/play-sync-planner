import { describe, expect, it } from "vitest";

import { participantDeletionRefusal } from "@/lib/domain/plan/participant-deletion";

const noLinks = { paidExpenseTitles: [], splitExpenseTitles: [] };

describe("participantDeletionRefusal", () => {
  it("お金が絡んでいなければ消せる", () => {
    expect(participantDeletionRefusal("たろう", noLinks)).toBeNull();
  });

  it("立て替えた記録があれば消せない", () => {
    const message = participantDeletionRefusal("たろう", {
      paidExpenseTitles: ["レンタカー"],
      splitExpenseTitles: []
    });

    expect(message).toContain("たろう");
    expect(message).toContain("レンタカー");
    expect(message).toContain("立て替えた記録");
  });

  it("負担者に入っていれば消せない", () => {
    // expense_splits は削除連鎖するので、消すと立替の金額と負担額の合計がズレる
    const message = participantDeletionRefusal("たろう", {
      paidExpenseTitles: [],
      splitExpenseTitles: ["宿代"]
    });

    expect(message).toContain("宿代");
    expect(message).toContain("負担者");
  });

  it("立替者と負担者の両方なら、立替者のほうを理由にする", () => {
    // 立替者は RESTRICT で DB からも弾かれる。先に直すべきはこちら
    const message = participantDeletionRefusal("たろう", {
      paidExpenseTitles: ["レンタカー"],
      splitExpenseTitles: ["宿代"]
    });

    expect(message).toContain("レンタカー");
    expect(message).not.toContain("宿代");
  });

  it("立替が多いときは3件まで並べて、残りは件数にする", () => {
    const message = participantDeletionRefusal("たろう", {
      paidExpenseTitles: ["A", "B", "C", "D", "E"],
      splitExpenseTitles: []
    });

    expect(message).toContain("「A」、「B」、「C」");
    expect(message).toContain("ほか2件");
    expect(message).not.toContain("「D」");
  });

  it("ちょうど3件なら「ほか」を出さない", () => {
    const message = participantDeletionRefusal("たろう", {
      paidExpenseTitles: ["A", "B", "C"],
      splitExpenseTitles: []
    });

    expect(message).toContain("「C」");
    expect(message).not.toContain("ほか");
  });
});
