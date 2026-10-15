import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "RailRefund — Indian Railways Ticket Refund Calculator",
  description:
    "Enter your 10-digit PNR and get an estimated refund for your Indian Railways ticket cancellation. Independent service, not affiliated with IRCTC or Indian Railways.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600;700&family=IBM+Plex+Sans:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <main className="app-container">{children}</main>
      </body>
    </html>
  );
}
