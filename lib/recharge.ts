import { formatTokens } from "./ai";

/**
 * إعدادات الشحن — يوزر واتساب الدعم اللي بيتحول عليه زرار الشحن.
 * غيّره من هنا، أو ضيف متغير بيئة NEXT_PUBLIC_WHATSAPP_USERNAME في Vercel.
 * الرابط بصيغة wa.me/<username> — الصيغة الرسمية لدعم اليوزرنيم الجديد في واتساب.
 */
export const WHATSAPP_USERNAME = process.env.NEXT_PUBLIC_WHATSAPP_USERNAME || "GM-Y16";

export interface RechargePackage {
  id: string;
  tokens: number;
  /** السعر بالجنيه المصري */
  price: number;
  emoji: string;
  label: string;
  hint: string;
  badge?: string;
}

/** باقات شحن التوكنز — مليون توكنز = 100 جنيه تقريبًا مع خصم على الباقات الأكبر */
export const RECHARGE_PACKAGES: RechargePackage[] = [
  {
    id: "starter",
    tokens: 250_000,
    price: 30,
    emoji: "🌱",
    label: "باقة البداية",
    hint: "250 ألف توكنز — تكفي تجارب واستخدام خفيف",
  },
  {
    id: "plus",
    tokens: 500_000,
    price: 55,
    emoji: "⚡",
    label: "باقة بلس",
    hint: "نص مليون توكنز — رصيد أساسي قوي",
  },
  {
    id: "pro",
    tokens: 1_000_000,
    price: 100,
    emoji: "🔥",
    label: "باقة برو",
    hint: "مليون توكنز كاملة — استخدم براحتك",
    badge: "الأكثر طلبًا",
  },
  {
    id: "legend",
    tokens: 2_500_000,
    price: 235,
    emoji: "👑",
    label: "باقة الأسطورة",
    hint: "2.5 مليون توكنز — أوفر باقة على الإطلاق",
    badge: "أفضل قيمة",
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
  const lines = ["مرحباً 👋", "عايز أشحن رصيد توكنز في موقع mlag AI:"];

  if (pkg) {
    lines.push(
      "",
      `📦 الباقة: ${pkg.emoji} ${pkg.label}`,
      `🔢 التوكنز: +${formatTokens(pkg.tokens)} توكنز`,
      `💰 السعر: ${pkg.price} جنيه`
    );
  } else {
    lines.push("", "🛒 عايز أستفسر عن باقات الشحن أو كمية مخصصة");
  }

  if (user?.displayName || user?.email) {
    lines.push("", `👤 حسابي: ${user.displayName || "—"}${user.email ? ` (${user.email})` : ""}`);
  }

  lines.push("", "محتاج أأكد الشحن وطرق الدفع ✨");
  return lines.join("\n");
}