"use client";

import { useEffect } from "react";
import Link from "next/link";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Planorama route error:", error);
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
        Something went wrong
      </h1>
      <p style={{ fontSize: "1.1rem", marginBottom: "1.75rem", maxWidth: "32rem", color: "#3f3f3f" }}>
        Planorama hit an unexpected error. Your data is safe — try again, or head back to the
        dashboard.
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
          Try again
        </button>
        <Link
          href="/app"
          style={{
            padding: "0.75rem 1.5rem",
            background: "#fff",
            color: "#111",
            border: "2.5px solid #111",
            borderRadius: "10px",
            fontWeight: 700,
            fontSize: "1rem",
            textDecoration: "none",
            boxShadow: "3px 3px 0 #111",
          }}
        >
          Back to planner
        </Link>
      </div>
    </div>
  );
}
