"use client";

import { createContext, useContext } from "react";
import type { RefTarget } from "@/lib/doc";

export interface EditorEnv {
  /** null for the book preface */
  projectId: string | null;
  projectName: string;
  /** Figures/tables/listings of the whole project, including this section (live). */
  refTargets: RefTarget[];
  uploadImage: (file: File) => Promise<{ id: string }>;
}

export const EditorEnvContext = createContext<EditorEnv | null>(null);

export function useEditorEnv(): EditorEnv {
  const env = useContext(EditorEnvContext);
  if (!env) throw new Error("EditorEnvContext missing");
  return env;
}

export async function uploadAsset(file: File, projectId: string | null): Promise<{ id: string }> {
  const form = new FormData();
  form.append("file", file);
  if (projectId) form.append("projectId", projectId);
  const res = await fetch("/api/assets", { method: "POST", body: form });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error ?? "Upload failed");
  return body;
}

export const assetUrl = (id: string) => `/api/assets/${id}`;

export const REF_LABEL = { figure: "Figure", table: "Table", listing: "Listing" } as const;
