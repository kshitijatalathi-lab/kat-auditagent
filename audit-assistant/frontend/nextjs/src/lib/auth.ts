// Basic Firebase client initialization
import { initializeApp, getApps } from 'firebase/app';
import { getAuth, setPersistence, browserLocalPersistence } from 'firebase/auth';

const cfg = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || 'dev',
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || 'dev',
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || 'dev',
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || 'dev',
};

export const app = getApps().length ? getApps()[0] : initializeApp(cfg);
export const auth = getAuth(app);
// Persist sessions in local storage so reloads keep the user
setPersistence(auth, browserLocalPersistence).catch(() => {
  // non-fatal in SSR/test
});

// handy flag for runtime checks
export const isFirebaseConfigured = !Object.values(cfg).some((v) => v === 'dev');
