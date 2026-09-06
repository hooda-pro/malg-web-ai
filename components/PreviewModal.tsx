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
/**
 * بيئة تشغيل حقيقية للمعاينة: shim بيتحقن قبل أي سكريبت بتاع المشروع عشان
 * الأزرار والفورمات والسكريبتات تشتغل صح جوا الـ iframe المعزول:
 * - localStorage/sessionStorage في الذاكرة لو التخزين محظور (أشهر سبب لموت الأزرار)
 * - fetch بيخدم ملفات المشروع كنظام ملفات وهمي (fetch("data.json") يشتغل)
 * - الروابط الداخلية بين صفحات المشروع بتتبعت للأب عشان يبدّل الصفحة في المعاينة
 */
function buildPreviewShim(files: ProjectFile[], entry: string): string {
  const fs: Record<string, string> = {};
  for (const f of files) {
    if (/\.(html?|css|m?js|json|txt|csv|xml|svg)$/i.test(f.path)) {
      fs[f.path] = f.content;
      const base = f.path.split("/").pop() || f.path;
      fs[base] = f.content;
    }
  }
  const fsJson = JSON.stringify(fs).replace(/</g, "\\u003c");
  const entryJson = JSON.stringify(entry);
  return `<script>(function(){
var FS=${fsJson};
var ENTRY=${entryJson};
try{window.localStorage.getItem("__mlag");}catch(e){
  var mem={};
  var mk=function(){return{getItem:function(k){return Object.prototype.hasOwnProperty.call(mem,k)?mem[k]:null;},setItem:function(k,v){mem[k]=String(v);},removeItem:function(k){delete mem[k];},clear:function(){mem={};},key:function(i){var ks=Object.keys(mem);return i<ks.length?ks[i]:null;},get length(){return Object.keys(mem).length;}};};
  try{Object.defineProperty(window,"localStorage",{value:mk(),configurable:true});}catch(e2){}
  try{Object.defineProperty(window,"sessionStorage",{value:mk(),configurable:true});}catch(e3){}
}
var _fetch=window.fetch?window.fetch.bind(window):null;
window.fetch=function(input,init){
  try{
    var url=typeof input==="string"?input:(input&&input.url)||"";
    var clean=String(url).split("?")[0].split("#")[0].replace(/^\\.?\\//,"");
    if(Object.prototype.hasOwnProperty.call(FS,clean)){
      return Promise.resolve(new Response(FS[clean],{status:200,headers:{"Content-Type":/\\.json$/i.test(clean)?"application/json":"text/plain; charset=utf-8"}}));
    }
  }catch(e){}
  return _fetch?_fetch(input,init):Promise.reject(new Error("preview: offline"));
};
document.addEventListener("click",function(e){
  var el=e.target;
  while(el&&el.nodeType===1&&el.tagName!=="A")el=el.parentNode;
  if(!el||el.nodeType!==1)return;
  var href=el.getAttribute("href")||"";
  if(!href||href.charAt(0)==="#"||/^(https?:|mailto:|tel:|javascript:)/i.test(href))return;
  e.preventDefault();
  try{if(window.parent!==window)window.parent.postMessage({type:"mlag-navigate",href:href,entry:ENTRY},"*");}catch(err){}
},true);
document.addEventListener("submit",function(e){
  var act=(e.target&&e.target.getAttribute&&e.target.getAttribute("action"))||"";
  if(act&&act.charAt(0)!=="#"&&!/^(https?:|mailto:|javascript:)/i.test(act)){
    e.preventDefault();
    try{if(window.parent!==window)window.parent.postMessage({type:"mlag-navigate",href:act,entry:ENTRY},"*");}catch(err){}
  }
},true);
})();</script>`;
}

/**
 * بيجمع ملفات المشروع في مستند HTML واحد يشتغل في المعاينة:
 * بيدخل ملفات CSS و JS جوا الصفحة المطلوبة تلقائياً — زي ما المتصفح كان هيعمل بالظبط.
 * entryPath بيحدد أنهي صفحة HTML هي اللي بتتععرض (عشان التنقل بين صفحات المشروع).
 */
export function buildPreviewDoc(files: ProjectFile[], entryPath?: string): string {
  const entryFile =
    (entryPath && files.find((f) => f.path === entryPath && /\.html?$/i.test(f.path))) ||
    files.find((f) => /index\.html?$/i.test(f.path)) ||
    files.find((f) => /\.html?$/i.test(f.path));

  const cssFiles = files.filter((f) => /\.css$/i.test(f.path));
  const jsFiles = files.filter((f) => /\.m?js$/i.test(f.path));

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
  // ادخل ملفات JS مكان وسم <script src="script.js"></script>
  for (const f of jsFiles) {
    const base = escapeRegex(f.path.split("/").pop() || f.path);
    const re = new RegExp(`<script[^>]*src=["'][^"']*${base}["'][^>]*>\\s*</script>`, "i");
    if (re.test(doc)) {
      doc = doc.replace(re, () => wrapScript(f.content));
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