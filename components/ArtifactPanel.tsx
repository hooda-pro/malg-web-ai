"use client";

import { useMemo, useState } from "react";
import { Download, Maximize2, Minimize2, MonitorPlay, RefreshCw, X } from "lucide-react";
import type { ProjectFile } from "@/lib/parseContent";
import { sanitizeFileName } from "@/lib/utils";
import { useSettings } from "./SettingsContext";

const PREVIEWABLE_EXTS = new Set(["html", "htm", "css", "js"]);

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

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** يلف كود JS في وسم سكربت مع تحييد أي "</script>" جوا الكود نفسه. */
function wrapScript(js: string): string {
  return `<script>\n${js.replace(/<\/script/gi, "<\\/script")}\n</script>`;
}

/**
 * بيجمع ملفات المشروع في مستند HTML واحد يشتغل في المعاينة:
 * بيدخل ملفات CSS و JS جوا صفحة الـ index تلقائياً — زي ما المتصفح كان هيعمل بالظبط.
 * ده بيضمن إن الأزرار والتفاعل يشتغلوا صح، لأن المعاينة دايمًا بتشغل المشروع كله
 * مع بعضه، مش كل ملف لوحده.
 */
export function buildPreviewDoc(files: ProjectFile[]): string {
  const cssFiles = files.filter((f) => /\.css$/i.test(f.path));
  const jsFiles = files.filter((f) => /\.m?js$/i.test(f.path));
  const htmlFile =
    files.find((f) => /index\.html?$/i.test(f.path)) ||
    files.find((f) => /\.html?$/i.test(f.path));

  if (!htmlFile) {
    const css = cssFiles.map((f) => `<style>\n${f.content}\n</style>`).join("\n");
    const js = jsFiles.map((f) => wrapScript(f.content)).join("\n");
    return `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8" />${css}</head>
<body style="font-family:sans-serif;background:#ffffff;color:#111111;padding:24px">
<div id="app" style="border:2px dashed #cccccc;border-radius:12px;padding:32px;text-align:center;color:#888888">
معاينة الكود بتاعك — لو عندك صفحة HTML اطلبها و هتتعرض هنا تلقائياً
</div>
${js}
</body></html>`;
  }

  let doc = htmlFile.content;
  const used = new Set<string>([htmlFile.path]);

  // ادخل ملفات CSS مكان وسم <link href="style.css">
  for (const f of cssFiles) {
    const base = escapeRegex(f.path.split("/").pop() || f.path);
    const re = new RegExp(`<link[^>]*href=["'][^"']*${base}["'][^>]*>`, "i");
    if (re.test(doc)) {
      doc = doc.replace(re, () => `<style>\n${f.content}\n</style>`);
      used.add(f.path);
    }
  }
  // ادخل ملفات JS مكان وسم <script src="script.js"></script> (بشكليها: مقفول أو self-closing)
  for (const f of jsFiles) {
    const base = escapeRegex(f.path.split("/").pop() || f.path);
    const closedRe = new RegExp(`<script[^>]*src=["'][^"']*${base}["'][^>]*>\\s*</script>`, "i");
    const selfClosingRe = new RegExp(`<script[^>]*src=["'][^"']*${base}["'][^>]*/>`, "i");
    if (closedRe.test(doc)) {
      doc = doc.replace(closedRe, () => wrapScript(f.content));
      used.add(f.path);
    } else if (selfClosingRe.test(doc)) {
      doc = doc.replace(selfClosingRe, () => wrapScript(f.content));
      used.add(f.path);
    }
  }

  // أي ملفات متبقية (مش مرتبطة بوسوم) — حطها في الـ head أو الـ body
  const leftover =
    cssFiles
      .filter((f) => !used.has(f.path))
      .map((f) => `<style>\n${f.content}\n</style>`)
      .join("\n") +
    jsFiles
      .filter((f) => !used.has(f.path))
      .map((f) => wrapScript(f.content))
      .join("\n");

  if (leftover) {
    if (/<\/head>/i.test(doc)) doc = doc.replace(/<\/head>/i, () => `${leftover}\n</head>`);
    else if (/<\/body>/i.test(doc)) doc = doc.replace(/<\/body>/i, () => `${leftover}\n</body>`);
    else doc = `${leftover}\n${doc}`;
  }

  return doc;
}

/**
 * لوحة المعاينة الجانبية — شاشة معاينة حيّة فقط، من غير أي تاب "كود".
 * الكود نفسه بيتقدّم للمستخدم كملف قابل للتحميل بس (في ProjectFilesCard جوا الرسالة)،
 * مش بيتعرض هنا أبدًا.
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

  const doc = useMemo(() => buildPreviewDoc(files), [files]);
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
          <MonitorPlay size={13} className="shrink-0 text-cyan" />
          <span className="mono truncate text-[11px] text-txt3">{title}</span>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {hasWeb && (
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

      {/* المحتوى — معاينة حيّة فقط، من غير أي تاب كود */}
      <div className="min-h-0 flex-1 overflow-hidden">
        {hasWeb ? (
          <iframe
            key={runKey}
            title="artifact-preview"
            srcDoc={doc}
            sandbox="allow-scripts allow-forms allow-modals allow-popups"
            className="h-full w-full bg-white"
          />
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center">
            <p className="text-[12.5px] text-txt3">{t("noPreviewAvailable")}</p>
            <div className="flex w-full max-w-xs flex-col gap-1.5">
              {files.map((f) => (
                <button
                  key={f.path}
                  onClick={() =>
                    downloadTextFile(sanitizeFileName(f.path.split("/").pop() || f.path), f.content)
                  }
                  className="mono flex items-center justify-between gap-2 rounded-md border border-line2 bg-panel2 px-3 py-2 text-[11.5px] text-txt2 hover:border-green/50 hover:text-green"
                  dir="ltr"
                >
                  <span className="truncate">{f.path}</span>
                  <Download size={13} className="shrink-0" />
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
