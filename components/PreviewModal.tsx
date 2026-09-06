"use client";

import { useMemo, useState } from "react";
import { Code2, MonitorPlay, RefreshCw, X } from "lucide-react";
import type { ProjectFile } from "@/lib/parseContent";
import CodeBlock from "./CodeBlock";
import { useSettings } from "./SettingsContext";

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** يلف كود JS في وسم سكربت مع تحييد أي "</script>" جوا الكود نفسه. */
function wrapScript(js: string): string {
  return `<script>\n${js.replace(/<\/script/gi, "<\\/script")}\n</script>`;
}

/** بيرجع اسم الملف الأساسي (من غير المسار) عشان مقارنة بسيطة بالـ href/src. */
function baseName(path: string): string {
  return path.split("/").pop() || path;
}

/**
 * بيشيل صياغة ES modules (import/export) من كود ملف الـ JS — عشان لما ندمج أكتر من
 * ملف في سكربت واحد عادي (كلاسيكي مش module) الكود يفضل شغال من غير أخطاء زي
 * "Cannot use import statement outside a module"، وعشان الدوال المعرّفة تفضل عامة
 * (global) فيقدر أي onclick="..." جوا الـ HTML يلاقيها لما يدوس المستخدم على الزرار.
 * ده best-effort (مش ترانسبايلر كامل) بس بيغطي الحالات الشائعة اللي الموديل بيكتبها.
 */
function stripModuleSyntax(code: string): string {
  return code
    .replace(/import\s+[\s\S]*?\s+from\s+["'][^"']+["']\s*;?/g, "")
    .replace(/import\s+["'][^"']+["']\s*;?/g, "")
    .replace(/export\s+default\s+/g, "")
    .replace(/export\s+(?=(function|class|const|let|var)\b)/g, "")
    .replace(/export\s*\{[^}]*\}\s*;?/g, "");
}

/**
 * بيدمج كل ملفات الـ JS في كتلة كود واحدة: أي ملف متعمول عليه import من ملف تاني
 * بيتحط الأول (اعتمادياته الأول)، والملف اللي بيستدعيه (المرتبط بـ <script src>
 * غالباً) بعد كده — ده كافي للحالة الشائعة (script.js بيعمل import من utils.js).
 */
function mergeJsFiles(jsFiles: ProjectFile[]): string {
  if (jsFiles.length === 0) return "";
  const importedBasenames = new Set<string>();
  for (const f of jsFiles) {
    const importRe = /import\s+[\s\S]*?["']\.{0,2}\/?([^"'/]+)["']/g;
    let m: RegExpExecArray | null;
    while ((m = importRe.exec(f.content)) !== null) importedBasenames.add(m[1]);
  }
  const ordered = [...jsFiles].sort((a, b) => {
    const aIsDep = importedBasenames.has(baseName(a.path)) ? 0 : 1;
    const bIsDep = importedBasenames.has(baseName(b.path)) ? 0 : 1;
    return aIsDep - bIsDep;
  });
  return ordered
    .map((f) => `// ---- ${f.path} ----\n${stripModuleSyntax(f.content)}`)
    .join("\n\n");
}

/** سكربت صغير بيلقط أي خطأ JS حصل جوا المعاينة (Uncaught error / promise rejection)
 * ويظهره في شريط واضح تحت الصفحة — بدل ما الزرار "يبقى ميت" من غير أي تفسير للمستخدم. */
const ERROR_OVERLAY_SCRIPT = `<script>(function(){
function showBanner(msg){try{
var old=document.getElementById('__mlag_err__');if(old)old.remove();
var el=document.createElement('div');el.id='__mlag_err__';
el.style.cssText='position:fixed;left:0;right:0;bottom:0;z-index:2147483647;background:#3b0d0d;color:#ffd7d7;font:12px/1.6 monospace;padding:8px 34px 8px 12px;direction:ltr;text-align:left;white-space:pre-wrap;max-height:35vh;overflow:auto;border-top:2px solid #ff5c5c';
el.textContent='⚠ '+msg;
var close=document.createElement('button');close.textContent='×';
close.style.cssText='position:absolute;top:2px;right:8px;background:none;border:none;color:#ffd7d7;font-size:18px;cursor:pointer;line-height:1';
close.onclick=function(){el.remove();};el.appendChild(close);
(document.body||document.documentElement).appendChild(el);
}catch(e){}}
window.addEventListener('error',function(e){showBanner((e.message||'خطأ غير معروف')+(e.filename?' — '+e.filename.split('/').pop()+':'+e.lineno:''));});
window.addEventListener('unhandledrejection',function(e){var r=e.reason;showBanner('Promise rejected: '+(r&&r.message?r.message:r));});
})();</script>`;

function injectErrorOverlay(doc: string): string {
  if (/<head[^>]*>/i.test(doc)) return doc.replace(/<head[^>]*>/i, (m) => `${m}\n${ERROR_OVERLAY_SCRIPT}`);
  return `${ERROR_OVERLAY_SCRIPT}\n${doc}`;
}

/**
 * بيجمع ملفات المشروع في مستند HTML واحد يشتغل في المعاينة.
 *
 * ملاحظة مهمة: كل أكواد الـ JS (سواء مرتبطة بوسم <script src="..."> أو لأ) بتتجمع
 * في كتلة واحدة وبتتحط قبل </body> مباشرة — مش مكانها الأصلي جوا الـ head. ده مقصود:
 * لو الملف الأصلي فيه <script src="script.js" defer></script> أو
 * <script type="module" src="app.js"></script> جوا الـ head، وإحنا بدّلنا الوسم
 * بمحتواه الخام في نفس المكان، الكود كان بيتنفذ فوراً وهو لسه في الـ head — قبل ما
 * الـ body يتبني خالص — فأي document.getElementById أو addEventListener بيرجع
 * null/بيفشل بصمت، وده أكتر سبب شائع لظاهرة "الأزرار مش شغالة" في المعاينة القديمة.
 * دلوقتي الكود بيتأجل لحد ما الصفحة كلها تتبني (زي defer الحقيقي)، وفي نفس الوقت
 * بيفضل سكربت عادي (كلاسيكي) مش IIFE ملفوف — عشان الدوال تفضل عامة وأي onclick=""
 * جوا الـ HTML يلاقيها.
 */
export function buildPreviewDoc(files: ProjectFile[]): string {
  const cssFiles = files.filter((f) => /\.css$/i.test(f.path));
  const jsFiles = files.filter((f) => /\.m?js$/i.test(f.path));
  const htmlFile =
    files.find((f) => /index\.html?$/i.test(f.path)) ||
    files.find((f) => /\.html?$/i.test(f.path));

  const jsBlockContent = mergeJsFiles(jsFiles);
  const jsBlock = jsBlockContent.trim() ? wrapScript(jsBlockContent) : "";

  if (!htmlFile) {
    const css = cssFiles.map((f) => `<style>\n${f.content}\n</style>`).join("\n");
    return injectErrorOverlay(`<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8" />${css}</head>
<body style="font-family:sans-serif;background:#ffffff;color:#111111;padding:24px">
<div id="app" style="border:2px dashed #cccccc;border-radius:12px;padding:32px;text-align:center;color:#888888">
معاينة الكود بتاعك — لو عندك صفحة HTML اطلبها و هتتعرض هنا تلقائياً
</div>
${jsBlock}
</body></html>`);
  }

  let doc = htmlFile.content;
  const usedCss = new Set<string>();

  // ادخل ملفات CSS مكان وسم <link href="style.css"> (ترتيب الـ CSS مش بيسبب مشاكل
  // وظيفية زي الـ JS، فبتفضل في مكانها زي ما هي).
  for (const f of cssFiles) {
    const base = escapeRegex(baseName(f.path));
    const re = new RegExp(`<link[^>]*href=["'][^"']*${base}["'][^>]*>`, "i");
    if (re.test(doc)) {
      doc = doc.replace(re, () => `<style>\n${f.content}\n</style>`);
      usedCss.add(f.path);
    }
  }

  // شيل أي وسم <script src="..."> بتاع ملفات الـ JS بتاعتنا (زوجي أو مقفول لوحده،
  // وسواء عليه defer/async/type="module" أو لأ) — كوده هيتحط مجمّع قبل </body>.
  for (const f of jsFiles) {
    const base = escapeRegex(baseName(f.path));
    const pairedRe = new RegExp(`<script\\b[^>]*\\bsrc=["'][^"']*${base}["'][^>]*>\\s*<\\/script\\s*>`, "gi");
    const selfClosingRe = new RegExp(`<script\\b[^>]*\\bsrc=["'][^"']*${base}["'][^>]*\\/>`, "gi");
    doc = doc.replace(pairedRe, "").replace(selfClosingRe, "");
  }

  // أي ملفات CSS متبقية (مش مرتبطة بوسم <link>) — حطها في الـ head.
  const leftoverCss = cssFiles
    .filter((f) => !usedCss.has(f.path))
    .map((f) => `<style>\n${f.content}\n</style>`)
    .join("\n");
  if (leftoverCss) {
    if (/<\/head>/i.test(doc)) doc = doc.replace(/<\/head>/i, () => `${leftoverCss}\n</head>`);
    else if (/<\/body>/i.test(doc)) doc = doc.replace(/<\/body>/i, () => `${leftoverCss}\n</body>`);
    else doc = `${leftoverCss}\n${doc}`;
  }

  // كل أكواد الـ JS مجمعة في كتلة واحدة قبل </body> (أو آخر المستند لو مفيش </body>).
  if (jsBlock) {
    if (/<\/body>/i.test(doc)) doc = doc.replace(/<\/body>/i, () => `${jsBlock}\n</body>`);
    else doc = `${doc}\n${jsBlock}`;
  }

  return injectErrorOverlay(doc);
}

export default function PreviewModal({
  files,
  onClose,
}: {
  files: ProjectFile[];
  onClose: () => void;
}) {
  const { t } = useSettings();
  const [runKey, setRunKey] = useState(0);
  const [viewingFile, setViewingFile] = useState<string | null>(null);
  const doc = useMemo(() => buildPreviewDoc(files), [files]);

  return (
    <div className="animate-fadeIn fixed inset-0 z-[60] flex flex-col bg-bg">
      <div className="terminal-dots flex items-center justify-between border-b border-line bg-panel px-3 py-2.5">
        <div className="flex items-center gap-2">
          <span className="flex gap-1">
            <span className="h-2 w-2 rounded-full bg-rose/70" />
            <span className="h-2 w-2 rounded-full bg-amber/70" />
            <span className="h-2 w-2 rounded-full bg-green/70" />
          </span>
          <span className="mono text-[11px] text-txt3">
            {files.length === 1 ? t("previewFilesOne") : t("previewFiles", { n: files.length })}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => {
              setRunKey((k) => k + 1);
              setViewingFile(null);
            }}
            className="rounded-md p-1.5 text-txt2 hover:bg-white/5 hover:text-green"
            title={t("previewRerun")}
          >
            <RefreshCw size={16} />
          </button>
          <button onClick={onClose} className="text-txt3 hover:text-txt">
            <X size={18} />
          </button>
        </div>
      </div>

      <div className="flex items-center overflow-x-auto whitespace-nowrap border-b border-line bg-panel2">
        <button
          onClick={() => setViewingFile(null)}
          className={`flex shrink-0 items-center gap-1.5 px-4 py-2 text-[12px] ${
            viewingFile === null ? "border-b-2 border-green text-green" : "text-txt3 hover:text-txt2"
          }`}
        >
          <MonitorPlay size={13} /> {t("previewTab")}
        </button>
        {files.map((f) => (
          <button
            key={f.path}
            onClick={() => setViewingFile(f.path)}
            className={`mono flex shrink-0 items-center gap-1.5 px-3 py-2 text-[11px] ${
              viewingFile === f.path
                ? "border-b-2 border-green text-green"
                : "text-txt3 hover:text-txt2"
            }`}
            dir="ltr"
          >
            <Code2 size={12} /> {f.path}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-hidden">
        {viewingFile === null ? (
          <iframe
            key={runKey}
            title="preview"
            srcDoc={doc}
            sandbox="allow-scripts allow-forms allow-modals allow-popups"
            className="h-full w-full bg-white"
          />
        ) : (
          <div className="h-full overflow-y-auto p-2">
            <CodeBlock
              language={viewingFile.split(".").pop() || "text"}
              code={files.find((f) => f.path === viewingFile)?.content || ""}
            />
          </div>
        )}
      </div>
    </div>
  );
}
