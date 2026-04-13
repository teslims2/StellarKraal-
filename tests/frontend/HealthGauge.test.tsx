import React from "react";
import { render, screen } from "@testing-library/react";
import HealthGauge from "../../src/components/HealthGauge";

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
