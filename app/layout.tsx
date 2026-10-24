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

// Inline script that runs before React hydration to evict stale Vite/workbox
// service workers that can block the Next.js app from loading properly.
const swCleanupScript = `
(function(){
  if (!('serviceWorker' in navigator)) return;
  navigator.serviceWorker.getRegistrations().then(function(regs){
    regs.forEach(function(r){ r.unregister(); });
  });
  if ('caches' in window) {
    caches.keys().then(function(keys){
      keys.forEach(function(k){
        if (/vite|workbox|precache|runtime/i.test(k)) caches.delete(k);
      });
    });
  }
})();
`;

import { Providers } from "./providers";

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <head>
        {/* Evict stale Vite/workbox service workers before hydration */}
        <script dangerouslySetInnerHTML={{ __html: swCleanupScript }} />
      </head>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
