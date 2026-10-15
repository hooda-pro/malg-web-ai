"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowUp, Code2, Globe, Paperclip, PenLine, Sparkles } from "lucide-react";

const MODES = [
  {
    id: "build",
    label: "ابنِ موقعًا",
    icon: Code2,
    examples: [
      "ابنِ صفحة هبوط لمطعم مع قائمة طعام وزر حجز",
      "اعمل لعبة ثعبان تعمل في المتصفح",
      "صمّم لوحة تحكم لمتابعة المبيعات الشهرية",
    ],
  },
  {
    id: "write",
    label: "اكتب",
    icon: PenLine,
    examples: [
      "اكتب رسالة تقديم احترافية لوظيفة مصمم واجهات",
      "لخّص لي هذا المقال في خمس نقاط واضحة",
      "اكتب منشورًا تسويقيًا لإطلاق تطبيق جديد",
    ],
  },
  {
    id: "search",
    label: "ابحث",
    icon: Globe,
    examples: [
      "ما آخر التطورات في مجال السيارات الكهربائية؟",
      "قارن بين أفضل ثلاث لغات برمجة للمبتدئين",
      "ابحث عن أفضل الممارسات لتحسين سرعة المواقع",
    ],
  },
  {
    id: "learn",
    label: "تعلّم",
    icon: Sparkles,
    examples: [
      "اشرح لي الذكاء الاصطناعي كأني في الصف الأول الثانوي",
      "ساعدني أذاكر الفيزياء بأسئلة وأجوبة",
      "علّمني أساسيات بايثون خطوة بخطوة",
    ],
  },
] as const;

function useTypewriter(lines: readonly string[], paused: boolean) {
  const [text, setText] = useState("");
  const state = useRef({ line: 0, char: 0, deleting: false });

  useEffect(() => {
    state.current = { line: 0, char: 0, deleting: false };
    setText("");
  }, [lines]);

  useEffect(() => {
    if (paused) return;
    const reduce =
      window.matchMedia("(prefers-reduced-motion: reduce)").matches ||
      document.documentElement.classList.contains("no-anim");
    if (reduce) {
      setText(lines[0]);
      return;
    }
    let timer: number;
    const step = () => {
      const s = state.current;
      const full = lines[s.line % lines.length];
      if (!s.deleting) {
        s.char += 1;
        setText(full.slice(0, s.char));
        if (s.char >= full.length) {
          s.deleting = true;
          timer = window.setTimeout(step, 2200);
          return;
        }
        timer = window.setTimeout(step, 38);
      } else {
        s.char -= 2;
        setText(full.slice(0, Math.max(0, s.char)));
        if (s.char <= 0) {
          s.deleting = false;
          s.line += 1;
          s.char = 0;
          timer = window.setTimeout(step, 350);
          return;
        }
        timer = window.setTimeout(step, 18);
      }
    };
    timer = window.setTimeout(step, 400);
    return () => window.clearTimeout(timer);
  }, [lines, paused]);

  return text;
}

export default function HeroComposer() {
  const [mode, setMode] = useState<(typeof MODES)[number]["id"]>("build");
  const [value, setValue] = useState("");
  const [focused, setFocused] = useState(false);
  const active = MODES.find((m) => m.id === mode) ?? MODES[0];
  const typed = useTypewriter(active.examples, focused || value.length > 0);

  const submit = (prompt?: string) => {
    const text = (prompt ?? value).trim() || active.examples[0];
    try {
      sessionStorage.setItem("malg-pending-prompt", text);
    } catch {
      // sessionStorage غير متاح — نفتح المحادثة بدون نص
    }
    window.location.hash = "#/chat";
  };

  return (
    <div className="mx-auto w-full max-w-[720px]">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        className="lp-ring rounded-[26px] bg-surface p-2 text-start shadow-3"
      >
        <label htmlFor="lp-prompt" className="sr-only">
          اكتب طلبك لـ MALG
        </label>
        <div className="relative">
          <textarea
            id="lp-prompt"
            rows={3}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                if (e.nativeEvent.isComposing || e.keyCode === 229) return;
                e.preventDefault();
                submit();
              }
            }}
            className="block w-full resize-none bg-transparent px-4 pb-2 pt-3.5 text-[16px] leading-7 text-ink outline-none placeholder:text-ink-3"
            placeholder={focused ? "صِف ما تريد…" : ""}
          />
          {!value && !focused && (
            <span aria-hidden="true" className="lp-caret pointer-events-none absolute inset-x-4 top-3.5 text-[16px] leading-7 text-ink-3">
              {typed}
            </span>
          )}
        </div>
        <div className="flex items-center justify-between gap-2 px-2 pb-1">
          <div className="flex min-w-0 items-center gap-1.5 overflow-x-auto [scrollbar-width:none]">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-ink-3" aria-hidden="true">
              <Paperclip size={17} />
            </span>
            {MODES.map((m) => {
              const Icon = m.icon;
              const isActive = m.id === mode;
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setMode(m.id)}
                  aria-pressed={isActive}
                  className={`inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3 text-[13px] font-medium transition-colors duration-1 ${
                    isActive
                      ? "border-accent-line bg-accent-soft text-accent"
                      : "border-hair text-ink-2 hover:bg-surface-2 hover:text-ink"
                  }`}
                >
                  <Icon size={14} />
                  {m.label}
                </button>
              );
            })}
          </div>
          <button
            type="submit"
            aria-label="إرسال"
            className="btn-send grid h-10 w-10 shrink-0 place-items-center rounded-full text-accent-ink transition-transform duration-1 active:scale-95"
          >
            <ArrowUp size={18} />
          </button>
        </div>
      </form>

      <ul className="mt-4 flex flex-wrap items-center justify-center gap-2" aria-label="أمثلة سريعة">
        {active.examples.map((ex) => (
          <li key={ex}>
            <button
              type="button"
              onClick={() => submit(ex)}
              className="rounded-full border border-hair bg-surface px-3.5 py-1.5 text-[13px] text-ink-2 transition-colors duration-1 hover:border-hair-2 hover:text-ink"
            >
              {ex}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
