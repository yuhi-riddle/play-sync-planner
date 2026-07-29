/**
 * CLS (Cumulative Layout Shift) のセッションウィンドウ計算。
 *
 * 標準アルゴリズム:
 * - hadRecentInput: true のサンプルは除外する
 * - 直前のサンプルから 1000ms 以内、かつセッション先頭から 5000ms 以内なら
 *   同一セッションとして値を合計する。どちらかを超えたら新しいセッションを開始する
 * - 全セッションのうち合計値が最大のものを返す
 */
export type LayoutShiftSample = {
  value: number;
  startTime: number;
  hadRecentInput: boolean;
};

const SESSION_GAP_MS = 1000;
const SESSION_WINDOW_MS = 5000;

export function maxSessionWindowValue(samples: LayoutShiftSample[]): number {
  const relevant = samples.filter((sample) => !sample.hadRecentInput);
  if (relevant.length === 0) return 0;

  let maxSessionValue = 0;
  let currentSessionValue = 0;
  let sessionStartTime: number | null = null;
  let lastSampleTime: number | null = null;

  for (const sample of relevant) {
    const startsNewSession =
      sessionStartTime === null ||
      sample.startTime - (lastSampleTime as number) > SESSION_GAP_MS ||
      sample.startTime - sessionStartTime > SESSION_WINDOW_MS;

    if (startsNewSession) {
      sessionStartTime = sample.startTime;
      currentSessionValue = 0;
    }

    currentSessionValue += sample.value;
    lastSampleTime = sample.startTime;
    maxSessionValue = Math.max(maxSessionValue, currentSessionValue);
  }

  return maxSessionValue;
}
