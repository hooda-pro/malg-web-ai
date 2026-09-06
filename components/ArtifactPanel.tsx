"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Check,
  Code2,
  Copy,
  Download,
  Eye,
  Maximize2,
  Minimize2,
  RefreshCw,
  X,
} from "lucide-react";
import type { ProjectFile } from "@/lib/parseContent";
import { sanitizeFileName } from "@/lib/utils";
import { highlightCode } from "@/lib/highlight";
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
 * لوحة الأرتيفاكت الجانبية — زي Claude Artifacts بالظبط:
 * تابين فوق الشمال (عين = معاينة، أقواس كود = كود)، وفوق اليمين زرار نسخ وزرار
 * تحديث وزرار ملء شاشة. تاب الكود بيوضح الملف باسمه مع تظليل الكود وزرار نسخ.
 */
export default function ArtifactPanel({
  files,
  focusPath,
  onClose,
}: {
  files: ProjectFile[];
  focusPath?: string;
  onClose: () => void;
}) {
  const { t } = useSettings();
  const [fullscreen, setFullscreen] = useState(false);
  const [runKey, setRunKey] = useState(0);
  const [copied, setCopied] = useState(false);
  const hasWeb = useMemo(
    () => files.some((f) => PREVIEWABLE_EXTS.has((f.path.split(".").pop() || "").toLowerCase())),
    [files]
  );
  const [tab, setTab] = useState<"preview" | "code">(hasWeb ? "preview" : "code");
  const [activePath, setActivePath] = useState<string>(focusPath || files[0]?.path || "");

  // لما الملفات تتحدث (مثلاً أثناء البث) — ثبّت الملف المفتوح أو ارجع لأول ملف
  useEffect(() => {
    setActivePath((p) => (files.some((f) => f.path === p) ? p : focusPath || files[0]?.path || ""));
  }, [files, focusPath]);

  const doc = useMemo(() => buildPreviewDoc(files), [files]);
  const activeFile = files.find((f) => f.path === activePath) ?? files[0];
  const title = files.length === 1 ? files[0].path : t("previewFiles", { n: files.length });
  const highlighted = useMemo(
    () => (activeFile ? highlightCode(activeFile.content) : ""),
    [activeFile]
  );

  const handleCopy = async () => {
    if (!activeFile) return;
    try {
      await navigator.clipboard.writeText(activeFile.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // تجاهل لو الحافظة مش متاحة
    }
  };

  return (
    <div
      className={`animate-fadeIn flex flex-col bg-panel ${
        fullscreen
          ? "fixed inset-0 z-[80]"
          : "fixed inset-0 z-[70] lg:static lg:z-auto lg:min-w-[430px] lg:w-[45%] lg:border-s lg:border-line"
      }`}
    >
      {/* شريط العنوان — زي Claude: تابات المعاينة/الكود على الشمال، والأزرار على اليمين */}
      <div className="terminal-dots flex items-center justify-between gap-2 border-b border-line bg-panel px-2.5 py-2">
        <div className="flex shrink-0 items-center gap-2">
          <span className="hidden gap-1 sm:flex">
            <span className="h-2 w-2 rounded-full bg-rose/70" />
            <span className="h-2 w-2 rounded-full bg-amber/70" />
            <span className="h-2 w-2 rounded-full bg-green/70" />
          </span>
          <div className="flex items-center gap-1 rounded-lg bg-panel2 p-0.5">
            <button
              onClick={() => hasWeb && setTab("preview")}
              disabled={!hasWeb}
              title={t("previewTab")}
              className={`flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[12px] transition-colors ${
                tab === "preview"
                  ? "bg-panel text-cyan shadow-sm"
                  : "text-txt3 hover:text-txt2 disabled:opacity-30"
              }`}
            >
              <Eye size={13} /> <span className="hidden sm:inline">{t("previewTab")}</span>
            </button>
            <button
              onClick={() => setTab("code")}
              title={t("runnerTabCode")}
              className={`flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[12px] transition-colors ${
                tab === "code" ? "bg-panel text-cyan shadow-sm" : "text-txt3 hover:text-txt2"
              }`}
            >
              <Code2 size={13} /> <span className="hidden sm:inline">{t("runnerTabCode")}</span>
            </button>
          </div>
        </div>

        <div className="flex min-w-0 flex-1 items-center justify-center px-1">
          <span className="mono truncate text-[11px] text-txt3">{title}</span>
        </div>

        <div className="flex shrink-0 items-center gap-0.5">
          <button
            onClick={handleCopy}
            className="rounded-md p-1.5 text-txt2 hover:bg-white/5 hover:text-green"
            title={copied ? t("copied") : t("copy")}
          >
            {copied ? <Check size={15} className="text-green" /> : <Copy size={15} />}
          </button>
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
          <span className="mx-0.5 h-4 w-px bg-line2" />
          <button
            onClick={onClose}
            className="rounded-md p-1.5 text-txt3 hover:bg-white/5 hover:text-txt"
            title={t("artifactClose")}
          >
            <X size={16} />
          </button>
        </div>
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
            <div className="min-w-0 flex-1 overflow-y-auto">
              {activeFile && (
                <>
                  <div className="flex items-center justify-between border-b border-line2 bg-panel2 px-3 py-1.5">
                    <span className="mono text-[11px] text-txt3" dir="ltr">
                      {activeFile.path}
                    </span>
                    <button
                      onClick={() =>
                        downloadTextFile(
                          sanitizeFileName(activeFile.path.split("/").pop() || activeFile.path),
                          activeFile.content
                        )
                      }
                      className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] text-txt3 hover:text-green hover:bg-green/10"
                      title={t("filesCardDownloadAll")}
                    >
                      <Download size={12} />
                    </button>
                  </div>
                  <pre className="mono overflow-x-auto p-3 text-[12.5px] leading-[1.6] text-txt" dir="ltr">
                    <code dangerouslySetInnerHTML={{ __html: highlighted }} />
                  </pre>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
