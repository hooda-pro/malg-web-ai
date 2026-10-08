"use client";

import { useLayoutEffect, useMemo, useRef } from "react";
import { isLocalMessageId, type ChatMessage } from "@/lib/types";
import type { ProjectFile } from "@/lib/parseContent";
import type { AgentEvent } from "@/lib/agentEvents";
import MessageItem from "./MessageItem";
import WelcomeHero from "./WelcomeHero";

/** الرد اللي لسه بيتكتب (بث حيّ). key بيبقى هو نفسه مفتاح الرسالة المحفوظة بعد ما تخلص. */
export interface LiveReplyState {
  key: string;
  content: string;
  reasoning: string;
  agentEvents: AgentEvent[];
}

/** هيكل عظمي خفيف وقت تحميل المحادثة — بيظهر بعد 150ms بس، فالتحميل السريع ما بيوميضش. */
function HistorySkeleton() {
  return (
    <div className="min-h-0 flex-1 overflow-hidden" aria-busy="true">
      <div className="animate-fade-delayed mx-auto w-full max-w-[820px] space-y-8 px-4 py-6 sm:px-6">
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex animate-pulse gap-3">
            <span className="h-7 w-7 shrink-0 rounded-[9px] bg-surface-3" />
            <div className="min-w-0 flex-1 space-y-2.5 pt-1.5">
              <span className="block h-3 w-[72%] rounded-full bg-surface-3" />
              <span className="block h-3 w-[48%] rounded-full bg-surface-3" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function MessageList({
  messages,
  live,
  loading,
  sessionKey,
  totalTokens,
  userName,
  onPromptSelected,
  onContinue,
  continuingMessageId,
  continuationStreamingContent,
  onPreviewFiles,
  onRegenerate,
  regeneratingMessageId,
  onEdit,
  actionsDisabled,
}: {
  messages: ChatMessage[];
  live: LiveReplyState | null;
  loading: boolean;
  sessionKey: string | null;
  totalTokens: number;
  userName?: string | null;
  onPromptSelected: (prompt: string) => void;
  onContinue: (messageId: string) => void;
  continuingMessageId: string | null;
  continuationStreamingContent: string;
  onPreviewFiles: (files: ProjectFile[], focusPath?: string) => void;
  onRegenerate?: (messageId: string) => void;
  regeneratingMessageId?: string | null;
  onEdit?: (message: ChatMessage) => void;
  actionsDisabled?: boolean;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  // true = المستخدم عند آخر المحادثة → أي زيادة في الارتفاع (بث، صورة اتحمّلت، الكيبورد
  // فتح، الكومبوزر كبر) بتتابَع فورًا. لو طلع لفوق يقرا، ما نسحبهوش لتحت.
  const pinned = useRef(true);
  const lastSessionKey = useRef<string | null | undefined>(undefined);

  const liveMessage = useMemo<ChatMessage | null>(
    () =>
      live
        ? {
            id: "live",
            clientKey: live.key,
            sessionId: "",
            role: "assistant",
            content: live.content,
            reasoning: live.reasoning || null,
            thinkingDurationMs: null,
            isTruncated: false,
            tokensUsed: 0,
            createdAt: "",
          }
        : null,
    [live?.key, live?.content, live?.reasoning] // eslint-disable-line react-hooks/exhaustive-deps
  );
  const hasContent = messages.length > 0 || !!liveMessage;

  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    pinned.current = el.scrollHeight - el.scrollTop - el.clientHeight < 64;
  };

  // متابعة النزول لآخر المحادثة عند أي تغيّر في الحجم — لحظيًا وقبل الرسم (من غير
  // smooth scroll، اللي كان بيتخانق مع تغيّر الارتفاع ويعمل "نزلة وطلعة").
  useLayoutEffect(() => {
    const scroller = scrollRef.current;
    const content = contentRef.current;
    if (!scroller || !content) return;
    const stick = () => {
      if (pinned.current) scroller.scrollTop = scroller.scrollHeight;
    };
    const ro = new ResizeObserver(stick);
    ro.observe(content);
    ro.observe(scroller); // ارتفاع الكومبوزر بيغيّر ارتفاع الـscroller نفسه
    return () => ro.disconnect();
  }, [hasContent]);

  // تبديل محادثة أو إرسال رسالة جديدة → انزل لآخرها فورًا (قبل أول رسم)
  useLayoutEffect(() => {
    if (lastSessionKey.current !== sessionKey) {
      lastSessionKey.current = sessionKey;
      pinned.current = true;
    }
    const last = messages[messages.length - 1];
    if (last && last.role === "user" && isLocalMessageId(last.id)) pinned.current = true;
    const el = scrollRef.current;
    if (el && pinned.current) el.scrollTop = el.scrollHeight;
  }, [sessionKey, messages, hasContent]);

  if (!hasContent) {
    if (loading) return <HistorySkeleton />;
    return <WelcomeHero totalTokens={totalTokens} userName={userName} onPromptSelected={onPromptSelected} />;
  }

  // كل العناصر (المحفوظة + الرد الحيّ) في مصفوفة واحدة بمفاتيح ثابتة: عند نهاية البث
  // React بيتعرّف على نفس العنصر بالمفتاح ويحدّثه في مكانه بدل ما يبدّله.
  // حماية: مفتاح React لازم يكون فريد. لو رسالتين اتشاركوا نفس المفتاح (حالة عابرة نظريًا)
  // نعرض واحدة بس — مفتاح مكرر بيخلي React يرسم نسختين ويوميض واحدة منهم.
  const seen = new Set<string>();
  const uniqueMessages = messages.filter((m) => {
    const k = m.clientKey ?? m.id;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  // آخر رد مساعد حقيقي (مش حيّ) — بس هو اللي يظهر له زرار إعادة التوليد
  const lastAssistantId = (() => {
    for (let i = uniqueMessages.length - 1; i >= 0; i--) {
      if (uniqueMessages[i].role === "assistant") return uniqueMessages[i].id;
    }
    return null;
  })();
  const items = uniqueMessages.map((m) => (
    <MessageItem
      key={m.clientKey ?? m.id}
      message={m}
      onContinue={onContinue}
      isContinuing={continuingMessageId === m.id}
      continuationStreamingContent={continuingMessageId === m.id ? continuationStreamingContent : null}
      onPreviewFiles={onPreviewFiles}
      animateIn={m.role === "user" && isLocalMessageId(m.id)}
      isLastAssistant={m.role === "assistant" && m.id === lastAssistantId && !live}
      onRegenerate={onRegenerate}
      isRegenerating={regeneratingMessageId === m.id}
      onEdit={m.role === "user" ? onEdit : undefined}
      actionsDisabled={actionsDisabled}
    />
  ));
  if (liveMessage && live && !seen.has(live.key)) {
    items.push(
      <MessageItem
        key={live.key}
        message={liveMessage}
        live={{ agentEvents: live.agentEvents }}
        onContinue={onContinue}
        isContinuing={false}
        continuationStreamingContent={null}
        onPreviewFiles={onPreviewFiles}
        animateIn
      />
    );
  }

  return (
    <div ref={scrollRef} onScroll={onScroll} className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
      {/* pb-10: آخر سطر يفضل فوق تدرّج الإخفاء اللي فوق الكومبوزر */}
      <div ref={contentRef} className="mx-auto w-full max-w-[820px] pb-10 pt-2">
        {items}
      </div>
    </div>
  );
}
