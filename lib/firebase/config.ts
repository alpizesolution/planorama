import { initializeApp, getApps, getApp, type FirebaseApp } from "firebase/app";
import { getAuth, GoogleAuthProvider, type Auth } from "firebase/auth";

export const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || "AIzaSyC9MzTL2n6CKPJrA9fc5CU7OWOfvTlDs_Q",
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || "planoramaph.firebaseapp.com",
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "planoramaph",
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || "planoramaph.firebasestorage.app",
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || "549078667558",
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || "1:549078667558:web:39557f88188f87c2bb71e7",
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID || "G-H7149S2744",
};

/**
 * Checks whether Firebase configuration is populated.
 */
export function isFirebaseConfigured(): boolean {
  return Boolean(firebaseConfig.apiKey && firebaseConfig.appId);
}

let app: FirebaseApp | null = null;
let auth: Auth | null = null;
let googleProvider: GoogleAuthProvider | null = null;

export function getFirebaseAuth(): Auth | null {
  if (auth) return auth;
  if (typeof window !== "undefined" && firebaseConfig.apiKey) {
    try {
      app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
      auth = getAuth(app);
      return auth;
    } catch (err) {
      console.warn("[Firebase] Auth initialization error:", err);
    }
  }
  return null;
}

export function getGoogleProvider(): GoogleAuthProvider | null {
  if (googleProvider) return googleProvider;
  if (typeof window !== "undefined" && firebaseConfig.apiKey) {
    googleProvider = new GoogleAuthProvider();
    googleProvider.setCustomParameters({ prompt: "select_account" });
    return googleProvider;
  }
  return null;
}

// Initial client-side attempt
getFirebaseAuth();
getGoogleProvider();

export { app, auth, googleProvider };
