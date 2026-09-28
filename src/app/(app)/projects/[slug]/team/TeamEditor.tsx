"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, Camera, Pencil, Plus, Trash2, UserRound } from "lucide-react";
import { deletePerson, reorderPeople, savePerson } from "@/app/actions/projects";
import { assetUrl, uploadAsset } from "@/components/editor/context";
import { PhotoCropper } from "@/components/PhotoCropper";

interface PersonRow {
  id: string;
  name: string;
  role: string;
  email: string;
  photoAssetId: string | null;
}

export function TeamEditor({ projectId, people }: { projectId: string; people: PersonRow[] }) {
  const [editing, setEditing] = useState<PersonRow | "new" | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();

  const move = (i: number, d: -1 | 1) => {
    const ids = people.map((p) => p.id);
    [ids[i], ids[i + d]] = [ids[i + d], ids[i]];
    start(async () => {
      await reorderPeople(projectId, ids);
      router.refresh();
    });
  };

  return (
    <div className="mt-6 space-y-3">
      {people.map((p, i) => (
        <div key={p.id} className="card flex items-center gap-4 p-3">
          <div className="flex h-[66px] w-[54px] shrink-0 items-center justify-center overflow-hidden rounded bg-slate-100">
            {p.photoAssetId ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={assetUrl(p.photoAssetId)} alt="" className="h-full w-full object-cover" />
            ) : (
              <UserRound className="text-slate-300" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="font-medium">{p.name}</div>
            <div className="text-sm text-slate-500">
              {p.role || <em>no role</em>}
              {p.email && ` · ${p.email}`}
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button className="icon-btn" disabled={i === 0 || pending} onClick={() => move(i, -1)} title="Move up">
              <ArrowUp size={14} />
            </button>
            <button
              className="icon-btn"
              disabled={i === people.length - 1 || pending}
              onClick={() => move(i, 1)}
              title="Move down"
            >
              <ArrowDown size={14} />
            </button>
            <button className="btn ml-2" onClick={() => setEditing(p)}>
              <Pencil size={14} /> Edit
            </button>
          </div>
        </div>
      ))}
      <button className="btn" onClick={() => setEditing("new")}>
        <Plus size={15} /> Add team member
      </button>
      {editing && (
        <PersonDialog
          projectId={projectId}
          person={editing === "new" ? null : editing}
          onClose={() => {
            setEditing(null);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

function PersonDialog({
  projectId,
  person,
  onClose,
}: {
  projectId: string;
  person: PersonRow | null;
  onClose: () => void;
}) {
  const [name, setName] = useState(person?.name ?? "");
  const [role, setRole] = useState(person?.role ?? "");
  const [email, setEmail] = useState(person?.email ?? "");
  const [photo, setPhoto] = useState(person?.photoAssetId ?? null);
  const [cropFile, setCropFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const input = useRef<HTMLInputElement>(null);

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4">
      <div className="card w-full max-w-md p-6">
        <h2 className="text-lg font-semibold">{person ? "Edit team member" : "Add team member"}</h2>
        <div className="mt-4 flex gap-4">
          <button
            type="button"
            className="group relative flex h-[110px] w-[90px] shrink-0 items-center justify-center overflow-hidden rounded bg-slate-100"
            onClick={() => input.current?.click()}
            title="Upload photo"
          >
            {photo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={assetUrl(photo)} alt="" className="h-full w-full object-cover" />
            ) : (
              <UserRound size={32} className="text-slate-300" />
            )}
            <span className="absolute inset-0 flex items-center justify-center bg-black/40 text-white opacity-0 group-hover:opacity-100">
              <Camera size={20} />
            </span>
          </button>
          <div className="flex-1 space-y-3">
            <div>
              <label className="label">Name</label>
              <input className="input w-full" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div>
              <label className="label">Role</label>
              <input
                className="input w-full"
                value={role}
                placeholder="Leader / Backend"
                onChange={(e) => setRole(e.target.value)}
              />
            </div>
          </div>
        </div>
        <div className="mt-3">
          <label className="label">Email</label>
          <input className="input w-full" value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        {error && <p className="mt-3 text-sm text-red-700">{error}</p>}
        <div className="mt-6 flex items-center gap-2">
          {person && (
            <button
              className="btn btn-danger"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  await deletePerson(projectId, person.id);
                  onClose();
                })
              }
            >
              <Trash2 size={14} /> Remove
            </button>
          )}
          <button className="btn ml-auto" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn btn-primary"
            disabled={pending || !name.trim()}
            onClick={() =>
              start(async () => {
                try {
                  await savePerson(projectId, person?.id ?? null, { name, role, email, photoAssetId: photo });
                  onClose();
                } catch (e) {
                  setError(e instanceof Error ? e.message : "Could not save");
                }
              })
            }
          >
            Save
          </button>
        </div>
        <input
          ref={input}
          type="file"
          accept="image/png,image/jpeg"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (f) setCropFile(f);
          }}
        />
        {cropFile && (
          <PhotoCropper
            file={cropFile}
            onCancel={() => setCropFile(null)}
            onDone={(cropped) => {
              setCropFile(null);
              start(async () => {
                try {
                  const asset = await uploadAsset(cropped, projectId);
                  setPhoto(asset.id);
                } catch (err) {
                  setError(err instanceof Error ? err.message : "Upload failed");
                }
              });
            }}
          />
        )}
      </div>
    </div>
  );
}
