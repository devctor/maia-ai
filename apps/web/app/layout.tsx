import type { Metadata } from "next";
import { Platypi } from "next/font/google";
import type { ReactNode } from "react";
import { Disclaimer } from "@/components/Disclaimer";
import "./globals.css";

/**
 * Platypi carries the display voice of the app: the hero headline and the "Resumen" eyebrow.
 * `next/font` self-hosts the file at build time, so there is no runtime request to Google and no
 * layout shift. Only the Latin subset is shipped, matching the Spanish copy on the dashboard.
 */
const platypi = Platypi({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700", "800"],
  display: "swap",
  variable: "--font-platypi",
});

export const metadata: Metadata = {
  title: "Maia Care · seguimiento diario",
  description:
    "Registro diario de bienestar y seguimiento con IA. Contenido informativo, no diagnóstico médico.",
};

/**
 * The shell is intentionally thin: the dashboard owns its own header, so the layout only keeps
 * the chrome that surrounds it (the disclaimer footer).
 */
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es" className={platypi.variable}>
      <body>
        {children}
        <footer className="app-footer">
          <div className="app-footer-inner">
            <Disclaimer />
          </div>
        </footer>
      </body>
    </html>
  );
}
