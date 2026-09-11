import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Speculation Rules Prefetch Test Harness · Firefox Nightly",
  description:
    "Run controlled Firefox Speculation Rules checks and audit live sites with the accompanying DevTools extension.",
  openGraph: {
    title: "Speculation Rules Prefetch Test Harness",
    description:
      "Capture Firefox speculative requests, compare an enabled run with a blocked-prefetch control, and export the evidence.",
    images: [
      {
        url: "/og.png",
        width: 1731,
        height: 909,
        alt: "Speculation Rules Prefetch Test Harness request sequence",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Speculation Rules Prefetch Test Harness",
    description:
      "Capture Firefox speculative requests, compare an enabled run with a blocked-prefetch control, and export the evidence.",
    images: ["/og.png"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable}`}>
        {children}
      </body>
    </html>
  );
}
