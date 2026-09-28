"use client";

import { NodeViewWrapper, type ReactNodeViewProps } from "@tiptap/react";
import { useEditorEnv } from "../context";

/** The project name, printed in bold everywhere (\projname). */
export function ProjectNameView({ selected }: ReactNodeViewProps) {
  const { projectName } = useEditorEnv();
  return (
    <NodeViewWrapper
      as="span"
      className={`chip chip-name ${selected ? "ring-2 ring-blue-400" : ""}`}
      title="Project name: printed in bold, updates if the project is renamed"
    >
      {projectName || "Project"}
    </NodeViewWrapper>
  );
}
