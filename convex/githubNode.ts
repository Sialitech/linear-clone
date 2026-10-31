"use node";

import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalAction } from "./_generated/server";
import { signGithubAppJwt } from "./lib/githubJwt";

const githubHeaders = {
  Accept: "application/vnd.github+json",
  "User-Agent": "linear-clone",
  "X-GitHub-Api-Version": "2022-11-28",
};

async function installationToken(appId: string, privateKey: string, installationId: number) {
  const jwt = signGithubAppJwt(appId, privateKey);
  const response = await fetch(
    `https://api.github.com/app/installations/${installationId}/access_tokens`,
    {
      method: "POST",
      headers: { ...githubHeaders, Authorization: `Bearer ${jwt}` },
    },
  );
  if (!response.ok) return null;
  const body = (await response.json()) as { token?: string };
  return typeof body.token === "string" && body.token.length > 0 ? body.token : null;
}

export const describeInstallation = internalAction({
  args: { installationId: v.number() },
  handler: async (ctx, args) => {
    const platform = await ctx.runQuery(internal.github.platformCredentialsInternal, {});
    if (!platform) return null;
    const jwt = signGithubAppJwt(platform.appId, platform.privateKey);
    const response = await fetch(`https://api.github.com/app/installations/${args.installationId}`, {
      headers: { ...githubHeaders, Authorization: `Bearer ${jwt}` },
    });
    if (!response.ok) return null;
    const body = (await response.json()) as {
      account?: { login?: string; type?: string };
    };
    const login = body.account?.login;
    if (!login) return null;
    return {
      accountLogin: login,
      accountType: body.account?.type === "Organization" ? "Organization" : "User",
    };
  },
});

export const fetchInstalledPullRequest = internalAction({
  args: {
    workspaceId: v.id("workspaces"),
    owner: v.string(),
    repo: v.string(),
    number: v.number(),
  },
  handler: async (ctx, args) => {
    const target = await ctx.runQuery(internal.github.installTargetsInternal, {
      workspaceId: args.workspaceId,
      owner: args.owner,
    });
    if (!target) return null;
    for (const installationId of target.installationIds) {
      const token = await installationToken(target.appId, target.privateKey, installationId);
      if (!token) continue;
      const response = await fetch(
        `https://api.github.com/repos/${args.owner}/${args.repo}/pulls/${args.number}`,
        { headers: { ...githubHeaders, Authorization: `Bearer ${token}` } },
      );
      if (response.status === 404 || response.status === 403) continue;
      if (!response.ok) return { found: false as const };
      const body = (await response.json()) as {
        title?: string;
        state?: string;
        merged?: boolean;
      };
      const state = body.merged === true ? "merged" : body.state === "closed" ? "closed" : "open";
      return {
        found: true as const,
        title: typeof body.title === "string" ? body.title : undefined,
        state: state as "open" | "closed" | "merged",
      };
    }
    return null;
  },
});

export const deleteInstallations = internalAction({
  args: { workspaceId: v.id("workspaces") },
  handler: async (ctx, args) => {
    const target = await ctx.runQuery(internal.github.installTargetsInternal, {
      workspaceId: args.workspaceId,
      owner: "",
    });
    if (!target) return null;
    const jwt = signGithubAppJwt(target.appId, target.privateKey);
    for (const installationId of target.installationIds) {
      await fetch(`https://api.github.com/app/installations/${installationId}`, {
        method: "DELETE",
        headers: { ...githubHeaders, Authorization: `Bearer ${jwt}` },
      });
    }
    return null;
  },
});
