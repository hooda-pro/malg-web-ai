export interface SessionUser {
  id: string;
  email: string;
  displayName: string;
  isAdmin: boolean;
  /** لسه محتاج يكمل بياناته (الاسم + العمر) بعد أول تسجيل بجوجل */
  profileComplete: boolean;
  age?: number | null;
}

export interface ChatSession {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  /** لو الموديل قفل المحادثة (بعد تحذير واستمرار السلوك) — الشات بيبقى للقراءة بس ومفيش خانة كتابة */
  endedAt?: string | null;
  endedReason?: string | null;
  /** 'abuse' = الموديل قفلها بعد تحذير، 'user' = المستخدم طلب القفل وأكّد */
  endedBy?: "abuse" | "user" | null;
  /** مثبتة أعلى القايمة */
  isPinned?: boolean;
  /** توكن المشاركة العامة — null = غير مشاركة */
  shareToken?: string | null;
}

export interface ChatMessage {
  id: string;
  sessionId: string;
  role: "user" | "assistant" | "system";
  content: string;
  reasoning: string | null;
  thinkingDurationMs: number | null;
  isTruncated: boolean;
  tokensUsed: number;
  createdAt: string;
  /** تقييم المستخدم للرد: 1 مفيد، -1 غير مفيد، null/undefined بلا تقييم */
  feedback?: 1 | -1 | null;
  /**
   * مفتاح React ثابت على مستوى الواجهة بس (مش بيتخزّن في الداتابيز). بنستخدمه عشان
   * رسالة المستخدم المتفائلة (tmp-…) ورد المساعد الحيّ يفضلوا نفس عنصر الـDOM بعد ما
   * السيرفر يرجّع نسختهم المحفوظة بـ id تاني — من غير إعادة تركيب ولا إعادة تشغيل
   * للأنيميشن ولا وميض.
   */
  clientKey?: string;
}

/** رسالة لسه ما اتحفظتش في السيرفر (متفائلة أو محلية) — id بتاعها بيبدأ بـ tmp- أو local- */
export function isLocalMessageId(id: string): boolean {
  return id.startsWith("tmp-") || id.startsWith("local-");
}

export interface UserQuota {
  totalAllocatedTokens: number;
  usedTokens: number;
  quotaExhaustedAt: string | null;
  isAdmin: boolean;
}
