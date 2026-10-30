import type { FunctionReturnType } from "convex/server";
import type { api } from "@convex/_generated/api";

export type IssueItem = FunctionReturnType<typeof api.issues.list>[number];
export type ProjectItem = FunctionReturnType<typeof api.projects.list>[number];
export type MemberItem = FunctionReturnType<typeof api.users.listMembers>[number];
export type LabelItem = FunctionReturnType<typeof api.labels.list>[number];
export type ViewItem = FunctionReturnType<typeof api.views.list>[number];
export type CommentItem = FunctionReturnType<typeof api.comments.list>[number];
export type WorkspaceItem = FunctionReturnType<typeof api.users.myWorkspaces>[number];
