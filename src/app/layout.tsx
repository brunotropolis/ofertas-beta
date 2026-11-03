import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { SPLASH_CSS, SPLASH_HTML, SPLASH_JS } from "@/components/layout/splash-html";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const mono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "BUSCADOR GEEK | by brunotropolis",
  description: "Painel de gestão de ofertas e campanhas",
  manifest: "/manifest.webmanifest",
  applicationName: "Buscador Geek",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Buscador Geek",
  },
  formatDetection: {
    telephone: false,
  },
  other: {
    "mobile-web-app-capable": "yes",
  },
};

export const viewport: Viewport = {
  themeColor: "#0f0906",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR" className={`dark ${inter.variable} ${mono.variable}`}>
      <body className="font-sans overscroll-none">
        {/* Tela de carregamento animada: só aparece com o app instalado (tela cheia) ou com ?splash=1 */}
        <style dangerouslySetInnerHTML={{ __html: SPLASH_CSS }} />
        <div suppressHydrationWarning dangerouslySetInnerHTML={{ __html: SPLASH_HTML }} />
        <script dangerouslySetInnerHTML={{ __html: SPLASH_JS }} />
        {children}
      </body>
    </html>
  );
}
