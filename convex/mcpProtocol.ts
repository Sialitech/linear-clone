export const MCP_PROTOCOL_VERSION = "2025-03-26";

export const MCP_TOOLS = [
  {
    name: "whoami",
    description:
      "Return the user and workspace this API token can access. Use this before other tools when you need workspace, project, or user ids.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "list_projects",
    description: "List projects in the token's workspace.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "list_users",
    description: "List members of the token's workspace. Assignee ids come from this list. Use \"me\" in other tools for the token owner.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "list_labels",
    description: "List labels in the token's workspace.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "list_cycles",
    description: "List cycles in the token's workspace.",
    inputSchema: {
      type: "object",
      properties: {
        status: { type: "string", enum: ["upcoming", "active", "completed"] },
      },
      additionalProperties: false,
    },
  },
  {
    name: "list_issue_statuses",
    description: "List the issue statuses this workspace uses.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
  },
  {
    name: "list_issues",
    description:
      "List issues in the token's workspace. Filter by project id or project key, status, priority, assignee (user id or \"me\"), label, cycle, or search text.",
    inputSchema: {
      type: "object",
      properties: {
        project: { type: "string", description: "Project id or key, such as ENG." },
        status: {
          type: "string",
          enum: ["backlog", "todo", "in_progress", "in_review", "done"],
        },
        priority: { type: "string", enum: ["urgent", "high", "medium", "low", "none"] },
        assignee: { type: "string", description: "User id, or \"me\"." },
        label: { type: "string", description: "Label id." },
        cycle: { type: "string", description: "Cycle id." },
        query: { type: "string", description: "Text search over title and description." },
        unassigned: { type: "boolean" },
        limit: { type: "integer", minimum: 1, maximum: 50 },
      },
      additionalProperties: false,
    },
  },
  {
    name: "get_issue",
    description: "Get one issue by id or by identifier such as ENG-12, including comments.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "Issue id or identifier like ENG-12." },
      },
      required: ["id"],
      additionalProperties: false,
    },
  },
  {
    name: "save_issue",
    description:
      "Create or update an issue. Pass id to update. When creating, project (id or key) and title are required. Assignee may be a user id or \"me\". Clear assignee, due date, or cycle with null.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string" },
        project: { type: "string" },
        title: { type: "string" },
        description: { type: "string" },
        status: {
          type: "string",
          enum: ["backlog", "todo", "in_progress", "in_review", "done"],
        },
        priority: { type: "string", enum: ["urgent", "high", "medium", "low", "none"] },
        assignee: { type: ["string", "null"] },
        labelIds: { type: "array", items: { type: "string" } },
        dueDate: { type: ["string", "null"], description: "YYYY-MM-DD, or null to clear." },
        cycle: { type: ["string", "null"] },
        parent: { type: ["string", "null"], description: "Parent issue id or identifier. Create only." },
      },
      additionalProperties: false,
    },
  },
  {
    name: "list_comments",
    description: "List comments on an issue.",
    inputSchema: {
      type: "object",
      properties: { issue: { type: "string" } },
      required: ["issue"],
      additionalProperties: false,
    },
  },
  {
    name: "save_comment",
    description: "Add a comment, or update one when id is set. Only the author can edit a comment.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string" },
        issue: { type: "string" },
        body: { type: "string" },
      },
      required: ["body"],
      additionalProperties: false,
    },
  },
  {
    name: "delete_comment",
    description: "Delete a comment. Authors can delete their own comments. Owners and admins can delete any comment.",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string" } },
      required: ["id"],
      additionalProperties: false,
    },
  },
] as const;

export type McpToolName = (typeof MCP_TOOLS)[number]["name"];

type RpcRequest = {
  jsonrpc: "2.0";
  id?: string | number | null;
  method: string;
  params?: unknown;
};

export function jsonRpcError(id: string | number | null, code: number, message: string) {
  return { jsonrpc: "2.0" as const, id, error: { code, message } };
}

export function parseRpcMessages(body: unknown): RpcRequest[] | { error: string } {
  const messages = Array.isArray(body) ? body : [body];
  if (messages.length === 0) return { error: "Empty request" };
  const parsed: RpcRequest[] = [];
  for (const message of messages) {
    if (!message || typeof message !== "object") return { error: "Invalid JSON-RPC message" };
    const record = message as Record<string, unknown>;
    if (record.jsonrpc !== "2.0" || typeof record.method !== "string") {
      return { error: "Invalid JSON-RPC message" };
    }
    parsed.push({
      jsonrpc: "2.0",
      method: record.method,
      ...(record.id !== undefined ? { id: record.id as string | number | null } : {}),
      ...(record.params !== undefined ? { params: record.params } : {}),
    });
  }
  return parsed;
}

export function toolResult(text: string, isError = false) {
  return {
    content: [{ type: "text" as const, text }],
    ...(isError ? { isError: true } : {}),
  };
}

export function handleMcpMessage(
  message: RpcRequest,
  callTool: (name: string, args: Record<string, unknown>) => Promise<unknown>,
): Promise<{ kind: "response"; body: unknown } | { kind: "notification" } | { kind: "error"; body: unknown }> {
  const id = message.id ?? null;
  const respond = message.id !== undefined;

  if (message.method === "initialize") {
    if (!respond) return Promise.resolve({ kind: "notification" });
    return Promise.resolve({
      kind: "response",
      body: {
        jsonrpc: "2.0",
        id,
        result: {
          protocolVersion: MCP_PROTOCOL_VERSION,
          capabilities: { tools: { listChanged: false } },
          serverInfo: { name: "linear-clone", version: "0.1.0" },
        },
      },
    });
  }

  if (message.method === "ping") {
    if (!respond) return Promise.resolve({ kind: "notification" });
    return Promise.resolve({ kind: "response", body: { jsonrpc: "2.0", id, result: {} } });
  }

  if (message.method === "notifications/initialized" || message.method.startsWith("notifications/")) {
    return Promise.resolve({ kind: "notification" });
  }

  if (message.method === "tools/list") {
    if (!respond) return Promise.resolve({ kind: "notification" });
    return Promise.resolve({
      kind: "response",
      body: { jsonrpc: "2.0", id, result: { tools: MCP_TOOLS } },
    });
  }

  if (message.method === "tools/call") {
    if (!respond) return Promise.resolve({ kind: "notification" });
    const params = (message.params ?? {}) as { name?: unknown; arguments?: unknown };
    if (typeof params.name !== "string") {
      return Promise.resolve({
        kind: "error",
        body: jsonRpcError(id, -32602, "tools/call requires a tool name"),
      });
    }
    const args =
      params.arguments && typeof params.arguments === "object" && !Array.isArray(params.arguments)
        ? (params.arguments as Record<string, unknown>)
        : {};
    return callTool(params.name, args)
      .then((result) => ({
        kind: "response" as const,
        body: { jsonrpc: "2.0" as const, id, result },
      }))
      .catch((error: unknown) => ({
        kind: "response" as const,
        body: {
          jsonrpc: "2.0" as const,
          id,
          result: toolResult(error instanceof Error ? error.message : "Tool failed", true),
        },
      }));
  }

  if (!respond) return Promise.resolve({ kind: "notification" });
  return Promise.resolve({
    kind: "error",
    body: jsonRpcError(id, -32601, `Method not found: ${message.method}`),
  });
}
