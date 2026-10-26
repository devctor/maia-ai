import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Disclaimer } from "@/components/Disclaimer";
import "./globals.css";

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
    <html lang="es">
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
