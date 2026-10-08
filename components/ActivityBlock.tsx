"use client";

import { useEffect, useRef, useState } from "react";
import { AlertTriangle, Check, ChevronRight, Cog, FileCode2, Loader2, Search, Terminal } from "lucide-react";
import type { AgentStep } from "@/lib/agentEvents";
import { agentStepLabel, stepHasDetail } from "@/lib/agentEvents";
import { useSettings } from "./SettingsContext";
import { cn } from "@/lib/utils";

function StepIcon({ status }: { status: AgentStep["status"] }) {
  if (status === "done")
    return (
      <span className="animate-pop grid h-5 w-5 shrink-0 place-items-center rounded-full bg-live-soft text-live">
        <Check size={12} strokeWidth={3} />
      </span>
    );
  if (status === "error")
    return (
      <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-danger-soft text-danger">
        <AlertTriangle size={12} />
      </span>
    );
  return (
    <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-accent-soft text-accent">
      <Loader2 size={12} className="animate-spin" />
    </span>
  );
}

function ToolGlyph({ tool }: { tool: AgentStep["tool"] }) {
  if (tool === "web_search") return <Search size={13} className="shrink-0 text-accent" />;
  if (tool === "run_command" || tool === "run_tests") return <Terminal size={13} className="shrink-0 text-accent" />;
  return <FileCode2 size={13} className="shrink-0 text-accent" />;
}

function DetailLabel({ children }: { children: React.ReactNode }) {
  return <div className="mb-1 mt-2.5 text-[11px] font-medium text-ink-3 first:mt-0">{children}</div>;
}

/** صندوق مخرجات بخط ثابت — دايمًا LTR لأن الأوامر والمخرجات كود مش نص عربي. */
function Mono({ children, tone }: { children: string; tone?: "danger" | "live" }) {
  return (
    <pre
      dir="ltr"
      className={cn(
        "max-h-52 overflow-auto whitespace-pre-wrap break-words rounded-lg border px-2.5 py-2 text-left font-mono text-[11.5px] leading-5 shadow-1",
        tone === "danger"
          ? "border-danger/30 bg-danger-soft text-danger"
          : tone === "live"
            ? "border-live/30 bg-live-soft text-ink"
            : "border-hair bg-surface-inset text-ink-2"
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
          <Mono tone={step.status === "error" ? undefined : "live"}>{d.stdout}</Mono>
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
 * نوع النشاط الغالب — عشان العنوان يبقى صادق: بحث بس ≠ شغل على مشروع.
 * الأولوية للأوامر (أخطر وأهم)، بعدين الملفات، بعدين البحث.
 */
type ActivityKind = "commands" | "files" | "search" | "mixed";

function activityKind(steps: AgentStep[]): ActivityKind {
  const tools = new Set(steps.map((s) => s.tool));
  const hasCmd = tools.has("run_command") || tools.has("run_tests");
  const hasFile = [...tools].some((t) =>
    ["write_file", "edit_file", "create_file", "delete_file", "read_file", "list_files", "search_files"].includes(t)
  );
  const hasSearch = tools.has("web_search");
  const kinds = [hasCmd && "c", hasFile && "f", hasSearch && "s"].filter(Boolean);
  if (kinds.length > 1) return "mixed";
  if (hasCmd) return "commands";
  if (hasFile) return "files";
  if (hasSearch) return "search";
  return "mixed";
}

function kindLabels(t: (k: string) => string, kind: ActivityKind, active: boolean): string {
  if (kind === "search") return active ? t("agentSearching") : t("agentSearchingDone");
  if (kind === "files") return active ? t("agentBuilding") : t("agentBuildingDone");
  if (kind === "commands") return active ? t("agentRunningCmd") : t("agentRunningCmdDone");
  return active ? t("agentWorking") : t("agentWorkingDone");
}

/**
 * شريط حالة الـAgent: سطر واحد مدمج فوق الرد (مش بطاقة كبيرة).
 * - وهو شغال: أيقونة نابضة + نص حي بيوصف آخر خطوة جارية + نقاط كتابة.
 * - لما يخلص: بيصغر لسطر ملخص هادي قابل للفتح (تايم لاين رفيع بالخطوات).
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
  const kind = activityKind(steps);
  // آخر خطوة جارية — النص الحي بيوصفها ("بيبحث عن أسعار الذهب...") بدل عنوان عام
  const runningStep = [...steps].reverse().find((s) => s.status === "running") ?? null;
  const liveText = runningStep ? agentStepLabel(runningStep) : kindLabels(t, kind, true);

  const statusDot = isActive ? (
    <span className="live-dot grid h-5 w-5 shrink-0 place-items-center rounded-full bg-accent-soft text-accent">
      {kind === "search" ? <Search size={12} /> : kind === "commands" ? <Terminal size={12} /> : <Cog size={12} className="animate-spin-slow" />}
    </span>
  ) : hasError ? (
    <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-danger-soft text-danger">
      <AlertTriangle size={12} />
    </span>
  ) : (
    <span className="animate-pop grid h-5 w-5 shrink-0 place-items-center rounded-full bg-live-soft text-live">
      <Check size={12} strokeWidth={3} />
    </span>
  );

  return (
    <div className="mb-2.5">
      <button
        onClick={() => {
          setUserToggled(true);
          setOpen((o) => !o);
        }}
        aria-expanded={open}
        className={cn(
          "group flex w-full items-center gap-2 rounded-full border py-1.5 pe-2.5 ps-1.5 text-start transition-all duration-2 ease-soft",
          isActive
            ? "border-accent-line bg-accent-soft/60 text-ink shadow-[0_0_16px_-8px_var(--accent-line)]"
            : "border-hair bg-surface-2 text-ink-3 hover:border-hair-2 hover:text-ink"
        )}
      >
        {statusDot}
        <span className="min-w-0 flex-1 truncate text-[12.5px] font-medium" dir="auto">
          {isActive ? (
            <span className="shimmer-text">{liveText}</span>
          ) : (
            <>{kindLabels(t, kind, false)} · <span className="tnum">{t("agentStepsCount", { n: doneCount })}</span></>
          )}
        </span>
        {isActive && (
          <span className="typing-dots shrink-0" aria-hidden="true">
            <span />
            <span />
            <span />
          </span>
        )}

        <ChevronRight
          size={12}
          className={cn(
            "shrink-0 flip-rtl opacity-60 transition-transform duration-2 ease-soft group-hover:opacity-100",
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
          {/* تايم لاين رفيع: خط رأسي + نقاط حالة، من غير بطاقة كبيرة */}
          <ol className="relative ms-[13px] mt-2 space-y-0 border-s border-hair ps-4">
            {steps.map((step) => (
              <li key={step.id} className="relative pb-1 last:pb-0">
                <span
                  aria-hidden="true"
                  className={cn(
                    "absolute -start-[21px] top-[7px] h-[9px] w-[9px] rounded-full border-2 border-surface",
                    step.status === "done" ? "bg-live" : step.status === "error" ? "bg-danger" : "bg-accent pulse-dot"
                  )}
                />
                <StepRow
                  step={step}
                  open={stepOpen[step.id] ?? step.status === "error"}
                  onToggle={() =>
                    setStepOpen((m) => ({ ...m, [step.id]: !(m[step.id] ?? step.status === "error") }))
                  }
                />
              </li>
            ))}
          </ol>
        </div>
      </div>
    </div>
  );
}
