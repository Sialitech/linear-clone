import { NoOp } from "convex-helpers/server/customFunctions";
import {
  zCustomAction,
  zCustomMutation,
  zCustomQuery,
  zid,
} from "convex-helpers/server/zod4";
import { z } from "zod";
import { action, mutation, query } from "../_generated/server";
import {
  ASSIGNEE_MODES,
  ISSUE_STATUSES,
  MEMBER_ROLES,
  PRIORITIES,
  PROJECT_STATUSES,
} from "../model";

export const zQuery = zCustomQuery(query, NoOp);
export const zMutation = zCustomMutation(mutation, NoOp);
export const zAction = zCustomAction(action, NoOp);

export const issueStatusSchema = z.enum(ISSUE_STATUSES);
export const prioritySchema = z.enum(PRIORITIES);
export const projectStatusSchema = z.enum(PROJECT_STATUSES);
export const memberRoleSchema = z.enum(MEMBER_ROLES);
export const assigneeModeSchema = z.enum(ASSIGNEE_MODES);

export const workspaceIdSchema = zid("workspaces");
export const projectIdSchema = zid("projects");
export const issueIdSchema = zid("issues");
export const userIdSchema = zid("users");
export const labelIdSchema = zid("labels");
export const commentIdSchema = zid("comments");
export const viewIdSchema = zid("views");
export const pullRequestIdSchema = zid("pullRequests");
export const githubConnectionIdSchema = zid("githubConnections");
export const projectRepoIdSchema = zid("projectRepos");
