"use client";

import { useMemo, useState } from "react";
import { Code2, RefreshCw, X } from "lucide-react";
import { Button, IconButton, Segmented } from "./ui/Controls";
import { useSettings } from "./SettingsContext";

const DEMO_HTML = `<!doctype html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="utf-8" />
  <style>
    body { font-family: sans-serif; background:#f5f5f7; color:#1d1d1f; display:flex; align-items:center; justify-content:center; height:100vh; margin:0; }
    .card { text-align:center; }
    button { background:#0071e3; border:0; color:#fff; padding:10px 18px; border-radius:999px; cursor:pointer; font-size:14px; }
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
    <body style="font-family:sans-serif;padding:24px;background:#f5f5f7;color:#1d1d1f">
      <h1>عنوان تجريبي</h1>
      <p>فقرة نصية عشان تشوف تأثير الـ CSS بتاعك عليها.</p>
      <button>زرار تجريبي</button>
      <div style="width:120px;height:80px;background:#d2d2d7;margin-top:12px;border-radius:8px">صندوق</div>
    </body></html>`;
  }
  // js / javascript
  return `<!doctype html><html dir="rtl"><head><style>
    body{font-family:monospace;background:#f5f5f7;color:#1d1d1f;padding:16px;font-size:13px;white-space:pre-wrap}
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
  const [tab, setTab] = useState<"code" | "preview">("preview");

  const supported = ["html", "htm", "css", "js", "javascript"].includes(language.toLowerCase());
  const srcDoc = useMemo(() => buildSrcDoc(code, language), [code, language, runKey]);

  return (
    <div className="fixed inset-0 z-modal flex flex-col bg-ground">
      <div className="glass flex h-14 shrink-0 items-center justify-between gap-3 border-b border-hair px-3 sm:px-5">
        <div className="flex items-center gap-2">
          <span className="grid h-7 w-7 place-items-center rounded-[9px] bg-accent-soft text-accent">
            <Code2 size={14} />
          </span>
          <span className="text-[14px] font-semibold tracking-title text-ink">{t("runnerTitle")}</span>
        </div>
        <IconButton label="Close" onClick={onClose} size="sm">
          <X size={17} />
        </IconButton>
      </div>

      <div className="flex flex-wrap items-center gap-2 border-b border-hair bg-surface px-3 py-2 sm:px-5">
        <Segmented
          value={tab}
          onChange={setTab}
          size="sm"
          options={[
            { value: "code", label: t("runnerTabCode") },
            { value: "preview", label: t("runnerTabPreview") },
          ]}
        />

        <div className="ms-auto flex items-center gap-2">
          <select
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
            aria-label={t("runnerLanguage")}
            className="h-8 rounded-full border border-hair bg-surface-2 px-3 font-mono text-[12px] text-ink-2 transition-colors duration-1 hover:border-hair-2 focus:border-accent focus:outline-none"
          >
            <option value="html">html</option>
            <option value="css">css</option>
            <option value="js">javascript</option>
          </select>
          <Button
            variant="primary"
            size="sm"
            onClick={() => {
              setRunKey((k) => k + 1);
              setTab("preview");
            }}
          >
            <RefreshCw size={12} />
            {t("runnerRun")}
          </Button>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-hidden p-3 sm:p-4">
        {tab === "code" ? (
          <textarea
            value={code}
            onChange={(e) => setCode(e.target.value)}
            dir="ltr"
            spellCheck={false}
            aria-label={t("runnerTabCode")}
            className="code-surface h-full w-full resize-none rounded-lg border border-hair p-4 font-mono text-[13px] leading-6 focus:border-accent focus:outline-none"
          />
        ) : supported ? (
          <div className="h-full overflow-hidden rounded-lg border border-hair bg-canvas shadow-1">
            <iframe
              key={runKey}
              title="preview"
              srcDoc={srcDoc}
              sandbox="allow-scripts"
              className="h-full w-full"
            />
          </div>
        ) : (
          <div className="grid h-full place-items-center rounded-lg border border-hair bg-surface px-6 text-center">
            <p className="max-w-sm text-pretty text-[13px] leading-6 text-ink-2">
              {t("runnerUnsupported", { lang: language })}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
