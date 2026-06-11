import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "CarIndex.ai",
  description: "A video-first AI classifieds feed for used cars."
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
