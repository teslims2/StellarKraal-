import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";

// Mock Next.js navigation hooks
jest.mock("next/navigation", () => ({
  usePathname: () => "/",
}));

// Mock Next.js Link component
jest.mock("next/link", () => {
  const MockLink = ({ href, children, onClick, className }: any) => (
    <a href={href} onClick={onClick} className={className}>
      {children}
    </a>
  );
  MockLink.displayName = "MockLink";
  return MockLink;
});

import Navbar from "../components/Navbar";

describe("Navbar", () => {
  it("renders the logo", () => {
    render(<Navbar />);
    expect(screen.getByText(/StellarKraal/)).toBeTruthy();
  });

  it("renders desktop nav links with hidden md:flex class", () => {
    const { container } = render(<Navbar />);
    const desktopNav = container.querySelector(".hidden.md\\:flex");
    expect(desktopNav).toBeTruthy();
  });

  it("renders hamburger button with md:hidden class", () => {
    const { container } = render(<Navbar />);
    const hamburger = container.querySelector("button.md\\:hidden");
    expect(hamburger).toBeTruthy();
  });

  it("hamburger button has min-h-[44px] and min-w-[44px] touch target classes", () => {
    const { container } = render(<Navbar />);
    const hamburger = container.querySelector("button.md\\:hidden") as HTMLElement;
    expect(hamburger.className).toContain("min-h-[44px]");
    expect(hamburger.className).toContain("min-w-[44px]");
  });

  it("mobile drawer is hidden by default", () => {
    const { container } = render(<Navbar />);
    // The drawer div has flex-col and md:hidden — when closed it starts with 'hidden'
    const drawer = container.querySelector(".flex-col.md\\:hidden");
    expect(drawer).toBeTruthy();
    // When closed, className starts with 'hidden ' (space after, not 'md:hidden')
    expect(drawer!.className.startsWith("hidden")).toBe(true);
  });

  it("toggles mobile drawer open when hamburger is clicked", () => {
    const { container } = render(<Navbar />);
    const hamburger = container.querySelector("button.md\\:hidden") as HTMLElement;
    const drawer = container.querySelector(".flex-col.md\\:hidden") as HTMLElement;

    // Initially hidden — starts with 'hidden' class
    expect(drawer.className.startsWith("hidden")).toBe(true);

    // Click to open — 'hidden' replaced by 'flex'
    fireEvent.click(hamburger);
    expect(drawer.className.startsWith("hidden")).toBe(false);
    expect(drawer.className.startsWith("flex")).toBe(true);
  });

  it("closes mobile drawer when hamburger is clicked again", () => {
    const { container } = render(<Navbar />);
    const hamburger = container.querySelector("button.md\\:hidden") as HTMLElement;
    const drawer = container.querySelector(".flex-col.md\\:hidden") as HTMLElement;

    fireEvent.click(hamburger); // open
    expect(drawer.className.startsWith("hidden")).toBe(false);
    fireEvent.click(hamburger); // close
    expect(drawer.className.startsWith("hidden")).toBe(true);
  });

  it("closes mobile drawer when a nav link is clicked", () => {
    const { container } = render(<Navbar />);
    const hamburger = container.querySelector("button.md\\:hidden") as HTMLElement;
    const drawer = container.querySelector(".flex-col.md\\:hidden") as HTMLElement;

    // Open drawer
    fireEvent.click(hamburger);
    expect(drawer.className.startsWith("hidden")).toBe(false);

    // Click a link inside the drawer
    const drawerLinks = drawer.querySelectorAll("a");
    expect(drawerLinks.length).toBeGreaterThan(0);
    fireEvent.click(drawerLinks[0]);

    expect(drawer.className.startsWith("hidden")).toBe(true);
  });

  it("renders Home, Dashboard, and Borrow links in desktop nav", () => {
    const { container } = render(<Navbar />);
    const desktopNav = container.querySelector(".hidden.md\\:flex") as HTMLElement;
    const links = desktopNav.querySelectorAll("a");
    const labels = Array.from(links).map((l) => l.textContent);
    expect(labels).toContain("Home");
    expect(labels).toContain("Dashboard");
    expect(labels).toContain("Borrow");
  });

  it("desktop nav links have min-h-[44px] touch target class", () => {
    const { container } = render(<Navbar />);
    const desktopNav = container.querySelector(".hidden.md\\:flex") as HTMLElement;
    const links = desktopNav.querySelectorAll("a");
    links.forEach((link) => {
      expect(link.className).toContain("min-h-[44px]");
    });
  });

  it("mobile drawer links have min-h-[44px] touch target class", () => {
    const { container } = render(<Navbar />);
    const hamburger = container.querySelector("button.md\\:hidden") as HTMLElement;
    fireEvent.click(hamburger);
    const drawer = container.querySelector(".flex-col.md\\:hidden") as HTMLElement;
    const links = drawer.querySelectorAll("a");
    links.forEach((link) => {
      expect(link.className).toContain("min-h-[44px]");
    });
  });
});
