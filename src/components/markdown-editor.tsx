"use client";

import MarkdownBody from "@/components/markdown-body";
import { Textarea } from "@/components/ui/textarea";
import {
  insertBlock,
  insertCodeBlock,
  insertLink,
  toggleOrderedList,
  togglePrefix,
  toggleTaskAt,
  toggleTaskList,
  wrapSelection,
  type EditResult,
  type MentionMark,
} from "@/lib/markdown-edit";
import { cn } from "@/lib/utils";
import {
  Bold,
  Code,
  Heading2,
  Italic,
  Link2,
  List,
  ListChecks,
  ListOrdered,
  Quote,
  SquareCode,
  Strikethrough,
  Table,
} from "lucide-react";
import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode, type Ref } from "react";

const TABLE = "| Header | Header |\n| --- | --- |\n| Cell | Cell |";

export default function MarkdownEditor({
  value,
  onChange,
  mentions,
  placeholder,
  ariaLabel = "Markdown",
  tone = "default",
  areaClassName,
  autoFocus = false,
  textareaRef,
  onCaretChange,
  onKeyDown,
  onTextPointerDown,
  onSubmit,
  onModeChange,
}: {
  value: string;
  onChange: (value: string) => void;
  mentions?: MentionMark[];
  placeholder?: string;
  ariaLabel?: string;
  tone?: "default" | "on-dark";
  areaClassName?: string;
  autoFocus?: boolean;
  textareaRef?: Ref<HTMLTextAreaElement>;
  onCaretChange?: (caret: number) => void;
  onKeyDown?: (event: KeyboardEvent<HTMLTextAreaElement>) => void;
  onTextPointerDown?: () => void;
  onSubmit?: () => void;
  onModeChange?: (mode: "write" | "preview") => void;
}) {
  const writeId = useId();
  const previewId = useId();
  const innerRef = useRef<HTMLTextAreaElement>(null);
  const pendingSelection = useRef<{ start: number; end: number } | null>(null);
  const [tab, setTab] = useState<"write" | "preview">("write");
  const onDark = tone === "on-dark";

  useEffect(() => {
    const pending = pendingSelection.current;
    if (!pending || tab !== "write") return;
    pendingSelection.current = null;
    const el = innerRef.current;
    if (!el) return;
    el.focus();
    el.setSelectionRange(pending.start, pending.end);
    onCaretChange?.(pending.end);
  }, [tab, value, onCaretChange]);

  function assignRef(node: HTMLTextAreaElement | null) {
    innerRef.current = node;
    if (typeof textareaRef === "function") textareaRef(node);
    else if (textareaRef) textareaRef.current = node;
  }

  function show(next: "write" | "preview") {
    setTab(next);
    onModeChange?.(next);
    if (next === "write") {
      requestAnimationFrame(() => innerRef.current?.focus());
    }
  }

  function apply(edit: EditResult) {
    pendingSelection.current = { start: edit.selectionStart, end: edit.selectionEnd };
    if (edit.value === value && tab === "write") {
      pendingSelection.current = null;
      const el = innerRef.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(edit.selectionStart, edit.selectionEnd);
      onCaretChange?.(edit.selectionEnd);
      return;
    }
    onChange(edit.value);
    setTab("write");
    onModeChange?.("write");
  }

  function editSelection(edit: (current: string, start: number, end: number) => EditResult) {
    const el = innerRef.current;
    const start = el?.selectionStart ?? value.length;
    const end = el?.selectionEnd ?? value.length;
    apply(edit(value, start, end));
  }

  function publishCaret(el: HTMLTextAreaElement) {
    const caret = el.selectionDirection === "backward" ? el.selectionStart : el.selectionEnd;
    onCaretChange?.(caret);
  }

  function onTextKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    onKeyDown?.(event);
    if (event.defaultPrevented) return;
    const mod = event.metaKey || event.ctrlKey;
    if (!mod) return;
    const key = event.key.toLowerCase();
    if (key === "enter") {
      if (!onSubmit) return;
      event.preventDefault();
      onSubmit();
      return;
    }
    const start = event.currentTarget.selectionStart;
    const end = event.currentTarget.selectionEnd;
    let result: EditResult | null = null;
    if (key === "b") result = wrapSelection(value, start, end, "**");
    else if (key === "i") result = wrapSelection(value, start, end, "*");
    else if (key === "e") result = wrapSelection(value, start, end, "`");
    else if (key === "k") result = insertLink(value, start, end);
    else if (event.shiftKey && key === "x") result = wrapSelection(value, start, end, "~~");
    else if (event.shiftKey && key === "8") result = togglePrefix(value, start, end, "- ");
    else if (event.shiftKey && key === "7") result = toggleOrderedList(value, start, end);
    else if (event.shiftKey && key === ".") result = togglePrefix(value, start, end, "> ");
    if (!result) return;
    event.preventDefault();
    apply(result);
  }

  const toolClass = cn(
    "inline-flex size-6 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground [&_svg]:size-3.5",
    onDark && "text-[#a1a1aa] hover:bg-white/10 hover:text-white",
  );

  return (
    <div
      className={cn(
        "overflow-hidden rounded-lg border",
        onDark ? "border-white/10 bg-black/15" : "border-border bg-background",
      )}
    >
      <div className={cn("flex flex-wrap items-center gap-x-1 border-b px-1", onDark ? "border-white/10" : "border-border")}>
        <div role="tablist" aria-label="Markdown" className="flex shrink-0">
          <button
            type="button"
            role="tab"
            id={`${writeId}-tab`}
            aria-controls={writeId}
            aria-selected={tab === "write"}
            className={tabClass(tab === "write", onDark)}
            onClick={() => show("write")}
          >
            Write
          </button>
          <button
            type="button"
            role="tab"
            id={`${previewId}-tab`}
            aria-controls={previewId}
            aria-selected={tab === "preview"}
            className={tabClass(tab === "preview", onDark)}
            onClick={() => show("preview")}
          >
            Preview
          </button>
        </div>
        <div className="flex flex-wrap items-center py-1 sm:ml-auto">
          <ToolButton label="Heading" className={toolClass} onClick={() => editSelection((v, s, e) => togglePrefix(v, s, e, "### "))}>
            <Heading2 />
          </ToolButton>
          <ToolButton label="Bold" className={toolClass} onClick={() => editSelection((v, s, e) => wrapSelection(v, s, e, "**"))}>
            <Bold />
          </ToolButton>
          <ToolButton label="Italic" className={toolClass} onClick={() => editSelection((v, s, e) => wrapSelection(v, s, e, "*"))}>
            <Italic />
          </ToolButton>
          <ToolButton label="Strikethrough" className={toolClass} onClick={() => editSelection((v, s, e) => wrapSelection(v, s, e, "~~"))}>
            <Strikethrough />
          </ToolButton>
          <ToolButton label="Link" className={toolClass} onClick={() => editSelection((v, s, e) => insertLink(v, s, e))}>
            <Link2 />
          </ToolButton>
          <ToolButton label="Quote" className={toolClass} onClick={() => editSelection((v, s, e) => togglePrefix(v, s, e, "> "))}>
            <Quote />
          </ToolButton>
          <ToolButton label="Code" className={toolClass} onClick={() => editSelection((v, s, e) => wrapSelection(v, s, e, "`"))}>
            <Code />
          </ToolButton>
          <ToolButton label="Code block" className={toolClass} onClick={() => editSelection((v, s, e) => insertCodeBlock(v, s, e))}>
            <SquareCode />
          </ToolButton>
          <ToolButton label="Bulleted list" className={toolClass} onClick={() => editSelection((v, s, e) => togglePrefix(v, s, e, "- "))}>
            <List />
          </ToolButton>
          <ToolButton label="Numbered list" className={toolClass} onClick={() => editSelection(toggleOrderedList)}>
            <ListOrdered />
          </ToolButton>
          <ToolButton label="Task list" className={toolClass} onClick={() => editSelection(toggleTaskList)}>
            <ListChecks />
          </ToolButton>
          <ToolButton label="Table" className={toolClass} onClick={() => editSelection((v, s, e) => insertBlock(v, s, e, TABLE))}>
            <Table />
          </ToolButton>
        </div>
      </div>
      <div id={writeId} role="tabpanel" aria-labelledby={`${writeId}-tab`} hidden={tab !== "write"}>
        <Textarea
          ref={assignRef}
          value={value}
          aria-label={ariaLabel}
          placeholder={placeholder}
          autoFocus={autoFocus}
          rows={4}
          className={cn(
            "max-h-80 min-h-24 w-full resize-y rounded-none border-0 bg-transparent px-3 py-2 shadow-none focus-visible:ring-0 md:text-sm",
            onDark && "text-[#e6e6e6] placeholder:text-[#6d717a]",
            areaClassName,
          )}
          onChange={(event) => {
            onChange(event.target.value);
            publishCaret(event.currentTarget);
          }}
          onPointerDown={() => onTextPointerDown?.()}
          onClick={(event) => publishCaret(event.currentTarget)}
          onKeyUp={(event) => publishCaret(event.currentTarget)}
          onSelect={(event) => publishCaret(event.currentTarget)}
          onKeyDown={onTextKeyDown}
        />
      </div>
      <div
        id={previewId}
        role="tabpanel"
        aria-labelledby={`${previewId}-tab`}
        hidden={tab !== "preview"}
        className={cn("px-3 py-2", areaClassName)}
      >
        {tab === "preview" ? (
          value.trim() ? (
            <MarkdownBody
              source={value}
              mentions={mentions}
              tone={tone}
              onToggleTask={(index) => {
                const next = toggleTaskAt(value, index);
                if (next !== value) onChange(next);
              }}
            />
          ) : (
            <p className={cn("text-sm text-muted-foreground", onDark && "text-[#8b8f98]")}>Nothing to preview</p>
          )
        ) : null}
      </div>
    </div>
  );
}

function tabClass(active: boolean, onDark: boolean) {
  return cn(
    "border-b-2 px-2 py-1.5 text-xs",
    active
      ? onDark
        ? "border-[#8b9cf7] font-medium text-white"
        : "border-primary font-medium text-foreground"
      : onDark
        ? "border-transparent text-[#8b8f98] hover:text-white"
        : "border-transparent text-muted-foreground hover:text-foreground",
  );
}

function ToolButton({
  label,
  className,
  onClick,
  children,
}: {
  label: string;
  className: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={className}
      onPointerDown={(event) => event.preventDefault()}
      onClick={onClick}
    >
      {children}
    </button>
  );
}
