import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "*.supabase.co" },
      { protocol: "https", hostname: "m.media-amazon.com" },
      { protocol: "https", hostname: "cf.shopee.com.br" },
      { protocol: "http", hostname: "http2.mlstatic.com" },
    ],
  },
};

export default nextConfig;
