"use client";

import MarkdownBody from "@/components/markdown-body";
import {
  findSlashQuery,
  safeMarkdownUrl,
  shouldParsePasteAsMarkdown,
  sanitizeStoredMarkdown,
  shortenedAutolinkLabel,
  splitMentions,
  type MentionMark,
} from "@/lib/markdown-edit";
import { cn } from "@/lib/utils";
import { Extension, type Editor } from "@tiptap/core";
import TiptapCode from "@tiptap/extension-code";
import Image from "@tiptap/extension-image";
import Placeholder from "@tiptap/extension-placeholder";
import { Table, TableCell, TableHeader, TableRow } from "@tiptap/extension-table";
import TaskItem from "@tiptap/extension-task-item";
import TaskList from "@tiptap/extension-task-list";
import { Markdown } from "@tiptap/markdown";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet, type EditorView } from "@tiptap/pm/view";
import { EditorContent, useEditor } from "@tiptap/react";
import { BubbleMenu } from "@tiptap/react/menus";
import StarterKit from "@tiptap/starter-kit";
import {
  Bold,
  Code,
  Heading1,
  Heading2,
  Heading3,
  Italic,
  Link2,
  List,
  ListChecks,
  ListOrdered,
  Minus,
  Quote,
  SquareCode,
  Strikethrough,
  Table as TableIcon,
  Type,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

export type EditorCaret = {
  blockText: string;
  caret: number;
  replace: (start: number, end: number, text: string) => void;
};

type SlashItem = {
  id: string;
  label: string;
  hint: string;
  keywords: string[];
  icon: typeof Type;
  run: (editor: Editor) => void;
};

const BUBBLE_OPTIONS = { strategy: "fixed" as const, placement: "top" as const, offset: 8 };

// Inline code normally excludes every other mark, so **`name`** cannot be pasted.
const InclusiveCode = TiptapCode.extend({ excludes: "" });

function appendMenuToBody() {
  return document.body;
}

const SLASH_ITEMS: SlashItem[] = [
  { id: "text", label: "Text", hint: "Plain paragraph", keywords: ["text", "paragraph"], icon: Type, run: (editor) => editor.chain().focus().setParagraph().run() },
  { id: "h1", label: "Heading 1", hint: "#", keywords: ["h1", "title", "heading"], icon: Heading1, run: (editor) => editor.chain().focus().toggleHeading({ level: 1 }).run() },
  { id: "h2", label: "Heading 2", hint: "##", keywords: ["h2", "heading"], icon: Heading2, run: (editor) => editor.chain().focus().toggleHeading({ level: 2 }).run() },
  { id: "h3", label: "Heading 3", hint: "###", keywords: ["h3", "heading"], icon: Heading3, run: (editor) => editor.chain().focus().toggleHeading({ level: 3 }).run() },
  { id: "bullet", label: "Bulleted list", hint: "-", keywords: ["bullet", "list", "ul"], icon: List, run: (editor) => editor.chain().focus().toggleBulletList().run() },
  { id: "ordered", label: "Numbered list", hint: "1.", keywords: ["number", "ordered", "ol"], icon: ListOrdered, run: (editor) => editor.chain().focus().toggleOrderedList().run() },
  { id: "task", label: "To-do list", hint: "[]", keywords: ["todo", "task", "check"], icon: ListChecks, run: (editor) => editor.chain().focus().toggleTaskList().run() },
  { id: "quote", label: "Quote", hint: ">", keywords: ["quote", "blockquote"], icon: Quote, run: (editor) => editor.chain().focus().toggleBlockquote().run() },
  { id: "code", label: "Code block", hint: "```", keywords: ["code", "snippet"], icon: SquareCode, run: (editor) => editor.chain().focus().toggleCodeBlock().run() },
  { id: "divider", label: "Divider", hint: "---", keywords: ["divider", "rule", "hr"], icon: Minus, run: (editor) => editor.chain().focus().setHorizontalRule().run() },
  {
    id: "table",
    label: "Table",
    hint: "grid",
    keywords: ["table", "grid"],
    icon: TableIcon,
    run: (editor) => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run(),
  },
];

export default function MarkdownEditor({
  value,
  onChange,
  mentions,
  placeholder,
  ariaLabel = "Markdown",
  tone = "default",
  variant = "field",
  areaClassName,
  autoFocus = false,
  onCaretContext,
  onKeyDown,
  onPointerDown,
  onSubmit,
  onBlur,
}: {
  value: string;
  onChange: (value: string) => void;
  mentions?: MentionMark[];
  placeholder?: string;
  ariaLabel?: string;
  tone?: "default" | "on-dark";
  variant?: "plain" | "field";
  areaClassName?: string;
  autoFocus?: boolean;
  onCaretContext?: (caret: EditorCaret | null) => void;
  onKeyDown?: (event: KeyboardEvent) => void;
  onPointerDown?: () => void;
  onSubmit?: () => void;
  onBlur?: () => void;
}) {
  const onChangeRef = useRef(onChange);
  const onBlurRef = useRef(onBlur);
  const onSubmitRef = useRef(onSubmit);
  const onKeyDownRef = useRef(onKeyDown);
  const onCaretRef = useRef(onCaretContext);
  const onPointerRef = useRef(onPointerDown);
  const mentionsRef = useRef(mentions);
  const placeholderRef = useRef(placeholder);
  const editorRef = useRef<Editor | null>(null);
  const lastEmitted = useRef(value);
  const seeded = useRef(value);
  const dirty = useRef(false);
  const armed = useRef(false);
  const linkOpen = useRef(false);
  const slashEscaped = useRef(false);
  const slashQuery = useRef<string | null>(null);
  onChangeRef.current = onChange;
  onBlurRef.current = onBlur;
  onSubmitRef.current = onSubmit;
  onKeyDownRef.current = onKeyDown;
  onCaretRef.current = onCaretContext;
  onPointerRef.current = onPointerDown;
  mentionsRef.current = mentions;
  placeholderRef.current = placeholder;

  const [linking, setLinking] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");
  const [slash, setSlash] = useState<{ query: string; start: number; end: number } | null>(null);
  const [slashIndex, setSlashIndex] = useState(0);
  const [slashBox, setSlashBox] = useState<{ top: number; left: number; place: "up" | "down" } | null>(null);
  const onDark = tone === "on-dark";

  const extensions = useMemo(
    () => createExtensions(() => mentionsRef.current ?? [], () => placeholderRef.current),
    [],
  );

  const slashItems = useMemo(() => {
    const query = slash?.query.trim().toLowerCase() ?? "";
    if (!slash) return [];
    return SLASH_ITEMS.filter((item) => {
      if (!query) return true;
      return item.label.toLowerCase().includes(query) || item.keywords.some((keyword) => keyword.includes(query));
    });
  }, [slash]);
  const activeSlash = Math.min(slashIndex, Math.max(slashItems.length - 1, 0));

  const publishRef = useRef<(editor: Editor) => void>(() => {});
  publishRef.current = (current) => {
    const inCode = current.isActive("codeBlock") || current.isActive("code");
    if (!current.isFocused || inCode) {
      onCaretRef.current?.(null);
      setSlash(null);
      setSlashBox(null);
      if (!current.isFocused) slashEscaped.current = false;
      return;
    }
    const caret = readCaret(current);
    onCaretRef.current?.(caret);
    const found = caret ? findSlashQuery(caret.blockText, caret.caret) : null;
    if ((found?.query ?? null) !== slashQuery.current) {
      slashEscaped.current = false;
      setSlashIndex(0);
    }
    slashQuery.current = found?.query ?? null;
    if (!found || slashEscaped.current) {
      setSlash(null);
      setSlashBox(null);
      return;
    }
    setSlash(found);
    try {
      const coords = current.view.coordsAtPos(current.state.selection.from);
      const place = coords.bottom > window.innerHeight - 240 ? "up" : "down";
      setSlashBox({
        top: place === "down" ? coords.bottom + 6 : coords.top - 6,
        left: Math.max(8, Math.min(coords.left, window.innerWidth - 232)),
        place,
      });
    } catch {
      setSlashBox(null);
    }
  };

  const openLinkRef = useRef<() => void>(() => {});
  openLinkRef.current = () => {
    const current = editorRef.current;
    if (!current) return;
    const { from, to } = current.state.selection;
    const href = current.getAttributes("link").href;
    if (from === to && typeof href !== "string") return;
    linkOpen.current = true;
    setLinkUrl(typeof href === "string" ? href : "");
    setLinking(true);
  };

  const keyDownRef = useRef<(view: EditorView, event: KeyboardEvent) => boolean>(() => false);
  keyDownRef.current = (view, event) => {
    if (slash && slashItems.length > 0) {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setSlashIndex((index) => (index + 1) % slashItems.length);
        return true;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        setSlashIndex((index) => (index - 1 + slashItems.length) % slashItems.length);
        return true;
      }
      if (event.key === "Enter" || event.key === "Tab") {
        event.preventDefault();
        const item = slashItems[activeSlash];
        const current = editorRef.current;
        if (item && current) runSlash(current, slash, item);
        return true;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        slashEscaped.current = true;
        setSlash(null);
        setSlashBox(null);
        return true;
      }
    }
    onKeyDownRef.current?.(event);
    if (event.defaultPrevented) return true;
    const mod = event.metaKey || event.ctrlKey;
    if (mod && event.key === "Enter") {
      event.preventDefault();
      if (onSubmitRef.current) onSubmitRef.current();
      else view.dom.closest("form")?.requestSubmit();
      return true;
    }
    if (mod && event.key.toLowerCase() === "k") {
      event.preventDefault();
      openLinkRef.current();
      return true;
    }
    return false;
  };

  const editor = useEditor(
    {
      immediatelyRender: false,
      shouldRerenderOnTransaction: true,
      extensions,
      content: seeded.current,
      contentType: "markdown",
      editorProps: {
        attributes: {
          "aria-label": ariaLabel,
          "aria-multiline": "true",
          class: "notion-prose",
          spellcheck: "true",
        },
        handleKeyDown: (view, event) => keyDownRef.current(view, event),
        handlePaste: (_view, event) => {
          armed.current = true;
          const text = event.clipboardData?.getData("text/plain") ?? "";
          const html = event.clipboardData?.getData("text/html") ?? "";
          const current = editorRef.current;
          if (!current || !shouldParsePasteAsMarkdown(text, html)) return false;
          try {
            return current.commands.insertContent(text, { contentType: "markdown" });
          } catch {
            return false;
          }
        },
        handleClick: (_view, _pos, event) => {
          if (!(event.metaKey || event.ctrlKey)) return false;
          const target = event.target;
          if (!(target instanceof Element)) return false;
          const href = target.closest("a")?.getAttribute("href");
          if (!href) return false;
          const safe = safeMarkdownUrl(href);
          if (!safe || safe.startsWith("mention:")) return true;
          if (safe.startsWith("/")) window.location.assign(safe);
          else window.open(safe, "_blank", "noopener,noreferrer");
          return true;
        },
        handleDOMEvents: {
          pointerdown: () => {
            armed.current = true;
            onPointerRef.current?.();
            return false;
          },
          keydown: () => {
            armed.current = true;
            return false;
          },
          drop: () => {
            armed.current = true;
            return false;
          },
          blur: () => {
            onBlurRef.current?.();
            return false;
          },
        },
      },
      onUpdate: ({ editor: current, transaction }) => {
        publishRef.current(current);
        if (!transaction.docChanged || !armed.current) return;
        const markdown = sanitizeStoredMarkdown(current.getMarkdown());
        if (markdown === lastEmitted.current) return;
        dirty.current = true;
        lastEmitted.current = markdown;
        onChangeRef.current(markdown);
      },
      onSelectionUpdate: ({ editor: current }) => publishRef.current(current),
    },
    [],
  );

  editorRef.current = editor;

  useEffect(() => {
    if (!editor) return;
    if (value === lastEmitted.current) return;
    const current = sanitizeStoredMarkdown(editor.getMarkdown());
    if (current === value) {
      lastEmitted.current = value;
      dirty.current = false;
      return;
    }
    if (dirty.current && editor.isFocused && value !== "") return;
    editor.commands.setContent(value, { contentType: "markdown", emitUpdate: false });
    lastEmitted.current = value;
    dirty.current = false;
  }, [editor, value]);

  useEffect(() => {
    if (autoFocus && editor) editor.commands.focus("end");
  }, [autoFocus, editor]);

  const mentionKey = (mentions ?? []).map((item) => `${item.userId}\0${item.token}`).join("\n");
  useEffect(() => {
    if (!editor) return;
    try {
      editor.view.dispatch(editor.state.tr.setMeta("addToHistory", false));
    } catch {
      // The view attaches after the editor instance exists.
    }
  }, [editor, mentionKey]);

  function applyLink() {
    const current = editorRef.current;
    if (!current) return;
    const typed = linkUrl.trim();
    linkOpen.current = false;
    setLinking(false);
    if (!typed) {
      current.chain().focus().extendMarkRange("link").unsetLink().run();
      return;
    }
    const withProtocol = /^[a-z][a-z0-9+.-]*:/i.test(typed) || typed.startsWith("/") || typed.startsWith("#") || typed.startsWith("?")
      ? typed
      : `https://${typed}`;
    const safe = safeMarkdownUrl(withProtocol);
    if (!safe) return;
    current.chain().focus().extendMarkRange("link").setLink({ href: safe }).run();
  }

  function closeLink() {
    linkOpen.current = false;
    setLinking(false);
    editor?.commands.focus();
  }

  const shouldShowBubble = useCallback(({ editor: current, from, to, state }: { editor: Editor; from: number; to: number; state: Editor["state"] }) => {
    if (linkOpen.current) return true;
    if (from === to) return false;
    if (current.isActive("codeBlock")) return false;
    return state.doc.textBetween(from, to, " ").trim().length > 0;
  }, []);

  const surface = cn("markdown-body notion-editor", areaClassName);
  const menuClass = cn(
    "z-[70] flex items-center gap-0.5 rounded-lg border p-1 shadow-lg",
    onDark ? "border-white/10 bg-[#2a2b31] text-white" : "border-border bg-popover text-popover-foreground",
  );

  return (
    <div
      className={surface}
      data-tone={onDark ? "on-dark" : undefined}
      data-variant={variant}
      data-editor="notion"
    >
      {editor ? (
        <>
          <EditorContent editor={editor} className="notion-content" />
          <BubbleMenu
            editor={editor}
            className={menuClass}
            appendTo={appendMenuToBody}
            options={BUBBLE_OPTIONS}
            shouldShow={shouldShowBubble}
          >
            {linking ? (
              <form
                className="flex items-center gap-1"
                onSubmit={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  applyLink();
                }}
              >
                <input
                  autoFocus
                  aria-label="Link address"
                  value={linkUrl}
                  placeholder="Paste a link"
                  className={cn(
                    "h-7 w-44 bg-transparent px-1.5 text-xs outline-none",
                    onDark ? "placeholder:text-[#8b8f98]" : "placeholder:text-muted-foreground",
                  )}
                  onChange={(event) => setLinkUrl(event.target.value)}
                  onKeyDown={(event) => {
                    event.stopPropagation();
                    if (event.key === "Escape") {
                      event.preventDefault();
                      closeLink();
                    }
                  }}
                />
                <MenuButton label="Apply link" onDark={onDark} onClick={applyLink}>
                  <Link2 />
                </MenuButton>
              </form>
            ) : (
              <>
                <MenuButton label="Bold" onDark={onDark} active={editor.isActive("bold")} onClick={() => editor.chain().focus().toggleBold().run()}>
                  <Bold />
                </MenuButton>
                <MenuButton label="Italic" onDark={onDark} active={editor.isActive("italic")} onClick={() => editor.chain().focus().toggleItalic().run()}>
                  <Italic />
                </MenuButton>
                <MenuButton label="Strikethrough" onDark={onDark} active={editor.isActive("strike")} onClick={() => editor.chain().focus().toggleStrike().run()}>
                  <Strikethrough />
                </MenuButton>
                <MenuButton label="Code" onDark={onDark} active={editor.isActive("code")} onClick={() => editor.chain().focus().toggleCode().run()}>
                  <Code />
                </MenuButton>
                <MenuButton label="Link" onDark={onDark} active={editor.isActive("link")} onClick={() => openLinkRef.current()}>
                  <Link2 />
                </MenuButton>
              </>
            )}
          </BubbleMenu>
        </>
      ) : value.trim() ? (
        <MarkdownBody source={value} mentions={mentions} tone={tone} />
      ) : (
        <p className="notion-placeholder">{placeholder}</p>
      )}
      {slash && slashBox && slashItems.length > 0
        ? createPortal(
            <div
              role="listbox"
              aria-label="Insert"
              className={cn(
                "fixed z-[70] max-h-60 w-56 overflow-auto rounded-lg border p-1 shadow-lg",
                onDark ? "border-white/10 bg-[#2a2b31] text-white" : "border-border bg-popover text-popover-foreground",
              )}
              style={{
                left: slashBox.left,
                top: slashBox.place === "down" ? slashBox.top : undefined,
                bottom: slashBox.place === "up" ? window.innerHeight - slashBox.top : undefined,
              }}
              onMouseDown={(event) => event.preventDefault()}
            >
              {slashItems.map((item, index) => {
                const Icon = item.icon;
                return (
                  <button
                    key={item.id}
                    type="button"
                    role="option"
                    aria-selected={index === activeSlash}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm",
                      index === activeSlash
                        ? onDark
                          ? "bg-white/10"
                          : "bg-accent text-accent-foreground"
                        : onDark
                          ? "hover:bg-white/10"
                          : "hover:bg-accent/60",
                    )}
                    onClick={() => {
                      if (editor) runSlash(editor, slash, item);
                    }}
                  >
                    <Icon className="size-3.5 shrink-0 opacity-70" />
                    <span className="min-w-0 flex-1 truncate">{item.label}</span>
                    <span className={cn("text-[11px]", onDark ? "text-[#8b8f98]" : "text-muted-foreground")}>{item.hint}</span>
                  </button>
                );
              })}
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}

function createExtensions(readMentions: () => MentionMark[], readPlaceholder: () => string | undefined) {
  return [
    StarterKit.configure({
      underline: false,
      code: false,
      heading: { levels: [1, 2, 3] },
      link: {
        openOnClick: false,
        autolink: true,
        linkOnPaste: true,
        markdownLinks: true,
        defaultProtocol: "https",
        isAllowedUri: (url) => {
          const safe = safeMarkdownUrl(url);
          return Boolean(safe) && safe === url;
        },
      },
    }),
    InclusiveCode,
    Image.configure({ allowBase64: false }),
    TaskList,
    TaskItem.configure({ nested: true }),
    Table.configure({ resizable: false }),
    TableRow,
    TableHeader,
    TableCell,
    Placeholder.configure({
      placeholder: ({ editor }) => (editor.isEmpty ? readPlaceholder() ?? "" : ""),
    }),
    mentionMarks(readMentions),
    shortLinkMarks(),
    Markdown.configure({ markedOptions: { gfm: true, breaks: true } }),
  ];
}

function shortLinkMarks() {
  return Extension.create({
    name: "shortLinkMarks",
    addProseMirrorPlugins() {
      return [
        new Plugin({
          key: new PluginKey("shortLinkMarks"),
          props: {
            decorations(state) {
              const decorations: Decoration[] = [];
              const { from, to } = state.selection;
              state.doc.descendants((node, pos) => {
                if (!node.isText || !node.text) return;
                const link = node.marks.find((mark) => mark.type.name === "link");
                const href = link?.attrs.href;
                if (typeof href !== "string") return;
                const label = shortenedAutolinkLabel(href, node.text);
                if (!label) return;
                const start = pos;
                const end = pos + node.text.length;
                const editing = from < end && to > start;
                decorations.push(
                  Decoration.inline(
                    start,
                    end,
                    editing ? { title: href } : { class: "markdown-url-short", title: href, "data-short": label },
                  ),
                );
              });
              return decorations.length > 0 ? DecorationSet.create(state.doc, decorations) : null;
            },
          },
        }),
      ];
    },
  });
}

function mentionMarks(readMentions: () => MentionMark[]) {
  return Extension.create({
    name: "mentionMarks",
    addProseMirrorPlugins() {
      return [
        new Plugin({
          key: new PluginKey("mentionMarks"),
          props: {
            decorations(state) {
              const mentions = readMentions();
              if (mentions.length === 0) return null;
              const decorations: Decoration[] = [];
              state.doc.descendants((node, pos) => {
                if (!node.isText || !node.text?.includes("@")) return;
                const pieces = splitMentions(node.text, mentions);
                let offset = 0;
                for (const piece of pieces) {
                  if (piece.type === "mention") {
                    decorations.push(
                      Decoration.inline(pos + offset, pos + offset + piece.value.length, {
                        class: "markdown-mention",
                      }),
                    );
                  }
                  offset += piece.value.length;
                }
              });
              return decorations.length > 0 ? DecorationSet.create(state.doc, decorations) : null;
            },
          },
        }),
      ];
    },
  });
}

function readCaret(editor: Editor): EditorCaret | null {
  const { $from } = editor.state.selection;
  if (!$from.parent.isTextblock) return null;
  const blockText = $from.parent.textBetween(0, $from.parentOffset, undefined, "\uFFFC");
  return {
    blockText,
    caret: blockText.length,
    replace(start, end, text) {
      const liveSel = editor.state.selection.$from;
      if (!liveSel.parent.isTextblock) return;
      const live = liveSel.parent.textBetween(0, liveSel.parentOffset, undefined, "\uFFFC");
      const from = liveSel.pos - (live.length - start);
      const to = liveSel.pos - (live.length - end);
      if (from < 0 || to < from || to > editor.state.doc.content.size) return;
      const node = text ? editor.schema.text(text) : null;
      editor
        .chain()
        .focus()
        .command(({ tr }) => {
          if (node) tr.replaceWith(from, to, node);
          else tr.delete(from, to);
          return true;
        })
        .run();
    },
  };
}

function runSlash(editor: Editor, query: { start: number; end: number }, item: SlashItem) {
  const selection = editor.state.selection.$from;
  if (!selection.parent.isTextblock) return;
  const live = selection.parent.textBetween(0, selection.parentOffset, undefined, "\uFFFC");
  const from = selection.pos - (live.length - query.start);
  const to = selection.pos - (live.length - query.end);
  if (from < 0 || to < from || to > editor.state.doc.content.size) return;
  editor.chain().focus().deleteRange({ from, to }).run();
  item.run(editor);
}

function MenuButton({
  label,
  onDark,
  active = false,
  onClick,
  children,
}: {
  label: string;
  onDark: boolean;
  active?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={active}
      className={cn(
        "inline-flex size-7 items-center justify-center rounded-md [&_svg]:size-3.5",
        active
          ? onDark
            ? "bg-white/15 text-white"
            : "bg-accent text-accent-foreground"
          : onDark
            ? "text-[#d0d0d4] hover:bg-white/10"
            : "text-muted-foreground hover:bg-accent hover:text-foreground",
      )}
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
    >
      {children}
    </button>
  );
}
