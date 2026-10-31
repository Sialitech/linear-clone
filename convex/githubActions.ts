import { getAuthUserId } from "@convex-dev/auth/server";
import { z } from "zod";
import { internal } from "./_generated/api";
import { pullRequestIdSchema, zAction } from "./lib/functions";
import {
  isGitHubOAuthConfigured,
  requireGitHubOAuthEnv,
} from "./lib/github";

function siteUrl() {
  const url = process.env.SITE_URL?.replace(/\/$/, "");
  if (!url) {
    throw new Error("SITE_URL is not set on the Convex deployment");
  }
  return url;
}

function oauthRedirectUri() {
  return `${siteUrl()}/settings`;
}

export const getAuthorizeUrl = zAction({
  args: { state: z.string().trim().min(8).max(200) },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("Not authenticated");
    }
    if (!isGitHubOAuthConfigured()) {
      throw new Error("GitHub OAuth is not configured");
    }
    const { clientId } = requireGitHubOAuthEnv();
    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: oauthRedirectUri(),
      scope: "read:user repo",
      state: args.state,
      allow_signup: "false",
    });
    return {
      url: `https://github.com/login/oauth/authorize?${params.toString()}`,
      redirectUri: oauthRedirectUri(),
    };
  },
});

export const completeOAuth = zAction({
  args: { code: z.string().trim().min(1).max(200) },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("Not authenticated");
    }
    if (!isGitHubOAuthConfigured()) {
      throw new Error("GitHub OAuth is not configured");
    }
    const { clientId, clientSecret } = requireGitHubOAuthEnv();

    const tokenRes = await fetch("https://github.com/login/oauth/access_token", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        code: args.code,
        redirect_uri: oauthRedirectUri(),
      }),
    });
    if (!tokenRes.ok) {
      throw new Error("GitHub token exchange failed");
    }
    const tokenJson = (await tokenRes.json()) as {
      access_token?: string;
      error?: string;
      error_description?: string;
    };
    if (!tokenJson.access_token) {
      throw new Error(
        tokenJson.error_description ||
          tokenJson.error ||
          "GitHub did not return an access token",
      );
    }

    let githubLogin: string | undefined;
    let githubUserId: string | undefined;
    const userRes = await fetch("https://api.github.com/user", {
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${tokenJson.access_token}`,
        "User-Agent": "linear-clone",
        "X-GitHub-Api-Version": "2022-11-28",
      },
    });
    if (userRes.ok) {
      const profile = (await userRes.json()) as { login?: string; id?: number };
      githubLogin = profile.login;
      githubUserId = profile.id !== undefined ? String(profile.id) : undefined;
    }

    await ctx.runMutation(internal.githubInternal.upsertConnection, {
      userId,
      accessToken: tokenJson.access_token,
      githubLogin,
      githubUserId,
    });

    return {
      connected: true,
      login: githubLogin ?? null,
    };
  },
});

export const refreshPullRequest = zAction({
  args: { pullRequestId: pullRequestIdSchema },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      throw new Error("Not authenticated");
    }
    const row = await ctx.runQuery(internal.githubInternal.getPullRequest, {
      pullRequestId: args.pullRequestId,
    });
    if (!row) {
      throw new Error("Pull request link not found");
    }
    const connection = await ctx.runQuery(internal.githubInternal.getConnectionToken, {
      userId,
    });
    if (!connection?.accessToken) {
      return { refreshed: false as const, reason: "not_connected" as const };
    }

    const res = await fetch(
      `https://api.github.com/repos/${row.owner}/${row.repo}/pulls/${row.number}`,
      {
        headers: {
          Accept: "application/vnd.github+json",
          Authorization: `Bearer ${connection.accessToken}`,
          "User-Agent": "linear-clone",
          "X-GitHub-Api-Version": "2022-11-28",
        },
      },
    );
    if (!res.ok) {
      return { refreshed: false as const, reason: "github_error" as const };
    }
    const pr = (await res.json()) as {
      title?: string;
      state?: string;
      merged_at?: string | null;
    };
    const state =
      pr.merged_at ? "merged" : pr.state === "closed" ? "closed" : pr.state === "open" ? "open" : pr.state;
    await ctx.runMutation(internal.githubInternal.patchPullRequestMeta, {
      pullRequestId: args.pullRequestId,
      title: pr.title,
      state,
    });
    return { refreshed: true as const, title: pr.title ?? null, state: state ?? null };
  },
});
