"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { FileImage, GripVertical, Home, Library, Lock, Plus, Trash2, Users } from "lucide-react";
import { createSection, deleteSection, reorderSections } from "@/app/actions/sections";

type Kind = "FRONT" | "BODY" | "APPENDIX";
interface Item {
  id: string;
  title: string;
  kind: Kind;
  lockedBy: string | null;
}

const GROUPS: { kind: Kind; label: string; numbered: boolean }[] = [
  { kind: "FRONT", label: "Front matter", numbered: false },
  { kind: "BODY", label: "Chapters", numbered: true },
  { kind: "APPENDIX", label: "Appendices", numbered: true },
];

const ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII", "XIII", "XIV", "XV", "XVI", "XVII", "XVIII", "XIX", "XX"];

export function ProjectSidebar({
  project,
  sections,
  hasReferences,
}: {
  project: { id: string; slug: string; name: string };
  sections: Item[];
  hasReferences: boolean;
}) {
  const [items, setItems] = useState(sections);
  // Take the server list again after a refresh (e.g. a section was renamed).
  const [prevSections, setPrevSections] = useState(sections);
  if (sections !== prevSections) {
    setPrevSections(sections);
    setItems(sections);
  }
  const pathname = usePathname();
  const router = useRouter();
  const [, startTransition] = useTransition();
  const base = `/projects/${project.slug}`;
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function onDragEnd(kind: Kind, e: DragEndEvent) {
    if (!e.over || e.active.id === e.over.id) return;
    const group = items.filter((i) => i.kind === kind);
    const from = group.findIndex((i) => i.id === e.active.id);
    const to = group.findIndex((i) => i.id === e.over!.id);
    const moved = arrayMove(group, from, to);
    const next = GROUPS.flatMap((g) => (g.kind === kind ? moved : items.filter((i) => i.kind === g.kind)));
    setItems(next);
    startTransition(() => reorderSections(project.id, next.map((i) => ({ id: i.id, kind: i.kind }))));
  }

  async function add(kind: Kind) {
    const id = await createSection(project.id, kind, kind === "APPENDIX" ? "New appendix" : "New section");
    router.push(`${base}/sections/${id}`);
  }

  // Numbers as printed in the PDF: chapters I, II ... then References, then appendices.
  const bodyCount = items.filter((i) => i.kind === "BODY").length;
  const number = (item: Item) => {
    if (item.kind === "FRONT") return "";
    const idx = items.filter((i) => i.kind === item.kind).findIndex((i) => i.id === item.id);
    return ROMAN[item.kind === "BODY" ? idx : bodyCount + (hasReferences ? 1 : 0) + idx] ?? "";
  };

  const nav = (href: string, icon: React.ReactNode, label: string) => (
    <Link
      href={href}
      className={`flex items-center gap-2 rounded px-2 py-1.5 text-sm ${
        pathname === href ? "bg-blue-50 font-medium text-blue-800" : "text-slate-700 hover:bg-slate-100"
      }`}
    >
      {icon}
      {label}
    </Link>
  );

  return (
    <aside className="flex w-64 shrink-0 flex-col overflow-y-auto border-r border-slate-200 bg-white">
      <div className="border-b border-slate-200 px-4 py-3">
        <div className="text-xs uppercase tracking-wide text-slate-400">Project</div>
        <div className="truncate font-semibold">{project.name}</div>
      </div>
      <nav className="space-y-0.5 p-2">
        {nav(base, <Home size={15} />, "Overview & PDF")}
        {nav(`${base}/cover`, <FileImage size={15} />, "Cover page")}
        {nav(`${base}/team`, <Users size={15} />, "Team members")}
      </nav>

      {GROUPS.map((g) => {
        const group = items.filter((i) => i.kind === g.kind);
        return (
          <div key={g.kind} className="px-2 pb-3">
            <div className="flex items-center justify-between px-2 pt-2 pb-1">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">{g.label}</span>
              <button className="icon-btn text-slate-500" title={`Add to ${g.label.toLowerCase()}`} onClick={() => add(g.kind)}>
                <Plus size={14} />
              </button>
            </div>
            <DndContext id={`sections-${g.kind}`} sensors={sensors} collisionDetection={closestCenter} onDragEnd={(e) => onDragEnd(g.kind, e)}>
              <SortableContext items={group.map((i) => i.id)} strategy={verticalListSortingStrategy}>
                {group.map((item) => (
                  <SectionRow
                    key={item.id}
                    item={item}
                    number={number(item)}
                    href={`${base}/sections/${item.id}`}
                    active={pathname.startsWith(`${base}/sections/${item.id}`)}
                    onDeleted={() => {
                      setItems((all) => all.filter((i) => i.id !== item.id));
                      if (pathname.startsWith(`${base}/sections/${item.id}`)) router.push(base);
                    }}
                  />
                ))}
              </SortableContext>
            </DndContext>
            {g.kind === "BODY" && (
              // Printed after the last chapter and before the appendices, like in the PDF.
              <Link
                href={`${base}/references`}
                className={`mt-0.5 flex items-center gap-1.5 rounded py-1.5 pr-1 pl-6 text-sm ${
                  pathname === `${base}/references` ? "bg-blue-50 font-medium text-blue-800" : "text-slate-700 hover:bg-slate-100"
                }`}
              >
                <span className="w-7 shrink-0 text-xs text-slate-400">{hasReferences ? ROMAN[bodyCount] : ""}</span>
                <span className="truncate">References</span>
                <Library size={13} className="ml-auto shrink-0 text-slate-400" />
              </Link>
            )}
          </div>
        );
      })}
    </aside>
  );
}

function SectionRow({
  item,
  number,
  href,
  active,
  onDeleted,
}: {
  item: Item;
  number: string;
  href: string;
  active: boolean;
  onDeleted: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id });
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`group flex items-center gap-1 rounded pr-1 ${isDragging ? "z-10 bg-white shadow" : ""} ${
        active ? "bg-blue-50" : "hover:bg-slate-100"
      }`}
    >
      <button className="cursor-grab px-1 text-slate-300 hover:text-slate-500" title="Drag to reorder" {...attributes} {...listeners}>
        <GripVertical size={14} />
      </button>
      <Link href={href} className={`flex min-w-0 flex-1 items-center gap-1.5 py-1.5 text-sm ${active ? "font-medium text-blue-800" : "text-slate-700"}`}>
        {number && <span className="w-7 shrink-0 text-xs text-slate-400">{number}</span>}
        <span className="truncate" title={error ?? item.title}>{item.title}</span>
        {item.lockedBy && (
          <span title={`${item.lockedBy} is editing`} className="shrink-0 text-amber-600">
            <Lock size={12} />
          </span>
        )}
      </Link>
      {confirm ? (
        <span className="flex items-center gap-1 text-xs">
          <button
            className="rounded bg-red-600 px-1.5 py-0.5 text-white"
            onClick={async () => {
              try {
                await deleteSection(item.id);
                onDeleted();
              } catch (e) {
                setError(e instanceof Error ? e.message : "Could not delete");
              }
              setConfirm(false);
            }}
          >
            Delete
          </button>
          <button className="px-1 text-slate-500" onClick={() => setConfirm(false)}>
            Keep
          </button>
        </span>
      ) : (
        <button className="icon-btn hidden text-slate-400 group-hover:inline-flex" title="Delete section" onClick={() => setConfirm(true)}>
          <Trash2 size={13} />
        </button>
      )}
    </div>
  );
}
