"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  Brain,
  Check,
  ChevronRight,
  Copy,
  ExternalLink,
  FileCode2,
  FileMinus2,
  FilePlus2,
  FileSearch,
  FileText,
  FlaskConical,
  FolderOpen,
  Globe,
  Loader2,
  Pencil,
  Search,
  Terminal,
} from "lucide-react";
import type { AgentStep } from "@/lib/agentEvents";
import { agentStepLabel, stepHasDetail } from "@/lib/agentEvents";
import { renderFormattedText } from "@/lib/markdown";
import { useSettings } from "./SettingsContext";
import { cn } from "@/lib/utils";

/**
 * حالة التفكير المدمجة في تجربة النشاط الموحّدة.
 * التفكير يُعرض كصف تقدّم موجز (تسمية + مدة) داخل نفس التايم لاين —
 * لا كمكوّن منفصل ينافس خطوات الأدوات، ولا كتفريغ خام في الواجهة الرئيسية.
 */
export interface ThinkingState {
  /** "يفكر…" أثناء البث، أو "فكّر لمدة 12ث" بعد الاكتمال */
  label: string;
  durationMs?: number | null;
  /** نص التفكير — يظهر فقط عند فتح صف التفكير، بخط هادئ ثانوي */
  body?: string | null;
  live: boolean;
}

function StatusIcon({ status }: { status: AgentStep["status"] }) {
  if (status === "done")
    return (
      <span className="animate-pop grid h-[18px] w-[18px] shrink-0 place-items-center rounded-full bg-live-soft text-live">
        <Check size={11} strokeWidth={3} />
      </span>
    );
  if (status === "error")
    return (
      <span className="grid h-[18px] w-[18px] shrink-0 place-items-center rounded-full bg-danger-soft text-danger">
        <AlertTriangle size={11} />
      </span>
    );
  return (
    <span className="grid h-[18px] w-[18px] shrink-0 place-items-center rounded-full bg-accent-soft text-accent">
      <Loader2 size={11} className="animate-spin" />
    </span>
  );
}

function ToolGlyph({ tool }: { tool: AgentStep["tool"] }) {
  const cls = "shrink-0 text-ink-3";
  switch (tool) {
    case "web_search":
      return <Search size={13} className={cls} />;
    case "run_command":
      return <Terminal size={13} className={cls} />;
    case "run_tests":
      return <FlaskConical size={13} className={cls} />;
    case "read_file":
      return <FileText size={13} className={cls} />;
    case "write_file":
      return <FileCode2 size={13} className={cls} />;
    case "edit_file":
      return <Pencil size={13} className={cls} />;
    case "create_file":
      return <FilePlus2 size={13} className={cls} />;
    case "delete_file":
      return <FileMinus2 size={13} className={cls} />;
    case "list_files":
      return <FolderOpen size={13} className={cls} />;
    case "search_files":
      return <FileSearch size={13} className={cls} />;
    default:
      return <FileCode2 size={13} className={cls} />;
  }
}

function DetailLabel({ children }: { children: React.ReactNode }) {
  return <div className="mb-1 mt-2.5 text-[11px] font-medium text-ink-3 first:mt-0">{children}</div>;
}

/** صندوق مخرجات بخط ثابت — دايمًا LTR لأن الأوامر والمخرجات كود مش نص عربي. */
function Mono({ children, tone }: { children: string; tone?: "danger" | "live" }) {
  return (
    <pre
      dir="ltr"
      tabIndex={0}
      className={cn(
        "max-h-48 overflow-auto whitespace-pre-wrap break-words rounded-lg border px-2.5 py-2 text-left font-mono text-[11.5px] leading-5 shadow-1",
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

function CopyButton({ text }: { text: string }) {
  const { t } = useSettings();
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          // تجاهل لو الحافظة مش متاحة
        }
      }}
      title={copied ? t("copied") : t("copy")}
      aria-label={copied ? t("copied") : t("copy")}
      className="grid h-6 w-6 shrink-0 place-items-center rounded-full text-ink-3 transition-colors duration-1 hover:bg-surface-3 hover:text-ink"
    >
      {copied ? <Check size={12} className="text-live" /> : <Copy size={12} />}
    </button>
  );
}

function domainOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function SourcesList({ sources }: { sources: { title: string; url: string }[] }) {
  const { t } = useSettings();
  const [showAll, setShowAll] = useState(false);
  const MAX_VISIBLE = 6;
  const visible = showAll ? sources : sources.slice(0, MAX_VISIBLE);
  const hidden = sources.length - visible.length;
  return (
    <div>
      <ul className="space-y-1">
        {visible.map((src) => (
          <li key={src.url} className="min-w-0">
            <a
              href={src.url}
              target="_blank"
              rel="noopener noreferrer"
              className="group/src flex items-start gap-2 rounded-md px-1.5 py-1 transition-colors duration-1 hover:bg-surface-3"
            >
              <Globe size={13} className="mt-0.5 shrink-0 text-ink-3" />
              <span className="min-w-0 flex-1">
                <span dir="auto" className="block truncate text-[12.5px] text-ink-2 group-hover/src:text-ink">
                  {src.title || domainOf(src.url)}
                </span>
                <span dir="ltr" className="block truncate font-mono text-[11px] text-ink-3">
                  {domainOf(src.url)}
                </span>
              </span>
              <ExternalLink size={12} className="mt-1 shrink-0 text-ink-3 opacity-0 transition-opacity duration-1 group-hover/src:opacity-100" />
            </a>
          </li>
        ))}
      </ul>
      {hidden > 0 && (
        <button
          type="button"
          onClick={() => setShowAll(true)}
          className="mt-1 px-1.5 py-0.5 text-[12px] font-medium text-accent hover:underline"
        >
          {t("agentMoreSources", { n: hidden })}
        </button>
      )}
    </div>
  );
}

function StepDetail({ step }: { step: AgentStep }) {
  const { t } = useSettings();
  const d = step.detail;
  const failedWithoutOutput = step.status === "error" && !d?.stderr && !d?.stdout;
  const outputToCopy = [d?.stdout, d?.stderr].filter(Boolean).join("\n") || d?.command || "";

  return (
    <div className="px-3 pb-3 ps-9 text-[12px]">
      {d?.command && (
        <>
          <div className="mb-1 mt-2.5 flex items-center justify-between first:mt-0">
            <span className="text-[11px] font-medium text-ink-3">{t("agentDetailCommand")}</span>
            {outputToCopy && <CopyButton text={outputToCopy} />}
          </div>
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
            <span className={cn(d.exitCode !== 0 && "text-danger")}>exit {d.exitCode}</span>
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
          <ul className="space-y-1">
            {d.queries.map((q) => (
              <li key={q} dir="auto" className="flex items-start gap-1.5 text-ink-2">
                <Search size={12} className="mt-1 shrink-0 text-ink-3" />
                <span className="min-w-0">{q}</span>
              </li>
            ))}
          </ul>
        </>
      )}
      {d?.sources && d.sources.length > 0 && (
        <>
          <DetailLabel>
            {t("agentDetailSources")} ·{" "}
            <span className="tnum">{t("agentSourcesCount", { n: d.sources.length })}</span>
          </DetailLabel>
          <SourcesList sources={d.sources} />
        </>
      )}
    </div>
  );
}

/** نص ميتا صغير يمين الصف: عدد المصادر / exit code / عدد الأسطر */
function StepMeta({ step }: { step: AgentStep }) {
  const { t } = useSettings();
  const d = step.detail;
  if (step.tool === "web_search" && d?.sources && d.sources.length > 0) {
    return (
      <span className="tnum shrink-0 text-[11px] text-ink-3">
        {t("agentSourcesCount", { n: d.sources.length })}
      </span>
    );
  }
  if ((step.tool === "run_command" || step.tool === "run_tests") && typeof d?.exitCode === "number") {
    return (
      <span className={cn("tnum shrink-0 text-[11px]", d.exitCode !== 0 ? "text-danger" : "text-ink-3")}>
        exit {d.exitCode}
        {typeof d?.durationMs === "number" ? ` · ${(d.durationMs / 1000).toFixed(1)}s` : ""}
      </span>
    );
  }
  if (typeof d?.lines === "number" && step.path) {
    return (
      <span className="tnum shrink-0 text-[11px] text-ink-3">{t("agentDetailLines", { n: d.lines })}</span>
    );
  }
  return null;
}

function StepRow({ step, open, onToggle }: { step: AgentStep; open: boolean; onToggle: () => void }) {
  const expandable = stepHasDetail(step);

  const label = (
    <>
      <StatusIcon status={step.status} />
      <ToolGlyph tool={step.tool} />
      <span
        dir="auto"
        className={cn("min-w-0 flex-1 truncate text-start", step.status === "error" ? "text-danger" : "text-ink-2")}
      >
        {agentStepLabel(step)}
      </span>
      <StepMeta step={step} />
    </>
  );

  if (!expandable) {
    return <div className="flex items-center gap-2 px-2.5 py-[3px] text-[12.5px] leading-6">{label}</div>;
  }

  return (
    <div>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full items-center gap-2 rounded-md px-2.5 py-[3px] text-[12.5px] leading-6 transition-colors duration-1 hover:bg-surface-3"
      >
        {label}
        <ChevronRight size={12} className={cn("chev shrink-0 text-ink-3", open && "chev-open")} />
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

function ThinkingRow({
  thinking,
  open,
  onToggle,
}: {
  thinking: ThinkingState;
  open: boolean;
  onToggle: () => void;
}) {
  const expandable = !!thinking.body?.trim();
  const secs = thinking.durationMs != null && thinking.durationMs > 0 ? (thinking.durationMs / 1000).toFixed(0) : null;

  const label = (
    <>
      {thinking.live ? (
        <span className="grid h-[18px] w-[18px] shrink-0 place-items-center rounded-full bg-accent-soft text-accent">
          <Brain size={11} />
        </span>
      ) : (
        <StatusIcon status="done" />
      )}
      <span dir="auto" className="min-w-0 flex-1 truncate text-start text-ink-2">
        {thinking.label}
      </span>
      {secs !== null && !thinking.live && (
        <span className="tnum shrink-0 rounded-full bg-surface-3 px-1.5 py-px text-[10.5px] text-ink-3">
          {secs}s
        </span>
      )}
    </>
  );

  if (!expandable) {
    return <div className="flex items-center gap-2 px-2.5 py-[3px] text-[12.5px] leading-6">{label}</div>;
  }

  return (
    <div>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full items-center gap-2 rounded-md px-2.5 py-[3px] text-[12.5px] leading-6 transition-colors duration-1 hover:bg-surface-3"
      >
        {label}
        <ChevronRight size={12} className={cn("chev shrink-0 text-ink-3", open && "chev-open")} />
      </button>
      <div
        aria-hidden={!open}
        className={cn(
          "grid transition-[grid-template-rows,visibility] duration-2 ease-soft",
          open ? "visible grid-rows-[1fr]" : "invisible grid-rows-[0fr]"
        )}
      >
        <div className="min-h-0 overflow-hidden">
          <div className="px-3 pb-3 ps-9">
            <div className="mt-1 max-h-60 overflow-y-auto rounded-lg border border-hair bg-surface-2 px-3 py-2.5 text-[12.5px] leading-6 text-ink-2">
              <div dir="auto">{renderFormattedText(thinking.body!.trim(), "thinking-body")}</div>
            </div>
          </div>
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
 * تجربة النشاط الموحّدة: التفكير + الأدوات في تايم لاين واحد مدمج.
 * - وهو شغال: سطر حالة مدمج يعرض الفعل الحالي (آخر خطوة جارية، وإلا تسمية التفكير)
 *   مع عدّاد المصادر للبحث — من غير بطاقات ضخمة ولا حبوب لكل فعل.
 * - لما يخلص: سطر ملخص هادئ قابل للفتح على التايم لاين الكامل.
 * البيانات دائمًا حقيقية (AgentEvent/AgentStep) — لا نخترع خطوات.
 */
export default function ActivityBlock({
  steps,
  isActive,
  thinking,
}: {
  steps: AgentStep[];
  isActive: boolean;
  thinking?: ThinkingState | null;
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
  const [thinkingOpen, setThinkingOpen] = useState(false);

  // لما التنفيذ يخلص (active → غير active) نقفل البلوك مرة واحدة بانسيابية،
  // إلا لو المستخدم كان فتحه/قفله بنفسه.
  useEffect(() => {
    if (wasActive.current && !isActive && !userToggled) setOpen(false);
    wasActive.current = isActive;
  }, [isActive, userToggled]);

  const totalSources = useMemo(
    () => steps.reduce((acc, s) => acc + (s.tool === "web_search" ? (s.detail?.sources?.length ?? 0) : 0), 0),
    [steps]
  );

  if (steps.length === 0 && !thinking) return null;

  // بأسلوب كلود: تفكير فقط بدون أي أدوات → موسّع واحد هادئ بلا تايم لاين
  // ولا نقاط حالة — العنوان المختصر هو الواجهة الأساسية.
  if (steps.length === 0 && thinking && !thinking.live) {
    return (
      <div className="mb-2">
        <ThinkingRow thinking={thinking} open={thinkingOpen} onToggle={() => setThinkingOpen((o) => !o)} />
      </div>
    );
  }

  const hasError = steps.some((s) => s.status === "error");
  const doneCount = steps.filter((s) => s.status === "done").length;
  const kind = activityKind(steps);
  // آخر خطوة جارية — النص الحي بيوصفها ("بيبحث عن أسعار الذهب...") بدل عنوان عام
  const runningStep = [...steps].reverse().find((s) => s.status === "running") ?? null;
  const liveText = runningStep
    ? agentStepLabel(runningStep)
    : thinking?.live
      ? thinking.label
      : kindLabels(t, kind, true);
  const doneText =
    steps.length > 0
      ? `${kindLabels(t, kind, false)} · ${t("agentStepsCount", { n: doneCount })}`
      : (thinking?.label ?? "");

  // ميتا الهيدر: عدد المصادر للبحث — من غير روابط خام في الحالة المدمجة
  const headerMeta =
    (kind === "search" || kind === "mixed") && totalSources > 0
      ? t("agentSourcesCount", { n: totalSources })
      : null;

  const statusDot = isActive ? (
    <span className="grid h-[18px] w-[18px] shrink-0 place-items-center rounded-full bg-accent-soft text-accent">
      <Loader2 size={11} className="animate-spin" />
    </span>
  ) : hasError ? (
    <span className="grid h-[18px] w-[18px] shrink-0 place-items-center rounded-full bg-danger-soft text-danger">
      <AlertTriangle size={11} />
    </span>
  ) : (
    <span className="animate-pop grid h-[18px] w-[18px] shrink-0 place-items-center rounded-full bg-live-soft text-live">
      <Check size={11} strokeWidth={3} />
    </span>
  );

  const expandable = steps.length > 0 || !!thinking?.body?.trim();

  if (!expandable) {
    return (
      <div className="mb-2 flex items-center gap-2 px-1 py-1 text-[12.5px] font-medium" aria-live="polite">
        {statusDot}
        <span className="min-w-0 flex-1 truncate text-ink-2" dir="auto">
          {isActive ? liveText : doneText}
        </span>
        
      </div>
    );
  }

  return (
    <div className="mb-2">
      <button
        type="button"
        onClick={() => {
          setUserToggled(true);
          setOpen((o) => !o);
        }}
        aria-expanded={open}
        className={cn(
          "group flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-start transition-colors duration-2 ease-soft",
          isActive ? "bg-accent-soft/50 text-ink" : "text-ink-3 hover:bg-surface-2 hover:text-ink"
        )}
      >
        {statusDot}
        <span className="min-w-0 flex-1 truncate text-[12.5px] font-medium" dir="auto">
          {isActive ? liveText : doneText}
        </span>
        {headerMeta && <span className="tnum shrink-0 text-[11.5px] text-ink-3">{headerMeta}</span>}
        
        <ChevronRight size={12} className={cn("chev shrink-0 opacity-60 group-hover:opacity-100", open && "chev-open")} />
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
          {/* صفوف هادئة بفواصل شعرية — بلا خط زمني ولا نقاط، بأسلوب كلود */}
          <ol className="mt-1.5 space-y-px">
            {thinking && (
              <li className="pb-0.5">
                <ThinkingRow
                  thinking={thinking}
                  open={thinkingOpen}
                  onToggle={() => setThinkingOpen((o) => !o)}
                />
              </li>
            )}
            {steps.map((step) => (
              <li key={step.id} className="border-t border-hair py-0.5 first:border-t-0 last:pb-0">
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
