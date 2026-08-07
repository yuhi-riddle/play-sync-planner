import { describe, expect, it } from "vitest";

import { equalSplitShare, individualSplitTally, isEqualSplit } from "@/lib/domain/expense-split";
import { buildEqualExpenseSplits } from "@/lib/domain/settlement";

describe("equalSplitShare", () => {
  it("割り切れるときは min と max が同じ", () => {
    expect(equalSplitShare(3600, 3)).toEqual({ min: 1200, max: 1200, count: 3 });
  });

  it("端数があるときは1円多い人が出ることを幅で示す", () => {
    // 3601 / 3 -> 1201, 1200, 1200
    expect(equalSplitShare(3601, 3)).toEqual({ min: 1200, max: 1201, count: 3 });
  });

  it("金額と人数は buildEqualExpenseSplits の実際の配り方と一致する", () => {
    const splits = buildEqualExpenseSplits(1000, ["a", "b", "c", "d", "e", "f", "g"]).map((split) => split.amount);
    const share = equalSplitShare(1000, 7);

    expect(share).not.toBeNull();
    expect(Math.min(...splits)).toBe(share?.min);
    expect(Math.max(...splits)).toBe(share?.max);
  });

  it("金額未入力や人数0では表示しない", () => {
    expect(equalSplitShare(Number.NaN, 3)).toBeNull();
    expect(equalSplitShare(0, 3)).toBeNull();
    expect(equalSplitShare(-100, 3)).toBeNull();
    expect(equalSplitShare(3600, 0)).toBeNull();
    expect(equalSplitShare(1200.5, 3)).toBeNull();
  });
});

describe("individualSplitTally", () => {
  it("合計が一致すれば match", () => {
    expect(individualSplitTally(3600, [1200, 1200, 1200])).toEqual({
      entered: 3600,
      total: 3600,
      difference: 0,
      status: "match"
    });
  });

  it("足りないときは short で、差は負の値", () => {
    const tally = individualSplitTally(3600, [1200, 1200, 1100]);

    expect(tally.status).toBe("short");
    expect(tally.difference).toBe(-100);
  });

  it("多すぎるときは over", () => {
    const tally = individualSplitTally(3600, [1300, 1200, 1200]);

    expect(tally.status).toBe("over");
    expect(tally.difference).toBe(100);
  });

  it("空欄（NaN）は0として数える", () => {
    const tally = individualSplitTally(3600, [1200, Number.NaN, 1200]);

    expect(tally.entered).toBe(2400);
    expect(tally.status).toBe("short");
  });

  it("金額が未入力なら合計0との差になる", () => {
    const tally = individualSplitTally(Number.NaN, [1200]);

    expect(tally.total).toBe(0);
    expect(tally.status).toBe("over");
  });
});

describe("isEqualSplit", () => {
  it("均等割りで作った経費を均等割りと判定する", () => {
    expect(isEqualSplit(3600, [1200, 1200, 1200])).toBe(true);
  });

  it("端数が付いていても均等割りと判定する", () => {
    // buildEqualExpenseSplits(3601, 3) -> 1201, 1200, 1200
    expect(isEqualSplit(3601, [1201, 1200, 1200])).toBe(true);
  });

  it("端数が誰に付いていたかは判定を変えない（保存の並びに依存しない）", () => {
    expect(isEqualSplit(3601, [1200, 1200, 1201])).toBe(true);
    expect(isEqualSplit(3601, [1200, 1201, 1200])).toBe(true);
  });

  it("バラバラの金額は均等割りではない", () => {
    expect(isEqualSplit(3600, [2000, 800, 800])).toBe(false);
  });

  it("端数の付け方が違えば均等割りではない", () => {
    // 合計は 3601 で合うが、1円多い人が2人・少ない人が1人という配り方はしない
    expect(isEqualSplit(3601, [1201, 1201, 1199])).toBe(false);
  });

  it("負担者がいなければ判定できないので false", () => {
    expect(isEqualSplit(3600, [])).toBe(false);
  });

  it("金額が数値でない経費は例外にせず false を返す", () => {
    // buildEqualExpenseSplits が投げるのを飲み込んで、個別金額モードで開かせる
    expect(isEqualSplit(Number.NaN, [1200])).toBe(false);
    expect(isEqualSplit(-3600, [-1200, -1200, -1200])).toBe(false);
  });
});
