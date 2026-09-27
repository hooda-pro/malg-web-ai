"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, Check, ChevronRight, Cog, FileCode2, Loader2, Search, Terminal } from "lucide-react";
import type { AgentStep } from "@/lib/agentEvents";
import { agentStepLabel } from "@/lib/agentEvents";
import { useSettings } from "./SettingsContext";
import { cn } from "@/lib/utils";

function StepIcon({ status }: { status: AgentStep["status"] }) {
  if (status === "done") return <Check size={13} className="shrink-0 text-live" />;
  if (status === "error") return <AlertTriangle size={13} className="shrink-0 text-danger" />;
  return <Loader2 size={13} className="shrink-0 animate-spin text-accent" />;
}

function ToolGlyph({ tool }: { tool: AgentStep["tool"] }) {
  if (tool === "web_search") return <Search size={13} className="shrink-0 text-ink-3" />;
  if (tool === "run_command" || tool === "run_tests") return <Terminal size={13} className="shrink-0 text-ink-3" />;
  return <FileCode2 size={13} className="shrink-0 text-ink-3" />;
}

/**
 * بلوك نشاط الـAgent: بيتفتح لوحده أول ما أول خطوة حقيقية تبدأ (كتابة ملف
 * فعلية، بحث حقيقي تم بالفعل)، ولما الرد يخلص بيتقفل لوحده تلقائيًا ويبين
 * ملخّص مختصر (زي "5 خطوات") قابل للفتح يدويًا لمراجعة التفاصيل تاني.
 */
export default function ActivityBlock({
  steps,
  isActive,
}: {
  steps: AgentStep[];
  isActive: boolean;
}) {
  const { t } = useSettings();
  const [open, setOpen] = useState(true);
  const [userToggled, setUserToggled] = useState(false);

  // أول ما التنفيذ يخلص (isActive بيبقى false) نقفل البلوك تلقائيًا مرة واحدة،
  // إلا لو المستخدم كان فعليًا فاتحه/قافله بنفسه أثناء التنفيذ.
  useEffect(() => {
    if (!isActive && !userToggled) setOpen(false);
  }, [isActive, userToggled]);

  if (steps.length === 0) return null;

  const hasError = steps.some((s) => s.status === "error");
  const doneCount = steps.filter((s) => s.status === "done").length;

  return (
    <div className="mb-3 overflow-hidden rounded-lg border border-hair bg-surface-2">
      <button
        onClick={() => {
          setUserToggled(true);
          setOpen((o) => !o);
        }}
        aria-expanded={open}
        className="flex w-full items-center gap-2 px-3.5 py-2.5 text-start transition-colors duration-1 hover:bg-surface-3"
      >
        {isActive ? (
          <Cog size={14} className="shrink-0 animate-spin-slow text-accent" />
        ) : hasError ? (
          <AlertTriangle size={14} className="shrink-0 text-danger" />
        ) : (
          <Check size={14} className="shrink-0 text-live" />
        )}

        <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-ink">
          {isActive ? t("agentWorking") : t("agentWorkingDone")}
          {!open && (
            <span className="tnum text-ink-3"> · {t("agentStepsCount", { n: doneCount })}</span>
          )}
        </span>

        <ChevronRight
          size={13}
          className={cn(
            "shrink-0 flip-rtl text-ink-3 transition-transform duration-2 ease-soft",
            open && "rotate-90"
          )}
        />
      </button>

      {open && (
        <ul className="animate-materialize border-t border-hair px-3.5 py-2.5">
          {steps.map((step) => (
            <li key={step.id} className="flex items-center gap-2 py-1 text-[12.5px] leading-6">
              <StepIcon status={step.status} />
              <ToolGlyph tool={step.tool} />
              <span
                dir="auto"
                className={cn(
                  "min-w-0 flex-1 truncate",
                  step.status === "error" ? "text-danger" : "text-ink-2"
                )}
              >
                {agentStepLabel(step)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
