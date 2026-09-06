"use client";

import { Download, FileCode2, FolderArchive } from "lucide-react";
import type { ProjectFile } from "@/lib/parseContent";
import { sanitizeFileName } from "@/lib/utils";
import { useSettings } from "./SettingsContext";

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

/**
 * كارت الملفات جوا الرسالة — بيقدّم كل ملف باسمه وزر تحميل بس، من غير أي عرض للكود الخام.
 * الكود عمره ما يتفتح أو يتعرض هنا؛ لو المستخدم عايز يشوفه شغال يستخدم زر «معاينة».
 */
export default function ProjectFilesCard({
  messageId,
  files,
}: {
  messageId: string;
  files: ProjectFile[];
  onRunCode?: (code: string, language: string) => void;
}) {
  const isProject = files.length >= 2;
  const { t } = useSettings();

  return (
    <div className="rounded-md border border-line2 bg-panel2 overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 border-b border-line2">
        <div className="flex items-center gap-2 text-txt">
          {isProject ? <FolderArchive size={14} className="text-cyan" /> : <FileCode2 size={14} className="text-cyan" />}
          <span className="mono text-xs">
            {isProject ? t("filesCardProject", { n: files.length }) : t("filesCardFile")}
          </span>
        </div>
        {isProject && (
          <button
            onClick={() => downloadZip(files, `mlag-project-${messageId.slice(0, 6)}.zip`)}
            className="flex items-center gap-1 rounded bg-green/10 px-2 py-1 text-[11px] text-green hover:bg-green/20"
          >
            <Download size={12} /> {t("filesCardDownloadAll")}
          </button>
        )}
      </div>

      <div className="divide-y divide-line2">
        {files.map((f) => (
          <button
            key={f.path}
            onClick={() => downloadTextFile(sanitizeFileName(f.path.split("/").pop() || f.path), f.content)}
            className="flex w-full items-center justify-between px-3 py-2 text-right hover:bg-white/[0.02]"
          >
            <span className="mono text-[12px] text-txt2 truncate" dir="ltr">
              {f.path}
            </span>
            <span className="flex shrink-0 items-center gap-1 rounded px-1.5 py-0.5 text-[10px] text-txt3 hover:text-green hover:bg-green/10">
              <Download size={12} />
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
