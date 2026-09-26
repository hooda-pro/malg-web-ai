/** أنواع البيانات المشتركة بين واجهات لوحة الأدمن */

export interface AdminUserRow {
  id: string;
  email: string;
  displayName: string;
  isAdmin: boolean;
  isBanned: boolean;
  bannedAt: string | null;
  createdAt: string;
  totalAllocatedTokens: number;
  usedTokens: number;
  quotaExhaustedAt: string | null;
  sessionsCount: number;
  messagesCount: number;
}

export interface AdminSessionRow {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messagesCount: number;
  tokensUsed: number;
}

export interface AdminMessageRow {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  tokensUsed: number;
  createdAt: string;
  sessionTitle: string;
  sessionId: string;
}

export interface AdminUserDetail extends AdminUserRow {
  quotaUpdatedAt: string | null;
  /** رصيد الـ API — منفصل تمامًا عن رصيد الشات (totalAllocatedTokens/usedTokens أعلاه) */
  apiTotalAllocatedTokens: number;
  apiUsedTokens: number;
}

export interface AdminStats {
  totalUsers: number;
  bannedUsers: number;
  adminUsers: number;
  newToday: number;
  newWeek: number;
  totalSessions: number;
  totalMessages: number;
  totalAllocated: number;
  totalUsed: number;
  topUsers: {
    id: string;
    displayName: string;
    email: string;
    usedTokens: number;
    totalAllocatedTokens: number;
  }[];
  recentUsers: {
    id: string;
    displayName: string;
    email: string;
    createdAt: string;
  }[];
}

export interface AdminLogRow {
  id: string;
  adminEmail: string;
  action: string;
  targetUserId: string | null;
  targetEmail: string | null;
  details: string | null;
  createdAt: string;
}

/** مسميات عربية لإجراءات الأدمن في السجل */
export const ACTION_LABELS: Record<string, string> = {
  delete_user: "حذف حساب",
  ban_user: "حظر حساب",
  unban_user: "فك حظر حساب",
  recharge_tokens: "شحن توكنز",
  set_tokens: "تعيين رصيد",
  reset_usage: "تصفير استهلاك",
  change_password: "تغيير كلمة المرور",
  recharge_api_tokens: "شحن رصيد API",
  set_api_tokens: "تعيين رصيد API",
  reset_api_usage: "تصفير استهلاك API",
};

/** لون كل إجراء في السجل */
export const ACTION_COLORS: Record<string, string> = {
  delete_user: "text-danger bg-danger-soft border-hair",
  ban_user: "text-warn bg-warn-soft border-hair",
  unban_user: "text-accent bg-accent-soft border-accent-line",
  recharge_tokens: "text-accent bg-accent-soft border-accent-line",
  set_tokens: "text-accent bg-accent-soft border-accent-line",
  reset_usage: "text-accent bg-accent-soft border-accent-line",
  change_password: "text-ink-2 bg-surface-3 border-hair",
  recharge_api_tokens: "text-accent bg-accent-soft border-accent-line",
  set_api_tokens: "text-accent bg-accent-soft border-accent-line",
  reset_api_usage: "text-accent bg-accent-soft border-accent-line",
};