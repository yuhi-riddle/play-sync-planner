import type { SettlementStatusTone } from "@/lib/domain/settlement";

const toneClasses: Record<SettlementStatusTone, string> = {
  muted: "border-ink/10 bg-white/72 text-ink/58",
  warning: "border-honey/36 bg-honey/22 text-ink",
  active: "border-moss/28 bg-mist/45 text-pine",
  done: "border-moss/24 bg-mist/36 text-pine"
};

export function SettlementStatusBadge({ label, tone }: { label: string; tone: SettlementStatusTone }) {
  return (
    <span className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-bold ${toneClasses[tone]}`}>
      {label}
    </span>
  );
}
