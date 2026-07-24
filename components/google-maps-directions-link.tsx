import { ExternalLink, MapPinned } from "lucide-react";
import { buildGoogleMapsDirectionsUrl } from "@/lib/google-maps";

export function GoogleMapsDirectionsLink({ destination }: { destination: string | null | undefined }) {
  const href = buildGoogleMapsDirectionsUrl(destination ?? "");
  if (!href) return null;

  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="mt-2 inline-flex min-h-11 items-center gap-2 rounded-full border border-moss/35 bg-surface px-4 py-2 text-sm font-bold text-pine hover:bg-mist focus:outline-none focus:ring-2 focus:ring-clay focus:ring-offset-2"
    >
      <MapPinned aria-hidden="true" className="h-4 w-4" />
      現在地からの経路を見る
      <ExternalLink aria-hidden="true" className="h-3.5 w-3.5" />
    </a>
  );
}
