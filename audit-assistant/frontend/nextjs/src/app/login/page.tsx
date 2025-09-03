'use client';
import { getAuth, GoogleAuthProvider, signInWithPopup, signInWithRedirect } from 'firebase/auth';
import '@/lib/auth';
import { isFirebaseConfigured } from '@/lib/auth';
import { toast } from 'sonner';

export default function LoginPage() {
  const handleGoogle = async () => {
    const auth = getAuth();
    const provider = new GoogleAuthProvider();
    try {
      if (!isFirebaseConfigured) {
        toast.error('Firebase is not configured. Please set NEXT_PUBLIC_FIREBASE_* env vars.');
        return;
      }
      await signInWithPopup(auth, provider);
      window.location.href = '/dashboard';
    } catch (err: any) {
      const msg = String(err?.message || err);
      // Popup blocked or third-party cookies disabled: fallback to redirect
      if (msg.includes('popup') || msg.includes('blocked') || msg.includes('3rd-party')) {
        try {
          await signInWithRedirect(auth, provider);
          return;
        } catch (e: any) {
          toast.error(`Google sign-in failed: ${String(e?.message || e)}`);
        }
      } else {
        toast.error(`Google sign-in failed: ${msg}`);
      }
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-8">
      <div className="w-full max-w-md border rounded-lg p-6 bg-card">
        <h1 className="text-2xl font-semibold mb-2">Sign in</h1>
        <p className="text-sm text-muted-foreground mb-6">Use your organization account to continue.</p>
        <div className="space-y-3">
          <button onClick={handleGoogle} className="w-full px-4 py-2 rounded-md bg-blue-600 text-white">Continue with Google</button>
        </div>
        <div className="mt-6 text-xs text-muted-foreground">
          By continuing you agree to our terms and privacy policy.
        </div>
      </div>
    </div>
  );
}
