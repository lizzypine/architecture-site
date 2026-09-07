import { useEffect, useRef, useState } from "react";


// The template's large image. Image Navigation and the Archive Number
// used to render here too, but both moved out to ProjectTemplate.jsx as
// of the final correction pass (Josh review) -- see ImageNavigation.jsx
// and ProjectTemplate.jsx's own comments for why.
//
// Icon + position refinement (Josh review, second pass): the `overlay`
// slot that used to carry the Project Information trigger is gone. That
// control now renders directly inside ProjectTemplate.jsx's
// .project-image-nav-row (alongside the Archive Number and Image
// Navigation), not anchored to this component's image at all anymore --
// see ProjectInfoPanel.jsx's own top comment for the full reasoning. This
// component's only remaining job is: display the current image, at its
// own natural size, with a short transition when it changes (see below).
//
// Cropping correction (Josh review, final correction pass): the previous
// pass anchored the metadata trigger using a wrapper
// (.project-image-frame__inner) sized via an inline CSS `aspect-ratio`
// computed from this image's PRECOMPUTED intrinsic dimensions
// (image-metadata.json, generated at build time by
// scripts/optimize-images.mjs). That's a real risk of mismatch -- most
// concretely, that script reads metadata via a plain `sharp(...).metadata()`
// call BEFORE its own `.rotate()` step, so a source photo with an EXIF
// orientation flag could have its recorded width/height transposed
// relative to what actually renders -- and forcing the wrapper (and via
// it, effectively the image) into a WRONG aspect-ratio box means the
// photo gets stretched/distorted to fill it, which is exactly the kind of
// cropping/distortion this page must never do. Fixed by removing the
// precomputed aspect-ratio dependency entirely: the image now sizes
// itself purely from its own loaded content plus a non-percentage CSS
// constraint (see .project-image-frame__img in styles.css -- the same
// viewport-derived formula .project-image-frame's own height already
// uses, not a percentage of anything), and .project-image-frame__inner
// simply shrink-wraps to whatever box the image ends up rendering at, via
// ordinary flex-item content-sizing -- no wrapper-imposed ratio, no
// width/height attributes standing in for the image's real content. The
// relationship is strictly IMAGE determines its own rendered dimensions
// -> WRAPPER conforms to IMAGE. See .project-image-frame__inner's own
// comment in styles.css for the non-circular sizing reasoning.
//
// Image-first redesign: the taupe .project-image-frame background is
// gone -- the frame is now purely a centering/sizing box, not a visible
// "container."
//
// Image loading (Josh review, final polish pass -- SUPERSEDED by the
// Image Quality Policy pass below): this <img> used to request a
// properly-sized width variant through the getOptimizedImageSrc/
// getOptimizedImageSrcSet pipeline (see imageOptimization.js) instead of
// the full original file.
//
// Image Quality Policy pass (launch blocker, Josh review): Project-page
// images were visibly softer than their actual uploaded Sanity source
// (a verified 2048x1024 original was being requested at a 1200px-wide,
// quality-75 CDN transform). Project image viewing now requests
// image.image directly -- the original, untransformed asset -- with no
// width cap and no quality reduction; the browser/CSS still scales it
// down visually exactly as before, only the requested byte source
// changed. getOptimizedImageSrc/getOptimizedImageSrcSet are no longer
// imported or called anywhere in this file. This does NOT apply to the
// Archive (App.jsx's own getArchiveOptimizedImageSrc/SrcSet, and its
// zoom-driven promotion effect, are untouched) or to the neighbor-image
// preload effect in ProjectTemplate.jsx (deliberately left at its
// existing capped size -- preloading full originals for images not yet
// being viewed is exactly the broad/aggressive preloading this pass was
// told not to introduce).
// loading="eager"/fetchPriority="high" mirror what the homepage's own
// single-large-image case (its "focused image" lightbox) already does
// for the one prominent image a user is looking at -- see App.jsx.
//
// Image-to-image transition, SEQUENTIAL fade with a CONTROLLED tail
// overlap (Josh review, timing-refinement pass): the previous pass (see
// git history / the no-overlap pass) replaced the original two-layer
// crossfade with a strictly sequential fade driven by a single <img>
// element -- correct for eliminating the "two full-strength photos
// visibly stacked" problem, but Josh's review of THAT version found the
// transition read as too fast/abrupt with zero overlap at all, more like
// a hard cut with a dip to black than a dissolve. This pass slows the
// whole thing down AND reintroduces a SMALL, tightly bounded overlap --
// but only in the final stretch of the outgoing fade, and only ever at
// low combined strength, so the "two full photos stacked" problem this
// architecture exists to prevent never comes back.
//
// The mechanism is a deliberate MERGE of two patterns this codebase has
// already separately proven out, not a new third animation system:
//   1. The no-overlap pass's own single-<img>, phase-driven, "confirm via
//      real transitionend, never a guessed timer" fade-OUT -- kept
//      completely intact below. The base <img> still fades from 100% to
//      a GENUINELY confirmed 0% under its own steam, on its own timeline.
//   2. The ORIGINAL two-layer crossfade's own IncomingImage/handoff-
//      sequencing pattern (src swaps into the base layer only while
//      fully covered, confirmed safe via onLoad + double-rAF before the
//      cover is allowed to disappear) -- reinstated, but now as a
//      short-lived overlay that only exists for the TAIL of the
//      sequence, not the whole thing.
// Concretely:
//   - The base <img> (`renderedImage`, `phase`) fades out exactly as the
//     no-overlap pass already had it: OUTGOING_FADE_MS, confirmed by a
//     real transitionend, `phase` moving visible -> fading-out -> hidden.
//   - A SEPARATE overlay element (IncomingOverlay below) is mounted the
//     moment the base's fade-out begins (readiness pass, see below, for
//     why), but stays invisible/inert until the base's own fade-out is
//     already most of the way done (see OVERLAP_LEAD_MS) -- so for the
//     majority of the transition, exactly one photo (the outgoing one,
//     dimming) is on screen, same as the no-overlap pass. Only in that
//     final stretch is the incoming photo actually ALLOWED to begin
//     appearing, and even then it starts from 0% while the outgoing
//     photo is already faint (having spent most of its own fade-out
//     already), so the combined visual weight of the two together never
//     approaches "two strong photos stacked" -- it reads as one photo
//     dissolving into the next, not a composite.
//   - The base is GUARANTEED to reach true 0% (via its own transitionend)
//     before the overlay reaches 100% (via its own, separately-timed
//     transitionend) -- see the constants below for the exact margin.
//   - Once the overlay's own fade-in genuinely finishes, the base's own
//     `src` is swapped to that same photo while the base is still fully
//     hidden (opacity 0, and doubly hidden behind the still-fully-opaque
//     overlay on top of it) -- then, once THAT load is confirmed, the
//     base is popped to fully opaque INSTANTLY (transition deliberately
//     suppressed for that one commit -- see suppressBaseTransition/
//     .project-image-frame__img--no-transition) and the overlay is
//     unmounted in the same commit. Because both layers are, at that
//     instant, showing the exact same photo at the exact same opacity,
//     the swap is pixel-identical and imperceptible -- the same
//     "nothing left to visibly change" guarantee the original
//     crossfade's own handoff sequencing already relied on.
//
// Rapid-navigation note (Josh review, timing-refinement pass; updated by
// the readiness pass below): this deliberately does NOT retarget the
// overlay mid-flight once it has been armed (i.e. once it's actually
// been allowed to become visible) -- unlike the no-overlap pass, which
// could redirect a fade-out or reverse a fade-in at any instant because
// it only ever had ONE element to retarget. Redirecting a two-element
// handoff safely mid-sequence, once one of the two is genuinely on
// screen, is a meaningfully harder problem, and the overlay's own
// visible lifetime here is short (a few hundred ms) by design. A target
// that arrives once the overlay is already visible is honored as soon as
// the in-flight transition settles back to "visible" (the very next
// render re-checks `image` against `renderedImage` and starts a fresh
// cycle immediately) -- so rapid clicking always still converges
// correctly on the latest target, with no leftover elements and no
// visible corruption, just possibly one extra full transition cycle
// (to whichever photo was requested first) before it catches up to the
// latest one, rather than an instant mid-flight jump straight to it.
// One additional guard: if the latest requested target turns out, by the
// time the overlay's arm timer fires, to already match what's currently
// mounted (e.g. Next immediately followed by Previous, landing back on
// the original photo before the overlay was ever armed), the fade-out is
// aborted and the base snaps back to fully visible instantly rather than
// fading toward, and then immediately back from, a photo that was never
// really leaving.
//
// Readiness pass (Josh review, blank-frame fix): Josh's own testing
// occasionally hit a transition where the incoming photo briefly showed
// as a completely blank frame. Root cause: the overlay used to not even
// MOUNT (i.e. not start requesting its image) until the overlap window
// began, ~325ms into the sequence. If that particular fetch happened to
// be slow -- a photo that hadn't been preloaded, real network latency,
// or simply being outrun by fast repeated clicking -- the base could
// reach its own confirmed, genuine 0% (which only ever depends on its
// OWN fade-out timer, completely independent of the overlay) before the
// overlay had loaded anything at all to show, leaving both layers
// simultaneously invisible: a real blank frame, not a testing artifact.
// Fixed with the smallest change that closes that gap without touching
// the handoff architecture above: the overlay now mounts (and so starts
// loading its image) IMMEDIATELY when the base's fade-out begins, giving
// it the image's full outgoing-fade duration -- rather than only the
// final OVERLAP_LEAD_MS stretch -- to actually load. Being mounted,
// though, no longer means being ALLOWED to appear: "loaded" and
// "revealed" are now two separate gates. The overlay only starts its own
// visible fade-in once BOTH its image has finished loading (or failed --
// see IncomingOverlay's onError below, which counts a load failure as
// "ready" too, so a genuine network error can't leave this permanently
// stuck showing nothing) AND a scheduled "reveal armed" timer -- firing
// at the exact same OUTGOING_FADE_MS - OVERLAP_LEAD_MS offset the old
// mount timer used to -- has fired (overlayArmed below). In the healthy,
// overwhelmingly common case (the photo was already preloaded and loads
// in a handful of milliseconds), that arm timer remains the practical
// gate and the visible timing is unchanged from before. In the rare case
// of a genuinely slow or cold load, the reveal simply waits the extra
// beat until the image is actually ready, rather than exposing a gap.
// One consequence: because the overlay now mounts for whichever photo
// was requested at the instant the fade-out started (rather than
// re-reading the latest target 325ms later, as the old mount timer
// did), a very fast run of repeated clicks no longer gets the small
// "catch a late click before the overlay ever committed to a photo"
// shortcut the previous pass had -- see the "possibly one extra full
// transition cycle" note above. That's the deliberate trade-off for
// starting the fetch as early as possible; the end result -- correct
// convergence on the latest target, no corruption, and now, no blank
// frame -- is unchanged.
//
// A second, separate blank-frame source (readiness pass, found via this
// round's own Playwright verification of rapid clicking -- not something
// Josh described directly, but the same class of bug he asked to be
// ruled out): fast enough repeated navigation could start a NEW fade-out
// in the exact same commit as the PREVIOUS cycle's instant,
// transition-suppressed reveal (suppressBaseTransition, see below --
// its own 2-frame reset not yet painted). The base would then carry BOTH
// --hidden and --no-transition at once and snap straight to invisible
// instead of animating its fade-out -- a real blank stretch, reliably
// reproducible with fast repeated clicking even on an already-preloaded
// photo, with no network slowness involved at all. Fixed by also gating
// the very first "start a fade-out" effect on !suppressBaseTransition
// (see that effect's own comment) -- a back-to-back fade-out now simply
// waits the same couple of animation frames the reveal's own reset
// already takes, rather than starting mid-suppression.
//
// The preload system (ProjectTemplate.jsx's adjacent-image effect, "holds
// the previous picture too long" fix) is completely unchanged by any of
// this and still does its job here exactly as before -- both the base
// layer's eventual src swap and the overlay's own <img> request the same
// already-warmed, already-cached URLs that preload effect requested the
// moment the previous photo was selected, so neither ever waits on a
// real network fetch.
//
// onImageLoaded (unchanged contract, see ProjectTemplate.jsx's
// handleImageLoaded): still fires once a requested image has visually,
// GENUINELY finished arriving -- now the OVERLAY's own fade-in
// transitionend (the moment the new photo reaches its own full 100%),
// so the counter/archive-number still only advance once the new photo
// has actually settled into view.
//
// Duration + easing (Josh review, timing-refinement pass): the
// no-overlap pass's two-SEQUENTIAL-200ms-halves (400ms total, no
// overlap) read too fast/abrupt. Slowed down and restructured as:
//   - OUTGOING_FADE_MS (450ms, ease-in): the base photo's own fade-out,
//     100% -> a genuinely confirmed 0%. ease-in (slow start, accelerating
//     finish) is what keeps the outgoing photo clearly, comfortably
//     visible through most of its own fade, matching Josh's explicit
//     target curve (still ~15% opacity 80% of the way through its own
//     fade, then dropping quickly to 0 in the final stretch) -- the
//     opposite shape from the incoming photo's own curve below, and
//     deliberately so: one dissolves away, the other resolves in.
//   - OVERLAP_LEAD_MS (125ms): how long before the outgoing fade
//     actually finishes that the incoming overlay is allowed to appear
//     at all -- i.e. the overlay mounts at OUTGOING_FADE_MS -
//     OVERLAP_LEAD_MS (325ms) into the sequence, squarely in Josh's
//     specified "final 100-150ms of the outgoing fade" window.
//   - INCOMING_FADE_MS (300ms, ease-in-out): the overlay's own fade-in,
//     0% -> a genuinely confirmed 100%, starting once it's both loaded
//     and armed (see the readiness pass note above) -- in the common
//     case, still effectively starting at the 325ms mark. ease-in-out
//     (gradual in, fastest through the middle, gradual out) matches the
//     same reasoning the original crossfade's own duration history
//     already documents below in styles.css, and reads as a resolve
//     rather than a snap.
// These three add up to a 625ms NOMINAL motion budget (OUTGOING_FADE_MS
// + (INCOMING_FADE_MS - OVERLAP_LEAD_MS) = 450 + 175).
//
// Timing pass 2 (Josh review, "walking through the images" pass): the
// 500ms-nominal/~550-560ms-measured result from the prior pass read as
// visually correct for the OUTGOING half (Josh's own words: "the
// outgoing fade timing actually feels close to correct") but the
// INCOMING half still felt like the next photo simply appeared rather
// than being gradually introduced. OUTGOING_FADE_MS and OVERLAP_LEAD_MS
// are deliberately left unchanged here -- only INCOMING_FADE_MS grows,
// from 175ms to 300ms, substantially lengthening how long the incoming
// photo takes to dissolve in once it's actually revealed, while the
// brief, low-strength overlap window (still governed by OVERLAP_LEAD_MS
// alone) stays exactly as tightly bounded as before. Same measurement
// discipline as the prior pass applies, and matters even more now that
// the overlay's reveal can also be gated on real image-load latency, not
// just these two setTimeout delays: nominal constant arithmetic does not
// equal actual perceived duration, because of unavoidable real-world
// overhead -- setTimeout scheduling drift, plus the overlay's own onLoad
// + double-requestAnimationFrame "commit starting state, then flip" gate
// (see IncomingOverlay below), each add real milliseconds a naive sum of
// the constants doesn't account for. Measured end-to-end against actual
// paints (Playwright opacity sampling of the rendered wrapper element,
// not just these constants' own arithmetic, and not just reading
// getComputedStyle on the <img> itself -- see this project's own
// verification script for why that specific mistake gives false
// readings), the actual settled duration for this pass landed at
// approximately 685-705ms end-to-end (desktop and mobile viewports both
// measured, three consecutive transitions each), inside/at the edge of
// Josh's requested ~600-700ms perceived range, with the incoming half
// now visibly gradual rather than an appear-then-hold. 300ms was chosen
// over the initially-tried 350ms (which measured ~730-740ms, further
// past the requested window) specifically to land inside that range
// while still roughly doubling the old 175ms incoming duration -- the
// qualitative "walking through the images" difference Josh described is
// still clearly present at 300ms. If either duration is ever revisited
// again, re-measure the same way rather than trusting the arithmetic
// alone. The base is still confirmed fully invisible well before the
// incoming photo reaches its own 100%, exactly as specified. Still
// independent of Header.jsx's VEIL_DURATION_MS / App.jsx's
// GALLERY_FADE_MS ("its own short image transition," a separate motion
// from the site-wide interface fade).
const OUTGOING_FADE_MS = 450;
const OVERLAP_LEAD_MS = 125;
const INCOMING_FADE_MS = 300;

// The short-lived incoming-photo overlay (see this file's own top
// comment for the full mechanism, including the readiness-pass note on
// why this now mounts immediately but only reveals once armed). Not the
// long-lived, whole-transition overlay the original crossfade used --
// ImageViewer mounts one of these the moment the base layer's fade-out
// begins, and unmounts it again the moment the handoff below completes.
//
// Two-gate reveal (readiness pass, blank-frame fix): this component used
// to flip straight to visible the instant its own image finished
// loading. It now needs BOTH that load (tracked here, `loaded`) AND
// permission from the parent (`armed`, true once ImageViewer's own
// "reveal armed" timer has fired -- see ImageViewer's top comment) before
// it's allowed to start its fade-in. Whichever of the two happens to
// settle last is what actually triggers the reveal -- in the ordinary
// case that's `armed` (the image, usually preloaded, is ready well
// before the timer fires); for a genuinely slow/cold image, it's
// `loaded` instead, and the reveal simply waits for it rather than
// exposing a blank gap. `onError` is treated exactly the same as a
// successful load for this purpose -- a real network failure still needs
// to unblock the reveal/handoff sequence, or this (and the whole
// transition) would be stuck showing nothing forever.
function IncomingOverlay({ image, armed, onFaded }) {
  const [loaded, setLoaded] = useState(false);
  const [isVisible, setIsVisible] = useState(false);
  const wrapperRef = useRef(null);
  const revealFramesRef = useRef([]);

  // The reveal gate itself: only once both conditions are true, commit
  // the starting (opacity: 0) state via a real double-requestAnimationFrame
  // paint, then flip to visible -- the same "guarantee a real paint
  // first" guard this file already uses elsewhere, so the fade-in always
  // visibly plays even when both gates were already satisfied in the
  // same commit (e.g. an already-decoded, preload-cache-warm photo whose
  // load resolved well before the arm timer fired).
  useEffect(() => {
    if (!loaded || !armed || isVisible) return undefined;
    const first = requestAnimationFrame(() => {
      const second = requestAnimationFrame(() => setIsVisible(true));
      revealFramesRef.current.push(second);
    });
    revealFramesRef.current.push(first);
    return undefined;
  }, [loaded, armed, isVisible]);

  useEffect(() => {
    if (!isVisible) return undefined;
    const el = wrapperRef.current;
    if (!el) return undefined;

    let settled = false;
    let fallbackTimeoutId = null;
    const finish = () => {
      if (settled) return;
      settled = true;
      onFaded?.();
    };
    const handleTransitionEnd = (event) => {
      if (event.target !== el || event.propertyName !== "opacity") return;
      finish();
    };

    el.addEventListener("transitionend", handleTransitionEnd);
    fallbackTimeoutId = window.setTimeout(finish, INCOMING_FADE_MS + 150);

    return () => {
      el.removeEventListener("transitionend", handleTransitionEnd);
      if (fallbackTimeoutId) window.clearTimeout(fallbackTimeoutId);
    };
  }, [isVisible, onFaded]);

  // Unmount safety: cancel any reveal still queued via the double-rAF
  // above so a fast unmount can't call setIsVisible on a component
  // that's already gone.
  useEffect(() => {
    return () => {
      revealFramesRef.current.forEach((id) => cancelAnimationFrame(id));
      revealFramesRef.current = [];
    };
  }, []);

  return (
    <div
      ref={wrapperRef}
      className={`project-image-frame__incoming${
        isVisible ? " project-image-frame__incoming--visible" : ""
      }`}
      aria-hidden="true"
    >
      {/* Image Quality Policy pass (launch blocker, Josh review):
          Project-page images now request the original, untransformed
          Sanity/local asset directly (image.image -- the same raw URL
          isSanityImageAsset/isLocalImageAsset already recognize, before
          any width/quality transform is ever applied to it) instead of
          going through getOptimizedImageSrc/getOptimizedImageSrcSet's
          400/800/1200-capped, quality-75 derivative pipeline -- see
          imageOptimization.js's own comments for that pipeline, which
          this file no longer calls at all. No <picture>/<source>
          format-negotiation is needed any more either: there is only one
          URL now (the original), not multiple sized/format variants to
          choose between. The browser still scales this down visually via
          the exact same CSS (.project-image-frame__img, untouched) --
          only the requested SOURCE changed, not layout/sizing/cropping. */}
      <img
        className="project-image-frame__img"
        src={image.image}
        alt=""
        loading="eager"
        fetchpriority="high"
        decoding="async"
        onLoad={() => setLoaded(true)}
        onError={() => setLoaded(true)}
      />
    </div>
  );
}

export default function ImageViewer({ image, displayedImage, onImageLoaded }) {
  const isTransitioning = image.archiveNumber !== displayedImage.archiveNumber;

  // Seeded from `displayedImage` (ProjectTemplate's last-confirmed photo),
  // matching what the base layer always shows at rest. The one edge case
  // -- `image` already differs from `displayedImage` at the very moment
  // this component mounts -- starts `phase` as "fading-out" immediately
  // rather than "visible", the same "handle an already-in-flight target
  // on mount" robustness the no-overlap pass already had.
  const [renderedImage, setRenderedImage] = useState(() =>
    isTransitioning ? displayedImage : image,
  );
  // "visible" | "fading-out" | "hidden" -- one phase shorter than the
  // no-overlap pass's machine: there is no base-layer "fading-in" phase
  // anymore, because the VISIBLE fade-in motion now happens entirely on
  // the short-lived overlay below, not on the base. The base only ever
  // fades OUT under a real CSS transition; its own return to fully
  // opaque, once the overlay has already done that visible work, is an
  // instant, transition-suppressed commit (see suppressBaseTransition).
  const [phase, setPhase] = useState(() => (isTransitioning ? "fading-out" : "visible"));

  // The short-lived incoming-photo overlay's own state. `overlayImage`/
  // `showOverlay` are populated immediately once a fade-out begins (see
  // the mount/arm effect below, readiness pass) -- `overlayImage` being
  // set no longer means the overlay is visible, only that it's mounted
  // and loading. `overlayArmed` is the separate, still-delayed signal
  // that actually permits the overlay to reveal itself once its image is
  // also ready -- see IncomingOverlay's own "two-gate reveal" comment.
  const [overlayImage, setOverlayImage] = useState(null);
  const [showOverlay, setShowOverlay] = useState(false);
  const [overlayArmed, setOverlayArmed] = useState(false);
  // Flips true the instant the overlay's OWN fade-in genuinely finishes
  // (its transitionend) -- read by the handoff effect below alongside
  // `phase`, so the handoff fires correctly regardless of which of the
  // two (the base reaching "hidden", or the overlay finishing its own
  // fade) happens to settle first; by construction the base should
  // always settle first (OVERLAP_LEAD_MS < INCOMING_FADE_MS, a
  // deliberate margin), but this makes the handoff correct either way
  // rather than assuming a strict ordering.
  const [overlayReady, setOverlayReady] = useState(false);
  // Applies .project-image-frame__img--no-transition for exactly one
  // commit: the instant the base pops back to fully opaque once it's
  // safely hidden behind the (already fully opaque) overlay. Without
  // this, removing --hidden would kick off ANOTHER real opacity
  // transition on the base -- harmless in principle (still fully covered
  // by the overlay throughout), but pointless work, and it would leave
  // the overlay needing to stay mounted for that whole extra duration
  // before it's safe to unmount, adding needless latency to how quickly
  // a rapid subsequent click can start a fresh transition. An instant,
  // transition-suppressed commit lets the overlay unmount in the very
  // same tick instead.
  const [suppressBaseTransition, setSuppressBaseTransition] = useState(false);

  // Always the latest REQUESTED target, read fresh (never a stale
  // closure) by the effects/handlers below -- the same "read the ref,
  // not the argument you were called with" shape the original
  // crossfade's overlayGenerationRef handoff relied on.
  const imageRef = useRef(image);
  imageRef.current = image;

  const imgElRef = useRef(null);
  const overlayArmTimeoutRef = useRef(null);

  // Start a fade-out the moment the requested target diverges from
  // what's actually mounted and nothing is already in flight. Unlike the
  // no-overlap pass, this deliberately does NOT also fire while
  // "fading-out" or overlay-active -- see this file's own top comment
  // ("Rapid-navigation note") for why a fresh cycle only starts once the
  // current one has fully settled back to "visible" again.
  //
  // Readiness pass (second blank-frame source, found while verifying the
  // fix above): also waits for !suppressBaseTransition. Without this, a
  // fast enough repeat click could start a NEW fade-out in the exact same
  // commit as the PREVIOUS cycle's instant, transition-suppressed reveal
  // (suppressBaseTransition still true, its own 2-frame reset not yet
  // painted) -- the base would then pick up BOTH --hidden and
  // --no-transition at once, snapping straight to invisible instead of
  // animating its fade-out, silently producing exactly the same visible
  // blank frame this round exists to eliminate, entirely independent of
  // network speed (reliably reproducible with fast, repeated clicking
  // even on an already-preloaded image). Gating on suppressBaseTransition
  // delays a genuinely back-to-back fade-out by at most the same 2
  // animation frames the reveal's own reset effect already waits (a few
  // milliseconds, imperceptible) -- once it clears, this effect re-runs
  // against whatever `image` is latest at that point, so no target is
  // ever lost, just started a couple of frames later with its transition
  // intact.
  useEffect(() => {
    if (
      image.archiveNumber !== renderedImage.archiveNumber &&
      phase === "visible" &&
      !suppressBaseTransition
    ) {
      setPhase("fading-out");
    }
  }, [image, renderedImage, phase, suppressBaseTransition]);

  // The base layer's own fade-out: confirmed via a real transitionend
  // (with a timeout fallback for the rare case it's missed -- e.g. a
  // backgrounded tab throttling timers), exactly as the no-overlap pass
  // already had it, and completely independent of whether the overlay's
  // image below has loaded yet -- that independence is exactly what
  // used to make the blank frame possible (see the readiness-pass note
  // in this file's top comment) and is why the overlay is now mounted
  // immediately below rather than waiting on this fade-out's progress.
  useEffect(() => {
    if (phase !== "fading-out") return undefined;
    const el = imgElRef.current;
    if (!el) return undefined;

    // Mount the overlay for whatever target was requested the instant
    // this fade-out began (imageRef.current is already current -- it's
    // assigned synchronously every render, before effects run, and this
    // effect only runs once phase has just become "fading-out"). This is
    // the readiness-pass fix: mounting immediately, rather than waiting
    // for the overlap window, gives the overlay's <img> its full
    // OUTGOING_FADE_MS to actually load, instead of only the final
    // OVERLAP_LEAD_MS -- see IncomingOverlay's own "two-gate reveal"
    // comment for how being mounted no longer means being visible.
    setOverlayImage(imageRef.current);
    setShowOverlay(true);
    setOverlayArmed(false);

    // The overlay is still only ALLOWED to reveal itself once this timer
    // fires, at the same offset the old (now-removed) mount timer used
    // -- see the readiness-pass note above for why this is now an "arm"
    // signal rather than the mount trigger itself.
    const armDelay = OUTGOING_FADE_MS - OVERLAP_LEAD_MS;
    overlayArmTimeoutRef.current = window.setTimeout(() => {
      const target = imageRef.current;
      if (target.archiveNumber === renderedImage.archiveNumber) {
        // The latest requested target is already back to what's
        // currently mounted (e.g. Next immediately followed by
        // Previous) -- nothing left to transition to. Abort cleanly:
        // snap the base back to fully visible instantly and unmount the
        // (never-armed, so never visible) overlay, rather than fading
        // further toward, then immediately back from, a photo that was
        // never really leaving.
        setSuppressBaseTransition(true);
        setPhase("visible");
        setShowOverlay(false);
        setOverlayImage(null);
        return;
      }
      setOverlayArmed(true);
    }, armDelay);

    let settled = false;
    let fallbackTimeoutId = null;
    const finish = () => {
      if (settled) return;
      settled = true;
      setPhase("hidden");
    };
    const handleTransitionEnd = (event) => {
      if (event.target !== el || event.propertyName !== "opacity") return;
      finish();
    };

    el.addEventListener("transitionend", handleTransitionEnd);
    fallbackTimeoutId = window.setTimeout(finish, OUTGOING_FADE_MS + 150);

    return () => {
      el.removeEventListener("transitionend", handleTransitionEnd);
      if (fallbackTimeoutId) window.clearTimeout(fallbackTimeoutId);
      if (overlayArmTimeoutRef.current) {
        window.clearTimeout(overlayArmTimeoutRef.current);
        overlayArmTimeoutRef.current = null;
      }
    };
  }, [phase, renderedImage]);

  // The handoff: once the base has genuinely reached "hidden" AND the
  // overlay has genuinely finished its own fade-in (in whichever order
  // those two happen to settle), swap the base layer's own `src` to that
  // same photo while it's still fully hidden -- see handleBaseLoad below
  // for the rest of the sequence (confirm the load, then the instant
  // reveal + overlay unmount).
  useEffect(() => {
    if (phase === "hidden" && overlayReady && overlayImage) {
      setRenderedImage(overlayImage);
      setOverlayReady(false);
    }
  }, [phase, overlayReady, overlayImage]);

  // Re-enable the base's own transition after an instant
  // (transition-suppressed) commit has actually been painted, so the
  // NEXT fade-out animates normally again rather than also snapping.
  useEffect(() => {
    if (!suppressBaseTransition) return undefined;
    const first = requestAnimationFrame(() => {
      requestAnimationFrame(() => setSuppressBaseTransition(false));
    });
    return () => cancelAnimationFrame(first);
  }, [suppressBaseTransition]);

  const handleOverlayFaded = () => {
    // The incoming photo has genuinely finished its own fade-in --
    // fire the usual "a requested image has visually settled" signal
    // exactly as every prior pass has (see this file's own top comment
    // on onImageLoaded).
    onImageLoaded?.(overlayImage.archiveNumber);
    setOverlayReady(true);
  };

  // Also wired to the base <img>'s onError (readiness pass): a genuine
  // load failure here still needs to unblock the handoff exactly like a
  // successful load would, or the base would stay hidden behind the
  // already-fully-revealed overlay forever -- correct-looking on screen
  // (the overlay is still showing the new photo), but silently stuck
  // (phase would never return to "visible", which is what allows the
  // NEXT navigation to start a fresh cycle -- see the very first effect
  // in this component).
  const handleBaseLoad = () => {
    if (phase === "visible") {
      // Initial mount, or this exact photo reloading with nothing in
      // flight -- no transition involved, matches every prior pass's
      // base layer onLoad behavior.
      onImageLoaded?.(renderedImage.archiveNumber);
      return;
    }

    if (phase !== "hidden" || !overlayImage || renderedImage.archiveNumber !== overlayImage.archiveNumber) {
      // Either still mid-fade-out (this onLoad is stale/irrelevant), or
      // "hidden" but the handoff effect above hasn't swapped `src` to
      // the overlay's target yet -- nothing to do here yet.
      return;
    }

    // Base has now loaded the exact same photo the (still fully opaque)
    // overlay on top of it is already showing at 100%. Reveal it
    // INSTANTLY (suppressBaseTransition, see above) so the two are
    // pixel-identical the moment the overlay disappears, then unmount
    // the overlay in the same commit -- the same "nothing left to
    // visibly change" guarantee the original crossfade's own handoff
    // sequencing already relied on.
    setSuppressBaseTransition(true);
    setPhase("visible");
    setShowOverlay(false);
    setOverlayImage(null);
  };

  const isFadedOut = phase === "fading-out" || phase === "hidden";

  return (
    <div className="project-image-viewer">
      <div className="project-image-frame">
        <div className="project-image-frame__inner">
          {/* Image Quality Policy pass: same change as IncomingOverlay's
              own <img> above -- the original asset (renderedImage.image)
              directly, no optimized-derivative pipeline, no
              <picture>/<source> variant negotiation. */}
          <img
            ref={imgElRef}
            className={`project-image-frame__img${
              isFadedOut ? " project-image-frame__img--hidden" : ""
            }${suppressBaseTransition ? " project-image-frame__img--no-transition" : ""}`}
            src={renderedImage.image}
            alt={
              renderedImage.title ||
              renderedImage.caption ||
              `Archive ${renderedImage.archiveNumber}`
            }
            loading="eager"
            fetchpriority="high"
            decoding="async"
            onLoad={handleBaseLoad}
            onError={handleBaseLoad}
          />
        </div>
        {showOverlay && overlayImage && (
          <IncomingOverlay image={overlayImage} armed={overlayArmed} onFaded={handleOverlayFaded} />
        )}
      </div>
    </div>
  );
}
