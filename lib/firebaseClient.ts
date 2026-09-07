"use client";

import { initializeApp, getApps, getApp } from "firebase/app";
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signOut as firebaseSignOut,
} from "firebase/auth";

// بيانات مشروع Firebase — بتتاخد من إعدادات مشروعك في
// https://console.firebase.google.com/ (Project settings > General > Your apps > Web app > SDK setup and configuration).
// لازم تتحط في متغيرات البيئة (ملف .env.local محليًا، أو Environment Variables في Vercel).
// دول كلهم NEXT_PUBLIC_ عشان لازم يوصلوا للمتصفح.
const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

function getFirebaseApp() {
  if (getApps().length) return getApp();
  return initializeApp(firebaseConfig);
}

/**
 * بيفتح نافذة "تسجيل الدخول بجوجل" وبيرجع الـ ID Token بتاع فايربيس.
 * الـ Token ده اللي بنبعته للسيرفر عشان يتأكد من هويتك (lib/firebaseAdmin.ts)
 * وينشئ/يجيب حسابك من قاعدة البيانات.
 */
export async function signInWithGoogle(): Promise<string> {
  const auth = getAuth(getFirebaseApp());
  const provider = new GoogleAuthProvider();
  // بيضمن ظهور شاشة اختيار الحساب كل مرة بدل ما يختار حساب واحد تلقائي
  provider.setCustomParameters({ prompt: "select_account" });
  const result = await signInWithPopup(auth, provider);
  return result.user.getIdToken();
}

export async function firebaseSignOutClient(): Promise<void> {
  try {
    const auth = getAuth(getFirebaseApp());
    await firebaseSignOut(auth);
  } catch {
    // تجاهل — مش مشكلة لو فشل، الجلسة الحقيقية بتتقفل بكوكي السيرفر
  }
}
