import { authTables } from "@convex-dev/auth/server";
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

const issueStatus = v.union(
  v.literal("backlog"),
  v.literal("todo"),
  v.literal("in_progress"),
  v.literal("in_review"),
  v.literal("done"),
);

const priority = v.union(
  v.literal("urgent"),
  v.literal("high"),
  v.literal("medium"),
  v.literal("low"),
  v.literal("none"),
);

const projectStatus = v.union(
  v.literal("planned"),
  v.literal("active"),
  v.literal("paused"),
  v.literal("completed"),
  v.literal("canceled"),
);

const memberRole = v.union(
  v.literal("owner"),
  v.literal("admin"),
  v.literal("member"),
);

const assigneeMode = v.union(
  v.literal("anyone"),
  v.literal("me"),
  v.literal("unassigned"),
  v.literal("user"),
);

export default defineSchema({
  ...authTables,
  workspaces: defineTable({
    name: v.string(),
    slug: v.string(),
    ownerId: v.id("users"),
    createdAt: v.number(),
  })
    .index("by_slug", ["slug"])
    .index("by_owner", ["ownerId"]),
  members: defineTable({
    workspaceId: v.id("workspaces"),
    userId: v.id("users"),
    role: memberRole,
    joinedAt: v.number(),
  })
    .index("by_workspace", ["workspaceId"])
    .index("by_user", ["userId"])
    .index("by_workspace_and_user", ["workspaceId", "userId"]),
  projects: defineTable({
    name: v.string(),
    description: v.string(),
    key: v.string(),
    workspaceId: v.id("workspaces"),
    status: projectStatus,
    issueCounter: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_workspace", ["workspaceId"])
    .index("by_workspace_and_key", ["workspaceId", "key"]),
  labels: defineTable({
    name: v.string(),
    color: v.string(),
    workspaceId: v.id("workspaces"),
  }).index("by_workspace", ["workspaceId"]),
  issues: defineTable({
    title: v.string(),
    description: v.string(),
    // Denormalized title + description so text search can use one search index.
    searchText: v.string(),
    projectId: v.id("projects"),
    workspaceId: v.id("workspaces"),
    assigneeId: v.optional(v.id("users")),
    creatorId: v.id("users"),
    status: issueStatus,
    priority: priority,
    labelIds: v.array(v.id("labels")),
    dueDate: v.optional(v.number()),
    order: v.number(),
    number: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_project", ["projectId"])
    .index("by_assignee", ["assigneeId"])
    .index("by_status", ["status"])
    .index("by_workspace", ["workspaceId"])
    .index("by_project_and_status", ["projectId", "status"])
    .index("by_workspace_and_status", ["workspaceId", "status"])
    .index("by_project_status_and_order", ["projectId", "status", "order"])
    .searchIndex("search_text", {
      searchField: "searchText",
      filterFields: ["workspaceId", "projectId"],
    }),
  comments: defineTable({
    issueId: v.id("issues"),
    authorId: v.id("users"),
    content: v.string(),
    createdAt: v.number(),
    updatedAt: v.number(),
  }).index("by_issue", ["issueId"]),
  views: defineTable({
    name: v.string(),
    workspaceId: v.id("workspaces"),
    ownerId: v.id("users"),
    projectId: v.optional(v.id("projects")),
    status: v.optional(issueStatus),
    priority: v.optional(priority),
    assigneeMode: assigneeMode,
    assigneeId: v.optional(v.id("users")),
    labelId: v.optional(v.id("labels")),
    createdAt: v.number(),
  })
    .index("by_workspace", ["workspaceId"])
    .index("by_workspace_and_owner", ["workspaceId", "ownerId"]),
  githubConnections: defineTable({
    workspaceId: v.id("workspaces"),
    userId: v.id("users"),
    providerUserId: v.string(),
    login: v.optional(v.string()),
    // Tokens are server-side only; never return them from client queries.
    accessToken: v.string(),
    refreshToken: v.optional(v.string()),
    // 0 means the access token does not expire.
    expiresAt: v.optional(v.number()),
    createdAt: v.number(),
  })
    .index("by_workspace", ["workspaceId"])
    .index("by_workspace_and_user", ["workspaceId", "userId"]),
  githubApps: defineTable({
    workspaceId: v.id("workspaces"),
    appId: v.number(),
    slug: v.string(),
    name: v.string(),
    clientId: v.string(),
    clientSecret: v.string(),
    privateKey: v.string(),
    webhookSecret: v.optional(v.string()),
    createdAt: v.number(),
  }).index("by_workspace", ["workspaceId"]),
  githubOAuthStates: defineTable({
    state: v.string(),
    workspaceId: v.id("workspaces"),
    userId: v.id("users"),
    returnOrigin: v.optional(v.string()),
    kind: v.optional(v.union(v.literal("manifest"), v.literal("connect"))),
    createdAt: v.number(),
  }).index("by_state", ["state"]),
  projectRepos: defineTable({
    workspaceId: v.id("workspaces"),
    projectId: v.id("projects"),
    owner: v.string(),
    name: v.string(),
    updatedAt: v.number(),
  })
    .index("by_project", ["projectId"])
    .index("by_workspace", ["workspaceId"]),
  pullRequests: defineTable({
    workspaceId: v.id("workspaces"),
    issueId: v.id("issues"),
    owner: v.string(),
    repo: v.string(),
    number: v.number(),
    url: v.string(),
    title: v.optional(v.string()),
    state: v.optional(
      v.union(v.literal("open"), v.literal("closed"), v.literal("merged")),
    ),
    updatedAt: v.number(),
  })
    .index("by_issue", ["issueId"])
    .index("by_workspace", ["workspaceId"]),
});
