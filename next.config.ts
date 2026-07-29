import type { NextConfig } from "next";

// セキュリティヘッダ(CSP含む)はリクエストごとのnonceが要るため middleware.ts で付与する。
const nextConfig: NextConfig = {
  poweredByHeader: false,
  experimental: {
    serverActions: {
      bodySizeLimit: "3mb"
    }
  }
};

export default nextConfig;
