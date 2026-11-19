"use client";

import { useEffect } from "react";

export default function PlannerError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Planorama planner error:", error);
  }, [error]);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "100vh",
        padding: "2rem",
        textAlign: "center",
        background: "#fff4e2",
        color: "#111",
        fontFamily: "var(--font-body, 'Lexend', system-ui, sans-serif)",
      }}
    >
      <h1
        style={{
          fontFamily: "var(--font-display, 'Bricolage Grotesque', sans-serif)",
          fontSize: "2.25rem",
          marginBottom: "0.75rem",
          fontWeight: 800,
        }}
      >
        Your planner hit a snag
      </h1>
      <p style={{ fontSize: "1.1rem", marginBottom: "1.75rem", maxWidth: "32rem", color: "#3f3f3f" }}>
        Something in the calendar or task view crashed. Your tasks are stored locally (and synced
        if you&apos;re signed in), so nothing was lost. Try reloading this view.
      </p>
      <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", justifyContent: "center" }}>
        <button
          type="button"
          onClick={() => reset()}
          style={{
            padding: "0.75rem 1.5rem",
            background: "#ff3d8b",
            color: "#fff",
            border: "2.5px solid #111",
            borderRadius: "10px",
            fontWeight: 700,
            fontSize: "1rem",
            cursor: "pointer",
            boxShadow: "3px 3px 0 #111",
          }}
        >
          Reload planner
        </button>
        <button
          type="button"
          onClick={() => {
            if (typeof window !== "undefined") window.location.href = "/app";
          }}
          style={{
            padding: "0.75rem 1.5rem",
            background: "#fff",
            color: "#111",
            border: "2.5px solid #111",
            borderRadius: "10px",
            fontWeight: 700,
            fontSize: "1rem",
            cursor: "pointer",
            boxShadow: "3px 3px 0 #111",
          }}
        >
          Go to dashboard
        </button>
      </div>
    </div>
  );
}
