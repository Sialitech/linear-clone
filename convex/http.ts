import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { auth } from "./auth";
import { exchangeGithubCode, oauthRedirectTarget } from "./github";

const http = httpRouter();

auth.addHttpRoutes(http);

http.route({
  path: "/github/oauth/callback",
  method: "GET",
  handler: httpAction(async (ctx, request) => {
    const url = new URL(request.url);
    const code = url.searchParams.get("code");
    const state = url.searchParams.get("state");
    const error = url.searchParams.get("error");
    const base = oauthRedirectTarget();
    const destination =
      base.startsWith("http://") || base.startsWith("https://")
        ? new URL("/settings", base)
        : null;

    function redirectWith(status: string) {
      if (!destination) {
        return new Response(`GitHub OAuth ${status}. Set SITE_URL on the Convex deployment.`, {
          status: 500,
        });
      }
      destination.searchParams.set("github", status);
      return Response.redirect(destination.toString(), 302);
    }

    if (error) {
      return redirectWith("error");
    }
    if (!code || !state) {
      return redirectWith("missing");
    }

    try {
      const pending = await ctx.runMutation(internal.github.consumeOAuthStateInternal, {
        state,
      });
      if (!pending) {
        return redirectWith("expired");
      }
      const exchanged = await exchangeGithubCode(code);
      await ctx.runMutation(internal.github.saveConnectionInternal, {
        workspaceId: pending.workspaceId,
        userId: pending.userId,
        providerUserId: exchanged.providerUserId,
        accessToken: exchanged.accessToken,
      });
      return redirectWith("connected");
    } catch {
      return redirectWith("error");
    }
  }),
});

export default http;
