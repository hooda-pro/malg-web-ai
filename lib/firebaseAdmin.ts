import { cert, getApps, initializeApp, type App } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

// بيانات حساب الخدمة (Service Account) بتاعة مشروع Firebase — بتتاخد من
// https://console.firebase.google.com/ > Project settings > Service accounts > Generate new private key
// بيتحمّلك ملف JSON فيه project_id و client_email و private_key.
// متحطش الملف ده في الكود؛ خليه في متغيرات البيئة بس (على السيرفر، من غير NEXT_PUBLIC_):
//   FIREBASE_PROJECT_ID
//   FIREBASE_CLIENT_EMAIL
//   FIREBASE_PRIVATE_KEY   (خلي الأسطر الجديدة فيه \n زي ما هي، وهنعملها replace تحت)
let _app: App | null = null;

function getAdminApp(): App {
  if (_app) return _app;
  if (getApps().length) {
    _app = getApps()[0];
    return _app;
  }

  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = (process.env.FIREBASE_PRIVATE_KEY || "").replace(/\\n/g, "\n");

  if (!projectId || !clientEmail || !privateKey) {
    throw new Error(
      "إعدادات Firebase Admin مش متضبطة — ضيف FIREBASE_PROJECT_ID و FIREBASE_CLIENT_EMAIL و FIREBASE_PRIVATE_KEY في متغيرات البيئة (Vercel Project Settings > Environment Variables) من ملف الـ Service Account اللي بتحمله من Firebase Console."
    );
  }

  _app = initializeApp({
    credential: cert({ projectId, clientEmail, privateKey }),
  });
  return _app;
}

export interface GoogleIdentity {
  uid: string;
  email: string;
  name: string | null;
  picture: string | null;
}

/** بيتحقق من ID Token اللي جاي من تسجيل الدخول بجوجل في المتصفح (lib/firebaseClient.ts). */
export async function verifyGoogleIdToken(idToken: string): Promise<GoogleIdentity> {
  const decoded = await getAuth(getAdminApp()).verifyIdToken(idToken);
  if (!decoded.email) {
    throw new Error("حساب جوجل ده مفيهوش بريد إلكتروني ظاهر");
  }
  return {
    uid: decoded.uid,
    email: decoded.email.trim().toLowerCase(),
    name: (decoded.name as string | undefined) || null,
    picture: (decoded.picture as string | undefined) || null,
  };
}

/**
 * بيخزن/يحدّث نسخة من بيانات البروفايل في Firestore (users/{uid}) —
 * دي مجرد نسخة إضافية على فايربيس نفسه؛ المصدر الأساسي لبيانات التطبيق
 * (الشات والكوتة وغيرها) لسه في قاعدة البيانات Postgres.
 */
export async function saveProfileToFirestore(
  uid: string,
  data: { email: string; name: string; age: number | null; photoURL?: string | null }
): Promise<void> {
  try {
    const db = getFirestore(getAdminApp());
    await db
      .collection("users")
      .doc(uid)
      .set(
        {
          email: data.email,
          name: data.name,
          age: data.age,
          photoURL: data.photoURL ?? null,
          updatedAt: new Date().toISOString(),
        },
        { merge: true }
      );
  } catch (e) {
    // لو Firestore مش مفعّل أو حصل خطأ، متوقفش عملية تسجيل الدخول بسبب كده —
    // Postgres هو مصدر الحقيقة الأساسي للتطبيق.
    console.error("saveProfileToFirestore error", e);
  }
}
