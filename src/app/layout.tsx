import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";
import { Providers } from "@/components/providers/session-provider";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Oxla - AI-Powered Search & Collaboration",
  description: "Next-generation platform combining AI-powered search, real-time collaboration, and intelligent analytics for teams.",
  keywords: ["Oxla", "AI", "search", "collaboration", "analytics", "Next.js", "TypeScript"],
  authors: [{ name: "Oxla Team" }],
  openGraph: {
    title: "Oxla - AI-Powered Search & Collaboration",
    description: "Next-generation platform for teams with AI-powered search and real-time collaboration",
    url: "https://oxla.app",
    siteName: "Oxla",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Oxla - AI-Powered Search & Collaboration",
    description: "Next-generation platform for teams with AI-powered search and real-time collaboration",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        <Providers>
          {children}
          <Toaster />
        </Providers>
      </body>
    </html>
  );
}
