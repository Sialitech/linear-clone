"use client";

import UserAvatar from "@/components/user-avatar";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  activeMentionQuery,
  filterMembers,
  mentionIdsStillInText,
  mentionLabel,
  type MentionMember,
  type PendingMention,
} from "@/lib/mentions";
import { cn } from "@/lib/utils";
import type { Id } from "@convex/_generated/dataModel";
import { useEffect, useRef, useState } from "react";

export default function CommentComposer({
  members,
  initialValue = "",
  initialMentions = [],
  submitLabel,
  onSubmit,
  onCancel,
}: {
  members: MentionMember[] | undefined;
  initialValue?: string;
  initialMentions?: PendingMention[];
  submitLabel: string;
  onSubmit: (args: { content: string; mentionIds: Id<"users">[] }) => Promise<void> | void;
  onCancel?: () => void;
}) {
  const [value, setValue] = useState(initialValue);
  const [pending, setPending] = useState<PendingMention[]>(initialMentions);
  const [cursor, setCursor] = useState(initialValue.length);
  const [menuIndex, setMenuIndex] = useState(0);
  const [open, setOpen] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const active = open ? activeMentionQuery(value, cursor) : null;
  const options = active && members ? filterMembers(members, active.query).slice(0, 8) : [];

  useEffect(() => {
    setMenuIndex(0);
  }, [active?.query, active?.start]);

  function syncMentionMenu(nextValue: string, nextCursor: number) {
    const next = activeMentionQuery(nextValue, nextCursor);
    setOpen(Boolean(next));
    if (next) setMenuIndex(0);
  }

  function selectMember(member: MentionMember) {
    const current = activeMentionQuery(value, cursor);
    if (!current) return;
    const label = mentionLabel(member);
    const insertion = `@${label} `;
    const nextValue = value.slice(0, current.start) + insertion + value.slice(cursor);
    const nextCursor = current.start + insertion.length;
    setValue(nextValue);
    setCursor(nextCursor);
    setPending((currentPending) => {
      if (currentPending.some((item) => item.userId === member._id && item.label === label)) {
        return currentPending;
      }
      return [...currentPending, { userId: member._id, label }];
    });
    setOpen(false);
    requestAnimationFrame(() => {
      const node = textareaRef.current;
      if (!node) return;
      node.focus();
      node.setSelectionRange(nextCursor, nextCursor);
    });
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const content = value.trim();
    if (!content) return;
    const mentionIds = mentionIdsStillInText(value, pending);
    await onSubmit({ content, mentionIds });
    if (!onCancel) {
      setValue("");
      setPending([]);
      setCursor(0);
      setOpen(false);
    }
  }

  return (
    <form onSubmit={(event) => void handleSubmit(event)} className="relative mt-4 space-y-2">
      <Textarea
        ref={textareaRef}
        value={value}
        placeholder="Leave a comment"
        onChange={(event) => {
          const nextValue = event.target.value;
          const nextCursor = event.target.selectionStart ?? nextValue.length;
          setValue(nextValue);
          setCursor(nextCursor);
          syncMentionMenu(nextValue, nextCursor);
        }}
        onClick={(event) => {
          const nextCursor = event.currentTarget.selectionStart ?? value.length;
          setCursor(nextCursor);
          syncMentionMenu(value, nextCursor);
        }}
        onKeyUp={(event) => {
          const nextCursor = event.currentTarget.selectionStart ?? value.length;
          setCursor(nextCursor);
        }}
        onKeyDown={(event) => {
          if (!open || options.length === 0) return;
          if (event.key === "ArrowDown") {
            event.preventDefault();
            setMenuIndex((index) => (index + 1) % options.length);
            return;
          }
          if (event.key === "ArrowUp") {
            event.preventDefault();
            setMenuIndex((index) => (index - 1 + options.length) % options.length);
            return;
          }
          if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            const member = options[menuIndex];
            if (member) selectMember(member);
            return;
          }
          if (event.key === "Escape") {
            event.preventDefault();
            setOpen(false);
          }
        }}
      />
      {open && options.length > 0 ? (
        <div className="absolute z-20 mt-1 w-full max-w-sm overflow-hidden rounded-md border border-border bg-popover shadow-md">
          <ul className="max-h-56 overflow-auto py-1">
            {options.map((member, index) => (
              <li key={member._id}>
                <button
                  type="button"
                  className={cn(
                    "flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm",
                    index === menuIndex ? "bg-accent text-accent-foreground" : "hover:bg-accent/60",
                  )}
                  onMouseDown={(event) => {
                    event.preventDefault();
                    selectMember(member);
                  }}
                  onMouseEnter={() => setMenuIndex(index)}
                >
                  <UserAvatar user={member} />
                  <span className="min-w-0 truncate">{mentionLabel(member)}</span>
                  {member.email && member.name ? (
                    <span className="ml-auto truncate text-xs text-muted-foreground">{member.email}</span>
                  ) : null}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <div className="flex items-center gap-2">
        <Button type="submit" size="sm">
          {submitLabel}
        </Button>
        {onCancel ? (
          <Button type="button" size="sm" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
        ) : null}
      </div>
    </form>
  );
}
