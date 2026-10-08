"use client";

import { useEffect, useState } from "react";
import { Check, Copy, Link2, Loader2, X } from "lucide-react";
import { Dialog } from "./ui/Controls";
import { useSettings } from "./SettingsContext";

/**
 * حوار مشاركة المحادثة برابط عام — يولّد التوكن مرة واحدة ويفضل ثابتًا،
 * مع نسخ الرابط وإيقاف المشاركة (الرابط القديم يموت فورًا).
 */
export default function ShareDialog({
  sessionId,
  sessionTitle,
  initialToken,
  onClose,
  onTokenChange,
}: {
  sessionId: string;
  sessionTitle: string;
  initialToken: string | null;
  onClose: () => void;
  onTokenChange: (token: string | null) => void;
}) {
  const { t } = useSettings();
  const [token, setToken] = useState<string | null>(initialToken);
  const [busy, setBusy] = useState(!initialToken);
  const [stopping, setStopping] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (initialToken) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/sessions/${sessionId}/share`, { method: "POST" });
        const data = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (!res.ok || !data.token) throw new Error(data.error || "failed");
        setToken(data.token);
        onTokenChange(data.token);
      } catch {
        if (!cancelled) setError(t("toastShareFail"));
      } finally {
        if (!cancelled) setBusy(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  const link = token && typeof window !== "undefined" ? `${window.location.origin}/#/s/${token}` : "";

  const copy = async () => {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setError(t("toastShareFail"));
    }
  };

  const stop = async () => {
    setStopping(true);
    try {
      await fetch(`/api/sessions/${sessionId}/share`, { method: "DELETE" });
      onTokenChange(null);
      onClose();
    } catch {
      setError(t("toastShareFail"));
      setStopping(false);
    }
  };

  return (
    <Dialog open onClose={onClose} title={t("shareChat")} subtitle={sessionTitle} size="sm">
      <div className="space-y-3">
        <p className="text-[13px] leading-6 text-ink-2">{t("shareHint")}</p>
        {busy ? (
          <div className="flex items-center gap-2 py-4 text-[13px] text-ink-3">
            <Loader2 size={15} className="animate-spin text-accent" />
            {t("generatingLink")}
          </div>
        ) : error && !token ? (
          <p className="rounded-md bg-danger-soft px-3 py-2 text-[13px] text-danger">{error}</p>
        ) : (
          <>
            <div dir="ltr" className="flex items-center gap-2 rounded-md border border-hair bg-surface-2 px-3 py-2.5">
              <Link2 size={14} className="shrink-0 text-ink-3" />
              <span className="tnum min-w-0 flex-1 truncate text-[12.5px] text-ink">{link}</span>
              <button
                onClick={copy}
                title={copied ? t("copied") : t("copyLink")}
                aria-label={copied ? t("copied") : t("copyLink")}
                className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-ink-2 transition-colors duration-1 hover:bg-surface-3 hover:text-ink"
              >
                {copied ? <Check size={14} className="text-live" /> : <Copy size={14} />}
              </button>
            </div>
            <button
              onClick={stop}
              disabled={stopping}
              className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-[12.5px] font-medium text-danger transition-colors duration-1 hover:bg-danger-soft disabled:opacity-40"
            >
              {stopping ? <Loader2 size={13} className="animate-spin" /> : <X size={13} />}
              {t("stopSharing")}
            </button>
            <p className="text-[12px] leading-5 text-ink-3">{t("shareStopConfirm")}</p>
          </>
        )}
      </div>
    </Dialog>
  );
}
