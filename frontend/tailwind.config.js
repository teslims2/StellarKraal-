/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{ts,tsx,js,jsx}"],
  theme: {
    extend: {
      colors: {
        // Brand palette
        brand: {
          brown:      "var(--color-brown)",
          "brown-muted": "var(--color-brown-muted)",
          gold:       "var(--color-gold)",
          "gold-muted": "var(--color-gold-muted)",
          cream:      "var(--color-cream)",
        },
        // Semantic / status
        status: {
          healthy:    "var(--color-healthy)",
          warning:    "var(--color-warning)",
          danger:     "var(--color-danger)",
        },
        // Surface
        surface: {
          DEFAULT:    "var(--color-surface)",
          muted:      "var(--color-surface-muted)",
        },
      },
      spacing: {
        // Named spacing tokens (on top of Tailwind defaults)
        "token-xs":  "var(--space-xs)",
        "token-sm":  "var(--space-sm)",
        "token-md":  "var(--space-md)",
        "token-lg":  "var(--space-lg)",
        "token-xl":  "var(--space-xl)",
        "token-2xl": "var(--space-2xl)",
      },
      borderRadius: {
        token:    "var(--radius-base)",
        "token-lg": "var(--radius-lg)",
        "token-xl": "var(--radius-xl)",
      },
      boxShadow: {
        token:    "var(--shadow-base)",
        "token-md": "var(--shadow-md)",
      },
      fontSize: {
        "token-sm":   ["var(--text-sm)",   { lineHeight: "1.5" }],
        "token-base": ["var(--text-base)", { lineHeight: "1.5" }],
        "token-lg":   ["var(--text-lg)",   { lineHeight: "1.4" }],
        "token-xl":   ["var(--text-xl)",   { lineHeight: "1.3" }],
        "token-2xl":  ["var(--text-2xl)",  { lineHeight: "1.2" }],
        "token-4xl":  ["var(--text-4xl)",  { lineHeight: "1.1" }],
      },
    },
  },
  plugins: [],
};
