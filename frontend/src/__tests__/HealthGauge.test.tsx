import React from "react";
import { render, screen } from "@testing-library/react";
import HealthGauge from "../components/HealthGauge";

// healthColor is a pure util — mock the module so no stellar-sdk import needed
jest.mock("../lib/stellarUtils", () => ({
  healthColor: (bps: number) =>
    bps >= 10_000
      ? { text: "text-status-healthy", bg: "bg-status-healthy" }
      : { text: "text-status-danger", bg: "bg-status-danger" },
  formatStroops: (s: number) => `${s / 1e7} XLM`,
  submitSignedXdr: jest.fn(),
}));

describe("HealthGauge", () => {
  it("shows Healthy when hf >= 10_000", () => {
    render(<HealthGauge value={13333} />);
    expect(screen.getByText("Healthy")).toBeTruthy();
  });

  it("shows At Risk when hf < 10_000", () => {
    render(<HealthGauge value={8000} />);
    expect(screen.getByText("At Risk")).toBeTruthy();
  });

  it("displays ratio correctly", () => {
    render(<HealthGauge value={10000} />);
    expect(screen.getByText("1.00x")).toBeTruthy();
  });
});
