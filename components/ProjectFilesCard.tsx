"use client";

import { ArrowUpRight, Download, FileCode2, FolderArchive } from "lucide-react";
import type { ProjectFile } from "@/lib/parseContent";
import { sanitizeFileName } from "@/lib/utils";
import { useSettings } from "./SettingsContext";
import { cn } from "@/lib/utils";

function downloadTextFile(name: string, content: string) {
  const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

async function downloadZip(files: ProjectFile[], zipName: string) {
  const JSZip = (await import("jszip")).default;
  const zip = new JSZip();
  for (const f of files) {
    zip.file(f.path, f.content);
  }
  const blob = await zip.generateAsync({ type: "blob" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = zipName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function lineCount(content: string): number {
  return content ? content.split("\n").length : 0;
}

/**
 * كارت الملفات جوا الرسالة: الضغط على أي ملف بيفتحه في لوحة الأرتيفاكت
 * (معاينة + كود)، وكل ملف له زرار تحميل لوحده، والمشروع كله zip.
 */
export default function ProjectFilesCard({
  messageId,
  files,
  onOpen,
}: {
  messageId: string;
  files: ProjectFile[];
  onOpen: (files: ProjectFile[], focusPath?: string) => void;
}) {
  const isProject = files.length >= 2;
  const { t } = useSettings();

  return (
    <div className="overflow-hidden rounded-lg border border-hair bg-surface shadow-1">
      <div className="flex items-center justify-between gap-2 border-b border-hair bg-surface-2 px-3.5 py-2.5">
        <div className="flex min-w-0 items-center gap-2 text-ink">
          {isProject ? (
            <FolderArchive size={15} className="shrink-0 text-accent" />
          ) : (
            <FileCode2 size={15} className="shrink-0 text-accent" />
          )}
          <span className="truncate text-[13px] font-medium">
            {isProject ? t("filesCardProject", { n: files.length }) : t("filesCardFile")}
          </span>
        </div>
        {isProject && (
          <button
            onClick={() => downloadZip(files, `mlag-project-${messageId.slice(0, 6)}.zip`)}
            className={cn(
              "inline-flex shrink-0 items-center gap-1.5 rounded-full border border-hair bg-surface",
              "px-2.5 py-1 text-[12px] font-medium text-ink-2 shadow-1",
              "transition-colors duration-1 hover:border-hair-2 hover:text-ink"
            )}
          >
            <Download size={12} />
            {t("filesCardDownloadAll")}
          </button>
        )}
      </div>

      <ul>
        {files.map((f) => (
          <li
            key={f.path}
            className="group flex items-center border-b border-hair last:border-b-0"
          >
            <button
              onClick={() => onOpen(files, f.path)}
              dir="ltr"
              className="flex min-w-0 flex-1 items-center gap-3 px-3.5 py-2.5 text-start transition-colors duration-1 hover:bg-surface-3"
            >
              <span className="min-w-0 flex-1 truncate font-mono text-[12.5px] text-ink-2 group-hover:text-ink">
                {f.path}
              </span>
              <span className="tnum shrink-0 text-[11px] text-ink-3">
                {lineCount(f.content)} L
              </span>
              <ArrowUpRight
                size={13}
                className="shrink-0 text-ink-3 transition-colors duration-1 group-hover:text-accent"
              />
            </button>
            <button
              onClick={() =>
                downloadTextFile(sanitizeFileName(f.path.split("/").pop() || f.path), f.content)
              }
              title={t("downloadFile")}
              aria-label={`${t("downloadFile")}: ${f.path}`}
              className="grid h-10 w-10 shrink-0 place-items-center border-s border-hair text-ink-3 transition-colors duration-1 hover:bg-surface-3 hover:text-accent"
            >
              <Download size={13} />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
