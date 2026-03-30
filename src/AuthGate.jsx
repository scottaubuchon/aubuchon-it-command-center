import { useState, useEffect } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { auth, googleProvider, signInWithPopup, signOut, ALLOWED_EMAILS } from "./firebase";
import { Monitor, Wrench, LogOut, ShieldAlert } from "lucide-react";

function LoginScreen() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleSignIn = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await signInWithPopup(auth, googleProvider);
      const email = result.user.email.toLowerCase();
      if (!ALLOWED_EMAILS.includes(email)) {
        await signOut(auth);
        setError("Access denied. This account is not authorized.");
      }
    } catch (err) {
      if (err.code === "auth/popup-closed-by-user") {
        setError(null);
      } else {
        setError("Sign-in failed. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-950 to-indigo-950 flex items-center justify-center p-4">
      <div className="bg-white/10 backdrop-blur-xl rounded-2xl shadow-2xl border border-white/20 p-8 max-w-sm w-full text-center">
        {/* Logo */}
        <div className="flex justify-center mb-6">
          <div className="w-16 h-16 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-2xl flex items-center justify-center shadow-lg relative">
            <Monitor size={30} className="text-white" />
            <Wrench size={16} className="text-amber-300 absolute bottom-2 right-2" />
          </div>
        </div>

        <h1 className="text-2xl font-bold text-white mb-1">Scott's Workbench</h1>
        <p className="text-blue-200/70 text-sm mb-8">Aubuchon IT Operations Hub</p>

        {error && (
          <div className="bg-red-500/20 border border-red-400/30 rounded-lg p-3 mb-6 flex items-center gap-2">
            <ShieldAlert size={16} className="text-red-300 shrink-0" />
            <p className="text-red-200 text-sm">{error}</p>
          </div>
        )}

        <button
          onClick={handleSignIn}
          disabled={loading}
          className="w-full bg-white hover:bg-gray-50 text-gray-800 font-medium py-3 px-4 rounded-xl shadow-md transition-all duration-200 flex items-center justify-center gap-3 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
        >
          <svg width="20" height="20" viewBox="0 0 48 48">
            <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
            <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
            <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
            <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
          </svg>
          {loading ? "Signing in..." : "Sign in with Google"}
        </button>

        <p className="text-blue-300/40 text-xs mt-6">Authorized personnel only</p>
      </div>
    </div>
  );
}

function UnauthorizedScreen({ user }) {
  const handleSignOut = async () => {
    await signOut(auth);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-red-950 to-slate-900 flex items-center justify-center p-4">
      <div className="bg-white/10 backdrop-blur-xl rounded-2xl shadow-2xl border border-white/20 p-8 max-w-sm w-full text-center">
        <div className="flex justify-center mb-6">
          <div className="w-16 h-16 bg-gradient-to-br from-red-500 to-red-700 rounded-2xl flex items-center justify-center shadow-lg">
            <ShieldAlert size={30} className="text-white" />
          </div>
        </div>
        <h1 className="text-2xl font-bold text-white mb-2">Access Denied</h1>
        <p className="text-red-200/70 text-sm mb-2">Signed in as {user.email}</p>
        <p className="text-red-200/50 text-xs mb-6">This account is not authorized to access Scott's Workbench.</p>
        <button
          onClick={handleSignOut}
          className="w-full bg-white/10 hover:bg-white/20 text-white font-medium py-3 px-4 rounded-xl border border-white/20 transition-all duration-200 flex items-center justify-center gap-2 cursor-pointer"
        >
          <LogOut size={16} />
          Sign out and try another account
        </button>
      </div>
    </div>
  );
}

export default function AuthGate({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-blue-950 to-indigo-950 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
          <p className="text-blue-200/60 text-sm">Loading...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <LoginScreen />;
  }

  if (!ALLOWED_EMAILS.includes(user.email.toLowerCase())) {
    return <UnauthorizedScreen user={user} />;
  }

  return children;
}
