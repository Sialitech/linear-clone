"use client";

import { api } from "@convex/_generated/api";
import UserAvatar from "@/components/user-avatar";
import { useWorkspace } from "@/components/workspace-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { errorMessage } from "@/lib/format";
import { useMutation, useQuery } from "convex/react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";

const profileSchema = z.object({ name: z.string().trim().min(1, "Enter a name").max(80) });
const memberSchema = z.object({
  email: z.string().trim().email("Enter a valid email"),
  role: z.enum(["admin", "member"]),
});

export default function SettingsScreen() {
  const { workspace, me } = useWorkspace();
  const members = useQuery(api.users.listMembers, workspace ? { workspaceId: workspace._id } : "skip");
  const updateProfile = useMutation(api.users.updateProfile);
  const addMember = useMutation(api.users.addMember);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"admin" | "member">("member");

  useEffect(() => {
    if (me?.name) setName(me.name);
  }, [me?.name]);

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
      </div>
    </div>
  );
}
