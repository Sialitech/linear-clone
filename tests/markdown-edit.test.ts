import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  insertLink,
  safeMarkdownUrl,
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
