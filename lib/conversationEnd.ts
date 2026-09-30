/**
 * إنهاء المحادثة (زي Claude):
 *
 * 1) لو المستخدم سلوكه مش طبيعي (شتايم، إهانات، تحرش، استفزاز متعمد...) الموديل
 *    ما يقفلش الشات على طول — الأول بيستدعي warn_user ويكتب تحذير محترم وهادي.
 * 2) لو المستخدم كمّل بعد التحذير، الموديل يقدر يستدعي end_conversation.
 * 3) السيرفر هو اللي بيفرض القاعدة: end_conversation بترجع رفض لو مفيش تحذير اتسجّل
 *    في رد سابق في نفس المحادثة (الموديل لوحده مايقدرش يقفل من غير تحذير).
 * 4) بعد القفل: الشات بيتحفظ كمقفول في الداتابيز، والسيرفر بيرفض أي رسالة جديدة،
 *    والواجهة بتشيل خانة الكتابة وتعرض إشعار + زرار محادثة جديدة.
 */

/** أقل عدد تحذيرات لازم يكون اتسجّل (في ردود سابقة) قبل ما end_conversation تشتغل (قفل بسبب سلوك مسيء). */
export const MIN_WARNINGS_BEFORE_END = 1;

/**
 * قفل بطلب المستخدم: الموديل لازم الأول يستدعي ask_close_confirmation ويشرح النتيجة ويستنى رد صريح.
 * السيرفر بيسجّل "تأكيد معلّق" في الداتابيز، وend_conversation(initiator="user_request") مبتشتغلش
 * إلا لو التأكيد ده اتسجّل في الرد اللي قبل رسالة المستخدم الحالية (صالح لرسالة واحدة بس).
 */
export type EndInitiator = "abuse" | "user_request";

export const WARN_USER_TOOL = {
  type: "function",
  function: {
    name: "warn_user",
    description:
      "سجّل إن المستخدم سلوكه غير مقبول (شتايم/إهانات متكررة، تحرش، استفزاز متعمد، طلبات مسيئة بشكل واضح) " +
      "واكتب له تحذير محترم وهادي في نفس الرد. استخدمها الأول دايمًا قبل التفكير في end_conversation. " +
      "ما تستخدمهاش لمجرد إن المستخدم زعلان أو متضايق أو اتكلم بحدة مرة واحدة أو شتم الكود/الموقف مش شتم فيك.",
    parameters: {
      type: "object",
      properties: {
        reason: {
          type: "string",
          description: "سبب قصير (جملة واحدة) بيوضح السلوك اللي اتحذّر منه.",
        },
      },
      required: ["reason"],
    },
  },
} as const;

export const ASK_CLOSE_CONFIRMATION_TOOL = {
  type: "function",
  function: {
    name: "ask_close_confirmation",
    description:
      "استدعيها لما المستخدم يطلب منك صراحةً إنك تقفل/تنهي المحادثة (مثال: «اقفل الشات»، «خلّصنا هنا»، «end this chat»). " +
      "الأداة دي مبتقفلش حاجة — بتسجّل بس إنك هتطلب تأكيد. اكتب في نفس ردك رسالة تأكيد واضحة: " +
      "لو قفلت المحادثة مش هنقدر نتكلم هنا تاني، والخانة هتختفي، ولازم يعمل محادثة جديدة (والرسايل القديمة تفضل مقروءة). " +
      "واسأله بوضوح: متأكد إنك عايز أقفلها؟ وبعدها استنى ردّه.",
    parameters: {
      type: "object",
      properties: {},
    },
  },
} as const;

export const END_CONVERSATION_TOOL = {
  type: "function",
  function: {
    name: "end_conversation",
    description:
      "اقفل المحادثة نهائيًا: الشات بيبقى للقراءة بس والمستخدم مش هيقدر يكتب فيه تاني (يقدر يبدأ محادثة جديدة). " +
      "فيه حالتين بس، وحدد initiator بدقة:\n" +
      "• initiator=\"user_request\": المستخدم طلب القفل، وانت سألته في ردك السابق عن التأكيد (ask_close_confirmation)، ورد دلوقتي بتأكيد صريح وواضح. " +
      "السيرفر هيرفض لو مفيش طلب تأكيد سابق. لو ردّه مش واضح أو رجع في كلامه، متقفلش.\n" +
      "• initiator=\"abuse\": المستخدم كمّل في سلوك مسيء بعد ما اتحذّر فعلًا في رد سابق (warn_user). السيرفر هيرفض لو مفيش تحذير سابق.\n" +
      "ممنوع تمامًا تستخدمها بسبب سلوك مسيء لو المستخدم بيتكلم عن إيذاء نفسه أو انتحار أو في أزمة نفسية، أو لو فيه خطر على حد — " +
      "حتى لو كان بيشتم أو بيتكلم بعصبية.",
    parameters: {
      type: "object",
      properties: {
        initiator: {
          type: "string",
          enum: ["user_request", "abuse"],
          description: "مين السبب: user_request (المستخدم طلب وأكّد) أو abuse (سلوك مسيء بعد تحذير).",
        },
        reason: {
          type: "string",
          description: "سبب قصير (جملة واحدة) لقفل المحادثة.",
        },
      },
      required: ["initiator", "reason"],
    },
  },
} as const;

export type ModerationToolName = "warn_user" | "end_conversation" | "ask_close_confirmation";

export function isModerationTool(name: string): name is ModerationToolName {
  return name === "warn_user" || name === "end_conversation" || name === "ask_close_confirmation";
}

/** الرسالة الافتراضية لو الموديل قفل المحادثة من غير ما يكتب أي كلام قبلها/بعدها. */
export const DEFAULT_END_MESSAGE =
  "قفلت المحادثة دي لأن السلوك المسيء استمر بعد التحذير. تقدر تبدأ محادثة جديدة في أي وقت.";
export const DEFAULT_END_MESSAGE_USER =
  "تمام، قفلت المحادثة زي ما طلبت. لو احتجت أي حاجة تقدر تبدأ محادثة جديدة في أي وقت 👋";

/** الحد الأقصى لطول سبب التحذير/القفل المتخزّن. */
export function cleanReason(raw: unknown): string {
  return typeof raw === "string" ? raw.replace(/[\u0000-\u001f]/g, " ").trim().slice(0, 300) : "";
}
