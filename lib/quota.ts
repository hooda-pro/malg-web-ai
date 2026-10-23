import { sql } from "./db";
import { formatBalance } from "./ai";
import { QUOTA_RENEWAL_INTERVAL_MS, REGISTERED_BALANCE_MICRO } from "./systemPrompt";

/**
 * نظام الرصيد بالدولار (تحديث ١٩) — التوكنز كنظام رصيد اتحطّم:
 * الوحدة الداخلية micro-dollar (µ$) — $1 = 1,000,000 µ$ (عدد صحيح، بدون كسور).
 * كل موديل ليه سعر إدخال وإخراج بالدولار لكل مليون وحدة (ai_models.price_in_usd /
 * price_out_usd — محفوظة بالـµ$ لكل مليون)، والخصم بيحصل على حسب سعر الموديل
 * اللي المستخدم اختاره وكم استخدم منه — «بيحتجه ع حب». الموديل من غير سعر (0) مجاني.
 * الرصيد بيتجدد تلقائيًا بعد شهر كامل (30 يوم) من لحظة النفاد — نفس منطق النظام القديم.
 */

export async function ensureUserCredits(userId: string) {
  const rows = await sql`SELECT user_id FROM user_credits WHERE user_id = ${userId}`;
  if (rows.length === 0) {
    await sql`
      INSERT INTO user_credits (user_id, total_micro, used_micro)
      VALUES (${userId}, ${REGISTERED_BALANCE_MICRO}, 0)
      ON CONFLICT (user_id) DO NOTHING
    `;
  }
}

export type CreditCheckResult =
  /** remainingMicro = المتبقي قبل الرد ده بالـµ$ (null = مفيش حد، زي الأدمن) */
  | { blocked: false; remainingMicro: number | null }
  | { blocked: true; message: string };

/** يسمح، أو يرفض برسالة عربية واضحة، مع تجديد تلقائي بعد شهر كامل (30 يوم) من نفاد الرصيد. */
export async function checkAndMaybeRenewCredits(
  userId: string,
  isAdmin: boolean
): Promise<CreditCheckResult> {
  await ensureUserCredits(userId);

  const rows = await sql`
    SELECT total_micro, used_micro, exhausted_at
    FROM user_credits WHERE user_id = ${userId}
  `;
  const quota = rows[0] as
    | { total_micro: number; used_micro: number; exhausted_at: string | null }
    | undefined;

  const totalMicro = Number(quota?.total_micro ?? REGISTERED_BALANCE_MICRO);
  const usedMicro = Number(quota?.used_micro ?? 0);
  const now = Date.now();

  if (isAdmin) {
    return { blocked: false, remainingMicro: null };
  }

  if (usedMicro < totalMicro) {
    // الرصيد اتشحن/اتجدد بعد نفاد سابق → نمسح علامة النفاد القديمة (وإلا أي نفاد جاي هيتجدد فورًا بالغلط)
    if (quota?.exhausted_at) {
      await sql`UPDATE user_credits SET exhausted_at = NULL WHERE user_id = ${userId}`;
    }
    return { blocked: false, remainingMicro: totalMicro - usedMicro };
  }

  const exhaustedAt = quota?.exhausted_at ? new Date(quota.exhausted_at).getTime() : null;

  if (exhaustedAt === null) {
    await sql`
      UPDATE user_credits SET exhausted_at = now()
      WHERE user_id = ${userId} AND exhausted_at IS NULL
    `;
    return {
      blocked: true,
      message: `لقد استنفذت رصيدك (${formatBalance(totalMicro)}). سيتجدد الرصيد تلقائيًا بعد شهر كامل (30 يومًا) من الآن، أو اشحن رصيدك فورًا من «شحن الرصيد» في قائمة حسابك.`,
    };
  }

  const elapsed = now - exhaustedAt;
  if (elapsed >= QUOTA_RENEWAL_INTERVAL_MS) {
    // التجديد الشهري بيرجّع الرصيد المجاني الأساسي بس. قبل كده كان بيصفّر الاستهلاك قدّام الرصيد
    // الكلي، وده معناه إن أي رصيد اشتراه المستخدم كان بيرجع له كامل كل 30 يوم.
    // (التجديد بيحصل بس بعد نفاد الرصيد بالكامل، فمفيش رصيد مدفوع متبقٍ بيضيع.)
    await sql`
      UPDATE user_credits
      SET used_micro = 0, total_micro = ${REGISTERED_BALANCE_MICRO},
          exhausted_at = NULL, updated_at = now()
      WHERE user_id = ${userId}
    `;
    return { blocked: false, remainingMicro: REGISTERED_BALANCE_MICRO };
  }

  const remainingMs = QUOTA_RENEWAL_INTERVAL_MS - elapsed;
  const remainingDays = Math.floor(remainingMs / 86_400_000);
  const remainingHours = Math.floor((remainingMs % 86_400_000) / 3_600_000);
  const remainingMinutes = Math.floor((remainingMs % 3_600_000) / 60_000);
  const remainingText =
    remainingDays > 0
      ? `${remainingDays} يوم و ${remainingHours} ساعة`
      : remainingHours > 0
        ? `${remainingHours} ساعة و ${remainingMinutes} دقيقة`
        : `${remainingMinutes} دقيقة`;
  return {
    blocked: true,
    message: `لقد استنفذت رصيدك (${formatBalance(totalMicro)}). سيتجدد الرصيد تلقائيًا خلال ${remainingText}، أو اشحن رصيدك فورًا من «شحن الرصيد» في قائمة حسابك.`,
  };
}

export async function deductBalance(userId: string, microUSD: number, isAdmin = false) {
  if (!(microUSD > 0)) return;
  await sql`
    UPDATE user_credits SET used_micro = used_micro + ${microUSD}, updated_at = now()
    WHERE user_id = ${userId}
  `;
  // أول ما الرصيد يخلص بنسجّل لحظة النفاد فورًا (مش عند أول محاولة إرسال) عشان
  // عدّاد التجديد التلقائي (شهر كامل) والواجهة يبدأوا من اللحظة الصح.
  if (!isAdmin) {
    await sql`
      UPDATE user_credits SET exhausted_at = now()
      WHERE user_id = ${userId} AND used_micro >= total_micro AND exhausted_at IS NULL
    `;
  }
}

/**
 * معادلة التكلفة المشتركة (تحديث ١٩): (وحدات الإدخال × سعر الإدخال + وحدات الإخراج × سعر الإخراج) ÷ مليون.
 * الأسعار بالـµ$ لكل مليون وحدة. الموديل من غير سعر (0/0) → 0 = مجاني بلا أي خصم.
 * مثال: موديل بـ$4/1M إدخال (priceInMicro = 4,000,000) + 1,000 وحدة إدخال → 4,000µ$ = $0.004.
 */
export function costMicroFor(
  inUnits: number,
  outUnits: number,
  priceInMicro: number,
  priceOutMicro: number
): number {
  const pin = Math.max(Number(priceInMicro) || 0, 0);
  const pout = Math.max(Number(priceOutMicro) || 0, 0);
  if (pin <= 0 && pout <= 0) return 0;
  const inUnitsSafe = Math.max(Number(inUnits) || 0, 0);
  const outUnitsSafe = Math.max(Number(outUnits) || 0, 0);
  return Math.min(
    Math.max(Math.round((inUnitsSafe * pin + outUnitsSafe * pout) / 1_000_000), 0),
    999_999_999 // سقف أمان للخصم في النداء الواحد ($999.99)
  );
}

/**
 * الربح الثابت للأدمن (تحديث ١٩): فوق تكلفة الموديل (× الهامش)، بيتضاف مبلغ
 * ثابت بالدولار لكل مليون وحدة مستهلكة (إدخال + إخراج). مثال: ربح $5/1M
 * (profitPerMillionMicro = 5,000,000) و10,000 وحدة → 50,000µ$ = $0.05 ربح إضافي.
 * نفس سقف الأمان بتاع costMicroFor — وكل الأرقام محسوبة صحيحة بلا كسور.
 */
export function costWithProfitMicro(
  inUnits: number,
  outUnits: number,
  priceInMicro: number,
  priceOutMicro: number,
  costMult: number,
  profitPerMillionMicro: number
): number {
  const cost = costMicroFor(inUnits, outUnits, priceInMicro, priceOutMicro) * Math.max(Number(costMult) || 1, 1);
  const totalUnits = Math.max(Number(inUnits) || 0, 0) + Math.max(Number(outUnits) || 0, 0);
  const profit = Math.round((totalUnits * Math.max(Number(profitPerMillionMicro) || 0, 0)) / 1_000_000);
  return Math.min(Math.max(Math.round(cost) + profit, 0), 999_999_999);
}

export interface CreditSnapshot {
  totalMicro: number;
  usedMicro: number;
  exhaustedAt: string | null;
  /** إمتى الرصيد هيتجدد تلقائيًا (null لو الرصيد لسه فيه مبلغ أو المستخدم أدمن) */
  renewsAt: string | null;
}

/** لقطة الرصيد الحالية — بتطبّق التجديد التلقائي لو عدّت مدة التجديد (شهر)، فالواجهة تفتح لوحدها من غير رسالة إرسال. */
export async function getCreditSnapshot(userId: string, isAdmin: boolean): Promise<CreditSnapshot> {
  await checkAndMaybeRenewCredits(userId, isAdmin);
  const rows = await sql`
    SELECT total_micro, used_micro, exhausted_at
    FROM user_credits WHERE user_id = ${userId}
  `;
  const row = rows[0] as
    | { total_micro: number; used_micro: number; exhausted_at: string | null }
    | undefined;
  const total = Number(row?.total_micro ?? REGISTERED_BALANCE_MICRO);
  const used = Number(row?.used_micro ?? 0);
  const exhaustedAt = row?.exhausted_at ?? null;
  const depleted = !isAdmin && used >= total;
  return {
    totalMicro: total,
    usedMicro: used,
    exhaustedAt,
    renewsAt:
      depleted && exhaustedAt
        ? new Date(new Date(exhaustedAt).getTime() + QUOTA_RENEWAL_INTERVAL_MS).toISOString()
        : null,
  };
}
