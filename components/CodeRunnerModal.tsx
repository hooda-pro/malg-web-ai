"use client";

import { useMemo, useState } from "react";
import { Code2, Play, RefreshCw, X } from "lucide-react";
import { useSettings } from "./SettingsContext";

const DEMO_HTML = `<!doctype html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="utf-8" />
  <style>
    body { font-family: sans-serif; background:#0b0f0e; color:#e7f3ee; display:flex; align-items:center; justify-content:center; height:100vh; margin:0; }
    .card { text-align:center; }
    button { background:#00ff9d22; border:1px solid #00ff9d; color:#00ff9d; padding:8px 16px; border-radius:6px; cursor:pointer; font-size:14px; }
  </style>
</head>
<body>
  <div class="card">
    <h2>أهلاً من mlag AI 👋</h2>
    <p>ده مثال حي شغال جوه بيئة التشغيل</p>
    <button onclick="document.querySelector('p').innerText='دستني بتشتغل صح 🎉'">دوس هنا</button>
  </div>
</body>
</html>`;

function buildSrcDoc(code: string, language: string): string {
  const lang = language.toLowerCase();
  if (lang === "html" || lang === "htm") return code;
  if (lang === "css") {
    return `<!doctype html><html dir="rtl"><head><style>${code}</style></head>
    <body style="font-family:sans-serif;padding:24px;background:#0b0f0e;color:#e7f3ee">
      <h1>عنوان تجريبي</h1>
      <p>فقرة نصية عشان تشوف تأثير الـ CSS بتاعك عليها.</p>
      <button>زرار تجريبي</button>
      <div style="width:120px;height:80px;background:#222;margin-top:12px;">صندوق</div>
    </body></html>`;
  }
  // js / javascript
  return `<!doctype html><html dir="rtl"><head><style>
    body{font-family:monospace;background:#0b0f0e;color:#e7f3ee;padding:16px;font-size:13px;white-space:pre-wrap}
  </style></head><body><div id="out"></div><script>
    const out = document.getElementById('out');
    const log = (...a) => { out.innerText += a.map(x => typeof x === 'object' ? JSON.stringify(x) : x).join(' ') + '\\n'; };
    console.log = log; console.error = log; console.warn = log;
    try {
      ${code}
    } catch (e) { log('خطأ: ' + e.message); }
  </script></body></html>`;
}

export default function CodeRunnerModal({
  onClose,
  initialCode,
  initialLanguage,
}: {
  onClose: () => void;
  initialCode?: string;
  initialLanguage?: string;
}) {
  const { t } = useSettings();
  const [code, setCode] = useState(initialCode ?? DEMO_HTML);
  const [language, setLanguage] = useState(initialLanguage ?? "html");
  const [runKey, setRunKey] = useState(0);
  const [tab, setTab] = useState<"code" | "preview">(initialCode ? "preview" : "preview");

  const supported = ["html", "htm", "css", "js", "javascript"].includes(language.toLowerCase());
  const srcDoc = useMemo(() => buildSrcDoc(code, language), [code, language, runKey]);

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-bg">
      <div className="terminal-dots flex items-center justify-between border-b border-line bg-panel px-3 py-2.5">
        <div className="flex items-center gap-2">
          <span className="flex gap-1">
            <span className="h-2 w-2 rounded-full bg-rose/70" />
            <span className="h-2 w-2 rounded-full bg-amber/70" />
            <span className="h-2 w-2 rounded-full bg-green/70" />
          </span>
          <span className="mono text-[11px] text-txt3">runner — {language}</span>
        </div>
        <button onClick={onClose} className="text-txt3 hover:text-txt">
          <X size={18} />
        </button>
      </div>

      <div className="flex border-b border-line bg-panel2">
        <button
          onClick={() => setTab("code")}
          className={`flex items-center gap-1.5 px-4 py-2 text-[12px] ${
            tab === "code" ? "border-b-2 border-green text-green" : "text-txt3"
          }`}
        >
          <Code2 size={13} /> {t("runnerTabCode")}
        </button>
        <button
          onClick={() => setTab("preview")}
          className={`flex items-center gap-1.5 px-4 py-2 text-[12px] ${
            tab === "preview" ? "border-b-2 border-green text-green" : "text-txt3"
          }`}
        >
          <Play size={13} /> {t("runnerTabPreview")}
        </button>
        <div className="ms-auto flex items-center gap-2 px-3">
          <select
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
            className="mono rounded border border-line2 bg-panel px-1.5 py-0.5 text-[11px] text-txt2"
          >
            <option value="html">html</option>
            <option value="css">css</option>
            <option value="js">javascript</option>
          </select>
          <button
            onClick={() => {
              setRunKey((k) => k + 1);
              setTab("preview");
            }}
            className="flex items-center gap-1 rounded bg-green/15 px-2 py-1 text-[11px] text-green hover:bg-green/25"
          >
            <RefreshCw size={11} /> {t("runnerRun")}
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-hidden">
        {tab === "code" ? (
          <textarea
            value={code}
            onChange={(e) => setCode(e.target.value)}
            dir="ltr"
            spellCheck={false}
            className="mono h-full w-full resize-none bg-[#040504] p-3 text-base leading-6 text-txt focus:outline-none sm:text-[12.5px]"
          />
        ) : supported ? (
          <iframe
            key={runKey}
            title="preview"
            srcDoc={srcDoc}
            sandbox="allow-scripts"
            className="h-full w-full bg-white"
          />
        ) : (
          <div className="flex h-full items-center justify-center px-6 text-center text-[12.5px] text-txt3">
            {t("runnerUnsupported", { lang: language })}
          </div>
        )}
      </div>
    </div>
  );
}
