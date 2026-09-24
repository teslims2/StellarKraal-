import type { Meta, StoryObj } from "@storybook/react";
import ProgressBar from "./ProgressBar";

/**
 * `ProgressBar` is the deterministic upload indicator — the third tier in the
 * StellarKraal loading-state hierarchy.
 *
 * Use it **only** when you have a known upload percentage (0–100). For
 * indeterminate waits, use `Spinner` instead. For initial page loads with no
 * existing data, use a `Skeleton`.
 *
 * **Accessibility** — uses `role="progressbar"` with `aria-valuenow`,
 * `aria-valuemin`, `aria-valuemax`, and a descriptive `aria-label`. At 100 %
 * the `aria-label` updates to announce completion, and `aria-busy` is removed.
 *
 * See `LoadingStates.stories.tsx` for the full hierarchy and decision tree.
 */
const meta: Meta<typeof ProgressBar> = {
  title: "Components/ProgressBar",
  component: ProgressBar,
  parameters: { layout: "padded" },
  tags: ["autodocs"],
  argTypes: {
    value: {
      control: { type: "range", min: 0, max: 100, step: 1 },
      description: "Upload progress percentage (0–100).",
    },
    label: {
      control: "text",
      description:
        "Accessible label announced by screen readers, e.g. "Uploading document.pdf".",
    },
    className: {
      control: "text",
      description: "Optional Tailwind classes for the outer container.",
    },
  },
};

export default meta;
type Story = StoryObj<typeof meta>;

/** Interactive — drag the `value` slider in the Controls panel. */
export const Interactive: Story = {
  args: {
    value: 45,
    label: "Uploading collateral-photo.jpg",
  },
};

/** 0 % — just started */
export const Start: Story = {
  args: { value: 0, label: "Uploading document.pdf" },
};

/** 50 % — halfway */
export const Half: Story = {
  args: { value: 50, label: "Uploading document.pdf" },
};

/** 100 % — complete (fill turns success green) */
export const Complete: Story = {
  args: { value: 100, label: "Uploading document.pdf" },
};

/**
 * Multiple files — each file gets its own bar. Labels are announced
 * independently by screen readers.
 */
export const MultipleFiles: Story = {
  render: () => (
    <div className="max-w-sm space-y-4">
      {[
        { name: "registration-form.pdf", value: 100 },
        { name: "collateral-photo.jpg", value: 72 },
        { name: "valuation-report.pdf", value: 30 },
      ].map(({ name, value }) => (
        <div key={name} className="space-y-1">
          <p className="text-sm font-medium text-brown-700">{name}</p>
          <ProgressBar value={value} label={`Uploading ${name}`} />
          <p className="text-xs text-brown-500">{value}%</p>
        </div>
      ))}
    </div>
  ),
};

/**
 * Dark mode — fill colours use design tokens so they adapt automatically.
 */
export const DarkMode: Story = {
  render: () => (
    <div className="dark bg-brown-900 p-6 rounded-2xl space-y-4 max-w-sm">
      <div className="space-y-1">
        <p className="text-sm font-medium text-cream-200">collateral-photo.jpg</p>
        <ProgressBar value={60} label="Uploading collateral-photo.jpg" />
        <p className="text-xs text-cream-400">60%</p>
      </div>
      <div className="space-y-1">
        <p className="text-sm font-medium text-cream-200">valuation-report.pdf</p>
        <ProgressBar value={100} label="Uploading valuation-report.pdf" />
        <p className="text-xs text-success-light font-medium">Upload complete ✓</p>
      </div>
    </div>
  ),
};
