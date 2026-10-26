import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Disclaimer } from "@/components/Disclaimer";
import "./globals.css";

export const metadata: Metadata = {
  title: "Maia Care · seguimiento diario",
  description:
    "Registro diario de bienestar y seguimiento con IA. Contenido informativo, no diagnóstico médico.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es">
      <body>
        <div className="app-shell">
          <header className="app-header">
            <h1>Maia Care</h1>
            <p className="tagline">Tu seguimiento diario de bienestar</p>
          </header>
          <main className="app-main">{children}</main>
          <footer className="app-footer">
            <Disclaimer />
          </footer>
        </div>
      </body>
    </html>
  );
}
