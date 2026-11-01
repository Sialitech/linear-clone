"use client";

import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import type { IssueStatus, Priority } from "@convex/model";
import { errorMessage } from "@/lib/format";
import type { IssueItem, WorkspaceItem } from "@/lib/types";
import { useMutation, useQuery } from "convex/react";
import posthog from "posthog-js";
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { toast } from "sonner";

const STORAGE_KEY = "linear-clone:workspace";

type IssueRelation = { kind: "child" | "parent"; issueId: Id<"issues"> };

type ComposerState =
  | { mode: "create"; projectId?: Id<"projects">; relation?: IssueRelation }
  | { mode: "edit"; issueId: Id<"issues"> };

type WorkspaceContextValue = {
  workspaces: WorkspaceItem[] | undefined;
  workspace: WorkspaceItem | null;
  setWorkspaceId: (workspaceId: Id<"workspaces">) => void;
  me: { _id: Id<"users">; name: string | null; email: string | null; image: string | null } | null | undefined;
  composer: ComposerState | null;
  openCreate: (defaults?: { projectId?: Id<"projects">; relation?: IssueRelation }) => void;
  openEdit: (issueId: Id<"issues">) => void;
  closeComposer: () => void;
};

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

export function useWorkspace() {
  const value = useContext(WorkspaceContext);
  if (!value) {
    throw new Error("useWorkspace must be used inside the app shell");
  }
  return value;
}

export default function WorkspaceProvider({ children }: { children: ReactNode }) {
  const workspaces = useQuery(api.users.myWorkspaces, {});
  const me = useQuery(api.users.me, {});
  const ensureWorkspace = useMutation(api.users.ensureWorkspace);
  const ensuring = useRef(false);
  const [workspaceId, setWorkspaceIdState] = useState<Id<"workspaces"> | null>(null);
  const [composer, setComposer] = useState<ComposerState | null>(null);

  useEffect(() => {
    if (!workspaces || workspaces.length > 0 || ensuring.current) return;
    ensuring.current = true;
    void ensureWorkspace({}).catch((error: unknown) => {
      ensuring.current = false;
      toast.error(errorMessage(error));
    });
  }, [workspaces, ensureWorkspace]);

  useEffect(() => {
    if (!me?._id) return;
    posthog.identify(me._id, {
      email: me.email,
      name: me.name,
    });
  }, [me]);

  useEffect(() => {
    if (!workspaces || workspaces.length === 0) return;
    const stored = window.localStorage.getItem(STORAGE_KEY);
    const fallback = workspaces.find((workspace) => workspace._id === stored) ?? workspaces[0];
    if (!fallback) return;
    setWorkspaceIdState((current) => {
      if (current && workspaces.some((workspace) => workspace._id === current)) return current;
      return fallback._id;
    });
  }, [workspaces]);

  const workspace = useMemo(
    () => workspaces?.find((item) => item._id === workspaceId) ?? null,
    [workspaces, workspaceId],
  );

  useEffect(() => {
    if (!workspace) return;
    posthog.group("workspace", workspace._id, { name: workspace.name });
  }, [workspace]);

  const value = useMemo<WorkspaceContextValue>(
    () => ({
      workspaces,
      workspace,
      me,
      composer,
      setWorkspaceId: (next) => {
        setWorkspaceIdState(next);
        window.localStorage.setItem(STORAGE_KEY, next);
      },
      openCreate: (defaults) =>
        setComposer({
          mode: "create",
          projectId: defaults?.projectId,
          ...(defaults?.relation ? { relation: defaults.relation } : {}),
        }),
      openEdit: (issueId) => setComposer({ mode: "edit", issueId }),
      closeComposer: () => setComposer(null),
    }),
    [workspaces, workspace, me, composer],
  );

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

export type { IssueItem, IssueStatus, Priority };
