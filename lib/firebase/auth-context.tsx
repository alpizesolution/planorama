"use client";

import React, { createContext, useContext, useEffect, useState, useMemo } from "react";
import type { User } from "firebase/auth";
import { onAuthStateChanged, signInWithPopup, signOut } from "firebase/auth";
import { getFirebaseAuth, getGoogleProvider, isFirebaseConfigured } from "./config";

interface AuthContextType {
  user: User | null;
  loading: boolean;
  isConfigured: boolean;
  error: string | null;
  signInWithGoogle: () => Promise<User | null>;
  signOutUser: () => Promise<void>;
  clearError: () => void;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  isConfigured: false,
  error: null,
  signInWithGoogle: async () => null,
  signOutUser: async () => {},
  clearError: () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const configured = useMemo(() => isFirebaseConfigured(), []);

  useEffect(() => {
    const authInstance = getFirebaseAuth();
    if (!authInstance) {
      setLoading(false);
      return;
    }

    const unsubscribe = onAuthStateChanged(
      authInstance,
      (currentUser) => {
        setUser(currentUser);
        setLoading(false);
      },
      (err) => {
        console.error("[Firebase Auth] State change error:", err);
        setError(err.message);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, []);

  const signInWithGoogle = async (): Promise<User | null> => {
    setError(null);
    const authInstance = getFirebaseAuth();
    const providerInstance = getGoogleProvider();

    if (!authInstance || !providerInstance) {
      const msg = "Firebase is not yet configured. Please set your NEXT_PUBLIC_FIREBASE_API_KEY environment variables.";
      setError(msg);
      throw new Error(msg);
    }

    try {
      setLoading(true);
      const result = await signInWithPopup(authInstance, providerInstance);
      setUser(result.user);
      return result.user;
    } catch (err: unknown) {
      const errorObj = err as { code?: string; message?: string };
      // User closed popup without signing in is a normal user cancellation, not a breaking error
      if (errorObj.code === "auth/popup-closed-by-user") {
        setLoading(false);
        return null;
      }
      const message = errorObj.message || "Failed to sign in with Google.";
      console.error("[Firebase Auth] Google Sign-In error:", err);
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const signOutUser = async (): Promise<void> => {
    setError(null);
    const authInstance = getFirebaseAuth();
    if (!authInstance) {
      setUser(null);
      return;
    }

    try {
      setLoading(true);
      await signOut(authInstance);
      setUser(null);
    } catch (err: unknown) {
      const errorObj = err as { message?: string };
      console.error("[Firebase Auth] Sign out error:", err);
      setError(errorObj.message || "Failed to sign out.");
    } finally {
      setLoading(false);
    }
  };

  const clearError = () => setError(null);

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        isConfigured: configured,
        error,
        signInWithGoogle,
        signOutUser,
        clearError,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
