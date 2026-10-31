"use client";

import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import UserAvatar from "@/components/user-avatar";
import { useWorkspace } from "@/components/workspace-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { errorMessage } from "@/lib/format";
import { useMutation, useQuery } from "convex/react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";

const profileSchema = z.object({ name: z.string().trim().min(1, "Enter a name").max(80) });
const memberSchema = z.object({
  email: z.string().trim().email("Enter a valid email"),
  role: z.enum(["admin", "member"]),
});
const repoSchema = z.object({
  projectId: z.string().min(1, "Choose a project"),
  fullName: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/, "Use owner/name"),
});

export default function SettingsScreen() {
  const { workspace, me } = useWorkspace();
  const members = useQuery(api.users.listMembers, workspace ? { workspaceId: workspace._id } : "skip");
  const projects = useQuery(api.projects.list, workspace ? { workspaceId: workspace._id } : "skip");
  const projectRepos = useQuery(
    api.github.listProjectRepos,
    workspace ? { workspaceId: workspace._id } : "skip",
  );
  const oauthStatus = useQuery(
    api.github.oauthStatus,
    workspace ? { workspaceId: workspace._id } : "skip",
  );
  const updateProfile = useMutation(api.users.updateProfile);
  const addMember = useMutation(api.users.addMember);
  const setProjectRepo = useMutation(api.github.setProjectRepo);
  const clearProjectRepo = useMutation(api.github.clearProjectRepo);
  const beginOAuth = useMutation(api.github.beginOAuth);
  const disconnectGithub = useMutation(api.github.disconnect);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"admin" | "member">("member");
  const [projectId, setProjectId] = useState("");
  const [repoFullName, setRepoFullName] = useState("");

  useEffect(() => {
    if (me?.name) setName(me.name);
  }, [me?.name]);

  useEffect(() => {
    if (!projects || projects.length === 0) return;
    setProjectId((current) => current || projects[0]!._id);
  }, [projects]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const github = params.get("github");
    if (!github) return;
    if (github === "connected") toast.success("GitHub connected");
    else if (github === "expired") toast.error("GitHub connect link expired. Try again.");
    else if (github === "missing") toast.error("GitHub did not return an authorization code.");
    else toast.error("GitHub connection failed");
    params.delete("github");
    const next = `${window.location.pathname}${params.toString() ? `?${params}` : ""}`;
    window.history.replaceState({}, "", next);
  }, []);

  const repoByProject = useMemo(() => {
    const map = new Map<string, { owner: string; name: string; fullName: string }>();
    for (const repo of projectRepos ?? []) {
      map.set(repo.projectId, {
        owner: repo.owner,
        name: repo.name,
        fullName: repo.fullName,
      });
    }
    return map;
  }, [projectRepos]);

  useEffect(() => {
    if (!projectId) return;
    const linked = repoByProject.get(projectId);
    setRepoFullName(linked?.fullName ?? "");
  }, [projectId, repoByProject]);

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

  async function onSaveRepo(event: React.FormEvent) {
    event.preventDefault();
    const parsed = repoSchema.safeParse({ projectId, fullName: repoFullName });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "Check the repository");
      return;
    }
    const [owner, namePart] = parsed.data.fullName.split("/");
    if (!owner || !namePart) {
      toast.error("Use owner/name");
      return;
    }
    try {
      await setProjectRepo({
        projectId: parsed.data.projectId as Id<"projects">,
        owner,
        name: namePart,
      });
      toast.success("Repository linked");
    } catch (error) {
      toast.error(errorMessage(error));
    }
  }

  async function onClearRepo() {
    if (!projectId) return;
    try {
      await clearProjectRepo({ projectId: projectId as Id<"projects"> });
      setRepoFullName("");
      toast.success("Repository unlinked");
    } catch (error) {
      toast.error(errorMessage(error));
    }
  }

  async function onConnectGithub() {
    if (!workspace) return;
    try {
      const { url } = await beginOAuth({ workspaceId: workspace._id });
      window.location.assign(url);
    } catch (error) {
      toast.error(errorMessage(error));
    }
  }

  async function onDisconnectGithub() {
    if (!workspace) return;
    try {
      await disconnectGithub({ workspaceId: workspace._id });
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
            Link a repository to each project. Optional OAuth unlocks live pull request titles and status.
          </p>
          <div className="mt-3 space-y-3 rounded-md border border-border p-3">
            <div className="space-y-1.5">
              <Label htmlFor="github-project">Project</Label>
              <select
                id="github-project"
                value={projectId}
                onChange={(event) => setProjectId(event.target.value)}
                className="h-9 w-full rounded-md border border-border bg-transparent px-2 text-sm"
              >
                {(projects ?? []).map((project) => (
                  <option key={project._id} value={project._id}>
                    {project.name} ({project.key})
                  </option>
                ))}
              </select>
            </div>
            {canManage ? (
              <form onSubmit={onSaveRepo} className="space-y-2">
                <div className="space-y-1.5">
                  <Label htmlFor="github-repo">Repository</Label>
                  <Input
                    id="github-repo"
                    value={repoFullName}
                    onChange={(event) => setRepoFullName(event.target.value)}
                    placeholder="owner/name"
                  />
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button type="submit" size="sm">Save repository</Button>
                  {repoByProject.has(projectId) ? (
                    <Button type="button" size="sm" variant="outline" onClick={() => void onClearRepo()}>
                      Unlink
                    </Button>
                  ) : null}
                </div>
              </form>
            ) : (
              <p className="text-sm text-muted-foreground">
                {repoByProject.get(projectId)?.fullName
                  ? `Linked to ${repoByProject.get(projectId)?.fullName}`
                  : "No repository linked for this project."}
              </p>
            )}
            <div className="border-t border-border pt-3">
              {oauthStatus === undefined ? (
                <p className="text-xs text-muted-foreground">Checking GitHub OAuth…</p>
              ) : !oauthStatus.configured ? (
                <p className="text-xs text-muted-foreground">
                  GitHub OAuth is not configured. Set <code>GITHUB_CLIENT_ID</code> and{" "}
                  <code>GITHUB_CLIENT_SECRET</code> on the Convex deployment to enable Connect GitHub.
                  Repository links and PR URLs still work without it.
                </p>
              ) : canManage ? (
                <div className="flex flex-wrap items-center gap-2">
                  {oauthStatus.connected ? (
                    <>
                      <p className="text-xs text-muted-foreground">
                        Connected{oauthStatus.providerUserId ? ` as GitHub user ${oauthStatus.providerUserId}` : ""}.
                      </p>
                      <Button type="button" size="sm" variant="outline" onClick={() => void onDisconnectGithub()}>
                        Disconnect
                      </Button>
                    </>
                  ) : (
                    <Button type="button" size="sm" onClick={() => void onConnectGithub()}>
                      Connect GitHub
                    </Button>
                  )}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">
                  {oauthStatus.connected
                    ? "GitHub is connected for enrichment."
                    : "Only owners and admins can connect GitHub OAuth."}
                </p>
              )}
            </div>
          </div>
          {(projectRepos?.length ?? 0) > 0 ? (
            <ul className="mt-3 space-y-1 text-xs text-muted-foreground">
              {projectRepos?.map((repo) => {
                const project = projects?.find((item) => item._id === repo.projectId);
                return (
                  <li key={repo._id}>
                    {project?.name ?? "Project"} →{" "}
                    <span className="font-mono text-foreground">{repo.fullName}</span>
                  </li>
                );
              })}
            </ul>
          ) : null}
        </section>
      </div>
    </div>
  );
}
