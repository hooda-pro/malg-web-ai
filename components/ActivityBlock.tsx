"use client";

import { useEffect, useRef, useState } from "react";
import { AlertTriangle, Check, ChevronRight, Cog, FileCode2, Loader2, Search, Terminal } from "lucide-react";
import type { AgentStep } from "@/lib/agentEvents";
import { agentStepLabel, stepHasDetail } from "@/lib/agentEvents";
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

function DetailLabel({ children }: { children: React.ReactNode }) {
  return <div className="mb-1 mt-2.5 text-[11px] font-medium text-ink-3 first:mt-0">{children}</div>;
}

/** صندوق مخرجات بخط ثابت — دايمًا LTR لأن الأوامر والمخرجات كود مش نص عربي. */
function Mono({ children, tone }: { children: string; tone?: "danger" }) {
  return (
    <pre
      dir="ltr"
      className={cn(
        "max-h-52 overflow-auto whitespace-pre-wrap break-words rounded-md border border-hair bg-surface-inset px-2.5 py-2 text-left font-mono text-[11.5px] leading-5",
        tone === "danger" ? "text-danger" : "text-ink-2"
      )}
    >
      {children}
    </pre>
  );
}

function StepDetail({ step }: { step: AgentStep }) {
  const { t } = useSettings();
  const d = step.detail;
  const failedWithoutOutput = step.status === "error" && !d?.stderr && !d?.stdout;

  return (
    <div className="px-3.5 pb-3 ps-[2.35rem] text-[12px]">
      {d?.command && (
        <>
          <DetailLabel>{t("agentDetailCommand")}</DetailLabel>
          <Mono>{"$ " + d.command}</Mono>
        </>
      )}

      {step.status === "running" && d?.command && (
        <div className="mt-2 flex items-center gap-1.5 text-ink-3">
          <Loader2 size={12} className="animate-spin text-accent" />
          {t("agentDetailRunning")}
        </div>
      )}

      {d?.stdout && (
        <>
          <DetailLabel>{t("agentDetailOutput")}</DetailLabel>
          <Mono>{d.stdout}</Mono>
        </>
      )}
      {d?.stderr && (
        <>
          <DetailLabel>{t("agentDetailErrors")}</DetailLabel>
          <Mono tone="danger">{d.stderr}</Mono>
        </>
      )}

      {step.status !== "running" && d?.command && !d.stdout && !d.stderr && step.status === "done" && (
        <div className="mt-2 text-ink-3">{t("agentDetailNoOutput")}</div>
      )}

      {failedWithoutOutput && step.message && (
        <div dir="auto" className="mt-1 text-danger">
          {step.message}
        </div>
      )}

      {(typeof d?.exitCode === "number" || typeof d?.durationMs === "number") && (
        <div className="tnum mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-ink-3">
          {typeof d?.exitCode === "number" && (
            <span className={cn(d.exitCode !== 0 && "text-danger")}>exit code {d.exitCode}</span>
          )}
          {typeof d?.durationMs === "number" && <span>{(d.durationMs / 1000).toFixed(1)}s</span>}
        </div>
      )}

      {step.path && !d?.command && (
        <>
          <DetailLabel>{t("agentDetailFile")}</DetailLabel>
          <div dir="ltr" className="text-left font-mono text-[11.5px] text-ink-2">
            {step.path}
            {typeof d?.lines === "number" && (
              <span className="text-ink-3"> · {t("agentDetailLines", { n: d.lines })}</span>
            )}
          </div>
        </>
      )}
      {d?.preview && !d?.command && <div className="mt-1.5"><Mono>{d.preview}</Mono></div>}

      {d?.queries && d.queries.length > 0 && (
        <>
          <DetailLabel>{t("agentDetailQueries")}</DetailLabel>
          <ul className="space-y-0.5">
            {d.queries.map((q) => (
              <li key={q} dir="auto" className="text-ink-2">
                {q}
              </li>
            ))}
          </ul>
        </>
      )}
      {d?.sources && d.sources.length > 0 && (
        <>
          <DetailLabel>{t("agentDetailSources")}</DetailLabel>
          <ul className="space-y-0.5">
            {d.sources.map((src) => (
              <li key={src.url} className="min-w-0">
                <a
                  href={src.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  dir="auto"
                  className="block truncate text-ink-2 underline decoration-hair-2 underline-offset-2 hover:text-ink"
                >
                  {src.title || src.url}
                </a>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

function StepRow({ step, open, onToggle }: { step: AgentStep; open: boolean; onToggle: () => void }) {
  const expandable = stepHasDetail(step);

  const label = (
    <>
      <StepIcon status={step.status} />
      <ToolGlyph tool={step.tool} />
      <span
        dir="auto"
        className={cn("min-w-0 flex-1 truncate text-start", step.status === "error" ? "text-danger" : "text-ink-2")}
      >
        {agentStepLabel(step)}
      </span>
    </>
  );

  if (!expandable) {
    return <div className="flex items-center gap-2 px-3.5 py-1 text-[12.5px] leading-6">{label}</div>;
  }

  return (
    <div>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full items-center gap-2 px-3.5 py-1 text-[12.5px] leading-6 transition-colors duration-1 hover:bg-surface-3"
      >
        {label}
        <ChevronRight
          size={12}
          className={cn(
            "shrink-0 flip-rtl text-ink-3 transition-transform duration-2 ease-soft",
            open && "rotate-90"
          )}
        />
      </button>
      <div
        aria-hidden={!open}
        className={cn(
          "grid transition-[grid-template-rows,visibility] duration-2 ease-soft",
          open ? "visible grid-rows-[1fr]" : "invisible grid-rows-[0fr]"
        )}
      >
        <div className="min-h-0 overflow-hidden">
          <StepDetail step={step} />
        </div>
      </div>
    </div>
  );
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
  // مهم: بيبدأ مفتوح بس لو التنفيذ لسه شغّال. قبل كده كان بيبدأ مفتوح دايمًا ثم
  // يتقفل بعد أول رسم (useEffect) — فكل رسالة قديمة فيها خطوات كانت بتوميض مفتوحة
  // لفريم وبعدين تنهار، وده كان بيعمل قفزة في الارتفاع عند فتح أي شات.
  const [open, setOpen] = useState(isActive);
  const [userToggled, setUserToggled] = useState(false);
  const wasActive = useRef(isActive);
  // فتح/قفل تفاصيل كل خطوة لوحدها. الخطوة الفاشلة بتتفتح تلقائيًا عشان المستخدم
  // يشوف سبب الخطأ فورًا، وأي اختيار يدوي من المستخدم بيكسب على الافتراضي.
  const [stepOpen, setStepOpen] = useState<Record<string, boolean>>({});

  // لما التنفيذ يخلص (active → غير active) نقفل البلوك مرة واحدة بانسيابية،
  // إلا لو المستخدم كان فتحه/قفله بنفسه.
  useEffect(() => {
    if (wasActive.current && !isActive && !userToggled) setOpen(false);
    wasActive.current = isActive;
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

      {/* فتح/قفل بارتفاع متحرّك (grid-rows) بدل ظهور/اختفاء مفاجئ */}
      <div
        aria-hidden={!open}
        className={cn(
          "grid transition-[grid-template-rows,visibility] duration-2 ease-soft",
          open ? "visible grid-rows-[1fr]" : "invisible grid-rows-[0fr]"
        )}
      >
        <div className="min-h-0 overflow-hidden">
          <ul className="border-t border-hair py-1.5">
            {steps.map((step) => (
              <li key={step.id}>
                <StepRow
                  step={step}
                  open={stepOpen[step.id] ?? step.status === "error"}
                  onToggle={() =>
                    setStepOpen((m) => ({ ...m, [step.id]: !(m[step.id] ?? step.status === "error") }))
                  }
                />
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
