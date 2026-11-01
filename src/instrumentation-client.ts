import posthog from "posthog-js";

const token = process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN;
const host = process.env.NEXT_PUBLIC_POSTHOG_HOST;

if (token && host) {
  posthog.init(token, {
    api_host: "/ingest",
    ui_host: host.includes("eu.i.posthog.com") ? "https://eu.posthog.com" : "https://us.posthog.com",
    defaults: "2026-08-30",
    capture_exceptions: true,
  });
}
