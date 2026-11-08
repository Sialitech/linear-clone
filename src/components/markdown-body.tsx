"use client";

import { remarkMentions, safeMarkdownUrl, type MentionMark } from "@/lib/markdown-edit";
import rehypeTaskIndex, { taskIndexFromClassName } from "@/lib/rehype-task-index";
import { cn } from "@/lib/utils";
import { Check, Copy } from "lucide-react";
import Link from "next/link";
import { Children, isValidElement, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { Components } from "react-markdown";
import ReactMarkdown from "react-markdown";
import rehypeHighlight from "rehype-highlight";
import remarkBreaks from "remark-breaks";
import remarkGfm from "remark-gfm";
import type { PluggableList } from "unified";

const rehypePlugins: PluggableList = [
  [rehypeHighlight, { detect: true, plainText: ["text", "txt", "plain"] }],
  rehypeTaskIndex,
];

export default function MarkdownBody({
  source,
  mentions = [],
  onToggleTask,
  tone = "default",
  className,
}: {
  source: string;
  mentions?: MentionMark[];
  onToggleTask?: (index: number) => void;
  tone?: "default" | "on-dark";
  className?: string;
}) {
  const toggleRef = useRef(onToggleTask);
  toggleRef.current = onToggleTask;
  const components = useMemo(() => markdownComponents(() => toggleRef.current), []);
  const mentionKey = mentions.map((item) => `${item.userId}\0${item.token}`).join("\n");
  const remarkPlugins = useMemo(
    (): PluggableList => [
      remarkGfm,
      [remarkMentions, mentions] as [typeof remarkMentions, MentionMark[]],
      remarkBreaks,
    ],
    // The key compares mention identity; the plugin closes over the matching array.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [mentionKey],
  );

  if (!source.trim()) return null;

  return (
    <div className={cn("markdown-body", className)} data-tone={tone === "on-dark" ? "on-dark" : undefined}>
      <ReactMarkdown
        remarkPlugins={remarkPlugins}
        rehypePlugins={rehypePlugins}
        urlTransform={safeMarkdownUrl}
        components={components}
      >
        {source}
      </ReactMarkdown>
    </div>
  );
}

function markdownComponents(readToggle: () => ((index: number) => void) | undefined): Components {
  return {
    a: function MarkdownLink({ href, children, title }) {
      if (href?.startsWith("mention:")) {
        return <span className="markdown-mention">{children}</span>;
      }
      if (!href) return <>{children}</>;
      if (/^https?:\/\//i.test(href)) {
        return (
          <a href={href} title={title} target="_blank" rel="noreferrer noopener">
            {children}
          </a>
        );
      }
      if (href.startsWith("/")) {
        return (
          <Link href={href} title={title}>
            {children}
          </Link>
        );
      }
      return (
        <a href={href} title={title}>
          {children}
        </a>
      );
    },
    img: function MarkdownImage({ src, alt }) {
      if (!src || typeof src !== "string") return null;
      return (
        // Remote markdown images are arbitrary https URLs, not local assets.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt={alt ?? ""} loading="lazy" />
      );
    },
    input: function MarkdownCheckbox({ className, checked, type }) {
      if (type !== "checkbox") return <input type={type} className={className} />;
      const index = taskIndexFromClassName(className);
      const toggle = readToggle();
      const interactive = Boolean(toggle) && index !== null;
      const visibleClass = className?.replace(/(?:^|\s)task-index-\d+\b/g, "").trim();
      return (
        <input
          type="checkbox"
          className={cn("markdown-task", visibleClass)}
          checked={Boolean(checked)}
          disabled={!interactive}
          onChange={() => {
            if (interactive && index !== null) toggle?.(index);
          }}
        />
      );
    },
    pre: function MarkdownPre({ children }) {
      return <CodeBlock>{children}</CodeBlock>;
    },
    table: function MarkdownTable({ children }) {
      return (
        <div className="markdown-table">
          <table>{children}</table>
        </div>
      );
    },
  };
}

function CodeBlock({ children }: { children?: ReactNode }) {
  const preRef = useRef<HTMLPreElement>(null);
  const [copied, setCopied] = useState(false);
  const language = languageOf(children);

  useEffect(() => {
    if (!copied) return;
    const timeout = window.setTimeout(() => setCopied(false), 1500);
    return () => window.clearTimeout(timeout);
  }, [copied]);

  return (
    <div className="markdown-codeblock">
      <div className="markdown-codeblock-bar">
        <span>{language || "text"}</span>
        <button
          type="button"
          className="markdown-copy"
          onClick={() => {
            const text = (preRef.current?.innerText ?? "").replace(/\n$/, "");
            void navigator.clipboard.writeText(text).then(
              () => setCopied(true),
              () => setCopied(false),
            );
          }}
        >
          {copied ? <Check /> : <Copy />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre ref={preRef}>{children}</pre>
    </div>
  );
}

function languageOf(children: ReactNode) {
  const child = Children.toArray(children).find((item) => isValidElement(item));
  if (!isValidElement<{ className?: string }>(child)) return "";
  const match = /language-([^\s]+)/.exec(child.props.className ?? "");
  return match?.[1] ?? "";
}
