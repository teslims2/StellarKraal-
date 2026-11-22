import type { Variants, Transition } from "framer-motion";
import { useReducedMotion } from "framer-motion";

/**
 * Shared animation tokens.
 *
 * All durations are expressed in seconds (Framer Motion convention) but are
 * documented in milliseconds for parity with the design spec.
 */
export const DURATIONS = {
  /** 150ms — micro interactions (hover, press, badge) */
  fast: 0.15,
  /** 200ms — standard transitions (page, list items, panels) */
  base: 0.2,
} as const;

/** Consistent ease-out cubic-bezier curve used across the app. */
export const EASE_OUT: [number, number, number, number] = [0.16, 1, 0.3, 1];

/** Reusable transition presets built from the shared tokens. */
export const transitions = {
  fast: { duration: DURATIONS.fast, ease: EASE_OUT } as Transition,
  base: { duration: DURATIONS.base, ease: EASE_OUT } as Transition,
} as const;

/** Instant transition used when the user prefers reduced motion. */
export const instantTransition: Transition = { duration: 0 };

/**
 * Returns the appropriate transition for the given preset, collapsing to an
 * instant transition when `prefers-reduced-motion` is set.
 */
export function useMotionTransition(preset: keyof typeof transitions = "base"): Transition {
  const prefersReducedMotion = useReducedMotion();
  return prefersReducedMotion ? instantTransition : transitions[preset];
}

/**
 * Wraps a set of variants so that, when reduced motion is requested, all
 * animated properties collapse to instant transitions (opacity/scale/height
 * still resolve to their target values, but without motion).
 */
export function useReducedMotionVariants(variants: Variants): Variants {
  const prefersReducedMotion = useReducedMotion();
  if (!prefersReducedMotion) return variants;

  const collapsed: Variants = {};
  for (const [key, value] of Object.entries(variants)) {
    if (typeof value === "function") {
      collapsed[key] = value;
      continue;
    }
    collapsed[key] = { ...value, transition: instantTransition };
  }
  return collapsed;
}

/** Fade + slight upward slide — used for page transitions */
export const pageVariants: Variants = {
  hidden: { opacity: 0, y: 8 },
  visible: { opacity: 1, y: 0, transition: transitions.base },
};

/** Subtle scale pulse — used on form submit button while loading */
export const submitVariants: Variants = {
  idle: { scale: 1 },
  loading: {
    scale: [1, 0.97, 1],
    transition: { repeat: Infinity, duration: 0.8, ease: "easeInOut" },
  },
};

/** Fade-in for status badge changes */
export const badgeVariants: Variants = {
  initial: { opacity: 0, scale: 0.9 },
  animate: { opacity: 1, scale: 1, transition: transitions.fast },
};

/**
 * Fade-slide pattern for list items entering on load or addition.
 * Pair with a parent container using `listContainerVariants` for staggering.
 */
export const listItemVariants: Variants = {
  hidden: { opacity: 0, y: 8 },
  visible: { opacity: 1, y: 0, transition: transitions.base },
  exit: { opacity: 0, y: -4, transition: transitions.fast },
};

/** Parent container that staggers the entrance of its list item children. */
export const listContainerVariants: Variants = {
  hidden: {},
  visible: {
    transition: { staggerChildren: 0.04, delayChildren: 0.02 },
  },
};

/**
 * Panel / accordion expansion using smooth height + opacity transitions.
 * Apply to a motion element whose height animates between 0 and "auto".
 */
export const panelVariants: Variants = {
  collapsed: { height: 0, opacity: 0, transition: transitions.base },
  expanded: { height: "auto", opacity: 1, transition: transitions.base },
};

/** Button press and hover feedback with consistent easing. */
export const buttonVariants: Variants = {
  idle: { scale: 1, transition: transitions.fast },
  hover: { scale: 1.02, transition: transitions.fast },
  tap: { scale: 0.97, transition: transitions.fast },
};