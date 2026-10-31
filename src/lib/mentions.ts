import type { Id } from "@convex/_generated/dataModel";

export type MentionMember = {
  _id: Id<"users">;
  name?: string | null;
  email?: string | null;
  image?: string | null;
};

export function memberMentionLabel(member: MentionMember) {
  const name = member.name?.trim();
  if (name) return name;
  const email = member.email?.trim();
  if (email) return email.split("@")[0] || email;
  return "User";
}

export function mentionToken(member: MentionMember) {
  return `@${memberMentionLabel(member)}`;
}

/** Mentions still present in the composer text (token must remain). */
export function activeMentionIds(
  content: string,
  pending: Array<{ userId: Id<"users">; token: string }>,
) {
  const ids: Id<"users">[] = [];
  const seen = new Set<string>();
  for (const item of pending) {
    if (!content.includes(item.token)) continue;
    if (seen.has(item.userId)) continue;
    seen.add(item.userId);
    ids.push(item.userId);
  }
  return ids;
}

export function findMentionQuery(text: string, caret: number) {
  const before = text.slice(0, caret);
  const match = before.match(/(^|[\s([{])@([^\s@]*)$/);
  if (!match) return null;
  const query = match[2] ?? "";
  const start = caret - query.length - 1;
  return { query, start, end: caret };
}

export function filterMembers(members: MentionMember[], query: string) {
  const q = query.trim().toLowerCase();
  return members.filter((member) => {
    const name = member.name?.toLowerCase() ?? "";
    const email = member.email?.toLowerCase() ?? "";
    if (!q) return true;
    return name.includes(q) || email.includes(q);
  });
}

type Segment =
  | { type: "text"; value: string }
  | { type: "mention"; value: string; userId: Id<"users"> };

/** Split comment text so only picker-backed mention tokens are highlighted. */
export function segmentCommentMentions(
  content: string,
  mentionIds: Id<"users">[],
  members: MentionMember[],
): Segment[] {
  if (mentionIds.length === 0) {
    return content ? [{ type: "text", value: content }] : [];
  }
  const byId = new Map(members.map((member) => [member._id as string, member]));
  const tokens = mentionIds
    .map((id) => {
      const member = byId.get(id);
      if (!member) return null;
      return { userId: id, token: mentionToken(member) };
    })
    .filter((item): item is { userId: Id<"users">; token: string } => item !== null)
    .sort((a, b) => b.token.length - a.token.length);

  if (tokens.length === 0) {
    return content ? [{ type: "text", value: content }] : [];
  }

  const segments: Segment[] = [];
  let remaining = content;
  while (remaining.length > 0) {
    let earliest = -1;
    let hit: { userId: Id<"users">; token: string } | null = null;
    for (const token of tokens) {
      const index = remaining.indexOf(token.token);
      if (index === -1) continue;
      if (earliest === -1 || index < earliest) {
        earliest = index;
        hit = token;
      } else if (index === earliest && hit && token.token.length > hit.token.length) {
        hit = token;
      }
    }
    if (earliest === -1 || !hit) {
      segments.push({ type: "text", value: remaining });
      break;
    }
    if (earliest > 0) {
      segments.push({ type: "text", value: remaining.slice(0, earliest) });
    }
    segments.push({ type: "mention", value: hit.token, userId: hit.userId });
    remaining = remaining.slice(earliest + hit.token.length);
  }
  return segments;
}
