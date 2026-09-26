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
}

export interface UserQuota {
  totalAllocatedTokens: number;
  usedTokens: number;
  quotaExhaustedAt: string | null;
  isAdmin: boolean;
}
