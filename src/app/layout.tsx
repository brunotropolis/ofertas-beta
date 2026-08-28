import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";

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
      <body className="font-sans overscroll-none">{children}</body>
    </html>
  );
}
