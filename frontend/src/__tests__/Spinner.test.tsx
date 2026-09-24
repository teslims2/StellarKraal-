/**
 * Tests for Spinner (#1091)
 *
 * Verifies:
 * - Renders without crashing
 * - role="status" present for screen-reader announcement
 * - aria-label carries the correct loading message
 * - aria-busy="true" set on the SVG
 * - animate-spin class applied
 * - Default + custom className and label props work
 * - No axe violations (via jest-axe)
 */
import React from "react";
import { render, screen } from "@testing-library/react";
import { axe, toHaveNoViolations } from "jest-axe";
import Spinner from "@/components/Spinner";

expect.extend(toHaveNoViolations);

describe("Spinner (#1091)", () => {
  it("renders without crashing", () => {
    const { container } = render(<Spinner />);
    expect(container.firstChild).toBeTruthy();
  });

  it("has role='status'", () => {
    render(<Spinner />);
    const spinner = screen.getByRole("status");
    expect(spinner).toBeInTheDocument();
  });

  it("defaults aria-label to 'Loading'", () => {
    render(<Spinner />);
    const spinner = screen.getByRole("status");
    expect(spinner).toHaveAttribute("aria-label", "Loading");
  });

  it("accepts a custom aria-label via `label` prop", () => {
    render(<Spinner label="Submitting loan application" />);
    const spinner = screen.getByRole("status");
    expect(spinner).toHaveAttribute("aria-label", "Submitting loan application");
  });

  it("sets aria-busy='true'", () => {
    render(<Spinner />);
    const spinner = screen.getByRole("status");
    expect(spinner).toHaveAttribute("aria-busy", "true");
  });

  it("applies animate-spin class", () => {
    render(<Spinner />);
    const spinner = screen.getByRole("status");
    expect(spinner).toHaveClass("animate-spin");
  });

  it("applies the default size class h-4 w-4", () => {
    render(<Spinner />);
    const spinner = screen.getByRole("status");
    expect(spinner).toHaveClass("h-4", "w-4");
  });

  it("accepts a custom className", () => {
    render(<Spinner className="h-8 w-8" />);
    const spinner = screen.getByRole("status");
    expect(spinner).toHaveClass("h-8", "w-8");
  });

  it("has no axe accessibility violations with default props", async () => {
    const { container } = render(<Spinner />);
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it("has no axe accessibility violations with custom label", async () => {
    const { container } = render(
      <Spinner className="h-6 w-6" label="Fetching health factor" />
    );
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});
