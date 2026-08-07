import { buildEqualExpenseSplits } from "./settlement";

/**
 * 立替の割り方を、入力中の画面に出すための計算。
 *
 * 保存の可否は lib/validators.ts の expenseSchema が決める。ここはその判断を
 * 「送信する前に見える形」にするだけで、条件を別に持たない。
 * 端数の配り方も buildEqualExpenseSplits を組み直して使い、実装を二重に持たない。
 */

/** 均等割りの1人あたり。端数があると1円だけ多い人が出るので、幅で返す。 */
export type EqualSplitShare = {
  /** 端数が付かない人の負担額 */
  min: number;
  /** 端数が付く人の負担額。端数が無ければ min と同じ */
  max: number;
  count: number;
};

export function equalSplitShare(amount: number, count: number): EqualSplitShare | null {
  if (!Number.isInteger(amount) || amount <= 0 || !Number.isInteger(count) || count <= 0) {
    return null;
  }

  const base = Math.floor(amount / count);
  const remainder = amount % count;

  return { min: base, max: remainder > 0 ? base + 1 : base, count };
}

export type SplitTallyStatus = "match" | "short" | "over";

export type SplitTally = {
  /** 個別金額欄に入っている合計 */
  entered: number;
  /** 支払い金額 */
  total: number;
  /** entered - total。負なら足りない */
  difference: number;
  status: SplitTallyStatus;
};

/**
 * 個別金額の合計と支払い金額の差。
 *
 * expenseSchema は合計が一致しないと弾く（「個別金額の合計を支払い金額と同じに
 * してください」）。送信して初めて気づくのを避けるため、同じ差を入力中に出す。
 * 空欄や数値でない入力は 0 として数える。押す前に「あといくら」を見せるのが目的で、
 * 未入力を厳密に区別する必要はない。
 */
export function individualSplitTally(amount: number, enteredAmounts: number[]): SplitTally {
  const entered = enteredAmounts.reduce((sum, value) => sum + (Number.isFinite(value) ? value : 0), 0);
  const total = Number.isFinite(amount) ? amount : 0;
  const difference = entered - total;

  return {
    entered,
    total,
    difference,
    status: difference === 0 ? "match" : difference < 0 ? "short" : "over"
  };
}

/**
 * 保存済みの経費が均等割りで作られたかを判定する。
 *
 * expense_splits には結果の金額しか残らず、どちらのモードで入力したかは持っていない。
 * そこで同じ金額・同じ人数で組み直し、一致するかで見る。
 *
 * 個別金額で均等と同じ額を打った経費も均等割りと判定されるが、それでよい。
 * 出来上がる負担額は同じで、編集画面としては均等割りのほうが手数が少ない。
 */
export function isEqualSplit(amount: number, splitAmounts: number[]): boolean {
  if (splitAmounts.length === 0) {
    return false;
  }

  let expected: number[];
  try {
    expected = buildEqualExpenseSplits(
      amount,
      splitAmounts.map((_, index) => String(index))
    ).map((split) => split.amount);
  } catch {
    // 金額が壊れている経費は判定できない。個別金額モードで開いて中身を見せる。
    return false;
  }

  // 保存されている行の並びは submit 時の並びと一致するとは限らない。
  // 端数の1円が誰に付いたかは「均等割りかどうか」を変えないので、金額の集合として比べる。
  const descending = (values: number[]) => [...values].sort((a, b) => b - a);
  const actual = descending(splitAmounts);

  return descending(expected).every((value, index) => value === actual[index]);
}
