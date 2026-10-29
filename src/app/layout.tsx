import React from 'react';

import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";

export const metadata: Metadata = {
  title: {
    default: "DP Data Sub — Your Data, Your Way.",
    template: "%s · DP Data Sub",
  },
  description:
    "Buy data, airtime and pay bills in Nigeria. A secure wallet with an auditable ledger, built for speed on mobile.",
  applicationName: "DP Data Sub",
  keywords: ["data", "airtime", "VTU", "Nigeria", "data subscription", "DP Data Sub"],
  openGraph: {
    title: "DP Data Sub — Your Data, Your Way.",
    description: "Nigeria's straightforward way to top up data, airtime and bills.",
    siteName: "DP Data Sub",
    type: "website",
  },
};

export const viewport: Viewport = {
  themeColor: "#087F5B",
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-dvh bg-page text-ink antialiased">
        {children}
        <Toaster position="top-center" richColors />
      </body>
    </html>
  );
}
