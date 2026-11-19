# Image Optimization

## Overview

This project uses the Next.js [`<Image>`](https://nextjs.org/docs/app/api-reference/components/image)
component for all raster images. **Never use a raw `<img>` tag** in application UI — the only
exceptions are locally-generated `blob:` or `data:` URLs (e.g. client-side upload previews) that
Next.js Image cannot handle. Those exceptions must carry an `eslint-disable-next-line @next/next/no-img-element`
comment explaining why.

## Rules

| Rule | Detail |
|------|--------|
| **Import from `next/image`** | `import Image from 'next/image'` — no other source. |
| **Static images: explicit dimensions** | Pass `width` and `height` for images with a known intrinsic size (icons, avatars with fixed px values). |
| **Dynamic aspect ratios: `fill`** | Use `fill` when the image must fill its container. The parent element must have `position: relative` (or `absolute`/`fixed`) and an explicit size (px, percentage, or an aspect-ratio class such as `aspect-[4/3]`). |
| **`priority` on above-the-fold images** | Set `priority` on the **first image visible without scrolling** on each page — typically a hero image or the main subject photo. This instructs Next.js to preload the image and disables lazy loading for it. |
| **Lazy load everything else** | Omit `priority` for all other images. Lazy loading is the default; do not set `loading="lazy"` explicitly. |
| **`sizes` on responsive images** | Provide a `sizes` prop so the browser can pick the right source from the generated `srcset`. Without it the browser downloads the largest variant on every viewport. |
| **`alt` is mandatory** | Every `<Image>` must have a meaningful `alt`. Use `alt=""` only for purely decorative images. |
| **`placeholder="blur"` for user photos** | Collateral photos loaded from remote URLs should include `placeholder="blur"` and a `blurDataURL` to prevent layout shift while the image loads. |

## WebP / AVIF — no manual conversion needed

Next.js automatically converts JPEG and PNG source images to **WebP** (and AVIF when supported)
at request time, served from `/_next/image`. No manual conversion, no extra build step. The
"Use modern image formats" Lighthouse audit passes out of the box.

## Remote images

Collateral photos are uploaded by users and hosted at arbitrary HTTPS URLs. These are permitted
by the `remotePatterns` block in [`frontend/next.config.js`](../../frontend/next.config.js):

```js
images: {
  remotePatterns: [
    { protocol: 'https', hostname: '**' },
    { protocol: 'http',  hostname: 'localhost' },
  ],
},
```

**Add new external image domains to `remotePatterns`, not to the deprecated `domains` array.**
Tighten the wildcard to specific hostnames in production once storage domains are stable.

## Example — collateral photo with `fill` layout

```tsx
import Image from 'next/image';

interface CollateralPhotoProps {
  src: string;
  animalType: string;
  collateralId: string;
  /** Pass true when this photo is the first visible image on the page. */
  isAboveFold?: boolean;
}

export function CollateralPhoto({
  src,
  animalType,
  collateralId,
  isAboveFold = false,
}: CollateralPhotoProps) {
  return (
    // Parent must be positioned and sized for fill to work.
    <div className="relative w-full aspect-[4/3] overflow-hidden rounded-xl">
      <Image
        src={src}
        alt={`${animalType} collateral ID ${collateralId}`}
        fill
        sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
        className="object-cover"
        // priority preloads and disables lazy loading; use only on above-fold images.
        priority={isAboveFold}
        placeholder="blur"
        blurDataURL="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="
      />
    </div>
  );
}
```

Key points in the example:

- The wrapper `div` is `relative` with an explicit `aspect-[4/3]` — required for `fill`.
- `sizes` mirrors the grid breakpoints so mobile only downloads a ~400 px image, not 1200 px.
- `priority` is a prop so the same component can be used both above and below the fold.
- `placeholder="blur"` smooths the load; `blurDataURL` is a 1×1 pixel PNG encoded as base64.

## Lighthouse

To run a Lighthouse image audit locally:

```bash
cd frontend
npm run lighthouse
```

The two audits to watch are:

- **Properly size images** — passes when `sizes` is correct for the viewport.
- **Use modern image formats** — passes automatically because Next.js serves WebP/AVIF via `/_next/image`.

Both should be green after following the rules above.
