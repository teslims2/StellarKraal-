"use client";
import { useState } from "react";
import Link from "next/link";
import ThemeToggle from "./ThemeToggle";

const NAV_LINKS = [
  { href: "/", label: "Home" },
  { href: "/dashboard", label: "Dashboard" },
  { href: "/borrow", label: "Borrow" },
];

export default function Navbar() {
  const [open, setOpen] = useState(false);

  return (
    <nav
      className="border-b px-4"
      style={{
        backgroundColor: "var(--color-nav-bg)",
        borderColor: "var(--color-nav-border)",
      }}
    >
      <div className="max-w-4xl mx-auto flex items-center justify-between h-14">
        {/* Logo / brand */}
        <Link
          href="/"
          className="font-bold text-lg min-h-[44px] flex items-center"
          style={{ color: "var(--color-text)" }}
        >
          🐄 StellarKraal
        </Link>

        {/* Desktop nav */}
        <ul className="hidden md:flex items-center gap-6">
          {NAV_LINKS.map(({ href, label }) => (
            <li key={href}>
              <Link
                href={href}
                className="font-medium transition min-h-[44px] min-w-[44px] flex items-center hover:opacity-70"
                style={{ color: "var(--color-text)" }}
              >
                {label}
              </Link>
            </li>
          ))}
        </ul>

        {/* Right side: theme toggle + hamburger */}
        <div className="flex items-center gap-1">
          {/* Theme toggle — visible on all screen sizes */}
          <ThemeToggle />

          {/* Hamburger button — mobile only */}
          <button
            aria-label={open ? "Close menu" : "Open menu"}
            aria-expanded={open}
            onClick={() => setOpen((prev) => !prev)}
            className="md:hidden flex flex-col justify-center items-center gap-1.5 min-h-[44px] min-w-[44px] rounded-lg transition"
            style={{ color: "var(--color-text)" }}
          >
            <span
              className={`block w-6 h-0.5 transition-transform duration-200 ${open ? "translate-y-2 rotate-45" : ""}`}
              style={{ backgroundColor: "var(--color-text)" }}
            />
            <span
              className={`block w-6 h-0.5 transition-opacity duration-200 ${open ? "opacity-0" : ""}`}
              style={{ backgroundColor: "var(--color-text)" }}
            />
            <span
              className={`block w-6 h-0.5 transition-transform duration-200 ${open ? "-translate-y-2 -rotate-45" : ""}`}
              style={{ backgroundColor: "var(--color-text)" }}
            />
          </button>
        </div>
      </div>

      {/* Mobile drawer */}
      {open && (
        <ul
          className="md:hidden flex flex-col py-2 border-t"
          style={{ borderColor: "var(--color-nav-border)" }}
        >
          {NAV_LINKS.map(({ href, label }) => (
            <li key={href}>
              <Link
                href={href}
                onClick={() => setOpen(false)}
                className="block px-4 font-medium transition min-h-[44px] flex items-center hover:opacity-70"
                style={{ color: "var(--color-text)" }}
              >
                {label}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </nav>
  );
}
