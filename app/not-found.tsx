import Link from "next/link";

export default function NotFound() {
  return (
    <div style={{
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      minHeight: "100vh",
      padding: "2rem",
      textAlign: "center",
      background: "#fff9f2",
      color: "#222",
      fontFamily: "var(--font-body, system-ui, sans-serif)",
    }}>
      <h1 style={{ fontSize: "3rem", marginBottom: "1rem", fontWeight: 800 }}>404</h1>
      <p style={{ fontSize: "1.25rem", marginBottom: "1.5rem" }}>Page not found.</p>
      <Link
        href="/"
        style={{
          padding: "0.75rem 1.5rem",
          background: "#ff748c",
          color: "#fff",
          borderRadius: "8px",
          fontWeight: 700,
          textDecoration: "none",
        }}
      >
        Back to Planorama
      </Link>
    </div>
  );
}
