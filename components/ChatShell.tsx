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
import RechargeModal from "./RechargeModal";
import CodeRunnerModal from "./CodeRunnerModal";
import ArtifactPanel from "./ArtifactPanel";
import SettingsModal from "./SettingsModal";
import ShortcutsDialog from "./ShortcutsDialog";
import Toast from "./Toast";
import type { SettingsTab } from "./AccountMenu";
import { useSettings, type ModelId } from "./SettingsContext";

const PREVIEWABLE_EXTS = new Set(["html", "htm", "css", "js"]);
const SESSION_MODELS_KEY = "mlag-session-models";
const SIDEBAR_KEY = "mlag-sidebar-collapsed";

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

export default function ChatShell() {
  const { t, lang, model, setModel, customInstructions, nickname } = useSettings();
  const [authChecked, setAuthChecked] = useState(false);
  const [user, setUser] = useState<SessionUser | null>(null);
  const [showAuthModal, setShowAuthModal] = useState(false);

  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [quota, setQuota] = useState<{ total: number; used: number } | null>(null);

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
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

  const [settingsTab, setSettingsTab] = useState<SettingsTab | null>(null);
  const [showRecharge, setShowRecharge] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);

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
  const lockedModel: ModelId | undefined = currentSessionId
    ? sessionModels[currentSessionId]
    : undefined;

  const abortRef = useRef<AbortController | null>(null);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast((cur) => (cur === msg ? null : cur)), 4500);
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
      if (list.length > 0) setCurrentSessionId(list[0].id);
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
    if (!user) {
      setShowAuthModal(true);
      return;
    }
    // لو الشات الحالي فاضي أصلاً ما نعملش واحد جديد فوقه
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
        setDrawerOpen(false);
        setPanelOpen(false);
        window.setTimeout(() => document.getElementById("mlag-composer")?.focus(), 50);
      }
    } catch {
      showToast(t("toastNewChatFail"));
    }
  }, [user, currentSessionId, messages.length, showToast, t]);

  const handleSelectSession = (id: string) => {
    setCurrentSessionId(id);
    setDrawerOpen(false);
    setPanelOpen(false);
  };

  const handleDeleteSession = async (id: string) => {
    try {
      await fetch(`/api/sessions/${id}`, { method: "DELETE" });
      forgetSessionModel(id);
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
      const res = await fetch("/api/sessions/clear", { method: "POST" });
      if (!res.ok) throw new Error("clear failed");
      setSessions([]);
      setCurrentSessionId(null);
      setMessages([]);
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

  const sendMessage = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || isGenerating) return;
      if (!user) {
        setShowAuthModal(true);
        return;
      }

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

      const effectiveModel = sessionModels[sessionId] ?? model;
      lockSessionModel(sessionId, effectiveModel);

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
          body: JSON.stringify({
            sessionId,
            message: trimmed,
            uiLanguage: lang,
            model: effectiveModel,
            ...personalizationBody,
          }),
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
          onContent: (chunk) => {
            accContent += chunk;
            setStreamingContent((prev) => prev + chunk);
          },
          onReasoning: (chunk) => setStreamingReasoning((prev) => prev + chunk),
        });
      } catch (e: any) {
        if (e?.name !== "AbortError") showToast(t("toastDrop"));
      } finally {
        abortRef.current = null;
        const producedFiles = accContent ? extractProjectFiles(accContent) : [];
        if (producedFiles.length > 0) {
          if (!panelOpen && hasPreviewableFiles(accContent)) {
            openPanelWithFiles(producedFiles);
            showToast(t("toastPreviewReady"));
          } else {
            setPanelFiles(producedFiles);
          }
        }
        // نجيب الرسالة المحفوظة الأول وبعدين نشيل فقاعة البث — عشان الرد ما يختفيش لحظة
        await refreshMessages(sessionId);
        await refreshQuota();
        setIsGenerating(false);
        setStreamingContent("");
        setStreamingReasoning("");
        setTimeout(() => {
          void refreshMessages(sessionId);
          void refreshSessions();
        }, 700);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      isGenerating,
      user,
      messages,
      lang,
      model,
      sessionModels,
      lockSessionModel,
      customInstructions,
      nickname,
      t,
      ensureSessionId,
      refreshMessages,
      refreshQuota,
      refreshSessions,
      panelOpen,
      openPanelWithFiles,
      showToast,
    ]
  );

  const continueMessage = useCallback(
    async (messageId: string) => {
      if (!user || !currentSessionId || continuingMessageId) return;
      setContinuingMessageId(messageId);
      setContinuationStreamingContent("");

      const controller = new AbortController();
      abortRef.current = controller;
      let accContent = "";
      const effectiveModel = sessionModels[currentSessionId] ?? model;

      try {
        const res = await fetch("/api/chat/continue", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sessionId: currentSessionId,
            messageId,
            uiLanguage: lang,
            model: effectiveModel,
            ...personalizationBody,
          }),
          signal: controller.signal,
        });

        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          showToast(data.error || t("toastContinueFail"));
          return;
        }

        const reader = res.body!.getReader();
        await consumeSSEStream(reader, {
          onContent: (chunk) => {
            accContent += chunk;
            setContinuationStreamingContent((prev) => prev + chunk);
          },
        });
      } catch (e: any) {
        if (e?.name !== "AbortError") showToast(t("toastContinueDrop"));
      } finally {
        abortRef.current = null;
        const originalMsg = messages.find((m) => m.id === messageId);
        const mergedContent = (originalMsg?.content || "") + accContent;
        const producedFiles = mergedContent ? extractProjectFiles(mergedContent) : [];
        if (producedFiles.length > 0) {
          if (!panelOpen && hasPreviewableFiles(mergedContent)) {
            openPanelWithFiles(producedFiles);
            showToast(t("toastPreviewReady"));
          } else {
            setPanelFiles(producedFiles);
          }
        }
        await refreshMessages(currentSessionId);
        await refreshQuota();
        setContinuingMessageId(null);
        setContinuationStreamingContent("");
        setTimeout(() => {
          void refreshMessages(currentSessionId);
        }, 700);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      user,
      currentSessionId,
      continuingMessageId,
      messages,
      lang,
      model,
      sessionModels,
      customInstructions,
      nickname,
      t,
      refreshMessages,
      refreshQuota,
      panelOpen,
      openPanelWithFiles,
      showToast,
    ]
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

  const openSettings = useCallback((tab: SettingsTab = "general") => {
    setDrawerOpen(false);
    setSettingsTab(tab);
  }, []);

  const openRecharge = useCallback(() => {
    setDrawerOpen(false);
    setShowRecharge(true);
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
    isGenerating && streamingContent ? extractProjectFiles(streamingContent) : null;

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
        user={user}
        quota={quota}
        onOpenAuth={() => {
          setDrawerOpen(false);
          setShowAuthModal(true);
        }}
        onLogout={handleLogout}
        onOpenSettings={openSettings}
        onOpenRecharge={openRecharge}
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
          onOpenRunner={openRunnerDemo}
          onOpenRecharge={openRecharge}
          onNewChat={handleNewChat}
          lockedModel={lockedModel}
          onPickModel={handlePickModel}
        />

        <MessageList
          messages={messages}
          isGenerating={isGenerating}
          streamingContent={streamingContent}
          streamingReasoning={streamingReasoning}
          totalTokens={quota?.total ?? 500000}
          userName={user?.displayName}
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
      </main>

      {panelOpen && panelFiles.length > 0 && (
        <ArtifactPanel
          files={liveStreamFiles && liveStreamFiles.length > 0 ? liveStreamFiles : panelFiles}
          focusPath={panelFocusPath}
          onClose={() => setPanelOpen(false)}
        />
      )}

      {showAuthModal && (
        <AuthModal
          pendingUser={user && user.profileComplete === false ? user : null}
          onClose={() => setShowAuthModal(false)}
          onAuthenticated={handleAuthenticated}
        />
      )}

      {runnerOpen && (
        <CodeRunnerModal
          onClose={() => setRunnerOpen(false)}
          initialCode={runnerCode}
          initialLanguage={runnerLang}
        />
      )}

      {settingsTab && (
        <SettingsModal
          user={user}
          quota={quota}
          initialTab={settingsTab}
          sessionsCount={sessions.length}
          onClose={() => setSettingsTab(null)}
          onNameUpdated={handleNameUpdated}
          onLogout={handleLogout}
          onOpenRecharge={openRecharge}
          onClearAll={handleClearAll}
          onToast={showToast}
        />
      )}

      {showShortcuts && <ShortcutsDialog onClose={() => setShowShortcuts(false)} />}

      {showRecharge && (
        <RechargeModal user={user} quota={quota} onClose={() => setShowRecharge(false)} />
      )}

      {toast && <Toast message={toast} onClose={() => setToast(null)} />}
    </div>
  );
}
