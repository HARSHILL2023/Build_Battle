import { Link, Outlet } from "react-router-dom";
import { SiteNav } from "./components/SiteNav";

export default function App() {
  return (
    <div className="min-h-full flex flex-col">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:bg-white focus:px-3 focus:py-2 focus:text-sm focus:border focus:border-line-strong"
      >
        Skip to content
      </a>
      <SiteNav />
      <main id="main" className="flex-1 w-full min-w-0 max-w-6xl mx-auto px-4 sm:px-6 py-8">
        <Outlet />
      </main>
      <footer className="border-t border-line mt-12">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between text-sm text-muted">
          <p>
            <span className="font-display font-semibold text-ink">InsightFlow</span>
            {", evidence-backed feedback intelligence."}
          </p>
          <nav aria-label="Footer" className="flex gap-5">
            <Link className="hover:text-ink underline-offset-4 hover:underline" to="/privacy">
              Privacy Policy
            </Link>
            <Link className="hover:text-ink underline-offset-4 hover:underline" to="/terms">
              Terms
            </Link>
            <Link className="hover:text-ink underline-offset-4 hover:underline" to="/settings">
              Settings
            </Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
