import { useEffect, useMemo, useRef } from "react";
import { findRelatedArchiveItems } from "./relationshipEngine";
import { hapticSelect } from "./haptics";
// Content layer seam (Frontend <-> CMS handshake, Phase 1): no longer a
// direct import of the mock data file -- see src/content/. Today
// getArchiveItems() is a pure passthrough to the same mock array, so
// behavior here is unchanged.
import { getArchiveItems } from "./content";

// HoverOverlay -- presentation, plus stable per-generation randomization of
// theme order.
//
// A reusable, purely presentational component: given an image's metadata,
// it renders a translucent metadata layer sized to fill its parent exactly.
// Its own visibility is still driven entirely by CSS
// (`.gallery-image-wrapper:hover .hover-overlay`, see styles.css) -- that
// compositor-only opacity fade is untouched, still fully decoupled from the
// animation-frame loop that drives the archive itself, and never re-runs
// just because this component re-renders. The only requirement of the
// parent is that it already be a positioned element this component can
// fill via inset: 0, which .gallery-image-wrapper already is.
//
// Relationship trigger, metadata-driven (moved off image hover in this
// commit): earlier, simply hovering the image fired a Relationship Engine
// query automatically. Now the image hover only ever reveals this card
// (still pure CSS, untouched) -- querying the engine is the job of the
// individual theme elements rendered below, each with its own
// onMouseEnter/onMouseLeave. .hover-overlay itself keeps pointer-events:
// none (unchanged), so the card as a whole still doesn't intercept clicks
// meant for the image/button beneath it; only the individual
// `.hover-overlay__themes li` elements opt back in with their own
// pointer-events: auto (see styles.css) so they alone can receive real
// hover events. Because those elements are still DOM descendants of
// .gallery-image-wrapper, moving the pointer from the plain image onto one
// of them never interrupts that button's own :hover state (CSS :hover
// applies to an element whenever the pointer is over it or any descendant)
// -- so this card stays open and stable the whole time, with no JS needed
// to hold it open.
//
// Hover/Click separation (this commit): hover and click on the same
// theme element now have different, deliberately non-overlapping jobs.
// Hover (above) is a temporary Relationship Engine preview only -- it
// never touches gallery state. Click commits: it hands the same {field,
// value} straight up to onMetadataCommit, which App.jsx wires to the
// exact same Metadata Query pipeline (queryArchive/applyMetadataQuery
// /regenerateGallery) Search and Filter already share, via
// handleFilterChange -- see App.jsx's own comment at the call site. This
// component still performs no matching, holds no query or gallery state,
// and does not navigate; it only reports what was clicked, exactly as it
// already only reports what was hovered.
//
// Responsive scaling (large images get more breathing room, small images
// shrink proportionally) is still handled in CSS via container query
// units/breakpoints scoped to this component's own root -- not by reading
// `dimensions` in JS. `dimensions` is accepted here for forward
// compatibility with later phases that may need it for layout decisions
// this phase doesn't require; it is intentionally unused for now.
//
// Final Mobile Presentation pass (CSS-only, no runtime measurement):
// View Project's own history had gotten genuinely contradictory across
// several passes -- a live useLayoutEffect/ResizeObserver DOM-measurement
// gate that failed shut on a real device (no tile ever showed View
// Project), a rollback to tier classification (Medium/Large only,
// Thumbnail never), a guessed CSS container-query pixel threshold, then
// a CORRECTED live measurement (comparing real rendered geometry against
// the frame on all four sides, catching a real horizontal-clipping bug
// the first live version missed) -- that corrected version was, in turn,
// still a live render -> measure -> hide/show -> reflow cycle, and it
// visibly flickered/glitched on small real tiles. All of it is retired
// now, not tuned again: there is no ref, no state, no effect, no
// ResizeObserver anywhere in this file any more. The render condition
// below is simply `isInspected && onEnterProject` -- ANY inspected,
// Project-linked tile attempts View Project, regardless of tier -- and
// what decides whether it's actually VISIBLE is plain, declarative CSS,
// the same architecture desktop's own hover card has always used:
// responsive cqmin-based typography down to a hard floor, natural
// wrapping onto a second line, and exactly one simple container-query
// fallback (styles.css) that hides this control outright on a
// genuinely tiny card, leaving Archive Number alone -- see that
// control's own render comment below and its styles.css rule for the
// full reasoning.
//
// Theme order: shuffled once per gallery generation, stable afterward.
// `itemId` and `generation` (passed down from App -- see
// galleryGenerationRef's own comment there) are combined into a seed for a
// deterministic PRNG (mulberry32, not Math.random()). Deterministic means
// the same (itemId, generation) pair always produces the same shuffled
// order, with nothing to store or reset: hovering, scrolling, zooming, and
// virtualization unmounting/remounting this component never change either
// input, so useMemo either returns the cached order or -- if this exact
// component instance was unmounted and remounted -- recomputes the exact
// same order from scratch, which looks identical either way. Only
// regenerateGallery incrementing the generation counter (a real gallery
// regeneration) ever changes the seed and produces a new shuffle.
function mulberry32(seed) {
  return function random() {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Relationship Hover Intent pass: how long the cursor must genuinely dwell
// on a single Theme element before the Relationship Engine actually
// activates -- previously zero (handleThemeHoverStart fired on the raw
// onMouseEnter, so a cursor fly-by across several themes while just
// moving through the Archive could flash the Archive-wide dim/highlight
// state on and off several times in a row).
//
// Dwell Timing Refinement pass: raised from the first pass's 180ms to
// 325ms. The `.hover-overlay__themes li:hover` CSS rule (this file's own
// styles.css, untouched by this pass) already gives the visitor immediate
// text-color feedback the instant the cursor enters a Theme -- that
// affordance is instant and unconditional, has nothing to do with this
// timer, and was never the thing that needed dwell-gating. Because that
// immediate feedback already exists, the Relationship Engine itself (a
// much bigger, Archive-wide visual event -- dim/highlight across
// potentially dozens of tiles) can afford to wait longer before firing:
// there's no longer any risk the visitor reads "nothing happened" during
// the wait, since the hover state itself already told them their cursor
// landed. 325ms is comfortably past an ordinary cursor pass-through
// (measured well under 100ms per target when the Archive is being browsed
// rather than deliberately inspected) while still registering as "the
// Archive responded to my pause" rather than a separate, noticeable
// timeout, per this pass's own brief. If drive-by activation is still
// observed at 325ms, the brief allows nudging up to ~350ms -- go no
// further without reporting back first.
const HOVER_INTENT_DWELL_MS = 325;

function hashSeed(key) {
  let hash = 0;
  for (let i = 0; i < key.length; i += 1) {
    hash = (Math.imul(31, hash) + key.charCodeAt(i)) | 0;
  }
  return hash;
}

function seededShuffle(list, seed) {
  const random = mulberry32(seed);
  const result = list.slice();
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function HoverOverlay({
  archiveNumber,
  themes = [],
  dimensions,
  itemId,
  generation = 0,
  onRelatedArchiveNumbersChange,
  onMetadataCommit,
  // Mobile Baseline Pass -- Task 2: the desktop hover-driven Relationship
  // Engine is not being translated to touch in this pass (a different
  // mobile interpretation may be designed later) -- see App.jsx's own
  // useIsTouchDevice/isRelationshipEngineEnabled comment for the single
  // source of this flag. Defaults to true (enabled) so every other,
  // unrelated call site -- there are none today, but this keeps the
  // component's own default behavior unchanged if one is ever added --
  // keeps working exactly as before without needing to know this prop
  // exists.
  relationshipEngineEnabled = true,
  // Discovery is the first eligibility gate: an editorial boolean (see
  // COLUMN_PATTERNS) deciding whether this tile may show metadata at all.
  // Defaults to false so an unspecified call site shows no metadata, never
  // everything. Geometry/container queries still decide how much is shown
  // once eligible -- see the `discovery &&` checks below.
  discovery = false,
  // Mobile Lexicon Removal pass: a second, independent eligibility gate
  // for Themes specifically -- App.jsx passes !isTouchDevice (see that
  // call site's own comment), so this is true on every desktop/fine-
  // pointer device (unchanged) and false on every touch device,
  // regardless of discovery or isInspected. Defaults to true so this
  // stays a no-behavior-change addition for any hypothetical call site
  // that doesn't pass it. This is what makes Josh's "never render Lexicon
  // on mobile" request literal: below, Themes are gated on
  // `themesEnabled &&`, not just on discovery/isInspected, so they are
  // absent from this component's own rendered output on a touch device
  // under every state, not merely hidden by CSS.
  themesEnabled = true,
  // Mobile Archive Interaction Pass -- Stage 5 (Touch-Native Image
  // Inspection): App.jsx's own JS-driven visibility signal for touch
  // devices -- the equivalent of the plain CSS :hover this card's own
  // opacity already reveals under on desktop (see the matching
  // .gallery-image-wrapper--inspected rule in styles.css). Defaults to
  // false so every existing desktop call site (and any future one that
  // doesn't pass it) renders exactly as before this stage: purely a CSS
  // hover card, aria-hidden, no interactive control inside it. This
  // component still holds no gesture/touch state of its own -- App.jsx
  // decides which single tile (if any) is inspected and simply tells this
  // one instance whether it is.
  isInspected = false,
  // Stage 5: a callback into App.jsx's own existing "enter this Project"
  // sequence (handleProjectRowImageClick, reused verbatim -- see the call
  // site's own comment), supplied only for Project-linked tiles. Its mere
  // presence/absence -- not a separate isProjectLinked boolean -- is what
  // decides whether EITHER entry control below can render at all.
  onEnterProject,
  // Single Presentation Authority pass: this prop is now the ONLY
  // presentation cutoff for View Project too, not just for padding. An
  // intermediate pass added a second, independent prop here
  // (isTooSmallForViewProject, at its own 120x72 thresholds) reasoning
  // that this prop's own 80x48 floor was derived to fit Archive Number
  // ALONE comfortably, never the two-element Number + View Project
  // pairing -- true, but the fix duplicated this prop's own
  // width-or-height-floor shape as a second, freestanding threshold
  // rather than building on it. Removed entirely. The real fix is
  // typography, not a second breakpoint: Archive Number's own mobile-
  // inspected font-size/padding, .hover-overlay__project-stack's own
  // gap, and View Project's own font-size/line-height/padding (see those
  // rules' own styles.css comments) were all recalibrated with
  // continuous cqmin/clamp() scaling so the full composition fits
  // legibly all the way down to this prop's own existing 80x48 floor --
  // no new, higher floor needed. This prop's job is now exactly:
  // isThumbnailTier === true renders Archive Number alone (below, in
  // the render); isThumbnailTier === false renders the full
  // .hover-overlay__project-stack composition (Number + View Project).
  // It still also decides the Thumbnail-only reduced safe-area padding
  // (.hover-overlay--thumbnail-inspected, see the className below and
  // that class's own styles.css comment) -- unchanged. App.jsx's own
  // MOBILE_SELECTABLE_TILE_MIN_WIDTH_PX/_HEIGHT_PX floor (the same one
  // that decides whether a non-Project tile is a selection surface at
  // all -- see App.jsx's own handleGalleryTileTap) is still what this
  // prop is computed from at the call site -- one real, build-time-known
  // width/height check, no live measurement, no ResizeObserver,
  // deciding padding, View Project's presentation, and (for non-Project
  // tiles) selectability, all from the same number. It never affects
  // isInspected, onEnterProject's own presence, or which tap navigates --
  // a Thumbnail tile showing Archive Number alone still inspects on tap
  // 1 and still navigates on tap 2 anywhere, identically to a
  // non-Thumbnail tile showing the full stack. Defaults to false so any
  // hypothetical call site that doesn't pass it gets the normal padding
  // and the full composition.
  isThumbnailTier = false,
  // Relationship Hover Intent pass: App.jsx's own single fire-time check
  // (isScrollingRef.current || isProjectFilterActiveRef.current ||
  // isOverlayActiveRef.current -- see its own declaration comment) --
  // called only once, right when this component's dwell timer is about to
  // commit an activation, never on every mouse event. Optional (defaults
  // to a function that always returns false) so this component still
  // behaves exactly as before for any hypothetical call site that doesn't
  // pass it.
  isRelationshipActivationBlocked = () => false,
  // Relationship Transition Refinement pass: fires synchronously the
  // instant a theme's hover intent BEGINS (top of handleThemeHoverStart,
  // before its own dwell timer is even scheduled) -- deliberately
  // separate from onRelatedArchiveNumbersChange, which only ever reports
  // an actual RESULT (a commit at the end of the dwell, or a clear on
  // leave). This is a much cheaper, purely informational "something is
  // now pending here" signal App.jsx uses to bridge the Theme-to-Theme
  // handoff gap (see handleThemeHoverIntentStart's own comment there) --
  // it carries no theme/archive data and never itself changes gallery
  // state. Optional, defaults to a no-op so this stays a no-behavior-
  // change addition for any call site that doesn't pass it.
  onThemeHoverIntentStart = () => {},
}) {
  // Metadata-budget prototype: the first entry in `themes` is always the
  // Archive Item's designated primary theme (item.theme, the singular
  // Content Contract field App.jsx already resolves this array from --
  // verified true for every real record today). Previously this whole
  // array was shuffled uniformly, so which theme rendered first was a
  // per-generation coin flip, not an editorial choice. Now only themes[1:]
  // are shuffled among themselves; themes[0] stays pinned in place, so the
  // priority-order reveal below (primary theme first, everything else
  // after) is a real guarantee rather than incidental.
  const shuffledThemes = useMemo(() => {
    if (themes.length === 0) return [];
    const [primary, ...rest] = themes;
    return [
      primary,
      ...seededShuffle(rest, hashSeed(`${itemId}:themes:${generation}`)),
    ];
  }, [themes, itemId, generation]);

  // Relationship Engine wiring, now metadata-driven: each call below
  // supplies a relationship type + value and reports whatever Archive
  // Numbers come back straight to Gallery (App.jsx), via the same
  // onRelatedArchiveNumbersChange callback wired in an earlier commit --
  // HoverOverlay still does not perform matching itself and still does not
  // hold the shared relatedArchiveNumbers state itself, per the
  // Relationship Engine's own contract. What changed is only the trigger:
  // these fire on an individual theme's own hover (below), not on the
  // image's hover, and not automatically for "the first theme" the way an
  // earlier commit did. Leaving a theme reports [] immediately, same as
  // leaving the image used to.
  // Relationship Hover Intent pass: pendingIntentRef holds AT MOST one
  // setTimeout id at a time -- the one and only cancellation mechanism
  // this whole feature needs (per this pass's own "avoid multiple
  // overlapping timers" instruction). clearPendingIntentTimer is called
  // from every place a previously-started intent needs to stop counting:
  // the start of a NEW theme's hover (so switching targets before the
  // dwell completes cancels the old one, never runs both), leaving the
  // element entirely, and this component instance unmounting (the
  // gallery's own filter/content-recomposition and navigation flows both
  // remount/unmount tiles rather than mutating them in place, so an
  // unmount here already IS "content recomposition/navigation occurred" --
  // no separate signal needed for those two cases).
  const pendingIntentRef = useRef(null);
  const clearPendingIntentTimer = () => {
    if (pendingIntentRef.current !== null) {
      clearTimeout(pendingIntentRef.current);
      pendingIntentRef.current = null;
    }
  };
  useEffect(() => clearPendingIntentTimer, []);

  const handleThemeHoverStart = (theme) => {
    // Mobile Baseline Pass -- Task 2: when the Relationship Engine is
    // disabled (touch devices, see relationshipEngineEnabled above), this
    // becomes a hard no-op -- the query against the Relationship Engine
    // never runs at all, not just its result being discarded/ignored
    // downstream. findRelatedArchiveItems and the engine itself are
    // untouched; this is the one and only place that decides whether they
    // ever get called. Hover intent below only ever gates WHEN a query
    // fires, never whether it's reachable at all on touch -- this early
    // return still comes first.
    if (!relationshipEngineEnabled) return;
    // Relationship Transition Refinement pass: fire the lightweight
    // "something is pending" signal before anything else below -- this is
    // what lets App.jsx's clear-bridge distinguish "the visitor's cursor
    // is already on its way to a new theme" from "the cursor genuinely
    // left with nothing following it," without waiting for this theme's
    // own dwell to actually commit.
    onThemeHoverIntentStart();
    // Cancel any earlier pending intent -- covers both "pointer left this
    // element and re-entered" and "pointer moved directly from one theme
    // element to another" (a plain onMouseEnter/onMouseLeave pair on
    // sibling elements), so only the MOST RECENT target's timer is ever
    // running.
    clearPendingIntentTimer();
    pendingIntentRef.current = setTimeout(() => {
      pendingIntentRef.current = null;
      // Fire-time re-check: the brief pause is over, but the cursor's
      // context may have changed in the meantime in a way that never
      // triggered clearPendingIntentTimer above (Archive motion
      // beginning, a zoom starting, Search/Menu opening, the
      // Project-filter composition activating) -- see
      // isRelationshipActivationBlocked's own comment in App.jsx. A
      // blocked check here is a silent no-op, exactly like an ordinary
      // cursor fly-by that never dwelled at all -- no relationship state
      // is set, nothing to clean up.
      if (isRelationshipActivationBlocked()) return;
      onRelatedArchiveNumbersChange?.(
        findRelatedArchiveItems("theme", theme, getArchiveItems()),
      );
    }, HOVER_INTENT_DWELL_MS);
  };
  const handleMetadataHoverEnd = () => {
    clearPendingIntentTimer();
    onRelatedArchiveNumbersChange?.([]);
  };

  // Hover/Click separation: hover (above) only ever previews via the
  // Relationship Engine and never touches gallery state. A click commits
  // -- it hands the same {field, value} shape straight up to App.jsx's
  // onMetadataCommit (handleMetadataFilterCommit), which is a thin
  // wrapper around the existing handleFilterChange/Metadata Query
  // pipeline Search and Filter already share. HoverOverlay itself still
  // performs no matching and holds no query/gallery state -- it only ever
  // reports which field+value was clicked, exactly as it already only
  // ever reports which field+value was hovered.
  //
  // event.stopPropagation() is required, not optional: these elements are
  // DOM descendants of the gallery tile's own <button> (see App.jsx),
  // which has its own onClick (navigate to the item's Project, or
  // open focus/zoom). Without stopping propagation here, a Theme click
  // would also fire that navigation/focus -- exactly what the "Do NOT
  // navigate" requirement for this interaction rules out.
  const handleThemeClick = (event, theme) => {
    event.stopPropagation();
    // Mobile Header/Search/Menu Refinement Pass -- Section 6: a Theme
    // selection commit gets a haptic tick, but only on a genuinely
    // touch-inspected card -- isInspected (this component's own prop) is
    // ONLY ever true when App.jsx's isTouchDevice is also true (see that
    // call site's own isInspected={isTouchDevice && ...} prop), so gating
    // on it here is equivalent to gating on touch capability directly,
    // with no second prop needed just to carry that signal down. A plain
    // desktop mouse click on this same element (isInspected always false
    // there) stays silent, per "Do NOT apply haptics on desktop/mouse
    // interaction."
    if (isInspected) hapticSelect();
    onMetadataCommit?.("theme", theme);
  };

  // Mobile Archive Interaction Pass -- Stage 6 (Theme Exploration from
  // Inspection): exposes the exact same commit pipeline handleThemeClick
  // already calls -- nothing new is wired here, no second path into
  // onMetadataCommit -- as a proper keyboard control, mirroring
  // handleEnterProjectKeyDown's own Enter/Space pattern immediately above.
  // Needed because a touch-inspected card is now, for the first time, a
  // real (non-aria-hidden) part of the accessibility tree -- see this
  // component's own aria-hidden={!isInspected} above -- so its Theme list
  // needs to be genuinely operable by keyboard/switch-control, not just
  // visually clickable, the moment it's exposed that way. Harmless,
  // additive keyboard support on desktop's own hover card too, since
  // nothing about handleThemeClick's own behavior changes -- it was never
  // reachable by keyboard before this (no tabIndex existed on these
  // elements at all), so this is a pure accessibility gain, not a
  // behavior change to guard.
  const handleThemeKeyDown = (event, theme) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    handleThemeClick(event, theme);
  };

  // Stage 5: Enter/Space activates the control the same way a click does --
  // it's a <div role="button">, not a real <button> (see the control's own
  // render comment below for why a real <button> can't be used here), so
  // native keyboard activation isn't automatic and has to be wired
  // explicitly for this to be a genuinely operable control, not just a
  // visually-focusable one.
  const handleEnterProjectKeyDown = (event) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    event.stopPropagation();
    onEnterProject?.();
  };

  return (
    <div
      className={`hover-overlay${
        // Final Mobile Interaction Model pass: Thumbnail tiles get a
        // smaller, thumbnail-specific padding while inspected (see this
        // rule's own comment in styles.css) -- real generated Archive
        // geometry produces Project-linked tiles as small as ~22x14px,
        // where the card's normal 0.5rem safe-area padding alone can
        // exceed the tile's own height, leaving Archive Number little to
        // no room to render visibly. isThumbnailTier && isInspected keeps
        // this scoped to exactly the state that needs it -- Medium/Large
        // never get this class (isThumbnailTier is always false for
        // them), and desktop never does either (isInspected is always
        // false there).
        isThumbnailTier && isInspected ? " hover-overlay--thumbnail-inspected" : ""
      }`}
      // Stage 5: this card is decorative chrome on desktop (a plain CSS
      // :hover reveal with no keyboard-reachable content of its own,
      // aria-hidden unconditionally before this stage) -- that stays true
      // here whenever it isn't currently inspected. Once a touch device
      // inspects it (isInspected), it can hold a real, focusable "View
      // Project" control (below), so it needs to actually be exposed to
      // assistive tech at that point rather than permanently hidden from
      // it -- an aria-hidden ancestor would make an interactive descendant
      // unreachable regardless of its own tabIndex/role. Desktop's hover
      // card is completely unaffected: isInspected is never true there.
      aria-hidden={!isInspected}
    >
      {/* Archive-number presentation rule (Josh review): bracketed
          site-wide, e.g. "[033]" -- a display-only wrap of whatever value
          this prop already carries, not a reformat of it. The raw,
          unbracketed archiveNumber is still what's passed in from
          App.jsx/matched against relatedArchiveNumbers elsewhere; nothing
          about that data or the Relationship Engine's matching changes
          here. */}
      {/* Final Mobile Presentation pass (CSS-only, no runtime
          measurement -- see this file's own top comment for why a live
          JS fit system was tried twice and removed both times): Archive
          Number is the universal selected-state signal on every
          inspected tile, regardless of whether it's Project-linked -- it
          always attempts to render (archiveNumber != null is the only
          condition, same as desktop). Its own fit/never-clip guarantee
          is entirely declarative, exactly like desktop's own
          composition: a responsive font-size clamp (cqmin-based, see
          styles.css) with a hard legible floor, plus a plain
          container-query hide-fallback for the rare case even that
          floor can't fit a genuinely extreme sliver (@container
          hover-overlay, scoped to .gallery-image-wrapper--inspected so
          it can never affect desktop -- see that rule's own styles.css
          comment). isInspected is only ever true on a touch device (see
          this component's own prop comment above), so none of this ever
          touches desktop's own hover card, which always renders the
          Number exactly as before.

          Composition correction pass: real-device screenshots showed
          Archive Number and View Project visibly colliding on some
          medium-sized cards. Root cause: the two were only ever
          independent .hover-overlay flex children, separated by
          .hover-overlay's own single shared gap (0.35rem -- the same
          value that separates Number from Themes in the non-inspected
          composition) plus View Project's own uncoordinated
          margin-top -- nothing actually composed them as ONE protected
          text group with a guaranteed minimum clearance, so at
          container sizes partway down each element's own independent
          cqmin font-size clamp, their combined natural height could
          close in on that fixed, shared gap. The fix is markup, not a
          new fit system: whenever View Project is going to attempt to
          render alongside Archive Number (isInspected && onEnterProject
          -- the exact same condition View Project's own render guard
          already used), both are rendered together inside one
          .hover-overlay__project-stack wrapper, which owns ITS OWN
          explicit gap between just these two elements (see that rule's
          own styles.css comment) -- a real, dedicated protected unit,
          not two siblings incidentally spaced by a value meant for a
          different pairing. This condition is false on every desktop
          hover card (isInspected is always false there -- see this
          component's own prop comment above), so desktop always takes
          the plain, unwrapped branch below, unchanged.

          Single Presentation Authority pass: a second, independent
          condition, isTooSmallForViewProject at its own 120x72
          thresholds, briefly lived here alongside the one above --
          removed. isThumbnailTier (see this component's own prop
          comment for the full reasoning) is the ONLY presentation
          cutoff now: !isThumbnailTier is the condition below, the exact
          same prop that already decides this tile's reduced safe-area
          padding. True Thumbnail-tier Project tiles are too small to
          legibly hold this composition at all; forcing it onto every
          tile regardless of size was the wrong instinct, so those tiles
          deliberately render Archive Number alone (the plain, unwrapped
          branch below), the same intentional presentation Archive
          Number already gets on a non-Project tile. This is a real
          design decision, not a squeezed fallback -- the tile's own tap
          behavior is completely unaffected either way (see
          isThumbnailTier's own prop comment: it never touches
          isInspected, onEnterProject, or navigation). Mobile-inspected
          typography (Archive Number's and View Project's own font-size/
          padding/line-height, and this stack's own gap -- see those
          rules' own styles.css comments) was recalibrated with
          continuous cqmin/clamp() scaling so the full composition below
          fits legibly all the way down to isThumbnailTier's own
          existing 80x48 floor, rather than needing a second, higher
          threshold to hide it earlier. */}
      {archiveNumber != null &&
        (isInspected && onEnterProject && !isThumbnailTier ? (
          <div className="hover-overlay__project-stack">
            <div className="hover-overlay__number">{`[${archiveNumber}]`}</div>
            {/* Mobile Archive Interaction Pass -- Stage 5: the explicit
                "enter the Project" control -- only ever rendered while
                this specific tile is inspected AND it's actually
                Project-linked (onEnterProject is undefined otherwise,
                see this component's own prop comment above). Tapping it
                directly navigates immediately (its own onClick,
                stopPropagation'd, below). It is not the ONLY way a touch
                visitor enters the Project from here: a second tap
                anywhere else on that same already-inspected tile does
                the same thing -- see App.jsx's own
                handleGalleryTileTap, which calls the identical
                handleProjectRowImageClick this control's onEnterProject
                already wraps. The two paths just converge on the same
                navigation; this control's own explicit
                affordance/label is still what tells a visitor the tap
                will navigate.

                Deliberately a <div role="button"> rather than a real
                <button>: this whole component is rendered as a child of
                the gallery tile's own outer <button>
                (.gallery-image-wrapper, see App.jsx's render) -- a
                nested <button> inside a <button> is invalid HTML, and
                browsers do not render/behave predictably once one
                appears (the exact reason Header.jsx's own
                filter-control wraps its Clear-All "x" as a sibling
                rather than a nested button, see that file's own
                comment). role="button" + tabIndex={0} + explicit
                onKeyDown (below) is what keeps this a REAL focusable,
                keyboard-operable control despite not being a literal
                <button> element -- not a div with a bare onClick.

                event.stopPropagation() mirrors handleThemeClick's own
                reasoning immediately above: without it, this tap would
                also reach the outer tile's own onClick
                (handleGalleryTileTap) and double-fire the same
                navigation it's already about to trigger directly --
                harmless in practice (both resolve to the same
                handleProjectRowImageClick call, guarded against
                re-entry there), but stopping it here keeps this
                control's own click the single, direct cause of
                navigation when it's the one actually tapped.
                pointer-events are opted back in via this component's
                own .hover-overlay__enter-project rule in styles.css,
                the same targeted opt-in .hover-overlay__themes li
                already uses against this card's own pointer-events:
                none default.

                Final Mobile Presentation pass (CSS-only, no runtime
                measurement): render condition is simply isInspected &&
                onEnterProject -- no tier gate, and no JS fit decision of
                any kind. Two earlier passes here tried deciding View
                Project's actual visibility with a live
                useLayoutEffect/ResizeObserver measurement (first
                height-only, then corrected to measure both axes against
                the frame's real geometry via extra frameRef/stackRef
                refs and a viewProjectFits state) -- technically more
                precise, but the render -> measure -> hide/show -> reflow
                cycle it required was visibly flickering/glitching on
                real small tiles. That entire system (the refs, the
                state, the effect, the ResizeObservers, the --hidden
                modifier class) is removed entirely -- not tuned,
                replaced. This card now works exactly like desktop's own
                composition: a plain, declarative CSS container
                (.hover-overlay's own container-type: size, unchanged)
                with responsive cqmin typography and ONE simple
                container-query fallback (styles.css, on this control's
                own rule) that hides it outright on a genuinely tiny
                card -- the same mechanism Archive Number's own
                extreme-sliver fallback already uses just above, not a
                second layout engine. Font-size stays responsive
                (clamp() in styles.css) down to an 11px floor, and the
                label wraps naturally onto a second line on a narrow tile
                (e.g. "VIEW" / "PROJECT ->") -- see that rule's own
                comment. A tile too small even for that hides this
                control via the CSS fallback --
                .hover-overlay__project-stack itself remains in place
                either way, so Archive Number alone still centers
                correctly, both axes, inside the SAME stack rather than
                a separate layout. App.jsx's own
                second-tap-anywhere-on-an-already-inspected-tile rule
                (unaffected by any of this, uniform across every tier)
                is still that tile's entry point into the Project. The
                44px standard tap target is still an invisible,
                out-of-flow hit area (::before, styles.css) rather than
                reserved visible layout height. */}
            <div
              className="hover-overlay__enter-project"
              role="button"
              tabIndex={0}
              onClick={(event) => {
                event.stopPropagation();
                // Section 6: this control only ever renders while
                // isInspected is true (see the guard above), which
                // itself is only ever true on a touch device -- see
                // handleThemeClick's own comment for why that makes an
                // extra gate unnecessary here. An explicit "View
                // Project" tap is one of the enumerated commit
                // interactions, so it gets the same hapticSelect() a
                // filter/search/theme commit gets.
                hapticSelect();
                onEnterProject();
              }}
              onKeyDown={handleEnterProjectKeyDown}
              aria-label="View project"
            >
              View Project →
            </div>
          </div>
        ) : onEnterProject ? (
          // Archive Number -- Project Link Affordance pass: desktop-only
          // in effect (this branch only ever runs when NOT isInspected --
          // isInspected is always false on desktop, see this component's
          // own top comment -- and onEnterProject is only ever passed for
          // Project-linked tiles, its mere presence deciding this exactly
          // like it already decides View Project's own render eligibility
          // above). Reuses onEnterProject verbatim -- the exact same
          // handleProjectRowImageClick fade-then-navigate function View
          // Project and the second-tap-anywhere path already call -- so
          // clicking Archive Number lands on the identical Project/image
          // as clicking the tile's own image, with no second routing
          // path. event.stopPropagation() mirrors
          // .hover-overlay__enter-project's own onClick immediately
          // above: without it, this click would also bubble to
          // .gallery-image-wrapper's own onClick and fire the image's
          // desktop navigation a second time on top of this one.
          // role="button" + tabIndex={-1} + onKeyDown mirrors the exact
          // same convention the Themes list already uses just below
          // (tabIndex={isInspected ? 0 : -1} there -- always -1 here
          // since this branch itself only ever renders while !isInspected)
          // rather than a plain tabIndex={0}: this card is aria-hidden
          // whenever it isn't inspected (see this component's own
          // aria-hidden={!isInspected} above), and a keyboard-focusable
          // descendant of an aria-hidden ancestor is unreachable/
          // confusing for assistive tech regardless of its own tabIndex,
          // the same reasoning already documented on Themes' own tabIndex.
          // Mouse/pointer interaction (styles.css's own
          // .hover-overlay__number--clickable) is unaffected by tabIndex
          // either way, exactly like Themes today. onKeyDown reuses
          // handleEnterProjectKeyDown verbatim -- the exact same Enter/
          // Space handler View Project's own control already uses, not a
          // second keyboard implementation.
          <div
            className="hover-overlay__number hover-overlay__number--clickable"
            role="button"
            tabIndex={-1}
            onClick={(event) => {
              event.stopPropagation();
              onEnterProject();
            }}
            onKeyDown={handleEnterProjectKeyDown}
            aria-label="View project"
          >
            {`[${archiveNumber}]`}
          </div>
        ) : (
          <div className="hover-overlay__number">{`[${archiveNumber}]`}</div>
        ))}
      {/* Discovery: the only editorial gate, checked before container
          queries ever run. Non-discovery tiles never render this markup, so
          styles.css has nothing to measure. Discovery tiles always attempt
          to render -- responsive typography (see styles.css) decides how
          large the text appears, shrinking smoothly down to a 9px floor;
          only genuine physical impossibility at that floor (a container too
          small to hold even the shortest single line) results in no visible
          themes, never a separate editorial decision. */}
      {/* Mobile Lexicon Removal pass: themesEnabled (App.jsx's
          !isTouchDevice, see this component's own prop comment above) is
          the real, unconditional "never on touch" gate -- false on every
          touch device regardless of anything else. !isInspected is a
          second, independent condition kept from the earlier pass: on
          desktop, where themesEnabled is always true, it still hides
          Themes for the (touch-only) isInspected case, which is always
          false there anyway, so it's a harmless no-op on desktop and
          simply redundant with themesEnabled on touch. Desktop's own
          discovery-tile hover reveal is completely unaffected either
          way. */}
      {themesEnabled && discovery && !isInspected && shuffledThemes.length > 0 && (
        <ul className="hover-overlay__themes">
          {shuffledThemes.map((theme) => (
            <li
              key={theme}
              role="button"
              tabIndex={isInspected ? 0 : -1}
              aria-label={`Filter by theme: ${theme}`}
              onMouseEnter={() => handleThemeHoverStart(theme)}
              onMouseLeave={handleMetadataHoverEnd}
              onClick={(event) => handleThemeClick(event, theme)}
              onKeyDown={(event) => handleThemeKeyDown(event, theme)}
            >
              {/* Lexicon "#" presentation rule (Archive metadata typography
                  pass): display-only prefix, matching the Archive Number's
                  own bracket treatment above -- `theme` itself (the value
                  passed to handleThemeClick/handleThemeKeyDown/aria-label
                  above, and used as this element's own `key`) is completely
                  untouched, so click-to-filter/Relationship Engine matching
                  and the stored Sanity value are unaffected. Guarded against
                  a doubled "##" if a legacy Lexicon entry was ever authored
                  with its own leading "#". */}
              {theme.startsWith("#") ? theme : `#${theme}`}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default HoverOverlay;
