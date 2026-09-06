import { useEffect, useMemo, useRef, useState } from "react";
import Header from "./Header";
import ProjectBreadcrumb from "./ProjectBreadcrumb";
import ImageViewer from "./ImageViewer";
import ImageNavigation from "./ImageNavigation";
import ProjectArchiveIndex from "./ProjectArchiveIndex";
import ProjectInfoPanel, { ProjectInfoTrigger } from "./ProjectInfoPanel";
import { getProjectBySlug, resolveInitialImageId } from "./projectContent";
import { navigate } from "./navigation";
import { getOptimizedImageSrc } from "./imageOptimization.js";

// The one reusable template every Project on the site renders through.
// Everything about a specific project -- title, images, neighbors -- comes
// in as data resolved from `slug`; nothing here is authored per-project.
//
// Router.jsx renders this with key={slug}, so navigating between Projects
// (Previous/Next Project) fully resets this component's state instead of
// trying to reconcile it in place -- the simplest way to guarantee a new
// project always starts clean, with no image selection carried over from
// the last one. This is an implementation detail only: it's still the
// exact same template/file rendering every project, which is what "one
// reusable Project Template" actually means architecturally.
//
// Image-first redesign (Josh review): this page is now composed of four
// deliberately separated systems, each owning exactly one concern, none
// coupled to the others' internals:
//   1. Project Image Viewer (ImageViewer.jsx) -- just the image itself,
//      with a short crossfade to the next one when it changes (see that
//      file's own comment). Image Navigation, the Archive Number, and
//      (as of the icon + position refinement, Josh review, second pass)
//      the Project Information trigger all used to render inside/over
//      this component too; all three have since moved out to the
//      page-level row described in point 2 -- see ImageViewer.jsx's own
//      comment for why.
//   2. Archive/Image Index + Image Navigation + Project Information
//      trigger (ProjectArchiveIndex.jsx, ImageNavigation.jsx,
//      ProjectInfoPanel.jsx's ProjectInfoTrigger) -- a page-level row
//      (imageNavRow below, .project-image-nav-row in styles.css) that is
//      a structural sibling of the image viewer and Project Navigation,
//      NOT nested inside .project-image-column. This is what makes the
//      row's position immune to the image's own rendered size, to the
//      metadata panel opening/closing (which narrows
//      .project-image-column, a box this row no longer lives inside),
//      and to switching between landscape and portrait images -- it was
//      previously nested inside the image column and drifted with all
//      three. Clickable as of an earlier pass (Josh review): the archive
//      number shares Project Information's own isInfoOpen state and
//      handleToggleInfo function (below) with ProjectInfoTrigger, so
//      clicking either one opens/closes the same panel via one state --
//      unchanged by the icon + position refinement, which only moved
//      ProjectInfoTrigger's own RENDER LOCATION into this same row (its
//      far-left column) alongside the two controls that already lived
//      here, not its open/close wiring. Synchronized as of the final
//      correction pass (Josh review): both the archive number and the
//      "N / M" count reflect `displayedImage`, not `currentImage` (see
//      below) -- see ImageNavigation.jsx's own comment for the bug this
//      fixes.
//   3. Project Information (ProjectInfoPanel.jsx) -- ProjectInfoTrigger
//      (now rendered in point 2's row, not over the image -- see that
//      file's own top comment for the icon + position refinement) and a
//      full-image opaque overlay that opens when activated. Owns its own
//      open/closed state here (`isInfoOpen`) since neither the image nor
//      the bottom nav needs to know about it -- opening/closing it never
//      changes image size or the bottom nav, and changing images never
//      closes it.
//   4. Project Navigation (ProjectNavigation.jsx) used to be a fourth
//      system here -- Previous / current Project / Next, rendered below
//      the horizontal rule beneath the image. Interaction refinement
//      (bottom-nav removal): removed outright, per explicit instruction
//      that the image/content area become the page's primary interface
//      without a competing bottom text treatment, and not replaced with
//      anything else. ProjectNavigation.jsx itself is left on disk,
//      unused, matching this codebase's own existing convention for a
//      retired page section (see ProjectHeader.jsx/ImageMetadata.jsx,
//      both left in place unused by an earlier pass, per this file's own
//      comment further down).
//
// Selected vs. displayed image (Josh review, final correction pass): two
// separate pieces of state now track "which image," on purpose.
// `currentImageId` is what the visitor has actually clicked/requested --
// it drives the URL, and it's what ImageViewer is told to load next.
// `displayedImageId` only advances once that image has actually finished
// loading (see handleImageLoaded, wired to ImageViewer's onImageLoaded).
// Image Navigation's counter and the Archive Number both read from
// `displayedImage`, not `currentImage` -- this is the fix for a real bug
// where clicking next/previous updated the counter text immediately,
// before the new photo had loaded, so the page could briefly claim "2 /
// 7" while photo 1 was still the only thing on screen. Previous/Next's
// own TARGETS still key off `currentImage` (the requested one), so
// repeated clicking still advances predictably through the real sequence
// even before any single image finishes loading -- see
// ImageNavigation.jsx's own comment for the full reasoning. The metadata
// panel is unaffected by this split -- it still reads `currentImage`,
// unchanged, since it wasn't part of the reported bug and changing its
// timing wasn't asked for.
//
// The old ProjectHeader (title/location above the image) is no longer
// rendered here, per explicit instruction -- the underlying data
// (project.title/project.location) isn't gone. project.title now surfaces
// in two places (ProjectInfoPanel's right-hand column, and
// ProjectNavigation's center "current project" block), while
// project.location surfaces only in ProjectInfoPanel -- deliberately not
// duplicated into the bottom nav (Josh review: an earlier pass showed
// location under "Current" too; removed so that block stays a title-only
// peer of Previous/Next). ProjectHeader.jsx and ImageMetadata.jsx are both
// left on disk, unused by this page now, rather than deleted -- deleting
// files wasn't part of what was asked here.
//
// Data-completeness correction (Josh review): an earlier pass reasoned
// that Themes/per-image fields belonged only to the Archive Item,
// not the Project, and left them out of the Project Information panel
// entirely on that basis. That reasoning about WHERE the fields live was
// correct (confirmed again against cms/queries.js's
// ARCHIVE_ITEMS_QUERY/normalizeArchiveItem) but the conclusion was wrong:
// the panel is meant to expose "the actual metadata available for that
// image/project," and the currently-displayed Archive Item is part of
// that. ProjectInfoPanel now receives the current image as a second prop
// (`image`, the exact object ImageViewer/ProjectArchiveIndex already
// use) alongside `project`, and renders both the Project's own fields
// (title, location, dates, description -- confirmed via mockProjects.js
// and the locked Sanity Project schema to be the only ones that exist at
// that level) and the current image's own populated fields (title,
// themes, date, caption). See ProjectInfoPanel.jsx's own comment
// for the full data-flow trace and the one field (the image's own
// `location`) deliberately still excluded, and why.
// Image swipe/trackpad navigation (surgical project-page interaction
// pass): reuses the exact same handleSelectImage/currentImage/
// project.images state Image Navigation's own Previous/Next buttons
// already drive (see navigateByGestureRef below) -- this is not a second
// navigation system, just two more ways to trigger the one that already
// exists. Thresholds are deliberate, not defaults, so a gesture reads as
// a real, purposeful swipe, never a hair-trigger on a small vertical
// scroll or an incidental diagonal wheel delta.
//
// TOUCH_SWIPE_MIN_DISTANCE_PX: how far a touch must travel horizontally,
// start to end, before it counts as a swipe at all -- filters out taps
// and short accidental drags/thumb repositioning.
// TOUCH_HORIZONTAL_DOMINANCE_RATIO: horizontal travel must exceed
// vertical travel by this factor for the whole gesture to count as a
// swipe rather than a vertical scroll or diagonal drag -- permissive
// enough for a natural, not-perfectly-straight swipe, strict enough to
// firmly reject anything closer to vertical.
const TOUCH_SWIPE_MIN_DISTANCE_PX = 48;
const TOUCH_HORIZONTAL_DOMINANCE_RATIO = 1.5;

// WHEEL_HORIZONTAL_TRIGGER_PX: how large a single wheel event's own
// deltaX must be, once it already dominates deltaY, before it counts as
// the start of a deliberate trackpad swipe -- filters out the small
// incidental deltaX noise an otherwise-vertical scroll can carry.
// WHEEL_LOCKOUT_MS: once a swipe has navigated, further qualifying wheel
// events are ignored for this long -- long enough to span the rest of
// one continuous two-finger trackpad gesture's own rapid burst of wheel
// events (a single physical swipe fires many in quick succession), short
// enough that a genuinely new, separate swipe a moment later isn't
// blocked. This is what turns "one physical swipe" into "one image
// change" for trackpad input, the same guarantee touchend's own
// once-per-lift firing already gives touch input for free.
const WHEEL_HORIZONTAL_TRIGGER_PX = 24;
const WHEEL_LOCKOUT_MS = 500;

// Invisible native-scroll-container experiment (real-scroll-container
// trackpad pass): a genuine, empty, transparent horizontal scroll
// container laid over the image viewport, whose only purpose is to give
// desktop trackpad gestures a real local scroll surface to belong to --
// see this file's own comment further down, at the effect that drives
// it, for the full mechanism and why the earlier wheel-delta approaches
// (checkpoint wheel handler, then an early-preventDefault containment
// layer) couldn't reliably stop Safari from claiming the opposite swipe
// as its own back/forward gesture: `overscroll-behavior-x` is defined
// for scroll containers, and `.project-image-column` was never actually
// one -- the CSS Overscroll Behavior spec requires a non-scroll-container
// element to accept but silently ignore the property.
//
// This is strictly additive to the checkpoint touch/wheel systems above
// (both untouched, unmodified, still fully intact) -- it exists
// alongside them, gated to mount only on a device that actually has a
// trackpad/mouse-class pointer, never replacing wheel or touch.
//
// useIsHoverCapableInput: mirrors App.jsx's own useIsTouchDevice() hook
// exactly in shape (a live matchMedia query, same change-event wiring)
// but reimplemented locally rather than imported, to keep this
// experiment's footprint confined to Project interaction files only --
// App.jsx is explicitly out of scope for this pass. `(hover: hover) and
// (pointer: fine)` is the direct, standard feature-detection query for
// "this device has a real hover-capable, precise pointer" (a trackpad or
// mouse) -- the positive form of App.jsx's own touch-primary query,
// chosen here (rather than negating that query) since it's what this
// hook is actually asking. A touch-primary device (no real hover, coarse
// pointer) returns false and never mounts the scroll-container surface
// below -- it keeps using the existing touch recognizer above instead.
function useIsHoverCapableInput() {
  const HOVER_CAPABLE_QUERY = "(hover: hover) and (pointer: fine)";
  const [isHoverCapable, setIsHoverCapable] = useState(() => {
    if (typeof window === "undefined" || !window.matchMedia) return false;
    return window.matchMedia(HOVER_CAPABLE_QUERY).matches;
  });

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return undefined;
    const mediaQueryList = window.matchMedia(HOVER_CAPABLE_QUERY);
    const handleChange = (event) => setIsHoverCapable(event.matches);
    mediaQueryList.addEventListener("change", handleChange);
    return () => mediaQueryList.removeEventListener("change", handleChange);
  }, []);

  return isHoverCapable;
}

export default function ProjectTemplate({ slug, imageId }) {
  const [isIndexDrawerOpen, setIsIndexDrawerOpen] = useState(false);
  const [indexDrawerHeight, setIndexDrawerHeight] = useState(0);
  const [isInfoOpen, setIsInfoOpen] = useState(false);

  const project = useMemo(() => getProjectBySlug(slug), [slug]);

  // Seeded once from the URL's ?image= param on mount (or remount, on a
  // slug change) via resolveInitialImageId -- this is what preserves the
  // visitor's context from the homepage click. After that, Image
  // Navigation updates this directly; it doesn't re-derive from the URL on
  // every render, since the URL is kept in sync as a side effect of
  // selection, not the other way around (see handleSelectImage below).
  const [currentImageId, setCurrentImageId] = useState(() =>
    resolveInitialImageId(project, imageId),
  );

  // Trails currentImageId (Josh review, final correction pass): starts
  // equal to it (nothing stale to contradict on first paint), and only
  // catches up once handleImageLoaded fires -- see this file's own top
  // comment ("Selected vs. displayed image") for why this exists.
  const [displayedImageId, setDisplayedImageId] = useState(currentImageId);

  // Adjacent-image preload ("holds the previous picture too long" fix,
  // Josh review): frame-by-frame comparison against the reference site's
  // own recording ruled out the crossfade's duration/easing as the
  // cause -- measured directly from both recordings' pixel data, this
  // site's 400ms ease-in-out curve is already a close match to the
  // reference's own curve shape. What actually differed was a real,
  // measurable gap (roughly 200ms in the reference recording used to
  // diagnose this) between the click and any visible change starting at
  // all: ImageViewer's incoming layer can't begin fading in until its
  // <img> has actually finished fetching + decoding the next photo (see
  // ImageViewer.jsx's own onLoad-gated reveal), and nothing before this
  // fix ever requested that photo before the visitor clicked. The old
  // image just sat fully static for however long that fetch took, on top
  // of the fade's own 400ms -- which is what read as "holding" it. This
  // warms the browser's HTTP cache for exactly the two images Image
  // Navigation's Previous/Next targets can jump to next (the same
  // images[selectedIndex -1 / +1] pair ImageNavigation.jsx computes,
  // recomputed here independently rather than threaded through props,
  // since this effect only needs the array + index, not any rendering
  // concern), at the same 1200px-width variants ImageViewer's own
  // <picture> can select (both jpg and webp, since which one the browser
  // actually picks depends on content negotiation this plain Image()
  // request can't replicate -- preloading both costs two extra requests
  // per neighbor but guarantees a real cache hit either way, versus
  // guessing wrong and paying for the fetch twice). Runs off
  // currentImageId, not displayedImageId, so the neighbor pair updates
  // immediately on every click rather than waiting for the current
  // photo's own fade to finish first -- keeping whatever's now adjacent
  // warm as early as possible, including during a fast run of repeated
  // clicks.
  useEffect(() => {
    if (!project) return undefined;
    const index = project.images.findIndex(
      (item) => item.archiveNumber === currentImageId,
    );
    if (index === -1) return undefined;
    const neighbors = [
      project.images[index - 1],
      project.images[index + 1],
    ].filter(Boolean);
    // De-duplicated via Set: for a live Sanity asset, getOptimizedImageSrc
    // ignores the extension argument entirely (buildSanityImageUrl uses
    // .auto("format") so Sanity's CDN picks the format itself) -- the
    // webp/jpg calls below would otherwise resolve to the exact same URL
    // and fire the identical request twice. For a local asset the two
    // calls genuinely differ, and both survive the dedupe untouched.
    const preloads = new Set(
      neighbors.flatMap((neighbor) => [
        getOptimizedImageSrc(neighbor.image, 1200, "webp"),
        getOptimizedImageSrc(neighbor.image, 1200, "jpg"),
      ]),
    );
    // Kept alive for the request's own lifetime -- an Image object with
    // no other reference can be garbage collected mid-fetch in some
    // engines, which would abort the very request this effect exists to
    // start. Not cleaned up early on deps change/unmount: an in-flight or
    // already-cached fetch is still worth letting finish (e.g. a
    // Previous click back to an image whose preload is still warming),
    // and Image has no real cancel short of reassigning .src, which
    // itself just starts another request.
    preloads.forEach((src) => {
      const img = new Image();
      img.src = src;
    });
  }, [project, currentImageId]);

  // The image column's own DOM node, for the native touch/wheel
  // listeners below -- attached via a real addEventListener (not React's
  // onTouchMove/onWheel props, which React registers as passive by
  // default) specifically so preventDefault actually works on the one
  // qualifying event per gesture that needs it (see the effect below).
  const imageColumnRef = useRef(null);

  // Always the latest "advance by one image in this direction" callback,
  // read fresh by the gesture listeners below (attached once, on mount)
  // -- the same "read the ref, never a stale closure" shape
  // ImageViewer.jsx's own imageRef already uses, so the listeners never
  // need to be torn down and re-attached as currentImageId/project
  // change. Reassigned on every render, just below, once currentImage/
  // handleSelectImage exist.
  const navigateByGestureRef = useRef(() => {});

  // Desktop-trackpad-only gate for the invisible scroll-container
  // surface below -- see useIsHoverCapableInput's own comment.
  const isHoverCapableInput = useIsHoverCapableInput();

  // Mobile/touch tap-to-toggle Info pass: the exact inverse of
  // isHoverCapableInput above, not a new detector -- reusing this file's
  // own existing capability signal rather than introducing a second one
  // (App.jsx's separate useIsTouchDevice is deliberately left alone, per
  // this pass's own scope). Gates two plain onClick handlers below (the
  // image column, and ProjectInfoPanel's own container): tap the image
  // to open Info, tap the open Info overlay to close it, in addition to
  // -- never instead of -- the existing Info icon and the existing
  // single-X control (ProjectBreadcrumb.jsx, completely untouched by
  // this pass). undefined on any fine-pointer/hover-capable device, so
  // desktop's onClick props below are simply absent, not just inert.
  const isTouchProjectInteraction = !isHoverCapableInput;

  // The invisible scroll container's own DOM node (a real
  // `overflow-x: auto` element, rendered conditionally below), plus the
  // small amount of state its settle-detection effect needs. Kept
  // completely separate from imageColumnRef/navigateByGestureRef's own
  // touch/wheel effect above -- two independent input systems, not one
  // shared one, per this experiment's own design.
  const trackpadScrollerRef = useRef(null);

  // True for the brief window between this code programmatically
  // resetting the scroller back to its center snap point and that reset's
  // own scroll/scrollend event(s) actually landing -- both fire
  // asynchronously (the next frame, in every engine tested), never in the
  // same tick as the scrollLeft assignment that causes them. Without this
  // guard, the recenter's own scroll would be indistinguishable from a
  // genuine new gesture and could trigger a second, unwanted navigation.
  const isRecenteringTrackpadScrollerRef = useRef(false);

  // Only used by the debounced-scroll fallback path, for engines without
  // a native `scrollend` event (see the effect below).
  const trackpadSettleTimeoutRef = useRef(null);

  useEffect(() => {
    const node = imageColumnRef.current;
    if (!node) return undefined;

    // --- Touch: evaluated once, at touchend -- exactly like a single
    // deliberate press of the existing Previous/Next controls -- never a
    // running per-frame decision, so a slow or wandering drag still only
    // ever fires (at most) once per finger contact ("one gesture = one
    // image change"). Pinch/multi-touch is ignored outright (not a
    // navigation gesture). ---
    let touchStartX = 0;
    let touchStartY = 0;
    let touchActive = false;
    let touchLockedHorizontal = false;

    const onTouchStart = (event) => {
      if (event.touches.length !== 1) {
        touchActive = false;
        return;
      }
      touchActive = true;
      touchLockedHorizontal = false;
      touchStartX = event.touches[0].clientX;
      touchStartY = event.touches[0].clientY;
    };

    const onTouchMove = (event) => {
      if (!touchActive || event.touches.length !== 1) return;
      const dx = event.touches[0].clientX - touchStartX;
      const dy = event.touches[0].clientY - touchStartY;
      // Swipe-lock: only claim the gesture as horizontal -- and only
      // then suppress the page's own vertical scroll -- once it has
      // ALREADY moved enough, and already clearly enough sideways, to
      // be confident. Never on the first few pixels of any touch, which
      // is what keeps ordinary vertical scrolling working normally for
      // every touch that isn't a real horizontal swipe.
      if (
        !touchLockedHorizontal &&
        Math.abs(dx) > 10 &&
        Math.abs(dx) > Math.abs(dy) * TOUCH_HORIZONTAL_DOMINANCE_RATIO
      ) {
        touchLockedHorizontal = true;
      }
      if (touchLockedHorizontal) {
        event.preventDefault();
      }
    };

    const onTouchEnd = (event) => {
      if (!touchActive) return;
      touchActive = false;
      const touch = event.changedTouches[0];
      if (!touch) return;
      const dx = touch.clientX - touchStartX;
      const dy = touch.clientY - touchStartY;
      if (
        Math.abs(dx) >= TOUCH_SWIPE_MIN_DISTANCE_PX &&
        Math.abs(dx) > Math.abs(dy) * TOUCH_HORIZONTAL_DOMINANCE_RATIO
      ) {
        // Swipe left (finger travels right-to-left, dx negative) reveals
        // the next photo -- the same left=forward convention every
        // mobile photo gallery already uses.
        navigateByGestureRef.current(dx < 0 ? "next" : "prev");
      }
    };

    const onTouchCancel = () => {
      touchActive = false;
      touchLockedHorizontal = false;
    };

    // --- Trackpad: a real two-finger horizontal swipe fires a rapid
    // burst of wheel events, all carrying deltaX -- only the first
    // qualifying tick in that burst navigates; WHEEL_LOCKOUT_MS ignores
    // the rest, which is what keeps one physical swipe from racing
    // through several images. A plain vertical mouse wheel never
    // populates deltaX, so it can never reach the preventDefault/
    // navigate branch below -- ordinary vertical scrolling is
    // unaffected by construction, not by a special case for it. ---
    let wheelLockedUntil = 0;

    const onWheel = (event) => {
      const absX = Math.abs(event.deltaX);
      const absY = Math.abs(event.deltaY);
      if (absX <= absY || absX < WHEEL_HORIZONTAL_TRIGGER_PX) {
        // Not predominantly horizontal, or too small to be a deliberate
        // swipe tick -- an ordinary vertical/diagonal scroll, left
        // completely untouched (no preventDefault, no navigation).
        return;
      }
      // From here this event IS a qualifying horizontal swipe tick --
      // always prevent its default (stops some browsers' own
      // horizontal-swipe-as-back/forward-navigation gesture from firing
      // underneath this), but only actually change the image if not
      // still inside a previous swipe's own lockout window.
      event.preventDefault();
      const now = Date.now();
      if (now < wheelLockedUntil) return;
      wheelLockedUntil = now + WHEEL_LOCKOUT_MS;
      // Same forward-direction convention as deltaY's own down-equals-
      // forward scroll semantics: deltaX > 0 (content pulled leftward,
      // revealing what's to the right) advances to the next photo.
      navigateByGestureRef.current(event.deltaX > 0 ? "next" : "prev");
    };

    node.addEventListener("touchstart", onTouchStart, { passive: true });
    node.addEventListener("touchmove", onTouchMove, { passive: false });
    node.addEventListener("touchend", onTouchEnd, { passive: true });
    node.addEventListener("touchcancel", onTouchCancel, { passive: true });
    node.addEventListener("wheel", onWheel, { passive: false });

    return () => {
      node.removeEventListener("touchstart", onTouchStart);
      node.removeEventListener("touchmove", onTouchMove);
      node.removeEventListener("touchend", onTouchEnd);
      node.removeEventListener("touchcancel", onTouchCancel);
      node.removeEventListener("wheel", onWheel);
    };
  }, []);

  // Invisible native-scroll-container settle-detection (real-scroll-
  // container trackpad pass): a completely separate effect from the
  // touch/wheel one above -- attaches to trackpadScrollerRef's own node
  // (not imageColumnRef), and only runs at all once isHoverCapableInput
  // is true, so a touch-primary device never even creates this listener.
  // Deliberately NOT a custom wheel/deltaX handler: this container is a
  // genuine `overflow-x: auto` scroll surface with 3 equal-width pages
  // (index 0 = previous, 1 = center/at-rest, 2 = next) and
  // `scroll-snap-type: x mandatory` (see styles.css), so the browser's
  // own native scroll physics decide when a gesture has "settled" --
  // this effect only reads where it settled and translates that into
  // exactly one semantic previous/next request, via the exact same
  // navigateByGestureRef the touch/wheel effect above already uses.
  useEffect(() => {
    if (!isHoverCapableInput) return undefined;
    const node = trackpadScrollerRef.current;
    if (!node) return undefined;

    const CENTER_INDEX = 1;

    // Moves the scroller back to its center page without visually
    // animating (an instant scrollLeft assignment, not scrollTo with
    // smooth behavior) -- recentering is bookkeeping for the next
    // gesture, never something the visitor should see or feel. No-ops,
    // and deliberately does NOT arm the recentering guard, when the
    // scroller is already sitting on the center page (its own initial
    // mount state, or a ResizeObserver firing with nothing to correct)
    // -- assigning scrollLeft to its own current value fires no
    // scroll/scrollend event in any engine tested, so arming the guard
    // in that case would leave it stuck true forever with nothing left
    // to ever clear it.
    const recenter = () => {
      const pageWidth = node.clientWidth;
      if (!pageWidth) return;
      const target = pageWidth * CENTER_INDEX;
      if (Math.round(node.scrollLeft) === target) {
        isRecenteringTrackpadScrollerRef.current = false;
        return;
      }
      isRecenteringTrackpadScrollerRef.current = true;
      node.scrollLeft = target;
      // Defensive-only fallback: if for any reason this engine never
      // fires a scroll/scrollend event for this assignment (observed
      // nowhere in sandbox testing, but the real-Mac WebKit gesture
      // pipeline is exactly the thing this whole pass can't fully
      // verify outside real hardware), don't leave the guard armed
      // forever -- self-clear shortly after. A genuine next gesture
      // arriving in this same short window is vanishingly unlikely
      // (it would require a new swipe to start within milliseconds of
      // the programmatic recenter), and even then the worst case is
      // one swallowed gesture, not a stuck scroller.
      window.setTimeout(() => {
        isRecenteringTrackpadScrollerRef.current = false;
      }, 200);
    };

    // Start centered. clientWidth can legitimately be 0 on the very
    // first paint (layout not yet committed) -- recenter() already
    // no-ops safely in that case, and the ResizeObserver below re-fires
    // once real layout lands, which recenters for real at that point.
    recenter();

    const handleSettle = () => {
      if (isRecenteringTrackpadScrollerRef.current) {
        // This settle is the recenter's own scroll landing, not a new
        // gesture -- consume the guard and stop. Never treat a
        // programmatic recenter as a navigation request.
        isRecenteringTrackpadScrollerRef.current = false;
        return;
      }
      const pageWidth = node.clientWidth;
      if (!pageWidth) return;
      const settledIndex = Math.round(node.scrollLeft / pageWidth);
      if (settledIndex === CENTER_INDEX) {
        // Settled back where it started (e.g. a gesture that didn't
        // travel far enough to cross the snap point, or a vertical-
        // only gesture that never should have reached here at all) --
        // no navigation, and nothing to recenter either.
        return;
      }
      // Same forward-direction convention the checkpoint wheel handler
      // above already uses: settling toward the higher-index (next)
      // page advances forward; settling toward index 0 (previous) goes
      // back. This is always safe to call even at a Project boundary --
      // navigateByGestureRef.current() itself is a no-op when there's
      // no neighboring image in that direction (see its own definition
      // below, in the component body) -- so the invisible scroller
      // still recenters normally either way, per this experiment's own
      // "always keep both directions locally available" requirement.
      navigateByGestureRef.current(settledIndex > CENTER_INDEX ? "next" : "prev");
      // rAF, not immediate: lets the browser finish committing this
      // settle before this code moves the scroll position again --
      // recentering in the very same tick risked being coalesced with
      // (or racing) the settle it's responding to.
      requestAnimationFrame(recenter);
    };

    const supportsScrollEnd = "onscrollend" in window;
    const handleScrollFallback = () => {
      if (trackpadSettleTimeoutRef.current) {
        window.clearTimeout(trackpadSettleTimeoutRef.current);
      }
      // Debounced stand-in for `scrollend` in engines that don't fire
      // it: only fires once no further `scroll` events have arrived for
      // 120ms, which is what makes it a "settle" detector rather than a
      // per-frame one -- a fast multi-tick gesture only evaluates once,
      // after it actually stops.
      trackpadSettleTimeoutRef.current = window.setTimeout(handleSettle, 120);
    };

    if (supportsScrollEnd) {
      node.addEventListener("scrollend", handleSettle);
    } else {
      node.addEventListener("scroll", handleScrollFallback, { passive: true });
    }

    // Keeps the scroller centered across layout changes (a viewport
    // resize, a sidebar/info-panel toggle that changes .project-image-
    // column's own width) without ever treating the correction itself
    // as a gesture -- recenter() already guards against firing a
    // navigation for a no-op assignment, and arms the same
    // isRecenteringTrackpadScrollerRef guard when it does need to move.
    const resizeObserver = new ResizeObserver(() => {
      recenter();
    });
    resizeObserver.observe(node);

    return () => {
      if (supportsScrollEnd) {
        node.removeEventListener("scrollend", handleSettle);
      } else {
        node.removeEventListener("scroll", handleScrollFallback);
      }
      resizeObserver.disconnect();
      if (trackpadSettleTimeoutRef.current) {
        window.clearTimeout(trackpadSettleTimeoutRef.current);
      }
    };
  }, [isHoverCapableInput]);

  // Cursor-tracking pass (visual-affordance refinement, replaces the
  // earlier static pointer + tiny-chevron cursor outright): swaps which
  // of the two directional chevron cursors is showing based purely on
  // which horizontal half of the ACTUAL PHOTOGRAPH -- not this column,
  // not the invisible scroller's own box, which can be wider than the
  // photo actually renders whenever its aspect ratio doesn't fill the
  // frame -- the pointer currently sits over. A completely separate,
  // small effect from the settle-detection one above: different event
  // types entirely (pointerenter/pointermove here vs. scroll/scrollend
  // there), so neither can interfere with the other. Deliberately just
  // a synchronous mousemove -> getBoundingClientRect() -> classList
  // toggle -- no DOM element tracks the pointer, no requestAnimationFrame
  // loop, no CSS transition on the cursor itself (a cursor image swap is
  // atomic; there's nothing to animate) -- the browser's own per-frame
  // cursor compositing is what makes this feel immediate, not this code.
  useEffect(() => {
    const node = trackpadScrollerRef.current;
    if (!node) return undefined;

    // Project Info overlay fix: ProjectInfoPanel (isOpen=isInfoOpen) is a
    // fully opaque layer that covers exactly this same image box while
    // open (see .project-info-panel's own comment in styles.css) -- so
    // clearing both cursor classes up front, and skipping listener
    // attachment entirely while isInfoOpen is true, is what keeps the
    // directional chevron (and, below, click-to-navigate) from ever
    // applying to the overlay. isInfoOpen is a dependency of this effect,
    // so it re-runs the moment the overlay opens or closes -- a cursor
    // already showing at the instant the overlay opens is cleared
    // immediately rather than lingering until the next pointermove.
    node.classList.remove(
      "project-trackpad-scroller--cursor-prev",
      "project-trackpad-scroller--cursor-next",
    );
    // Surgical Project Info Scroll Debug -- confirmed root cause (see
    // styles.css's own comment on .project-trackpad-scroller--inert):
    // this element's explicit z-index: 1 escapes .project-viewer/
    // .project-image-column (neither sets a z-index of its own, so
    // neither creates a stacking context), so it was painting -- and
    // therefore hit-testing, for wheel/click/touch alike -- ABOVE
    // .project-info-panel while open, silently swallowing every gesture
    // meant for the Info panel's own scrollable content even though it
    // is completely invisible (background: transparent). Toggled here,
    // not as a new effect: this effect already runs on every isInfoOpen
    // change and already exists specifically to neutralize this same
    // element while Info is open (see its own header comment on the
    // cursor classes just above and the click-to-navigate guard below).
    // `pointer-events: none` removes it from hit-testing entirely without
    // unmounting it, so the settle-detection effect's own ResizeObserver/
    // scrollend listeners (a separate effect, deliberately depending only
    // on [isHoverCapableInput] and never re-running on isInfoOpen -- see
    // its own comment) keep pointing at the same live node the whole
    // time; nothing about Project image trackpad navigation while Info
    // is CLOSED changes at all.
    node.classList.toggle("project-trackpad-scroller--inert", isInfoOpen);
    if (!isHoverCapableInput || isInfoOpen) return undefined;

    // The always-present base <img> (see ImageViewer.jsx's own
    // .project-image-frame__inner) -- deliberately NOT the incoming
    // fade overlay's own <img> (a sibling of .project-image-frame__inner
    // under .project-image-frame, never nested inside it, so this
    // selector can never match it) -- this is read-only, ImageViewer.jsx
    // itself is never touched by this or any other pass.
    const getImageRect = () => {
      const img = imageColumnRef.current?.querySelector(
        ".project-image-frame__inner .project-image-frame__img",
      );
      return img ? img.getBoundingClientRect() : null;
    };

    const getDirectionForClientX = (clientX) => {
      const rect = getImageRect();
      if (!rect || rect.width === 0) return null;
      const midpointX = rect.left + rect.width / 2;
      return clientX < midpointX ? "prev" : "next";
    };

    const applyCursorForClientX = (clientX) => {
      const direction = getDirectionForClientX(clientX);
      if (!direction) return;
      // classList.toggle's boolean-force form is a no-op when the class
      // already matches that state -- this never forces a write (or a
      // cursor re-decode) on every single mousemove tick, only on an
      // actual left/right half change.
      node.classList.toggle("project-trackpad-scroller--cursor-prev", direction === "prev");
      node.classList.toggle("project-trackpad-scroller--cursor-next", direction === "next");
    };

    // Handled on pointerenter (using that event's own clientX) as well
    // as pointermove, so the correct chevron is already showing from the
    // very first frame the pointer is over the surface, rather than
    // waiting on a first move to establish it.
    const onPointerEnter = (event) => applyCursorForClientX(event.clientX);
    const onPointerMove = (event) => applyCursorForClientX(event.clientX);

    // Click-to-navigate (Project Info overlay fix): reuses the exact
    // same navigateByGestureRef wheel/touch/trackpad-settle already call
    // (see this file's own Image swipe/trackpad navigation comment) --
    // not a new navigation system, just one more trigger for the
    // existing one, sharing the same left/right-half math the chevron
    // cursor above already computes. Only ever attached once the
    // isInfoOpen guard above has already passed, so it can never fire
    // while the overlay is open.
    const onClick = (event) => {
      const direction = getDirectionForClientX(event.clientX);
      if (!direction) return;
      navigateByGestureRef.current(direction);
    };

    node.addEventListener("pointerenter", onPointerEnter);
    node.addEventListener("pointermove", onPointerMove);
    node.addEventListener("click", onClick);

    return () => {
      node.removeEventListener("pointerenter", onPointerEnter);
      node.removeEventListener("pointermove", onPointerMove);
      node.removeEventListener("click", onClick);
    };
  }, [isHoverCapableInput, isInfoOpen]);

  if (!project) {
    return (
      <div className="about-page">
        <Header
          onFilterOpenChange={setIsIndexDrawerOpen}
          onDrawerHeightChange={setIndexDrawerHeight}
        />
        <main className="about-content">
          <h1 className="visually-hidden">Project not found</h1>
          <ProjectBreadcrumb />
          <p className="project-not-found">Project not found.</p>
        </main>
      </div>
    );
  }

  const currentImage =
    project.images.find((item) => item.archiveNumber === currentImageId) ??
    project.images[0] ??
    null;

  // Falls back to currentImage (not null) if displayedImageId doesn't
  // resolve to anything in the current project's image list -- e.g. a
  // slug change mid-transition, where a stale displayedImageId from the
  // previous project can't be found in the new one. currentImage is
  // always resolvable at this point (see above), so this can never be
  // null when currentImage isn't.
  const displayedImage =
    project.images.find((item) => item.archiveNumber === displayedImageId) ??
    currentImage;

  // Used by both the initial-load resolution above and by Image
  // Navigation (ImageNavigation.jsx) -- selecting an image updates the
  // requested/current state immediately (so ImageViewer starts loading it
  // right away) and separately syncs the URL's ?image= param, so a
  // refresh or a shared link reproduces the same image without depending
  // on the Router re-rendering this component (it won't: the pathname
  // doesn't change, only the query string, so this instance just keeps
  // its own state authoritative and the URL update is one-way).
  // Deliberately does not touch isInfoOpen -- changing images must never
  // open or close the Project Information panel, per the redesign's
  // explicit "metadata open while changing images" test case. Does not
  // touch displayedImageId either -- see handleImageLoaded below for what
  // does.
  const handleSelectImage = (archiveNumber) => {
    setCurrentImageId(archiveNumber);
    navigate(`/projects/${project.slug}?image=${archiveNumber}`);
  };

  // Project Image Carousel -- Loop at Ends pass: this is the single
  // shared navigation path every gesture already funnels through (wheel/
  // trackpad-swipe, touch-swipe, trackpad-settle, and click-to-navigate
  // via the directional cursor -- see this file's own "Image swipe/
  // trackpad navigation" comment above and the click-to-navigate comment
  // near the cursor logic), so wrapping it here is the one change that
  // covers all of them with nothing duplicated. Previously: `target` was
  // simply project.images[index +/- 1], which is undefined past either
  // end, and the very next line's `if (!target) return` silently no-opped
  // -- correct "stop at the ends" behavior for a non-looping carousel, but
  // it meant the directional cursor (which always shows a prev/next
  // chevron based purely on cursor position, never on whether a target
  // exists -- see getDirectionForClientX above, intentionally untouched)
  // could show a chevron that did nothing at the first/last image. Simple
  // modulo index normalization removes that dead-end entirely: `next`
  // past the last image wraps to index 0, `prev` before the first wraps
  // to the last index, so a target always exists and handleSelectImage
  // always fires -- no more `if (!target) return`. Nothing else about
  // this function changed: same findIndex lookup, same handleSelectImage
  // call (which is itself untouched -- fade timing/overlap lives entirely
  // in ImageViewer.jsx's own crossfade state machine, never referenced
  // here).
  navigateByGestureRef.current = (direction) => {
    const total = project.images.length;
    if (total === 0) return;
    const index = project.images.findIndex(
      (item) => item.archiveNumber === currentImage.archiveNumber,
    );
    if (index === -1) return;
    const targetIndex =
      direction === "next" ? (index + 1) % total : (index - 1 + total) % total;
    handleSelectImage(project.images[targetIndex].archiveNumber);
  };

  // Wired to ImageViewer's onImageLoaded -- fires once the currently
  // requested image has actually finished loading. Guarded against
  // stale/out-of-order firing (Josh review, final correction pass): only
  // accepted if it still matches whatever's currently requested, so a
  // late-arriving load event for an image the visitor has since navigated
  // away from can never regress the display backwards. In the normal
  // case this guard never trips -- changing an <img>'s src already
  // cancels its previous in-flight request -- but it costs nothing to be
  // certain the visible number can never contradict the visible photo.
  const handleImageLoaded = (archiveNumber) => {
    if (archiveNumber === currentImageId) {
      setDisplayedImageId(archiveNumber);
    }
  };

  // Shared by ProjectInfoTrigger (the +/X control) and ProjectArchiveIndex
  // (the clickable archive number) -- Josh review, final polish pass: the
  // archive number now opens/closes the same Project Information panel
  // the +/X control does, and must use this exact function reference for
  // both so there is one open/closed boolean with two entry points, never
  // two independently tracked accordion states.
  const handleToggleInfo = () => setIsInfoOpen((open) => !open);

  return (
    <div className="about-page">
      <Header
        onFilterOpenChange={setIsIndexDrawerOpen}
        onDrawerHeightChange={setIndexDrawerHeight}
      />

      <main
        className={`about-content project-content${
          isIndexDrawerOpen ? " scroll-container--drawer-open" : ""
        }`}
        style={{
          // margin-top, not transform: on a child page the drawer stays
          // open for the whole visit (see Header.jsx), so this offset is
          // steady-state, not a brief animated toggle -- transform's per-
          // frame compositing cost, paid the whole time the page is open,
          // is what caused child-page scrolling to regress. margin-top
          // adds to this element's own existing padding-top via normal
          // document flow (no calc()/clamp duplication needed) and, with
          // no transition declared on it, changes apply instantly rather
          // than animating -- consistent with Menu no longer being a
          // brief, animated interaction here. The homepage keeps its own
          // transform-based push untouched (see App.jsx): Filter/Menu are
          // genuinely frequent, animated toggles there.
          marginTop: indexDrawerHeight
            ? `${Math.round(indexDrawerHeight) + 8}px`
            : undefined,
        }}
      >
        {/* Accessibility Implementation Pass: ProjectHeader.jsx (which
            used to render this page's own visible <h1>) was retired from
            this template a while back (see this file's own top comment)
            and nothing replaced it, so individual Project pages had no
            real page-level heading at all. Real Project data already in
            scope here (project.title) -- not fabricated -- rendered
            visually-hidden so it doesn't perceptibly change the approved
            image-first composition. */}
        <h1 className="visually-hidden">{project.title}</h1>
        <ProjectBreadcrumb
          isInfoOpen={isInfoOpen}
          onToggleInfo={handleToggleInfo}
        />
        {currentImage ? (
          // Josh review, final correction pass: a Fragment, not a single
          // wrapper div, since Image Navigation/the Archive Number are no
          // longer nested inside .project-image-column -- imageNavRow is
          // now a structural sibling of .project-viewer (see this file's
          // own top comment for why), not a descendant of it.
          <>
            {/* No open/closed modifier class on this wrapper itself --
                the open/close styling lives entirely on ProjectInfoPanel's
                own .project-info-panel--open (driven by the same
                `isInfoOpen` state), so .project-viewer only ever needs
                its one, constant flex-row rule (see styles.css). */}
            <div className="project-viewer">
              <div
                className="project-image-column"
                ref={imageColumnRef}
                // Mobile/touch tap-to-toggle Info pass: only ever wired
                // when isTouchProjectInteraction is true (undefined
                // otherwise -- see that const's own comment), and only
                // ever actually reachable while Info is closed: the
                // opaque Info overlay (.project-info-panel) covers this
                // entire column while open and only THEN gains
                // pointer-events (see that rule's own styles.css
                // comment), so a tap that lands here at all is already,
                // structurally, a tap on the image. The `!isInfoOpen`
                // guard is still explicit here rather than relied on
                // implicitly, matching this pass's own "tap the image to
                // open, tap Info to close" one-directional design.
                // Native browser click-suppression after a real swipe
                // (this same node's own touchstart/touchmove/touchend
                // listeners above, unmodified) is what already keeps a
                // genuine Prev/Next swipe from ever reaching this
                // handler -- see that effect's own comment; nothing
                // added here changes it.
                onClick={
                  isTouchProjectInteraction && !isInfoOpen
                    ? handleToggleInfo
                    : undefined
                }
              >
                <ImageViewer
                  image={currentImage}
                  displayedImage={displayedImage}
                  onImageLoaded={handleImageLoaded}
                />
                {isHoverCapableInput && (
                  /* Invisible native-scroll-container experiment -- input
                     surface only, see this file's own top comment
                     (useIsHoverCapableInput) and the settle-detection
                     effect above for the full mechanism. Renders no
                     visible content, never touches ImageViewer's own
                     layout, sizing, or fade -- absolutely positioned
                     (inset: 0) over this column, which is why
                     .project-image-column now also carries
                     `position: relative` (see styles.css). aria-hidden:
                     it's a pointer/trackpad input surface, not content --
                     screen readers already reach Previous/Next via the
                     existing, unrelated Image Navigation controls. */
                  <div
                    className="project-trackpad-scroller"
                    ref={trackpadScrollerRef}
                    aria-hidden="true"
                  >
                    <div className="project-trackpad-scroller__page" />
                    <div className="project-trackpad-scroller__page" />
                    <div className="project-trackpad-scroller__page" />
                  </div>
                )}
              </div>

              <ProjectInfoPanel
                project={project}
                image={currentImage}
                isOpen={isInfoOpen}
                // Mobile/touch tap-to-toggle Info pass: mirrors the
                // image column's own onClick immediately above -- only
                // wired on touch, undefined (no-op) on desktop. Only
                // ever reachable while isOpen is true, for the same
                // pointer-events reason documented at the image column's
                // own onClick, so this is unconditionally "close" in
                // practice; see ProjectInfoPanel.jsx's own comment for
                // how it protects real links/controls inside the
                // content from being swallowed by this same tap.
                onTap={isTouchProjectInteraction ? handleToggleInfo : undefined}
              />
            </div>

            <div className="project-image-nav-row">
              {/* Icon + position refinement (Josh review, second pass):
                  the Project Information trigger now lives here, at the
                  row's own far-left column, instead of overlaid on the
                  image via ImageViewer's old `overlay` slot -- see
                  ProjectInfoPanel.jsx's own top comment. Still the exact
                  same isInfoOpen/handleToggleInfo pair ProjectArchiveIndex
                  already shares below, so there is still exactly one
                  open/closed boolean with multiple entry points, never
                  independently tracked state. */}
              <ProjectInfoTrigger
                isOpen={isInfoOpen}
                onToggle={handleToggleInfo}
              />
              <ProjectArchiveIndex
                archiveNumber={displayedImage.archiveNumber}
                isOpen={isInfoOpen}
                onToggle={handleToggleInfo}
              />
              <ImageNavigation
                images={project.images}
                selectedImage={currentImage}
                displayedImage={displayedImage}
                onSelectImage={handleSelectImage}
              />
            </div>
          </>
        ) : (
          <p className="project-not-found">
            This project has no visible images yet.
          </p>
        )}

      </main>
    </div>
  );
}
