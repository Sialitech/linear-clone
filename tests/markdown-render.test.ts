import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ReactMarkdown from "react-markdown";
import rehypeHighlight from "rehype-highlight";
import remarkBreaks from "remark-breaks";
import remarkGfm from "remark-gfm";
import { remarkMentions, safeMarkdownUrl } from "../src/lib/markdown-edit.ts";
import rehypeTaskIndex from "../src/lib/rehype-task-index.ts";

function render(source: string) {
  return renderToStaticMarkup(
    createElement(
      ReactMarkdown,
      {
        remarkPlugins: [remarkGfm, [remarkMentions, [{ userId: "u1", token: "@Ada" }]], remarkBreaks],
        rehypePlugins: [rehypeHighlight, rehypeTaskIndex],
        urlTransform: safeMarkdownUrl,
      },
      source,
    ),
  );
}

describe("markdown render", () => {
  it("renders links, lists, mentions, and task indexes", () => {
    const html = render(
      [
        "See [the docs](https://example.com/docs) and https://example.com/auto.",
        "",
        "Hi @Ada,\nwelcome",
        "",
        "- [ ] ship it",
        "- [x] done",
        "",
        "```ts",
        "const n = 1",
        "```",
        "",
        "| A | B |",
        "| --- | --- |",
        "| 1 | 2 |",
        "",
        "[click](javascript:alert(1))",
      ].join("\n"),
    );

    assert.match(html, /href="https:\/\/example\.com\/docs"/);
    assert.match(html, /href="https:\/\/example\.com\/auto"/);
    assert.match(html, /href="mention:u1"/);
    assert.match(html, /task-index-0/);
    assert.match(html, /task-index-1/);
    assert.match(html, /type="checkbox"/);
    assert.match(html, /checked=""/);
    assert.match(html, /language-ts/);
    assert.match(html, /<table>/);
    assert.doesNotMatch(html, /javascript:/);
    assert.match(html, /<br\/>|<br>/);
  });

  it("renders bold, quotes, code, and the run autolink from an agent note", () => {
    const html = render(
      [
        "**Falló `run-agent`:**",
        "",
        "> El agente superó el timeout de 45 minutos",
        "",
        "**Consumo:** 13 M tokens",
        "",
        "Run: http://10.10.10.122:8888/tenants/707d0855-80ab-4e1f-a156-f1c4546cbf52/runs/ae827215-01ec-4cb5-981c-92dea4035637",
      ].join("\n"),
    );
    assert.match(html, /<strong>Falló <code>run-agent<\/code>:<\/strong>/);
    assert.match(html, /<blockquote>/);
    assert.match(html, /<strong>Consumo:<\/strong>/);
    assert.match(html, /href="http:\/\/10\.10\.10\.122:8888\/tenants\/707d0855-80ab-4e1f-a156-f1c4546cbf52\/runs\/ae827215-01ec-4cb5-981c-92dea4035637"/);
    assert.doesNotMatch(html, /\*\*/);
  });
});
