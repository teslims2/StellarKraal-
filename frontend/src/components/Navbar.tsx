"use client";
import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV_LINKS = [
  { href: "/", label: "Home" },
  { href: "/dashboard", label: "Dashboard" },
  { href: "/borrow", label: "Borrow" },
];

export default function Navbar() {
  const [isOpen, setIsOpen] = useState(false);
  const pathname = usePathname();

  function closeDrawer() {
    setIsOpen(false);
  }

  return (
    <nav className="bg-brown text-cream w-full">
      <div className="flex items-center justify-between px-4 h-14">
        {/* Logo */}
        <Link
          href="/"
          onClick={closeDrawer}
          className="font-bold text-lg text-cream hover:text-gold transition"
        >
          🐄 StellarKraal
        </Link>

        {/* Hamburger button — mobile only */}
        <button
          aria-label="Toggle menu"
          aria-expanded={isOpen}
          onClick={() => setIsOpen((prev) => !prev)}
          className="md:hidden min-h-[44px] min-w-[44px] flex items-center justify-center text-cream hover:text-gold transition"
        >
          {isOpen ? (
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-6 w-6"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          ) : (
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-6 w-6"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          )}
        </button>

        {/* Desktop nav links */}
        <div className="hidden md:flex gap-6 items-center">
          {NAV_LINKS.map(({ href, label }) => (
            <Link
              key={href}
              href={href}
              className={`min-h-[44px] min-w-[44px] flex items-center font-medium transition hover:text-gold ${
                pathname === href ? "text-gold" : "text-cream"
              }`}
            >
              {label}
            </Link>
          ))}
        </div>
      </div>

      {/* Mobile drawer */}
      <div
        className={`${isOpen ? "flex" : "hidden"} flex-col md:hidden px-4 pb-4 gap-2`}
      >
        {NAV_LINKS.map(({ href, label }) => (
          <Link
            key={href}
            href={href}
            onClick={closeDrawer}
            className={`min-h-[44px] min-w-[44px] flex items-center font-medium transition hover:text-gold px-2 ${
              pathname === href ? "text-gold" : "text-cream"
            }`}
          >
            {label}
          </Link>
        ))}
      </div>
    </nav>
  );
}
