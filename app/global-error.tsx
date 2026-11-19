"use client";

import { useEffect } from "react";

// global-error.tsx replaces the root layout when an error escapes it, so it
// must render its own <html>/<body> rather than relying on app/layout.tsx.
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Planorama root error:", error);
  }, [error]);

  return (
    <html lang="en">
      <body>
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
            fontFamily: "system-ui, sans-serif",
          }}
        >
          <h1 style={{ fontSize: "2.25rem", marginBottom: "0.75rem", fontWeight: 800 }}>
            Planorama couldn&apos;t load
          </h1>
          <p style={{ fontSize: "1.1rem", marginBottom: "1.75rem", maxWidth: "32rem", color: "#3f3f3f" }}>
            A critical error occurred. Reloading usually fixes this — your data is saved locally
            and/or in your account and was not affected.
          </p>
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
            Reload Planorama
          </button>
        </div>
      </body>
    </html>
  );
}
