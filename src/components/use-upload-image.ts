"use client";

import { api } from "@convex/_generated/api";
import { useWorkspace } from "@/components/workspace-provider";
import { uploadImageFile } from "@/lib/upload-image";
import { useMutation } from "convex/react";
import { useCallback } from "react";

export function useUploadImage() {
  const { workspace } = useWorkspace();
  const generateUploadUrl = useMutation(api.attachments.generateUploadUrl);
  const register = useMutation(api.attachments.register);
  return useCallback(
    (file: File) => {
      if (!workspace) return Promise.reject(new Error("No workspace"));
      return uploadImageFile({
        file,
        workspaceId: workspace._id,
        generateUploadUrl,
        register,
      });
    },
    [workspace, generateUploadUrl, register],
  );
}
