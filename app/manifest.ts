import type { MetadataRoute } from "next";

import { brand } from "@/lib/brand";

/**
 * ホーム画面に追加できるようにするための manifest。
 * プッシュ通知は含まない（後続Phaseで扱う）。
 *
 * 色は design/rules.md のトークンに合わせている。
 * - background_color: canvas（アプリの下地）
 * - theme_color: pine（強調色）
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: brand.name,
    short_name: brand.shortName,
    description: brand.description,
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    lang: "ja",
    background_color: "#efe7d8",
    theme_color: "#344f43",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" }
    ]
  };
}
