/** أنواع البيانات المشتركة بين واجهات لوحة الأدمن */

export interface AdminUserRow {
  id: string;
  email: string;
  displayName: string;
  isAdmin: boolean;
  isBanned: boolean;
  bannedAt: string | null;
  createdAt: string;
  /** رصيد الشات — بالـmicro-dollar (تحديث ١٩: $1 = 1,000,000 µ$) */
  totalMicro: number;
  usedMicro: number;
  exhaustedAt: string | null;
  sessionsCount: number;
  messagesCount: number;
  /** لو محدد: الحساب مجدول للحذف (مهلة 30 يوم شغالة) */
  deletionRequestedAt?: string | null;
}

/** صف من قايمة «حذف الحسابات» — طلبات الحذف المعلقة */
export interface AdminDeletionRow {
  id: string;
  email: string;
  displayName: string;
  reason: string | null;
  requestedAt: string;
  createdAt: string;
  sessionsCount: number;
  messagesCount: number;
  /** الاستهلاك بالـmicro-dollar */
  usedMicro: number;
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
  /** رصيد الـ API — منفصل تمامًا عن رصيد الشات (totalMicro/usedMicro أعلاه) — بالـmicro-dollar كذلك */
  apiTotalMicro: number;
  apiUsedMicro: number;
}

export interface AdminStats {
  totalUsers: number;
  bannedUsers: number;
  adminUsers: number;
  newToday: number;
  newWeek: number;
  totalSessions: number;
  totalMessages: number;
  /** إجمالي الأرصدة والاستهلاك — بالـmicro-dollar */
  totalBalanceMicro: number;
  totalUsedMicro: number;
  topUsers: {
    id: string;
    displayName: string;
    email: string;
    usedMicro: number;
    totalMicro: number;
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
  request_account_deletion: "طلب حذف الحساب",
  cancel_account_deletion: "رفض/إلغاء طلب حذف الحساب",
  finalize_account_deletion: "تنفيذ حذف الحساب",
  recharge_tokens: "شحن رصيد",
  set_tokens: "تعيين رصيد الشات",
  reset_usage: "تصفير استهلاك",
  change_password: "تغيير كلمة المرور",
  recharge_api_tokens: "شحن رصيد API",
  set_api_tokens: "تعيين رصيد API",
  reset_api_usage: "تصفير استهلاك API",
  recharge_balance: "شحن رصيد",
  set_balance: "تعيين رصيد الشات",
  recharge_api_balance: "شحن رصيد API",
  set_api_balance: "تعيين رصيد API",
  update_provider: "تغيير مزوّد الموديل",
  reorder_models: "إعادة ترتيب الموديلات",
  create_model: "إنشاء موديل",
  update_model: "تعديل موديل",
  delete_model: "حذف موديل",
  save_mcp_servers: "حفظ سيرفرات MCP",
  update_search: "تغيير إعداد البحث",
};

/** لون كل إجراء في السجل */
export const ACTION_COLORS: Record<string, string> = {
  delete_user: "text-danger bg-danger-soft border-hair",
  request_account_deletion: "text-warn bg-warn-soft border-hair",
  cancel_account_deletion: "text-live bg-live-soft border-hair",
  finalize_account_deletion: "text-danger bg-danger-soft border-hair",
  ban_user: "text-warn bg-warn-soft border-hair",
  unban_user: "text-accent bg-accent-soft border-accent-line",
  recharge_tokens: "text-accent bg-accent-soft border-accent-line",
  set_tokens: "text-accent bg-accent-soft border-accent-line",
  reset_usage: "text-accent bg-accent-soft border-accent-line",
  change_password: "text-ink-2 bg-surface-3 border-hair",
  recharge_api_tokens: "text-accent bg-accent-soft border-accent-line",
  set_api_tokens: "text-accent bg-accent-soft border-accent-line",
  reset_api_usage: "text-accent bg-accent-soft border-accent-line",
  recharge_balance: "text-accent bg-accent-soft border-accent-line",
  set_balance: "text-accent bg-accent-soft border-accent-line",
  recharge_api_balance: "text-accent bg-accent-soft border-accent-line",
  set_api_balance: "text-accent bg-accent-soft border-accent-line",
  update_provider: "text-accent bg-accent-soft border-accent-line",
  update_search: "text-accent bg-accent-soft border-accent-line",
};