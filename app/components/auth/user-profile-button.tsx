"use client";

import React, { useState, useRef, useEffect } from "react";
import { useAuth } from "@/lib/firebase/auth-context";
import {
  SignOut,
  Gear,
  CheckCircle,
  Question,
  X,
  Copy,
  Check,
  CalendarCheck,
} from "@phosphor-icons/react";

interface UserProfileButtonProps {
  onOpenPreferences?: () => void;
  showToast?: (msg: string) => void;
}

export function UserProfileButton({
  onOpenPreferences,
  showToast,
}: UserProfileButtonProps) {
  const { user, loading, isConfigured, signInWithGoogle, signOutUser, clearError } = useAuth();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [setupModalOpen, setSetupModalOpen] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [isSigningIn, setIsSigningIn] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setDropdownOpen(false);
      }
    }
    if (dropdownOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [dropdownOpen]);

  const handleSignInClick = async () => {
    if (!isConfigured) {
      setSetupModalOpen(true);
      return;
    }

    try {
      setIsSigningIn(true);
      clearError();
      const signedIn = await signInWithGoogle();
      if (signedIn) {
        showToast?.(`Welcome back, ${signedIn.displayName || "there"}!`);
      }
    } catch {
      // Error handled by AuthContext state
    } finally {
      setIsSigningIn(false);
    }
  };

  const handleSignOutClick = async () => {
    await signOutUser();
    setDropdownOpen(false);
    showToast?.("Signed out successfully.");
  };

  const copyToClipboard = (text: string, key: string) => {
    void navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  // Google 'G' Logo SVG
  const GoogleGIcon = () => (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" style={{ flexShrink: 0 }}>
      <path
        fill="#4285F4"
        d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.66-5.17 3.66-9.17z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.25v3.15C3.26 21.36 7.35 24 12 24z"
      />
      <path
        fill="#FBBC05"
        d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.25C.45 8.18 0 10.04 0 12s.45 3.82 1.25 5.42l4.03-3.15z"
      />
      <path
        fill="#EA4335"
        d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.35 0 3.26 2.64 1.25 6.58l4.03 3.15c.95-2.83 3.6-4.98 6.72-4.98z"
      />
    </svg>
  );

  // If user is logged in
  if (user) {
    const initials = (user.displayName || user.email || "U")
      .split(" ")
      .map((n) => n[0])
      .slice(0, 2)
      .join("")
      .toUpperCase();

    const firstName = user.displayName?.split(" ")[0] || "Account";

    return (
      <div className="user-profile-wrapper" ref={dropdownRef} style={{ position: "relative" }}>
        <button
          type="button"
          className="user-profile-btn"
          onClick={() => setDropdownOpen((prev) => !prev)}
          aria-label={`Signed in as ${user.displayName || user.email}. Open user menu`}
          aria-expanded={dropdownOpen}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "7px",
            padding: "4px 10px 4px 5px",
            background: "#fffdfa",
            border: "2px solid #1c1917",
            borderRadius: "999px",
            boxShadow: "2px 2px 0px #1c1917",
            cursor: "pointer",
            fontWeight: 600,
            fontSize: "12.5px",
            color: "#1c1917",
            transition: "all 0.15s ease",
          }}
        >
          {user.photoURL ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={user.photoURL}
              alt={user.displayName || "User avatar"}
              style={{
                width: "24px",
                height: "24px",
                borderRadius: "50%",
                border: "1.5px solid #1c1917",
                objectFit: "cover",
              }}
            />
          ) : (
            <span
              style={{
                width: "24px",
                height: "24px",
                borderRadius: "50%",
                background: "#ffd84d",
                border: "1.5px solid #1c1917",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "11px",
                fontWeight: 700,
              }}
            >
              {initials}
            </span>
          )}
          <span className="user-name-label" style={{ maxWidth: "100px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {firstName}
          </span>
          <span style={{ fontSize: "10px", opacity: 0.6, transform: dropdownOpen ? "rotate(180deg)" : "none", transition: "transform 0.15s" }}>
            ▼
          </span>
        </button>

        {dropdownOpen && (
          <div
            className="user-profile-dropdown neo-card"
            style={{
              position: "absolute",
              top: "calc(100% + 8px)",
              right: 0,
              width: "280px",
              background: "#fffdfa",
              border: "2px solid #1c1917",
              borderRadius: "14px",
              boxShadow: "4px 4px 0px #1c1917",
              padding: "16px",
              zIndex: 1050,
            }}
          >
            {/* Header with avatar & email */}
            <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "14px", paddingBottom: "12px", borderBottom: "1.5px solid #f0ebe1" }}>
              {user.photoURL ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={user.photoURL}
                  alt={user.displayName || "Avatar"}
                  style={{
                    width: "44px",
                    height: "44px",
                    borderRadius: "50%",
                    border: "2px solid #1c1917",
                    objectFit: "cover",
                  }}
                />
              ) : (
                <div
                  style={{
                    width: "44px",
                    height: "44px",
                    borderRadius: "50%",
                    background: "#ffd84d",
                    border: "2px solid #1c1917",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: "16px",
                    fontWeight: 800,
                  }}
                >
                  {initials}
                </div>
              )}
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontWeight: 700, fontSize: "14px", color: "#1c1917", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {user.displayName || "Planorama User"}
                </div>
                <div style={{ fontSize: "11.5px", color: "#78716c", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {user.email}
                </div>
                <div style={{ display: "inline-flex", alignItems: "center", gap: "5px", marginTop: "4px", fontSize: "10.5px", color: "#15803d", fontWeight: 600 }}>
                  <CheckCircle size={12} weight="bold" /> Gmail Connected
                </div>
              </div>
            </div>

            {/* Menu Options */}
            <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
              {onOpenPreferences && (
                <button
                  type="button"
                  onClick={() => {
                    setDropdownOpen(false);
                    onOpenPreferences();
                  }}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "10px",
                    padding: "8px 10px",
                    background: "#fcf8f2",
                    border: "1.5px solid #1c1917",
                    borderRadius: "8px",
                    fontSize: "12.5px",
                    fontWeight: 600,
                    color: "#1c1917",
                    cursor: "pointer",
                    textAlign: "left",
                  }}
                >
                  <CalendarCheck size={16} weight="bold" color="#ea580c" />
                  <span>Google Calendar Sync</span>
                </button>
              )}

              {onOpenPreferences && (
                <button
                  type="button"
                  onClick={() => {
                    setDropdownOpen(false);
                    onOpenPreferences();
                  }}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "10px",
                    padding: "8px 10px",
                    background: "transparent",
                    border: "1.5px solid transparent",
                    borderRadius: "8px",
                    fontSize: "12.5px",
                    fontWeight: 600,
                    color: "#44403c",
                    cursor: "pointer",
                    textAlign: "left",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = "#f5efe6";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = "transparent";
                  }}
                >
                  <Gear size={16} weight="bold" />
                  <span>Planner Preferences</span>
                </button>
              )}

              <button
                type="button"
                onClick={handleSignOutClick}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "10px",
                  padding: "8px 10px",
                  marginTop: "6px",
                  background: "#fee2e2",
                  border: "1.5px solid #ef4444",
                  borderRadius: "8px",
                  fontSize: "12.5px",
                  fontWeight: 600,
                  color: "#991b1b",
                  cursor: "pointer",
                  textAlign: "left",
                }}
              >
                <SignOut size={16} weight="bold" />
                <span>Sign Out</span>
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  // If user is not logged in
  return (
    <>
      <div className="user-profile-wrapper">
        <button
          type="button"
          className="google-sign-in-btn"
          onClick={handleSignInClick}
          disabled={loading || isSigningIn}
          title="Sign in with your Gmail account"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "8px",
            padding: "6px 12px",
            background: "#fffdfa",
            border: "2px solid #1c1917",
            borderRadius: "999px",
            boxShadow: "2px 2px 0px #1c1917",
            cursor: "pointer",
            fontWeight: 700,
            fontSize: "12.5px",
            color: "#1c1917",
            transition: "all 0.15s ease",
          }}
          onMouseDown={(e) => {
            e.currentTarget.style.transform = "translate(1px, 1px)";
            e.currentTarget.style.boxShadow = "1px 1px 0px #1c1917";
          }}
          onMouseUp={(e) => {
            e.currentTarget.style.transform = "none";
            e.currentTarget.style.boxShadow = "2px 2px 0px #1c1917";
          }}
        >
          <GoogleGIcon />
          <span className="sign-in-btn-label">
            {isSigningIn ? "Signing in…" : "Sign in with Google"}
          </span>
        </button>
      </div>

      {/* Setup Guide Modal if Firebase keys are not yet added */}
      {setupModalOpen && (
        <div
          className="firebase-modal-overlay"
          style={{
            position: "fixed",
            inset: 0,
            backgroundColor: "rgba(28, 25, 23, 0.6)",
            backdropFilter: "blur(4px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 9999,
            padding: "16px",
          }}
          onClick={() => setSetupModalOpen(false)}
        >
          <div
            className="firebase-modal-content neo-card"
            style={{
              background: "#fffdfa",
              border: "3px solid #1c1917",
              borderRadius: "18px",
              boxShadow: "6px 6px 0px #1c1917",
              maxWidth: "520px",
              width: "100%",
              padding: "24px",
              position: "relative",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setSetupModalOpen(false)}
              aria-label="Close dialog"
              style={{
                position: "absolute",
                top: "16px",
                right: "16px",
                background: "#f5efe6",
                border: "2px solid #1c1917",
                borderRadius: "50%",
                width: "32px",
                height: "32px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: "pointer",
                fontWeight: 800,
              }}
            >
              <X size={16} weight="bold" />
            </button>

            <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "12px" }}>
              <div
                style={{
                  width: "38px",
                  height: "38px",
                  borderRadius: "10px",
                  background: "#ffeed4",
                  border: "2px solid #1c1917",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Question size={22} weight="bold" color="#ea580c" />
              </div>
              <div>
                <h3 style={{ margin: 0, fontSize: "17px", fontWeight: 800, color: "#1c1917" }}>
                  Connect Firebase Project
                </h3>
                <span style={{ fontSize: "12px", color: "#78716c" }}>
                  Project: <b>planoramaph</b>
                </span>
              </div>
            </div>

            <p style={{ fontSize: "13px", lineHeight: "1.5", color: "#44403c", margin: "10px 0 16px" }}>
              Your Firebase project <b>planoramaph</b> has been created! To complete the Google Sign-In setup:
            </p>

            <ol style={{ fontSize: "12.5px", lineHeight: "1.6", color: "#292524", paddingLeft: "20px", margin: "0 0 16px" }}>
              <li style={{ marginBottom: "6px" }}>
                In Firebase Console, go to <b>Build → Authentication → Sign-in method</b> and enable <b>Google</b>.
              </li>
              <li style={{ marginBottom: "6px" }}>
                Under <b>Project Settings (⚙) → General → Your apps</b>, create a <b>Web app</b> (named e.g. <i>Planorama</i>).
              </li>
              <li>
                Copy the Firebase credentials into your <code>.env.local</code> and Vercel:
              </li>
            </ol>

            <div
              style={{
                background: "#292524",
                color: "#f5f5f4",
                padding: "12px 14px",
                borderRadius: "10px",
                fontFamily: "monospace",
                fontSize: "11px",
                lineHeight: "1.5",
                position: "relative",
                overflowX: "auto",
              }}
            >
              <button
                type="button"
                onClick={() => copyToClipboard(`NEXT_PUBLIC_FIREBASE_API_KEY=\nNEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=planoramaph.firebaseapp.com\nNEXT_PUBLIC_FIREBASE_PROJECT_ID=planoramaph\nNEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=planoramaph.firebasestorage.app\nNEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=\nNEXT_PUBLIC_FIREBASE_APP_ID=`, "env")}
                title="Copy template"
                style={{
                  position: "absolute",
                  top: "8px",
                  right: "8px",
                  background: "#44403c",
                  border: "1px solid #78716c",
                  color: "#fff",
                  padding: "3px 6px",
                  borderRadius: "4px",
                  fontSize: "10px",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "4px",
                  cursor: "pointer",
                }}
              >
                {copiedKey === "env" ? <Check size={12} weight="bold" color="#4ade80" /> : <Copy size={12} />}
                <span>{copiedKey === "env" ? "Copied" : "Copy"}</span>
              </button>
              <div>NEXT_PUBLIC_FIREBASE_API_KEY=your_api_key</div>
              <div>NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=planoramaph.firebaseapp.com</div>
              <div>NEXT_PUBLIC_FIREBASE_PROJECT_ID=planoramaph</div>
              <div>NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=planoramaph.firebasestorage.app</div>
              <div>NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your_sender_id</div>
              <div>NEXT_PUBLIC_FIREBASE_APP_ID=your_app_id</div>
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "18px" }}>
              <button
                type="button"
                onClick={() => setSetupModalOpen(false)}
                style={{
                  padding: "8px 16px",
                  background: "#ffd84d",
                  border: "2px solid #1c1917",
                  borderRadius: "8px",
                  fontWeight: 700,
                  fontSize: "12.5px",
                  boxShadow: "2px 2px 0px #1c1917",
                  cursor: "pointer",
                }}
              >
                Got it
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
