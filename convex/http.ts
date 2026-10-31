import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { auth } from "./auth";
import { createGithubAppFromManifest, exchangeGithubCode } from "./github";
import {
  clearOAuthStateCookie,
  GITHUB_OAUTH_STATE_COOKIE,
  githubInstallUrl,
  oauthStateCookie,
  readCookie,
  settingsLocation,
} from "./lib/github";

const http = httpRouter();

auth.addHttpRoutes(http);

function redirectToSettings(origin: string | null | undefined, status: string) {
  const headers = new Headers({ "Set-Cookie": clearOAuthStateCookie() });
  const location = settingsLocation(origin, status);
  if (!location) {
    return new Response(`GitHub connection ${status}. Open Settings and try again.`, {
      status: 500,
      headers,
    });
  }
  headers.set("Location", location);
  return new Response(null, { status: 302, headers });
}

http.route({
  path: "/github/oauth/start",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    const state = new URL(request.url).searchParams.get("state");
    if (!state) {
      return new Response("Missing GitHub connect state.", { status: 400 });
    }
    const target = await ctx.runQuery(internal.github.connectRedirectInternal, { state });
    if (!target) {
      return new Response("This GitHub connect link expired. Return to Settings and try again.", {
        status: 400,
      });
    }
    return new Response(null, {
      status: 302,
      headers: {
        Location: target.url,
        "Set-Cookie": oauthStateCookie(state),
      },
    });
  }),
});

http.route({
  path: "/github/manifest/callback",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    const url = new URL(request.url);
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    if (!code || !state) {
      return redirectToSettings(null, "missing");
    }
    const pending = await ctx.runMutation(internal.github.consumeOAuthStateInternal, {
      state,
      kind: "manifest",
    });
    if (!pending?.returnOrigin) {
      return redirectToSettings(pending?.returnOrigin, "expired");
    }
    try {
      const created = await createGithubAppFromManifest(code);
      await ctx.runMutation(internal.github.saveGithubAppInternal, {
        workspaceId: pending.workspaceId,
        appId: created.appId,
        slug: created.slug,
        name: created.name,
        clientId: created.clientId,
        clientSecret: created.clientSecret,
        privateKey: created.privateKey,
        ...(created.webhookSecret ? { webhookSecret: created.webhookSecret } : {}),
      });
      const connectState = await ctx.runMutation(internal.github.createOAuthStateInternal, {
        workspaceId: pending.workspaceId,
        userId: pending.userId,
        returnOrigin: pending.returnOrigin,
        kind: "connect",
      });
      return new Response(null, {
        status: 302,
        headers: {
          Location: githubInstallUrl(created.slug, connectState),
          "Set-Cookie": oauthStateCookie(connectState),
        },
      });
    } catch {
      return redirectToSettings(pending.returnOrigin, "error");
    }
  }),
});

http.route({
  path: "/github/oauth/callback",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    const url = new URL(request.url);
    const code = url.searchParams.get("code");
    const error = url.searchParams.get("error");
    const candidates = [url.searchParams.get("state"), readCookie(request.headers.get("cookie"), GITHUB_OAUTH_STATE_COOKIE)]
      .filter((value): value is string => Boolean(value));

    async function takePending() {
      for (const candidate of candidates) {
        const pending = await ctx.runMutation(internal.github.consumeOAuthStateInternal, {
          state: candidate,
          kind: "connect",
        });
        if (pending) return pending;
      }
      return null;
    }

    if (error) {
      const pending = await takePending();
      return redirectToSettings(pending?.returnOrigin, error === "access_denied" ? "denied" : "error");
    }
    if (!code) {
      return redirectToSettings(null, "missing");
    }
    const pending = await takePending();
    if (!pending) {
      return redirectToSettings(null, "expired");
    }
    try {
      const credentials = await ctx.runQuery(internal.github.credentialsInternal, {
        workspaceId: pending.workspaceId,
      });
      if (!credentials) {
        return redirectToSettings(pending.returnOrigin, "error");
      }
      const exchanged = await exchangeGithubCode(code, credentials);
      await ctx.runMutation(internal.github.saveConnectionInternal, {
        workspaceId: pending.workspaceId,
        userId: pending.userId,
        providerUserId: exchanged.providerUserId,
        accessToken: exchanged.accessToken,
        ...(exchanged.refreshToken ? { refreshToken: exchanged.refreshToken } : {}),
        ...(exchanged.expiresAt ? { expiresAt: exchanged.expiresAt } : {}),
        ...(exchanged.login ? { login: exchanged.login } : {}),
      });
      return redirectToSettings(pending.returnOrigin, "connected");
    } catch {
      return redirectToSettings(pending.returnOrigin, "error");
    }
  }),
});

http.route({
  path: "/github/register/callback",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    const code = new URL(request.url).searchParams.get("code");
    if (!code) {
      return new Response("Missing registration code.", { status: 400 });
    }
    const existing = await ctx.runQuery(internal.github.platformRegisteredInternal, {});
    if (existing.registered) {
      return new Response("GitHub app already registered.", { status: 200 });
    }
    try {
      const created = await createGithubAppFromManifest(code);
      const saved = await ctx.runMutation(internal.github.savePlatformAppInternal, {
        appId: created.appId,
        slug: created.slug,
        name: created.name,
        clientId: created.clientId,
        clientSecret: created.clientSecret,
        privateKey: created.privateKey,
        ...(created.webhookSecret ? { webhookSecret: created.webhookSecret } : {}),
      });
      if (!saved) {
        return new Response("GitHub app already registered.", { status: 200 });
      }
      return new Response("GitHub app registered.", { status: 200 });
    } catch {
      return new Response("GitHub app registration failed.", { status: 400 });
    }
  }),
});

http.route({
  path: "/github/setup",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    const url = new URL(request.url);
    const state = url.searchParams.get("state");
    const installationId = Number(url.searchParams.get("installation_id"));
    if (!state || !Number.isInteger(installationId) || installationId <= 0) {
      return redirectToSettings(null, "missing");
    }
    const pending = await ctx.runMutation(internal.github.consumeOAuthStateInternal, {
      state,
      kind: "connect",
    });
    if (!pending) {
      return redirectToSettings(null, "expired");
    }
    const described = await ctx.runAction(internal.githubNode.describeInstallation, {
      installationId,
    });
    await ctx.runMutation(internal.github.saveInstallationInternal, {
      workspaceId: pending.workspaceId,
      installationId,
      accountLogin: described?.accountLogin ?? "GitHub",
      accountType: described?.accountType ?? "User",
    });
    return redirectToSettings(pending.returnOrigin, "connected");
  }),
});

http.route({
  path: "/github/webhook",
  method: "POST",
  handler: httpAction(async () => new Response(null, { status: 200 })),
});

export default http;
