import type { Metadata, Viewport } from "next";
import "@fontsource/bricolage-grotesque/700.css";
import "@fontsource/bricolage-grotesque/800.css";
import "@fontsource/lexend/400.css";
import "@fontsource/lexend/500.css";
import "@fontsource/lexend/600.css";
import "@fontsource/lexend/700.css";
import "./globals.css";

export const metadata: Metadata = { title: "Planorama — Your whole year, in view", description: "A colorful, flexible planner for your tasks, calendar, and everyday plans.", applicationName: "Planorama", manifest: "/manifest.webmanifest" };
export const viewport: Viewport = { themeColor: "#fff4e2", width: "device-width", initialScale: 1 };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
