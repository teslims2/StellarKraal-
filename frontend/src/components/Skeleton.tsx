/**
 * Skeleton — placeholder for content that is loading for the first time.
 *
 * Use for page/section entry when there is *no existing data* yet.
 * For inline action feedback (button click, filter change), use Spinner.
 * For file-upload progress, use ProgressBar.
 *
 * Accessibility:
 *  - The shimmer bar is `aria-hidden` (decorative).
 *  - Wrap one or more Skeleton bars in a container that carries
 *    `aria-busy="true"` and an `aria-label` describing what is loading.
 *    All ready-made page-level skeletons (SkeletonDashboard, etc.) do
 *    this automatically.
 *
 * See LoadingStates.stories.tsx for the full hierarchy and usage rules.
 */
interface SkeletonProps {
  /** Visual variant — controls default dimensions and border-radius. */
  variant?: SkeletonVariant;
  /** Additional Tailwind classes (merged after variant defaults). */
  className?: string;
}

const VARIANT_CLASSES: Record<SkeletonVariant, string> = {
  text:    'h-4 w-full rounded',
  heading: 'h-7 w-3/4 rounded',
  avatar:  'h-12 w-12 rounded-lg flex-shrink-0',
  card:    'h-32 w-full rounded-xl',
  button:  'h-10 w-24 rounded-lg',
  badge:   'h-5 w-16 rounded-full',
  circle:  'h-10 w-10 rounded-full',
  custom:  '',
};

export default function Skeleton({ variant = 'custom', className = '' }: SkeletonProps) {
  return (
    <div
      className={`skeleton-shimmer ${VARIANT_CLASSES[variant]} ${className}`.trim()}
      aria-hidden="true"
    />
  );
}
