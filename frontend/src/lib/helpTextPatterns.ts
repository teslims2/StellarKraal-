/**
 * Help Text Patterns — issue #1484
 *
 * StellarKraal uses two components to explain financial and technical terms
 * in the UI. This file documents when to use each one, so contributors apply
 * the right pattern consistently.
 *
 * ─── Pattern 1: GlossaryTerm ────────────────────────────────────────────────
 *
 * Import: `import { GlossaryTerm } from '@/components/GlossaryTerm'`
 * Source: term definitions live in `@/lib/glossary` (`glossaryTerms` object)
 *
 * Use when: the term itself IS the visible UI text — a row label, a heading,
 * or a summary value where you want the label to be hoverable/focusable.
 *
 * Example:
 *   <dt><GlossaryTerm termKey="ltv">LTV</GlossaryTerm></dt>
 *   <dt><GlossaryTerm termKey="healthFactor" /></dt>
 *
 * The component renders an underlined, keyboard-focusable button. On hover or
 * focus, it shows a tooltip with the term name and plain-language definition.
 * Pass `children` to override the display text; omit them to use the canonical
 * term name from `glossaryTerms`.
 *
 * When to add a new term: add an entry to `glossaryTerms` in `@/lib/glossary`,
 * then reference it by key. Never add copy inline in the component call.
 *
 * ─── Pattern 2: FieldTooltip ────────────────────────────────────────────────
 *
 * Import: `import FieldTooltip from '@/components/FieldTooltip'`
 * Source: copy lives in `WIZARD_FIELD_TOOLTIPS` in `@/lib/wizardFieldTooltips`
 *
 * Use when: a form field label needs an ⓘ icon that explains what the user
 * should enter or what a calculated value means. The label text stays as-is;
 * the icon sits beside it.
 *
 * Example:
 *   <label>
 *     Loan Amount
 *     <FieldTooltip content={WIZARD_FIELD_TOOLTIPS.loanAmount} />
 *   </label>
 *
 * The trigger is a small info-circle SVG button. It opens a tooltip on hover,
 * focus, or click and closes on Escape or blur. The tooltip auto-flips to avoid
 * viewport overflow (issue #833).
 *
 * When to add new copy: add an entry to `WIZARD_FIELD_TOOLTIPS` in
 * `@/lib/wizardFieldTooltips`, then pass it via the `content` prop. Write copy
 * at a Grade 8 reading level and keep it under three sentences.
 *
 * ─── Rule ────────────────────────────────────────────────────────────────────
 *
 * Never use a raw `<abbr>` element or bare text for DeFi or lending terms
 * (LTV, APR, health factor, liquidation, Soroban, stroops, etc.) without
 * wrapping them in one of these two patterns. This ensures every technical term
 * is explained consistently and accessibly across the app.
 *
 * Decision guide:
 *   ┌─────────────────────────────────────────────────────────┬───────────────┐
 *   │ Situation                                               │ Pattern       │
 *   ├─────────────────────────────────────────────────────────┼───────────────┤
 *   │ Label / heading that IS the term                        │ GlossaryTerm  │
 *   │ Static summary value row (e.g. "Health Factor: 1.8")    │ GlossaryTerm  │
 *   │ Inline mention of a term in body text                   │ GlossaryTerm  │
 *   │ Form field label — explains what to enter               │ FieldTooltip  │
 *   │ Calculated field — explains how the value was derived   │ FieldTooltip  │
 *   └─────────────────────────────────────────────────────────┴───────────────┘
 */

export const HELP_TEXT_PATTERNS = {
  /**
   * Wraps an inline term label (or any visible text) with a hover/focus tooltip
   * sourced from `glossaryTerms` in `@/lib/glossary`.
   *
   * - Import: `import { GlossaryTerm } from '@/components/GlossaryTerm'`
   * - Use for: row labels, headings, or body-text mentions of a defined term.
   * - New terms: add to `glossaryTerms` in `@/lib/glossary`, then reference by key.
   */
  GlossaryTerm: {
    component: "@/components/GlossaryTerm",
    copySource: "@/lib/glossary#glossaryTerms",
    triggerStyle: "underlined text button",
    useWhen: "term itself is the visible UI text (label, heading, inline mention)",
  },

  /**
   * Renders an ⓘ icon beside a form field label. Tooltip copy is passed via
   * the `content` prop.
   *
   * - Import: `import FieldTooltip from '@/components/FieldTooltip'`
   * - Use for: form field labels and calculated-value explanations in wizards.
   * - New copy: add to `WIZARD_FIELD_TOOLTIPS` in `@/lib/wizardFieldTooltips`,
   *   then pass via `content={WIZARD_FIELD_TOOLTIPS.yourKey}`.
   */
  FieldTooltip: {
    component: "@/components/FieldTooltip",
    copySource: "@/lib/wizardFieldTooltips#WIZARD_FIELD_TOOLTIPS",
    triggerStyle: "ⓘ info-circle icon button",
    useWhen: "explaining a form field (what to enter or how a value is derived)",
  },
} as const;
