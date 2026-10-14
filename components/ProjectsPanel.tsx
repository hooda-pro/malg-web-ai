"use client";

import { useCallback, useEffect, useState } from "react";
import { Button, Field, Dialog, Panel } from "./ui/Controls";

interface Project {
  id: string;
  name: string;
  instructions: string;
  sessionCount?: number;
}

interface ProjectFile {
  id: string;
  path: string;
  lang: string;
  content: string;
}

export default function ProjectsPanel({ sessionId }: { sessionId: string | null }) {
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedId, setSelectedId] = useState<string>("");
  const [instructions, setInstructions] = useState("");
  const [files, setFiles] = useState<ProjectFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [showRename, setShowRename] = useState(false);
  const [renameValue, setRenameValue] = useState("");
  const [showFileDialog, setShowFileDialog] = useState(false);
  const [editPath, setEditPath] = useState("");
  const [editLang, setEditLang] = useState("");
  const [editContent, setEditContent] = useState("");
  const [attached, setAttached] = useState<boolean | null>(null);

  const selected = projects.find((p) => p.id === selectedId) ?? null;

  const loadProjects = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch("/api/projects", { cache: "no-store" });
      const j = await r.json().catch(() => null);
      if (!r.ok) throw new Error(j?.error || "تعذّر تحميل المشاريع");
      setProjects(j.projects ?? []);
      setSelectedId((prev) => prev || (j.projects ?? [])[0]?.id || "");
    } catch (e: any) {
      setError(e?.message || "تعذّر تحميل المشاريع");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadFiles = useCallback(async (projectId: string) => {
    try {
      const r = await fetch(`/api/projects/${projectId}/files`, { cache: "no-store" });
      const j = await r.json().catch(() => null);
      if (!r.ok) throw new Error(j?.error || "تعذّر تحميل الملفات");
      setFiles(j.files ?? []);
    } catch (e: any) {
      setError(e?.message || "تعذّر تحميل الملفات");
    }
  }, []);

  useEffect(() => {
    loadProjects();
  }, [loadProjects]);

  useEffect(() => {
    if (!selectedId) {
      setFiles([]);
      setInstructions("");
      return;
    }
    const p = projects.find((x) => x.id === selectedId);
    setInstructions(p?.instructions ?? "");
    loadFiles(selectedId);
  }, [selectedId, projects, loadFiles]);

  async function handleCreate() {
    const name = newName.trim();
    if (!name || name.length > 60) {
      setError("اسم المشروع مطلوب (حتى 60 حرفًا)");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const r = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const j = await r.json().catch(() => null);
      if (!r.ok) throw new Error(j?.error || "تعذّر إنشاء المشروع");
      setProjects((prev) => [j.project, ...prev]);
      setSelectedId(j.project.id);
      setNewName("");
      setShowCreate(false);
    } catch (e: any) {
      setError(e?.message || "تعذّر إنشاء المشروع");
    } finally {
      setSaving(false);
    }
  }

  async function handleRename() {
    const name = renameValue.trim();
    if (!name || name.length > 60 || !selectedId) {
      setError("الاسم حتى 60 حرفًا وغير فارغ");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const r = await fetch(`/api/projects/${selectedId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const j = await r.json().catch(() => null);
      if (!r.ok) throw new Error(j?.error || "تعذّر إعادة التسمية");
      setProjects((prev) => prev.map((p) => (p.id === selectedId ? j.project : p)));
      setShowRename(false);
    } catch (e: any) {
      setError(e?.message || "تعذّر إعادة التسمية");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!selectedId || !selected) return;
    if (!window.confirm(`حذف المشروع "${selected.name}" وكل ملفاته؟`)) return;
    setSaving(true);
    setError(null);
    try {
      const r = await fetch(`/api/projects/${selectedId}`, { method: "DELETE" });
      const j = await r.json().catch(() => null);
      if (!r.ok) throw new Error(j?.error || "تعذّر الحذف");
      setProjects((prev) => prev.filter((p) => p.id !== selectedId));
      setSelectedId("");
      setFiles([]);
      setInstructions("");
    } catch (e: any) {
      setError(e?.message || "تعذّر الحذف");
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveInstructions() {
    if (!selectedId) return;
    if (instructions.length > 2000) {
      setError("التعليمات حتى 2000 حرف");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const r = await fetch(`/api/projects/${selectedId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ instructions }),
      });
      const j = await r.json().catch(() => null);
      if (!r.ok) throw new Error(j?.error || "تعذّر الحفظ");
      setProjects((prev) => prev.map((p) => (p.id === selectedId ? j.project : p)));
    } catch (e: any) {
      setError(e?.message || "تعذّر الحفظ");
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveFiles(next: ProjectFile[]) {
    if (!selectedId) return;
    if (next.length > 20) {
      setError("الحد الأقصى 20 ملفًا");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const r = await fetch(`/api/projects/${selectedId}/files`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          files: next.map((f) => ({ path: f.path, lang: f.lang, content: f.content })),
        }),
      });
      const j = await r.json().catch(() => null);
      if (!r.ok) throw new Error(j?.error || "تعذّر حفظ الملفات");
      setFiles(j.files ?? []);
    } catch (e: any) {
      setError(e?.message || "تعذّر حفظ الملفات");
    } finally {
      setSaving(false);
    }
  }

  function openNewFile() {
    setEditPath("");
    setEditLang("");
    setEditContent("");
    setShowFileDialog(true);
  }

  function openEditFile(f: ProjectFile) {
    setEditPath(f.path);
    setEditLang(f.lang);
    setEditContent(f.content);
    setShowFileDialog(true);
  }

  function handleFileDialogSave() {
    const path = editPath.trim();
    if (!path || path.length > 120) {
      setError("مسار الملف مطلوب (حتى 120 حرفًا)");
      return;
    }
    if (editLang.length > 20) {
      setError("اللغة حتى 20 حرفًا");
      return;
    }
    if (editContent.length > 12000) {
      setError("محتوى الملف حتى 12000 حرف");
      return;
    }
    const next = [...files.filter((f) => f.path !== path), { id: path, path, lang: editLang, content: editContent }];
    setShowFileDialog(false);
    handleSaveFiles(next);
  }

  function handleDeleteFile(path: string) {
    handleSaveFiles(files.filter((f) => f.path !== path));
  }

  async function handleAttach() {
    if (!selectedId || !sessionId) return;
    setSaving(true);
    setError(null);
    try {
      const r = await fetch(`/api/projects/${selectedId}/attach`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId }),
      });
      const j = await r.json().catch(() => null);
      if (!r.ok) throw new Error(j?.error || "تعذّر الربط");
      setAttached(true);
      loadProjects();
    } catch (e: any) {
      setError(e?.message || "تعذّر الربط");
    } finally {
      setSaving(false);
    }
  }

  async function handleDetach() {
    if (!selectedId) return;
    setSaving(true);
    setError(null);
    try {
      const r = await fetch(`/api/projects/${selectedId}/attach`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: null }),
      });
      const j = await r.json().catch(() => null);
      if (!r.ok) throw new Error(j?.error || "تعذّر الفك");
      setAttached(false);
      loadProjects();
    } catch (e: any) {
      setError(e?.message || "تعذّر الفك");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-xl border border-hair bg-surface p-4 text-ink">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="text-[15px] font-semibold">المشاريع</h3>
        <Button size="sm" variant="secondary" onClick={() => setShowCreate(true)}>
          مشروع جديد
        </Button>
      </div>

      {loading && <p className="text-[13px] text-ink-2">جارٍ التحميل…</p>}
      {error && <p className="mb-2 text-[13px] text-danger">{error}</p>}

      {!loading && projects.length === 0 && (
        <p className="text-[13px] text-ink-2">لا توجد مشاريع بعد — أنشئ مشروعًا لتنظيم ملفاتك وتعليماتك.</p>
      )}

      {projects.length > 0 && (
        <div className="mb-3">
          <label className="mb-1.5 block text-[12.5px] font-medium text-ink-2">المشروع الحالي</label>
          <select
            value={selectedId}
            onChange={(e) => setSelectedId(e.target.value)}
            className="h-11 w-full rounded-md border border-hair bg-surface-2 px-3.5 text-[14.5px] text-ink focus:border-accent focus:outline-none"
          >
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
                {typeof p.sessionCount === "number" ? ` (${p.sessionCount})` : ""}
              </option>
            ))}
          </select>
          {selected && (
            <div className="mt-2 flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="secondary"
                onClick={() => {
                  setRenameValue(selected.name);
                  setShowRename(true);
                }}
              >
                إعادة تسمية
              </Button>
              <Button size="sm" variant="danger" onClick={handleDelete} disabled={saving}>
                حذف
              </Button>
            </div>
          )}
        </div>
      )}

      {selected && (
        <>
          <div className="mb-3">
            <label className="mb-1.5 block text-[12.5px] font-medium text-ink-2">
              تعليمات المشروع ({instructions.length}/2000)
            </label>
            <textarea
              value={instructions}
              onChange={(e) => setInstructions(e.target.value.slice(0, 2000))}
              rows={3}
              placeholder="مثال: هذا مشروع متجر إلكتروني بـ Next.js — رد باختصار…"
              className="w-full rounded-md border border-hair bg-surface-2 px-3.5 py-2.5 text-[14px] text-ink placeholder:text-ink-3 focus:border-accent focus:outline-none"
            />
            <div className="mt-2">
              <Button size="sm" variant="primary" onClick={handleSaveInstructions} disabled={saving}>
                حفظ التعليمات
              </Button>
            </div>
          </div>

          <Panel className="mb-3">
            <div className="flex items-center justify-between px-4 py-3">
              <span className="text-[13px] font-medium">الملفات ({files.length}/20)</span>
              <Button size="sm" variant="ghost" onClick={openNewFile}>
                + ملف
              </Button>
            </div>
            {files.map((f) => (
              <div
                key={f.path}
                className="flex items-center justify-between gap-2 border-t border-hair px-4 py-2.5"
              >
                <span className="min-w-0 truncate text-[13px]" dir="ltr">
                  {f.path}
                  <span className="ms-2 text-ink-3">
                    {f.lang} • {f.content.length} حرف
                  </span>
                </span>
                <span className="flex shrink-0 gap-1">
                  <Button size="sm" variant="ghost" onClick={() => openEditFile(f)}>
                    تعديل
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => handleDeleteFile(f.path)}>
                    حذف
                  </Button>
                </span>
              </div>
            ))}
            {files.length === 0 && (
              <p className="border-t border-hair px-4 py-3 text-[12.5px] text-ink-3">
                لا توجد ملفات — أضف ملفات سياق (حتى 12000 حرف/ملف).
              </p>
            )}
          </Panel>

          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="secondary" onClick={handleAttach} disabled={saving || !sessionId}>
              ربط بالمحادثة الحالية
            </Button>
            <Button size="sm" variant="ghost" onClick={handleDetach} disabled={saving}>
              فك الربط
            </Button>
          </div>
          {!sessionId && (
            <p className="mt-1 text-[12px] text-ink-3">افتح محادثة لربطها بهذا المشروع.</p>
          )}
          {attached === true && <p className="mt-1 text-[12px] text-ink-2">تم ربط المحادثة بالمشروع.</p>}
          {attached === false && <p className="mt-1 text-[12px] text-ink-2">تم فك الربط.</p>}
        </>
      )}

      <Dialog
        open={showCreate}
        onClose={() => setShowCreate(false)}
        title="مشروع جديد"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setShowCreate(false)}>
              إلغاء
            </Button>
            <Button variant="primary" onClick={handleCreate} disabled={saving}>
              إنشاء
            </Button>
          </div>
        }
      >
        <Field
          label="اسم المشروع (حتى 60 حرفًا)"
          value={newName}
          onChange={(e) => setNewName(e.target.value.slice(0, 60))}
          placeholder="مثال: متجر إلكتروني"
          data-autofocus
        />
      </Dialog>

      <Dialog
        open={showRename}
        onClose={() => setShowRename(false)}
        title="إعادة تسمية المشروع"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setShowRename(false)}>
              إلغاء
            </Button>
            <Button variant="primary" onClick={handleRename} disabled={saving}>
              حفظ
            </Button>
          </div>
        }
      >
        <Field
          label="الاسم الجديد"
          value={renameValue}
          onChange={(e) => setRenameValue(e.target.value.slice(0, 60))}
          data-autofocus
        />
      </Dialog>

      <Dialog
        open={showFileDialog}
        onClose={() => setShowFileDialog(false)}
        title="ملف مشروع"
        size="md"
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setShowFileDialog(false)}>
              إلغاء
            </Button>
            <Button variant="primary" onClick={handleFileDialogSave} disabled={saving}>
              حفظ الملف
            </Button>
          </div>
        }
      >
        <div className="flex flex-col gap-3">
          <Field
            label="المسار (حتى 120 حرفًا)"
            value={editPath}
            onChange={(e) => setEditPath(e.target.value.slice(0, 120))}
            placeholder="مثال: app/page.tsx"
            dir="ltr"
            data-autofocus
          />
          <Field
            label="اللغة (حتى 20 حرفًا)"
            value={editLang}
            onChange={(e) => setEditLang(e.target.value.slice(0, 20))}
            placeholder="مثال: tsx"
            dir="ltr"
          />
          <label className="block">
            <span className="mb-1.5 block text-[12.5px] font-medium text-ink-2">
              المحتوى ({editContent.length}/12000)
            </span>
            <textarea
              value={editContent}
              onChange={(e) => setEditContent(e.target.value.slice(0, 12000))}
              rows={10}
              dir="ltr"
              className="w-full rounded-md border border-hair bg-surface-2 px-3.5 py-2.5 font-mono text-[13px] text-ink placeholder:text-ink-3 focus:border-accent focus:outline-none"
            />
          </label>
        </div>
      </Dialog>
    </div>
  );
}
