import type { Metadata } from "next";
import { IBM_Plex_Mono, Inter } from "next/font/google";
import "./globals.css";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";

// Cal Sans (display face) is imported directly in globals.css via
// @fontsource/cal-sans — it's self-hosted OFL type, not a Google Font, so
// next/font/google can't load it. font-display in globals.css's @theme
// references the family name directly instead of a --font-* CSS variable.

const plexMono = IBM_Plex_Mono({
  variable: "--font-plex-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "LedgerSentry — AI invoice exception automation",
  description:
    "LedgerSentry prepares safe invoices for approval and sends financial exceptions to the right person — with every field, rule, and decision traceable to evidence.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${plexMono.variable} ${inter.variable} h-full`}
    >
      <body className="flex min-h-full flex-col bg-paper text-ink">
        <SiteHeader />
        <main className="flex-1">{children}</main>
        <SiteFooter />
      </body>
    </html>
  );
}
