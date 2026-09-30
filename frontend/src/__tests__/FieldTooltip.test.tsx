/**
 * Tests for FieldTooltip component — #1095
 *
 * Verifies:
 * - Tooltip hidden by default
 * - Shows on hover (mouseenter/mouseleave)
 * - Shows on keyboard focus/blur
 * - Toggle on click
 * - Closes on Escape
 * - role='tooltip' and aria-describedby applied correctly
 */
import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import FieldTooltip from "../components/FieldTooltip";

const TOOLTIP_CONTENT = "LTV is how much you borrow vs your collateral value.";

describe("FieldTooltip (#1095)", () => {
  it("does not show tooltip content by default", () => {
    render(<FieldTooltip content={TOOLTIP_CONTENT} />);
    expect(screen.queryByRole("tooltip")).toBeNull();
  });

  it("renders the info icon button with default aria-label", () => {
    render(<FieldTooltip content={TOOLTIP_CONTENT} />);
    const btn = screen.getByRole("button", { name: /more information/i });
    expect(btn).toBeDefined();
  });

  it("accepts a custom aria-label", () => {
    render(<FieldTooltip content={TOOLTIP_CONTENT} label="What is LTV?" />);
    const btn = screen.getByRole("button", { name: /what is ltv/i });
    expect(btn).toBeDefined();
  });

  it("shows tooltip on mouseenter", () => {
    render(<FieldTooltip content={TOOLTIP_CONTENT} />);
    const btn = screen.getByRole("button");
    fireEvent.mouseEnter(btn);
    expect(screen.getByRole("tooltip")).toBeDefined();
    expect(screen.getByText(TOOLTIP_CONTENT)).toBeDefined();
  });

  it("hides tooltip on mouseleave", () => {
    render(<FieldTooltip content={TOOLTIP_CONTENT} />);
    const btn = screen.getByRole("button");
    fireEvent.mouseEnter(btn);
    expect(screen.getByRole("tooltip")).toBeDefined();
    fireEvent.mouseLeave(btn);
    expect(screen.queryByRole("tooltip")).toBeNull();
  });

  it("shows tooltip on focus", () => {
    render(<FieldTooltip content={TOOLTIP_CONTENT} />);
    const btn = screen.getByRole("button");
    fireEvent.focus(btn);
    expect(screen.getByRole("tooltip")).toBeDefined();
  });

  it("hides tooltip on blur", () => {
    render(<FieldTooltip content={TOOLTIP_CONTENT} />);
    const btn = screen.getByRole("button");
    fireEvent.focus(btn);
    fireEvent.blur(btn);
    expect(screen.queryByRole("tooltip")).toBeNull();
  });

  it("toggles tooltip on click", () => {
    render(<FieldTooltip content={TOOLTIP_CONTENT} />);
    const btn = screen.getByRole("button");
    // First click: opens
    fireEvent.click(btn);
    expect(screen.getByRole("tooltip")).toBeDefined();
    // Second click: closes
    fireEvent.click(btn);
    expect(screen.queryByRole("tooltip")).toBeNull();
  });

  it("closes tooltip on Escape keydown", () => {
    render(<FieldTooltip content={TOOLTIP_CONTENT} />);
    const btn = screen.getByRole("button");
    fireEvent.focus(btn);
    expect(screen.getByRole("tooltip")).toBeDefined();
    fireEvent.keyDown(btn, { key: "Escape" });
    expect(screen.queryByRole("tooltip")).toBeNull();
  });

  it("sets aria-describedby on button when tooltip is visible", () => {
    render(<FieldTooltip content={TOOLTIP_CONTENT} />);
    const btn = screen.getByRole("button");
    expect(btn.getAttribute("aria-describedby")).toBeNull();

    fireEvent.mouseEnter(btn);
    const describedBy = btn.getAttribute("aria-describedby");
    expect(describedBy).toBeTruthy();

    const tooltip = screen.getByRole("tooltip");
    expect(tooltip.id).toBe(describedBy);
  });

  it("sets aria-expanded=false by default and true when open", () => {
    render(<FieldTooltip content={TOOLTIP_CONTENT} />);
    const btn = screen.getByRole("button");
    expect(btn.getAttribute("aria-expanded")).toBe("false");

    fireEvent.mouseEnter(btn);
    expect(btn.getAttribute("aria-expanded")).toBe("true");
  });

  describe("viewport overflow and flip positioning (#833)", () => {
    it("flips from top to bottom when trigger is near top viewport edge", () => {
      render(<FieldTooltip content={TOOLTIP_CONTENT} />);
      const btn = screen.getByRole("button");

      jest.spyOn(btn, "getBoundingClientRect").mockReturnValue({
        top: 20,
        bottom: 40,
        left: 200,
        right: 220,
        width: 20,
        height: 20,
        x: 200,
        y: 20,
        toJSON: () => {},
      });

      fireEvent.mouseEnter(btn);
      const tooltip = screen.getByRole("tooltip");
      expect(tooltip).toBeDefined();
      expect(tooltip.getAttribute("data-side")).toBe("bottom");
      expect(tooltip.className).toContain("top-full");

      const arrow = screen.getByTestId("tooltip-arrow");
      expect(arrow.getAttribute("data-side")).toBe("bottom");
      expect(arrow.className).toContain("-top-2");
    });

    it("flips to right-aligned when near right viewport edge", () => {
      Object.defineProperty(window, "innerWidth", { writable: true, configurable: true, value: 500 });
      render(<FieldTooltip content={TOOLTIP_CONTENT} />);
      const btn = screen.getByRole("button");

      jest.spyOn(btn, "getBoundingClientRect").mockReturnValue({
        top: 300,
        bottom: 320,
        left: 480,
        right: 500,
        width: 20,
        height: 20,
        x: 480,
        y: 300,
        toJSON: () => {},
      });

      fireEvent.mouseEnter(btn);
      const tooltip = screen.getByRole("tooltip");
      expect(tooltip.getAttribute("data-align")).toBe("right");
      expect(tooltip.className).toContain("right-0");

      const arrow = screen.getByTestId("tooltip-arrow");
      expect(arrow.getAttribute("data-align")).toBe("right");
      expect(arrow.className).toContain("right-4");
    });

    it("flips to left-aligned when near left viewport edge", () => {
      Object.defineProperty(window, "innerWidth", { writable: true, configurable: true, value: 1024 });
      render(<FieldTooltip content={TOOLTIP_CONTENT} />);
      const btn = screen.getByRole("button");

      jest.spyOn(btn, "getBoundingClientRect").mockReturnValue({
        top: 300,
        bottom: 320,
        left: 10,
        right: 30,
        width: 20,
        height: 20,
        x: 10,
        y: 300,
        toJSON: () => {},
      });

      fireEvent.mouseEnter(btn);
      const tooltip = screen.getByRole("tooltip");
      expect(tooltip.getAttribute("data-align")).toBe("left");
      expect(tooltip.className).toContain("left-0");

      const arrow = screen.getByTestId("tooltip-arrow");
      expect(arrow.getAttribute("data-align")).toBe("left");
      expect(arrow.className).toContain("left-4");
    });

    it("recalculates position on window resize", () => {
      Object.defineProperty(window, "innerWidth", { writable: true, configurable: true, value: 1024 });
      render(<FieldTooltip content={TOOLTIP_CONTENT} />);
      const btn = screen.getByRole("button");

      jest.spyOn(btn, "getBoundingClientRect").mockReturnValue({
        top: 300,
        bottom: 320,
        left: 500,
        right: 520,
        width: 20,
        height: 20,
        x: 500,
        y: 300,
        toJSON: () => {},
      });

      fireEvent.mouseEnter(btn);
      const tooltip = screen.getByRole("tooltip");
      expect(tooltip.getAttribute("data-align")).toBe("center");

      // Shrink window so button is now near right edge
      Object.defineProperty(window, "innerWidth", { writable: true, configurable: true, value: 550 });
      fireEvent(window, new Event("resize"));

      expect(tooltip.getAttribute("data-align")).toBe("right");
    });
  });
});

