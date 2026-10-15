import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { getSessionUser } from "@/lib/auth";
import { uploadChatFileToStorage } from "@/lib/firebaseAdmin";
import { MAX_UPLOAD_BYTES, detectAttachmentKind, formatBytes } from "@/lib/attachments";

export const dynamic = "force-dynamic";

/** بينضّف اسم الملف من مسارات/رموز خطرة قبل التخزين. */
function safeName(name: string): string {
  const base = (name || "file").split("/").pop()?.split("\\").pop() || "file";
  const cleaned = base.replace(/[^\w\u0600-\u06FF\-. ]+/g, "_").slice(0, 120);
  return cleaned || "file";
}

/**
 * رفع ملف مرفقات (multipart) على Firebase Storage عبر Admin SDK.
 * بيرجّع رابطًا دائمًا صغيرًا — العميل بيبعته في /api/chat بدل محتوى الملف نفسه،
 * عشان طلب الشات يفضل صغيرًا ولا ترفضه طبقة الاستضافة.
 */
export async function POST(req: NextRequest) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "يجب تسجيل الدخول" }, { status: 401 });
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
    const path = `chat-uploads/${user.id}/${randomUUID()}/${name}`;
    const { url } = await uploadChatFileToStorage(
      path,
      buf,
      file.type || "application/octet-stream"
    );
    return NextResponse.json({ url, name, size: file.size, kind });
  } catch (e) {
    console.error("[uploads] failed", e);
    const msg = e instanceof Error && e.message ? e.message : "تعذّر رفع الملف";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
