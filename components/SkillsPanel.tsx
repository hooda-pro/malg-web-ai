"use client";

/**
 * إدارة المهارات المحلية (Skills) — تاب جوه الإعدادات.
 *
 * الخصوصية في التصميم نفسه:
 * - كل حاجة بتتخزن في IndexedDB على جهاز المستخدم (مفيش أي endpoint للـSkills
 *   على السيرفر خالص — افتح app/api وستلاقيهاش).
 * - شكل الاستيراد المعروف لعالم Agent Skills: SKILL.md واحد، أو أرشيف zip فيه
 *   SKILL.md (+ سكربتات/مراجع)، أو مجلد كامل.
 */

import { useCallback, useEffect, useRef, useState, type InputHTMLAttributes } from "react";
import { ChevronDown, Download, Puzzle, Trash2, Upload } from "lucide-react";
import { Button, Panel, Switch } from "./ui/Controls";
import {
  deleteSkillRecord,
  exportSkillZip,
  importSkill,
  listSkills,
  setSkillEnabled,
  type ImportResult,
} from "@/lib/skillsClient";
import { formatSkillSize, skillTotalChars, type SkillRecord } from "@/lib/skills";

function folderAttrs(): InputHTMLAttributes<HTMLInputElement> {
  return { webkitdirectory: "true", directory: "true" } as unknown as InputHTMLAttributes<HTMLInputElement>;
}

export default function SkillsPanel() {
  const [skills, setSkills] = useState<SkillRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);

  const refresh = useCallback(async () => {
    try {
      setSkills(await listSkills());
    } catch {
      setSkills([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function doImport(files: FileList | null) {
    if (!files || files.length === 0) return;
    setBusy(true);
    setError(null);
    setNote(null);
    const res: ImportResult = await importSkill(Array.from(files));
    if (!res.ok) setError(res.error || "فشل الاستيراد");
    else {
      setNote(`تم استيراد «${res.name}» ومشتغلة فعلاً${res.note ? " — " + res.note : ""}`);
      await refresh();
    }
    setBusy(false);
  }

  async function toggle(s: SkillRecord, enabled: boolean) {
    setSkills((prev) => prev.map((x) => (x.id === s.id ? { ...x, enabled } : x)));
    try {
      await setSkillEnabled(s.id, enabled);
    } catch {
      void refresh();
    }
  }

  async function remove(s: SkillRecord) {
    setSkills((prev) => prev.filter((x) => x.id !== s.id));
    if (expandedId === s.id) setExpandedId(null);
    try {
      await deleteSkillRecord(s.id);
    } catch {
      void refresh();
    }
  }

  const enabledCount = skills.filter((x) => x.enabled).length;

  return (
    <div className="rounded-xl border border-hair bg-surface p-4 text-ink">
      <h3 className="mb-1 flex items-center gap-2 text-[15px] font-semibold">
        <Puzzle className="h-4 w-4" /> مهاراتك (Skills)
      </h3>
      <p className="mb-3 text-pretty text-[12.5px] leading-5 text-ink-2">
        تعليمات وطرق شغل جاهزة — الاسم والوصف بيتوصلك للمساعد، ولما مهارة فعلاً تخص رسالتك
        بيقولك بأنه قرأها واستخدمها.

        كلها محفوظة على جهازك في المتصفح فقط (IndexedDB)، ما بترتبط بأي أرشيف بعيد
        وبترسل مع كل رسالة من عندك بنفس نطاق المرفقات.
      </p>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept=".md,.markdown,.zip,.skill,.txt"
          className="hidden"
          onChange={(e) => {
            void doImport(e.target.files);
            e.target.value = "";
          }}
        />
        <input
          ref={folderInputRef}
          type="file"
          multiple
          className="hidden"
          {...folderAttrs()}
          onChange={(e) => {
            void doImport(e.target.files);
            e.target.value = "";
          }}
        />
        <Button size="sm" variant="primary" onClick={() => fileInputRef.current?.click()} disabled={busy}>
          <Upload className="h-3.5 w-3.5" /> استيراد SKILL.md / zip
        </Button>
        <Button size="sm" variant="ghost" onClick={() => folderInputRef.current?.click()} disabled={busy}>
          <Upload className="h-3.5 w-3.5" /> استيراد مجلد
        </Button>
        {busy && <span className="text-[12.5px] text-ink-3">جارٍ الاستيراد…</span>}
      </div>

      {error && <p className="mb-2 text-[13px] leading-5 text-danger">{error}</p>}
      {note && <p className="mb-2 text-[13px] leading-5 text-accent">{note}</p>}

      <p className="mb-2 text-[11.5px] text-ink-3">
        {loading
          ? "جارٍ التحميل…"
          : `${enabledCount} مهارة فعّالة من ${skills.length} — أقصى 8 بتشتغل في كل رسالة.`}
      </p>

      <Panel>
        {skills.map((s) => {
          const expanded = expandedId === s.id;
          return (
            <div key={s.id} className="[&:not(:first-child)]:border-t [&:not(:first-child)]:border-hair">
              <div className="flex items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="text-[13.5px] font-medium leading-6" dir="auto">
                    {s.name}
                  </p>
                  <p className="text-[12px] leading-5 text-ink-3" dir="auto">
                    {s.description || "(بدون وصف — حدده في الـ frontmatter)"}
                  </p>
                  <p className="mt-0.5 text-[11px] text-ink-3">
                    {formatSkillSize(skillTotalChars(s))} · {s.files.length} ملف إضافي ·{" "}
                    {new Date(s.importedAt).toLocaleDateString("ar-EG")}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <button
                    type="button"
                    className="text-ink-3 transition-colors hover:text-ink"
                    onClick={() => setExpandedId(expanded ? null : s.id)}
                    aria-label="عرض تفاصيل المهارة"
                  >
                    <ChevronDown
                      className={`h-4 w-4 transition-transform duration-2 ${expanded ? "rotate-180" : ""}`}
                    />
                  </button>
                  <Switch checked={s.enabled} onChange={(v) => toggle(s, v)} label={`تفعيل ${s.name}`} />
                  <button
                    type="button"
                    className="transition-colors text-ink-3 hover:text-ink"
                    onClick={() => void exportSkillZip(s)}
                    aria-label="تصدير المهارة كـ zip"
                  >
                    <Download className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    className="transition-colors text-ink-3 hover:text-danger"
                    onClick={() => void remove(s)}
                    aria-label={`حذف ${s.name}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
              {expanded && (
                <div className="border-t border-hair bg-surface-2 px-4 py-3">
                  <p className="mb-2 text-[11.5px] font-medium text-ink-2">محتوى SKILL.md:</p>
                  <pre
                    className="max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-surface px-3 py-2.5 text-[11.5px] leading-5 text-ink"
                    dir="auto"
                  >
                    {s.body}
                  </pre>
                  {s.files.length > 0 && (
                    <>
                      <p className="mb-1 mt-3 text-[11.5px] font-medium text-ink-2">
                        ملفات إضافية (بيقراها المساعد عند الحاجة):
                      </p>
                      <ul className="space-y-0.5">
                        {s.files.map((f) => (
                          <li key={f.path} className="text-[12px] text-ink-3" dir="auto">
                            {f.path} <span className="text-ink-3">({formatSkillSize(f.content.length)})</span>
                          </li>
                        ))}
                      </ul>
                    </>
                  )}
                </div>
              )}
            </div>
          );
        })}
        {skills.length === 0 && !loading && (
          <p className="px-4 py-6 text-center text-[12.5px] leading-6 text-ink-3">
            مفيش مهارات مستوردة بعد.
            <br />
            نزّل أي مهارة جاهزة من الإنترنت (SKILL.md أو zip)، أو اكتب واحدة بنفسك واستوردها هنا.
          </p>
        )}
      </Panel>

      <p className="mt-3 text-[11.5px] leading-5 text-ink-3">
        حدود المهارة: حتى 40 ملف نصي، وحتى 60 ألف حرف للملف الواحد. الملفات الثنائية
        (صور، خطوط، أرشيفات...) بتترفض بنظرة.
      </p>
    </div>
  );
}
