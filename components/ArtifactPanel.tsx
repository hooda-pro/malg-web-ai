"use client";

import { useEffect, useMemo, useState } from "react";
import { Code2, Maximize2, Minimize2, MonitorPlay, RefreshCw, X } from "lucide-react";
import type { ProjectFile } from "@/lib/parseContent";
import { buildPreviewDoc } from "./PreviewModal";
import CodeBlock from "./CodeBlock";
import { useSettings } from "./SettingsContext";

const PREVIEWABLE_EXTS = new Set(["html", "htm", "css", "js"]);

/**
 * لوحة الأرتيفاكت الجانبية — زي Claude Artifacts بالظبط:
 * شاشة بتتفتح جنب الشات فيها تاب «معاينة» حي (iframe) وتاب «كود» بقايمة الملفات،
 * مع زر ملء شاشة. على الموبايل بتاخد الشاشة كلها overlay.
 */
export default function ArtifactPanel({
  files,
  onClose,
}: {
  files: ProjectFile[];
  onClose: () => void;
}) {
  const { t } = useSettings();
  const [fullscreen, setFullscreen] = useState(false);
  const [runKey, setRunKey] = useState(0);
  const hasWeb = useMemo(
    () => files.some((f) => PREVIEWABLE_EXTS.has((f.path.split(".").pop() || "").toLowerCase())),
    [files]
  );
  const [tab, setTab] = useState<"preview" | "code">(hasWeb ? "preview" : "code");
  const [activePath, setActivePath] = useState<string>(files[0]?.path ?? "");

  // لما الملفات تتحدث (مثلاً أثناء البث) — ثبّت الملف المفتوح أو ارجع لأول ملف
  useEffect(() => {
    setActivePath((p) => (files.some((f) => f.path === p) ? p : files[0]?.path ?? ""));
  }, [files]);

  const doc = useMemo(() => buildPreviewDoc(files), [files]);
  const activeFile = files.find((f) => f.path === activePath) ?? files[0];
  const title = files.length === 1 ? files[0].path : t("previewFiles", { n: files.length });

  return (
    <div
      className={`animate-fadeIn flex flex-col bg-panel ${
        fullscreen
          ? "fixed inset-0 z-[80]"
          : "fixed inset-0 z-[70] lg:static lg:z-auto lg:min-w-[430px] lg:w-[45%] lg:border-s lg:border-line"
      }`}
    >
      {/* شريط العنوان */}
      <div className="terminal-dots flex items-center justify-between border-b border-line bg-panel px-3 py-2.5">
        <div className="flex min-w-0 items-center gap-2">
          <span className="flex shrink-0 gap-1">
            <span className="h-2 w-2 rounded-full bg-rose/70" />
            <span className="h-2 w-2 rounded-full bg-amber/70" />
            <span className="h-2 w-2 rounded-full bg-green/70" />
          </span>
          <span className="mono truncate text-[11px] text-txt3">{title}</span>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {tab === "preview" && hasWeb && (
            <button
              onClick={() => setRunKey((k) => k + 1)}
              className="rounded-md p-1.5 text-txt2 hover:bg-white/5 hover:text-green"
              title={t("previewRerun")}
            >
              <RefreshCw size={15} />
            </button>
          )}
          <button
            onClick={() => setFullscreen((f) => !f)}
            className="rounded-md p-1.5 text-txt2 hover:bg-white/5 hover:text-green"
            title={fullscreen ? t("artifactExitFullscreen") : t("artifactFullscreen")}
          >
            {fullscreen ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
          </button>
          <button
            onClick={onClose}
            className="text-txt3 hover:text-txt"
            title={t("artifactClose")}
          >
            <X size={17} />
          </button>
        </div>
      </div>

      {/* تابات المعاينة / الكود */}
      <div className="flex border-b border-line bg-panel2">
        <button
          onClick={() => setTab("preview")}
          disabled={!hasWeb}
          className={`flex items-center gap-1.5 px-4 py-2 text-[12px] ${
            tab === "preview"
              ? "border-b-2 border-green text-green"
              : "text-txt3 hover:text-txt2 disabled:opacity-40"
          }`}
        >
          <MonitorPlay size={13} /> {t("previewTab")}
        </button>
        <button
          onClick={() => setTab("code")}
          className={`flex items-center gap-1.5 px-4 py-2 text-[12px] ${
            tab === "code"
              ? "border-b-2 border-green text-green"
              : "text-txt3 hover:text-txt2"
          }`}
        >
          <Code2 size={13} /> {t("runnerTabCode")}
        </button>
      </div>

      {/* المحتوى */}
      <div className="min-h-0 flex-1 overflow-hidden">
        {tab === "preview" && hasWeb ? (
          <iframe
            key={runKey}
            title="artifact-preview"
            srcDoc={doc}
            sandbox="allow-scripts allow-forms allow-modals allow-popups"
            className="h-full w-full bg-white"
          />
        ) : (
          <div className="flex h-full min-h-0">
            {/* قايمة الملفات — لو أكتر من ملف */}
            {files.length > 1 && (
              <div className="w-44 shrink-0 overflow-y-auto border-e border-line2 bg-panel2 p-1.5">
                {files.map((f) => (
                  <button
                    key={f.path}
                    onClick={() => setActivePath(f.path)}
                    dir="ltr"
                    className={`mono block w-full truncate rounded px-2 py-1.5 text-start text-[11px] ${
                      f.path === activeFile?.path
                        ? "bg-cyan/10 text-cyan"
                        : "text-txt2 hover:bg-white/[0.03] hover:text-txt"
                    }`}
                  >
                    {f.path}
                  </button>
                ))}
              </div>
            )}
            <div className="min-w-0 flex-1 overflow-y-auto p-2">
              {activeFile && (
                <CodeBlock
                  language={activeFile.path.split(".").pop() || "text"}
                  code={activeFile.content}
                />
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
