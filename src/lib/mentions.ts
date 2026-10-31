import type { Id } from "@convex/_generated/dataModel";

export type MentionMember = {
  _id: Id<"users">;
  name: string | null;
  email: string | null;
  image: string | null;
};

export type PendingMention = {
  userId: Id<"users">;
  label: string;
};

export function mentionLabel(member: MentionMember): string {
  return member.name?.trim() || member.email?.trim() || "User";
}

export function activeMentionQuery(text: string, cursor: number): { start: number; query: string } | null {
  const before = text.slice(0, cursor);
  const match = before.match(/(^|[\s([{])@([^\s@]*)$/);
  if (!match) return null;
  const atIndex = before.lastIndexOf("@");
  if (atIndex < 0) return null;
  return { start: atIndex, query: match[2] ?? "" };
}

export function filterMembers(members: MentionMember[], query: string): MentionMember[] {
  const needle = query.trim().toLowerCase();
  return members.filter((member) => {
    if (!needle) return true;
    const name = member.name?.toLowerCase() ?? "";
    const email = member.email?.toLowerCase() ?? "";
    return name.includes(needle) || email.includes(needle);
  });
}

export function mentionIdsStillInText(
  content: string,
  pending: PendingMention[],
): Id<"users">[] {
  const ids: Id<"users">[] = [];
  for (const item of pending) {
    if (!content.includes(`@${item.label}`)) continue;
    if (!ids.includes(item.userId)) ids.push(item.userId);
  }
  return ids;
}

export function pendingFromIds(
  mentionIds: Id<"users">[] | undefined,
  members: MentionMember[] | undefined,
): PendingMention[] {
  if (!mentionIds?.length || !members) return [];
  const byId = new Map(members.map((member) => [member._id, member]));
  const pending: PendingMention[] = [];
  for (const userId of mentionIds) {
    const member = byId.get(userId);
    if (!member) continue;
    pending.push({ userId, label: mentionLabel(member) });
  }
  return pending;
}

export type MentionToken =
  | { type: "text"; value: string }
  | { type: "mention"; value: string };

export function tokenizeMentions(
  content: string,
  mentions: MentionMember[],
): MentionToken[] {
  if (!content) return [];
  const labels = mentions
    .map((member) => mentionLabel(member))
    .filter(Boolean)
    .sort((a, b) => b.length - a.length);
  if (labels.length === 0) return [{ type: "text", value: content }];

  const tokens: MentionToken[] = [];
  let remaining = content;
  while (remaining.length > 0) {
    let nextIndex = -1;
    let nextLabel = "";
    for (const label of labels) {
      const needle = `@${label}`;
      const index = remaining.indexOf(needle);
      if (index < 0) continue;
      if (nextIndex < 0 || index < nextIndex) {
        nextIndex = index;
        nextLabel = label;
      }
    }
    if (nextIndex < 0) {
      tokens.push({ type: "text", value: remaining });
      break;
    }
    if (nextIndex > 0) {
      tokens.push({ type: "text", value: remaining.slice(0, nextIndex) });
    }
    const needle = `@${nextLabel}`;
    tokens.push({ type: "mention", value: needle });
    remaining = remaining.slice(nextIndex + needle.length);
  }
  return tokens;
}
