/** 山＋太陽のロゴマーク。写実的な質感の作り込みは別タスク。トークンの CSS 変数を直接参照する。 */
export function Logo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 26 26" fill="none" aria-hidden="true" className={className}>
      <circle cx="18.5" cy="6.5" r="4.2" fill="var(--madoi-honey)" />
      <path d="M1 20.5 8.5 8l4.6 6.8 2.6-3.4L25 20.5H1z" fill="var(--madoi-pine-deep)" />
      <path d="M1 20.5 8.5 8l4.6 6.8-3.2 5.7H1z" fill="var(--madoi-pine)" />
    </svg>
  );
}
