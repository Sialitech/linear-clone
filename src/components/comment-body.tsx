"use client";

import type { MentionMember } from "@/lib/mentions";
import { tokenizeMentions } from "@/lib/mentions";

export default function CommentBody({
  content,
  mentions,
}: {
  content: string;
  mentions: MentionMember[];
}) {
  const tokens = tokenizeMentions(content, mentions);
  return (
    <p className="mt-1 text-sm whitespace-pre-wrap">
      {tokens.map((token, index) =>
        token.type === "mention" ? (
          <span
            key={`${token.value}-${index}`}
            className="rounded-sm bg-sky-500/15 px-0.5 text-sky-200"
          >
            {token.value}
          </span>
        ) : (
          <span key={`text-${index}`}>{token.value}</span>
        ),
      )}
    </p>
  );
}
