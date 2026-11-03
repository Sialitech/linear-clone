import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { handleMcpMessage, MCP_TOOLS, parseRpcMessages } from "../convex/mcpProtocol.ts";

describe("MCP protocol", () => {
  it("lists the Linear-style tools", async () => {
    const messages = parseRpcMessages({ jsonrpc: "2.0", id: 1, method: "tools/list" });
    assert.ok(!("error" in messages));
    const outcome = await handleMcpMessage(messages[0]!, async () => {
      throw new Error("should not call a tool");
    });
    assert.equal(outcome.kind, "response");
    if (outcome.kind !== "response") return;
    const result = outcome.body as { result: { tools: { name: string }[] } };
    assert.deepEqual(
      result.result.tools.map((tool) => tool.name),
      MCP_TOOLS.map((tool) => tool.name),
    );
  });

  it("returns a tool result and turns tool errors into isError", async () => {
    const messages = parseRpcMessages({
      jsonrpc: "2.0",
      id: "a",
      method: "tools/call",
      params: { name: "whoami", arguments: {} },
    });
    assert.ok(!("error" in messages));
    const ok = await handleMcpMessage(messages[0]!, async () => ({
      content: [{ type: "text", text: "Ada" }],
    }));
    assert.equal(ok.kind, "response");
    const bad = await handleMcpMessage(messages[0]!, async () => {
      throw new Error("Project not found");
    });
    assert.equal(bad.kind, "response");
    if (bad.kind !== "response") return;
    const body = bad.body as { result: { isError: boolean; content: { text: string }[] } };
    assert.equal(body.result.isError, true);
    assert.equal(body.result.content[0]?.text, "Project not found");
  });

  it("ignores initialized notifications", async () => {
    const messages = parseRpcMessages({ jsonrpc: "2.0", method: "notifications/initialized" });
    assert.ok(!("error" in messages));
    const outcome = await handleMcpMessage(messages[0]!, async () => ({}));
    assert.equal(outcome.kind, "notification");
  });
});
