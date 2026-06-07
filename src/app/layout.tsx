import "./globals.css";
import type { Metadata, Viewport } from "next";
import { Header } from "@/components/Header";

export const metadata: Metadata = {
  title: "Manchester United @ World Cup",
  description:
    "Live stats, ratings, goals and assists for every Manchester United player representing their nation at the FIFA World Cup and international friendlies.",
  applicationName: "ManUtdInWorldCup",
  authors: [{ name: "ManUtdInWorldCup" }],
  openGraph: {
    title: "Manchester United @ World Cup",
    description:
      "Live stats, ratings, goals and assists for every Manchester United player on international duty.",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Manchester United @ World Cup",
    description:
      "Live stats, ratings, goals and assists for every Manchester United player on international duty.",
  },
};

export const viewport: Viewport = {
  themeColor: "#0A0A0A",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="font-sans">
        <div className="min-h-screen flex flex-col">
          <Header />
          <main className="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 py-6">
            {children}
          </main>
          <footer className="border-t border-white/5 py-6 text-center text-xs text-white/40">
            <p>
              Data via{" "}
              <a
                href="https://www.espn.com"
                target="_blank"
                rel="noreferrer"
                className="hover:text-white/70"
              >
                ESPN
              </a>{" "}
              public API. Built with Next.js and deployed on{" "}
              <a
                href="https://vercel.com"
                target="_blank"
                rel="noreferrer"
                className="hover:text-white/70"
              >
                Vercel
              </a>
              . Not affiliated with Manchester United Football Club.
            </p>
          </footer>
        </div>
      </body>
    </html>
  );
}
