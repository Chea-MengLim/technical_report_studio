"use client";

import { NodeViewWrapper, type ReactNodeViewProps } from "@tiptap/react";
import { REF_LABEL, useEditorEnv } from "../context";

/** "Table 3" in the PDF; the number is only known after the PDF is built. */
export function CrossRefView({ node, selected }: ReactNodeViewProps) {
  const { refTargets } = useEditorEnv();
  const target = refTargets.find((t) => t.refId === node.attrs.refId);
  const label = target ? `${REF_LABEL[target.kind]} #` : "Missing reference";
  const title = target
    ? `${REF_LABEL[target.kind]} in "${target.sectionTitle}": ${target.caption || "(no caption)"}`
    : "The figure, table or listing this pointed to was removed";
  return (
    <NodeViewWrapper
      as="span"
      className={`chip ${target ? "chip-ref" : "chip-missing"} ${selected ? "ring-2 ring-blue-400" : ""}`}
      title={title}
    >
      {label}
    </NodeViewWrapper>
  );
}
