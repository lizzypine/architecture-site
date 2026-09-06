import imageMetadata from "./image-metadata.json";
import { urlFor } from "./cms/imageUrl.js";

// Shared image-delivery helpers -- extracted from App.jsx's homepage
// gallery pipeline (Project Page image-loading polish, Josh review) so
// ImageViewer.jsx (the Project Page's own large image) can request the
// exact same appropriately-sized, pre-optimized/Sanity-transformed image
// variants the homepage gallery already requests, from one shared source
// instead of a second, possibly-drifting copy. Every function below is
// unchanged logic, only its location moved -- App.jsx now imports these
// instead of defining them, and its own remaining homepage-only helpers
// (getGalleryImageSizes, shouldEagerLoadImage) stay where they are, since
// neither is meaningful outside the homepage's own tile-layout/eager-
// loading-budget concepts.
//
// The bug this extraction fixes: ImageViewer.jsx previously rendered
// `<img src={image.image} />` with zero transformation -- for a local
// stock photo (the current dataset), that's the full original file
// (public/img/*.jpg, ~1-3.7MB each, 91MB total across 36 files) requested
// unconditionally regardless of how small the photo actually renders on
// screen; for a live Sanity-sourced image, it would be the full,
// untransformed original asset from cdn.sanity.io. Neither is what a
// visitor's browser needs to paint a photo that's at most
// `max(340px, calc(100vh - 300px))` tall. Both problems already had a
// working fix sitting one file away.
export const optimizedImageWidths = [400, 800, 1200];

// Compression quality passed to Sanity's own image pipeline. 75 is
// Sanity's own long-standing default for this parameter; made explicit
// here (rather than left implicit) so the tradeoff is a visible, tunable
// constant instead of an assumption baked into a function body.
const SANITY_IMAGE_QUALITY = 75;

// Archive/DAPC-only Sanity quality (Production image-optimization pass,
// Josh review): a live Archive Item's image is a cdn.sanity.io URL, and
// without this, the archive/DAPC branch below would build the exact same
// URL project pages do (same width, same quality) -- the local-asset
// archive/project split would exist in name only once the current mock
// dataset is replaced by real Sanity content, since there'd be no static
// file pool to separate. Set from the same visual A/B pass that picked
// the local archive JPEG quality (72) below -- 100%-crop comparisons
// against fine texture, high-contrast edges, and smooth gradients showed
// no visible difference at that value, so it's reused here rather than
// inventing an unvalidated second number. SANITY_IMAGE_QUALITY above
// stays untouched -- project pages keep requesting quality 75, exactly as
// before.
const ARCHIVE_SANITY_IMAGE_QUALITY = 72;

export function getImageName(src) {
  return src.split("/").pop()?.replace(/\.[^.]+$/, "") || "";
}

// Handshake pass (default homepage pool): the optimized-image pipeline
// (scripts/optimize-images.mjs, run at build time) only ever generated
// width-variant/webp files for the known local stock photos under /img/
// -- a live Archive Item's `image` is a full cdn.sanity.io URL with no
// corresponding pre-optimized file. This guard is not a redesign of that
// pipeline -- it's the minimum needed so a live URL still renders instead
// of producing a broken /img/optimized/... path.
export function isLocalImageAsset(src) {
  return typeof src === "string" && src.startsWith("/img/");
}

// Responsive Sanity Image Delivery: the live counterpart to
// isLocalImageAsset immediately above -- every real Archive Item image is
// a cdn.sanity.io URL (see cms/queries.js's normalizeArchiveItem, which
// this leaves completely untouched: item.image/item.src stays exactly the
// same canonical, unsized URL it always was -- only how a *variant* of
// that URL gets requested at render time changes here).
export function isSanityImageAsset(src) {
  return typeof src === "string" && /^https?:\/\/cdn\.sanity\.io\//.test(src);
}

// The live equivalent of "the optimized-image pipeline generated this
// width-variant file at build time" -- except nothing needs generating
// ahead of time, since Sanity's CDN performs the resize on request. Built
// through the exact same urlFor(...) builder cms/imageUrl.js exports for
// this purpose. .auto("format") lets Sanity's CDN perform its own
// Accept-header content negotiation (serving WebP/AVIF/original,
// whichever the requesting browser actually supports), the live
// equivalent of the two hardcoded <source type="image/webp">/<source
// type="image/jpeg"> branches the local-asset path relies on instead.
function buildSanityImageUrl(src, width, quality = SANITY_IMAGE_QUALITY) {
  return urlFor(src)
    .width(width)
    .quality(quality)
    .auto("format")
    .url();
}

export function getOptimizedImageSrc(src, width = 800, extension = "jpg") {
  if (isSanityImageAsset(src)) return buildSanityImageUrl(src, width);
  if (!isLocalImageAsset(src)) return src;
  return `/img/optimized/${width}/${getImageName(src)}.${extension}`;
}

// Project-page full-resolution fix: a Sanity asset's real, uploaded
// intrinsic width is embedded directly in its own CDN URL (Sanity's own
// long-standing convention -- every resolved asset URL contains a
// `-{width}x{height}-` segment before the extension, e.g.
// `.../image-abc123-2048x1365-jpg`), so it can be read straight off the
// URL string with no extra network request or metadata lookup. Returns
// null (never a guess) if a URL doesn't match that shape, so callers can
// fall back to the existing capped behavior rather than ever risk
// requesting an unknown/invalid width.
const SANITY_URL_DIMENSIONS_PATTERN = /-(\d+)x(\d+)-/;

function getSanitySourceWidth(src) {
  const match = SANITY_URL_DIMENSIONS_PATTERN.exec(src);
  return match ? parseInt(match[1], 10) : null;
}

export function getOptimizedImageSrcSet(src, extension) {
  // Same guard shape as getOptimizedImageSrc above, extended to cover
  // both known-optimizable source kinds: for a live Sanity URL there IS a
  // real width-variant srcSet to build (via getOptimizedImageSrc's own
  // Sanity branch, called once per breakpoint exactly like the
  // local-asset case already does); for anything else (a src this
  // pipeline doesn't recognize) this omits the attribute (undefined --
  // React drops it from the rendered <source>) rather than emit a set of
  // identical entries at different width descriptors.
  if (!isLocalImageAsset(src) && !isSanityImageAsset(src)) return undefined;

  // Local assets are untouched: the static optimizer only ever generated
  // real files at these three widths (scripts/optimize-images.mjs), so
  // this branch keeps requesting exactly optimizedImageWidths, exactly
  // as before this pass.
  if (isLocalImageAsset(src)) {
    return optimizedImageWidths
      .map((width) => `${getOptimizedImageSrc(src, width, extension)} ${width}w`)
      .join(", ");
  }

  // Sanity branch (Project page only -- this function is never called
  // for Archive Items, see getArchiveOptimizedImageSrcSet below, which
  // this pass leaves completely untouched): keeps the same smaller
  // responsive steps for smaller screens, and adds the source's own full
  // intrinsic width as the largest candidate -- Sanity's CDN resizes on
  // request, so no file needs generating ahead of time for this, unlike
  // the local-asset branch above. Never requests a width larger than the
  // source: candidateWidths only keeps the existing steps that are
  // STRICTLY smaller than sourceWidth before appending it, so the source
  // width is never duplicated (e.g. a 1200px-wide source still yields
  // exactly 400/800/1200, identical to the old behavior) and a source
  // narrower than a given step never has that step requested oversized.
  // Falls back to the original capped list if the URL doesn't match the
  // expected Sanity shape (getSanitySourceWidth returns null) -- the
  // pre-existing, already-safe behavior, never a guessed width.
  const sourceWidth = getSanitySourceWidth(src);
  const candidateWidths = sourceWidth
    ? [...optimizedImageWidths.filter((width) => width < sourceWidth), sourceWidth]
    : optimizedImageWidths;

  return candidateWidths
    .map((width) => `${getOptimizedImageSrc(src, width, extension)} ${width}w`)
    .join(", ");
}

// Archive/DAPC-only counterparts (Production image-optimization pass, Josh
// review): every local Archive Item image is used by BOTH the homepage
// gallery/DAPC AND, via getVisibleItemsForProject in projectContent.js
// (identical getArchiveItems() array, filtered by item.project), that same
// item's own Project Page -- ImageViewer.jsx calls the two functions above
// directly. That makes /img/optimized/{width} a genuinely SHARED file pool
// between two different visual contexts, not an archive-only one --
// re-encoding it to a lower quality for the gallery's sake would silently
// change what a Project Page can serve too, for every Archive Item (today,
// all of them -- there's no archive-only subset in the mock dataset, and
// nothing in the schema guarantees one will exist in the real CMS data
// either). Rather than touch that shared pool, the gallery/DAPC call sites
// in App.jsx request from this SEPARATE resolver instead: a local asset
// resolves to its own /img/optimized-archive/{width} pool (generated by
// scripts/optimize-archive-images.mjs, wired into the normal build --
// see package.json), and a live Sanity asset resolves to the same CDN
// transform project pages use, just with ARCHIVE_SANITY_IMAGE_QUALITY
// instead of SANITY_IMAGE_QUALITY -- so the archive/project split
// survives the move from mock data to real CMS content, not just the
// current local dataset. Both branches are driven entirely by the `src`
// argument -- no filename, project, or dataset-size assumption anywhere
// below. ImageViewer.jsx is intentionally left calling the original
// functions above, completely untouched, so Project Page images stay
// exactly as they were.
export function getArchiveOptimizedImageSrc(src, width = 800, extension = "jpg") {
  if (isSanityImageAsset(src)) return buildSanityImageUrl(src, width, ARCHIVE_SANITY_IMAGE_QUALITY);
  if (!isLocalImageAsset(src)) return src;
  return `/img/optimized-archive/${width}/${getImageName(src)}.${extension}`;
}

export function getArchiveOptimizedImageSrcSet(src, extension) {
  if (!isLocalImageAsset(src) && !isSanityImageAsset(src)) return undefined;

  // Local Archive assets are untouched: scripts/optimize-archive-images.mjs
  // only ever generated real files at these three widths, so this branch
  // keeps requesting exactly optimizedImageWidths, exactly as before this
  // pass.
  if (isLocalImageAsset(src)) {
    const candidates = optimizedImageWidths.map(
      (width) => `${getArchiveOptimizedImageSrc(src, width, extension)} ${width}w`,
    );

    // Archive zoom image-quality pass (launch blocker, Josh review): a
    // local archive image's `src` argument here IS already the real,
    // untouched full-resolution original file path (e.g.
    // /img/pexels-....jpg -- see isLocalImageAsset above; nothing
    // upstream ever rewrites it), at its true intrinsic width per
    // image-metadata.json (getImageDimensions, defined further down this
    // same file). Appending it as a fourth, larger srcset candidate is
    // purely additive: a browser only ever fetches the smallest
    // candidate that satisfies its current `sizes` value, so this has no
    // effect on what loads at the existing, unchanged initial `sizes`
    // (getGalleryImageSizes in App.jsx) -- it only becomes reachable once
    // App.jsx's zoom-driven `sizes` promotion effect raises `sizes` past
    // 1200px for a tile the visitor has actually zoomed in on. No
    // original .webp exists for these assets (only the optimizer's own
    // 400/800/1200 webp tiers) -- scripts/optimize-archive-images.mjs is
    // untouched by this pass, and this branch does not fabricate a webp
    // that was never generated -- so this only extends the jpg
    // candidate list; the webp <source> stays capped at 1200w exactly as
    // before.
    if (extension === "jpg") {
      const fullWidth = getImageDimensions(src).width;
      const largestTierWidth = optimizedImageWidths[optimizedImageWidths.length - 1];
      if (fullWidth > largestTierWidth) {
        candidates.push(`${src} ${fullWidth}w`);
      }
    }

    return candidates.join(", ");
  }

  // Sanity branch (Archive quality fix, same shape as the Project-page
  // fix in getOptimizedImageSrcSet above -- reuses the same
  // getSanitySourceWidth helper): keeps the same smaller responsive
  // steps for small/medium tiles, and adds the source's own full
  // intrinsic width as the largest candidate so large `discovery` tiles
  // and Retina displays are no longer capped at 1200px. Never requests a
  // width larger than the source. ARCHIVE_SANITY_IMAGE_QUALITY (72) and
  // getGalleryImageSizes' own per-tile `sizes` value are both untouched
  // by this change -- only the candidate width list grows.
  const sourceWidth = getSanitySourceWidth(src);
  const candidateWidths = sourceWidth
    ? [...optimizedImageWidths.filter((width) => width < sourceWidth), sourceWidth]
    : optimizedImageWidths;

  return candidateWidths
    .map((width) => `${getArchiveOptimizedImageSrc(src, width, extension)} ${width}w`)
    .join(", ");
}

// Real intrinsic pixel dimensions for a known local asset (generated at
// build time into image-metadata.json by scripts/optimize-images.mjs), or
// a generic 1200x800 fallback for anything not in that map (a live Sanity
// asset today, since Sanity's own dimension metadata isn't threaded
// through yet -- see cms/queries.js). Used both for <img width/height>
// (so the browser can reserve the right box before the image loads, with
// no layout shift) and to derive a wrapper's aspect-ratio without any
// JS measurement of the rendered element.
export function getImageDimensions(src) {
  return imageMetadata[src] || { width: 1200, height: 800 };
}
