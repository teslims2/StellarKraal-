/**
 * Tests for the LiveRegion component and useLiveRegion hook — Issue #1461
 */
import React from "react";
import { render, screen, act } from "@testing-library/react";
import LiveRegion from "@/components/LiveRegion";
import { liveRegionBus } from "@/lib/liveRegionBus";

describe("LiveRegion", () => {
  it("renders a polite status region", () => {
    render(<LiveRegion />);
    const region = screen.getByTestId("live-region-polite");
    expect(region).toBeInTheDocument();
    expect(region).toHaveAttribute("role", "status");
    expect(region).toHaveAttribute("aria-live", "polite");
    expect(region).toHaveAttribute("aria-atomic", "true");
  });

  it("renders an assertive alert region", () => {
    render(<LiveRegion />);
    const region = screen.getByTestId("live-region-assertive");
    expect(region).toBeInTheDocument();
    expect(region).toHaveAttribute("role", "alert");
    expect(region).toHaveAttribute("aria-live", "assertive");
    expect(region).toHaveAttribute("aria-atomic", "true");
  });

  it("displays a polite message emitted on the bus", async () => {
    render(<LiveRegion />);
    act(() => {
      liveRegionBus.emit("polite", "Loan 42 status changed to Funded");
    });
    // Allow requestAnimationFrame to flush
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });
    expect(screen.getByTestId("live-region-polite")).toHaveTextContent(
      "Loan 42 status changed to Funded"
    );
  });

  it("displays an assertive message emitted on the bus", async () => {
    render(<LiveRegion />);
    act(() => {
      liveRegionBus.emit("assertive", "Session is about to expire");
    });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });
    expect(screen.getByTestId("live-region-assertive")).toHaveTextContent(
      "Session is about to expire"
    );
  });
});
