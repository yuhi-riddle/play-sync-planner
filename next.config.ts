import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: "3mb"
    }
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          // 公開清算リンクのトークンが外部サイトへ漏れないよう、クロスオリジンではoriginのみ送る。
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          // まずReport-Onlyで違反を観測してから強制に切り替える。
          {
            key: "Content-Security-Policy-Report-Only",
            value: "default-src 'self'; img-src 'self' data: https:; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src 'self' https:; frame-ancestors 'none'"
          }
        ]
      }
    ];
  }
};

export default nextConfig;
