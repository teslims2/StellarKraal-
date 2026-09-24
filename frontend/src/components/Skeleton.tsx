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
  className?: string;
}

export default function Skeleton({ className = "" }: SkeletonProps) {
  return (
    <div
      className={`skeleton-shimmer rounded ${className}`}
      aria-hidden="true"
    />
  );
}
