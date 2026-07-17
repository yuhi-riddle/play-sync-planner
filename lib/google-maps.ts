export function buildGoogleMapsDirectionsUrl(destination: string): string | null {
  const normalized = destination.trim();
  if (!normalized) return null;

  const params = new URLSearchParams({
    api: "1",
    destination: normalized,
    dir_action: "navigate"
  });

  return `https://www.google.com/maps/dir/?${params.toString()}`;
}
