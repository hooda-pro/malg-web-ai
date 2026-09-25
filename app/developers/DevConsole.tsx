"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Check,
  Copy,
  KeyRound,
  Loader2,
  Plus,
  Sparkles,
  Trash2,
  Wallet,
} from "lucide-react";
import { Button, IconButton } from "@/components/ui/Controls";
import Toast from "@/components/Toast";

interface KeyRow {
  id: string;
  name: string;
  keyPrefix: string;
  isActive: boolean;
  lastUsedAt: string | null;
  createdAt: string;
}

const CURL_SAMPLE = `curl https://YOUR-DOMAIN/api/v1/chat/completions \\
  -H "Authorization: Bearer mlag_sk_..." \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "glm-4.7-flash",
    "messages": [{ "role": "user", "content": "إزيك" }]
  }'`;

const NODE_SAMPLE = `const res = await fetch("/api/v1/chat/completions", {
  method: "POST",
  headers: {
    Authorization: "Bearer " + process.env.MLAG_API_KEY,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    model: "glm-4.7-flash",
    messages: [{ role: "user", content: "إزيك" }],
  }),
});
const data = await res.json();
console.log(data.choices[0].message.content);`;

export default function DevConsole({
  user,
}: {
  user: { id: string; email: string; displayName: string };
}) {
  const [keys, setKeys] = useState<KeyRow[]>([]);
  const [balance, setBalance] = useState<{ total: number; used: number } | null>(null);
  const [name, setName] = useState("");
  const [plainKey, setPlainKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/keys").then((r) => r.json());
      if (res.keys) setKeys(res.keys);
      if (res.error) setToast(res.error);
    } catch {
      setToast("تعذر تحميل المفاتيح");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const create = async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const data = await res.json();
      if (!res.ok) {
        setToast(data.error || "فشل إنشاء المفتاح");
        return;
      }
      setPlainKey(data.plainKey);
      setName("");
      await load();
    } catch {
      setToast("فشل الاتصال بالسيرفر");
    } finally {
      setBusy(false);
    }
  };

  const revoke = async (id: string) => {
    if (!window.confirm("متأكد إنك عايز تلغي المفتاح ده؟\nأي كود بيستخدمه هيقف فوراً.")) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/keys?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) {
        setToast(data.error || "فشل الإلغاء");
        return;
      }
      setKeys((prev) => prev.map((k) => (k.id === id ? { ...k, isActive: false } : k)));
      setToast("تم إلغاء المفتاح");
    } catch {
      setToast("فشل الاتصال بالسيرفر");
    } finally {
      setBusy(false);
    }
  };

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setToast("اتنسخ");
    } catch {
      setToast("مقدرناش ننسخ — انسخ يدوي");
    }
  };

  return (
    <div className="min-h-[100dvh] bg-ground">
      <header className="glass sticky top-0 z-nav flex h-14 items-center gap-3 border-b border-hair px-4 sm:px-6">
        <Link href="/">
          <IconButton label="رجوع للموقع" size="sm">
            <ArrowLeft size={16} className="flip-rtl" />
          </IconButton>
        </Link>
        <span className="grid h-8 w-8 place-items-center rounded-[10px] bg-accent text-accent-ink shadow-accent">
          <Sparkles size={15} />
        </span>
        <div className="min-w-0 leading-tight">
          <p className="truncate text-[15px] font-semibold tracking-title text-ink">واجهة المطوّرين</p>
          <p className="truncate text-[11px] tracking-label text-ink-3" dir="ltr">
            {user.email}
          </p>
        </div>
        <Link href="/topup" className="ms-auto">
          <Button size="sm" variant="secondary">
            <Wallet size={14} />
            شحن الرصيد
          </Button>
        </Link>
      </header>

      <main className="mx-auto w-full max-w-[860px] space-y-6 px-4 py-8 sm:px-6">
        <section>
          <h1 className="text-[clamp(22px,3.5vw,30px)] font-semibold tracking-display text-ink">
            استخدم mlag AI من كودك
          </h1>
          <p className="mt-2 text-pretty text-[15px] leading-7 text-ink-2">
            نقطة واحدة متوافقة مع OpenAI. اعمل مفتاح، حطه في هيدر{" "}
            <code className="rounded bg-surface-3 px-1 py-0.5 font-mono text-[12.5px]">Authorization</code>{" "}
            وابدأ. رصيد الـ API منفصل عن رصيد الشات، وبيتبعت من لوحة الأدمن.
          </p>
        </section>

        {/* المفتاح الجديد — يظهر مرة واحدة */}
        {plainKey && (
          <div className="rounded-xl border border-accent-line bg-accent-soft p-4">
            <p className="text-[13px] font-medium text-ink">
              المفتاح جاهز — انسخه دلوقتي، مش هينعرض تاني
            </p>
            <div className="mt-2.5 flex items-center gap-2">
              <code
                dir="ltr"
                className="min-w-0 flex-1 truncate rounded-md bg-surface px-3 py-2 font-mono text-[13px] text-ink"
              >
                {plainKey}
              </code>
              <IconButton label="نسخ" onClick={() => copy(plainKey)}>
                <Copy size={15} />
              </IconButton>
              <IconButton label="إخفاء" onClick={() => setPlainKey(null)}>
                <Check size={15} />
              </IconButton>
            </div>
          </div>
        )}

        {/* إنشاء مفتاح */}
        <section className="rounded-xl border border-hair bg-surface p-5 shadow-1">
          <h2 className="flex items-center gap-2 text-[15px] font-semibold text-ink">
            <KeyRound size={16} className="text-accent" />
            مفاتيحي
          </h2>

          <div className="mt-4 flex flex-wrap gap-2">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="اسم المفتاح (مثال: موقعي)"
              className="h-10 min-w-0 flex-1 rounded-md border border-hair bg-surface-2 px-3 text-[14px] text-ink placeholder:text-ink-3 focus:border-accent focus:outline-none"
            />
            <Button variant="primary" onClick={create} disabled={busy}>
              {busy ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />}
              مفتاح جديد
            </Button>
          </div>

          {loading ? (
            <div className="grid place-items-center py-10 text-ink-3">
              <Loader2 size={20} className="animate-spin" />
            </div>
          ) : keys.length === 0 ? (
            <p className="py-10 text-center text-[13.5px] text-ink-3">مفيش مفاتيح لسه</p>
          ) : (
            <div className="mt-4 overflow-hidden rounded-lg border border-hair">
              {keys.map((k, i) => (
                <div
                  key={k.id}
                  className={`flex items-center gap-3 px-4 py-3 ${i > 0 ? "border-t border-hair" : ""} ${k.isActive ? "" : "opacity-50"}`}
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13.5px] font-medium text-ink">{k.name}</p>
                    <p className="truncate font-mono text-[12px] text-ink-3" dir="ltr">
                      {k.keyPrefix}…
                    </p>
                  </div>
                  <span className="shrink-0 text-[11.5px] text-ink-3">
                    {k.isActive
                      ? k.lastUsedAt
                        ? `آخر استخدام ${new Date(k.lastUsedAt).toLocaleDateString("ar-EG")}`
                        : "ما اتستخدمش"
                      : "ملغى"}
                  </span>
                  <IconButton
                    label="إلغاء المفتاح"
                    size="sm"
                    disabled={!k.isActive || busy}
                    onClick={() => revoke(k.id)}
                  >
                    <Trash2 size={14} />
                  </IconButton>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* أمثلة الاستخدام */}
        <section className="space-y-3">
          <h2 className="text-[15px] font-semibold text-ink">أمثلة استخدام</h2>

          <CodeBlock title="cURL" code={CURL_SAMPLE} onCopy={() => copy(CURL_SAMPLE)} />
          <CodeBlock title="Node.js" code={NODE_SAMPLE} onCopy={() => copy(NODE_SAMPLE)} />
        </section>
      </main>

      {toast && <Toast message={toast} onClose={() => setToast(null)} />}
    </div>
  );
}

function CodeBlock({
  title,
  code,
  onCopy,
}: {
  title: string;
  code: string;
  onCopy: () => void;
}) {
  return (
    <div className="code-surface overflow-hidden rounded-xl border border-hair bg-surface-inset">
      <div className="flex items-center justify-between border-b border-hair px-4 py-2">
        <span className="font-mono text-[12px] text-ink-2">{title}</span>
        <IconButton label="نسخ الكود" size="sm" onClick={onCopy}>
          <Copy size={14} />
        </IconButton>
      </div>
      <pre dir="ltr" className="overflow-x-auto p-4 font-mono text-[12.5px] leading-6 text-ink">
        {code}
      </pre>
    </div>
  );
}
