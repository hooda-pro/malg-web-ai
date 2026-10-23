import { formatBalance } from "./ai";

/**
 * إعدادات الشحن — يوزر واتساب الدعم اللي بيتحول عليه زرار الشحن.
 * غيّره من هنا، أو ضيف متغير بيئة NEXT_PUBLIC_WHATSAPP_USERNAME في Vercel
 * (لو المتغير موجود في Vercel فهو اللي بيكسب — حدّثه هناك أو امسحه).
 * ملحوظة: wa.me مضمون 100% مع أرقام الهواتف بصيغة wa.me/<رقم بالكود الدولي>.
 * صيغة اليوزرنيم (wa.me/<username>) قد لا تفتح المحادثة على كل الأجهزة.
 */
export const WHATSAPP_USERNAME = process.env.NEXT_PUBLIC_WHATSAPP_USERNAME || "x9_vk";

export interface RechargePackage {
  id: string;
  /** الرصيد الممنوح — بالـmicro-dollar (µ$؛ $1 = 1,000,000 µ$) */
  balanceMicro: number;
  /** السعر بالجنيه المصري */
  price: number;
  emoji: string;
  label: string;
  hint: string;
  badge?: string;
}

/**
 * باقات شحن الرصيد (تحديث ١٩) — الرصيد بيتشترى بالدولار ويتحسب على حسب
 * تسعيرة كل موديل بالظبط. الأرقام هنا قابلة للتعديل من غير أي مكان تاني.
 */
export const RECHARGE_PACKAGES: RechargePackage[] = [
  {
    id: "starter",
    balanceMicro: 2_000_000,
    price: 30,
    emoji: "🌱",
    label: "باقة البداية",
    hint: "رصيد $2 — تكفي تجارب واستخدام خفيف",
  },
  {
    id: "plus",
    balanceMicro: 4_000_000,
    price: 60,
    emoji: "⚡",
    label: "باقة بلس",
    hint: "رصيد $4 — استعمال أوسع وموديلات أقوى",
  },
  {
    id: "pro",
    balanceMicro: 8_000_000,
    price: 120,
    emoji: "🔥",
    label: "باقة برو",
    hint: "رصيد $8 — استخدم براحتك",
    badge: "الأكثر طلبًا",
  },
  {
    id: "legend",
    balanceMicro: 20_000_000,
    price: 300,
    emoji: "👑",
    label: "باقة الأسطورة",
    hint: "رصيد $20 — أكبر رصيد دفعة واحدة",
    badge: "أكبر باقة",
  },
];

/** رابط واتساب باليوزرنيم مع رسالة جاهزة */
export function buildWhatsAppLink(message: string): string {
  return `https://wa.me/${WHATSAPP_USERNAME}?text=${encodeURIComponent(message)}`;
}

/** رسالة واتساب جاهزة لطلب باقة شحن — فيها بيانات حساب المشتري عشان الأدمن يعرفه */
export function buildRechargeMessage(
  pkg: RechargePackage | null,
  user?: { displayName?: string | null; email?: string | null } | null
): string {
  const lines = ["مرحباً 👋", "عايز أشحن رصيدي في موقع MALG AI:"];

  if (pkg) {
    lines.push(
      "",
      `📦 الباقة: ${pkg.emoji} ${pkg.label}`,
      `💵 الرصيد: +${formatBalance(pkg.balanceMicro)}`,
      `💰 السعر: ${pkg.price} جنيه`
    );
  } else {
    lines.push("", "🛒 عايز أستفسر عن باقات شحن الرصيد أو كمية مخصصة");
  }

  if (user?.displayName || user?.email) {
    lines.push("", `👤 حسابي: ${user.displayName || "—"}${user.email ? ` (${user.email})` : ""}`);
  }

  lines.push("", "محتاج أأكد الشحن وطرق الدفع ✨");
  return lines.join("\n");
}

/**
 * رسالة واتساب جاهزة لطلب شحن رصيد الـ API (رصيد المطورين) — منفصلة تمامًا
 * عن buildRechargeMessage الخاصة برصيد الشات، وبتوضح للدعم إن الطلب لرصيد
 * API مش شات عادي، عشان مايتلخبطش في مصدر الرصيد اللي هيتم شحنه.
 */
export function buildApiRechargeMessage(
  balanceMicro: number | null,
  user?: { displayName?: string | null; email?: string | null } | null
): string {
  const lines = ["مرحباً 👋", "عايز أشحن رصيد الـ API (رصيد المطورين) في موقع MALG AI:"];

  if (balanceMicro && balanceMicro > 0) {
    lines.push(
      "",
      `💵 رصيد API: +${formatBalance(balanceMicro)}`,
      `💰 عايز أعرف السعر بالجنيه`
    );
  } else {
    lines.push("", "🛒 عايز أستفسر عن كمية مخصصة لرصيد الـ API");
  }

  if (user?.displayName || user?.email) {
    lines.push("", `👤 حسابي: ${user.displayName || "—"}${user.email ? ` (${user.email})` : ""}`);
  }

  lines.push(
    "",
    "ملحوظة: ده رصيد API منفصل تمامًا عن رصيد الشات العادي بتاعي.",
    "",
    "محتاج أأكد الشحن وطرق الدفع ✨"
  );
  return lines.join("\n");
}
