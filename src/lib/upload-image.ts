import type { Id } from "@convex/_generated/dataModel";
import { assertImageFile, imageMarkdown } from "@/lib/images";

export async function uploadImageFile(args: {
  file: File;
  workspaceId: Id<"workspaces">;
  generateUploadUrl: (args: { workspaceId: Id<"workspaces"> }) => Promise<string>;
  register: (args: {
    workspaceId: Id<"workspaces">;
    storageId: string;
    fileName: string;
    contentType: string;
  }) => Promise<unknown>;
}) {
  assertImageFile(args.file);
  const postUrl = await args.generateUploadUrl({ workspaceId: args.workspaceId });
  const response = await fetch(postUrl, {
    method: "POST",
    headers: { "Content-Type": args.file.type },
    body: args.file,
  });
  if (!response.ok) throw new Error("Image upload failed");
  const body = (await response.json()) as { storageId?: string };
  if (!body.storageId) throw new Error("Image upload failed");
  const url = await args.register({
    workspaceId: args.workspaceId,
    storageId: body.storageId,
    fileName: args.file.name || "image",
    contentType: args.file.type,
  });
  if (typeof url !== "string" || !url) throw new Error("Image upload failed");
  return {
    url,
    alt: args.file.name || "image",
    markdown: imageMarkdown(args.file.name || "image", url),
  };
}

export function firstImageFile(files: FileList | File[] | null | undefined) {
  if (!files) return null;
  return Array.from(files).find((file) => file.type.startsWith("image/")) ?? null;
}
