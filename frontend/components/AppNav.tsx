"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const topLinks = [
  { href: "/", label: "Dashboard" },
  { href: "/items", label: "Products" },
  { href: "/inventory", label: "Inventory" },
  { href: "/ledger", label: "수불" },
  { href: "/forecast", label: "Forecast" },
  { href: "/plan", label: "Plan" },
  { href: "/calendar", label: "Calendar" },
  { href: "/settings", label: "Settings" },
] as const;

const sideLinks = [
  { href: "/", label: "Dashboard" },
  { href: "/items", label: "Products" },
  { href: "/inventory", label: "Inventory" },
  { href: "/ledger", label: "수불 원장" },
  { href: "/forecast", label: "Forecast" },
  { href: "/plan", label: "52 Week Plan" },
  { href: "/calendar", label: "Calendar" },
  { href: "/suppliers", label: "Suppliers" },
  { href: "/settings", label: "Settings" },
] as const;

export function AppNav() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 backdrop-blur">
      <div className="mx-auto flex max-w-[1400px] items-center justify-between gap-3 px-4 py-3 md:px-6">
        <Link href="/" className="text-xl font-semibold text-slate-900">
          SCM <span className="text-stock">MVP</span>
        </Link>
        <nav className="flex flex-wrap gap-1.5 text-sm">
          {topLinks.map(({ href, label }) => {
            const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                className={`rounded-lg px-3 py-1.5 font-medium ${
                  active ? "bg-stock text-white" : "text-slate-600 hover:bg-slate-100"
                }`}
              >
                {label}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}

export function SideNav() {
  const pathname = usePathname();
  return (
    <aside className="hidden w-56 shrink-0 rounded-2xl border border-slate-200 bg-white p-3 shadow-soft md:block">
      <nav className="space-y-1 text-sm">
        {sideLinks.map(({ href, label }) => {
          const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={href}
              className={`block rounded-lg px-3 py-2 font-medium ${
                active ? "bg-slate-100 text-slate-900" : "text-slate-600 hover:bg-slate-50"
              }`}
            >
              {label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
