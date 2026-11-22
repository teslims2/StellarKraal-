/**
 * Tests for HtmlDirSync — Issue #1524
 *
 * Verifies that the <html> element's `dir` and `lang` attributes are
 * synchronised with the active i18n locale.
 */
import React from "react";
import { render } from "@testing-library/react";
import HtmlDirSync from "../components/HtmlDirSync";
import { type Locale } from "@/context/I18nContext";

// ── Mock I18nContext ──────────────────────────────────────────────────────────

let mockLocale: Locale = "en";

jest.mock("@/context/I18nContext", () => ({
  useI18n: () => ({ locale: mockLocale, setLocale: jest.fn(), t: (k: string) => k }),
  SUPPORTED_LOCALES: ["en", "sw"],
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

function renderWithLocale(locale: Locale) {
  mockLocale = locale;
  const { rerender } = render(<HtmlDirSync />);
  return rerender;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("HtmlDirSync (#1524)", () => {
  afterEach(() => {
    // Clean up attributes set on the real jsdom <html> element
    document.documentElement.removeAttribute("dir");
    document.documentElement.removeAttribute("lang");
  });

  it("sets lang='en' and dir='ltr' for English locale", () => {
    renderWithLocale("en");
    expect(document.documentElement.getAttribute("lang")).toBe("en");
    expect(document.documentElement.getAttribute("dir")).toBe("ltr");
  });

  it("sets lang='sw' and dir='ltr' for Kiswahili locale", () => {
    // Kiswahili is a Latin-script LTR language
    renderWithLocale("sw");
    expect(document.documentElement.getAttribute("lang")).toBe("sw");
    expect(document.documentElement.getAttribute("dir")).toBe("ltr");
  });

  it("renders nothing visible (returns null)", () => {
    const { container } = render(<HtmlDirSync />);
    expect(container.firstChild).toBeNull();
  });
});
