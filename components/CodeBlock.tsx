"use client";

import { useMemo, useState } from "react";
import { Check, Copy } from "lucide-react";
import { highlightCode } from "@/lib/highlight";
import { useSettings } from "./SettingsContext";

export default function CodeBlock({
  language,
  code,
}: {
  language: string;
  code: string;
}) {
  const { t } = useSettings();
  const [copied, setCopied] = useState(false);
  const html = useMemo(() => highlightCode(code), [code]);

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

