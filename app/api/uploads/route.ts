import { NextRequest, NextResponse } from "next/server";
import { createHash, randomUUID } from "crypto";
import { getSessionUser } from "@/lib/auth";
import { MAX_UPLOAD_BYTES, detectAttachmentKind, formatBytes } from "@/lib/attachments";

export const dynamic = "force-dynamic";

/** بينضّف اسم الملف من مسارات/رموز خطرة قبل التخزين. */
function safeName(name: string): string {
  const base = (name || "file").split("/").pop()?.split("\\").pop() || "file";
  const cleaned = base.replace(/[^\w\u0600-\u06FF\-. ]+/g, "_").slice(0, 120);
  return cleaned || "file";
}

/**
 * رفع ملف مرفقات (multipart) على Cloudinary عبر السيرفر (signed upload —
 * المفاتيح السرية لا تخرج من السيرفر). بيرجّع رابطًا دائمًا صغيرًا — العميل
 * بيبعته في /api/chat بدل محتوى الملف نفسه، عشان طلب الشات يفضل صغيرًا
 * ولا ترفضه طبقة الاستضافة.
 * (Free plan: تسجيل بدون كارت، 25 credits شهريًا.)
 */
export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "يجب تسجيل الدخول" }, { status: 401 });
  }

  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;
  if (!cloudName || !apiKey || !apiSecret) {
    return NextResponse.json(
      { error: "خدمة رفع الملفات غير مفعّلة بعد — جرّب لاحقًا" },
      { status: 500 }
    );
  }

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "تعذّر قراءة الملف" }, { status: 400 });
  }
  const entry = form.get("file");
  if (!entry || typeof entry === "string" || typeof (entry as File).arrayBuffer !== "function") {
    return NextResponse.json({ error: "لا يوجد ملف" }, { status: 400 });
  }
  const file = entry as unknown as File;
  if (file.size <= 0) {
    return NextResponse.json({ error: "الملف فارغ" }, { status: 400 });
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return NextResponse.json(
      { error: `الملف كبير جدًا — الحد الأقصى ${formatBytes(MAX_UPLOAD_BYTES)}` },
      { status: 413 }
    );
  }

  const name = safeName(file.name || "file");
  const kind = detectAttachmentKind(name, file.type || "");
  // رفع الفيديو موقوف من الواجهة — مرفوض هنا أيضًا.
  if (kind === "video") {
    return NextResponse.json({ error: "رفع الفيديو متوقف حاليا" }, { status: 400 });
  }

  try {
    const buf = Buffer.from(await file.arrayBuffer());
    const timestamp = Math.floor(Date.now() / 1000);
    const publicId = `malg-chat/${user.id}/${randomUUID()}/${name.replace(/\.[^.]+$/, "")}`;
    const signature = createHash("sha1")
      .update(`public_id=${publicId}&timestamp=${timestamp}${apiSecret}`)
      .digest("hex");
    const cloudForm = new FormData();
    cloudForm.append("file", new Blob([buf], { type: file.type || "application/octet-stream" }), name);
    cloudForm.append("api_key", apiKey);
    cloudForm.append("timestamp", String(timestamp));
    cloudForm.append("public_id", publicId);
    cloudForm.append("signature", signature);
    const up = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/auto/upload`, {
      method: "POST",
      body: cloudForm,
      signal: AbortSignal.timeout(60_000),
    });
    const data = await up.json().catch(() => null);
    if (!up.ok || !data?.secure_url) {
      console.error("[uploads] cloudinary failed", up.status, data?.error || data);
      return NextResponse.json({ error: "تعذّر رفع الملف — حاول مجددًا" }, { status: 502 });
    }
    return NextResponse.json({
      url: String(data.secure_url),
      name,
      size: file.size,
      kind,
    });
  } catch (e) {
    console.error("[uploads] failed", e);
    return NextResponse.json({ error: "تعذّر رفع الملف — حاول مجددًا" }, { status: 500 });
  }
}
