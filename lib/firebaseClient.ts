"use client";

import { initializeApp, getApps, getApp } from "firebase/app";
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  signOut as firebaseSignOut,
} from "firebase/auth";

// Firebase project config — from console.firebase.google.com
// (Project settings > General > Your apps > Web app > SDK setup and configuration).
// All NEXT_PUBLIC_ so they reach the browser.
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

function makeProvider(): GoogleAuthProvider {
  const provider = new GoogleAuthProvider();
  // Always show the account chooser instead of auto-picking one account
  provider.setCustomParameters({ prompt: "select_account" });
  return provider;
}

/**
 * App browsers (WhatsApp/Instagram/Facebook/TikTok/Telegram...) open links in a
 * WebView, and Google rejects OAuth inside them (disallowed_useragent). This is the
 * top cause of login failure on iPhone when a friend opens the link from a message.
 */
export function isInAppBrowser(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  if (/FBAN|FBAV|FB_IAB|Instagram|Line\/|Snapchat|TikTok|BytedanceWebview|musical_ly|LinkedInApp|Twitter|MicroMessenger|Telegram|GSA\//i.test(ua)) return true;
  // Generic WebView on iOS: AppleWebKit present without a real browser token
  const isIOS = /iPhone|iPad|iPod/i.test(ua);
  if (isIOS && /AppleWebKit/i.test(ua) && !/Safari|CriOS|FxiOS|EdgiOS/i.test(ua)) return true;
  return false;
}

/** True on iPhone/iPad/iPod — every browser there is WebKit, where popups are unreliable. */
export function isIOS(): boolean {
  if (typeof navigator === "undefined") return false;
  return /iPhone|iPad|iPod/i.test(navigator.userAgent || "");
}

/** Firebase error code (auth/...) if present */
export function authErrorCode(e: unknown): string {
  const code = (e as { code?: unknown } | null)?.code;
  return typeof code === "string" ? code : "";
}

/**
 * Opens the Google sign-in popup and returns the Firebase ID token.
 * Desktop path — popups are blocked/unreliable on iOS (use redirect there).
 */
export async function signInWithGoogle(): Promise<string> {
  const auth = getAuth(getFirebaseApp());
  const result = await signInWithPopup(auth, makeProvider());
  return result.user.getIdToken();
}

/**
 * iOS path: navigates the whole tab to Google and back (no popup involved).
 * After returning, call getGoogleRedirectToken() to finish.
 */
export async function signInWithGoogleRedirect(): Promise<void> {
  const auth = getAuth(getFirebaseApp());
  await signInWithRedirect(auth, makeProvider());
}

/**
 * Completes a redirect login: returns the ID token, or null when this page load
 * is NOT a return from Google (normal visit). Throws on real errors.
 */
export async function getGoogleRedirectToken(): Promise<string | null> {
  const auth = getAuth(getFirebaseApp());
  const result = await getRedirectResult(auth);
  if (!result?.user) return null;
  return result.user.getIdToken();
}

export async function firebaseSignOutClient(): Promise<void> {
  try {
    const auth = getAuth(getFirebaseApp());
    await firebaseSignOut(auth);
  } catch {
    // Non-issue — the real session ends with the server cookie
  }
}
