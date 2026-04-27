import type { Meta, StoryObj } from "@storybook/react";

// ── Token swatch helpers ──────────────────────────────────────────────────────

function Swatch({ label, cls, hex }: { label: string; cls: string; hex: string }) {
  return (
    <div className="flex items-center gap-3 mb-2">
      <div className={`w-10 h-10 rounded border border-black/10 ${cls}`} />
      <div>
        <p className="text-sm font-mono font-semibold">{label}</p>
        <p className="text-xs text-gray-500">{hex}</p>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-8">
      <h2 className="text-lg font-bold mb-3 border-b pb-1">{title}</h2>
      {children}
    </section>
  );
}

function Row({ label, value, preview }: { label: string; value: string; preview?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-4 mb-2 text-sm">
      <span className="font-mono w-40 shrink-0">{label}</span>
      <span className="text-gray-500 w-28 shrink-0">{value}</span>
      {preview}
    </div>
  );
}

// ── Story component ───────────────────────────────────────────────────────────

function DesignTokens() {
  return (
    <div className="p-8 max-w-2xl font-sans">
      <h1 className="text-2xl font-bold mb-1">StellarKraal Design Tokens</h1>
      <p className="text-gray-500 mb-8 text-sm">
        All tokens are CSS custom properties defined in <code>globals.css</code> and
        exposed as Tailwind classes via <code>tailwind.config.js</code>.
      </p>

      {/* ── Colors ── */}
      <Section title="Colors — Brand">
        <Swatch label="brand-brown"       cls="bg-brand-brown"       hex="#4A2C0A" />
        <Swatch label="brand-brown-muted" cls="bg-brand-brown-muted" hex="#7A5C3A" />
        <Swatch label="brand-gold"        cls="bg-brand-gold"        hex="#D4A017" />
        <Swatch label="brand-gold-muted"  cls="bg-brand-gold-muted"  hex="#E8C060" />
        <Swatch label="brand-cream"       cls="bg-brand-cream border" hex="#FDF6EC" />
      </Section>

      <Section title="Colors — Status">
        <Swatch label="status-healthy" cls="bg-status-healthy" hex="#22C55E" />
        <Swatch label="status-warning" cls="bg-status-warning" hex="#F59E0B" />
        <Swatch label="status-danger"  cls="bg-status-danger"  hex="#EF4444" />
      </Section>

      <Section title="Colors — Surface">
        <Swatch label="surface"       cls="bg-surface border"       hex="#FFFFFF" />
        <Swatch label="surface-muted" cls="bg-surface-muted border" hex="#F5F0E8" />
      </Section>

      {/* ── Spacing ── */}
      <Section title="Spacing">
        {[
          ["token-xs",  "4px",  "var(--space-xs)"],
          ["token-sm",  "8px",  "var(--space-sm)"],
          ["token-md",  "16px", "var(--space-md)"],
          ["token-lg",  "24px", "var(--space-lg)"],
          ["token-xl",  "40px", "var(--space-xl)"],
          ["token-2xl", "64px", "var(--space-2xl)"],
        ].map(([name, px, cssVar]) => (
          <Row key={name} label={name} value={`${px} (${cssVar})`}
            preview={<div className="bg-brand-gold/40 h-4" style={{ width: px }} />}
          />
        ))}
      </Section>

      {/* ── Border Radius ── */}
      <Section title="Border Radius">
        {[
          ["rounded-token",    "8px",  "var(--radius-base)"],
          ["rounded-token-lg", "16px", "var(--radius-lg)"],
          ["rounded-token-xl", "24px", "var(--radius-xl)"],
        ].map(([cls, px, cssVar]) => (
          <Row key={cls} label={cls} value={`${px} (${cssVar})`}
            preview={<div className={`w-10 h-10 bg-brand-brown/20 ${cls}`} />}
          />
        ))}
      </Section>

      {/* ── Shadows ── */}
      <Section title="Shadows">
        <Row label="shadow-token"    value="var(--shadow-base)"
          preview={<div className="w-16 h-8 bg-white shadow-token rounded" />}
        />
        <Row label="shadow-token-md" value="var(--shadow-md)"
          preview={<div className="w-16 h-8 bg-white shadow-token-md rounded" />}
        />
      </Section>

      {/* ── Typography ── */}
      <Section title="Font Sizes">
        {[
          ["token-sm",   "14px"],
          ["token-base", "16px"],
          ["token-lg",   "18px"],
          ["token-xl",   "20px"],
          ["token-2xl",  "24px"],
          ["token-4xl",  "36px"],
        ].map(([name, px]) => (
          <Row key={name} label={`text-${name}`} value={`${px} (var(--text-${name.replace("token-", "")}))`}
            preview={<span className={`text-${name} font-semibold`}>Aa</span>}
          />
        ))}
      </Section>
    </div>
  );
}

// ── Storybook meta ────────────────────────────────────────────────────────────

const meta: Meta = {
  title: "Design System/Tokens",
  component: DesignTokens,
  parameters: {
    layout: "fullscreen",
    docs: { description: { component: "Visual reference for all StellarKraal design tokens." } },
  },
};
export default meta;

export const AllTokens: StoryObj = {};
