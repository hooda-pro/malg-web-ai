"use client";

import { useMemo, useState } from "react";
import { Check, Copy, Play } from "lucide-react";
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
    <div
      dir="ltr"
      className="code-surface my-1 overflow-hidden rounded-lg border border-hair text-start shadow-1"
    >
      <div className="flex items-center justify-between gap-2 border-b border-hair px-3 py-2">
        <span className="truncate font-mono text-[11.5px] uppercase tracking-micro text-ink-3">
          {language || "text"}
        </span>
        <div className="flex items-center gap-1">
          {canRun && (
            <button
              onClick={() => onRun?.(code, language)}
              className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-medium text-accent transition-colors duration-1 hover:bg-accent-soft"
            >
              <Play size={12} />
              {t("runnerRun")}
            </button>
          )}
          <button
            onClick={handleCopy}
            className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-medium text-ink-2 transition-colors duration-1 hover:bg-surface-3 hover:text-ink"
          >
            {copied ? <Check size={12} className="text-live" /> : <Copy size={12} />}
            {copied ? t("copied") : t("copy")}
          </button>
        </div>
      </div>
      <pre className="overflow-x-auto px-4 py-3 font-mono text-[12.5px] leading-[1.7]">
        <code dangerouslySetInnerHTML={{ __html: html }} />
      </pre>
    </div>
  );
}

