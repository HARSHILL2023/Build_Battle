"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { BarChart3, Inbox, Lightbulb, FileText, Settings, Menu, X, Layers } from "lucide-react";

const LINKS = [
  { href: "/", label: "Overview", icon: BarChart3, exact: true },
  { href: "/feedback", label: "Feedback", icon: Inbox, exact: false },
  { href: "/insights", label: "AI Insights", icon: Lightbulb, exact: false },
  { href: "/issues", label: "Priority Issues", icon: Layers, exact: false },
  { href: "/reports", label: "Reports", icon: FileText, exact: false },
  { href: "/settings", label: "Settings", icon: Settings, exact: false },
];

export function SiteNav() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const isActive = (href: string, exact: boolean) =>
    exact ? pathname === href : pathname === href || pathname.startsWith(href + "/");

  return (
    <header className="border-b border-line bg-surface sticky top-0 z-40">
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        <div className="flex items-center justify-between h-16">
          <Link href="/" className="flex items-center gap-2.5" aria-label="InsightFlow home">
            <span
              aria-hidden
              className="inline-flex items-center justify-center w-8 h-8 rounded-md bg-ink text-paper font-display font-bold text-lg leading-none"
            >
              IF
            </span>
            <span className="font-display font-semibold text-xl tracking-tight">InsightFlow</span>
          </Link>
          <nav aria-label="Primary" className="hidden md:flex items-center gap-1">
            {LINKS.map(({ href, label, icon: Icon, exact }) => (
              <Link
                key={href}
                href={href}
                aria-current={isActive(href, exact) ? "page" : undefined}
                className={`inline-flex items-center gap-1.5 px-3 py-2 text-sm rounded-md border transition-colors ${
                  isActive(href, exact)
                    ? "border-ink bg-ink text-paper"
                    : "border-transparent text-ink-soft hover:border-line-strong hover:bg-paper"
                }`}
              >
                <Icon size={15} strokeWidth={2} aria-hidden />
                {label}
              </Link>
            ))}
          </nav>
          <button
            type="button"
            className="md:hidden inline-flex items-center gap-2 px-3 py-2 text-sm border border-line-strong rounded-md"
            aria-expanded={open}
            aria-label={open ? "Close navigation" : "Open navigation"}
            onClick={() => setOpen((v) => !v)}
          >
            {open ? <X size={16} /> : <Menu size={16} />}
            Menu
          </button>
        </div>
      </div>
      {open && (
        <nav aria-label="Mobile" className="md:hidden border-t border-line bg-surface px-4 py-2">
          {LINKS.map(({ href, label, icon: Icon, exact }) => (
            <Link
              key={href}
              href={href}
              onClick={() => setOpen(false)}
              aria-current={isActive(href, exact) ? "page" : undefined}
              className={`flex items-center gap-2.5 px-3 py-2.5 text-sm rounded-md ${
                isActive(href, exact) ? "bg-ink text-paper" : "text-ink-soft hover:bg-paper"
              }`}
            >
              <Icon size={15} strokeWidth={2} aria-hidden />
              {label}
            </Link>
          ))}
        </nav>
      )}
    </header>
  );
}
