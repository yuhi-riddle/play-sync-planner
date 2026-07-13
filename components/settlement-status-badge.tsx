import type { SettlementStatusTone } from "@/lib/domain/settlement";

import { Badge, type BadgeTone } from "@/components/ui";

const toneMap: Record<SettlementStatusTone, BadgeTone> = {
  muted: "neutral",
  warning: "info",
  active: "accent",
  done: "done"
};

export function SettlementStatusBadge({ label, tone }: { label: string; tone: SettlementStatusTone }) {
  return <Badge tone={toneMap[tone]}>{label}</Badge>;
}
