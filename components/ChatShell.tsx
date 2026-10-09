"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { isLocalMessageId, type ChatMessage, type ChatSession, type SessionUser } from "@/lib/types";
import { reconcileClientKeys } from "@/lib/messageKeys";
import { consumeSSEStream } from "@/lib/streamClient";
import { dedupeProjectFiles, extractDeliverableFiles } from "@/lib/parseContent";
import type { ProjectFile } from "@/lib/parseContent";
import TopBar from "./TopBar";
import ChatDrawer from "./ChatDrawer";
import MessageList, { type LiveReplyState } from "./MessageList";
import BottomInputBar, { type ComposerAttachment } from "./BottomInputBar";
import ChatEndedNotice from "./ChatEndedNotice";
import QuotaExhaustedNotice from "./QuotaExhaustedNotice";
import AuthModal from "./AuthModal";
import RechargeModal from "./RechargeModal";
import PlansModal from "./PlansModal";
import type { SubscriptionInfo } from "@/lib/plans";
import ArtifactPanel from "./ArtifactPanel";
import SettingsModal from "./SettingsModal";
import ShortcutsDialog from "./ShortcutsDialog";
import Toast from "./Toast";
import type { SettingsTab } from "./AccountMenu";
import { useSettings, type ModelId } from "./SettingsContext";
import { buildAttachmentsMetaBlock, buildAttachmentsPromptBlock, extractAttachmentsMeta, extractAttachmentsPromptSection } from "@/lib/attachments";
import type { AgentEvent } from "@/lib/agentEvents";
import { extractAgentStepsMeta } from "@/lib/agentEvents";
import { Timer } from "lucide-react";
import ShareDialog from "./ShareDialog";

const PREVIEWABLE_EXTS = new Set(["html", "htm", "css", "js"]);
const SESSION_MODELS_KEY = "mlag-session-models";
const SIDEBAR_KEY = "mlag-sidebar-collapsed";

function hasPreviewableFiles(content: string): boolean {
  return extractDeliverableFiles(content).some((f) =>
    PREVIEWABLE_EXTS.has((f.path.split(".").pop() || "").toLowerCase())
  );
}

/** المستخدم كتب أمر معاينة («معاينة» / «عاين» / preview...)؟ */
function isPreviewCommand(text: string): boolean {
  const t = text
    .trim()
    .replace(/^[«"'\(\[]+/, "")
    .replace(/[»"'\)\]]+$/, "")
    .replace(/[.!؟?،,~*]+$/, "")
    .trim();
  return (
    /^(?:ممكن|عايز|عاوز|أريد|اريد|ابدأ|إبدأ|افتح|إفتح|شغل|دوس|اعمل)?\s*(?:ال)?(?:معاينة|عاين|اعاين|إعاين)(?:\s+(?:الصفحة|الموقع|الكود|النتيجة|الملفات))?$/.test(
      t
    ) || /^(?:open\s+)?preview$/i.test(t)
  );
}

function loadSessionModels(): Record<string, ModelId> {
  try {
    const raw = localStorage.getItem(SESSION_MODELS_KEY);
    if (raw) return JSON.parse(raw) as Record<string, ModelId>;
  } catch {
    // تجاهل
  }
  return {};
}

function saveSessionModels(map: Record<string, ModelId>) {
  try {
    localStorage.setItem(SESSION_MODELS_KEY, JSON.stringify(map));
  } catch {
    // تجاهل
  }
}

/**
 * بيجمّع شنكات البث ويطبّقها مرة واحدة كل فريم (requestAnimationFrame) بدل setState
 * مع كل شنك — عدد ريندرات أقل بكتير، فالنص بينزل بسلاسة ومن غير تهنيج على الموبايل.
 */
function createChunkBatcher(apply: (chunk: string) => void) {
  let buf = "";
  let raf = 0;
  const flush = () => {
    if (raf) {
      cancelAnimationFrame(raf);
      raf = 0;
    }
    if (buf) {
      const chunk = buf;
      buf = "";
      apply(chunk);
    }
  };
  return {
    push(chunk: string) {
      buf += chunk;
      if (!raf) raf = requestAnimationFrame(flush);
    },
    flush,
  };
}

const NO_MESSAGES: ChatMessage[] = [];

export default function ChatShell() {
  const { t, lang, model, setModel, customInstructions, nickname } = useSettings();
  const [authChecked, setAuthChecked] = useState(false);
  const [user, setUser] = useState<SessionUser | null>(null);
  const [showAuthModal, setShowAuthModal] = useState(false);

  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [quota, setQuota] = useState<{ total: number; used: number } | null>(null);
  const [subscription, setSubscription] = useState<SubscriptionInfo | null>(null);
  /** إمتى الرصيد هيتجدد تلقائيًا (لو خلص) — جاي من /api/quota */
  const [quotaRenewsAt, setQuotaRenewsAt] = useState<string | null>(null);

  const [drawerOpen, setDrawerOpen] = useState(false);
  // الوضع المؤقت: جلسة حقيقية بعلَم مؤقت (كل المزايا شغالة) لكنها مخفية من
  // القايمة وبتتمسح عند الخروج منها — واليتيم منها بيتنظف خلال يوم.
  const [tempSessionId, setTempSessionId] = useState<string | null>(null);
  const [shareOpen, setShareOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [toastSeq, setToastSeq] = useState(0);

  const [isGenerating, setIsGenerating] = useState(false);
  const [streamingContent, setStreamingContent] = useState("");
  const [streamingReasoning, setStreamingReasoning] = useState("");
  const [streamingAgentEvents, setStreamingAgentEvents] = useState<AgentEvent[]>([]);

  const [continuingMessageId, setContinuingMessageId] = useState<string | null>(null);
  const [continuationStreamingContent, setContinuationStreamingContent] = useState("");

  const [panelOpen, setPanelOpen] = useState(false);
  const [panelFiles, setPanelFiles] = useState<ProjectFile[]>([]);
  const [panelFocusPath, setPanelFocusPath] = useState<string | undefined>(undefined);

  const [settingsTab, setSettingsTab] = useState<SettingsTab | null>(null);
  const [showRecharge, setShowRecharge] = useState(false);
  const [showPlans, setShowPlans] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);

  // الرد الحيّ بيتربط بالشات اللي اتبعت منه (لو المستخدم فتح شات تاني ما يظهرش فيه)
  const [streamSessionId, setStreamSessionId] = useState<string | null>(null);
  const [liveKey, setLiveKey] = useState("live-0");
  // id الشات اللي رسايله هي اللي في `messages` دلوقتي — لحد ما يتحمّل الشات الجديد
  // بنعرض هيكل تحميل بدل رسايل الشات القديم أو شاشة الترحيب (كانت بتوميض).
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  const [sessionsLoaded, setSessionsLoaded] = useState(false);

  // كل شات بيتثبت على أول موديل اتبعتله رسالة بيه لحد ما يتفتح شات جديد
  const [sessionModels, setSessionModels] = useState<Record<string, ModelId>>({});
  useEffect(() => {
    setSessionModels(loadSessionModels());
    try {
      setSidebarCollapsed(localStorage.getItem(SIDEBAR_KEY) === "1");
    } catch {
      // تجاهل
    }
  }, []);
  const currentSessionRef = useRef<string | null>(null);
  currentSessionRef.current = currentSessionId;
  const messagesRef = useRef<ChatMessage[]>([]);
  messagesRef.current = messages;

  const lockedModel: ModelId | undefined = currentSessionId
    ? sessionModels[currentSessionId]
    : undefined;

  const abortRef = useRef<AbortController | null>(null);
  // جلسة فيها إرسال شغّال حاليًا — بنمنع بيها refresh الرسايل (لما شات جديد
  // بيتعمل مثلًا) من إنها تمسح الرسالة المتفائلة اللي لسه ضافتها الشاشة.
  const inFlightSessionRef = useRef<string | null>(null);
  const loadedForRef = useRef<string | null>(null);
  const clientKeysRef = useRef<Map<string, string>>(new Map());
  const sendCounterRef = useRef(0);
  const toastSeqRef = useRef(0);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    // مفتاح جديد لكل توست حتى لو نفس النص، عشان أنيميشن الدخول يتشغّل من الأول
    // ومهلة الإخفاء تتجدد بدل ما رسالة تانية تقاطع عدّاد الرسالة اللي قبلها.
    setToastSeq((s) => s + 1);
    const mySeq = toastSeqRef.current + 1;
    toastSeqRef.current = mySeq;
    setTimeout(() => {
      if (toastSeqRef.current === mySeq) setToast(null);
    }, 4500);
  }, []);

  const lockSessionModel = useCallback((sessionId: string, m: ModelId) => {
    setSessionModels((prev) => {
      if (prev[sessionId]) return prev;
      const next = { ...prev, [sessionId]: m };
      saveSessionModels(next);
      return next;
    });
  }, []);

  const forgetSessionModel = useCallback((sessionId: string) => {
    setSessionModels((prev) => {
      if (!(sessionId in prev)) return prev;
      const next = { ...prev };
      delete next[sessionId];
      saveSessionModels(next);
      return next;
    });
  }, []);

  const handlePickModel = useCallback(
    (id: ModelId) => {
      setModel(id);
      if (lockedModel && lockedModel !== id) {
        showToast(t("toastModelLocked", { current: lockedModel, picked: id }));
      }
    },
    [lockedModel, setModel, showToast, t]
  );

  const toggleSidebar = useCallback(() => {
    if (typeof window !== "undefined" && window.innerWidth < 1024) {
      setDrawerOpen((o) => !o);
      return;
    }
    setSidebarCollapsed((c) => {
      const next = !c;
      try {
        localStorage.setItem(SIDEBAR_KEY, next ? "1" : "0");
      } catch {
        // تجاهل
      }
      return next;
    });
  }, []);

  const openPanelWithFiles = useCallback((files: ProjectFile[], focusPath?: string) => {
    if (!files.length) return;
    setPanelFiles(files);
    setPanelFocusPath(focusPath);
    setPanelOpen(true);
  }, []);

  // أول ما ملف قابل للمعاينة يبدأ يتكتب أثناء البث — افتح المعاينة الحيّة على الديسكتوب
  useEffect(() => {
    if (!isGenerating || !streamingContent) return;
    if (panelOpen) return;
    if (typeof window !== "undefined" && window.innerWidth < 1024) return;
    const files = dedupeProjectFiles(extractDeliverableFiles(streamingContent));
    if (hasPreviewableFiles(streamingContent) && files.length > 0) openPanelWithFiles(files);
  }, [streamingContent, isGenerating, panelOpen, openPanelWithFiles]);

  const refreshQuota = useCallback(async () => {
    try {
      const res = await fetch("/api/quota");
      const data = await res.json();
      if (data.quota) {
        setQuota({ total: data.quota.totalAllocatedTokens, used: data.quota.usedTokens });
        setQuotaRenewsAt(data.quota.renewsAt ?? null);
        setSubscription((data.quota.subscription ?? null) as SubscriptionInfo | null);
      } else {
        setQuota(null);
        setQuotaRenewsAt(null);
        setSubscription(null);
      }
    } catch {
      // تجاهل
    }
  }, []);

  // الرصيد خلص؟ (الأدمن مالوش حد) → خانة الكتابة بتختفي ويظهر إشعار الشحن، والشات بيتفتح لما يبقى فيه توكنز.
  const quotaExhausted = !user?.isAdmin && !!quota && quota.total - quota.used <= 0;

  // وهو مقفول: بنسأل السيرفر كل شوية (بيجدد تلقائيًا بعد شهر، والدعم ممكن يشحن) وأول ما نرجع للتاب
  // — فالخانة ترجع لوحدها من غير ريفريش.
  useEffect(() => {
    if (!quotaExhausted) return;
    const id = setInterval(() => void refreshQuota(), 30_000);
    const onFocus = () => void refreshQuota();
    window.addEventListener("focus", onFocus);
    return () => {
      clearInterval(id);
      window.removeEventListener("focus", onFocus);
    };
  }, [quotaExhausted, refreshQuota]);

  const markLoaded = useCallback((id: string | null) => {
    loadedForRef.current = id;
    setLoadedFor(id);
  }, []);

  const loadMessages = useCallback(async (sessionId: string): Promise<ChatMessage[] | null> => {
    try {
      const res = await fetch(`/api/messages/${sessionId}`);
      const data = await res.json();
      return Array.isArray(data.messages) ? (data.messages as ChatMessage[]) : [];
    } catch {
      return null;
    }
  }, []);

  /** بيطبّق قايمة جاية من السيرفر — بس لو لسه المستخدم قاعد في نفس الشات (منع نتيجة قديمة تكتب فوق شات تاني).
   *  بيرجّع القايمة اللي اتطبّقت (أو null لو اتجاهلها). */
  const applyMessages = useCallback(
    (
      sessionId: string,
      list: ChatMessage[],
      liveKeyForReply: string | null = null,
      localReply: ChatMessage | null = null
    ): ChatMessage[] | null => {
      if (currentSessionRef.current !== sessionId) return null;
      let next = reconcileClientKeys(messagesRef.current, list, clientKeysRef.current, liveKeyForReply);
      // الرد اللي لسه خلص: لو السيرفر ما رجّعوش (أو رجّع رد قديم بس)، نسيب نسخة محلية بنفس
      // المفتاح — بنحكم بعد الربط مش قبله، عشان رد قديم لسه معلّق ما يتحسبش على الجديد.
      if (localReply && !next.some((m) => m.clientKey === localReply.clientKey)) {
        next = [...next, localReply];
      }
      setMessages(next);
      return next;
    },
    []
  );

  const refreshSessions = useCallback(async (): Promise<ChatSession[]> => {
    try {
      const res = await fetch("/api/sessions");
      const data = await res.json();
      const list: ChatSession[] = data.sessions || [];
      setSessions(list);
      return list;
    } catch {
      return [];
    }
  }, []);

  /** الشات اتقفل (من رد الموديل أو من رفض السيرفر) — نعلّمه فورًا من غير ما نستنى refresh. */
  const markSessionEnded = useCallback((sessionId: string, reason?: string | null, by?: "abuse" | "user" | null) => {
    setSessions((prev) =>
      prev.map((s) =>
        s.id === sessionId
          ? {
              ...s,
              endedAt: s.endedAt ?? new Date().toISOString(),
              endedReason: reason ?? s.endedReason ?? null,
              endedBy: by ?? s.endedBy ?? null,
            }
          : s
      )
    );
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/auth/me");
        const data = await res.json();
        setUser(data.user || null);
        if (!data.user || data.user.profileComplete === false) setShowAuthModal(true);
      } catch {
        setShowAuthModal(true);
      } finally {
        setAuthChecked(true);
      }
    })();
  }, []);

  // بنراقب id المستخدم مش الكائن كله: تعديل الاسم كان بيبدّل كائن user فيرجّعك لأول شات
  const userId = user?.id ?? null;
  useEffect(() => {
    if (!authChecked) return;
    if (!userId) {
      setSessions([]);
      setCurrentSessionId(null);
      setMessages([]);
      markLoaded(null);
      setQuota(null);
      setPanelOpen(false);
      setSessionsLoaded(false);
      return;
    }
    let cancelled = false;
    setSessionsLoaded(false);
    (async () => {
      const list = await refreshSessions();
      if (cancelled) return;
      setCurrentSessionId((cur) => cur ?? (list.length > 0 ? list[0].id : null));
      setSessionsLoaded(true);
      await refreshQuota();
    })();
    return () => {
      cancelled = true;
    };
  }, [authChecked, userId, refreshSessions, refreshQuota, markLoaded]);

  useEffect(() => {
    if (!currentSessionId) {
      setMessages([]);
      markLoaded(null);
      return;
    }
    // شات جديد/جاري الإرسال فيه: رسايله عندنا بالفعل — ما نحمّلش (كان بيمسح الرسالة المتفائلة)
    if (loadedForRef.current === currentSessionId) return;
    if (inFlightSessionRef.current === currentSessionId) return;
    let cancelled = false;
    clientKeysRef.current.clear();
    (async () => {
      const list = await loadMessages(currentSessionId);
      if (cancelled) return;
      // لو المستخدم بعت رسالة أثناء التحميل، نحافظ على رسالته المتفائلة
      setMessages((prev) => [
        ...(list ?? []),
        ...prev.filter((m) => isLocalMessageId(m.id) && m.sessionId === currentSessionId),
      ]);
      markLoaded(currentSessionId);
    })();
    return () => {
      cancelled = true;
    };
  }, [currentSessionId, loadMessages, markLoaded]);

  const ensureSessionId = useCallback(async (): Promise<string | null> => {
    if (currentSessionId) return currentSessionId;
    try {
      const res = await fetch("/api/sessions", { method: "POST" });
      const data = await res.json();
      if (data.session) {
        setSessions((prev) => [data.session, ...prev]);
        setCurrentSessionId(data.session.id);
        markLoaded(data.session.id);
        return data.session.id;
      }
    } catch {
      // تجاهل
    }
    return null;
  }, [currentSessionId, markLoaded]);

  /** حذف جلسة مؤقتة بصمت (تجاهل الأخطاء) */
  const dropTempSession = useCallback(
    async (id: string | null) => {
      if (!id) return;
      try {
        await fetch(`/api/sessions/${id}`, { method: "DELETE" });
      } catch {
        // تجاهل
      }
      forgetSessionModel(id);
    },
    [forgetSessionModel]
  );

  /** بدء محادثة مؤقتة — رسايلها مش بتظهر في القايمة وبتتمسح عند الخروج */
  const startTempChat = useCallback(async () => {
    if (!user) {
      setShowAuthModal(true);
      return;
    }
    if (tempSessionId) await dropTempSession(tempSessionId);
    try {
      const res = await fetch("/api/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: t("tempChatTitle"), isTemp: true }),
      });
      const data = await res.json();
      if (data.session) {
        setTempSessionId(data.session.id);
        setCurrentSessionId(data.session.id);
        setMessages([]);
        markLoaded(data.session.id);
        setDrawerOpen(false);
        setPanelOpen(false);
      }
    } catch {
      showToast(t("toastNewChatFail"));
    }
  }, [user, tempSessionId, dropTempSession, showToast, t, markLoaded]);

  /** الخروج من الوضع المؤقت = مسح الجلسة المؤقتة نهائيًا */
  const exitTempChat = useCallback(async () => {
    const id = tempSessionId;
    setTempSessionId(null);
    if (id) await dropTempSession(id);
    setCurrentSessionId(null);
    setMessages([]);
    markLoaded(null);
    setPanelOpen(false);
  }, [tempSessionId, dropTempSession, markLoaded]);

  const handleNewChat = useCallback(async () => {
    if (!user) {
      setShowAuthModal(true);
      return;
    }
    if (tempSessionId) {
      const tid = tempSessionId;
      setTempSessionId(null);
      await dropTempSession(tid);
    }
    // لو الشات الحالي فاضي أصلًا ما نعملش واحد جديد فوقه
    if (currentSessionId && messages.length === 0) {
      setDrawerOpen(false);
      document.getElementById("mlag-composer")?.focus();
      return;
    }
    try {
      const res = await fetch("/api/sessions", { method: "POST" });
      const data = await res.json();
      if (data.session) {
        setSessions((prev) => [data.session, ...prev]);
        setCurrentSessionId(data.session.id);
        setMessages([]);
        markLoaded(data.session.id);
        setDrawerOpen(false);
        setPanelOpen(false);
        window.setTimeout(() => document.getElementById("mlag-composer")?.focus(), 50);
      }
    } catch {
      showToast(t("toastNewChatFail"));
    }
  }, [user, currentSessionId, messages.length, showToast, t, markLoaded]);

  const handleSelectSession = (id: string) => {
    if (tempSessionId && tempSessionId !== id) {
      const tid = tempSessionId;
      setTempSessionId(null);
      void dropTempSession(tid);
    }
    setCurrentSessionId(id);
    setDrawerOpen(false);
    setPanelOpen(false);
  };

  /** حذف محادثة من القايمة — بتأكيد الأول عشان كانت بتتمسح بضغطة واحدة بالغلط */
  const handleDeleteSession = async (id: string) => {
    const target = sessions.find((s) => s.id === id);
    setConfirmDelete({
      title: t("deleteChatTitle"),
      body: t("deleteChatBody", { title: target?.title || "…" }),
      action: async () => {
        try {
          await fetch(`/api/sessions/${id}`, { method: "DELETE" });
          forgetSessionModel(id);
          const list = await refreshSessions();
          if (currentSessionRef.current === id) {
            setCurrentSessionId(list.length > 0 ? list[0].id : null);
            setPanelOpen(false);
          }
        } catch {
          showToast(t("toastDeleteFail"));
        }
      },
    });
  };

  const handleClearAll = async () => {
    try {
      const res = await fetch("/api/sessions/clear", { method: "POST" });
      if (!res.ok) throw new Error("clear failed");
      setSessions([]);
      setCurrentSessionId(null);
      setMessages([]);
      markLoaded(null);
      setPanelOpen(false);
      setSessionModels({});
      try {
        localStorage.removeItem(SESSION_MODELS_KEY);
      } catch {
        // تجاهل
      }
    } catch {
      showToast(t("toastClearFail"));
      throw new Error("clear failed");
    }
  };

  const handleLogout = async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } finally {
      if (tempSessionId) {
        const tid = tempSessionId;
        setTempSessionId(null);
        await dropTempSession(tid);
      }
      setUser(null);
      setDrawerOpen(false);
      setShowAuthModal(true);
    }
  };

  const handleAuthenticated = (u: SessionUser) => {
    setUser(u);
    setShowAuthModal(false);
  };

  const handleNameUpdated = (newName: string) => {
    setUser((u) => (u ? { ...u, displayName: newName } : u));
  };

  const personalizationBody = { customInstructions, nickname };

  /**
   * لو الرد اتوقف (Stop) أو انقطع، السيرفر بيحفظ الرد الجزئي بعد لحظات — فبنسيب نسخة
   * محلية من الرد ظاهرة بنفس مفتاح الواجهة، ونسحب النسخة المحفوظة على دفعات لحد ما تظهر
   * (بتحل محل المحلية في مكانها من غير وميض).
   */
  const scheduleTailSync = useCallback(
    (sessionId: string, attempt = 0) => {
      const delays = [700, 2000, 5000, 10000, 20000];
      if (attempt >= delays.length) return;
      window.setTimeout(async () => {
        if (currentSessionRef.current !== sessionId || inFlightSessionRef.current) return;
        const fresh = await loadMessages(sessionId);
        if (currentSessionRef.current !== sessionId || inFlightSessionRef.current) return;
        if (!fresh) {
          scheduleTailSync(sessionId, attempt + 1);
          return;
        }
        const applied = applyMessages(sessionId, fresh);
        if (applied && applied.some((m) => isLocalMessageId(m.id))) scheduleTailSync(sessionId, attempt + 1);
      }, delays[attempt]);
    },
    [loadMessages, applyMessages]
  );

  // بيرجّع true لو الرسالة اتبعتت فعلاً (عشان BottomInputBar يمسح نص/مرفقات
  // الكومبوزر بس لما نتأكد إن الإرسال نجح — لو رجّعت false، الكومبوزر بيفضل
  // زي ما هو عشان المستخدم ما يضيعش اللي كان كاتبه لو حصل خطأ).
  // ملحوظة: لو المستخدم داس Stop بعد ما الرد بدأ، ده "اتبعتت" (true) — الرسالة
  // اتحفظت في السيرفر، فما نرجّعش نصها للكومبوزر (كان بيرجّع الرسالة الطويلة كاملة).
  const sendMessage = useCallback(
    async (text: string, attachments: ComposerAttachment[] = []): Promise<boolean> => {
      const trimmed = text.trim();
      if ((!trimmed && attachments.length === 0) || isGenerating) return false;
      if (!user) {
        setShowAuthModal(true);
        return false;
      }

      if (attachments.length === 0 && isPreviewCommand(trimmed)) {
        const lastAssistant = [...messagesRef.current].reverse().find((m) => m.role === "assistant");
        const files = lastAssistant ? dedupeProjectFiles(extractDeliverableFiles(lastAssistant.content)) : [];
        if (files.length > 0) {
          openPanelWithFiles(files);
          return true;
        }
        showToast(t("toastNoPreview"));
        return false;
      }

      const sessionId = await ensureSessionId();
      if (!sessionId) {
        showToast(t("toastSessionFail"));
        return false;
      }
      inFlightSessionRef.current = sessionId;

      const effectiveModel = sessionModels[sessionId] ?? model;
      lockSessionModel(sessionId, effectiveModel);

      // نبني كتلة المرفقات (بيانات الصور Base64 + محتوى الملفات النصية المستخرج)
      // ونحطها في نص الرسالة الفعلي المتخزّن — عشان الموديل يقدر يقرا محتوى
      // الملفات في هذه الرسالة وفي أي رسالة تالية كمان (السياق بيتبني من
      // رسايل الداتابيز)، والمستخدم يشوف صوره وملفاته في فقاعته. MessageItem
      // بيفصل الجزء الشكلي (الصور + كارت الملفات) عن نص المستخدم وقت العرض
      // عشان الفقاعة تفضل نضيفة بصريًا من غير ما يضيع محتوى الملف من الموديل.
      const attachmentsMeta = buildAttachmentsMetaBlock(attachments);
      const attachmentsPromptBlock = buildAttachmentsPromptBlock(
        attachments.map((a) => ({
          id: "",
          file: a.file,
          kind: a.kind,
          extractedText: a.extractedText,
          loading: false,
        }))
      );
      const storedContent = trimmed + attachmentsMeta + attachmentsPromptBlock;

      const before = messagesRef.current.filter((m) => !isLocalMessageId(m.id));
      const userCountBefore = before.filter((m) => m.role === "user").length;

      const optimisticUser: ChatMessage = {
        id: `tmp-${Date.now()}`,
        sessionId,
        role: "user",
        content: storedContent,
        reasoning: null,
        thinkingDurationMs: null,
        isTruncated: false,
        tokensUsed: 0,
        createdAt: new Date().toISOString(),
      };
      const replyKey = `live-${++sendCounterRef.current}`;

      setLiveKey(replyKey);
      setStreamSessionId(sessionId);
      setMessages((prev) => [...prev, optimisticUser]);
      setIsGenerating(true);
      setStreamingContent("");
      setStreamingReasoning("");
      setStreamingAgentEvents([]);

      const controller = new AbortController();
      abortRef.current = controller;
      let accContent = "";
      let accReasoning = "";
      let accAgentEvents: AgentEvent[] = [];
      let accepted = false; // السيرفر قبل الطلب → رسالة المستخدم اتحفظت
      let rejected = false;
      const contentBatch = createChunkBatcher((c) => setStreamingContent((prev) => prev + c));
      const reasoningBatch = createChunkBatcher((c) => setStreamingReasoning((prev) => prev + c));

      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sessionId,
            message: storedContent,
            uiLanguage: lang,
            model: effectiveModel,
            ...personalizationBody,
          }),
          signal: controller.signal,
        });

        if (!res.ok) {
          rejected = true;
          const data = await res.json().catch(() => ({}));
          setMessages((prev) => prev.filter((m) => m.id !== optimisticUser.id));
          if (data.sessionEnded) {
            markSessionEnded(sessionId);
            showToast(t("toastChatEnded"));
          } else {
            showToast(data.error || t("toastSendFail"));
            if (data.quotaExhausted) void refreshQuota();
          }
        } else {
          accepted = true;
          const reader = res.body!.getReader();
          await consumeSSEStream(reader, {
            onContent: (chunk) => {
              accContent += chunk;
              contentBatch.push(chunk);
            },
            onReasoning: (chunk) => {
              accReasoning += chunk;
              reasoningBatch.push(chunk);
            },
            onAgentEvent: (event) => {
              accAgentEvents = [...accAgentEvents, event];
              setStreamingAgentEvents(accAgentEvents);
            },
            onQuotaExhausted: () => void refreshQuota(),
            onSessionEnded: (info) => markSessionEnded(sessionId, info.reason, info.by),
          });
        }
      } catch (e: any) {
        if (e?.name !== "AbortError") showToast(t("toastDrop"));
      }

      // ===== نهاية البث =====
      abortRef.current = null;
      contentBatch.flush();
      reasoningBatch.flush();

      const producedFiles = accContent ? dedupeProjectFiles(extractDeliverableFiles(accContent)) : [];
      if (producedFiles.length > 0) {
        if (!panelOpen && hasPreviewableFiles(accContent)) {
          openPanelWithFiles(producedFiles);
          showToast(t("toastPreviewReady"));
        } else {
          setPanelFiles(producedFiles);
        }
      }

      // نجيب الرسايل المحفوظة الأول (الرد الحيّ لسه ظاهر)، وبعدين نبدّل في خطوة واحدة
      // (رندر واحد): الرد الحيّ بيتحدّث في مكانه لرسالة محفوظة بنفس المفتاح — من غير
      // نسختين مع بعض، من غير سكرول ناعم، ومن غير إعادة تشغيل أنيميشن الدخول.
      const fresh = await loadMessages(sessionId);
      const persisted = !!fresh && fresh.filter((m) => m.role === "user").length > userCountBefore;

      // نسخة محلية من الرد بنفس المفتاح — بتتضاف بس لو السيرفر ما رجّعش رد الرسالة دي فعلًا
      const localReply: ChatMessage | null =
        !rejected && accContent
          ? {
              id: `local-${replyKey}`,
              clientKey: replyKey,
              sessionId,
              role: "assistant",
              content: accContent,
              reasoning: accReasoning || null,
              thinkingDurationMs: null,
              isTruncated: false,
              tokensUsed: 0,
              createdAt: new Date().toISOString(),
            }
          : null;

      let applied: ChatMessage[] | null = null;
      if (fresh) {
        applied = applyMessages(sessionId, fresh, accepted ? replyKey : null, localReply);
      } else if (localReply && currentSessionRef.current === sessionId) {
        setMessages((prev) => [...prev, localReply]);
      }
      if (inFlightSessionRef.current === sessionId) inFlightSessionRef.current = null;
      setIsGenerating(false);
      setStreamSessionId(null);
      setStreamingContent("");
      setStreamingReasoning("");
      setStreamingAgentEvents([]);

      // الرصيد والعنوان بعد الرندر ومن غير ما نستنّاهم
      void refreshQuota();
      void refreshSessions();
      if (!fresh || (applied && applied.some((m) => isLocalMessageId(m.id)))) scheduleTailSync(sessionId);

      if (rejected) return false;
      return accepted || persisted;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      isGenerating,
      user,
      lang,
      model,
      sessionModels,
      lockSessionModel,
      customInstructions,
      nickname,
      t,
      ensureSessionId,
      loadMessages,
      applyMessages,
      scheduleTailSync,
      refreshQuota,
      refreshSessions,
      panelOpen,
      openPanelWithFiles,
      showToast,
      markSessionEnded,
    ]
  );

  // ===== تعديل / إعادة توليد الرسايل =====
  // ملحوظة ترتيب: الدوال دي بتستخدم sendMessage اللي متعرفة تحت، فبنخزنها في ref
  // — التعريف هنا فوق أول استخدام، والملء بعد تعريف sendMessage مباشرة.
  const sendMessageRef = useRef<(text: string, attachments?: ComposerAttachment[]) => Promise<boolean>>(
    async () => false
  );

  // املا الـ ref بعد تعريف sendMessage عشان دوال التعديل/إعادة التوليد تستخدمها
  // (التعريف فوق مع باقي الـ refs، والملء هنا بعد ما sendMessage بقت موجودة)
  useEffect(() => {
    sendMessageRef.current = sendMessage;
  }, [sendMessage]);

  const continueMessage = useCallback(
    async (messageId: string) => {
      const sessionId = currentSessionRef.current;
      if (!user || !sessionId || continuingMessageId || abortRef.current) return;
      setContinuingMessageId(messageId);
      setContinuationStreamingContent("");

      const controller = new AbortController();
      abortRef.current = controller;
      let accContent = "";
      const batch = createChunkBatcher((c) => setContinuationStreamingContent((prev) => prev + c));
      const effectiveModel = sessionModels[sessionId] ?? model;

      try {
        const res = await fetch("/api/chat/continue", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sessionId,
            messageId,
            uiLanguage: lang,
            model: effectiveModel,
            ...personalizationBody,
          }),
          signal: controller.signal,
        });

        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          if (data.sessionEnded) markSessionEnded(sessionId);
          if (data.quotaExhausted) void refreshQuota();
          showToast(data.error || t("toastContinueFail"));
        } else {
          const reader = res.body!.getReader();
          await consumeSSEStream(reader, {
            onContent: (chunk) => {
              accContent += chunk;
              batch.push(chunk);
            },
            onQuotaExhausted: () => void refreshQuota(),
          });
        }
      } catch (e: any) {
        if (e?.name !== "AbortError") showToast(t("toastContinueDrop"));
      }

      abortRef.current = null;
      batch.flush();
      const originalMsg = messagesRef.current.find((m) => m.id === messageId);
      const mergedContent = (originalMsg?.content || "") + accContent;
      const producedFiles = mergedContent ? dedupeProjectFiles(extractDeliverableFiles(mergedContent)) : [];
      if (producedFiles.length > 0) {
        if (!panelOpen && hasPreviewableFiles(mergedContent)) {
          openPanelWithFiles(producedFiles);
          showToast(t("toastPreviewReady"));
        } else {
          setPanelFiles(producedFiles);
        }
      }

      // نفس فكرة الإرسال: نبدّل في رندر واحد — الرسالة المحفوظة فيها الإضافة بالفعل، فلازم
      // نصفّر نص "الإكمال الحيّ" في نفس اللحظة وإلا الجزء الجديد بيظهر مرتين لحظة.
      const fresh = await loadMessages(sessionId);
      if (fresh) {
        const grown = fresh.some((m) => m.id === messageId && m.content.length > (originalMsg?.content.length ?? 0));
        const list =
          !grown && accContent && originalMsg
            ? fresh.map((m) => (m.id === messageId ? { ...m, content: mergedContent } : m))
            : fresh;
        applyMessages(sessionId, list);
        if (!grown && accContent) scheduleTailSync(sessionId);
      }
      setContinuingMessageId(null);
      setContinuationStreamingContent("");
      void refreshQuota();
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      user,
      continuingMessageId,
      lang,
      model,
      sessionModels,
      customInstructions,
      nickname,
      t,
      loadMessages,
      applyMessages,
      scheduleTailSync,
      refreshQuota,
      panelOpen,
      openPanelWithFiles,
      showToast,
    ]
  );

  const stopGeneration = () => {
    abortRef.current?.abort();
  };

  const [editingMessage, setEditingMessage] = useState<ChatMessage | null>(null);
  const [regeneratingMessageId, setRegeneratingMessageId] = useState<string | null>(null);
  const [msgActionBusy, setMsgActionBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<{
    title: string;
    body: string;
    action: () => Promise<void>;
  } | null>(null);
  const messageActionsLocked = isGenerating || msgActionBusy || continuingMessageId !== null;

  const startEdit = useCallback(
    (m: ChatMessage) => {
      if (messageActionsLocked) return;
      setEditingMessage(m);
    },
    [messageActionsLocked]
  );

  /** حفظ التعديل: يحدّث الرسالة ويمسح اللي بعدها، وبعدين يبعت النص الجديد كأنه رسالة جديدة */
  const saveEdit = useCallback(
    async (text: string) => {
      const target = editingMessage;
      const sessionId = currentSessionRef.current;
      if (!target || !sessionId || msgActionBusy) return;
      const trimmed = text.trim();
      if (!trimmed) return;
      setMsgActionBusy(true);
      try {
        const res = await fetch(`/api/messages/${sessionId}/edit`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messageId: target.id, content: trimmed }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          showToast(data.error || t("toastEditFail"));
          return;
        }
        setEditingMessage(null);
        const fresh = await loadMessages(sessionId);
        if (fresh) applyMessages(sessionId, fresh);
        // ابعت النص المعدّل — الرد القديم اتمسح والسيرفر هيولّد رد جديد عليه
        await sendMessageRef.current(trimmed);
      } catch {
        showToast(t("toastEditFail"));
      } finally {
        setMsgActionBusy(false);
      }
    },
    [editingMessage, msgActionBusy, showToast, t, loadMessages, applyMessages]
  );

  /** إعادة توليد آخر رد: يمسح الرد القديم ويبعت نفس رسالة المستخدم تاني */
  const regenerateReply = useCallback(
    async (messageId: string) => {
      const sessionId = currentSessionRef.current;
      if (!sessionId || messageActionsLocked) return;
      setRegeneratingMessageId(messageId);
      setMsgActionBusy(true);
      try {
        const res = await fetch(`/api/messages/${sessionId}/regenerate`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messageId }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          showToast(data.error || t("toastRegenerateFail"));
          return;
        }
        const fresh = await loadMessages(sessionId);
        if (fresh) applyMessages(sessionId, fresh);
        // السيرفر رجّع محتوى رسالة المستخدم المخزنة — نبعتها زي ما هي (بمرفقاتها)
        // عشان الموديل يشوف الصور/الملفات زي أول مرة، مش النص الحافي بس.
        const stored = String(data.message || "");
        if (stored.trim()) await sendMessageRef.current(stored);
      } catch {
        showToast(t("toastRegenerateFail"));
      } finally {
        setRegeneratingMessageId(null);
        setMsgActionBusy(false);
      }
    },
    [messageActionsLocked, showToast, t, loadMessages, applyMessages]
  );

  /** تقييم رد (👍/👎) — تكرار نفس التقييم يلغيه */
  const sendFeedback = useCallback(
    async (messageId: string, rating: 1 | -1) => {
      const sessionId = currentSessionRef.current;
      if (!sessionId || messageActionsLocked) return;
      const current = messagesRef.current.find((m) => m.id === messageId)?.feedback ?? null;
      const next = current === rating ? 0 : rating;
      setMessages((prev) =>
        prev.map((m) => (m.id === messageId ? { ...m, feedback: (next === 0 ? null : next) as 1 | -1 | null } : m))
      );
      try {
        const res = await fetch(`/api/messages/${sessionId}/feedback`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messageId, rating: next }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || "failed");
        if (data.feedback !== undefined) {
          setMessages((prev) =>
            prev.map((m) => (m.id === messageId ? { ...m, feedback: data.feedback } : m))
          );
        }
      } catch {
        const fresh = await loadMessages(sessionId);
        if (fresh) applyMessages(sessionId, fresh);
      }
    },
    [messageActionsLocked, loadMessages, applyMessages]
  );

  /** تثبيت/إلغاء تثبيت محادثة أعلى القايمة */
  const togglePin = useCallback(
    async (id: string, pinned: boolean) => {
      try {
        const res = await fetch(`/api/sessions/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ pinned }),
        });
        if (!res.ok) throw new Error("pin failed");
        await refreshSessions();
      } catch {
        showToast(t("errGeneric"));
      }
    },
    [refreshSessions, showToast, t]
  );

  /** تحميل المحادثة كملف Markdown — النص المرئي فقط (بلا تفكير داخلي ولا توكنز) */
  const exportSessionMd = useCallback(
    async (id: string) => {
      const target = sessions.find((s) => s.id === id);
      try {
        const res = await fetch(`/api/messages/${id}`);
        const data = await res.json().catch(() => ({}));
        const list: ChatMessage[] = Array.isArray(data.messages) ? data.messages : [];
        if (list.length === 0) {
          showToast(t("toastExportFail"));
          return;
        }
        const lines: string[] = [`# ${target?.title || t("newChat")}`, ""];
        for (const m of list) {
          if (m.role !== "user" && m.role !== "assistant") continue;
          lines.push(m.role === "user" ? `## ${t("exportYou")}` : "## MALG", "");
          let text = String(m.content || "");
          try {
            text =
              m.role === "assistant"
                ? extractAgentStepsMeta(text).visibleText
                : extractAttachmentsMeta(text).visibleText;
          } catch {
            // خام
          }
          lines.push(text.trim() || "…", "");
        }
        const blob = new Blob([lines.join("\n")], { type: "text/markdown;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${(target?.title || "chat").slice(0, 40)}.md`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 5000);
      } catch {
        showToast(t("toastExportFail"));
      }
    },
    [sessions, showToast, t]
  );

  const openSettings = useCallback((tab: SettingsTab = "general") => {
    setDrawerOpen(false);
    setSettingsTab(tab);
  }, []);

  const openRecharge = useCallback(() => {
    setDrawerOpen(false);
    setShowRecharge(true);
  }, []);

  const openPlans = useCallback(() => {
    setDrawerOpen(false);
    setShowPlans(true);
  }, []);

  // اختصارات الكيبورد العامة
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      const key = e.key.toLowerCase();
      if (mod && e.shiftKey && key === "o") {
        e.preventDefault();
        void handleNewChat();
      } else if (mod && e.shiftKey && key === "s") {
        e.preventDefault();
        toggleSidebar();
      } else if (mod && !e.shiftKey && e.key === ",") {
        e.preventDefault();
        openSettings("general");
      } else if (mod && e.key === "/") {
        e.preventDefault();
        setShowShortcuts((s) => !s);
      } else if (e.shiftKey && e.key === "Escape") {
        e.preventDefault();
        document.getElementById("mlag-composer")?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [handleNewChat, toggleSidebar, openSettings]);

  const remainingTokens = quota ? Math.max(quota.total - quota.used, 0) : null;

  const liveStreamFiles =
    isGenerating && streamingContent ? dedupeProjectFiles(extractDeliverableFiles(streamingContent)) : null;

  // الرد الحيّ بيظهر بس في الشات اللي اتبعت منه
  const live = useMemo<LiveReplyState | null>(
    () =>
      isGenerating && streamSessionId !== null && streamSessionId === currentSessionId
        ? { key: liveKey, content: streamingContent, reasoning: streamingReasoning, agentEvents: streamingAgentEvents }
        : null,
    [isGenerating, streamSessionId, currentSessionId, liveKey, streamingContent, streamingReasoning, streamingAgentEvents]
  );
  // الشات الحالي اتقفل؟ (الموديل أنهاه بعد تحذير) → خانة الكتابة بتختفي
  const currentSession = sessions.find((s) => s.id === currentSessionId);
  const currentSessionEnded = !!currentSession?.endedAt;
  const inTempMode = tempSessionId !== null && currentSessionId === tempSessionId;

  // لحد ما نعرف الحساب والشات والرسايل: هيكل تحميل بدل شاشة الترحيب أو رسايل شات قديم
  const messagesLoading =
    !authChecked || (!!user && (!sessionsLoaded || (currentSessionId !== null && loadedFor !== currentSessionId)));

  return (
    <div id="mlag-main" className="flex h-[100dvh] overflow-hidden bg-ground">
      <ChatDrawer
        open={drawerOpen}
        collapsed={sidebarCollapsed}
        onClose={() => setDrawerOpen(false)}
        onCollapse={toggleSidebar}
        sessions={sessions}
        currentSessionId={currentSessionId}
        onSelectSession={handleSelectSession}
        onNewChat={handleNewChat}
        onDeleteSession={handleDeleteSession}
        onTogglePin={togglePin}
        onExportSession={exportSessionMd}
        onNewTempChat={startTempChat}
        inTempMode={inTempMode}
        user={user}
        quota={quota}
        subscription={subscription}
        onOpenAuth={() => {
          setDrawerOpen(false);
          setShowAuthModal(true);
        }}
        onLogout={handleLogout}
        onOpenSettings={openSettings}
        onOpenRecharge={openRecharge}
        onOpenPlans={openPlans}
        onOpenShortcuts={() => {
          setDrawerOpen(false);
          setShowShortcuts(true);
        }}
      />

      <main className="flex min-w-0 flex-1 flex-col">
        <TopBar
          onToggleDrawer={toggleSidebar}
          sidebarCollapsed={sidebarCollapsed}
          remainingTokens={user?.isAdmin ? null : remainingTokens}
          totalTokens={quota?.total ?? null}
          onOpenRecharge={openRecharge}
          onNewChat={handleNewChat}
          lockedModel={lockedModel}
          onPickModel={handlePickModel}
          onLockedModel={() => {
            showToast(t("modelLockedToast"));
            setShowPlans(true);
          }}
          onShare={currentSessionId && !inTempMode ? () => setShareOpen(true) : undefined}
        />

        {inTempMode && (
          <div className="flex shrink-0 items-center justify-center gap-2 border-b border-hair bg-surface-2 px-4 py-1.5 text-[12px] text-ink-2">
            <Timer size={13} className="shrink-0 text-accent" />
            <span className="truncate">{t("tempBanner")}</span>
            <button onClick={exitTempChat} className="shrink-0 font-medium text-accent hover:underline">
              {t("tempExit")}
            </button>
          </div>
        )}

        <MessageList
          messages={messages}
          live={live}
          loading={messagesLoading}
          sessionKey={currentSessionId}
          totalTokens={quota?.total ?? 500000}
          userName={user?.displayName}
          onPromptSelected={(p) => sendMessage(p)}
          onContinue={continueMessage}
          continuingMessageId={continuingMessageId}
          continuationStreamingContent={continuationStreamingContent}
          onPreviewFiles={openPanelWithFiles}
          onRegenerate={regenerateReply}
          regeneratingMessageId={regeneratingMessageId}
          onEdit={startEdit}
          onFeedback={sendFeedback}
          actionsDisabled={messageActionsLocked}
        />

        {currentSessionEnded && !isGenerating ? (
          <ChatEndedNotice endedBy={currentSession?.endedBy ?? null} onNewChat={handleNewChat} />
        ) : quotaExhausted && !isGenerating ? (
          <QuotaExhaustedNotice renewsAt={quotaRenewsAt} onRecharge={openRecharge} />
        ) : (
          <BottomInputBar
            isGenerating={isGenerating}
            onSend={sendMessage}
            onStop={stopGeneration}
            disabled={!authChecked}
          />
        )}
      </main>

      {panelOpen && panelFiles.length > 0 && (
        <ArtifactPanel
          files={liveStreamFiles && liveStreamFiles.length > 0 ? liveStreamFiles : panelFiles}
          focusPath={panelFocusPath}
          onClose={() => setPanelOpen(false)}
        />
      )}

      {shareOpen && currentSessionId && !inTempMode && (
        <ShareDialog
          sessionId={currentSessionId}
          sessionTitle={currentSession?.title || ""}
          initialToken={currentSession?.shareToken ?? null}
          onClose={() => setShareOpen(false)}
          onTokenChange={(token) =>
            setSessions((prev) => prev.map((s) => (s.id === currentSessionId ? { ...s, shareToken: token } : s)))
          }
        />
      )}

      {showAuthModal && (
        <AuthModal
          pendingUser={user && user.profileComplete === false ? user : null}
          onClose={() => setShowAuthModal(false)}
          onAuthenticated={handleAuthenticated}
        />
      )}

      {settingsTab && (
        <SettingsModal
          user={user}
          quota={quota}
          subscription={subscription}
          initialTab={settingsTab}
          sessionsCount={sessions.length}
          onClose={() => setSettingsTab(null)}
          onNameUpdated={handleNameUpdated}
          onLogout={handleLogout}
          onOpenRecharge={openRecharge}
          onOpenPlans={openPlans}
          onClearAll={handleClearAll}
          onToast={showToast}
        />
      )}

      {showShortcuts && <ShortcutsDialog onClose={() => setShowShortcuts(false)} />}

      {showRecharge && (
        <RechargeModal
          user={user}
          quota={quota}
          subscription={subscription}
          onOpenPlans={() => {
            setShowRecharge(false);
            setShowPlans(true);
          }}
          onClose={() => setShowRecharge(false)}
        />
      )}

      {showPlans && (
        <PlansModal user={user} subscription={subscription} onClose={() => setShowPlans(false)} />
      )}

      {toast && <Toast key={toastSeq} message={toast} onClose={() => setToast(null)} />}

      {editingMessage && (
        <EditMessageDialog
          message={editingMessage}
          busy={msgActionBusy}
          onCancel={() => setEditingMessage(null)}
          onSave={saveEdit}
        />
      )}

      {confirmDelete && (
        <ConfirmDeleteDialog
          title={confirmDelete.title}
          body={confirmDelete.body}
          busy={msgActionBusy}
          onCancel={() => setConfirmDelete(null)}
          onConfirm={async () => {
            const act = confirmDelete.action;
            setConfirmDelete(null);
            await act();
          }}
        />
      )}
    </div>
  );
}

function EditMessageDialog({
  message,
  busy,
  onCancel,
  onSave,
}: {
  message: ChatMessage;
  busy: boolean;
  onCancel: () => void;
  onSave: (text: string) => Promise<void>;
}) {
  const { t } = useSettings();
  const [text, setText] = useState(() => plainUserText(message.content));
  const [confirmSave, setConfirmSave] = useState(false);

  useEffect(() => {
    setText(plainUserText(message.content));
    setConfirmSave(false);
  }, [message]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  return (
    <div
      className="animate-fade fixed inset-0 z-modal flex items-end justify-center bg-black/30 p-4 backdrop-blur-sm sm:items-center"
      onClick={onCancel}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t("editMessage")}
        onClick={(e) => e.stopPropagation()}
        className="animate-slideUp w-full max-w-lg overflow-hidden rounded-xl border border-hair bg-surface shadow-3"
      >
        <div className="border-b border-hair px-4 py-3">
          <h2 className="text-[14px] font-semibold text-ink">{t("editMessage")}</h2>
        </div>
        <div className="p-4">
          <p className="mb-2.5 rounded-md bg-warn-soft px-3 py-2 text-[12.5px] leading-5 text-warn">
            {t("editDestructiveWarn")}
          </p>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={5}
            autoFocus
            dir="auto"
            disabled={busy}
            placeholder={t("placeholder")}
            className="max-h-[40dvh] w-full resize-y rounded-md border border-hair bg-surface-2 px-3 py-2.5 text-[14px] leading-7 text-ink placeholder:text-ink-3 focus:border-accent-line focus:outline-none disabled:opacity-60"
          />
        </div>
        <div className="flex gap-2 border-t border-hair px-4 py-3">
          <button
            onClick={onCancel}
            disabled={busy}
            className="flex-1 rounded-md border border-hair bg-surface-2 py-2.5 text-[13.5px] font-medium text-ink-2 hover:text-ink disabled:opacity-40"
          >
            {t("editCancel")}
          </button>
          <button
            onClick={() => {
              if (confirmSave) void onSave(text);
              else {
                setConfirmSave(true);
                setTimeout(() => setConfirmSave(false), 4000);
              }
            }}
            disabled={busy || !text.trim()}
            className="flex flex-1 items-center justify-center gap-2 rounded-md bg-accent py-2.5 text-[13.5px] font-semibold text-accent-ink hover:bg-accent-hover disabled:opacity-40"
          >
            {busy && <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-accent-ink border-t-transparent" />}
            {confirmSave ? t("editConfirmSave") : t("editSave")}
          </button>
        </div>
      </div>
    </div>
  );
}

function ConfirmDeleteDialog({
  title,
  body,
  busy,
  onCancel,
  onConfirm,
}: {
  title: string;
  body: string;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => Promise<void>;
}) {
  const { t } = useSettings();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  return (
    <div
      className="animate-fade fixed inset-0 z-modal flex items-end justify-center bg-black/30 p-4 backdrop-blur-sm sm:items-center"
      onClick={onCancel}
      role="presentation"
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        className="animate-slideUp w-full max-w-sm overflow-hidden rounded-xl border border-hair bg-surface shadow-3"
      >
        <div className="p-4">
          <h2 className="text-[14px] font-semibold text-ink">{title}</h2>
          <p className="mt-1.5 text-[13px] leading-6 text-ink-2">{body}</p>
        </div>
        <div className="flex gap-2 border-t border-hair px-4 py-3">
          <button
            onClick={onCancel}
            disabled={busy}
            className="flex-1 rounded-md border border-hair bg-surface-2 py-2.5 text-[13.5px] font-medium text-ink-2 hover:text-ink disabled:opacity-40"
          >
            {t("cancel")}
          </button>
          <button
            onClick={() => void onConfirm()}
            disabled={busy}
            className="flex flex-1 items-center justify-center gap-2 rounded-md bg-danger-soft py-2.5 text-[13.5px] font-semibold text-danger hover:bg-danger hover:text-white disabled:opacity-40"
          >
            {busy && <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-danger border-t-transparent" />}
            {t("confirmDelete")}
          </button>
        </div>
      </div>
    </div>
  );
}

/** النص اللي المستخدم كتبه فعلاً من غير بيانات المرفقات المخزنة */
function plainUserText(stored: string): string {
  const meta = extractAttachmentsMeta(stored);
  return extractAttachmentsPromptSection(meta.visibleText).mainText;
}
