import type { NextConfig } from "next";

const posthogHost = process.env.NEXT_PUBLIC_POSTHOG_HOST;

function posthogAssetHost(host: string) {
  const url = new URL(host);
  const hostname = url.hostname.replace(".i.posthog.com", "-assets.i.posthog.com");
  return `${url.protocol}//${hostname}`;
}

const nextConfig: NextConfig = {
  skipTrailingSlashRedirect: true,
  async rewrites() {
    if (!posthogHost) return [];
    return [
      {
        source: "/ingest/static/:path*",
        destination: `${posthogAssetHost(posthogHost)}/static/:path*`,
      },
      {
        source: "/ingest/:path*",
        destination: `${posthogHost}/:path*`,
      },
    ];
  },
};

export default nextConfig;
