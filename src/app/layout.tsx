import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { ModeProvider } from "@/components/providers/mode-provider";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { TooltipProvider } from "@/components/ui/tooltip";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "ModelScope — Comparador de modelos de IA",
    template: "%s · ModelScope",
  },
  description:
    "Compara modelos de IA por rendimiento, coste real y vías de acceso. Del precio por token a la suscripción que te conviene.",
  keywords: [
    "modelos de IA",
    "comparador",
    "benchmarks",
    "precios API",
    "ChatGPT Plus",
    "Claude Pro",
    "OpenRouter",
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="es"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col">
        <ModeProvider>
          <TooltipProvider>
            <SiteHeader />
            <main className="flex-1">{children}</main>
            <SiteFooter />
          </TooltipProvider>
        </ModeProvider>
      </body>
    </html>
  );
}
