import { Link, NavLink, useLocation, useNavigate } from "react-router-dom";
import { useState } from "react";
import { BarChart3, Inbox, Lightbulb, FileText, Settings, Menu, X, Layers, LogOut } from "lucide-react";
import { useAuth } from "../auth/AuthContext";

const LINKS = [
  { to: "/", label: "Overview", icon: BarChart3, end: true },
  { to: "/feedback", label: "Feedback", icon: Inbox, end: false },
  { to: "/insights", label: "AI Insights", icon: Lightbulb, end: false },
  { to: "/issues", label: "Priority Issues", icon: Layers, end: false },
  { to: "/reports", label: "Reports", icon: FileText, end: false },
  { to: "/settings", label: "Settings", icon: Settings, end: false },
];

export function SiteNav() {
  const { pathname } = useLocation();
  const [open, setOpen] = useState(false);
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const doLogout = async () => {
    await logout();
    navigate("/login", { replace: true });
  };

  const isActive = (to: string, end: boolean) =>
    end ? pathname === to : pathname === to || pathname.startsWith(to + "/");

  const desktopClass = (active: boolean) =>
    `inline-flex shrink-0 whitespace-nowrap items-center gap-1.5 px-2 2xl:px-3 py-2 text-sm rounded-md border transition-colors ${
      active
        ? "border-ink bg-ink text-paper"
        : "border-transparent text-ink-soft hover:border-line-strong hover:bg-paper"
    }`;

  return (
    <header className="border-b border-line bg-surface sticky top-0 z-40">
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <div className="flex items-center justify-between gap-2 h-16">
          <Link to="/" className="flex items-center gap-2.5 shrink-0" aria-label="InsightFlow home">
            <span
              aria-hidden
              className="inline-flex shrink-0 items-center justify-center w-8 h-8 rounded-md bg-ink text-paper font-display font-bold text-lg leading-none"
            >
              IF
            </span>
            <span className="font-display font-semibold text-xl tracking-tight whitespace-nowrap">InsightFlow</span>
          </Link>
          <nav aria-label="Primary" className="hidden xl:flex items-center gap-0.5 2xl:gap-1 shrink-0">
            {LINKS.map(({ to, label, icon: Icon, end }) => (
              <NavLink
                key={to}
                to={to}
                end={end}
                aria-current={isActive(to, end) ? "page" : undefined}
                className={desktopClass(isActive(to, end))}
              >
                <Icon size={15} strokeWidth={2} aria-hidden className="shrink-0" />
                {label}
              </NavLink>
            ))}
          </nav>
          <div className="flex items-center gap-1.5 xl:gap-2 min-w-0">
          {user && (
            <span className="hidden sm:inline min-w-0 text-xs text-muted truncate max-w-24 md:max-w-28 xl:max-w-32 2xl:max-w-44" title={user.email}>
              {user.email}
            </span>
          )}
          {user?.isDemo && (
            <span className="hidden sm:inline-flex shrink-0 whitespace-nowrap items-center px-2 py-0.5 text-xs font-medium rounded-full border border-line-strong text-muted">
              Demo · read-only
            </span>
          )}
          {user && (
            <button
              type="button"
              onClick={doLogout}
              className="hidden xl:inline-flex shrink-0 whitespace-nowrap items-center gap-1.5 px-2 2xl:px-3 py-2 text-sm rounded-md border border-transparent text-ink-soft hover:border-line-strong hover:bg-paper"
            >
              <LogOut size={15} strokeWidth={2} aria-hidden className="shrink-0" />
              Log out
            </button>
          )}
          <button
            type="button"
            className="xl:hidden inline-flex shrink-0 whitespace-nowrap items-center gap-2 px-3 py-2 text-sm border border-line-strong rounded-md"
            aria-expanded={open}
            aria-label={open ? "Close navigation" : "Open navigation"}
            onClick={() => setOpen((v) => !v)}
          >
            {open ? <X size={16} /> : <Menu size={16} />}
            Menu
          </button>
          </div>
        </div>
      </div>
      {open && (
        <nav aria-label="Mobile" className="xl:hidden border-t border-line bg-surface px-4 py-2">
          {LINKS.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              onClick={() => setOpen(false)}
              aria-current={isActive(to, end) ? "page" : undefined}
              className={`flex items-center gap-2.5 px-3 py-2.5 text-sm rounded-md ${
                isActive(to, end) ? "bg-ink text-paper" : "text-ink-soft hover:bg-paper"
              }`}
            >
              <Icon size={15} strokeWidth={2} aria-hidden />
              {label}
            </NavLink>
          ))}
          {user && (
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                void doLogout();
              }}
              className="flex w-full items-center gap-2.5 px-3 py-2.5 text-sm rounded-md text-ink-soft hover:bg-paper"
            >
              <LogOut size={15} strokeWidth={2} aria-hidden />
              Log out ({user.email})
            </button>
          )}
        </nav>
      )}
    </header>
  );
}
