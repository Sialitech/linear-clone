"use client";

import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import UserAvatar from "@/components/user-avatar";
import { useWorkspace } from "@/components/workspace-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { errorMessage } from "@/lib/format";
import { useAction, useMutation, useQuery } from "convex/react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";

const profileSchema = z.object({ name: z.string().trim().min(1, "Enter a name").max(80) });
const memberSchema = z.object({
  email: z.string().trim().email("Enter a valid email"),
  role: z.enum(["admin", "member"]),
});
const repoSchema = z
  .string()
  .trim()
  .regex(/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/, "Repository must look like owner/name");

const OAUTH_STATE_KEY = "linear-clone:github-oauth-state";

export default function SettingsScreen() {
  const { workspace, me } = useWorkspace();
  const members = useQuery(api.users.listMembers, workspace ? { workspaceId: workspace._id } : "skip");
  const projectRepos = useQuery(
    api.github.listProjectRepos,
    workspace ? { workspaceId: workspace._id } : "skip",
  );
  const oauthStatus = useQuery(api.github.oauthStatus, {});
  const updateProfile = useMutation(api.users.updateProfile);
  const addMember = useMutation(api.users.addMember);
  const saveProjectRepo = useMutation(api.github.saveProjectRepo);
  const clearProjectRepo = useMutation(api.github.clearProjectRepo);
  const disconnectGithub = useMutation(api.github.disconnectGithub);
  const getAuthorizeUrl = useAction(api.githubActions.getAuthorizeUrl);
  const completeOAuth = useAction(api.githubActions.completeOAuth);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"admin" | "member">("member");
  const [repoDrafts, setRepoDrafts] = useState<Record<string, string>>({});
  const oauthHandled = useRef(false);

  useEffect(() => {
    if (me?.name) setName(me.name);
  }, [me?.name]);

  useEffect(() => {
    if (!projectRepos) return;
    setRepoDrafts((current) => {
      const next = { ...current };
      for (const item of projectRepos) {
        if (next[item.projectId] === undefined) {
          next[item.projectId] = item.repo?.fullName ?? "";
        }
      }
      return next;
    });
  }, [projectRepos]);

  useEffect(() => {
    if (oauthHandled.current) return;
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    const state = params.get("state");
    if (!code) return;
    oauthHandled.current = true;
    const expected = window.sessionStorage.getItem(OAUTH_STATE_KEY);
    window.sessionStorage.removeItem(OAUTH_STATE_KEY);
    const url = new URL(window.location.href);
    url.searchParams.delete("code");
    url.searchParams.delete("state");
    window.history.replaceState({}, "", url.pathname);
    if (!state || !expected || state !== expected) {
      toast.error("GitHub OAuth state mismatch");
      return;
    }
    void completeOAuth({ code })
      .then((result) => {
        toast.success(
          result.login ? `Connected as ${result.login}` : "GitHub connected",
        );
      })
      .catch((error: unknown) => toast.error(errorMessage(error)));
  }, [completeOAuth]);

  async function onProfile(event: React.FormEvent) {
    event.preventDefault();
    const parsed = profileSchema.safeParse({ name });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "Check the name");
      return;
    }
    try {
      await updateProfile(parsed.data);
      toast.success("Profile saved");
    } catch (error) {
      toast.error(errorMessage(error));
    }
  }

  async function onMember(event: React.FormEvent) {
    event.preventDefault();
    if (!workspace) return;
    const parsed = memberSchema.safeParse({ email, role });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "Check the member");
      return;
    }
    try {
      await addMember({ workspaceId: workspace._id, ...parsed.data });
      setEmail("");
      toast.success("Member added");
    } catch (error) {
      toast.error(errorMessage(error));
    }
  }

  async function onSaveRepo(projectId: Id<"projects">) {
    const value = repoDrafts[projectId] ?? "";
    const parsed = repoSchema.safeParse(value);
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "Check the repository");
      return;
    }
    try {
      await saveProjectRepo({ projectId, fullName: parsed.data });
      toast.success("Repository saved");
    } catch (error) {
      toast.error(errorMessage(error));
    }
  }

  async function onClearRepo(projectId: Id<"projects">) {
    try {
      await clearProjectRepo({ projectId });
      setRepoDrafts((current) => ({ ...current, [projectId]: "" }));
      toast.success("Repository cleared");
    } catch (error) {
      toast.error(errorMessage(error));
    }
  }

  async function onConnectGithub() {
    try {
      const state =
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      window.sessionStorage.setItem(OAUTH_STATE_KEY, state);
      const { url } = await getAuthorizeUrl({ state });
      window.location.assign(url);
    } catch (error) {
      toast.error(errorMessage(error));
    }
  }

  async function onDisconnectGithub() {
    try {
      await disconnectGithub({});
      toast.success("GitHub disconnected");
    } catch (error) {
      toast.error(errorMessage(error));
    }
  }

  const canManage = workspace?.role === "owner" || workspace?.role === "admin";

  return (
    <div className="h-full overflow-auto pb-[env(safe-area-inset-bottom)]">
      <header className="flex min-h-12 items-center border-b border-border px-3 sm:px-4">
        <h1 className="text-sm font-medium">Settings</h1>
      </header>
      <div className="mx-auto max-w-xl space-y-10 px-4 py-6">
        <section>
          <h2 className="text-sm font-medium">Profile</h2>
          <form onSubmit={onProfile} className="mt-3 space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="profile-name">Name</Label>
              <Input id="profile-name" value={name} onChange={(event) => setName(event.target.value)} />
            </div>
            <p className="text-xs text-muted-foreground">{me?.email}</p>
            <Button type="submit" size="sm">Save profile</Button>
          </form>
        </section>
        <section>
          <h2 className="text-sm font-medium">Members</h2>
          <p className="mt-1 text-xs text-muted-foreground">{workspace?.name}</p>
          <div className="mt-3 divide-y divide-border rounded-md border border-border">
            {members?.map((member) => (
              <div key={member._id} className="flex items-center gap-2 px-3 py-2 text-sm">
                <UserAvatar user={member} />
                <div className="min-w-0 flex-1">
                  <div className="truncate">{member.name || member.email}</div>
                  <div className="truncate text-xs text-muted-foreground">{member.email}</div>
                </div>
                <span className="text-xs text-muted-foreground capitalize">{member.role}</span>
              </div>
            ))}
          </div>
          {canManage ? (
            <form onSubmit={onMember} className="mt-3 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
              <Input
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="email@company.com"
                className="h-9 w-full sm:h-8 sm:w-56"
              />
              <select
                value={role}
                onChange={(event) => setRole(event.target.value as "admin" | "member")}
                className="h-9 w-full rounded-md border border-border bg-transparent px-2 text-base sm:h-8 sm:w-auto sm:text-xs"
              >
                <option value="member">Member</option>
                <option value="admin">Admin</option>
              </select>
              <Button type="submit" size="sm">Add member</Button>
            </form>
          ) : (
            <p className="mt-3 text-xs text-muted-foreground">Only owners and admins can add members.</p>
          )}
        </section>
        <section>
          <h2 className="text-sm font-medium">GitHub</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Link one repository per project. Branch names work without a GitHub account.
          </p>
          <div className="mt-4 space-y-3 rounded-md border border-border p-3">
            <div className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
              Account
            </div>
            {oauthStatus === undefined ? (
              <p className="text-xs text-muted-foreground">Checking GitHub OAuth…</p>
            ) : !oauthStatus.configured ? (
              <p className="text-xs text-muted-foreground">
                GitHub OAuth is not configured on this deployment. Repository links and branch
                names still work.
              </p>
            ) : oauthStatus.connected ? (
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span>
                  Connected{oauthStatus.login ? ` as ${oauthStatus.login}` : ""}
                </span>
                <Button type="button" variant="outline" size="sm" onClick={() => void onDisconnectGithub()}>
                  Disconnect
                </Button>
              </div>
            ) : (
              <Button type="button" size="sm" onClick={() => void onConnectGithub()}>
                Connect GitHub
              </Button>
            )}
          </div>
          <div className="mt-4 space-y-3">
            <div className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
              Project repositories
            </div>
            {projectRepos?.map((item) => (
              <div key={item.projectId} className="space-y-2 rounded-md border border-border p-3">
                <div className="flex items-baseline gap-2 text-sm">
                  <span className="font-medium">{item.projectName}</span>
                  <span className="font-mono text-[11px] text-muted-foreground">{item.projectKey}</span>
                </div>
                {canManage ? (
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                    <Input
                      value={repoDrafts[item.projectId] ?? ""}
                      onChange={(event) =>
                        setRepoDrafts((current) => ({
                          ...current,
                          [item.projectId]: event.target.value,
                        }))
                      }
                      placeholder="owner/repository"
                      className="h-9 sm:h-8"
                    />
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        size="sm"
                        onClick={() => void onSaveRepo(item.projectId)}
                      >
                        Save
                      </Button>
                      {item.repo ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => void onClearRepo(item.projectId)}
                        >
                          Clear
                        </Button>
                      ) : null}
                    </div>
                  </div>
                ) : (
                  <p className="font-mono text-xs text-muted-foreground">
                    {item.repo?.fullName ?? "No repository linked"}
                  </p>
                )}
              </div>
            ))}
            {projectRepos?.length === 0 ? (
              <p className="text-xs text-muted-foreground">Create a project to link a repository.</p>
            ) : null}
            {!canManage ? (
              <p className="text-xs text-muted-foreground">
                Only owners and admins can change project repositories.
              </p>
            ) : null}
          </div>
        </section>
      </div>
    </div>
  );
}
