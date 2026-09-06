"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ChatMessage, ChatSession, SessionUser } from "@/lib/types";
import { consumeSSEStream } from "@/lib/streamClient";
import { extractProjectFiles } from "@/lib/parseContent";
import type { ProjectFile } from "@/lib/parseContent";
import TopBar from "./TopBar";
import ChatDrawer from "./ChatDrawer";
import MessageList from "./MessageList";
import BottomInputBar from "./BottomInputBar";
import AuthModal from "./AuthModal";
import CodeRunnerModal from "./CodeRunnerModal";
import ArtifactPanel from "./ArtifactPanel";
import SettingsModal from "./SettingsModal";
import Toast from "./Toast";
import { useSettings } from "./SettingsContext";

const PREVIEWABLE_EXTS = new Set(["html", "htm", "css", "js"]);

/** هل الرد ده فيه كود صفحة/ويب يقدر يتعاين؟ */
function hasPreviewableFiles(content: string): boolean {
  return extractProjectFiles(content).some((f) =>
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

export default function ChatShell() {
  const { t, lang, model } = useSettings();
  const [authChecked, setAuthChecked] = useState(false);
  const [user, setUser] = useState<SessionUser | null>(null);
  const [showAuthModal, setShowAuthModal] = useState(false);

  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [quota, setQuota] = useState<{ total: number; used: number } | null>(null);

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const [isGenerating, setIsGenerating] = useState(false);
  const [streamingContent, setStreamingContent] = useState("");
  const [streamingReasoning, setStreamingReasoning] = useState("");

  const [continuingMessageId, setContinuingMessageId] = useState<string | null>(null);
  const [continuationStreamingContent, setContinuationStreamingContent] = useState("");

  const [runnerOpen, setRunnerOpen] = useState(false);
  const [runnerCode, setRunnerCode] = useState<string | undefined>(undefined);
  const [runnerLang, setRunnerLang] = useState<string | undefined>(undefined);

  const [panelOpen, setPanelOpen] = useState(false);
  const [panelFiles, setPanelFiles] = useState<ProjectFile[]>([]);
  const [panelFocusPath, setPanelFocusPath] = useState<string | undefined>(undefined);
  const [showSettings, setShowSettings] = useState(false);

  const abortRef = useRef<AbortController | null>(null);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast((t) => (t === msg ? null : t)), 4500);
  };

  const openPanelWithFiles = useCallback((files: ProjectFile[], focusPath?: string) => {
    if (!files.length) return;
    setPanelFiles(files);
    setPanelFocusPath(focusPath);
    setPanelOpen(true);
  }, []);

  // أول ما ملف قابل للمعاينة (HTML/CSS/JS) يبدأ يتكتب أثناء البث — افتح لوحة المعاينة الحيّة
  // فورًا على الديسكتوب، عشان المستخدم يشوف البناء حاصل في الخلفية مش نص خام في الشات.
  // بنفتحها بس لو فيه حاجة تتعاين فعلاً — مفيش شاشة كود بديلة تتفتح.
  useEffect(() => {
    if (!isGenerating || !streamingContent) return;
    if (panelOpen) return;
    if (typeof window !== "undefined" && window.innerWidth < 1024) return;
    const files = extractProjectFiles(streamingContent);
    if (hasPreviewableFiles(streamingContent) && files.length > 0) openPanelWithFiles(files);
  }, [streamingContent, isGenerating, panelOpen, openPanelWithFiles]);

  const refreshQuota = useCallback(async () => {
    try {
      const res = await fetch("/api/quota");
      const data = await res.json();
      if (data.quota) {
        setQuota({ total: data.quota.totalAllocatedTokens, used: data.quota.usedTokens });
      } else {
        setQuota(null);
      }
    } catch {
      // تجاهل
    }
  }, []);

  const refreshMessages = useCallback(async (sessionId: string) => {
    try {
      const res = await fetch(`/api/messages/${sessionId}`);
      const data = await res.json();
      setMessages(data.messages || []);
    } catch {
      // تجاهل
    }
  }, []);

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

  // تحميل أولي: اليوزر ثم الجلسات
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/auth/me");
        const data = await res.json();
        setUser(data.user || null);
        if (!data.user) setShowAuthModal(true);
      } finally {
        setAuthChecked(true);
      }
    })();
  }, []);

  useEffect(() => {
    if (!authChecked) return;
    if (!user) {
      setSessions([]);
      setCurrentSessionId(null);
      setMessages([]);
      setQuota(null);
      setPanelOpen(false);
      return;
    }
    (async () => {
      const list = await refreshSessions();
      if (list.length > 0) {
        setCurrentSessionId(list[0].id);
      }
      await refreshQuota();
    })();
  }, [authChecked, user, refreshSessions, refreshQuota]);

  useEffect(() => {
    if (currentSessionId) refreshMessages(currentSessionId);
    else setMessages([]);
  }, [currentSessionId, refreshMessages]);

  const ensureSessionId = useCallback(async (): Promise<string | null> => {
    if (currentSessionId) return currentSessionId;
    try {
      const res = await fetch("/api/sessions", { method: "POST" });
      const data = await res.json();
      if (data.session) {
        setSessions((prev) => [data.session, ...prev]);
        setCurrentSessionId(data.session.id);
        return data.session.id;
      }
    } catch {
      // تجاهل
    }
    return null;
  }, [currentSessionId]);

  const handleNewChat = useCallback(async () => {
    try {
      const res = await fetch("/api/sessions", { method: "POST" });
      const data = await res.json();
      if (data.session) {
        setSessions((prev) => [data.session, ...prev]);
        setCurrentSessionId(data.session.id);
        setMessages([]);
        setDrawerOpen(false);
        setPanelOpen(false);
      }
    } catch {
      showToast(t("toastNewChatFail"));
    }
  }, [t]);

  const handleSelectSession = (id: string) => {
    setCurrentSessionId(id);
    setDrawerOpen(false);
    setPanelOpen(false);
  };

  const handleDeleteSession = async (id: string) => {
    try {
      await fetch(`/api/sessions/${id}`, { method: "DELETE" });
      const list = await refreshSessions();
      if (currentSessionId === id) {
        setCurrentSessionId(list.length > 0 ? list[0].id : null);
        setPanelOpen(false);
      }
    } catch {
      showToast(t("toastDeleteFail"));
    }
  };

  const handleClearAll = async () => {
    try {
      await fetch("/api/sessions/clear", { method: "POST" });
      setSessions([]);
      setCurrentSessionId(null);
      setMessages([]);
      setPanelOpen(false);
    } catch {
      showToast(t("toastClearFail"));
    }
  };

  const handleLogout = async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } finally {
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

  const sendMessage = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || isGenerating) return;
      if (!user) {
        setShowAuthModal(true);
        return;
      }

      // أمر «معاينة»: يفتح معاينة حية لآخر أكواد اتبنت في المحادثة دي
      if (isPreviewCommand(trimmed)) {
        const lastAssistant = [...messages].reverse().find((m) => m.role === "assistant");
        const files = lastAssistant ? extractProjectFiles(lastAssistant.content) : [];
        if (files.length > 0) {
          openPanelWithFiles(files);
          return;
        }
        showToast(t("toastNoPreview"));
        return;
      }

      const sessionId = await ensureSessionId();
      if (!sessionId) {
        showToast(t("toastSessionFail"));
        return;
      }

      const optimisticUser: ChatMessage = {
        id: `tmp-${Date.now()}`,
        sessionId,
        role: "user",
        content: text,
        reasoning: null,
        thinkingDurationMs: null,
        isTruncated: false,
        tokensUsed: 0,
        createdAt: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, optimisticUser]);

      setIsGenerating(true);
      setStreamingContent("");
      setStreamingReasoning("");

      const controller = new AbortController();
      abortRef.current = controller;
      let accContent = "";

      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId, message: trimmed, uiLanguage: lang, model }),
          signal: controller.signal,
        });

        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          setMessages((prev) => prev.filter((m) => m.id !== optimisticUser.id));
          showToast(data.error || t("toastSendFail"));
          return;
        }

        const reader = res.body!.getReader();
        await consumeSSEStream(reader, {
          onContent: (t) => {
            accContent += t;
            setStreamingContent((prev) => prev + t);
          },
          onReasoning: (t) => setStreamingReasoning((prev) => prev + t),
        });
      } catch (e: any) {
        if (e?.name !== "AbortError") {
          showToast(t("toastDrop"));
        }
      } finally {
        abortRef.current = null;
        setIsGenerating(false);
        // لو الرد أنتج ملفات كود، الملفات نفسها بتتقدّم جوا الرسالة بزرار تحميل بس —
        // من غير ما نفتح أي شاشة تلقائيًا. لو فيه حاجة قابلة للمعاينة فعلاً، اللوحة
        // بتكون اتفتحت أصلاً وقت البث (useEffect فوق)؛ هنا بس ننبه لو لسه مقفولة.
        const producedFiles = accContent ? extractProjectFiles(accContent) : [];
        if (producedFiles.length > 0 && hasPreviewableFiles(accContent) && !panelOpen) {
          showToast(t("toastPreviewReady"));
        }
        setStreamingContent("");
        setStreamingReasoning("");
        await refreshMessages(sessionId);
        await refreshQuota();
        // أمان إضافي ضد سباق الحفظ: تحديث تاني بعد لحظة — يضمن إن الرد ما يختفيش
        // حتى لو السيرفر اتأخر شوية في تسجيل الرسالة في الداتابيز
        setTimeout(() => {
          void refreshMessages(sessionId);
        }, 700);
      }
    },
    [isGenerating, user, messages, lang, model, t, ensureSessionId, refreshMessages, refreshQuota, panelOpen, openPanelWithFiles]
  );

  const continueMessage = useCallback(
    async (messageId: string) => {
      if (!user || !currentSessionId || continuingMessageId) return;
      setContinuingMessageId(messageId);
      setContinuationStreamingContent("");

      const controller = new AbortController();
      abortRef.current = controller;
      let accContent = "";

      try {
        const res = await fetch("/api/chat/continue", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId: currentSessionId, messageId, uiLanguage: lang, model }),
          signal: controller.signal,
        });

        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          showToast(data.error || t("toastContinueFail"));
          return;
        }

        const reader = res.body!.getReader();
        await consumeSSEStream(reader, {
          onContent: (t) => {
            accContent += t;
            setContinuationStreamingContent((prev) => prev + t);
          },
        });
      } catch (e: any) {
        if (e?.name !== "AbortError") {
          showToast(t("toastContinueDrop"));
        }
      } finally {
        abortRef.current = null;
        setContinuingMessageId(null);
        const producedFiles = accContent ? extractProjectFiles(accContent) : [];
        if (producedFiles.length > 0 && hasPreviewableFiles(accContent) && !panelOpen) {
          showToast(t("toastPreviewReady"));
        }
        setContinuationStreamingContent("");
        await refreshMessages(currentSessionId);
        await refreshQuota();
        // أمان إضافي ضد سباق الحفظ — تحديث تاني بعد لحظة
        setTimeout(() => {
          void refreshMessages(currentSessionId);
        }, 700);
      }
    },
    [user, currentSessionId, continuingMessageId, lang, model, t, refreshMessages, refreshQuota, panelOpen]
  );

  const stopGeneration = () => {
    abortRef.current?.abort();
  };

  const openRunnerDemo = () => {
    setRunnerCode(undefined);
    setRunnerLang(undefined);
    setRunnerOpen(true);
  };

  const openRunnerWithCode = (code: string, language: string) => {
    setRunnerCode(code);
    setRunnerLang(language);
    setRunnerOpen(true);
  };

  const remainingTokens = quota ? Math.max(quota.total - quota.used, 0) : null;

  // أثناء البث: نسخة لايف من ملفات الرد الجاري — اللوحة بتتحدث لحظة بلحظة زي Claude
  const liveStreamFiles =
    isGenerating && streamingContent ? extractProjectFiles(streamingContent) : null;

  return (
    <div className="flex h-[100dvh] overflow-hidden">
      {/* القايمة الجانبية: أول عنصر في الصف — بتفضل على الشمال في الإنجليزي،
          وبتتنقل على اليمين تلقائيًا في العربي (لأن الـ flex بيقلب مع dir=rtl) */}
      <ChatDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        sessions={sessions}
        currentSessionId={currentSessionId}
        onSelectSession={handleSelectSession}
        onNewChat={handleNewChat}
        onDeleteSession={handleDeleteSession}
        onClearAll={handleClearAll}
        user={user}
        onOpenAuth={() => {
          setDrawerOpen(false);
          setShowAuthModal(true);
        }}
        onLogout={handleLogout}
        onOpenSettings={() => {
          setDrawerOpen(false);
          setShowSettings(true);
        }}
      />

      {/* العمود الرئيسي: الشات — بياخد باقي العرض جنب القايمة الجانبية ولوحة الأرتيفاكت */}
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar
          onToggleDrawer={() => setDrawerOpen(true)}
          remainingTokens={remainingTokens}
          onOpenRunner={openRunnerDemo}
        />

        <MessageList
          messages={messages}
          isGenerating={isGenerating}
          streamingContent={streamingContent}
          streamingReasoning={streamingReasoning}
          totalTokens={quota?.total ?? 500000}
          onPromptSelected={(p) => sendMessage(p)}
          onOpenRunner={openRunnerDemo}
          onRunCode={openRunnerWithCode}
          onContinue={continueMessage}
          continuingMessageId={continuingMessageId}
          continuationStreamingContent={continuationStreamingContent}
          onPreviewFiles={openPanelWithFiles}
        />

        <BottomInputBar
          isGenerating={isGenerating}
          onSend={sendMessage}
          onStop={stopGeneration}
          disabled={!authChecked}
        />
      </div>

      {/* لوحة الأرتيفاكت الجانبية — زي Claude: بتقسم الشاشة جنب الشات على الديسكتوب،
          وبتاخد الشاشة كلها overlay على الموبايل. أثناء البث بتاخد نسخة لايف من الملفات. */}
      {panelOpen && panelFiles.length > 0 && (
        <ArtifactPanel
          files={liveStreamFiles && liveStreamFiles.length > 0 ? liveStreamFiles : panelFiles}
          focusPath={panelFocusPath}
          onClose={() => setPanelOpen(false)}
        />
      )}

      {showAuthModal && (
        <AuthModal onClose={() => setShowAuthModal(false)} onAuthenticated={handleAuthenticated} />
      )}

      {runnerOpen && (
        <CodeRunnerModal
          onClose={() => setRunnerOpen(false)}
          initialCode={runnerCode}
          initialLanguage={runnerLang}
        />
      )}

      {showSettings && (
        <SettingsModal
          user={user}
          onClose={() => setShowSettings(false)}
          onNameUpdated={handleNameUpdated}
        />
      )}

      {toast && <Toast message={toast} onClose={() => setToast(null)} />}
    </div>
  );
}
