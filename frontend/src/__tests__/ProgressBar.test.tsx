/**
 * Tests for ProgressBar (#1091)
 *
 * Verifies:
 * - Renders without crashing at 0%, 50%, 100%
 * - role="progressbar" with correct ARIA attributes
 * - aria-label describes upload context
 * - aria-busy="true" while in progress, removed (false) when complete
 * - aria-valuenow is clamped to 0–100
 * - No axe violations (via jest-axe)
 */
import React from "react";
import { render, screen } from "@testing-library/react";
import { axe, toHaveNoViolations } from "jest-axe";
import ProgressBar from "@/components/ProgressBar";

expect.extend(toHaveNoViolations);

describe("ProgressBar (#1091)", () => {
  it("renders without crashing at 0%", () => {
    const { container } = render(
      <ProgressBar value={0} label="Uploading file" />
    );
    expect(container.firstChild).toBeTruthy();
  });

  it("has role='progressbar'", () => {
    render(<ProgressBar value={45} label="Uploading file" />);
    const bar = screen.getByRole("progressbar");
    expect(bar).toBeInTheDocument();
  });

  it("sets aria-valuenow correctly", () => {
    render(<ProgressBar value={72} label="Uploading file" />);
    const bar = screen.getByRole("progressbar");
    expect(bar).toHaveAttribute("aria-valuenow", "72");
  });

  it("sets aria-valuemin=0 and aria-valuemax=100", () => {
    render(<ProgressBar value={50} label="Uploading file" />);
    const bar = screen.getByRole("progressbar");
    expect(bar).toHaveAttribute("aria-valuemin", "0");
    expect(bar).toHaveAttribute("aria-valuemax", "100");
  });

  it("includes label and percent in aria-label when in progress", () => {
    render(<ProgressBar value={45} label="Uploading document.pdf" />);
    const bar = screen.getByRole("progressbar");
    expect(bar).toHaveAttribute(
      "aria-label",
      "Uploading document.pdf — 45%"
    );
  });

  it("marks aria-label as complete at 100%", () => {
    render(<ProgressBar value={100} label="Uploading document.pdf" />);
    const bar = screen.getByRole("progressbar");
    expect(bar).toHaveAttribute(
      "aria-label",
      "Uploading document.pdf — complete"
    );
  });

  it("sets aria-busy='true' while in progress", () => {
    render(<ProgressBar value={50} label="Uploading" />);
    const bar = screen.getByRole("progressbar");
    expect(bar).toHaveAttribute("aria-busy", "true");
  });

  it("sets aria-busy='false' when complete", () => {
    render(<ProgressBar value={100} label="Uploading" />);
    const bar = screen.getByRole("progressbar");
    expect(bar).toHaveAttribute("aria-busy", "false");
  });

  it("clamps value below 0 to 0", () => {
    render(<ProgressBar value={-10} label="Uploading" />);
    const bar = screen.getByRole("progressbar");
    expect(bar).toHaveAttribute("aria-valuenow", "0");
  });

  it("clamps value above 100 to 100", () => {
    render(<ProgressBar value={150} label="Uploading" />);
    const bar = screen.getByRole("progressbar");
    expect(bar).toHaveAttribute("aria-valuenow", "100");
  });

  it("has no axe accessibility violations at 0%", async () => {
    const { container } = render(
      <ProgressBar value={0} label="Uploading document.pdf" />
    );
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it("has no axe accessibility violations at 50%", async () => {
    const { container } = render(
      <ProgressBar value={50} label="Uploading collateral-photo.jpg" />
    );
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it("has no axe accessibility violations at 100%", async () => {
    const { container } = render(
      <ProgressBar value={100} label="Uploading valuation-report.pdf" />
    );
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});
