import type { Metadata } from "next";
import Link from "next/link";
import { IBM_Plex_Mono, IBM_Plex_Sans } from "next/font/google";
import "./globals.css";

const ibmPlexSans = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-sans",
  display: "swap",
});

const ibmPlexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-mono",
  display: "swap",
});

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
    <html lang="en" className={`${ibmPlexSans.variable} ${ibmPlexMono.variable}`}>
      <body>
        <main className="app-container">
          <header className="site-header">
            <Link href="/" className="brand">
              <div className="brand-mark">R</div>
              <span className="brand-name">
                Rail<span className="brand-dot">Refund</span>
              </span>
            </Link>
            <nav className="site-nav" aria-label="Main navigation">
              <Link href="/train-ticket-refund-rules" className="nav-link">
                Refund Rules
              </Link>
              <Link href="/about" className="nav-link">
                About
              </Link>
            </nav>
          </header>

          {children}

          <footer className="site-footer">
            <nav className="footer-nav" aria-label="Footer navigation">
              <Link href="/" className="footer-link">
                Calculator
              </Link>
              <Link href="/train-ticket-refund-rules" className="footer-link">
                Railway Refund Rules
              </Link>
              <Link href="/about" className="footer-link">
                About Us
              </Link>
              <Link href="/privacy" className="footer-link">
                Privacy Policy
              </Link>
              <Link href="/terms" className="footer-link">
                Terms of Service
              </Link>
            </nav>
            <p className="footer-disclaimer">
              Independent service. Not affiliated with IRCTC or Indian Railways.
              Refund amounts are estimates; actual refunds are determined by the
              applicable railway rules and ticketing system.
            </p>
          </footer>
        </main>
      </body>
    </html>
  );
}
