"use client";

import { useMemo, useState } from "react";
import { Check, Copy, Play, Terminal } from "lucide-react";
import { highlightCode } from "@/lib/highlight";
import { useSettings } from "./SettingsContext";

const RUNNABLE_LANGS = new Set(["html", "htm", "css", "js", "javascript", "jsx"]);

export default function CodeBlock({
  language,
  code,
  onRun,
}: {
  language: string;
  code: string;
  onRun?: (code: string, language: string) => void;
}) {
  const { t } = useSettings();
  const [copied, setCopied] = useState(false);
  const html = useMemo(() => highlightCode(code), [code]);
  const canRun = RUNNABLE_LANGS.has((language || "").toLowerCase()) && !!onRun;
  const lineCount = useMemo(() => code.split("\n").length, [code]);
  const lineNumbers = useMemo(
    () => Array.from({ length: lineCount }, (_, i) => i + 1).join("\n"),
    [lineCount]
  );

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // تجاهل لو الحافظة مش متاحة
    }
  };

  return (
    <div className="my-2 overflow-hidden rounded-md border border-line bg-[#040504] text-left" dir="ltr">
      <div className="flex items-center justify-between border-b border-line bg-panel2 px-3 py-1.5">
        <div className="flex items-center gap-1.5 text-txt3">
          <Terminal size={12} />
          <span className="mono text-[11px] tracking-wide">{language || "text"}</span>
        </div>
        <div className="flex items-center gap-1">
          {canRun && (
            <button
              onClick={() => onRun?.(code, language)}
              className="flex items-center gap-1 rounded px-2 py-1 text-[11px] text-green hover:bg-green/10"
            >
              <Play size={12} /> {t("runnerRun")}
            </button>
          )}
          <button
            onClick={handleCopy}
            className="flex items-center gap-1 rounded px-2 py-1 text-[11px] text-txt2 hover:bg-white/5"
          >
            {copied ? <Check size={12} className="text-green" /> : <Copy size={12} />}
            {copied ? t("copied") : t("copy")}
          </button>
        </div>
      </div>
      <pre className="mono flex overflow-x-auto p-3 text-[12.5px] leading-[1.6] text-txt">
        {lineCount > 1 && (
          <code
            aria-hidden="true"
            className="select-none pe-3 text-end text-txt3/40"
            style={{ minWidth: `${String(lineCount).length + 1}ch` }}
          >
            {lineNumbers}
          </code>
        )}
        <code className="flex-1" dangerouslySetInnerHTML={{ __html: html }} />
      </pre>
    </div>
  );
}
