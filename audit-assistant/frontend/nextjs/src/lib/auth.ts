// Basic Firebase client initialization
import { initializeApp, getApps } from 'firebase/app';
import { getAuth, setPersistence, browserLocalPersistence } from 'firebase/auth';
import { getAnalytics, isSupported as analyticsSupported } from 'firebase/analytics';

const cfg = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || 'dev',
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || 'dev',
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || 'dev',
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || 'dev',
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID,
} as const;

export const app = getApps().length ? getApps()[0] : initializeApp(cfg);
export const auth = getAuth(app);
// Persist sessions in local storage so reloads keep the user
setPersistence(auth, browserLocalPersistence).catch(() => {
  // non-fatal in SSR/test
});

// Initialize Analytics in browser if supported and configured
if (typeof window !== 'undefined') {
  // Only attempt when measurementId provided; guard on support
  if (cfg.measurementId) {
    analyticsSupported().then((ok) => {
      if (!ok) return;
      try { getAnalytics(app); } catch {}
    }).catch(() => {});
  }
}

// handy flag for runtime checks
export const isFirebaseConfigured = !Object.values(cfg).some((v) => v === 'dev');
