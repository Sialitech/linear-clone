import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  findSlashQuery,
  insertLink,
  looksLikeMarkdown,
  shouldParsePasteAsMarkdown,
  safeMarkdownUrl,
  sanitizeStoredMarkdown,
  shortenedAutolinkLabel,
  shortenUrl,
  splitMentions,
  toggleOrderedList,
  togglePrefix,
  toggleTaskAt,
  toggleTaskList,
  wrapSelection,
} from "../src/lib/markdown-edit.ts";

describe("wrapSelection", () => {
  it("wraps a selection and selects the inner text", () => {
    const edit = wrapSelection("say hi", 4, 6, "**");
    assert.equal(edit.value, "say **hi**");
    assert.equal(edit.value.slice(edit.selectionStart, edit.selectionEnd), "hi");
  });

  it("places the caret between markers when nothing is selected", () => {
    const edit = wrapSelection("say ", 4, 4, "**");
    assert.equal(edit.value, "say ****");
    assert.equal(edit.selectionStart, 6);
    assert.equal(edit.selectionEnd, 6);
  });

  it("unwraps markers surrounding the selection", () => {
    const edit = wrapSelection("say **hi**", 6, 8, "**");
    assert.equal(edit.value, "say hi");
  });
});

describe("lists", () => {
  it("toggles a bullet prefix on and off", () => {
    const on = togglePrefix("one\ntwo", 0, 7, "- ");
    assert.equal(on.value, "- one\n- two");
    const off = togglePrefix(on.value, 0, on.value.length, "- ");
    assert.equal(off.value, "one\ntwo");
  });

  it("numbers every selected line", () => {
    const edit = toggleOrderedList("a\nb", 0, 3);
    assert.equal(edit.value, "1. a\n2. b");
  });

  it("turns a bullet into a task and removes it again", () => {
    const on = toggleTaskList("- ship it", 0, 9);
    assert.equal(on.value, "- [ ] ship it");
    const off = toggleTaskList(on.value, 0, on.value.length);
    assert.equal(off.value, "ship it");
  });
});

describe("insertLink", () => {
  it("selects the url placeholder", () => {
    const edit = insertLink("read the docs", 5, 8);
    assert.equal(edit.value, "read [the](url) docs");
    assert.equal(edit.value.slice(edit.selectionStart, edit.selectionEnd), "url");
  });

  it("uses a selected url as the href", () => {
    const edit = insertLink("https://example.com", 0, 19);
    assert.equal(edit.value, "[](https://example.com)");
    assert.equal(edit.selectionStart, 1);
  });
});

describe("toggleTaskAt", () => {
  it("flips the nth checkbox and skips fenced code", () => {
    const source = ["- [ ] one", "", "```", "- [ ] hidden", "```", "", "- [x] two"].join("\n");
    assert.equal(toggleTaskAt(source, 0).split("\n")[0], "- [x] one");
    assert.match(toggleTaskAt(source, 1), /- \[ \] two/);
    assert.equal(toggleTaskAt(source, 5), source);
  });

  it("flips a task inside a quote", () => {
    const source = "> - [ ] quoted\n- [ ] real";
    assert.equal(toggleTaskAt(source, 0).split("\n")[0], "> - [x] quoted");
    assert.equal(toggleTaskAt(source, 1).split("\n")[1], "- [x] real");
  });
});

describe("short links", () => {
  const run =
    "http://10.10.10.122:8888/tenants/707d0855-80ab-4e1f-a156-f1c4546cbf52/runs/ae827215-01ec-4cb5-981c-92dea4035637";

  it("keeps the host and the start of the last segment", () => {
    assert.equal(shortenUrl(run), "10.10.10.122:8888/…/ae827215");
    assert.equal(shortenUrl("https://www.example.com/docs"), "example.com/docs");
    assert.equal(shortenUrl("https://example.com"), "example.com");
    assert.equal(shortenUrl("https://example.com/a/b?x=1"), "example.com/…/b…");
    assert.equal(shortenUrl("mailto:ada@example.com"), "ada@example.com");
  });

  it("shortens autolinks and keeps labels an author wrote", () => {
    assert.equal(shortenedAutolinkLabel(run, run), "10.10.10.122:8888/…/ae827215");
    assert.equal(shortenedAutolinkLabel("https://example.com/docs/", "https://example.com/docs"), "example.com/docs");
    assert.equal(shortenedAutolinkLabel(run, "run log"), null);
    assert.equal(shortenedAutolinkLabel("https://example.com", "example.com"), null);
  });
});

describe("safeMarkdownUrl", () => {
  it("keeps http, relative, mailto, and mention urls", () => {
    assert.equal(safeMarkdownUrl("https://example.com/a"), "https://example.com/a");
    assert.equal(safeMarkdownUrl("/issues/abc"), "/issues/abc");
    assert.equal(safeMarkdownUrl("mailto:a@b.com"), "mailto:a@b.com");
    assert.equal(safeMarkdownUrl("mention:user_1"), "mention:user_1");
  });

  it("drops script and protocol-relative urls", () => {
    assert.equal(safeMarkdownUrl("javascript:alert(1)"), "");
    assert.equal(safeMarkdownUrl("//evil.example"), "");
  });
});

describe("splitMentions", () => {
  const ada = { userId: "u1", token: "@Ada" };
  const adaLovelace = { userId: "u2", token: "@Ada Lovelace" };

  it("marks a mention and leaves the surrounding text", () => {
    assert.deepEqual(splitMentions("hi @Ada!", [ada]), [
      { type: "text", value: "hi " },
      { type: "mention", value: "@Ada", userId: "u1" },
      { type: "text", value: "!" },
    ]);
  });

  it("prefers the longer mention and ignores emails", () => {
    assert.deepEqual(splitMentions("@Ada Lovelace and ada@ada.dev", [ada, adaLovelace]), [
      { type: "mention", value: "@Ada Lovelace", userId: "u2" },
      { type: "text", value: " and ada@ada.dev" },
    ]);
  });

  it("does not match a prefix of a longer word", () => {
    assert.deepEqual(splitMentions("@AdaLovelace", [ada]), [{ type: "text", value: "@AdaLovelace" }]);
  });
});

describe("slash queries", () => {
  it("reads a command at the start of a block", () => {
    assert.deepEqual(findSlashQuery("/to", 3), { query: "to", start: 0, end: 3 });
  });

  it("reads a command after whitespace and ignores mid-word slashes", () => {
    assert.deepEqual(findSlashQuery("hello /li", 9), { query: "li", start: 6, end: 9 });
    assert.equal(findSlashQuery("https://ex", 10), null);
    assert.equal(findSlashQuery("path/name", 9), null);
  });
});

describe("stored markdown", () => {
  it("strips unsafe link targets and keeps safe ones", () => {
    assert.equal(sanitizeStoredMarkdown("[click](javascript:alert(1))"), "click");
    assert.equal(
      sanitizeStoredMarkdown("[docs](https://example.com/docs)"),
      "[docs](https://example.com/docs)",
    );
    assert.equal(sanitizeStoredMarkdown("<javascript:alert(1)>"), "");
  });

  it("detects markdown worth parsing on paste", () => {
    assert.equal(looksLikeMarkdown("## Ship it"), true);
    assert.equal(looksLikeMarkdown("just a sentence"), false);
    assert.equal(looksLikeMarkdown("see [docs](https://example.com)"), true);
  });

  it("parses markdown pastes that browsers wrap in paragraphs", () => {
    const note = "**Falló `run-agent`:**\n\n> timeout";
    assert.equal(shouldParsePasteAsMarkdown(note, ""), true);
    assert.equal(shouldParsePasteAsMarkdown(note, "<p>**Falló `run-agent`:**</p><p>&gt; timeout</p>"), true);
    assert.equal(shouldParsePasteAsMarkdown(note, "<p><strong>Falló</strong> <code>run-agent</code></p>"), false);
    assert.equal(shouldParsePasteAsMarkdown("just a sentence", "<p>just a sentence</p>"), false);
  });
});
