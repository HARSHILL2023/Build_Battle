import type { Metadata } from "next";
import { Libre_Franklin, Source_Serif_4 } from "next/font/google";
import "./globals.css";
import { SiteNav } from "@/components/site-nav";

const libreFranklin = Libre_Franklin({
  variable: "--font-sans",
  subsets: ["latin"],
});

const sourceSerif = Source_Serif_4({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: {
    default: "InsightFlow: Customer Feedback Intelligence",
    template: "%s · InsightFlow",
  },
  description:
    "InsightFlow turns raw customer feedback into evidence-backed priorities: sentiment analysis, recurring topics, duplicate-aware metrics, and tracked issues.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${libreFranklin.variable} ${sourceSerif.variable} h-full`}>
      <body className="min-h-full flex flex-col">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:bg-white focus:px-3 focus:py-2 focus:text-sm focus:border focus:border-line-strong"
        >
          Skip to content
        </a>
        <SiteNav />
        <main id="main" className="flex-1 w-full max-w-6xl mx-auto px-4 sm:px-6 py-8">
          {children}
        </main>
        <footer className="border-t border-line mt-12">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between text-sm text-muted">
            <p>
              <span className="font-display font-semibold text-ink">InsightFlow</span>
              {", evidence-backed feedback intelligence."}
            </p>
            <nav aria-label="Footer" className="flex gap-5">
              <a className="hover:text-ink underline-offset-4 hover:underline" href="/privacy">
                Privacy Policy
              </a>
              <a className="hover:text-ink underline-offset-4 hover:underline" href="/terms">
                Terms
              </a>
              <a className="hover:text-ink underline-offset-4 hover:underline" href="/settings">
                Settings
              </a>
            </nav>
          </div>
        </footer>
      </body>
    </html>
  );
}
