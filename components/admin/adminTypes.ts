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
};

/** لون كل إجراء في السجل */
export const ACTION_COLORS: Record<string, string> = {
  delete_user: "text-rose bg-rose/10 border-rose/30",
  ban_user: "text-amber bg-amber/10 border-amber/30",
  unban_user: "text-green bg-green/10 border-green/30",
  recharge_tokens: "text-cyan bg-cyan/10 border-cyan/30",
  set_tokens: "text-cyan bg-cyan/10 border-cyan/30",
  reset_usage: "text-purple bg-purple/10 border-purple/30",
  change_password: "text-txt2 bg-panel3 border-line2",
};