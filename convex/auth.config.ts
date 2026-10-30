import type { AuthConfig } from "convex/server";

export default {
  providers: [
    {
      domain: process.env.CONVEX_SITE_URL ?? "https://localhost",
      applicationID: "convex",
    },
  ],
} satisfies AuthConfig;
