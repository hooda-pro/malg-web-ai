"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Check,
  Code2,
  Copy,
  Download,
  ExternalLink,
  Eye,
  Maximize2,
  Minimize2,
  RefreshCw,
  X,
} from "lucide-react";
import type { ProjectFile } from "@/lib/parseContent";
import { sanitizeFileName } from "@/lib/utils";
import { highlightCode } from "@/lib/highlight";
import { IconButton, Segmented } from "./ui/Controls";
import { useSettings } from "./SettingsContext";
import { cn } from "@/lib/utils";

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

/** يفتح المعاينة في تاب جديد من نفس الـ HTML المجمّع. */
function openInNewTab(doc: string) {
  const blob = new Blob([doc], { type: "text/html" });
  const url = URL.createObjectURL(blob);
  window.open(url, "_blank", "noopener");
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

type Tab = "preview" | "code";

/**
 * لوحة الأرتيفاكت — زي Claude Artifacts: تاب «معاينة» حيّة وتاب «كود» فيه
 * قايمة الملفات مع تظليل الكود ونسخ وتحميل. أثناء البث بتتحدث لحظة بلحظة.
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
  const [tab, setTab] = useState<Tab>(focusPath || !hasWeb ? "code" : "preview");
  const [activePath, setActivePath] = useState<string>(focusPath || files[0]?.path || "");

  useEffect(() => {
    if (focusPath) {
      setActivePath(focusPath);
      setTab("code");
    }
  }, [focusPath]);

  useEffect(() => {
    setActivePath((p) => (files.some((f) => f.path === p) ? p : files[0]?.path || ""));
  }, [files]);

  useEffect(() => {
    if (!hasWeb) setTab("code");
  }, [hasWeb]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && fullscreen) setFullscreen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [fullscreen]);

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
    <section
      aria-label={title}
      className={cn(
        "animate-fade flex flex-col bg-surface",
        fullscreen
          ? "fixed inset-0 z-modal"
          : "fixed inset-0 z-overlay lg:static lg:z-auto lg:w-[46%] lg:min-w-[440px] lg:border-s lg:border-hair"
      )}
    >
      <div className="flex h-14 shrink-0 items-center justify-between gap-2 border-b border-hair px-3 sm:px-4">
        <div className="flex min-w-0 items-center gap-2.5">
          <Segmented<Tab>
            size="sm"
            value={tab}
            onChange={(v) => (v === "preview" && !hasWeb ? null : setTab(v))}
            options={[
              {
                value: "preview",
                title: t("previewTab"),
                label: (
                  <span className={cn("inline-flex items-center gap-1.5", !hasWeb && "opacity-40")}>
                    <Eye size={13} />
                    <span className="hidden sm:inline">{t("previewTab")}</span>
                  </span>
                ),
              },
              {
                value: "code",
                title: t("codeTab"),
                label: (
                  <span className="inline-flex items-center gap-1.5">
                    <Code2 size={13} />
                    <span className="hidden sm:inline">{t("codeTab")}</span>
                  </span>
                ),
              },
            ]}
          />
          <span dir="ltr" className="hidden min-w-0 truncate font-mono text-[12px] text-ink-3 md:inline">
            {title}
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-0.5">
          {tab === "code" ? (
            <IconButton label={copied ? t("copied") : t("copy")} onClick={handleCopy} size="sm">
              {copied ? <Check size={15} className="text-live" /> : <Copy size={15} />}
            </IconButton>
          ) : (
            hasWeb && (
              <>
                <IconButton label={t("previewRerun")} onClick={() => setRunKey((k) => k + 1)} size="sm">
                  <RefreshCw size={15} />
                </IconButton>
                <IconButton label={t("openInNewTab")} onClick={() => openInNewTab(doc)} size="sm">
                  <ExternalLink size={15} />
                </IconButton>
              </>
            )
          )}
          <IconButton
            label={fullscreen ? t("artifactExitFullscreen") : t("artifactFullscreen")}
            onClick={() => setFullscreen((f) => !f)}
            size="sm"
          >
            {fullscreen ? <Minimize2 size={15} /> : <Maximize2 size={15} />}
          </IconButton>
          <span className="mx-1 h-4 w-px bg-hair-2" aria-hidden="true" />
          <IconButton label={t("artifactClose")} onClick={onClose} size="sm">
            <X size={16} />
          </IconButton>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-hidden">
        {tab === "preview" && hasWeb ? (
          <div className="h-full bg-surface-2 p-3">
            <div className="h-full overflow-hidden rounded-md border border-hair bg-canvas shadow-1">
              <iframe
                key={runKey}
                title="artifact-preview"
                srcDoc={doc}
                sandbox="allow-scripts allow-forms allow-modals allow-popups"
                className="h-full w-full"
              />
            </div>
          </div>
        ) : (
          <div className="flex h-full min-h-0 flex-col sm:flex-row" dir="ltr">
            {files.length > 1 && (
              <nav
                aria-label={t("previewFiles", { n: files.length })}
                className="flex shrink-0 gap-1 overflow-x-auto border-b border-hair bg-surface-2 p-2 sm:w-48 sm:flex-col sm:overflow-y-auto sm:border-b-0 sm:border-e"
              >
                {files.map((f) => (
                  <button
                    key={f.path}
                    onClick={() => setActivePath(f.path)}
                    aria-current={f.path === activeFile?.path}
                    className={cn(
                      "shrink-0 truncate rounded-xs px-2.5 py-1.5 text-start font-mono text-[12px] transition-colors duration-1",
                      f.path === activeFile?.path
                        ? "bg-surface text-ink shadow-1"
                        : "text-ink-2 hover:bg-surface-3 hover:text-ink"
                    )}
                  >
                    {f.path}
                  </button>
                ))}
              </nav>
            )}
            <div className="code-surface flex min-h-0 min-w-0 flex-1 flex-col">
              {activeFile && (
                <>
                  <div className="flex shrink-0 items-center justify-between gap-2 border-b border-hair px-4 py-2">
                    <span className="truncate font-mono text-[12px] text-ink-3">{activeFile.path}</span>
                    <button
                      onClick={() =>
                        downloadTextFile(
                          sanitizeFileName(activeFile.path.split("/").pop() || activeFile.path),
                          activeFile.content
                        )
                      }
                      className="inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-medium text-ink-2 transition-colors duration-1 hover:bg-surface-3 hover:text-ink"
                    >
                      <Download size={12} />
                      {t("downloadFile")}
                    </button>
                  </div>
                  <pre className="min-h-0 flex-1 overflow-auto px-4 py-3 font-mono text-[12.5px] leading-[1.7]">
                    <code dangerouslySetInnerHTML={{ __html: highlighted }} />
                  </pre>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
