import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import gsap from "gsap";
import imageMetadata from "./image-metadata.json";
import Header from "./Header";
import HoverOverlay from "./HoverOverlay";
import { navigate } from "./navigation";
import { useIsMobileUiMode } from "./useIsMobileUiMode";
import { hapticTap } from "./haptics";
// Image-delivery helpers (which sized/format variant of an already-known
// image to request) -- moved to imageOptimization.js (Project Page
// image-loading polish, Josh review) so ImageViewer.jsx (the Project
// Page) can share this exact pipeline instead of duplicating it; see that
// file's own header comment for the full reasoning. This is a
// rendering-layer concern only -- the content layer seam above
// (getArchiveItems/getProjects/getThemes) is untouched and still the only
// source of *what* images exist; this import only changes *how* one is
// requested once render already has its URL.
import {
  getArchiveOptimizedImageSrc,
  getArchiveOptimizedImageSrcSet,
  getImageDimensions,
} from "./imageOptimization.js";
// Content layer seam (Frontend <-> CMS handshake, Phase 1): App.jsx no
// longer imports mock data files directly -- it goes through
// src/content/, the single source of content for the application. Today
// these functions are a pure passthrough to the same mock data; nothing
// about the values they return has changed.
import { findArchiveItemBySrc, getArchiveItems, getProjects, getThemes } from "./content";
// Project Filter Alignment: the real Project catalog (title + slug),
// already used elsewhere for Project-page navigation/getProjectBySlug
// (see projectContent.js, untouched by this commit) -- now also the
// source of truth for Filter's Project category (see PROJECT_TITLES/
// PROJECT_SLUG_BY_TITLE and the projects prop on <Header> below), instead
// of Header's own unrelated placeholder MOCK_PROJECTS default.
// Metadata Query Engine wiring (Search + Filter): the one place Gallery
// reaches into queryArchive. Gallery itself performs no matching of its
// own -- see applyMetadataQuery in App() below, the only call site.
//
// Year Filter -- Live Data: extractYearNumber is the same leading-4-digit-
// year parser the Year matcher's own "Earlier" comparison already uses
// internally (see metadataQueryEngine.js) -- imported here so deriving the
// Year category's own live option list (see ARCHIVE_YEARS in App(), below)
// reuses that one parsing rule instead of a second copy of it that could
// drift out of sync with what the matcher itself actually accepts.
import { queryArchive, extractYearNumber } from "./metadataQueryEngine";
// Relationship Mode Visibility Gate: separate from the Relationship
// Engine (relationshipEngine.js, reached only through HoverOverlay,
// untouched here) -- this decides whether the candidate archive numbers
// the engine already found are worth visualizing right now. See
// relationshipModeEvaluator.js for the full rationale; see
// isRelationshipModeActive below for the one call site.
import { shouldActivateRelationshipMode } from "./relationshipModeEvaluator";
// Project Filter Composition (client-requested): the single-row
// horizontal alternative to the normal DAPC composition, rendered only
// while the archive is filtered by Project -- see isProjectFilterActive
// below for the render branch, and ProjectFilterRow.jsx's own header
// comment for why this is a separate, isolated component rather than an
// extension of buildGalleryItems/createGalleryBatch/pickImage.
import ProjectFilterRow from "./ProjectFilterRow";

export const allImages = [
  "/img/pexels-adrien-olichon-1257089-3137038.jpg",
  "/img/pexels-adrien-olichon-1257089-3137047.jpg",
  "/img/pexels-ai25studio-8837511.jpg",
  "/img/pexels-airamdphoto-27675599.jpg",
  "/img/pexels-andrea-238542097-35392198.jpg",
  "/img/pexels-artbovich-11701113.jpg",
  "/img/pexels-artbovich-7166645.jpg",
  "/img/pexels-artbovich-7195739.jpg",
  "/img/pexels-artbovich-8089093.jpg",
  "/img/pexels-costa-17729218.jpg",
  "/img/pexels-ezgi-arslanturk-karaman-48519538-11195363.jpg",
  "/img/pexels-francesco-ungaro-2058168.jpg",
  "/img/pexels-ganiyevart-15153700.jpg",
  "/img/pexels-googledeepmind-25626446.jpg",
  "/img/pexels-itskhalidkhan-6259182.jpg",
  "/img/pexels-ivan-s-4458200.jpg",
  "/img/pexels-ivan-s-4458205.jpg",
  "/img/pexels-jonas-horsch-102497290-34303572.jpg",
  "/img/pexels-laup-1816030.jpg",
  "/img/pexels-macit-abdullah-2152400408-33643463.jpg",
  "/img/pexels-magda-ehlers-pexels-35009410.jpg",
  "/img/pexels-perqued-10919427.jpg",
  "/img/pexels-perqued-9757618.jpg",
  "/img/pexels-pixels-elements-16627387.jpg",
  "/img/pexels-pth686817-20588914.jpg",
  "/img/pexels-rethaferguson-3825540.jpg",
  "/img/pexels-rushipatel1210-32654150.jpg",
  "/img/pexels-shvets-production-9052461.jpg",
  "/img/pexels-sliceisop-2739074.jpg",
  "/img/pexels-srcharls-35614239.jpg",
  "/img/pexels-thomas-parker-1272388137-31500951.jpg",
  "/img/pexels-tima-miroshnichenko-6615234.jpg",
  "/img/pexels-unlime-8262182.jpg",
  "/img/pexels-yunuserentk-10026713.jpg",
  "/img/pexels-zulfugarkarimov-33719839.jpg",
];

const imageTags = {
  "/img/pexels-adrien-olichon-1257089-3137038.jpg": "light",
  "/img/pexels-adrien-olichon-1257089-3137047.jpg": "light",
  "/img/pexels-ai25studio-8837511.jpg": "light",
  "/img/pexels-artbovich-11701113.jpg": "structure",
  "/img/pexels-artbovich-7166645.jpg": "structure",
  "/img/pexels-artbovich-7195739.jpg": "structure",
  "/img/pexels-artbovich-8089093.jpg": "structure",
};

const imageFocusEnabled = false;
const galleryBatchWidth = 1760;
const galleryEdgeBleed = 690;


// Browsing/Exploration mode (interaction-layer only -- see isScrolling's own
// comment and the animateGallery loop that sets it): how long the gallery
// must sit idle (real velocity at or under the epsilon below, not just a
// pause between wheel/touch events) before hover metadata and the
// Relationship Engine are allowed to activate again. The one constant to
// touch to retune the delay. SCROLL_IDLE_VELOCITY_EPSILON is the second,
// smaller dial this feature needs: movement.velocity decays by the existing
// friction (0.92) every frame and, left alone, would take many seconds to
// reach exactly zero -- this is the "close enough to stopped, no visible
// motion left" cutoff (px/frame; at 60fps, 0.5 is ~30px/s) that lets the
// idle timer above start counting at a moment that actually looks settled,
// rather than waiting on a value that never quite arrives.
const SCROLL_IDLE_DELAY_MS = 200;
const SCROLL_IDLE_VELOCITY_EPSILON = 0.5;

// High-End Motion/Transition Polish pass: the gap this pass closes. Once
// SCROLL_IDLE_DELAY_MS above has already decided the camera is stopped
// (isScrollingRef flips false, the "is-scrolling" CSS class lifts, theme
// <li> pointer-events -- and with them the instant text-color hover
// affordance -- come back), three OTHER systems used to become eligible
// on that exact same tick, the instant isScrollingRef went false: settled
// image entrance (updateEntranceAnimations' motion branch), the local
// centerScale/relationshipMotion transform resume (same function, the
// smoothX/Y/Scale block), and Relationship Engine hover-intent
// (isRelationshipActivationBlocked). Individually each of those is
// already its own smooth transition (entrance tweens, the 0.14/frame
// local-transform ease, the dwell timer) -- the "technical state switch"
// feeling reported was never any ONE of them snapping, it was several
// independently-smooth systems all being handed the green light on the
// same frame, which reads as one coordinated flip rather than a field
// settling into place.
//
// FIELD_SETTLE_GRACE_MS is a second, short debounce chained AFTER
// isScrollingRef already goes false -- it does not touch
// SCROLL_IDLE_DELAY_MS or how/when the camera itself is judged stopped,
// and it does not gate pointer-events or the instant text-color hover
// (those stay exactly as fast as they already were). It only delays the
// three passive/visual systems above by one short additional beat, via
// isFieldSettledRef below, so the field visibly finishes settling before
// local transforms resume, new imagery resolves, or a relationship can
// activate. 130ms was chosen empirically: short enough to sit under the
// ~150ms threshold where an added wait starts reading as conscious lag
// (nothing here is input-gated the way the hover-intent dwell is -- nothing
// is "waiting to be let in"), long enough to reliably land after the
// settle-timer tick that already flips isScrollingRef, so the two beats
// are felt as one continuous settle rather than two separate delays.
const FIELD_SETTLE_GRACE_MS = 130;

// Four designer-authored DAPC compositions (Stage A/B source-fidelity
// audit, approved 2026-08-15) -- replaces the earlier six-of-eight
// pattern pool entirely. Each pattern is a fixed column of tiles sharing
// the same render height; "left/top/w/h" are percentages of that
// column's own box, "orientation" is used to pick a matching real photo
// for the slot. `discovery: true` on a tile is the same pre-existing
// editorial annotation as before -- independent of geometry, carries no
// meaning on its own; see item.layout.discovery and HoverOverlay for how
// it's consumed. Assigned here to each pattern's largest ~third of tiles
// by area, matching the rough density the previous eight-pattern set
// used (28-42% per pattern); there was no equivalent markup in the new
// source images to derive this from directly.
//
// Two fields are new, both introduced for the standardized DAPC
// interlock (see INTERLOCK_* below, just after this array):
// `interlockTab: true` marks the one tile per pattern whose rendered
// width extends past its own column's right edge at render time, into
// whichever pattern comes next -- everything else about that tile
// (left/top/h, and its position in the tile list) is exactly the
// audited authored geometry, untouched. `maxReceiveDepthPct` (pattern-
// level, present only on Patterns 3 and 4) caps how far *any* neighbor's
// tab may travel into this pattern's own canvas, as a percentage of this
// pattern's own width -- both are audit-confirmed minimums needed to
// clear real authored tiles (a site-plan drawing on Pattern 3, two
// photos on Pattern 4) that sit closer to the left edge than the
// standard interlock reach would otherwise allow.
const COLUMN_PATTERNS = [{"aspect":1.1181,"tiles":[{"left":73.965,"top":0.0,"w":7.516,"h":13.033,"orientation":"portrait"},{"left":2.397,"top":4.507,"w":18.192,"h":14.129,"orientation":"landscape","discovery":true},{"left":83.878,"top":6.577,"w":3.813,"h":6.456,"orientation":"portrait"},{"left":93.028,"top":6.699,"w":3.813,"h":6.334,"orientation":"portrait"},{"left":44.553,"top":7.43,"w":16.013,"h":14.982,"orientation":"landscape","discovery":true},{"left":35.403,"top":8.161,"w":5.773,"h":3.41,"orientation":"landscape"},{"left":64.052,"top":8.161,"w":5.556,"h":3.532,"orientation":"landscape"},{"left":26.035,"top":8.526,"w":5.664,"h":2.68,"orientation":"landscape"},{"left":62.636,"top":15.834,"w":27.342,"h":23.264,"orientation":"landscape","discovery":true},{"left":92.484,"top":16.322,"w":4.357,"h":3.776,"orientation":"landscape"},{"left":25.926,"top":16.687,"w":16.667,"h":14.007,"orientation":"landscape","discovery":true},{"left":10.566,"top":22.533,"w":12.527,"h":14.129,"orientation":"square","discovery":true},{"left":0.327,"top":23.386,"w":6.318,"h":7.308,"orientation":"square"},{"left":44.88,"top":24.117,"w":5.773,"h":5.238,"orientation":"landscape"},{"left":54.466,"top":24.604,"w":5.664,"h":4.141,"orientation":"landscape"},{"left":92.484,"top":24.604,"w":4.357,"h":4.141,"orientation":"landscape"},{"left":35.403,"top":32.643,"w":5.882,"h":4.872,"orientation":"landscape"},{"left":54.357,"top":32.887,"w":5.773,"h":4.385,"orientation":"landscape"},{"left":25.926,"top":33.13,"w":5.773,"h":3.776,"orientation":"landscape"},{"left":44.88,"top":33.13,"w":5.773,"h":3.898,"orientation":"landscape"},{"left":23.42,"top":38.368,"w":8.279,"h":9.501,"orientation":"square"},{"left":34.749,"top":38.977,"w":15.904,"h":14.982,"orientation":"landscape","discovery":true},{"left":56.1,"top":40.317,"w":16.885,"h":13.642,"orientation":"landscape","discovery":true},{"left":76.58,"top":40.804,"w":6.318,"h":6.577,"orientation":"square"},{"left":15.251,"top":44.945,"w":7.081,"h":9.257,"orientation":"portrait"},{"left":76.797,"top":49.33,"w":5.882,"h":4.385,"orientation":"landscape"},{"left":26.035,"top":49.574,"w":5.664,"h":4.75,"orientation":"landscape"},{"left":15.359,"top":55.542,"w":25.708,"h":16.565,"orientation":"landscape","discovery":true},{"left":63.943,"top":55.542,"w":18.083,"h":12.667,"orientation":"landscape","discovery":true},{"left":54.357,"top":57.978,"w":5.773,"h":4.507,"orientation":"landscape"},{"left":44.88,"top":58.222,"w":5.773,"h":4.263,"orientation":"landscape"},{"left":83.551,"top":59.562,"w":13.29,"h":12.302,"orientation":"landscape","discovery":true},{"left":44.444,"top":63.581,"w":16.122,"h":16.322,"orientation":"square","discovery":true},{"left":0.0,"top":63.825,"w":12.636,"h":8.283,"orientation":"landscape"},{"left":67.865,"top":70.524,"w":14.27,"h":25.457,"orientation":"portrait","discovery":true},{"left":26.144,"top":74.3,"w":14.924,"h":16.565,"orientation":"square","discovery":true},{"left":7.19,"top":75.883,"w":12.854,"h":9.257,"orientation":"landscape"},{"left":83.769,"top":76.005,"w":13.072,"h":8.039,"orientation":"landscape"},{"left":89.651,"top":43.5,"w":10.349,"h":14.7,"orientation":"portrait","interlockTab":true}]},{"aspect":0.9794,"tiles":[{"left":31.351,"top":2.913,"w":17.348,"h":18.689,"orientation":"square","discovery":true},{"left":74.597,"top":3.883,"w":12.887,"h":9.466,"orientation":"landscape"},{"left":53.036,"top":7.646,"w":6.32,"h":4.733,"orientation":"landscape"},{"left":63.569,"top":8.01,"w":6.568,"h":3.883,"orientation":"landscape"},{"left":23.668,"top":8.738,"w":6.444,"h":4.005,"orientation":"landscape"},{"left":0.0,"top":8.981,"w":19.455,"h":12.621,"orientation":"landscape","discovery":true},{"left":76.952,"top":15.898,"w":19.331,"h":14.684,"orientation":"landscape","discovery":true},{"left":52.664,"top":16.019,"w":20.57,"h":13.107,"orientation":"landscape","discovery":true},{"left":23.668,"top":16.99,"w":6.32,"h":4.49,"orientation":"landscape"},{"left":42.255,"top":24.393,"w":6.32,"h":4.612,"orientation":"landscape"},{"left":20.57,"top":24.515,"w":6.444,"h":4.248,"orientation":"landscape"},{"left":1.735,"top":24.636,"w":15.118,"h":13.228,"orientation":"square","discovery":true},{"left":31.475,"top":24.757,"w":6.444,"h":3.762,"orientation":"landscape"},{"left":31.351,"top":32.039,"w":28.748,"h":31.311,"orientation":"square","discovery":true},{"left":74.597,"top":32.524,"w":6.32,"h":5.097,"orientation":"landscape"},{"left":20.57,"top":33.131,"w":6.444,"h":3.883,"orientation":"landscape"},{"left":63.817,"top":33.374,"w":6.32,"h":3.277,"orientation":"landscape"},{"left":20.57,"top":41.626,"w":6.444,"h":3.519,"orientation":"landscape"},{"left":63.817,"top":41.869,"w":13.135,"h":11.772,"orientation":"square","discovery":true},{"left":17.596,"top":49.272,"w":10.657,"h":13.35,"orientation":"portrait","discovery":true},{"left":74.597,"top":57.646,"w":6.32,"h":4.854,"orientation":"landscape"},{"left":63.817,"top":57.767,"w":6.444,"h":4.612,"orientation":"landscape"},{"left":31.846,"top":65.777,"w":11.524,"h":7.16,"orientation":"landscape"},{"left":48.575,"top":66.141,"w":11.524,"h":6.432,"orientation":"landscape"},{"left":63.569,"top":66.141,"w":21.19,"h":21.602,"orientation":"square","discovery":true},{"left":87.485,"top":66.141,"w":8.798,"h":8.495,"orientation":"square"},{"left":2.602,"top":66.262,"w":24.411,"h":17.597,"orientation":"landscape","discovery":true},{"left":87.485,"top":78.034,"w":8.798,"h":5.704,"orientation":"landscape"},{"left":31.846,"top":78.398,"w":11.524,"h":5.583,"orientation":"landscape"},{"left":48.451,"top":78.519,"w":11.648,"h":5.34,"orientation":"landscape"},{"left":24.04,"top":86.893,"w":11.276,"h":8.617,"orientation":"landscape"},{"left":85.874,"top":43.5,"w":14.126,"h":14.7,"orientation":"square","interlockTab":true}]},{"aspect":1.611,"tiles":[{"left":19.152,"top":0.0,"w":5.223,"h":12.683,"orientation":"portrait"},{"left":86.677,"top":1.098,"w":6.662,"h":7.073,"orientation":"landscape"},{"left":0.0,"top":4.39,"w":9.841,"h":17.073,"orientation":"square","discovery":true},{"left":61.923,"top":5.61,"w":9.311,"h":19.268,"orientation":"portrait","discovery":true},{"left":26.041,"top":6.463,"w":2.65,"h":6.341,"orientation":"portrait"},{"left":32.4,"top":6.463,"w":3.179,"h":6.341,"orientation":"portrait"},{"left":12.188,"top":7.805,"w":3.936,"h":3.659,"orientation":"landscape"},{"left":37.169,"top":8.537,"w":15.746,"h":12.805,"orientation":"landscape","discovery":true},{"left":53.671,"top":8.659,"w":3.179,"h":3.78,"orientation":"landscape"},{"left":74.413,"top":8.78,"w":4.769,"h":6.463,"orientation":"landscape"},{"left":81.302,"top":11.22,"w":4.012,"h":3.537,"orientation":"landscape"},{"left":87.661,"top":11.707,"w":10.144,"h":12.561,"orientation":"landscape","discovery":true},{"left":53.671,"top":15.122,"w":6.207,"h":6.707,"orientation":"landscape"},{"left":11.128,"top":15.61,"w":19.228,"h":23.415,"orientation":"landscape","discovery":true},{"left":32.021,"top":16.22,"w":3.936,"h":3.659,"orientation":"landscape"},{"left":74.716,"top":19.878,"w":11.582,"h":13.902,"orientation":"landscape","discovery":true},{"left":0.0,"top":23.902,"w":2.877,"h":5.244,"orientation":"square"},{"left":43.528,"top":23.902,"w":7.419,"h":15.0,"orientation":"portrait"},{"left":38.607,"top":24.146,"w":3.936,"h":4.756,"orientation":"landscape"},{"left":5.602,"top":24.39,"w":3.936,"h":4.39,"orientation":"landscape"},{"left":32.021,"top":24.39,"w":3.936,"h":4.146,"orientation":"landscape"},{"left":87.888,"top":27.195,"w":4.012,"h":5.244,"orientation":"landscape"},{"left":94.55,"top":27.683,"w":3.255,"h":4.268,"orientation":"landscape"},{"left":53.369,"top":28.659,"w":15.594,"h":14.878,"orientation":"landscape","discovery":true},{"left":32.097,"top":32.317,"w":10.447,"h":13.415,"orientation":"landscape","discovery":true},{"left":5.602,"top":32.683,"w":3.936,"h":4.512,"orientation":"landscape"},{"left":0.0,"top":32.927,"w":2.877,"h":4.024,"orientation":"landscape"},{"left":81.302,"top":35.854,"w":4.088,"h":4.756,"orientation":"landscape"},{"left":94.474,"top":35.976,"w":3.331,"h":4.512,"orientation":"landscape"},{"left":87.888,"top":36.098,"w":4.012,"h":4.024,"orientation":"landscape"},{"left":74.716,"top":36.341,"w":4.012,"h":3.659,"orientation":"landscape"},{"left":9.992,"top":40.244,"w":8.478,"h":13.659,"orientation":"square"},{"left":25.814,"top":40.244,"w":3.104,"h":6.341,"orientation":"portrait"},{"left":45.193,"top":41.585,"w":3.936,"h":3.659,"orientation":"landscape"},{"left":19.682,"top":41.951,"w":3.709,"h":7.439,"orientation":"portrait"},{"left":75.322,"top":44.39,"w":3.709,"h":6.829,"orientation":"square"},{"left":80.999,"top":44.878,"w":6.662,"h":10.732,"orientation":"square"},{"left":37.245,"top":47.683,"w":18.774,"h":16.707,"orientation":"landscape","discovery":true},{"left":61.014,"top":48.049,"w":5.072,"h":9.268,"orientation":"square"},{"left":67.298,"top":48.049,"w":4.921,"h":9.268,"orientation":"portrait"},{"left":25.814,"top":48.78,"w":10.522,"h":23.293,"orientation":"portrait","discovery":true},{"left":12.188,"top":55.61,"w":12.566,"h":12.805,"orientation":"landscape","discovery":true},{"left":67.373,"top":58.78,"w":17.865,"h":16.463,"orientation":"landscape","discovery":true},{"left":56.851,"top":59.024,"w":8.706,"h":16.22,"orientation":"portrait","discovery":true},{"left":94.474,"top":61.22,"w":3.331,"h":4.39,"orientation":"landscape"},{"left":87.888,"top":61.341,"w":4.012,"h":4.268,"orientation":"landscape"},{"left":2.952,"top":64.024,"w":7.267,"h":16.341,"orientation":"portrait","discovery":true},{"left":40.802,"top":66.463,"w":14.989,"h":17.683,"orientation":"landscape","discovery":true},{"left":87.358,"top":66.707,"w":8.251,"h":17.195,"orientation":"portrait","discovery":true},{"left":14.837,"top":70.61,"w":9.992,"h":25.732,"orientation":"portrait","discovery":true},{"left":25.965,"top":76.098,"w":10.144,"h":8.293,"orientation":"landscape"},{"left":63.437,"top":77.805,"w":4.542,"h":5.976,"orientation":"landscape"},{"left":73.808,"top":78.659,"w":8.706,"h":13.537,"orientation":"square","discovery":true},{"left":91.143,"top":43.5,"w":8.857,"h":14.7,"orientation":"square","interlockTab":true}],"maxReceiveDepthPct":7.5},{"aspect":1.4272,"tiles":[{"left":89.031,"top":2.67,"w":8.503,"h":11.286,"orientation":"square"},{"left":6.973,"top":3.155,"w":5.952,"h":12.985,"orientation":"portrait"},{"left":51.02,"top":6.068,"w":11.905,"h":18.568,"orientation":"square","discovery":true},{"left":65.731,"top":8.01,"w":13.265,"h":7.767,"orientation":"landscape"},{"left":14.711,"top":9.709,"w":2.976,"h":6.432,"orientation":"portrait"},{"left":80.782,"top":9.83,"w":3.997,"h":6.311,"orientation":"square"},{"left":0.0,"top":11.286,"w":3.656,"h":3.519,"orientation":"landscape"},{"left":27.211,"top":12.015,"w":17.602,"h":12.621,"orientation":"landscape","discovery":true},{"left":45.578,"top":12.015,"w":4.592,"h":3.762,"orientation":"landscape"},{"left":0.0,"top":18.932,"w":19.558,"h":18.932,"orientation":"landscape","discovery":true},{"left":73.129,"top":18.932,"w":22.619,"h":14.684,"orientation":"landscape","discovery":true},{"left":21.429,"top":19.539,"w":4.422,"h":3.641,"orientation":"landscape"},{"left":65.816,"top":19.66,"w":4.507,"h":3.519,"orientation":"landscape"},{"left":45.578,"top":20.024,"w":4.507,"h":4.49,"orientation":"landscape"},{"left":34.269,"top":27.184,"w":8.333,"h":14.927,"orientation":"portrait","discovery":true},{"left":28.827,"top":27.427,"w":4.422,"h":4.612,"orientation":"landscape"},{"left":58.333,"top":27.427,"w":4.507,"h":4.612,"orientation":"landscape"},{"left":65.816,"top":27.427,"w":4.507,"h":4.612,"orientation":"landscape"},{"left":21.429,"top":27.67,"w":4.422,"h":4.126,"orientation":"landscape"},{"left":51.02,"top":27.791,"w":4.422,"h":3.762,"orientation":"landscape"},{"left":51.02,"top":35.073,"w":19.813,"h":31.311,"orientation":"square","discovery":true},{"left":21.429,"top":35.437,"w":11.82,"h":13.35,"orientation":"landscape","discovery":true},{"left":43.537,"top":36.165,"w":4.507,"h":3.883,"orientation":"landscape"},{"left":72.874,"top":36.286,"w":13.69,"h":22.087,"orientation":"square","discovery":true},{"left":14.456,"top":43.325,"w":3.486,"h":6.311,"orientation":"portrait"},{"left":36.224,"top":44.66,"w":4.422,"h":3.641,"orientation":"landscape"},{"left":43.622,"top":44.66,"w":4.337,"h":3.519,"orientation":"landscape"},{"left":27.211,"top":50.728,"w":21.088,"h":16.505,"orientation":"landscape","discovery":true},{"left":14.456,"top":51.699,"w":11.82,"h":23.058,"orientation":"portrait","discovery":true},{"left":80.612,"top":60.68,"w":4.507,"h":4.854,"orientation":"landscape"},{"left":73.129,"top":60.922,"w":4.677,"h":4.49,"orientation":"landscape"},{"left":0.0,"top":62.379,"w":13.265,"h":8.738,"orientation":"landscape","discovery":true},{"left":51.361,"top":68.811,"w":7.908,"h":7.039,"orientation":"landscape"},{"left":62.755,"top":69.175,"w":7.908,"h":6.432,"orientation":"landscape"},{"left":75.935,"top":69.175,"w":11.735,"h":14.078,"orientation":"landscape","discovery":true},{"left":89.456,"top":69.175,"w":8.078,"h":8.495,"orientation":"landscape"},{"left":31.293,"top":69.296,"w":16.752,"h":17.476,"orientation":"landscape","discovery":true},{"left":5.697,"top":74.393,"w":6.633,"h":7.403,"orientation":"landscape"},{"left":14.626,"top":78.883,"w":11.395,"h":8.01,"orientation":"landscape"},{"left":50.85,"top":79.248,"w":14.796,"h":14.806,"orientation":"landscape","discovery":true},{"left":89.456,"top":81.068,"w":6.973,"h":5.704,"orientation":"landscape"},{"left":92.432,"top":43.5,"w":7.568,"h":14.7,"orientation":"portrait","interlockTab":true}],"maxReceiveDepthPct":7.5}];



// Gap between adjacent pattern columns, as a percentage of the rendered
// column height. Zeroed per explicit instruction: the seam between two
// patterns must have zero padding, with the interlock tab crossing directly
// from one pattern's edge into the next (Pattern A edge | Pattern B edge,
// not Pattern A edge | gap | Pattern B edge). Previously 1.0 (nudged down
// from a 1.94% measured-gap baseline) when the seam was meant to read as a
// deliberate, if narrow, negative-space line rather than a hard boundary.
// This single constant is the sole spacing mechanism -- it drives both the
// cursorX advance between columns (createGalleryBatch,
// createLeftwardGalleryBatch, and the center-seed initial cursor setup) and
// the seamGapPx term in the tab-tile width formula, so zeroing it removes
// the gap from both without touching either call site. The interlock's own
// physical reach (getInterlockReachPx) is unaffected -- it never referenced
// this constant -- so a tab's reach now lands exactly that far into the
// neighboring pattern instead of first having to cross the old 1%-of-height
// gap.
const SEAM_GAP_PCT = 0;

// Guard window for logo-triggered regeneration (see handleLogoClick below):
// how long to ignore repeat clicks after a regeneration starts, so a burst
// of clicks reads as one deliberate action rather than several queued
// regenerations. Sized to the worst-case entrance-settle time of a freshly
// regenerated gallery -- item.motion.duration (0.72-1.08s, see
// getRandomImageMotion) plus up to ~0.42s of initial-reveal stagger plus up
// to ~0.08s of motion.delay -- with a small buffer rounded up.
const GALLERY_REGENERATION_SETTLE_MS = 1600;

// How long handleExitFocus's own defocus timeline takes to finish (matches
// its `defaults: { duration: 0.45, ... }`) -- used to delay a logo-triggered
// regeneration until the exit-focus animation has actually completed.
const EXIT_FOCUS_DURATION_MS = 450;

// Matches Header.jsx's own VEIL_DURATION_MS -- the same motion vocabulary
// already used for the Filter/Search return-to-homepage veil, reused here
// so a logo-triggered regeneration reads as the gallery track quietly
// settling into a new composition rather than a hard cut. See the
// .gallery-track.is-regenerating rule in styles.css.
//
// Site-wide interface fade, tuned again (Josh review, fourth pass): was
// 520ms, then cut to 180ms (see Header.jsx's VEIL_DURATION_MS, which this
// must stay in sync with) in the previous pass -- still var(--reveal-ease)
// at that point. Still read as too much white interruption, so this pass
// shortens further to 120ms AND moves the matching CSS transitions
// (.page-transition-veil/.gallery-track in styles.css) off
// var(--reveal-ease) onto a plain ease-out -- see Header.jsx's own comment
// for why the easing curve itself, not just the duration, was part of the
// problem. Still one shared "quick interface fade" duration/curve across
// both files.
const GALLERY_FADE_MS = 120;

const clusterPlacements = [
  { axis: "x", direction: -1, distance: 1.08, scale: 0.38 },
  { axis: "x", direction: 1, distance: 1.08, scale: 0.38 },
  { axis: "y", direction: -1, distance: 0.96, scale: 0.34 },
  { axis: "y", direction: 1, distance: 0.96, scale: 0.34 },
  { axis: "x", direction: -1, distance: 1.42, scale: 0.3 },
  { axis: "x", direction: 1, distance: 1.42, scale: 0.3 },
];

const connectorTimings = [
  { duration: 1.28, delay: 0.1 },
  { duration: 1.62, delay: 0.28 },
  { duration: 1.08, delay: 0.18 },
  { duration: 1.83, delay: 0.38 },
  { duration: 1.44, delay: 0.24 },
  { duration: 1.71, delay: 0.46 },
];

const viewportMargin = 28;
const initialGalleryBatches = 3;
const minRenderOverscan = 1200;
const maxRenderOverscan = 3600;

// Bounded Runtime Field pass: how much extra world-space margin, beyond
// the render window's own edges, procedurally-generated content is kept
// in React state / the DOM for -- in multiples of the current viewport
// width. Deliberately generous (several full render-window-widths) so
// ordinary back-and-forth panning and direction reversal never has to
// re-derive the bounded set on every frame; only a long, sustained,
// one-directional pan actually shrinks what's mounted. See
// getGalleryRetentionWindow.
const GALLERY_RETENTION_MARGIN_VIEWPORTS = 4;

// Bounded Runtime Field pass (Round G refinement): how much extra
// world-space margin, beyond the render window's own edges, a
// procedurally-generated BATCH is kept in the bounded batch CACHE for
// (see batchCacheRef) -- in the same "multiples of current viewport
// width" units as GALLERY_RETENTION_MARGIN_VIEWPORTS above, but
// Round H reversal-safety pass: Round G introduced a bounded batch
// CACHE here (GALLERY_CACHE_MARGIN_VIEWPORTS + evictDistantBatches)
// that actually deleted historical batches once the camera moved far
// enough away. That was found, by direct stress testing, to have a
// serious behavioral cost: the underlying generator is not
// seeded/deterministic (see createGalleryBatch's own call sites and
// pickImage/shuffleArray/getRandomBetween, all plain Math.random()),
// so an evicted batch could never be regenerated identically -- and
// extendGalleryIfNeeded only ever generates forward, never backward,
// so an evicted batch was not regenerated AT ALL when revisited. A
// long enough one-directional excursion followed by a full reversal
// could evict enough contiguous batches (including the ones nearest
// the world origin) that the Archive went completely empty -- 0
// items, 0 mounted wrappers -- and stayed that way indefinitely, with
// no self-recovery, until a full regeneration (resize or logo click).
// That eviction has been removed entirely (see batchCacheRef's own
// comment below): historical batches are now retained for the whole
// session, so reversal into any previously-visited world position
// always finds its original tiles again, never an empty result.

// Desktop Zoom + Motion Polish pass: the margin that resets an
// already-revealed tile back to its hidden pre-entrance state once it
// drifts this far past the viewport edge (see isAwayFromViewport's own
// comment in createGalleryRenderer for the full reasoning and the direct
// measurement behind this number). Deliberately kept well under
// minRenderOverscan -- the render window's own smallest possible
// mount/unmount margin -- so a tile is always reset here first, keeping
// animatedImages in sync, before it would ever actually unmount from the
// DOM.
const AWAY_FROM_VIEWPORT_MARGIN_PX = 900;

// Motion-Stability pass: while the Archive is actively moving (see
// isArchiveInMotionRef, threaded into createGalleryRenderer), a tile
// crossing into isNearViewport no longer plays the entrance tween below at
// all -- it is set straight to its final resting state in one frame (see
// updateEntranceAnimations' own comment for why: any local scale/opacity
// animation while the whole world is panning/zooming past it reads as an
// independent object popping, not a stable part of one moving composition,
// which was the investigation's own diagnosis for the reported
// shakiness). These two constant blocks are what a tile animates FROM
// once the camera has genuinely settled and a GENUINELY new tile enters
// view -- deliberately more restrained than the pre-existing initial-load
// treatment just below (INITIAL_REVEAL_*), per the explicit instruction
// that initial page load may keep slightly more visible entrance
// character than tiles encountered during ordinary navigation.
const SETTLED_ENTRANCE_FROM_OPACITY = 0.5;
const SETTLED_ENTRANCE_FROM_SCALE = 0.99;
const SETTLED_ENTRANCE_FROM_BLUR_PX = 3;
// Shorter and fixed (not the randomized 0.72-1.08s initial-load range) --
// this is meant to read as a quiet resolve, not a moment the visitor's
// attention is pulled toward. No y-offset at all (unlike the initial-load
// treatment's 12px slide): a translate reads more like a card sliding in;
// opacity+scale+blur alone reads closer to "an image resolving into
// focus," which is the effect asked for. power2.out, not power3 -- a
// gentler deceleration for a smaller, quieter motion; still no spring/
// elastic/back easing, matching the explicit "not bouncy" instruction.
const SETTLED_ENTRANCE_DURATION = 0.45;
const SETTLED_ENTRANCE_EASE = "power2.out";

// Camera Phase 1: discrete, un-eased zoom step wired to the existing +/-
// controls (see handleZoomStep in App()). No easing, cursor-anchoring, or
// inertia -- a click just moves viewportScaleRef.current by one step,
// clamped to this range. Chosen so the four values this milestone is
// verified against (0.75, 1, 1.5, 2) all land exactly on a step boundary
// starting from the default of 1.
const CAMERA_ZOOM_STEP = 0.25;
const CAMERA_ZOOM_MIN = 0.8;
const CAMERA_ZOOM_MAX = 2.5;

// Camera Phase 2: converts a single wheel event's deltaY into a scale
// delta, fed straight into the same handleZoomStep used by the buttons --
// same clamp, same range, no separate smoothing layer. Continuous rather
// than a fixed step (unlike CAMERA_ZOOM_STEP) because that's what makes
// wheel/trackpad zoom feel native; it's still a single, immediate,
// un-eased assignment per event, not smoothing. A plain default, easy to
// retune.
const CAMERA_ZOOM_WHEEL_SENSITIVITY = 0.01;

// Desktop Zoom + Motion Polish pass: a single discrete mouse-wheel notch
// reports deltaY around 100 in Chrome/Firefox/Safari's pixel delta mode --
// at CAMERA_ZOOM_WHEEL_SENSITIVITY above, that one notch produces a raw
// delta of 1.0, more than half of the entire CAMERA_ZOOM_MIN..MAX span
// (1.7) in a single, un-eased, instantly-applied event (measured directly:
// one notch took the Archive from scale 1 to scale ~2.25, a 2.25x jump).
// That reads as exactly the "exaggerated"/"mechanical" zoom this pass was
// asked to remove -- the sensitivity constant above was evidently tuned
// only against trackpad-pinch's own much smaller per-frame deltaY values
// (a continuous gesture built from many small events), never against a
// single discrete wheel notch, which is why it was left "easy to retune"
// in its own comment above.
//
// This is a per-EVENT ceiling, not a sensitivity change -- deliberately
// separate from CAMERA_ZOOM_WHEEL_SENSITIVITY itself, and applied only in
// handleWheel's own ctrlKey branch below, never inside handleZoomStep.
// Keeping it out of handleZoomStep matters: that function is also the
// mobile pinch handler's own call path (see handleTouchMove's pinch
// branch) and the +/- buttons' (CAMERA_ZOOM_STEP = 0.25, already below
// this ceiling and therefore unaffected either way) -- a cap inside
// handleZoomStep itself would silently retune mobile pinch sensitivity
// too, which this pass must not touch. A real trackpad-pinch gesture's
// own per-frame deltaY is normally well under the raw-delta value this
// ceiling would even engage at, so this only ever clips the rare large
// spike (a fast discrete notch, or an outlier trackpad frame), leaving
// genuine continuous trackpad-pinch feel exactly as it already was.
const CAMERA_ZOOM_WHEEL_STEP_MAX = 0.12;

// Camera Feel pass: viewportScaleRef no longer jumps straight to whatever
// handleZoomStep asks for -- it eases toward a separate targetScaleRef
// every animation frame (see the per-frame zoom-ease block in
// updateGalleryMotion), the exact same ease-toward-target idiom this file
// already uses for viewportDrawerScaleRef (FILTER_DRAWER_ZOOM_EASE = 0.14)
// and updateEntranceAnimations' own smoothScale (0.14). This constant is
// tuned separately from those, deliberately snappier: 0.14 measured too
// sluggish for the PRIMARY zoom control (visibly lagging behind a
// deliberate wheel gesture), where the drawer's own 0.14 is a passive,
// rarely-noticed accommodation that has no such responsiveness demand.
// 0.22 settles a step in ~5-6 frames (~90ms) -- fast enough to read as
// "responsive, not delayed" while still visibly interpolating rather than
// snapping (see CAMERA_ZOOM_MIN/MAX's own ~1.7 span -- even a full-range
// jump now glides smoothly instead of stepping). Mobile pinch does NOT
// use this ease -- see its own call site's comment for why it stays on
// the instant, per-frame-exact path it already had.
// Desktop Archive Zoom Polish pass: nudged from 0.22 -> 0.3. The
// cursor-anchor correction in applyZoomAnchor is an exact algebraic
// solve re-applied every single frame the scale actually changes -- not
// an approximation -- so this is not fixing a wrong formula. What it
// does fix is duration: at 0.22 the displayed scale visibly trails
// targetScaleRef for several more frames after a wheel/trackpad zoom
// input, and for as long as that catch-up is happening the anchored
// point is still visibly sliding into its final position rather than
// reading as locked under the cursor -- the same lag also reads as
// "heavier"/slower overall. 0.3 still glides (not an instant snap -- see
// this constant's own original comment on why snapping was rejected)
// but settles in noticeably fewer frames, so the anchor reads as
// grabbing hold of the cursor's point sooner. Zoom min/max, direction,
// and the anchor formula itself are all completely untouched.
const CAMERA_ZOOM_EASE = 0.3;

// Matches the snap-to-target epsilon convention already used for
// viewportDrawerScaleRef above (0.0005) -- once within this distance of
// the target, snap exactly to it rather than asymptotically approaching
// forever, so the camera settles at a precise, final scale.
const CAMERA_ZOOM_SETTLE_EPSILON = 0.0005;

// True 2D Cursor Zoom pass: the fraction of the track's available vertical
// overflow (see applyZoomAnchor's own comment for the full derivation) the
// Y pan correction is allowed to actually use. Kept below 1 so a fraction
// of the overflow always stays in reserve as a visible margin -- at REACH=1
// the composition could shift exactly far enough that one edge of the
// track lines up perfectly with the opening's own boundary (zero slack on
// that side).
//
// Value history: total available overflow is small near neutral scale by
// construction (it is proportional to (scale - 1) -- there simply isn't
// much extra track height to redistribute yet), so a conservative REACH
// made the bound engage even for fairly ordinary cursor positions at
// modest zoom -- measured directly: a cursor only ~100px off center (22%
// of the opening's own half-height) combined with a mild 3-notch zoom to
// scale 1.16 already exceeded a REACH of 0.7's bound. That reads as "the
// composition barely responds to where I'm looking" for exactly the
// ordinary case this pass is meant to fix, not just an extreme edge case.
// 0.88 leaves a smaller but still real 12% margin -- confirmed (same
// measurement) to no longer clamp that moderate case, while the aggressive
// far-off-center + heavy-zoom cases this pass also tested still clamp
// well before the opening's true boundary.
const CAMERA_VERTICAL_ANCHOR_REACH = 0.88;

// Default-overview Y lock (real-device refinement pass): at the mobile
// default overview (MOBILE_DEFAULT_CAMERA_SCALE = 1.05, untouched),
// free one-finger vertical pan should read as effectively locked --
// horizontal one-finger exploration stays fully active, and PINCH's own
// midpoint Y-anchor correction (viewportPanYRef/applyZoomAnchor,
// completely separate and untouched by this) remains fully 2D at every
// scale. Only the FREE-pan budget derived in animateGallery below is
// gated. CAMERA_FREE_PAN_Y_ACTIVATION_SCALE sits far enough above the
// default that ordinary zoom-ease settle/rounding noise around 1.05
// never crosses it, while a real, deliberate pinch -- which moves scale
// by whole increments of CAMERA_ZOOM_STEP (0.25) per discrete step, and
// far more per an actual two-finger gesture -- clears it almost
// immediately. CAMERA_FREE_PAN_Y_FULL_SCALE is where the existing,
// already-derived geometry budget becomes fully available; between the
// two, the budget ramps linearly from 0 to that full value every frame
// (see freePanYActivation below) rather than snapping open the instant
// the threshold is crossed, and -- since this ramp is recomputed fresh
// from the LIVE effective scale every frame, the same way the geometry
// budget itself already was -- zooming back down through this same
// range automatically shrinks the budget back toward 0 in lockstep,
// which is also what cleanly recenters any accumulated free-Y offset on
// the way back to overview with no separate reset needed.
const CAMERA_FREE_PAN_Y_ACTIVATION_SCALE = 1.15;
const CAMERA_FREE_PAN_Y_FULL_SCALE = 1.35;

// Weighted Dial Pan Feel pass: friction/impulse/cap constants for the
// EXISTING velocity+friction pan model (see animateGallery/
// addGalleryVelocity in App()) -- no new physics system, this pass only
// retunes these three numbers plus adds a soft input curve ahead of them
// (see softenWheelPanDelta). Wheel/trackpad and single-finger touch-drag
// are kept deliberately separate here (CAMERA_PAN_WHEEL_* vs
// CAMERA_PAN_TOUCH_*) because they share ONE velocity accumulator and ONE
// friction value (movement.velocity, decayed once per frame in
// animateGallery, regardless of which input produced it) but must not
// share IMPULSE tuning: retuning wheel's own feel must not silently
// retune mobile finger-drag, which this pass is explicitly not allowed to
// touch. CAMERA_PAN_TOUCH_IMPULSE_COEFF/CAP below are therefore the exact
// prior shared values (0.16, 42), now applied only at the touch call site,
// preserving touch-drag's per-pixel responsiveness byte-for-byte. Only
// CAMERA_PAN_FRICTION is unavoidably shared -- there is only one
// movement.velocity and one decay step, so a heavier/longer decay tail is
// the one honest, minimal side effect this pass has on mobile pan (see the
// friction constant's own comment for the full reasoning); it does not
// change touch's peak per-frame responsiveness while a finger is actively
// dragging, only how long the glide continues after it lifts.
//
// Prior wheel-side behavior: addGalleryVelocity multiplied every event's
// raw (already deltaMode-normalized) delta by a flat 0.16, then hard-
// clamped the RESULT to +-42 -- both a per-event linear multiplier and a
// cliff-edge outer bound, together producing the "a single mouse notch
// visibly snaps the Archive" feel this pass was asked to remove.
//
// CAMERA_PAN_WHEEL_SATURATION_PX is the input-side soft-saturation knee
// (see softenWheelPanDelta) -- roughly the raw-delta magnitude of a single
// discrete mouse-wheel notch (measured ~100-120px in pixel delta mode), so
// one notch sits meaningfully into the curve's taper rather than the
// purely linear region, while a small trackpad frame (a few px) still
// passes through nearly 1:1 -- "precise for a small nudge, diminishing for
// a big one," not a step function.
//
// Value history: an initial 85 (tighter than one notch's own ~110 raw
// magnitude) was measured to compress a single hard flick (300 raw) down
// to a 144px total glide, a 73% reduction from the pre-pass 525px --
// clearly overshooting "less twitchy" into "a flick barely moves,"
// violating this pass's own explicit "a flick should glide" requirement.
// 110 -- roughly one notch's own magnitude, rather than well under it --
// keeps a single notch close to the curve's linear region (still soft,
// still meaningfully gentler than the old uncompressed multiply) while
// letting a genuinely large flick retain most of its raw magnitude before
// tapering, since tanh's own bend only becomes pronounced well past its
// argument reaching ~1.
// Casual Stroll pass (governor retune): lowered from 110 to 60. The prior
// value's own job -- keep one notch close to the curve's near-linear
// region, let a flick retain most of its magnitude before tapering -- is
// still what this does, just against a smaller reference: 60 is closer to
// a SMALL trackpad frame's own magnitude than a full mouse notch's, so
// the curve's soft-resistance region now starts engaging noticeably
// sooner (item 8's "small delta near-linear, medium increasing
// resistance, very large delta strong diminishing returns" -- a lower
// knee pulls "medium" earlier without adding a hard clip anywhere).
// Tested alongside two less-restrained siblings (Candidate A: 90,
// Candidate B: 75) that both measurably reduced peak speed and travel but
// left an aggressive flick well above what this pass's own perceptual
// check (a screenshot filmstrip during an aggressive flick, watching
// individual tiles) still called comfortably readable -- see this pass's
// own report for the full three-way comparison. 60 is Candidate C, the
// one selected.
const CAMERA_PAN_WHEEL_SATURATION_PX = 60;
// Applied AFTER softening, converting the softened raw delta into a
// velocity contribution.
//
// Value history, both measured with verify-pan-feel's own frame-by-frame
// capture (continuous-trackpad steady-state speed and single-flick total
// glide distance, against this pass's own pre-tuning baseline of
// steady=24.0, flick-glide=525px):
//   0.085 + 85px saturation:  steady~20  (83%), flick-glide=144px (27%)
//     -- flick crushed far more than steady-state was calmed; violates
//     "a flick should glide."
//   0.11  + 110px saturation: steady~24  (100%, UNCHANGED) -- raising
//     CAMERA_PAN_FRICTION from 0.92 to 0.95 alone increases the
//     steady-state multiplier 1/(1-friction) by 60% (12.5 -> 20), which
//     an impulse coefficient only "roughly half the old value" does not
//     come close to offsetting; sustained-scroll cruising speed came out
//     essentially the same as before, not calmer.
//   0.085 + 110px saturation (final): steady~20 (85%), flick-glide~185px
//     (35%) -- the wider saturation knee (110, roughly one notch's own
//     magnitude, rather than the initial 85) keeps a genuine flick's
//     raw magnitude mostly intact through the soft-saturation stage, so
//     the SAME impulse coefficient that calms sustained small-delta
//     input by ~15% only pulls a single large flick down to about a
//     third of its old glide distance -- still clearly, deliberately
//     shorter (an intentional part of "heavier, more controlled"), but
//     nowhere near crushed to imperceptible.
// Precision Dial Pan Weight pass: lowered from 0.085. The Stage-2 ease
// added below (CAMERA_PAN_WHEEL_ACCEL_EASE) reshapes WHEN an impulse's
// energy arrives on screen -- delayed, ramped -- but a first-order ease
// toward a target conserves that target's total area over time (it is a
// normalized weighted average, DC gain 1), so leaving this coefficient
// alone would have kept total per-notch travel almost exactly what it was
// before this pass (measured: 127.9px new vs a derived 134.8px old for an
// identical single ordinary notch -- only a ~5% difference, from ease-
// stage/frame-quantization edge effects, not a real reduction). The user's
// explicit success criterion was travel that is NOT merely reshaped but
// noticeably LESS ("The Archive should move LESS for a normal scroll
// gesture than it currently does"), so this had to drop too. 0.05 (down
// from 0.085) pulls one ordinary notch's total travel to ~79px, a ~41%
// cut from the ~135px old baseline, while a flick (deltaY=400) drops by
// the same ~41% proportionally (~187px -> ~110px) rather than being
// crushed disproportionately -- both scale together because this
// coefficient sits upstream of softenWheelPanDelta's own shape, so their
// RATIO (flick still travels meaningfully further than a notch) is
// preserved. Verified against actual dispatched WheelEvent sequences, not
// just this formula -- see verify-pan-weight.mjs's ordinaryNotch/
// strongFlick scenarios.
// Casual Stroll pass: lowered from 0.05 to 0.015 -- the single largest
// lever behind this pass's own primary goal (lower the MAXIMUM speed, not
// just reshape the tail). Measured against actual dispatched WheelEvent
// sequences (verify-pan-calibration.mjs), a single ordinary notch's total
// travel dropped from ~75px to ~16px (a 79% cut), and an aggressive
// trackpad-style flick's peak screen velocity dropped from ~1480px/s to
// ~337px/s (a 77% cut) -- confirmed both numerically and by watching an
// actual screenshot filmstrip of the flick: individual tiles stay
// trackable across frames at every candidate tested, but only this one
// (of the three compared) reads as a genuinely restrained, deliberate
// stroll rather than "calmer but still quick." See this pass's own
// report for the full A/B/C comparison and the user's explicit
// instruction to bias toward the more restrained candidate.
const CAMERA_PAN_WHEEL_IMPULSE_COEFF = 0.015;
// Casual Stroll pass: lowered from 30 to 9 -- this pass's own explicit
// "governor" requirement (a hard outer ceiling on achievable speed,
// regardless of how hard or how long the input). Confirmed via direct
// measurement that the old cap of 30 WAS the practical binding
// constraint under sustained/aggressive input, not merely a rarely-
// engaged backstop as its own prior comment assumed: baseline testing
// this pass measured a sustained trackpad stream reaching ~22px/frame
// and an aggressive flick reaching ~25px/frame, both approaching the old
// 30 ceiling. At 9, the same aggressive flick now peaks around 5.6px/
// frame (~337px/s) -- slow enough that a static screenshot filmstrip
// taken every 120ms during the flick still shows every tile in a
// trackable, non-overlapping position, matching the user's own
// perceptual acceptance test ("watch the images... visually track the
// larger images as they move past").
const CAMERA_PAN_WHEEL_VELOCITY_CAP = 9;
// Exact prior values, see this block's own opening comment.
const CAMERA_PAN_TOUCH_IMPULSE_COEFF = 0.16;
const CAMERA_PAN_TOUCH_VELOCITY_CAP = 42;
// Up from 0.92 -- see animateGallery's own friction comment for the
// empirical settle-time comparison behind this exact value. Touch-drag's
// OWN decay constant as of the Precision Dial Pan Weight pass -- see
// CAMERA_PAN_WHEEL_FRICTION below for why wheel now has a separate one.
const CAMERA_PAN_FRICTION = 0.95;
// Precision Dial Pan Weight pass: wheel's own Stage-1 target-velocity
// decay rate, deliberately split out from CAMERA_PAN_FRICTION now that
// wheelVelocity/touchVelocity are separate accumulators (see
// movement.wheelVelocity/touchVelocity's own comments) -- previously
// wheel and touch had NO choice but to share one friction constant
// because they shared one velocity field; this pass's own instructions
// explicitly called for separating a desktop-only parameter/path rather
// than ever risking touch's decay as a side effect of retuning wheel, so
// this exists even though its value happens to match touch's for now.
// Kept equal to CAMERA_PAN_FRICTION (0.95) rather than shortened: the
// "less travel" goal is met by injecting less force per input
// (CAMERA_PAN_WHEEL_IMPULSE_COEFF, see its own comment) rather than by
// cutting the tail short -- shortening decay was explicitly the wrong
// lever here, since the user separately said WEIGHT is not simply a
// longer-or-shorter coast, and a shorter tail right after finally getting
// the weighted, gradual-buildup character this pass was asking for would
// have undercut the same "substantial, not lightweight" feel from the
// other direction.
const CAMERA_PAN_WHEEL_FRICTION = 0.95;

// Precision Dial Pan Weight pass: the Weighted Dial pass above only ever
// shaped the SIZE of each wheel impulse (soft saturation) and how long the
// tail lasted after input stopped (friction) -- it never changed HOW an
// impulse turned into on-screen motion. addGalleryVelocity wrote straight
// into the same movement.velocity that animateGallery reads and converts
// into a screen move on that exact same frame, so however small a single
// wheel event's contribution was, it still landed as one instantaneous
// jump in the real, visible velocity. That is the confirmed reason the
// Archive still read as "immediately responsive" / "shifty" despite the
// longer decay: there was never an acceleration-limiting stage, only a
// smaller-instant-jump-plus-longer-tail stage.
//
// Fix: wheel input is now two-stage, reusing this file's own established
// ease-toward-target idiom (already proven for viewportScaleRef ->
// targetScaleRef and viewportDrawerScaleRef) rather than inventing a new
// physics system. Stage 1 (movement.wheelVelocity) is exactly the OLD
// model -- a target/force accumulator that absorbs each softened wheel
// impulse and decays via CAMERA_PAN_FRICTION every frame, unchanged. Stage
// 2 (movement.appliedWheelVelocity) is new: it eases toward Stage 1's
// current value every frame at this rate, and Stage 2 -- not Stage 1 -- is
// what actually feeds worldDelta/on-screen movement. A single wheel notch
// now ramps the real applied velocity up over several frames instead of
// assigning it outright, which is what turns "input -> immediate
// displacement -> long tail" into "input force -> restrained acceleration
// -> velocity builds progressively -> controlled momentum -> smooth
// deceleration" (the user's own stated target shape). Touch-drag is
// deliberately NOT routed through this second stage -- it keeps writing
// directly into its own movement.touchVelocity (see addTouchPanVelocity),
// so finger tracking stays exactly as immediate/lag-free as before this
// pass.
//
// Value: 0.13. Matched against this file's two other ease-toward-target
// rates -- CAMERA_ZOOM_EASE (0.22 at the time this comparison was written,
// since retuned to 0.3 by the Desktop Archive Zoom Polish pass -- see
// that constant's own current comment; the comparison's conclusion is
// unaffected, since 0.3 reads as even MORE quick/responsive, not less)
// reads as quick/responsive by design, since zoom is a discrete
// per-notch action the user expects to track promptly. Pan needed to read
// as heavier/more resistant than that, not merely different, so 0.13
// (~7.2-frame time constant, ~120ms to 63%, ~360ms to ~95% caught-up) sits
// clearly slower than zoom's ease while still resolving well within a
// single deliberate gesture rather than lagging behind it -- verified
// empirically against 0.10 (felt like the camera was chasing input by a
// perceptible beat during rapid repeated notches -- too close to "laggy",
// which the user explicitly said this must not become) and 0.18 (a single
// ordinary notch's peak applied velocity was measurably closer to Stage
// 1's instant peak again, eroding the "restrained acceleration" the whole
// second stage exists to create).
const CAMERA_PAN_WHEEL_ACCEL_EASE = 0.13;

// Camera state/control split: Camera owns scale + pan, but does not decide
// when they should return to default -- that decision belongs to whatever
// higher-level behavior is generating a new gallery world (see
// resetCameraToNeutral / regenerateGallery in App()). These are simply the
// Camera's own default values, same ones the refs below are initialized to.
const CAMERA_NEUTRAL_SCALE = 1;
const CAMERA_NEUTRAL_PAN = 0;

// Layout Bug Fix -- Gallery Shift on Filter Open (Camera-based revision):
// the Filter drawer's own influence on the gallery's viewport, expressed
// entirely as a second, independent input into Camera's existing scale --
// never a new transform, never a position change. viewportScaleRef stays
// exactly what it always was (the visitor's own zoom level, via the zoom
// controls/wheel/pinch); this is a separate multiplier the drawer alone
// controls, combined with viewportScaleRef only at the point Gallery
// Renderer actually projects/paints (see getEffectiveScale in
// createGalleryRenderer), so handleZoomStep/resetCameraToNeutral/the zoom
// clamp range are untouched and cannot conflict with it. Because
// getVerticalScaleCompensation and projectWorldToScreenX already center
// and anchor around whatever scale they're given, this combined value
// gets that same centering for free -- no new vertical/horizontal
// centering math is needed for the drawer at all, for any drawer state --
// see updateGalleryMotion's own comment (in App()) for the derivation of
// exactly how much scale reduction any given drawer height needs, and why
// it is a real formula rather than a flat guess.
//
// Per-frame ease-toward-target rate for viewportDrawerScaleRef, in the same
// smoothX/smoothY/smoothScale lerp style updateEntranceAnimations already
// uses (see its own `smoothScale + (targetScale - smoothScale) * 0.14`) --
// reusing that exact idiom rather than inventing a new easing approach.
const FILTER_DRAWER_ZOOM_EASE = 0.14;

// The drawer's own scale reduction is bounded here, deliberately separate
// from CAMERA_ZOOM_MIN/MAX. Those describe how far a VISITOR may
// deliberately zoom out by choice; this describes how far an AUTOMATIC
// accommodation is allowed to go before it would stop reading as "subtly
// making room" and start reading as a jarring, unrequested shrink.
//
// Value history: originally 0.85, on the assumption that only a heavily
// expanded "View All" list would ever need more than a 15% reduction --
// Row 2 alone (Filter closed/opening/default single row) genuinely never
// approaches it. Tracing an actual Row 3 clearance gap (Theme/Project/
// Year's own value panel dropping over the archive instead of the gallery
// making room for it) found that assumption didn't hold: the derived
// formula in updateGalleryMotion regularly asks for more than a 15%
// reduction the moment ANY category's Row 3 opens, even in its ordinary,
// non-"View All" state -- not only the extreme long-list case this floor
// was originally calibrated against. Lowered to 0.7 so Row 3's ordinary
// state gets the full reduction it actually needs, while a bound still
// remains in place for a genuinely long expanded "View All" list -- past
// this floor, the composition stops shrinking further and simply relies
// on the pre-existing .scroll-container--drawer-open dim (see styles.css)
// for whatever clearance the bounded scale alone can't provide, exactly
// as before -- the same "dim rather than distort" fallback this codebase
// already uses, not a new one invented for this case.
const FILTER_DRAWER_ZOOM_FLOOR = 0.7;

// Mobile Archive Interaction Pass -- Stage 1 (Mobile Archive Geometry):
// mobile UI mode's own default camera scale, deliberately separate from
// CAMERA_ZOOM_MIN/MAX/desktop's own default (see viewportScaleRef and
// resetCameraToNeutral in App(), both gated on isMobileUiModeRef). The
// Archive previously opened/reset at CAMERA_ZOOM_MIN (0.8x, the zoom-out
// floor) on every device -- on mobile this is what the investigation found
// contributing to "images too small," independent of the header/footer
// clearance fix below.
//
// Mobile Archive Zoom Correction: re-audited against a supplied visual
// target ("still see a substantial portion of the field, many images at
// once, NOT an overly close/cropped view") after 1.4 (a prior pass's
// 1.15 -> 1.4, +CAMERA_ZOOM_STEP) read as too far in. The math that pass
// used compounded an already mobile-specific starting point (1.15, itself
// already a deliberate bump above neutral) instead of the real canonical
// base -- resetCameraToNeutral's own comment below is explicit that
// CAMERA_ZOOM_MIN (0.8), not CAMERA_NEUTRAL_SCALE (1x), is the actual
// "normal/default Archive overview" every visitor (desktop and, before
// any mobile override existed, mobile too) starts at and returns to on
// reset. "One press of the existing + control from the normal/default
// overview" is therefore CAMERA_ZOOM_MIN + CAMERA_ZOOM_STEP = 0.8 + 0.25
// = 1.05 (handleZoomStep below applies CAMERA_ZOOM_STEP as a plain
// additive delta to the current scale, clamped to CAMERA_ZOOM_MIN/MAX --
// no other transformation), not 1.4. 1.05 is only barely above
// CAMERA_NEUTRAL_SCALE (1x) -- a small, deliberate nudge in from the
// zoomed-OUT floor, not a jump toward a closer/cropped view, which
// matches the supplied target's own "substantial portion of the field,
// many images visible" description far better than 1.4 did.
// CAMERA_ZOOM_MIN/MAX/CAMERA_ZOOM_STEP are untouched -- a mobile visitor
// can still pinch/zoom-button all the way out to the same 0.8x floor as
// desktop if they choose; only where the Archive STARTS (and what a
// regeneration resets to) changes on mobile.
const MOBILE_DEFAULT_CAMERA_SCALE = 1.05;

// Mobile Archive Interaction Pass -- Stage 1 (Header/Footer Clearance):
// the investigation found the Archive's top/bottom clearance on mobile
// reserved via one shared, ungrounded formula (clamp(vh*0.14, 105, 145) for
// both edges) even though the real header and the real zoom controls
// (~44px) are very different sizes -- see getViewportOpeningGeometry's own
// comment below for the full reasoning. These two fallbacks are ONLY the
// bootstrap value used for the very first paint, before Header's/App's own
// ResizeObserver measurements (headerHeightRef/zoomControlsHeightRef, see
// App()) have reported a real number -- they are not a second guessed
// formula that governs ongoing layout the way the old shared clearance
// was. Deliberately close to the real measured sizes so the first paint
// (before measurement lands) is already close to correct rather than
// flashing an oversized gap.
//
// Mobile Header/Search/Menu Refinement Pass -- Section 1: the header's own
// real mobile height changed from ~92px to ~132px (12px top padding +
// .site-header__row1's own new 120px height, see that rule's own comment
// in styles.css for why) as part of fixing the header's box-height
// coverage bug -- this fallback is updated to match so the very first
// paint already reserves the correct clearance instead of a brief
// undershoot before the real ResizeObserver measurement lands a moment
// later.
//
// Mobile Header Compaction Pass: row1 itself dropped again, from 120px to
// 64px (see .site-header__row1's own comment in styles.css -- .top-menu no
// longer needs a taller box to contain a second, lower offset row now
// that it shares the logo's own row instead), so this fallback is updated
// to match the header's new real height one more time: 12px top padding +
// row1's own new 64px = 76px. Same purpose as before -- only the number
// changes, so the very first paint (before headerRef's ResizeObserver has
// measured anything real) already reserves the correct, now much smaller,
// clearance instead of briefly over-reserving space for the old, taller
// header.
const MOBILE_HEADER_HEIGHT_FALLBACK_PX = 76;
const MOBILE_ZOOM_CONTROLS_HEIGHT_FALLBACK_PX = 44;

// Small, deliberate breathing margin added on top of each real measurement
// -- not a second clearance formula, just a bit of air between the chrome's
// own measured edge and the Archive composition/clip boundary next to it.
const MOBILE_HEADER_BREATHING_MARGIN_PX = 8;
const MOBILE_ZOOM_CONTROLS_BREATHING_MARGIN_PX = 10;

// Mobile Archive Interaction Pass -- Stage 1C (Safe Area): reads the real
// env(safe-area-inset-*) values via the CSS custom properties styles.css
// defines on :root (env() itself has no direct JS accessor) -- see
// --safe-area-inset-top/--safe-area-inset-bottom in styles.css. Falls back
// to 0 on any browser without safe-area support, or before layout has
// happened, rather than throwing/NaN-ing the clearance math that consumes
// this.
// Mobile Archive Interaction Pass -- Stage 0 (Gesture Correctness
// Foundation): tap-vs-drag disambiguation thresholds. The investigation
// found no tap-vs-drag disambiguation existed anywhere in this codebase --
// every touchend risked becoming a synthetic click purely on the browser's
// own undocumented heuristic. TAP_MOVEMENT_THRESHOLD_PX is deliberately a
// little above the ~10px a native touch tap-suppression heuristic
// typically uses: this is a virtual, transform-driven world (not native-
// scrolled DOM), so even sub-native-threshold finger movement already
// imparts real camera velocity (addTouchPanVelocity has no minimum-delta
// gate) -- a slightly larger threshold here is what keeps a slow,
// deliberate small drag from being misread as a tap.
const TAP_MOVEMENT_THRESHOLD_PX = 14;
// A generous cap, not a strict "tap must be fast" rule -- this only rules
// out an unusually long touch-and-hold-without-moving from being treated
// the same as a quick, deliberate tap; ordinary taps land far under this.
const TAP_MAX_DURATION_MS = 600;
// Mobile Tile Eligibility pass (Locked Mobile Hierarchy): the physical
// floor a tile's own rendered box (item.layout.width/height -- real
// pixel values computed once at gallery-build time, the same numbers
// getGalleryImageSizes above already parses via Number.parseFloat, and
// the same box the rendered <img> and .hover-overlay exactly fill) needs
// to clear before a NON-Project-linked tile becomes a touch selection
// surface at all -- see handleGalleryTileTap's own use of this below.
// Below this floor, a non-Project tile is "Thumbnail tier": no
// tap-reveal, no card, no Archive Number, ever -- it stays a purely
// visual archive fragment, and its own tap is treated exactly like a tap
// on empty Archive canvas (dismiss whatever else is open, nothing more).
// A Project-linked tile is never excluded this way, at any size -- see
// the Final Mobile Interaction Model pass immediately below for why.
//
// Derived the same way this codebase's other physical-fit floors are
// (see .hover-overlay__themes' and .hover-overlay__enter-project's own
// derivation comments in styles.css): .hover-overlay's own safe-area
// padding (0.5rem * 2 = 16px each axis) plus .hover-overlay__number at a
// comfortable size (its own 0.2rem/0.5rem padding plus roughly one line
// of text) needs on the order of 65-70px width / 38-40px height to read
// as "physically fits comfortably," not clipped or crowded -- rounded up
// to a clean, slightly more generous floor here.
const MOBILE_SELECTABLE_TILE_MIN_WIDTH_PX = 80;
const MOBILE_SELECTABLE_TILE_MIN_HEIGHT_PX = 48;
// Final Mobile Interaction Model pass (consistency cleanup, not a new
// threshold experiment): this constant now has two jobs for a
// Project-linked tile -- (1) deciding whether HoverOverlay applies its
// own reduced, thumbnail-scale safe-area padding
// (.hover-overlay--thumbnail-inspected, see isThumbnailTier at both call
// sites below), and (2), as of the Single Presentation Authority pass
// below, deciding whether View Project renders at all. It never decides
// navigation, on either job: a second tap anywhere on an already-
// inspected, Project-linked tile navigates uniformly across every tier
// regardless of this constant -- see handleGalleryTileTap below. Its one
// remaining job, for a non-Project tile, is the plain selection-surface
// floor described in this constant's own declaration comment above.

// Single Presentation Authority pass: an intermediate pass introduced a
// second, independent width/height gate here
// (MOBILE_VIEW_PROJECT_PRESENTATION_MIN_WIDTH_PX/_HEIGHT_PX, 120x72,
// plus its own isTooSmallForViewProject boolean and HoverOverlay prop)
// specifically because isThumbnailTier's own 80x48 floor was derived to
// fit Archive Number ALONE, never the two-element Number + View Project
// pairing -- real tiles could clear 80x48 while still being too cramped
// for View Project's composition. That reasoning was sound, but the fix
// was the wrong shape: it duplicated isThumbnailTier's own
// width-or-height-floor pattern as a second, freestanding threshold
// rather than building on it, effectively renaming the same kind of
// arbitrary presentation cutoff it was meant to replace. Removed
// entirely -- see HoverOverlay.jsx's own render condition and its own
// prop comment for the current state. isThumbnailTier is now the ONLY
// presentation authority for View Project too: the real fix for
// "80x48 only fits Number comfortably" is not a second, higher
// threshold, it's redesigning the mobile-inspected typography (Archive
// Number's own font-size/padding under touch, .hover-overlay__project-
// stack's own gap, View Project's own font-size/line-height/padding --
// see those rules' own styles.css comments) so the SAME composition
// this constant's floor already guarantees room for actually fits
// within it, all the way down to 80x48, using continuous cqmin/clamp()
// scaling rather than a second breakpoint. Above 80x48, typography
// scales up continuously; below it, isThumbnailTier is already true and
// View Project never attempts to render at all.
// How long after a pinch gesture ends a stray touchend on the finger(s)
// that were part of it should still be treated as "part of that pinch
// ending," not a fresh tap -- short and purposeful, just enough to absorb
// the moment a lifting finger's own travel happens to look tap-sized on
// its own.
const POST_PINCH_TAP_COOLDOWN_MS = 300;

function getSafeAreaInsetPx(customPropertyName) {
  if (typeof document === "undefined") return 0;
  const raw = getComputedStyle(document.documentElement).getPropertyValue(
    customPropertyName,
  );
  const parsed = Number.parseFloat(raw);
  return Number.isFinite(parsed) ? parsed : 0;
}

// Engine Contract: guaranteedWorldReach -----------------------------------
//
// The single spatial promise procedural generation and the render window
// both consume -- the ONLY concept either system is allowed to know about
// the other through. It answers one question: how far beyond the
// composition's neutral edges must the world be treated as real? It is
// computed once from the full envelope of presentation states this
// engine supports (CAMERA_ZOOM_MIN, FILTER_DRAWER_ZOOM_FLOOR -- the
// fixed BOUNDS those systems are already clamped to), never from
// viewportScaleRef.current or viewportDrawerScaleRef.current, which
// change continuously at runtime. A value derived from live state would
// have to be re-chased every frame and could lag behind an in-progress
// zoom or drawer animation; a value derived from the supported RANGE is
// already correct for every state the camera could ever reach, with
// nothing to catch up to.
//
// Neither consumer needs to know why this number is what it is.
// createLeftwardGalleryBatch (DGPC) will receive it as a plain
// generation boundary, the same way it already receives
// worldCanvasHeight without knowing Application Layout derived that
// from header/footer clearance. getGalleryRenderWindow will receive it
// as a plain mounting boundary, the same way it already receives
// viewportWidth. Neither file needs to reference CAMERA_ZOOM_MIN or
// FILTER_DRAWER_ZOOM_FLOOR directly -- only this function does, which
// is what keeps zoom/drawer/camera knowledge out of generation, and
// procedural-generation knowledge out of rendering.
//
// A function, not a frozen constant, for the same reason
// getGalleryRenderWindow/getViewportOpeningGeometry already are one: it
// reads window.innerWidth, which changes on resize.
//
// Derivation: projectWorldToScreenX resolves to screenX = worldX at the
// neutral camera state (distance=0, scale=1, pan=0), so the world-space
// width visible across the full screen at any scale s is
// viewportWidth / s. Zoom is anchored at screen center (the world point
// at distance + viewportWidth/2 always projects to viewportWidth/2), so
// it reveals width symmetrically -- half of the extra width beyond the
// neutral view appears on each side. The worst case this contract must
// cover is the lowest reachable effective scale: the visitor's own zoom
// floor combined with the drawer's own automatic floor
// (CAMERA_ZOOM_MIN * FILTER_DRAWER_ZOOM_FLOOR) -- both independent,
// both can bind at once (see getEffectiveScale in createGalleryRenderer).
function getGuaranteedWorldReach() {
  const viewportWidth =
    typeof window === "undefined" ? 1200 : window.innerWidth;
  const worstCaseScale = CAMERA_ZOOM_MIN * FILTER_DRAWER_ZOOM_FLOOR;

  return (viewportWidth * (1 / worstCaseScale - 1)) / 2;
}

// getImageName/isLocalImageAsset/isSanityImageAsset/getOptimizedImageSrc/
// getOptimizedImageSrcSet now live in ./imageOptimization.js, imported
// above -- extracted (Project Page image-loading polish, Josh review) so
// ImageViewer.jsx can request the exact same appropriately-sized,
// pre-optimized/Sanity-transformed image variants this gallery already
// does, from one shared source instead of a second, possibly-drifting
// copy. See that file's own comments for the full reasoning.

// Archive image-quality floor pass: `sizes` describes this tile's own
// un-transformed CSS layout box only -- browsers have no way to account
// for the Archive camera's own `transform: scale(...)` zoom (see
// createGalleryRenderer's setTrackScaleX/Y quickSetters) when evaluating
// srcset, so a tile actually being viewed zoomed-in would otherwise
// always request a candidate sized for its neutral, unzoomed footprint,
// reading as blurry once genuinely magnified. Continuously tracking the
// live camera scale here would mean wiring this into the RAF/motion loop
// (out of scope for this pass, and exactly the kind of broad change it
// asks to avoid) -- so instead this applies one small, fixed headroom
// multiplier, and ONLY to `discovery` tiles (the large/hero tiles
// COLUMN_PATTERNS itself already flags -- see layout.discovery's own
// comment above), landing in the "roughly 1.5-2x effective pixel
// density" range this pass targets for large/zoomed tiles specifically.
// Ordinary (non-discovery) tiles -- the large majority of what's on
// screen at once -- return exactly their own authored width, completely
// unchanged, so they keep selecting the cheap 400/800 srcset candidates
// exactly as before. This only changes what `sizes` string is requested;
// it never changes the srcset candidate list itself (still built by
// getArchiveOptimizedImageSrcSet, still capped at the Sanity source's own
// intrinsic width, still 400/800/1200 only for local assets).
const ARCHIVE_DISCOVERY_TILE_SIZES_HEADROOM = 1.75;

// Archive zoom image-quality pass (launch blocker, Josh review): how
// often the zoom-driven `sizes` promotion effect further down re-checks
// currently-rendered tiles against the camera's live scale
// (viewportScaleRef). Deliberately independent of the camera's own
// 60fps RAF loop -- a `sizes` promotion is a rare, one-way event per
// tile (see promotedImageSizesRef's own comment), not something that
// benefits from per-frame precision, so this is a coarse, cheap poll
// rather than a hook into camera math/the motion loop.
const ARCHIVE_ZOOM_QUALITY_POLL_MS = 300;

function getGalleryImageSizes(layout) {
  const width = Math.ceil(Number.parseFloat(layout.width));
  const effectiveWidth = layout.discovery
    ? Math.ceil(width * ARCHIVE_DISCOVERY_TILE_SIZES_HEADROOM)
    : width;

  return `${effectiveWidth}px`;
}

// getImageDimensions also now lives in ./imageOptimization.js (imported
// above) -- imageMetadata itself stays imported here too, since it's
// still read directly below for aspect-ratio lookups outside that helper.

// Responsive Sanity Image Delivery -- eager-loading threshold reviewed,
// left unchanged: this constant's own risk was never "12 images" as a
// number, it was 12 *full-resolution originals* firing simultaneously
// (see the performance-audit-ranked.md bottleneck #3). Now that
// getOptimizedImageSrc/getOptimizedImageSrcSet request a properly sized,
// auto-format Sanity variant for every live image -- the same 800px
// default width every non-eager tile already requests -- a batch of 12
// eager loads is a batch of 12 appropriately-sized images, not 12
// multi-megabyte ones; the byte cost this threshold was previously
// amplifying is gone. Left at 12 rather than tuned down speculatively,
// since lowering it has its own cost (a visibly sparser first paint) that
// isn't justified without something to actually measure against. Revisit
// only if a live measurement after this change still shows first-batch
// load as a bottleneck.
function shouldEagerLoadImage(item) {
  const itemIndex = Number(item.id.split("-")[1] || 0);
  // Centered Initial Composition: batchIndex 0 is still the start of the
  // rightward pass, but the true first-paint viewport now also includes
  // the center seed (batchIndex -1) and the leftward pass (batchIndex
  // -2) -- see createCenterSeedBatch/createLeftwardGalleryBatch and
  // regenerateGallery below. Same itemIndex<12 per-part budget as the
  // original single-batch threshold; an approximation, not an exact
  // viewport-visibility calculation, same as before.
  return (
    (item.batchIndex === 0 || item.batchIndex === -1 || item.batchIndex === -2) &&
    itemIndex < 12
  );
}

// The left boundary is the render window's half of the same
// getGuaranteedWorldReach contract createLeftwardGalleryBatch's
// generation boundary already consumes (see that function's own
// comment). Previously a hardcoded 0 -- an assumption, predating both
// zoom and any leftward-generated content, that nothing meaningful
// could ever exist left of world-X 0. Math.max(...) still governs the
// same distance-driven sliding-window behavior as before: near
// distance=0 the guaranteedWorldReach term binds; once the visitor has
// scrolled far enough right that distance - overscan exceeds
// -getGuaranteedWorldReach(), the ordinary rightward-scrolling term
// takes back over exactly as it always has. This function has no
// knowledge of procedural generation, pattern selection, or DGPC; it
// only ever sees the plain px number getGuaranteedWorldReach() returns.
function getGalleryRenderWindow(distance = 0) {
  const viewportWidth =
    typeof window === "undefined" ? 1200 : window.innerWidth;
  const overscan = clamp(
    viewportWidth * 2.4,
    minRenderOverscan,
    maxRenderOverscan,
  );

  return {
    left: Math.max(-getGuaranteedWorldReach(), distance - overscan),
    right: distance + viewportWidth + overscan,
  };
}

function isItemInRenderWindow(item, renderWindow) {
  const left = Number.parseFloat(item.layout.left);
  const right = left + Number.parseFloat(item.layout.width);

  return right >= renderWindow.left && left <= renderWindow.right;
}

// Bounded Runtime Field pass: shared shape behind
// getGalleryRetentionWindow below -- widens getGalleryRenderWindow by a
// margin, in viewport-width units, with the same guaranteedWorldReach
// floor on the left. (Round H note: this used to also back a second,
// wider getGalleryCacheWindow used for batch-cache eviction -- removed,
// see batchCacheRef's own comment -- but is kept factored out here on
// its own merits, and in case a future pass needs a second nested
// window again.)
function getGalleryWindowWithMargin(distance, marginViewports) {
  const viewportWidth =
    typeof window === "undefined" ? 1200 : window.innerWidth;
  const renderWindow = getGalleryRenderWindow(distance);
  const margin = viewportWidth * marginViewports;

  return {
    left: Math.max(-getGuaranteedWorldReach(), renderWindow.left - margin),
    right: renderWindow.right + margin,
  };
}

// Bounded Runtime Field pass: the single spatial promise "how much of
// everything ever procedurally generated should currently be React
// state / mounted DOM" answers. Deliberately just a wider version of
// getGalleryRenderWindow's own window -- same guaranteedWorldReach
// floor on the left, same distance-driven sliding-window shape -- so
// every item inside the render window is always also inside the
// retention window (the render window is always a strict subset), and
// isItemInRenderWindow itself can be reused unchanged to test
// membership in either.
function getGalleryRetentionWindow(distance) {
  return getGalleryWindowWithMargin(
    distance,
    GALLERY_RETENTION_MARGIN_VIEWPORTS,
  );
}

function shuffleArray(array) {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

function getRandomBetween(min, max) {
  return Math.random() * (max - min) + min;
}

function getImageOrientation(src) {
  const ratio = imageMetadata[src]?.aspectRatio ?? 1;

  if (ratio > 1.15) return "landscape";
  if (ratio < 0.87) return "portrait";
  return "square";
}

// Groups an arbitrary list of image srcs by orientation. Factored out of
// what used to be a one-off inline forEach so Search Query Wiring (below)
// can build the identical shape for whatever subset of images a committed
// search currently matches, without duplicating this grouping logic.
function buildImagesByOrientation(imageSrcs) {
  const grouped = { landscape: [], portrait: [], square: [] };
  imageSrcs.forEach((src) => {
    grouped[getImageOrientation(src)].push(src);
  });
  return grouped;
}

// Static grouping of every image by orientation -- computed once, at module
// load, since allImages/getImageOrientation never change. Used by
// pickImage() below to refill an exhausted bag.
const imagesByOrientation = buildImagesByOrientation(allImages);

// Metadata Query Wiring: pickImage (below) no longer closes over
// allImages/imagesByOrientation directly -- it reads whichever "image pool"
// its caller hands it, so the exact same picker/bag mechanism can draw from
// either the full library (DEFAULT_IMAGE_POOL, used whenever no query is
// active -- identical in content to this file's pre-Search behavior) or the
// Metadata Query Engine's matching Archive Items' own images (built fresh
// whenever Search and/or Filter change -- see applyMetadataQuery in
// App()). This is the only thing that changes: COLUMN_PATTERNS,
// createGalleryBatch's tile-filling loop, and every other piece of
// procedural generation are untouched -- they still just ask pickImage for
// "the next image of this orientation" the same way they always have.
function buildImagePool(imageSrcs) {
  return { all: imageSrcs, byOrientation: buildImagesByOrientation(imageSrcs) };
}
const DEFAULT_IMAGE_POOL = { all: allImages, byOrientation: imagesByOrientation };

// Archive State Reset: the one shape "no active Filter selection" means --
// reused as both activeFilterQuery's own initial state and the value
// resetArchiveState (see App()) resets straight back to, exactly the same
// single-source-of-truth idiom Header.jsx's own EMPTY_FILTER_SELECTION
// already establishes for the same reason (see Header.jsx). Kept as its
// own constant so App's initial state and its reset can never drift into
// two slightly different "empty" literals. `type` added alongside `year`
// for the new Type Filter category, mirroring EMPTY_FILTER_SELECTION.
const EMPTY_FILTER_QUERY = { theme: [], project: [], year: [], type: [] };
// Project Filter Composition: a single stable empty-array reference for
// projectFilterItems' non-Project-filter branch (see that useMemo in
// App()), so a render where Project isn't active never hands
// ProjectFilterRow (which isn't even mounted then) a freshly allocated
// array for no reason.
const EMPTY_ARRAY = [];

// Project Filter Alignment: Filter's Project category displays/selects
// each Project's human-readable title -- the same way Theme/Year already
// display real, directly matchable values -- via PROJECT_TITLES (passed
// as Header's `projects` prop below). But mockArchiveItems.js's own
// `project` field (what queryArchive's project matcher actually compares
// against) is each Project's slug, not its title, since that's also what
// Project-page navigation/getProjectBySlug already depend on elsewhere
// (see projectContent.js) and isn't something this commit touches.
// PROJECT_SLUG_BY_TITLE is the one place that reconciles the two --
// see handleFilterChange below, its only call site.
//
// Phase 3 (Connect Projects): PROJECT_TITLES/PROJECT_SLUG_BY_TITLE used
// to be computed right here, as module-level consts, built once from
// mockProjects.js at import time. getProjects() now reads a cache
// populated asynchronously by main.jsx (see src/content/projects.js) --
// module-level code runs at import time, before that load can possibly
// finish, so computing these here would have permanently frozen them at
// empty. They're now computed inside the App() component itself instead
// (see its opening lines, just below), which only ever runs at render
// time -- after main.jsx's readiness gate -- exactly like every other
// getProjects()/getArchiveItems() call site in this file already does.
// Nothing about their value, their two call sites below, or the
// `projects` prop they feed Header changed -- only when they're computed.

// A self-refilling, per-orientation shuffled "bag" of real photos so
// consecutive draws of the same orientation don't repeat until the bag is
// exhausted and reshuffled. Falls back to the full image list for an
// orientation bucket that has no members.
//
// REFACTORED (extension-pipeline fix): this used to be a stateful object
// (`createImagePicker()`) whose `.next()` method mutated a private `bags`
// object in place. That mutation was one of the side effects that made
// createGalleryBatch() unsafe to call from inside a React state updater --
// see createGalleryBatch's own comment for the full picture. It's now a
// plain, immutable data shape (`{ bags }`) plus a pure function, pickImage,
// that never mutates its `pickerState` argument or anything reachable from
// it -- it returns a brand new pickerState instead. shuffleArray already
// returns a new array rather than mutating its input, so nothing here
// mutates anything shared.
function createImagePickerState() {
  return { bags: { landscape: [], portrait: [], square: [] } };
}

// PURE: given a pickerState and an orientation, returns { src,
// nextPickerState }. Draws from the end of the current bag for that
// orientation (equivalent to the old bags[orientation].pop()), refilling
// with a freshly shuffled bag first if the current one is empty.
function pickImage(pickerState, orientation, imagePool = DEFAULT_IMAGE_POOL) {
  let bag = pickerState.bags[orientation];

  if (bag.length === 0) {
    const source = imagePool.byOrientation[orientation].length
      ? imagePool.byOrientation[orientation]
      : imagePool.all;
    bag = shuffleArray(source);
  }

  const src = bag[bag.length - 1];
  const nextPickerState = {
    bags: { ...pickerState.bags, [orientation]: bag.slice(0, -1) },
  };

  return { src, nextPickerState };
}

// Curated Large-Tile Variety (Archive-generation polish): companions to
// pickImage, used only for `discovery` (large) tile slots -- see
// COLUMN_PATTERNS' own comment for why `discovery` is the existing "large
// tile" signal this reuses rather than inventing a new size taxonomy.
//
// PURE, same idiom as pickImage/pickerState: neither function mutates its
// arguments. nearbyLargeTiles is a plain array of { centerX, project },
// bounded (see pruneLargeTilesForVariety) so it only ever holds large tiles
// within roughly one viewport-width (plus a small, fixed per-column margin)
// of the current generation frontier -- bounded by local large-tile density
// plus one column's width, never by total archive size.
//
// Split into two pure steps, each with one job:
//
// pruneLargeTilesForVariety -- called ONCE per column, before that column's
// tiles are processed, using the column's own leading edge as a monotonic
// frontier (not any individual tile's centerX). This is the fix for a real
// bug: `pattern.tiles` is visited in AUTHORED order, not left-to-right
// spatial order, so a tile far to one side of a column can be processed
// before a tile much closer to the other side of the SAME column. Pruning
// per-tile (the original design) used whichever tile was just recorded as
// the reference point, which could -- and did -- evict an entry that was
// still genuinely within avoidancePx of a tile processed later in that same
// column, simply because it happened to be recorded out of spatial order.
// A column's own edge doesn't have that problem: every tile in a column is
// bounded by that column's own left/right edge regardless of which order
// its tiles are visited in (tile.left is always 0-100% of the column, so a
// column's own left edge is a true lower bound on every one of its tiles'
// centerX, and its right edge a true upper bound) -- so pruning against the
// edge, once, before any of the column's tiles are looked at, can never
// evict something a tile in this column (or a later one, in the same
// direction) might still need.
//
// direction is +1 for a frontier that only ever increases (rightward
// generation, and the center seed's own single column, whose own tiles
// also never go below its columnLeft) or -1 for a frontier that only ever
// decreases (leftward generation, walking toward more negative X). An
// entry is safe to drop once the frontier has moved avoidancePx past it in
// that direction -- no tile this column or any later one in the same
// direction can ever come back within range.
function pruneLargeTilesForVariety(nearbyLargeTiles, frontierX, avoidancePx, direction) {
  return nearbyLargeTiles.filter((tile) => {
    const distancePastFrontier =
      direction === -1 ? tile.centerX - frontierX : frontierX - tile.centerX;
    return distancePastFrontier < avoidancePx;
  });
}

// recordLargeTileForVariety -- called once per discovery tile, exactly as
// before. Appends only; performs no pruning of its own, so it no longer
// matters what order a column's tiles are visited in -- every discovery
// tile recorded during a column's own processing stays visible to every
// other tile in that same column, regardless of authored order.
function recordLargeTileForVariety(nearbyLargeTiles, centerX, project) {
  if (!project) return nearbyLargeTiles;

  return [...nearbyLargeTiles, { centerX, project }];
}

// Best-effort variant of pickImage for a `discovery` slot only: excludes
// candidates whose Archive Item project already appears in
// nearbyLargeTiles within avoidancePx of candidateCenterX. When there's
// nothing nearby to avoid (the common case for most discovery tiles),
// this is exactly pickImage.
//
// Three passes, widening only as far as each one actually needs to:
//
// PASS 1 -- scan the current bag (same bag/orientation mechanism pickImage
// already uses) for a candidate whose project isn't excluded. Identical to
// this function's original behavior, and still the common case: cheap,
// preserves the bag exactly as pickImage would have.
//
// PASS 2 -- reached only when the current bag has nothing eligible. Widens
// the search to the full per-orientation source pool (the exact same
// derivation the bag-refill above already uses -- a fixed-size photo
// catalog, not the infinite archive), because a project excluded from the
// *current bag's* momentary slice is very often still available elsewhere
// in that same pool (the bag is just whatever's left mid-shuffle-cycle).
// Chooses uniformly at random among the pool's eligible candidates, so
// this stays procedurally random rather than becoming round-robin.
// Reconciles with the bag afterward: removes the chosen src from the bag
// if it's still sitting there; if it was already drawn out of the bag
// earlier this cycle, returns it as-is rather than trying to reconstruct
// or reset bag state.
//
// PASS 3 -- true scarcity: not even the full pool has an eligible
// project (every candidate belongs to a project already placed nearby).
// Same graceful fallback as before: draw the bag's tail element rather
// than force a duplicate-free result that doesn't exist -- no retry loop,
// no reroll, no failure.
function pickLargeAwareImage(
  pickerState,
  orientation,
  imagePool,
  nearbyLargeTiles,
  avoidancePx,
  candidateCenterX,
) {
  const excludedProjects = new Set();
  nearbyLargeTiles.forEach((tile) => {
    if (Math.abs(tile.centerX - candidateCenterX) < avoidancePx) {
      excludedProjects.add(tile.project);
    }
  });

  if (excludedProjects.size === 0) {
    return pickImage(pickerState, orientation, imagePool);
  }

  let bag = pickerState.bags[orientation];
  if (bag.length === 0) {
    const source = imagePool.byOrientation[orientation].length
      ? imagePool.byOrientation[orientation]
      : imagePool.all;
    bag = shuffleArray(source);
  }

  // PASS 1 -- bounded scan of the current bag.
  let chosenIndex = -1;
  for (let i = bag.length - 1; i >= 0; i--) {
    const candidateProject = findArchiveItemBySrc(bag[i])?.project ?? null;
    if (!candidateProject || !excludedProjects.has(candidateProject)) {
      chosenIndex = i;
      break;
    }
  }

  if (chosenIndex !== -1) {
    const src = bag[chosenIndex];
    const nextBag = [
      ...bag.slice(0, chosenIndex),
      ...bag.slice(chosenIndex + 1),
    ];
    return {
      src,
      nextPickerState: {
        bags: { ...pickerState.bags, [orientation]: nextBag },
      },
    };
  }

  // PASS 2 -- widen to the full per-orientation source pool.
  const source = imagePool.byOrientation[orientation].length
    ? imagePool.byOrientation[orientation]
    : imagePool.all;
  const poolEligible = source.filter((candidateSrc) => {
    const candidateProject = findArchiveItemBySrc(candidateSrc)?.project ?? null;
    return !candidateProject || !excludedProjects.has(candidateProject);
  });

  if (poolEligible.length > 0) {
    const src = poolEligible[Math.floor(Math.random() * poolEligible.length)];
    const idxInBag = bag.indexOf(src);
    const nextBag =
      idxInBag === -1
        ? bag
        : [...bag.slice(0, idxInBag), ...bag.slice(idxInBag + 1)];
    return {
      src,
      nextPickerState: {
        bags: { ...pickerState.bags, [orientation]: nextBag },
      },
    };
  }

  // PASS 3 -- graceful fallback: every candidate in the full pool
  // collides with a nearby large tile's project, so draw the same tail
  // element pickImage would have drawn.
  const fallbackIndex = bag.length - 1;
  const src = bag[fallbackIndex];
  const nextBag = bag.slice(0, fallbackIndex);

  return {
    src,
    nextPickerState: {
      bags: { ...pickerState.bags, [orientation]: nextBag },
    },
  };
}

// --- Application Layout ---------------------------------------------------
// Owns page composition: how much room the header and the bottom controls
// need, and therefore where the gallery's viewing-window opening sits on
// the page (top/bottom) and how tall it is (height). Nothing downstream --
// Archive, Gallery Renderer -- needs to know header/footer clearance
// exists as a concept; they only ever receive plain numbers from here.
// This function knows nothing about images, patterns, distance, or scale.
//
// Mobile Archive Interaction Pass -- Stage 1 (Mobile Archive Geometry):
// desktop/tablet's own `isCompactViewport` branch below is completely
// unchanged -- same formula, same values, same width/height thresholds --
// this is purely an additive `isMobileUiMode` branch (the canonical mobile
// UI MODE signal, see useIsMobileUiMode.js -- deliberately NOT
// isCompactViewport/isTouchDevice) that replaces the old shared "same
// formula for both edges" mobile reservation.
//
// The investigation traced that old formula (clamp(vh*0.14, 105, 145) for
// BOTH top and bottom) to two real problems: (1) it was never actually
// derived from the header's own rendered size, so it over-reserved ~15-50px
// of dead space above the Archive; (2) it reused that same 105-145px
// reservation for the bottom controls too, even though the real
// .zoom-controls footprint is only ~44px -- leaving 60-100px of pure dead
// gap between the Archive's own bottom edge and the controls. Mobile UI
// mode now ties each edge to its OWN real, measured chrome size
// (headerHeightPx/zoomControlsHeightPx -- see headerHeightRef/
// zoomControlsHeightRef in App(), reported via the same ResizeObserver
// pattern already established for the Filter drawer's own height,
// onDrawerHeightChange) plus a small breathing margin and the real
// safe-area inset for whichever edge that inset actually protects, instead
// of a second guessed formula that can drift from the CSS exactly like the
// old one did.
function getViewportOpeningGeometry({
  isMobileUiMode = false,
  headerHeightPx = null,
  zoomControlsHeightPx = null,
} = {}) {
  const viewportHeight =
    typeof window === "undefined" ? 800 : window.innerHeight;
  const viewportWidth =
    typeof window === "undefined" ? 1200 : window.innerWidth;
  const viewportPadding = Math.round(
    Math.min(Math.max(viewportHeight * 0.05, 18), 52),
  );

  let headerClearance;
  let bottomControlClearance;

  if (isMobileUiMode) {
    const safeAreaTop = getSafeAreaInsetPx("--safe-area-inset-top");
    const safeAreaBottom = getSafeAreaInsetPx("--safe-area-inset-bottom");
    const measuredHeaderHeight =
      headerHeightPx ?? MOBILE_HEADER_HEIGHT_FALLBACK_PX;
    const measuredZoomControlsHeight =
      zoomControlsHeightPx ?? MOBILE_ZOOM_CONTROLS_HEIGHT_FALLBACK_PX;

    headerClearance = Math.round(
      measuredHeaderHeight + MOBILE_HEADER_BREATHING_MARGIN_PX + safeAreaTop,
    );
    bottomControlClearance = Math.round(
      measuredZoomControlsHeight +
        MOBILE_ZOOM_CONTROLS_BREATHING_MARGIN_PX +
        safeAreaBottom,
    );
  } else {
    const isCompactViewport = viewportWidth < 1000 || viewportHeight < 760;
    headerClearance = Math.round(
      isCompactViewport
        ? clamp(viewportHeight * 0.14, 105, 145)
        : clamp(viewportHeight * 0.1, 95, 125),
    );
    bottomControlClearance = Math.round(
      isCompactViewport
        ? clamp(viewportHeight * 0.14, 105, 145)
        : clamp(viewportHeight * 0.1, 95, 125),
    );
  }

  const top = Math.max(viewportPadding, headerClearance);
  const bottom = Math.max(viewportPadding, bottomControlClearance);
  const height = Math.max(80, viewportHeight - top - bottom);

  return { top, bottom, height };
}

function getRandomOpacity() {
  return 1;
}

function getRandomImageMotion() {
  return {
    duration: Number(getRandomBetween(0.72, 1.08).toFixed(2)),
    delay: Number(getRandomBetween(0, 0.08).toFixed(2)),
  };
}

// Logical state threaded across every createGalleryBatch call for the life
// of the gallery: where the next column starts (cursorX), which pattern was
// used last (so it isn't immediately repeated), and the shuffled
// per-orientation photo bags. This is an explicit cursor rather than a
// derived value, so there's no collision search needed -- each pattern is
// pre-validated to have zero internal overlaps, so patterns can simply be
// placed edge-to-edge with one calibrated seam gap.
//
// DESIGN EXPERIMENT (temporary, reversible) -- gates regenerateGallery
// (below) between the original single rightward generator and the new
// Centered Initial Composition (center-seed + bounded leftward pass +
// unmodified rightward pass). Touches nothing about createGalleryBatch
// itself, which remains byte-for-byte unchanged either way. Flip back
// to `false` to instantly restore the original -galleryEdgeBleed-only
// composition for comparison.
const useCenteredInitialComposition = true;

// REFACTORED (extension-pipeline fix): this is now plain, immutable data.
// Nothing in this file mutates a columnState object in place anymore --
// createGalleryBatch() (below) takes one as input and returns a brand new
// one as part of its result instead. See createGalleryBatch's comment for
// why that matters.
function createColumnState() {
  return {
    cursorX: -galleryEdgeBleed,
    lastPatternIndex: -1,
    pickerState: createImagePickerState(),
    // TEMPORARY DIAGNOSTIC (reversible) -- a persistent, globally-sequential
    // module counter, threaded across every createGalleryBatch call exactly
    // like cursorX already is. Gives every module (column) a stable,
    // comparable identity across batches/extensions so a gap-tracing tool
    // can tell "consecutive modules with an abnormal cursor jump between
    // them" apart from "a real break in the module sequence itself."
    moduleIndex: 0,
    // Curated Large-Tile Variety (Archive-generation polish): a small,
    // self-pruning list of { centerX, project } for `discovery` (large)
    // tiles placed within roughly one viewport-width behind the current
    // cursor -- see pickLargeAwareImage/recordLargeTileForVariety below.
    // Threaded across calls exactly like pickerState/cursorX already are.
    // Empty by default; only ever grows to the handful of large tiles
    // that fall within the avoidance window, never the whole archive.
    nearbyLargeTiles: [],
  };
}

// Four-pattern DAPC pool: all of COLUMN_PATTERNS now participates in
// procedural selection -- the earlier six-of-eight filtering mechanism
// (ACTIVE_PATTERN_INDICES) is gone, not just emptied, now that the pool
// itself only contains the four approved patterns.
//
// PURE: does not mutate anything. Given the pattern used last time, returns
// the next pattern index to use. The caller is responsible for carrying the
// returned value forward as the new "last pattern index".
function pickPatternIndex(lastPatternIndex) {
  const candidates = COLUMN_PATTERNS.map((_, index) => index).filter(
    (index) => index !== lastPatternIndex,
  );

  return candidates[Math.floor(Math.random() * candidates.length)];
}

// REFACTORED (extension-pipeline fix): createGalleryBatch is now a pure
// function. It used to take a mutable `state` object and mutate
// state.cursorX / state.moduleIndex / state.lastPatternIndex / state.picker
// in place as it ran -- and it was being called from directly inside a
// setGalleryItems(currentItems => ...) updater. React is explicitly allowed
// to invoke an updater function more than once for a single state update
// (deliberately, in development, to help surface exactly this kind of bug;
// and, as traced this round with window.__extendCallTrace /
// window.__setGalleryItemsTrace / window.__analyzeExtensionLifecycle(),
// also happening in practice well beyond just that immediate double-check).
// Every extra invocation was performing another real, permanent mutation of
// the shared columnState -- advancing the cursor and module counter again --
// regardless of whether that particular invocation's returned items ever
// ended up in the committed galleryItems. That is what produced everything
// this investigation traced back to: the duplicate moduleIndex 27/28 (two
// invocations, two different starting cursor positions), and the modules
// that were generated correctly but never appeared in galleryItems (an
// invocation whose mutation stuck, but whose returned batch was the one
// discarded).
//
// The fix: this function no longer mutates its `columnState` argument or
// anything reachable from it (pickPatternIndex and pickImage, both used
// below, are pure for the same reason). It returns the batch's items AND a
// brand new columnState reflecting the advance, instead of mutating one in
// place. The one remaining non-purity is the same Math.random()-driven
// pattern/image selection this generator always had -- that's an
// intentional design property (real visual variety), not a side effect.
// worldCanvasHeight is a plain number -- how tall Archive's own canvas is,
// supplied by the caller. This function never asks why it's that size and
// never touches Application Layout's geometry function; that's the whole
// point of the ownership boundary.

// Standardized DAPC interlock (four-pattern audit, approved 2026-08-15).
// Supersedes the interlock-stagger experiment above -- that mechanism
// perturbed each column's own vertical origin/height (columnTop,
// canvasHeight) to break up dense/sparse banding, which is fundamentally
// incompatible with a standardized interlock: the interlock only works
// because every column shares one identical worldCanvasHeight-based
// coordinate system, so the same top/height band lands at the same place
// in every pattern regardless of which one is selected next. Every call
// site below now uses worldCanvasHeight directly (columnTop is gone
// entirely, canvasHeight === worldCanvasHeight always) -- restoring the
// original shared-origin behavior these functions had before that
// experiment.
//
// Two adjacent columns "interlock" instead of just sitting side by side:
// one pattern's designated tab tile (tile.interlockTab === true on
// exactly one tile per pattern, see COLUMN_PATTERNS above) overshoots
// past its own column's right edge, bridges the seam gap, and reaches a
// short way into the next column's canvas -- landing inside a footprint
// that pattern's own authored tiles are confirmed never to occupy. Only
// that one tile's rendered width changes at render time; its own
// left/top/h, and every other tile's geometry in both patterns, are read
// exactly as authored -- nothing is moved or resized to make room.
//
// Source audit: the designer's own red interlock markup measured a
// consistent ~43.5% top / ~14.7% height / ~25%-of-canvas-height depth
// across all four patterns (within about half a percentage point) -- but
// checking each marker's raw pixel position against its own canvas edge
// showed the marker straddles the seam (roughly half on-canvas, half
// off), so that 25% figure is the whole hand-drawn connector as it
// appears straddling the seam in a single-pattern mockup, not the amount
// that actually needs to land inside one pattern's own canvas once two
// patterns are actually placed side by side. INTERLOCK_REACH_PCT below
// is that on-canvas half (confirmed against the audited tile geometry to
// clear every pattern's authored content except Patterns 3 and 4, each
// of which gets its own smaller cap instead of shrinking the shared
// figure for all four -- see INTERLOCK_MAX_RECEIVE_PCT).
const INTERLOCK_TOP_PCT = 43.5; // % of worldCanvasHeight, identical for every pattern
const INTERLOCK_HEIGHT_PCT = 14.7; // % of worldCanvasHeight, identical for every pattern
const INTERLOCK_REACH_PCT = 12.5; // % of worldCanvasHeight; default physical reach of a tab into whatever pattern comes next

// Receiving-side override: how far (as a percentage of THIS pattern's own
// width, since a receiving-side limit is inherently about that one
// pattern's own authored geometry, not the shared worldCanvasHeight
// figure above) any neighbor's tab may travel into this pattern's canvas.
// Keyed by index into COLUMN_PATTERNS. Patterns 1 and 2 (indices 0, 1)
// have no entry -- their audited recess zones are clear at the full
// standard reach, so they fall back to it untouched. Patterns 3 and 4
// (indices 2, 3) each have one real authored tile (a site-plan drawing on
// Pattern 3; two photos on Pattern 4) that the full reach would clip, so
// an incoming tab is capped just short of it instead -- audit-confirmed
// minimums, not new global interlock geometry.
const INTERLOCK_MAX_RECEIVE_PCT = { 2: 7.5, 3: 7.5 };

// Smallest possible reach across all four patterns, expressed as a
// fraction of worldCanvasHeight so it's directly comparable to
// INTERLOCK_REACH_PCT -- used only where a tab genuinely cannot know
// which pattern it's connecting to yet (the very first column ever
// placed; see createCenterSeedBatch), so it can still interlock safely
// no matter which pattern actually ends up next to it.
const INTERLOCK_SAFE_MIN_REACH_PCT = Math.min(
  ...COLUMN_PATTERNS.map((pattern, index) =>
    INTERLOCK_MAX_RECEIVE_PCT[index] != null
      ? INTERLOCK_MAX_RECEIVE_PCT[index] * pattern.aspect
      : INTERLOCK_REACH_PCT,
  ),
);

// Dev sanity check (runs once at module load, pure verification -- never
// changes behavior): confirms every non-tab tile in COLUMN_PATTERNS is
// actually clear of its own pattern's recess zone (the same shared
// INTERLOCK_TOP_PCT/HEIGHT_PCT band, inset from the left edge by whatever
// this pattern's own INTERLOCK_MAX_RECEIVE_PCT cap -- or, absent one, the
// default INTERLOCK_REACH_PCT converted through this pattern's own aspect
// -- allows). Existing to catch a future COLUMN_PATTERNS edit that
// silently reintroduces one of the conflicts the Stage A/B audit found
// and resolved, not to catch anything expected to fire today.
COLUMN_PATTERNS.forEach((pattern, patternIndex) => {
  const capPct = INTERLOCK_MAX_RECEIVE_PCT[patternIndex];
  const recessDepthPct =
    capPct != null ? capPct : INTERLOCK_REACH_PCT / pattern.aspect;
  const zoneTop = INTERLOCK_TOP_PCT;
  const zoneBottom = INTERLOCK_TOP_PCT + INTERLOCK_HEIGHT_PCT;
  pattern.tiles.forEach((tile, tileIndex) => {
    if (tile.interlockTab) return;
    const overlapsX = tile.left < recessDepthPct && tile.left + tile.w > 0;
    const overlapsY = tile.top < zoneBottom && tile.top + tile.h > zoneTop;
    if (overlapsX && overlapsY) {
      console.warn(
        `[DAPC interlock] pattern ${patternIndex} tile ${tileIndex} overlaps its own recess zone (left 0-${recessDepthPct.toFixed(2)}%, top ${zoneTop}-${zoneBottom}%).`,
        tile,
      );
    }
  });
});

// Physical px depth (in the shared worldCanvasHeight coordinate) that an
// outgoing tab should reach past its own column's right edge and into
// whichever pattern comes next -- that pattern's own
// INTERLOCK_MAX_RECEIVE_PCT cap if it has one, otherwise the standard
// INTERLOCK_REACH_PCT. nextPatternIndex/nextPattern may be null when the
// next column genuinely isn't known yet (see createCenterSeedBatch), in
// which case INTERLOCK_SAFE_MIN_REACH_PCT is used so the tab can never
// overreach whatever pattern actually ends up next regardless.
function getInterlockReachPx(nextPatternIndex, nextPattern, worldCanvasHeight) {
  if (nextPatternIndex == null || !nextPattern) {
    return (INTERLOCK_SAFE_MIN_REACH_PCT / 100) * worldCanvasHeight;
  }
  const maxReceivePct = INTERLOCK_MAX_RECEIVE_PCT[nextPatternIndex];
  if (maxReceivePct != null) {
    const receivingColumnWidthPx = nextPattern.aspect * worldCanvasHeight;
    return (maxReceivePct / 100) * receivingColumnWidthPx;
  }
  return (INTERLOCK_REACH_PCT / 100) * worldCanvasHeight;
}

function createGalleryBatch(
  batchIndex,
  columnState,
  worldCanvasHeight,
  imagePool = DEFAULT_IMAGE_POOL,
) {
  const seamGapPx = (SEAM_GAP_PCT / 100) * worldCanvasHeight;
  const viewportWidth =
    typeof window === "undefined" ? 1200 : window.innerWidth;
  const targetBatchWidth = clamp(
    viewportWidth * 1.35,
    900,
    galleryBatchWidth,
  );
  const batchStartX = columnState.cursorX;
  const items = [];
  let itemIndex = 0;
  let moduleCount = 0; // TEMPORARY VISUAL DEBUG MODE -- one column == one procedural module

  // Local, function-scoped working values -- these are what would have been
  // `state.cursorX` etc. before the refactor. They're reassigned as the loop
  // runs, but nothing outside this function call can observe or be affected
  // by that, since they're plain local bindings, not the caller's object.
  let cursorX = columnState.cursorX;
  let lastPatternIndex = columnState.lastPatternIndex;
  let pickerState = columnState.pickerState;
  let moduleIndex = columnState.moduleIndex;
  // Curated Large-Tile Variety: threaded exactly like pickerState/cursorX
  // above -- see createColumnState's own comment.
  let nearbyLargeTiles = columnState.nearbyLargeTiles;
  const largeTileAvoidancePx = viewportWidth;
  // DAPC interlock one-ahead lookahead: the tab tile in each column needs
  // to know which pattern comes immediately after it, so its reach can
  // respect that pattern's own receiving-side cap (see
  // getInterlockReachPx above). currentPatternIndex is therefore always
  // decided one loop iteration before it's actually rendered -- either
  // here (start of this call) or at the tail of the previous iteration --
  // and the final, still-unplaced pick is carried forward as
  // pendingPatternIndex in nextColumnState below, so the *next* call to
  // createGalleryBatch (the next scroll-triggered extension) honors it
  // instead of drawing an independent pattern that would no longer match
  // what this call's last tab was already sized for.
  let currentPatternIndex =
    columnState.pendingPatternIndex ?? pickPatternIndex(lastPatternIndex);

  while (cursorX - batchStartX < targetBatchWidth) {
    const patternIndex = currentPatternIndex;
    lastPatternIndex = patternIndex;
    const pattern = COLUMN_PATTERNS[patternIndex];
    const columnLeft = cursorX;
    const canvasHeight = worldCanvasHeight;
    const columnWidthPx = pattern.aspect * canvasHeight;
    // The pattern immediately to this column's right -- known one step
    // ahead of when it's actually placed; see currentPatternIndex above.
    const nextPatternIndex = pickPatternIndex(patternIndex);
    const nextPattern = COLUMN_PATTERNS[nextPatternIndex];
    // TEMPORARY DIAGNOSTIC (reversible) -- see createColumnState's
    // moduleIndex comment. Captured once per column/module, before the
    // cursor advances, so every tile in this column shares the same value.
    const thisModuleIndex = moduleIndex;
    moduleIndex += 1;
    moduleCount += 1;

    // Curated Large-Tile Variety: prune once per column, before this
    // column's tiles are visited, using the column's own leading (left)
    // edge as a monotonic rightward frontier. Every tile in this or any
    // later column has centerX >= columnLeft (tile.left is always >= 0%
    // of the column's own box), so an entry is safe to drop exactly when
    // the frontier has moved avoidancePx past it -- regardless of the
    // authored (non-spatial) order tiles are visited in below.
    nearbyLargeTiles = pruneLargeTilesForVariety(
      nearbyLargeTiles,
      columnLeft,
      largeTileAvoidancePx,
      1,
    );

    pattern.tiles.forEach((tile) => {
      const baseWidth = (tile.w / 100) * columnWidthPx;
      // DAPC interlock: this pattern's one designated tab tile
      // (tile.interlockTab === true) extends past its own authored width,
      // bridging the seam gap and reaching into whichever pattern comes
      // next -- see getInterlockReachPx above. Every other tile is
      // unaffected; width is otherwise exactly the authored w% of this
      // column's own canvas, same as always.
      const width = tile.interlockTab
        ? baseWidth +
          seamGapPx +
          getInterlockReachPx(nextPatternIndex, nextPattern, worldCanvasHeight)
        : baseWidth;
      const height = (tile.h / 100) * canvasHeight;
      const left = columnLeft + (tile.left / 100) * columnWidthPx;
      // World-origin relative -- purely "where within my own canvas,"
      // never "where on the page." Application Layout, not Archive,
      // remains responsible for where the canvas is placed on the page.
      const top = (tile.top / 100) * canvasHeight;

      // Curated Large-Tile Variety: geometry above is computed before the
      // image draw (a pure reordering -- none of it depends on `src`) so a
      // `discovery` slot's world-space centerX is already known at pick
      // time. Non-discovery tiles are completely unaffected -- same
      // pickImage call, same bag mechanism, as always.
      const centerX = left + width / 2;
      const { src, nextPickerState } = tile.discovery
        ? pickLargeAwareImage(
            pickerState,
            tile.orientation,
            imagePool,
            nearbyLargeTiles,
            largeTileAvoidancePx,
            centerX,
          )
        : pickImage(pickerState, tile.orientation, imagePool);
      pickerState = nextPickerState;

      // Homepage -> Project navigation: an image only becomes clickable
      // (below, in the render) if it's also a mock Archive Item that
      // belongs to a Project -- most of these 34 stock photos aren't, and
      // stay exactly as inert as they are today. archiveItem is null for
      // those, and the fields below just carry that through.
      const archiveItem = findArchiveItemBySrc(src);

      if (tile.discovery) {
        nearbyLargeTiles = recordLargeTileForVariety(
          nearbyLargeTiles,
          centerX,
          archiveItem?.project ?? null,
        );
      }

      items.push({
        id: `${batchIndex}-${itemIndex}`,
        batchIndex,
        // TEMPORARY DIAGNOSTIC (reversible) -- see moduleIndex above.
        moduleIndex: thisModuleIndex,
        patternIndex,
        src,
        alt: `Gallery image ${itemIndex + 1}`,
        layout: {
          width: `${Math.round(width)}px`,
          height: `${Math.round(height)}px`,
          left: `${Math.round(left)}px`,
          top: `${Math.round(top)}px`,
          relationshipMotion: null,
          zIndex: Math.round(getRandomBetween(1, 12)),
          // layout now carries both geometric data (width/height/left/top)
          // and editorial metadata (discovery) -- coerced to a real
          // boolean since the property is omitted, not false, on
          // non-discovery tiles. See COLUMN_PATTERNS above. Discovery is
          // the only editorial gate; how large the resulting metadata
          // renders (down to a 9px floor) is a responsive-typography
          // concern handled entirely in styles.css, not here.
          discovery: tile.discovery === true,
        },
        opacity: getRandomOpacity(),
        tag: imageTags[src] || null,
        archiveNumber: archiveItem?.archiveNumber ?? null,
        project: archiveItem?.project ?? null,
        // Prototype Data Contract (Commit 2.5): carry the Archive Item's
        // own theme onto the gallery item alongside the
        // archiveNumber/project fields already carried above -- same
        // null-safe pattern, same source (mockArchiveItems.js via
        // archiveItem, looked up above by findArchiveItemBySrc). This adds
        // data fields only; it does not change any procedural
        // geometry/randomization this function already performs. Distinct
        // from the pre-existing singular `tag` field above, which comes
        // from the unrelated imageTags map and is untouched.
        theme: archiveItem?.theme ?? null,
        // HoverOverlay wiring fix: mockArchiveItems.js (Commit 3.5) already
        // carries a plural `themes` array (2-3 entries) per Archive Item,
        // but this function was only ever carrying the singular `theme`
        // through to the gallery item -- so `item.themes` was always
        // undefined here, no matter how rich the mock data got. Carried
        // the same null-safe way as theme; `theme` itself is
        // untouched, still the same value as before, for the JSX fallback
        // below and any other existing reader.
        themes: archiveItem?.themes ?? [],
        motion: getRandomImageMotion(),
      });

      itemIndex += 1;
    });

    const expectedNextCursor = columnLeft + columnWidthPx + seamGapPx;
    cursorX = expectedNextCursor;
    currentPatternIndex = nextPatternIndex;
  }

  return {
    items,
    nextColumnState: {
      cursorX,
      lastPatternIndex,
      pickerState,
      moduleIndex,
      pendingPatternIndex: currentPatternIndex,
      nearbyLargeTiles,
    },
    // TEMPORARY VISUAL DEBUG MODE -- returned instead of written to a
    // window side-channel, since this function's caller now always has
    // these values in hand synchronously (createGalleryBatch no longer runs
    // inside anything replayable, so there's no need for an out-of-band
    // channel to survive a re-invocation).
    moduleCount,
    batchStartX,
  };
}

// REFACTORED (extension-pipeline fix): threads columnState through each
// sequential batch explicitly (createGalleryBatch no longer mutates it),
// returning both the combined items and the final columnState after all
// batchCount batches -- the caller (the mount/resize effects) is
// responsible for storing that final columnState as the new starting point
// for future extensions.
function buildGalleryItems(
  columnState,
  batchCount = initialGalleryBatches,
  worldCanvasHeight,
  imagePool = DEFAULT_IMAGE_POOL,
) {
  let state = columnState;
  const allItems = [];

  for (let batchIndex = 0; batchIndex < batchCount; batchIndex++) {
    const { items, nextColumnState } = createGalleryBatch(
      batchIndex,
      state,
      worldCanvasHeight,
      imagePool,
    );
    allItems.push(...items);
    state = nextColumnState;
  }

  return { items: allItems, nextColumnState: state };
}

// --- Centered Initial Composition (design experiment, see
// useCenteredInitialComposition below) -------------------------------
//
// createGalleryBatch (above) is left completely untouched -- both
// functions below are deliberately self-contained, even where that
// means duplicating pieces of its tile-placement logic, so the existing
// rightward generator remains a byte-for-byte unmodified point of
// comparison for as long as this experiment is being evaluated.

// PURE. Generates exactly one procedural column/pattern -- the same unit
// createGalleryBatch places repeatedly -- positioned so its own
// midpoint (not its left edge, not a seam) lands at the true visual
// center of the viewport. No hero pattern, no image bias, no manual
// weighting: patternIndex and every tile's image are drawn via the same
// pickPatternIndex/pickImage calls createGalleryBatch itself uses.
function createCenterSeedBatch(
  batchIndex,
  columnState,
  worldCanvasHeight,
  imagePool = DEFAULT_IMAGE_POOL,
) {
  const patternIndex = pickPatternIndex(columnState.lastPatternIndex);
  const pattern = COLUMN_PATTERNS[patternIndex];
  const canvasHeight = worldCanvasHeight;
  const columnWidthPx = pattern.aspect * canvasHeight;
  const seamGapPx = (SEAM_GAP_PCT / 100) * worldCanvasHeight;
  const viewportWidth =
    typeof window === "undefined" ? 1200 : window.innerWidth;
  const viewportCenterX = viewportWidth / 2;
  // This column's own midpoint lands at the viewport's true visual
  // center -- per the approved design, one complete procedural module
  // occupies the center, rather than a seam between two halves landing
  // there.
  const columnLeft = viewportCenterX - columnWidthPx / 2;

  let pickerState = columnState.pickerState;
  // Curated Large-Tile Variety: threaded exactly like pickerState above --
  // see createColumnState's own comment.
  let nearbyLargeTiles = columnState.nearbyLargeTiles;
  const largeTileAvoidancePx = viewportWidth;
  const items = [];
  let itemIndex = 0;

  // Curated Large-Tile Variety: prune once, before this (only) column's
  // tiles are visited, using the same columnLeft/rightward-frontier
  // convention as createGalleryBatch -- this is a single seed column, not
  // a direction, so there's nothing directional to invent here. Pruning
  // once up front (rather than per tile) also guarantees every discovery
  // tile in this column sees every large tile recorded earlier in the
  // same column regardless of authored order, since no pruning happens
  // again until the next column (rightward or leftward) is processed.
  nearbyLargeTiles = pruneLargeTilesForVariety(
    nearbyLargeTiles,
    columnLeft,
    largeTileAvoidancePx,
    1,
  );

  pattern.tiles.forEach((tile) => {
    const baseWidth = (tile.w / 100) * columnWidthPx;
    // DAPC interlock: this is the very first column ever placed, so its
    // outgoing tab (if this pattern's tab tile falls here) cannot yet know
    // which pattern the rightward pass will start with -- see
    // getInterlockReachPx above, called here with a null "next pattern" so
    // it falls back to the safe minimum reach instead.
    const width = tile.interlockTab
      ? baseWidth + seamGapPx + getInterlockReachPx(null, null, worldCanvasHeight)
      : baseWidth;
    const height = (tile.h / 100) * canvasHeight;
    const left = columnLeft + (tile.left / 100) * columnWidthPx;
    const top = (tile.top / 100) * canvasHeight;

    // Curated Large-Tile Variety: see createGalleryBatch's identical
    // comment -- geometry is computed before the image draw so a
    // `discovery` slot's centerX is already known at pick time.
    const centerX = left + width / 2;
    const { src, nextPickerState } = tile.discovery
      ? pickLargeAwareImage(
          pickerState,
          tile.orientation,
          imagePool,
          nearbyLargeTiles,
          largeTileAvoidancePx,
          centerX,
        )
      : pickImage(pickerState, tile.orientation, imagePool);
    pickerState = nextPickerState;
    const archiveItem = findArchiveItemBySrc(src);

    if (tile.discovery) {
      nearbyLargeTiles = recordLargeTileForVariety(
        nearbyLargeTiles,
        centerX,
        archiveItem?.project ?? null,
      );
    }

    items.push({
      id: `${batchIndex}-${itemIndex}`,
      batchIndex,
      moduleIndex: columnState.moduleIndex,
      patternIndex,
      src,
      alt: `Gallery image ${itemIndex + 1}`,
      layout: {
        width: `${Math.round(width)}px`,
        height: `${Math.round(height)}px`,
        left: `${Math.round(left)}px`,
        top: `${Math.round(top)}px`,
        relationshipMotion: null,
        zIndex: Math.round(getRandomBetween(1, 12)),
        discovery: tile.discovery === true,
      },
      opacity: getRandomOpacity(),
      tag: imageTags[src] || null,
      archiveNumber: archiveItem?.archiveNumber ?? null,
      project: archiveItem?.project ?? null,
      theme: archiveItem?.theme ?? null,
      themes: archiveItem?.themes ?? [],
      motion: getRandomImageMotion(),
    });

    itemIndex += 1;
  });

  return {
    items,
    columnLeft,
    columnWidthPx,
    nextColumnState: {
      cursorX: columnState.cursorX,
      lastPatternIndex: patternIndex,
      pickerState,
      moduleIndex: columnState.moduleIndex + 1,
      nearbyLargeTiles,
    },
  };
}

// Leftward Initial-Composition Budget (design experiment, temporary and
// reversible, gated the same way as the rest of Centered Initial
// Composition -- createLeftwardGalleryBatch below is only ever called
// from inside the useCenteredInitialComposition branch, so this is
// already fully reversible by flipping that one toggle). This pass
// originally stopped exactly at world-X 0; per a follow-up request, it
// now continues roughly one additional average column past 0 before
// stopping, giving the initial leftward fill slightly more room at its
// outer edge -- the stopping boundary is the only thing that changes
// here. Pattern selection, image selection, tile placement, and seam
// math are all identical to before.
//
// PURE. Mirrors createGalleryBatch's shape, but walks the cursor
// LEFTWARD from a starting boundary instead of rightward from a
// starting edge -- each successive column's RIGHT edge sits at the
// current cursor (rather than each column's LEFT edge sitting at the
// cursor, as createGalleryBatch does), and the cursor decrements by
// that column's width plus the same seam gap. Bounded, not infinite:
// stops once the engine's own guaranteedWorldReach contract is
// satisfied (see getGuaranteedWorldReach's own comment) -- a fixed,
// mount-only budget, never a runtime bidirectional-growth mechanism.
// This function has no knowledge of zoom, drawers, or the camera; it
// only ever sees the plain px number getGuaranteedWorldReach() returns.
function createLeftwardGalleryBatch(
  batchIndex,
  columnState,
  worldCanvasHeight,
  imagePool = DEFAULT_IMAGE_POOL,
) {
  const seamGapPx = (SEAM_GAP_PCT / 100) * worldCanvasHeight;
  // The engine-level spatial contract (see getGuaranteedWorldReach),
  // not a generation-specific heuristic -- whatever this returns is
  // how far past world-X 0 this pass must continue so that content
  // already exists for every presentation state the render window
  // (see getGalleryRenderWindow) is separately guaranteed to expose.
  const leftwardCompositionBudgetPx = getGuaranteedWorldReach();
  const items = [];
  let itemIndex = 0;

  let cursorX = columnState.cursorX;
  let lastPatternIndex = columnState.lastPatternIndex;
  let pickerState = columnState.pickerState;
  let moduleIndex = columnState.moduleIndex;
  // Curated Large-Tile Variety: threaded exactly like pickerState above --
  // see createColumnState's own comment.
  let nearbyLargeTiles = columnState.nearbyLargeTiles;
  const viewportWidth =
    typeof window === "undefined" ? 1200 : window.innerWidth;
  const largeTileAvoidancePx = viewportWidth;

  while (cursorX > -leftwardCompositionBudgetPx) {
    // DAPC interlock: this pass places columns walking leftward (each new
    // column to the left of the last one placed), but a tab always
    // reaches toward increasing X (rightward) regardless of which
    // function placed the column carrying it -- so the pattern
    // immediately to THIS column's right is always already known here:
    // either the previously-placed leftward column, or, on the very first
    // iteration, the seed column the caller placed before calling this
    // function at all, still sitting in lastPatternIndex at this point.
    const rightNeighborPatternIndex = lastPatternIndex;
    const rightNeighborPattern = COLUMN_PATTERNS[rightNeighborPatternIndex];
    const patternIndex = pickPatternIndex(lastPatternIndex);
    lastPatternIndex = patternIndex;
    const pattern = COLUMN_PATTERNS[patternIndex];
    const canvasHeight = worldCanvasHeight;
    const columnWidthPx = pattern.aspect * canvasHeight;
    // This column's RIGHT edge sits at the current cursor; the cursor
    // for the next (further-left) column becomes this column's LEFT
    // edge minus the seam gap.
    const columnRight = cursorX;
    const columnLeft = columnRight - columnWidthPx;
    const thisModuleIndex = moduleIndex;
    moduleIndex += 1;

    // Curated Large-Tile Variety: prune once per column, before this
    // column's tiles are visited, using the column's own leading (right)
    // edge as a monotonic leftward frontier. Every tile in this or any
    // later (further-left) column has centerX <= columnRight, so an entry
    // is safe to drop exactly when the frontier has moved avoidancePx
    // past it -- same reasoning as createGalleryBatch, mirrored for the
    // opposite direction.
    nearbyLargeTiles = pruneLargeTilesForVariety(
      nearbyLargeTiles,
      columnRight,
      largeTileAvoidancePx,
      -1,
    );

    pattern.tiles.forEach((tile) => {
      const baseWidth = (tile.w / 100) * columnWidthPx;
      const width = tile.interlockTab
        ? baseWidth +
          seamGapPx +
          getInterlockReachPx(
            rightNeighborPatternIndex,
            rightNeighborPattern,
            worldCanvasHeight,
          )
        : baseWidth;
      const height = (tile.h / 100) * canvasHeight;
      const left = columnLeft + (tile.left / 100) * columnWidthPx;
      const top = (tile.top / 100) * canvasHeight;

      // Curated Large-Tile Variety: see createGalleryBatch's identical
      // comment -- geometry is computed before the image draw so a
      // `discovery` slot's centerX is already known at pick time.
      const centerX = left + width / 2;
      const { src, nextPickerState } = tile.discovery
        ? pickLargeAwareImage(
            pickerState,
            tile.orientation,
            imagePool,
            nearbyLargeTiles,
            largeTileAvoidancePx,
            centerX,
          )
        : pickImage(pickerState, tile.orientation, imagePool);
      pickerState = nextPickerState;
      const archiveItem = findArchiveItemBySrc(src);

      if (tile.discovery) {
        nearbyLargeTiles = recordLargeTileForVariety(
          nearbyLargeTiles,
          centerX,
          archiveItem?.project ?? null,
        );
      }

      items.push({
        id: `${batchIndex}-${itemIndex}`,
        batchIndex,
        moduleIndex: thisModuleIndex,
        patternIndex,
        src,
        alt: `Gallery image ${itemIndex + 1}`,
        layout: {
          width: `${Math.round(width)}px`,
          height: `${Math.round(height)}px`,
          left: `${Math.round(left)}px`,
          top: `${Math.round(top)}px`,
          relationshipMotion: null,
          zIndex: Math.round(getRandomBetween(1, 12)),
          discovery: tile.discovery === true,
        },
        opacity: getRandomOpacity(),
        tag: imageTags[src] || null,
        archiveNumber: archiveItem?.archiveNumber ?? null,
        project: archiveItem?.project ?? null,
        theme: archiveItem?.theme ?? null,
        themes: archiveItem?.themes ?? [],
        motion: getRandomImageMotion(),
      });

      itemIndex += 1;
    });

    cursorX = columnLeft - seamGapPx;
  }

  return {
    items,
    nextColumnState: {
      cursorX,
      lastPatternIndex,
      pickerState,
      moduleIndex,
      nearbyLargeTiles,
    },
  };
}

// Bounded Runtime Field pass (Round G refinement): pure scalar version
// of the old getGalleryTrackWidth(items) -- takes the already-tracked
// rightmost generated world-X edge (frontierRightXRef.current) directly
// instead of scanning every item ever generated to recompute it. Same
// output for the same underlying frontier, O(1) instead of O(total
// lifetime item count).
function getGalleryTrackWidthFromFrontier(frontierRightX) {
  const viewportWidth =
    typeof window === "undefined" ? 1200 : window.innerWidth;

  return Math.ceil(frontierRightX + viewportWidth);
}

// Bounded Runtime Field pass (Round G refinement): the bounds of a
// single batch's own items, computed once (O(batch size), not O(total
// lifetime item count)) at the moment that batch is created or loaded
// into the cache -- used to maintain frontierRightXRef and to key
// batchBoundsRef. Same left/right-edge math getGalleryTrackWidth /
// isItemInRenderWindow always used, just scoped to one batch's own
// items instead of the full history.
function getBatchBounds(items) {
  return items.reduce(
    (bounds, item) => {
      const left = Number.parseFloat(item.layout.left);
      const right = left + Number.parseFloat(item.layout.width);

      return {
        left: Math.min(bounds.left, left),
        right: Math.max(bounds.right, right),
      };
    },
    { left: Infinity, right: -Infinity },
  );
}

function clamp(value, min, max) {
  if (min > max) return (min + max) / 2;
  return Math.min(Math.max(value, min), max);
}

// Relationship Field Recede pass: study of what happens AFTER the 325ms
// hover-intent dwell commits. The dwell itself, HoverOverlay's dwell timer,
// and the asymmetric 260ms/170ms activation/deactivation durations are all
// untouched by this pass -- this only adds a small deterministic PER-TILE
// transition-delay to the unrelated/receding field's existing opacity+blur
// transition, so the recede reads as the field redistributing its
// attention rather than one uniform state flip.
//
// Deliberately a plain CSS custom property + `transition-delay`, not a
// setTimeout per tile: this is the "state-derived mechanism" the brief
// asked for. If relatedArchiveNumbers clears (motion begins, pointer
// leaves, a new theme is dwelled) before a tile's delayed transition has
// even started, the browser abandons the pending delay on its own --
// there is no JS timer to leak, cancel, or race, because none exists. The
// stagger is entirely a property of the CSS transition already in place;
// this only varies ONE input (the delay) per tile, deterministically.
//
// hashUnitInterval: a stable, non-Math.random per-tile pseudo-value in
// [0, 1), seeded from the tile's own persistent id (`${batchIndex}-
// ${itemIndex}`, stable for that tile's whole lifetime -- see
// createGalleryBatch). Same tile -> same value, every render, every
// session -- deterministic, not randomized at interaction time, per this
// pass's own requirement.
//
// FNV-1a (large non-zero offset basis, XOR + multiply by a large prime
// per character) rather than a simpler multiply-and-add hash starting
// from 0: item.id is only 3-5 characters ("0-12"), and a from-0
// accumulator was measured (empirical test harness) to stay too small
// across that few iterations, collapsing toward ~0 for every id and
// producing an almost-zero delay for every tile -- not the intended
// "well-distributed, no visible pattern" texture. FNV-1a's large seed and
// per-character multiply avoid that even for very short keys.
function hashUnitInterval(key) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < key.length; i += 1) {
    hash ^= key.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0) / 4294967296;
}

// Total field-spread ceiling: 130ms sits in the 100-160ms range this pass's
// own brief suggested, and doubles as the spatial-propagation clamp ceiling
// so a tile at the far edge of a large field never drifts into a slow,
// separately-noticeable straggle.
const RELATIONSHIP_RECEDE_MAX_DELAY_MS = 130;

// Spatial propagation: world-space Euclidean distance from the
// intentionally-committed tile (relationshipOriginLayout, this render's own
// center-point of whichever tile the visitor's cursor is still over when
// the dwell commits -- see hoveredGalleryItemId's own wiring, untouched by
// this pass) to this tile's own center, compressed into the ceiling above.
// item.layout.left/top/width/height are DAPC's own authored world-space
// geometry (px strings, already used elsewhere for camera math) -- reused
// as-is, not recomputed, per this pass's "the composition remains
// authoritative" instruction. Chosen over a pure per-tile hash (tested as
// "Variant A" during this pass's own A/B/C study) because a spatial
// gradient reads as the field's attention shifting outward from the point
// of interest -- a pure per-tile hash has no spatial meaning, so adjacent
// tiles could recede at very different rates for no legible reason, which
// read closer to "noise" than an authored response during testing.
//
// RELATIONSHIP_RECEDE_DISTANCE_DIVISOR_PX: how many world px map to 1ms of
// delay before the ceiling clamps. Chosen so an ordinary on-screen distance
// (a few hundred to ~2000px, typical for tiles sharing a viewport) maps to
// a fraction of the total ceiling, not a dramatic visible sweep -- a tile
// 2860px from the origin already sits at the ceiling, so even a very
// wide/zoomed-out field never produces a slow, separately-perceptible
// straggle at the far edge.
const RELATIONSHIP_RECEDE_DISTANCE_DIVISOR_PX = 22;
function getSpatialPropagationDistanceMs(item, originLayout) {
  if (!originLayout) return 0;
  const left = Number.parseFloat(item.layout.left);
  const top = Number.parseFloat(item.layout.top);
  const width = Number.parseFloat(item.layout.width);
  const height = Number.parseFloat(item.layout.height);
  const cx = left + width / 2;
  const cy = top + height / 2;
  const dx = cx - originLayout.cx;
  const dy = cy - originLayout.cy;
  const distance = Math.sqrt(dx * dx + dy * dy);
  return clamp(
    distance / RELATIONSHIP_RECEDE_DISTANCE_DIVISOR_PX,
    0,
    RELATIONSHIP_RECEDE_MAX_DELAY_MS,
  );
}

// A small deterministic +/- jitter (hashUnitInterval, same stable per-tile
// id-based pseudo-value used nowhere else once the pure micro-stagger
// variant was retired) layered onto the spatial value above, breaking up
// the otherwise perfectly smooth concentric distance bands pure spatial
// propagation alone produces -- without introducing any visible randomness
// (same tile, same offset, always). This was the "Variant C" combination in
// this pass's own A/B/C study, and tested as the strongest of the three:
// spatially coherent (unlike the pure hash), but without a perfectly clean
// ring-like edge (unlike spatial propagation alone).
const RELATIONSHIP_RECEDE_MICRO_JITTER_MS = 14;
function getRelationshipRecedeDelayMs(item, originLayout) {
  const spatial = getSpatialPropagationDistanceMs(item, originLayout);
  const jitter = (hashUnitInterval(item.id) - 0.5) * RELATIONSHIP_RECEDE_MICRO_JITTER_MS;
  return Math.round(
    clamp(spatial + jitter, 0, RELATIONSHIP_RECEDE_MAX_DELAY_MS),
  );
}

// Camera Feel pass: WheelEvent.deltaMode declares the UNIT deltaX/deltaY
// are expressed in -- 0 (DOM_DELTA_PIXEL) is what every evergreen browser
// reports for both a physical mouse wheel and a trackpad gesture today,
// but the spec still allows 1 (DOM_DELTA_LINE -- some Firefox
// configurations with "scroll by line" enabled) and 2 (DOM_DELTA_PAGE).
// Converting defensively here means the camera's pixel-tuned feel doesn't
// silently become an order of magnitude too slow (or too fast) on the
// rare browser/OS/driver combination that still reports lines or pages,
// without needing to flatten every device's own natural delta magnitude
// into one identical value -- LINE_HEIGHT_PX (16) mirrors the approximate
// CSS line-height browsers themselves use for this exact conversion; PAGE
// mode is normalized against the viewport's own dimension, matching what
// "one page" actually means on screen.
const WHEEL_LINE_HEIGHT_PX = 16;
function normalizeWheelAxisDelta(value, deltaMode, viewportDimension) {
  if (deltaMode === 1) return value * WHEEL_LINE_HEIGHT_PX;
  if (deltaMode === 2) return value * viewportDimension;
  return value;
}

// Weighted Dial Pan Feel pass: soft saturation for wheel/trackpad pan
// input, applied to the already deltaMode-normalized raw delta BEFORE it
// becomes a velocity contribution (see CAMERA_PAN_WHEEL_SATURATION_PX's
// own comment for the constant, and handleWheel's call site). tanh(x/k)*k
// passes small |x| through almost linearly (x << k => close to x, so a
// small trackpad frame still feels precise and direct) while bending
// smoothly toward a fixed asymptote of +-k as |x| grows arbitrarily large
// (a fast notch or an outlier spike gets diminishing additional effect,
// never a hard cliff). This replaces the old flat multiplier + hard clamp
// combination for wheel input specifically; touch-drag's own call site
// never calls this (see CAMERA_PAN_TOUCH_IMPULSE_COEFF's comment).
function softenWheelPanDelta(rawDelta) {
  if (rawDelta === 0) return 0;
  const sign = rawDelta > 0 ? 1 : -1;
  return (
    sign *
    CAMERA_PAN_WHEEL_SATURATION_PX *
    Math.tanh(Math.abs(rawDelta) / CAMERA_PAN_WHEEL_SATURATION_PX)
  );
}

function getClusterCenter(placement, focusedRect, relatedRect) {
  const centerX = window.innerWidth / 2;
  const centerY = window.innerHeight / 2;
  const visualFocusedWidth = focusedRect.width * 1.08;
  const visualFocusedHeight = focusedRect.height * 1.08;
  const relatedWidth = relatedRect.width * placement.scale;
  const relatedHeight = relatedRect.height * placement.scale;
  const minX = viewportMargin + relatedWidth / 2;
  const maxX = window.innerWidth - viewportMargin - relatedWidth / 2;
  const minY = viewportMargin + relatedHeight / 2;
  const maxY = window.innerHeight - viewportMargin - relatedHeight / 2;

  if (placement.axis === "x") {
    return {
      x: clamp(
        centerX + visualFocusedWidth * placement.distance * placement.direction,
        minX,
        maxX,
      ),
      y: clamp(centerY, minY, maxY),
    };
  }

  return {
    x: clamp(centerX, minX, maxX),
    y: clamp(
      centerY + visualFocusedHeight * placement.distance * placement.direction,
      minY,
      maxY,
    ),
  };
}

function getClusterConnector(item, index, focusedRect) {
  const placement = clusterPlacements[index % clusterPlacements.length];
  const centerX = window.innerWidth / 2;
  const centerY = window.innerHeight / 2;
  const relatedCenter = getClusterCenter(placement, focusedRect, item.rect);
  const focusedHalfWidth = (focusedRect.width * 1.08) / 2;
  const focusedHalfHeight = (focusedRect.height * 1.08) / 2;
  const relatedHalfWidth = (item.rect.width * placement.scale) / 2;
  const relatedHalfHeight = (item.rect.height * placement.scale) / 2;

  if (placement.axis === "x") {
    const startX = centerX + focusedHalfWidth * placement.direction;
    const endX = relatedCenter.x - relatedHalfWidth * placement.direction;

    return {
      id: item.id,
      x1: startX,
      y1: centerY,
      x2: endX,
      y2: centerY,
    };
  }

  return {
    id: item.id,
    x1: centerX,
    y1: centerY + focusedHalfHeight * placement.direction,
    x2: centerX,
    y2: relatedCenter.y - relatedHalfHeight * placement.direction,
  };
}

// --- Renderer -------------------------------------------------------------
// Per the ownership model adopted this milestone (Archive / Navigator /
// Camera / Renderer / Interaction), the Renderer is the single owner of
// every DOM write associated with the gallery track's presentation: the
// transform that positions the track, the per-item entrance-reveal
// animation, and the virtualization window that decides which
// already-generated items are close enough to mount. It receives
// world-space state (movement, galleryItems) and Camera state
// (viewportScaleRef) as plain inputs -- it owns no state beyond the DOM
// refs/closures it needs to perform its own writes, it never requests
// archive generation, and it never reads archive internals beyond the
// layout each item already carries.
//
// viewportScaleRef.current now drives the actual projection math below
// (projectWorldToScreenX, getVerticalScaleCompensation, applyTransform) --
// as of Camera Phase 1, it's a real, user-controlled value (see
// handleZoomStep in App()), not the fixed 1.5 verification constant or the
// unread placeholder this comment used to describe. As of the Filter
// drawer's viewport-scale fix, the value that actually reaches those three
// is getEffectiveScale()'s combination of this with viewportDrawerScaleRef
// -- see that helper's own comment, just below.
function createGalleryRenderer({
  track,
  wrapperById,
  animatedImages,
  movement,
  viewportScaleRef,
  viewportDrawerScaleRef,
  viewportPanXRef,
  viewportPanYRef,
  renderWindowRef,
  setRenderWindowState,
  focusedIdRef,
  preEntryDistance,
  renderWindowUpdateThreshold,
  openingHeight,
  // Motion-Stability pass: the same isScrolling ref App()'s own
  // Browsing/Exploration mode already computes (real pan velocity OR an
  // unsettled zoom -- see updateGalleryMotion's own comment), aliased here
  // under the name this file's entrance system actually cares about.
  // Deliberately the SAME ref, not a parallel second one -- one signal,
  // two consumers (CSS-driven Relationship Engine suppression via the
  // is-scrolling class, and this renderer's own entrance/local-motion
  // suppression below), per the explicit instruction not to invent a new
  // state system.
  isArchiveInMotionRef,
  // High-End Motion/Transition Polish pass: a second, later-arriving
  // signal than isArchiveInMotionRef above -- true only once the field has
  // finished its short post-motion settle (see FIELD_SETTLE_GRACE_MS's own
  // comment). isArchiveInMotionRef alone answers "is the camera moving";
  // this answers "has it also had its brief settle beat since it stopped."
  // Read by updateEntranceAnimations below to stagger entrance/local-
  // transform eligibility one small step later than the camera-stopped
  // moment itself, instead of both resuming on the exact same frame
  // isArchiveInMotionRef flips false.
  isFieldSettledRef,
}) {
  const setTrackX = gsap.quickSetter(track, "x", "px");
  const setTrackY = gsap.quickSetter(track, "y", "px");
  // Separate scaleX/scaleY quickSetters, not a single "scale" one --
  // gsap.quickSetter(track, "scale") throws InvalidCharacterError against
  // this element, the same issue hit and worked around earlier in this
  // rebuild.
  const setTrackScaleX = gsap.quickSetter(track, "scaleX");
  const setTrackScaleY = gsap.quickSetter(track, "scaleY");

  // The ONE place viewportScaleRef (the visitor's own zoom) and
  // viewportDrawerScaleRef (the Filter drawer's temporary influence,
  // eased once per frame in App()'s own animation loop toward whatever
  // scale the drawer's actual current height requires -- see
  // updateGalleryMotion's own comment for the derivation) are combined
  // into the single scale every projection/paint below actually uses.
  // Every reader of "the current scale" in this function calls this
  // instead of reading
  // viewportScaleRef.current directly, so the drawer's influence is never
  // partially applied (e.g. track visually scaled down but entrance
  // animations still projected at the visitor's raw zoom) and there is
  // still exactly one number representing "the current scale" at any
  // given moment.
  const getEffectiveScale = () =>
    viewportScaleRef.current * viewportDrawerScaleRef.current;

  // The single horizontal world->screen projection path. Every horizontal
  // screen-space position the Gallery Renderer produces -- the track's own
  // transform, each item's entrance-animation position -- must be derived
  // by calling this, not by re-deriving the relationship independently.
  // Anchored on the viewport's own center rather than the world's
  // coordinate origin: whatever world position currently sits at
  // window.innerWidth/2 stays visually at window.innerWidth/2 regardless
  // of scale (substitute worldX = anchorWorldX below and the scale term
  // drops out entirely). At scale = 1 this reduces algebraically to
  // anchorScreenX + (worldX - distance - anchorScreenX) = worldX -
  // distance -- byte-identical to the pre-anchor formula, verified
  // numerically after this function was written.
  //
  // Camera Phase 3A: + viewportPanXRef.current is the only addition. It's a
  // second, purely Camera-owned value (see its declaration in App(), right
  // next to viewportScaleRef) -- a constant horizontal offset, independent
  // of worldX, so it doesn't disturb the screen = trackX + worldX*scale
  // relationship this formula already guarantees (it just shifts trackX).
  // handleZoomStep recomputes it, each time scale changes, to exactly
  // cancel out the shift a center-anchored zoom would otherwise produce at
  // whatever screen position the zoom is anchored on -- viewport center
  // for the buttons, the cursor for wheel/pinch. Navigator's `distance`
  // never appears in that recomputation and is never written here; at
  // panRef = 0 (its default, and its value whenever every zoom so far has
  // been anchored exactly at center) this is a no-op, so scale = 1 and
  // center-anchored zoom stay byte-identical to Phase 1/2.
  const projectWorldToScreenX = (worldX, distance, scale) => {
    const anchorScreenX = window.innerWidth / 2;
    const anchorWorldX = distance + anchorScreenX;
    return anchorScreenX + (worldX - anchorWorldX) * scale + viewportPanXRef.current;
  };

  // Deliberately NOT a projectWorldToScreenY. There is still no vertical
  // world coordinate to project -- Navigator owns no vertical distance,
  // no item's vertical placement is ever individually computed in JS (each
  // item's `top` is static world-space CSS, carried along by this
  // element's own single transform), and this function still takes no
  // worldY parameter, because nothing about an individual item's vertical
  // position varies.
  //
  // Vertical framing is intentionally NOT cursor-anchored. The archive is
  // horizontally navigable but has no vertical world to navigate -- its
  // vertical position is a fixed composition centered on the OpeningViewport,
  // not a place the cursor can be "over" -- BEFORE the True 2D Cursor Zoom
  // pass, that is. This is still the base vertical term: pure opening-
  // anchored scale compensation, anchored on openingHeight/2 -- the
  // viewing-window opening's OWN center, supplied by Application Layout --
  // not window.innerHeight/2 and not any interaction-time cursor position.
  // This element's local coordinate space starts at the opening's own
  // top-left (Archive no longer bakes any page-relative offset into tile
  // positions), so the anchor has to be expressed in that same
  // opening-relative space. Application Layout positions the opening itself
  // on the page separately, via untransformed layout, so this function never
  // needs to know where on the page that is. On its own, with no pan term,
  // this always returns the composition to exactly this same vertical
  // position at every scale -- applyTransform below now adds
  // viewportPanYRef's own correction on top of this, exactly the same
  // relationship viewportPanXRef already has with projectWorldToScreenX
  // (a pure additive offset, not a replacement of this term).
  const getVerticalScaleCompensation = (scale) => {
    return (openingHeight / 2) * (1 - scale);
  };

  // Bounded Runtime Field pass (Round G idle-work audit): applyTransform
  // runs every RAF frame the archive's animation loop is alive,
  // including every frame at rest (the RAF loop itself keeps running
  // even once motion has fully settled -- see updateGalleryMotion's own
  // call site). Previously each of the 4 GSAP quickSetter calls below
  // ran unconditionally every frame regardless of whether the value
  // being set had actually changed -- quickSetters do not skip
  // identical-value writes internally. These closure-scoped
  // lastApplied* values let applyTransform skip a given setter call
  // when the newly-computed value is byte-identical to what was last
  // actually applied, with no change to wake-up behavior or motion
  // feel: the very next frame where any value differs (any real camera
  // motion, including the first frame after idle) still calls every
  // setter that needs it, exactly as before.
  let lastAppliedTrackX = null;
  let lastAppliedTrackY = null;
  let lastAppliedTrackScaleX = null;
  let lastAppliedTrackScaleY = null;

  const applyTransform = (distance) => {
    const scale = getEffectiveScale();

    const nextTrackX = projectWorldToScreenX(0, distance, scale);
    if (nextTrackX !== lastAppliedTrackX) {
      setTrackX(nextTrackX);
      lastAppliedTrackX = nextTrackX;
    }

    // True 2D Cursor Zoom pass: viewportPanYRef.current is the ONLY change
    // here -- see its own declaration and applyZoomAnchor's comment. The
    // base opening-centered compensation is untouched and still runs every
    // frame; this is a pure additive correction on top of it, the same
    // relationship viewportPanXRef already has with projectWorldToScreenX.
    // No new wrapper transform, no new element -- same setTrackY call this
    // always was.
    // Vertical transform stays three distinct additive components:
    //   1. vertical scale compensation (opening-centered base, above)
    //   2. zoom-anchor Y correction (viewportPanYRef.current, above)
    //   3. free touch Y pan (movement.distanceY -- genuine one-finger
    //      vertical camera travel, converted from world units to screen
    //      pixels via the current effective scale, mirroring how X's
    //      world quantities are scaled in projectWorldToScreenX)
    // Deliberately kept separate, never merged. `movement` is already in
    // scope here via createGalleryRenderer's own closure.
    const nextTrackY =
      getVerticalScaleCompensation(scale) +
      viewportPanYRef.current +
      movement.distanceY * scale;
    if (nextTrackY !== lastAppliedTrackY) {
      setTrackY(nextTrackY);
      lastAppliedTrackY = nextTrackY;
    }

    if (scale !== lastAppliedTrackScaleX) {
      setTrackScaleX(scale);
      lastAppliedTrackScaleX = scale;
    }
    if (scale !== lastAppliedTrackScaleY) {
      setTrackScaleY(scale);
      lastAppliedTrackScaleY = scale;
    }
  };

  const primeEntranceState = (galleryItems) => {
    galleryItems.forEach((item) => {
      const wrapper = wrapperById.get(item.id);
      if (!wrapper) return;
      if (animatedImages.has(item.id)) return;

      gsap.set(wrapper, {
        opacity: 0.18,
        y: 12,
        scale: 0.96,
        filter: "blur(8px) saturate(0.72) brightness(0.94)",
      });
      wrapper.dataset.initialReveal = wrapper.dataset.initialReveal || "true";
      wrapper.dataset.smoothX = "0";
      wrapper.dataset.smoothY = "12";
      wrapper.dataset.smoothScale = "0.96";
    });
  };

  // Perf: iterate the currently-MOUNTED wrappers (wrapperById -- kept
  // correct on every mount/unmount by each wrapper's own callback ref, see
  // wrapperRegistryRef's own comment) instead of the full, unboundedly
  // growing galleryItems array. Every item not currently mounted already
  // failed the old `if (!wrapper) return` check and did no real work, so
  // this visits exactly the same items and runs exactly the same
  // computation for each -- it just stops paying an O(all-items-ever-
  // created) traversal cost every animation frame to discover that. The
  // caller now passes an id->item Map (galleryItemsById) instead of the
  // items array, rebuilt only when galleryItems itself changes (once per
  // gallery extension), not once per frame.
  const updateEntranceAnimations = (itemsById) => {
    wrapperById.forEach((wrapper, id) => {
      const item = itemsById.get(id);
      if (!item) return;

      const layoutLeft = Number.parseFloat(item.layout.left);
      const layoutWidth = Number.parseFloat(item.layout.width);
      const scale = getEffectiveScale();
      const screenLeft = projectWorldToScreenX(
        layoutLeft,
        movement.distance,
        scale,
      );
      const screenRight = screenLeft + layoutWidth;
      const isVisible = screenRight > 0 && screenLeft < window.innerWidth;
      // Desktop Zoom + Motion Polish pass: an item drifting past
      // preEntryDistance of the viewport edge is what resets an
      // already-revealed tile back to its hidden pre-entrance state
      // (isAwayFromViewport below), so it replays its pop-in the next time
      // it re-enters view. The first attempt here tried to make that
      // margin scale-INVARIANT (reasoning: zoom shouldn't cross a
      // screen-space threshold the way a pan does) -- direct instrumentation
      // proved that reasoning wrong. The world-space range actually
      // visible on screen genuinely shrinks as scale increases (zooming in
      // IS showing less world -- projectWorldToScreenX's own contract, not
      // a bug), so a boundary tile legitimately leaving that shrunken
      // range is correct geometry, not drift to be corrected. Scaling (or
      // world-izing) the margin doesn't change that: instrumented after
      // that fix, the same pure zoom-in/zoom-out cycle (no pan) still
      // reset tiles, because those tiles were genuinely, correctly
      // computed as now-outside-cushion by BOTH the old and the "fixed"
      // formula alike.
      //
      // The actual defect is narrower: this same tight, ~360px cushion is
      // reused for two different jobs that don't need the same tolerance.
      // For staging a NOT-YET-REVEALED tile's entrance (isNearViewport,
      // untouched below) a tight cushion is exactly right -- it's a small
      // head start before the tile is visible. For deciding whether an
      // ALREADY-REVEALED tile should be torn back down to hidden
      // (isAwayFromViewport), that same tight cushion means an ordinary
      // zoom step -- which moves the visible world range by exactly the
      // kind of distance a 360px margin is meant to absorb -- routinely
      // crosses it for tiles sitting near the current edge, even though
      // the visitor hasn't panned anywhere and is likely to zoom right
      // back. Verified directly: one in/out zoom cycle at a fixed cursor,
      // zero pan, reset dozens of already-revealed tiles before this fix.
      //
      // Fixed by giving the away-reset its own, much larger margin
      // (AWAY_FROM_VIEWPORT_MARGIN_PX) -- generous enough to absorb normal
      // zoom oscillation, but still kept safely under the render window's
      // own minimum mount/unmount overscan (minRenderOverscan = 1200px)
      // so a tile is still always reset -- and animatedImages kept in sync
      // -- well before it would ever actually unmount from the DOM (see
      // that Set's own comment for why this ordering matters: nothing else
      // clears an id from it on unmount). isNearViewport, isVisible, and
      // screenLeft/screenRight are all untouched.
      const isNearViewport =
        screenRight > -preEntryDistance &&
        screenLeft < window.innerWidth + preEntryDistance;
      const isAwayFromViewport =
        screenRight < -AWAY_FROM_VIEWPORT_MARGIN_PX ||
        screenLeft > window.innerWidth + AWAY_FROM_VIEWPORT_MARGIN_PX;
      const wrapperCenter = screenLeft + layoutWidth / 2;
      const viewportCenter = window.innerWidth / 2;
      const centerAmount =
        1 -
        clamp(Math.abs(wrapperCenter - viewportCenter) / viewportCenter, 0, 1);
      const centerScale = 1 - centerAmount * 0.05;
      const relationshipProgress = item.layout.relationshipMotion
        ? Number(wrapper.dataset.relationshipProgress || 0)
        : 0;
      const relationshipTarget =
        item.layout.relationshipMotion && movement.direction >= 0 ? 1 : 0;
      const nextRelationshipProgress =
        relationshipProgress +
        (relationshipTarget - relationshipProgress) * 0.08;
      const relationshipX =
        (item.layout.relationshipMotion?.targetX || 0) *
        nextRelationshipProgress;
      const relationshipY =
        (item.layout.relationshipMotion?.targetY || 0) *
        nextRelationshipProgress;

      if (item.layout.relationshipMotion) {
        wrapper.dataset.relationshipProgress = String(
          nextRelationshipProgress,
        );
      }

      if (isNearViewport && !animatedImages.has(item.id)) {
        animatedImages.add(item.id);

        if (isArchiveInMotionRef.current || !isFieldSettledRef.current) {
          // Motion-Stability pass: the Archive is actively panning/
          // zooming (see isArchiveInMotionRef's own comment at this
          // renderer's params) -- a tile newly crossing into view during
          // real motion is set straight to its final resting state in
          // this one frame instead of queuing the tween below. That tween
          // is a genuinely local, independent animation on this one tile;
          // playing it while the whole world is moving past is exactly
          // what read as "twenty individual cards each reacting
          // independently" rather than one stable composition moving
          // through the viewport. No blank gap and no wait: opacity/
          // scale/filter land at their final values immediately, same
          // frame the tile is first considered near-viewport.
          //
          // High-End Motion/Transition Polish pass: the `|| !isFieldSettledRef.current`
          // addition extends this same instant-final-state treatment
          // through the brief post-motion settle beat too (see
          // FIELD_SETTLE_GRACE_MS's own comment) -- a tile crossing into
          // view in that short window right after the camera stops still
          // lands at its final state immediately rather than queuing a
          // tween, so entrance tweens only ever start once the field has
          // genuinely finished settling, not the instant the camera does.
          gsap.set(wrapper, {
            opacity: item.opacity,
            x: 0,
            y: 0,
            scale: 1,
            filter: "blur(0px) saturate(1) brightness(1)",
          });
          wrapper.dataset.initialReveal = "false";
          wrapper.dataset.hasEntered = "true";
          wrapper.dataset.smoothX = "0";
          wrapper.dataset.smoothY = "0";
          wrapper.dataset.smoothScale = "1";
        } else {
          // Not moving: a genuinely new (or re-entering, post-away-reset)
          // tile may perform its entrance. Two distinct treatments --
          // initialReveal ("true" only for a tile that has never yet
          // entered, including the very first population at page load;
          // see primeEntranceState) keeps the existing, slightly more
          // present pop -- opacity/y/scale/blur, item.motion's own
          // randomized duration/delay, the initial-load left-to-right
          // stagger -- exactly as it always was. Every other tile
          // (encountered later during ordinary navigation, whether truly
          // new or re-entering after an isAwayFromViewport reset) gets
          // the deliberately quieter SETTLED_ENTRANCE_* treatment: no
          // y-slide (a translate reads more like a card sliding in; this
          // is meant to read as an image resolving into focus), a
          // smaller opacity/scale/blur range, a shorter fixed duration,
          // and a gentler power2 ease -- see those constants' own
          // comments. `y: 0` alone in the settled tween's toVars (with no
          // matching fromVars entry) self-heals any residual y=12 left by
          // a prior away-reset by animating from whatever y currently is
          // -- 0 the overwhelming majority of the time (a no-op), 12 only
          // for the reset-then-revisited case -- without adding a
          // deliberate slide to the ordinary case.
          const isInitialReveal = wrapper.dataset.initialReveal === "true";
          const initialStagger =
            isInitialReveal && isVisible
              ? clamp(screenLeft / window.innerWidth, 0, 1) * 0.42
              : 0;

          gsap.fromTo(
            wrapper,
            isInitialReveal
              ? {
                  opacity: 0.18,
                  y: 12,
                  scale: 0.96,
                  filter: "blur(8px) saturate(0.72) brightness(0.94)",
                }
              : {
                  opacity: SETTLED_ENTRANCE_FROM_OPACITY,
                  scale: SETTLED_ENTRANCE_FROM_SCALE,
                  filter: `blur(${SETTLED_ENTRANCE_FROM_BLUR_PX}px)`,
                },
            isInitialReveal
              ? {
                  opacity: item.opacity,
                  y: 0,
                  scale: 1,
                  filter: "blur(0px) saturate(1) brightness(1)",
                  duration: item.motion.duration,
                  delay: initialStagger + item.motion.delay,
                  ease: "power3.out",
                  onComplete: () => {
                    wrapper.dataset.initialReveal = "false";
                    wrapper.dataset.hasEntered = "true";
                    wrapper.dataset.smoothX = "0";
                    wrapper.dataset.smoothY = "0";
                    wrapper.dataset.smoothScale = "1";
                  },
                  overwrite: "auto",
                }
              : {
                  opacity: item.opacity,
                  y: 0,
                  scale: 1,
                  filter: "blur(0px)",
                  duration: SETTLED_ENTRANCE_DURATION,
                  ease: SETTLED_ENTRANCE_EASE,
                  onComplete: () => {
                    wrapper.dataset.initialReveal = "false";
                    wrapper.dataset.hasEntered = "true";
                    wrapper.dataset.smoothX = "0";
                    wrapper.dataset.smoothY = "0";
                    wrapper.dataset.smoothScale = "1";
                  },
                  overwrite: "auto",
                },
          );
        }
      }

      if (
        isVisible &&
        animatedImages.has(item.id) &&
        wrapper.dataset.hasEntered === "true" &&
        // Motion-Stability pass: freezes the ENTIRE per-frame local-motion
        // block below -- both the smoothX/Y/Scale/relationshipProgress
        // bookkeeping and the gsap.set that applies it -- while the
        // Archive is actively moving, not just the visual write. Freezing
        // only the gsap.set call while letting the bookkeeping keep
        // advancing underneath would have meant the FIRST gsap.set after
        // motion ends could jump to wherever the hidden accumulator had
        // drifted to by then; freezing both means every tile's smoothed
        // x/y/scale sits exactly where it last visibly was, so the ease
        // resumes toward whatever the (possibly since-changed) target is
        // at the normal 0.14/frame rate the instant motion settles, with
        // no snap. This stops the continuous centerScale wobble (every
        // visible tile's scale is normally re-targeted every frame by how
        // close it sits to horizontal viewport-center, which changes
        // constantly while panning) and the relationshipMotion x/y/zIndex
        // offset from reading as local scale/position animation fighting
        // the camera during fast motion -- see this pass's own report for
        // the A/B measurement behind including this block in the fix.
        //
        // High-End Motion/Transition Polish pass: ANDed with
        // isFieldSettledRef.current below for the same reason as the
        // entrance branch above -- the freeze now also holds through the
        // brief post-motion settle beat, so local transforms don't start
        // re-converging on the exact same frame the camera stops (and, on
        // desktop, the exact same frame theme-hover pointer-events come
        // back) -- they wait the one small additional beat every other
        // passive/visual system in this pass now waits for. Still exactly
        // the same 0.14/frame ease with no snap once unfrozen; only WHEN
        // it unfreezes changed, not how.
        !isArchiveInMotionRef.current &&
        isFieldSettledRef.current
      ) {
        const targetX = relationshipX;
        const targetY = relationshipY;
        const targetScale = centerScale;
        const smoothX = Number(wrapper.dataset.smoothX || 0);
        const smoothY = Number(wrapper.dataset.smoothY || 0);
        const smoothScale = Number(wrapper.dataset.smoothScale || 1);
        const nextX = smoothX + (targetX - smoothX) * 0.14;
        const nextY = smoothY + (targetY - smoothY) * 0.14;
        const nextScale =
          smoothScale + (targetScale - smoothScale) * 0.14;

        // Convergence-skip (timeout/white-screen investigation follow-up,
        // extended by the Round H idle-cost audit): once a tile's
        // smoothed x/y/scale have essentially reached their target,
        // re-issuing gsap.set with the same values every single frame is
        // pure waste -- confirmed via direct instrumentation to run
        // ~5,000 times/second, forever, even at complete idle, since this
        // loop has no exit condition tied to motion. The epsilon values
        // are on the PER-FRAME DELTA (nextX - smoothX), not the remaining
        // distance to target directly, but since
        // nextX - smoothX === (targetX - smoothX) * 0.14, a delta under
        // 0.02 means the tile is already within ~0.14px of its target (and
        // scale within ~0.0036% of its target) -- sub-pixel, well under
        // anything perceptible, so there is no visible snap when the skip
        // engages.
        //
        // Round H addendum: this comment used to say "only the redundant
        // gsap.set call is skipped; the smoothX/Y/Scale dataset
        // bookkeeping above still runs every frame unconditionally." That
        // was true, and it was wrong to leave that way -- direct
        // instrumentation during the Round H idle-RAF audit confirmed the
        // dataset writes alone (3 DOM property writes per converged tile,
        // per frame, for every visible/entered tile -- no gsap call
        // needed to make a dataset write real DOM work) were still
        // running at the same ~4,800/second rate this comment already
        // knew about for the gsap.set path, indefinitely, even after 5
        // full minutes of measured idle. The three dataset writes below
        // are now ALSO gated behind hasConverged, moved down next to the
        // gsap.set call they were always paired with -- a tile that has
        // converged simply stops touching the DOM at all, every frame,
        // until its target changes again (motion resumes, or
        // relationshipMotion's own direction-driven target flips). A
        // frozen dataset value is exactly as safe to read next frame as a
        // freshly-rewritten identical one would have been -- nothing else
        // in this file reads wrapper.dataset.smoothX/Y/Scale except this
        // same block's own next-frame read (the only other writers are
        // the fixed-value resets in the entrance/away-from-viewport
        // branches elsewhere in this function) -- so this is a strict
        // narrowing of an already-reviewed-and-shipped optimization, not
        // a new one: it just stops doing the also-redundant write that
        // used to happen right next to the now-already-skipped tween.
        //
        // Deliberately excludes any item with relationshipMotion outright,
        // rather than trying to also converge-check zIndex: zIndex here is
        // a step function of nextRelationshipProgress crossing 0.02, a
        // second, independent threshold not captured by the x/y/scale
        // epsilon above (relationshipMotion's own targetX/Y can be small
        // enough in absolute pixels that x/y read as "converged" slightly
        // before progress itself clears the 0.02 zIndex boundary). Since
        // relationship-motion tiles are always a small minority of what's
        // mounted, and their target also changes independently whenever
        // movement.direction flips, excluding them entirely keeps this
        // change narrowly scoped to the tiles it was actually measured
        // against (plain, non-relationship tiles, whose target -- and
        // hence zIndex, always item.layout.zIndex -- never changes on its
        // own) instead of trying to prove a second, coupled threshold is
        // also safe to skip.
        const hasConverged =
          !item.layout.relationshipMotion &&
          Math.abs(nextX - smoothX) < 0.02 &&
          Math.abs(nextY - smoothY) < 0.02 &&
          Math.abs(nextScale - smoothScale) < 0.0005;

        if (!hasConverged) {
          wrapper.dataset.smoothX = String(nextX);
          wrapper.dataset.smoothY = String(nextY);
          wrapper.dataset.smoothScale = String(nextScale);
          gsap.set(wrapper, {
            opacity: item.opacity,
            x: nextX,
            y: nextY,
            scale: nextScale,
            zIndex:
              nextRelationshipProgress > 0.02
                ? item.layout.relationshipMotion?.zIndex || item.layout.zIndex
                : item.layout.zIndex,
          });
        }
      }

      if (isAwayFromViewport && animatedImages.has(item.id)) {
        animatedImages.delete(item.id);
        gsap.set(wrapper, {
          opacity: 0.18,
          x: 0,
          y: 12,
          scale: 0.96,
          zIndex: item.layout.zIndex,
          filter: "blur(8px) saturate(0.72) brightness(0.94)",
        });
        wrapper.dataset.relationshipProgress = "0";
        wrapper.dataset.hasEntered = "false";
        wrapper.dataset.smoothX = "0";
        wrapper.dataset.smoothY = "12";
        wrapper.dataset.smoothScale = "0.96";
      }
    });
  };

  const updateRenderWindow = () => {
    if (focusedIdRef.current !== null) return;

    const nextRenderWindow = getGalleryRenderWindow(movement.distance);
    const currentRenderWindow = renderWindowRef.current;

    if (
      Math.abs(nextRenderWindow.left - currentRenderWindow.left) <
        renderWindowUpdateThreshold &&
      Math.abs(nextRenderWindow.right - currentRenderWindow.right) <
        renderWindowUpdateThreshold
    ) {
      return;
    }

    renderWindowRef.current = nextRenderWindow;
    setRenderWindowState(nextRenderWindow);
  };

  return {
    applyTransform,
    primeEntranceState,
    updateEntranceAnimations,
    updateRenderWindow,
  };
}

// Mobile Baseline Pass -- Task 2 (Relationship Engine): the single
// enable/disable signal used to gate the Relationship Engine on touch
// devices, per the explicit instruction to introduce "the cleanest
// explicit mobile enable/disable condition possible" rather than deleting,
// simplifying, or rewriting relationshipEngine.js/relationshipModeEvaluator.js
// (both untouched -- see their own files). No mobile/touch detection of
// any kind existed anywhere in this codebase before this pass (confirmed
// via grep for isMobile/matchMedia/innerWidth/pointer/hover -- every
// existing @media rule lives in styles.css and only ever gates CSS, never
// JS behavior). Reads the browser's own hover/pointer capability rather
// than viewport width: what's actually being gated is a hover-driven
// interaction system, so a device with a coarse pointer and no real hover
// (a phone or tablet) is what "mobile" means for this specific decision,
// regardless of how wide its viewport happens to be -- a narrow desktop
// browser window should NOT lose hover behavior it can still perform.
// Pairing (hover: none) with (pointer: coarse) (rather than either alone)
// keeps this specific to touch-primary devices. Live via the
// MediaQueryList's own change event (not just read once at mount) so an
// emulator/device toggle during a session is reflected immediately.
function useIsTouchDevice() {
  const TOUCH_QUERY = "(hover: none) and (pointer: coarse)";
  const [isTouchDevice, setIsTouchDevice] = useState(() => {
    if (typeof window === "undefined" || !window.matchMedia) return false;
    return window.matchMedia(TOUCH_QUERY).matches;
  });

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return undefined;
    const mediaQueryList = window.matchMedia(TOUCH_QUERY);
    const handleChange = (event) => setIsTouchDevice(event.matches);
    mediaQueryList.addEventListener("change", handleChange);
    return () => mediaQueryList.removeEventListener("change", handleChange);
  }, []);

  return isTouchDevice;
}

function App() {
  // Phase 3 (Connect Projects): moved here from module scope -- see the
  // comment left at the old location, above the module-level helpers,
  // for why. Recomputed on every render rather than memoized, same as
  // every other getProjects()/getArchiveItems() call site in this
  // component (e.g. the queryArchive call in applyMetadataQuery below) --
  // not a new performance posture for this file, and Projects is a small
  // list either way.
  const PROJECT_TITLES = getProjects().map((project) => project.title);
  const PROJECT_SLUG_BY_TITLE = new Map(
    getProjects().map((project) => [project.title, project.slug]),
  );

  // Type Filter: same reasoning and placement as PROJECT_TITLES
  // immediately above -- computed here, at render time, from
  // getProjects() (Type lives on Project, not Archive Item -- see
  // cms/schemaTypes/projectType.js). Type isn't a one-per-Project unique
  // value -- several Projects can share a Type, and (CMS Type
  // Multi-Select pass) a single Project can now carry more than one Type
  // itself -- so this flattens every Project's own `types` array
  // (`flatMap`, not `map`) before deduping via Set the same way
  // ARCHIVE_YEARS_NUMERIC below dedupes Year, then sorts alphabetically
  // (Type has no inherent order the way Year's numeric-descending does,
  // so this follows THEME_NAMES/getThemes()'s own "order title asc"
  // convention instead). `project.types ?? []` guards a Project with no
  // Type set (or published before the field existed) -- an absent Type
  // contributes no option to the Filter rather than a blank one, same
  // "absent means absent" convention normalizeProject already uses.
  // Passed straight through to Header's new `types` prop below, mirroring
  // exactly how THEME_NAMES/PROJECT_TITLES/YEAR_OPTIONS already stop
  // Header from ever falling back to its own MOCK_TYPES default.
  const PROJECT_TYPES = Array.from(
    new Set(getProjects().flatMap((project) => project.types ?? [])),
  ).sort();

  // Phase 4 (Connect Themes): same reasoning and placement as
  // PROJECT_TITLES immediately above -- computed here, at render time,
  // rather than as a module-level const, so it reads getThemes()'s cache
  // after main.jsx's readiness gate has populated it. Passed straight
  // through to Header's existing `themes` prop below (see Header.jsx's
  // own comment inviting exactly this: "point `themes` ... at CMS-driven
  // arrays via props ... from App") -- this is the one behavior change
  // this phase makes: Header's Filter Theme category no longer falls
  // back to its local MOCK_THEMES default, since a prop is now always
  // passed. No other Theme reader changes, because there were no other
  // callers of getThemes() to begin with.
  const THEME_NAMES = getThemes();

  // Year Filter -- Live Data: same reasoning and placement as
  // PROJECT_TITLES/THEME_NAMES immediately above -- computed here, at
  // render time, from getArchiveItems() (the same archive metadata
  // applyMetadataQuery/queryArchive already read below), rather than
  // Header's own hardcoded MOCK_YEARS default. This is the one behavior
  // change this pass makes: Header's Filter Year category no longer falls
  // back to its local MOCK_YEARS default, since a prop is now always
  // passed -- mirroring exactly how the Theme/Project passes above already
  // stopped Header from ever falling back to MOCK_THEMES/MOCK_PROJECTS.
  //
  // Collects both an item's own year (date) and its parent Project's year
  // (projectYear) via extractYearNumber (imported above) -- the same
  // either-one-counts pair the Year Filter Inheritance fix already made
  // queryArchive itself match against (see metadataQueryEngine.js) -- so
  // every year an item could actually match on also has a real button to
  // select it from. Set dedupes, then a numeric descending sort (newest
  // first, matching MOCK_YEARS' own former ordering) runs on numbers, not
  // strings, so "2026" correctly sorts before "2024" rather than by
  // lexical character order (which happens to agree for these particular
  // 4-digit values, but numeric sort is the actually-correct rule, not a
  // coincidence being relied on).
  const ARCHIVE_YEARS_NUMERIC = Array.from(
    new Set(
      getArchiveItems().flatMap((item) => [
        extractYearNumber(item.date),
        extractYearNumber(item.projectYear),
      ]),
    ),
  )
    .filter((year) => Number.isFinite(year))
    .sort((a, b) => b - a);

  // Year Filter -- "Earlier" Bucket: the cutoff is now the oldest year
  // actually found above (ARCHIVE_YEARS_NUMERIC is sorted descending, so
  // that's its last entry) instead of a hardcoded array's own last explicit
  // entry -- fully derived from live data, per this pass's brief. null
  // (rather than a number) when there are no years in the data at all yet,
  // so handleFilterChange below has an explicit "there is no meaningful
  // cutoff" signal instead of a misleading number like 0 or Infinity.
  const EARLIER_CUTOFF_YEAR =
    ARCHIVE_YEARS_NUMERIC.length > 0
      ? ARCHIVE_YEARS_NUMERIC[ARCHIVE_YEARS_NUMERIC.length - 1]
      : null;

  // "Earlier" stays the trailing catch-all after every explicit year --
  // the same UI shape MOCK_YEARS always had, just generated instead of
  // hardcoded now. Passed straight through to Header's existing `years`
  // prop below (mirroring themes/projects immediately above); Header
  // itself needs no changes to accept this -- it already just renders
  // whatever array it's given, in order.
  const YEAR_OPTIONS = [...ARCHIVE_YEARS_NUMERIC.map(String), "Earlier"];

  // Handshake pass (default homepage pool): Search and Filter
  // (applyMetadataQuery below) already prove that Archive Items can
  // become the gallery's pool -- buildImagePool(matched.map((item) =>
  // item.image)) is exactly this, already working. The only gap was that
  // the *default*, unfiltered pool (activeImagePoolRef's initial value,
  // and what resetArchiveState below returns to) still came from the
  // static allImages/DEFAULT_IMAGE_POOL. This reuses the same
  // buildImagePool() call, fed by getArchiveItems() instead of a search
  // match, so the default homepage view goes through the identical,
  // already-proven path. Nothing about COLUMN_PATTERNS,
  // createGalleryBatch, pickImage, or orientation/optimization handling
  // changes -- see getOptimizedImageSrc's own comment for the one
  // adjacent guard that was necessary, and getImageOrientation, which is
  // untouched: a live image has no entry in the static
  // image-metadata.json, so it buckets as "square" and pickImage's
  // existing byOrientation-empty-bucket fallback (imagePool.all) already
  // handles that gracefully -- deferred to the orientation/optimization
  // polish pass, not fixed here.
  //
  // Falls back to the static DEFAULT_IMAGE_POOL only when the live cache
  // is empty (load failed, timed out, or genuinely has no documents yet)
  // -- so a bad load degrades the homepage back to its pre-handshake
  // state instead of breaking every tile's image (see pickImage: an
  // empty pool's bag-refill has nothing to draw from).
  //
  // findArchiveItemBySrc's join (content/archiveItems.js) now succeeds by
  // construction: every src this pool can ever hand pickImage is one of
  // getArchiveItems()'s own .image values, so looking that exact item
  // back up always finds it -- no change needed there.
  const LIVE_ARCHIVE_IMAGES = getArchiveItems()
    .map((item) => item.image)
    .filter(Boolean);
  const DEFAULT_LIVE_IMAGE_POOL = LIVE_ARCHIVE_IMAGES.length
    ? buildImagePool(LIVE_ARCHIVE_IMAGES)
    : DEFAULT_IMAGE_POOL;

  const scrollContainerRef = useRef(null);
  const trackRef = useRef(null);
  const overlayRef = useRef(null);
  const focusedCloneRef = useRef(null);
  const galleryMovementRef = useRef({
    direction: 1,
    distance: 0,
    enabled: true,
    // Precision Dial Pan Weight pass: velocity remains the SAME semantic
    // value every existing downstream reader (render-window, relationship-
    // motion direction, distance accumulation) already expects -- "the
    // actual applied velocity driving this frame's movement." It is now
    // computed each frame as touchVelocity + appliedWheelVelocity rather
    // than being written to directly by wheel input; nothing that only
    // ever READS movement.velocity needed to change.
    velocity: 0,
    // Wheel's own Stage 1 target/force accumulator -- absorbs softened
    // wheel impulses and decays via friction, exactly like the old shared
    // velocity field used to. Never read outside animateGallery/
    // addWheelPanVelocity.
    wheelVelocity: 0,
    // Wheel's Stage 2 -- eases toward wheelVelocity every frame (see
    // CAMERA_PAN_WHEEL_ACCEL_EASE) and is the piece of wheelVelocity that
    // actually contributes to movement.velocity/worldDelta each frame.
    appliedWheelVelocity: 0,
    // Touch's own single-stage accumulator -- direct-injection, decays via
    // the same friction constant, completely independent of the wheel
    // fields above so finger-drag latency is untouched by this pass.
    touchVelocity: 0,
    // Archive touch-camera upgrade (vertical pan) + Desktop Archive Zoom
    // Polish pass: the Y counterpart to distance/touchVelocity immediately
    // above -- same shape, same scale-invariant treatment, same friction.
    // Originally touch-only; desktop wheel/trackpad input now also writes
    // here via addWheelPanVelocityY (see its own comment, next to
    // addTouchPanVelocityY, for why sharing this one field -- rather than
    // giving wheel a separate, parallel Y field -- is the right call).
    // distanceY is the world-space vertical free-pan position (bounded
    // every frame in animateGallery from the real generated-geometry
    // overflow, see that block's own comment); touchVelocityY is its
    // single-stage direct-injection accumulator, mirroring touchVelocity
    // exactly, for either input source.
    distanceY: 0,
    touchVelocityY: 0,
    hasBrowsed: false,
  });
  const isExtendingGalleryRef = useRef(false);
  // Bounded Runtime Field pass (Round G refinement -- replaces the old
  // TEMPORARY DIAGNOSTIC generatedBatchIndicesRef Set that used to live
  // here): the highest batchIndex ever generated for this mounted
  // archive session, a single scalar. This is what extendGalleryIfNeeded
  // now reads to compute nextBatchIndex
  // (highestGeneratedBatchIndexRef.current + 1) instead of scanning any
  // item array -- O(1) instead of O(total lifetime item count) -- and it
  // is also now the only duplicate-batch guard needed: since
  // nextBatchIndex is always this scalar plus one, and this scalar is
  // only ever advanced (never reset, never recomputed from data that
  // could be stale or pruned), the same index can structurally never be
  // computed twice. That makes the old Set-based "has this index already
  // been generated" diagnostic redundant rather than merely superseded --
  // it existed to catch a stale-closure race that this scalar-ref design
  // makes impossible by construction, so it has been removed rather than
  // kept as an ever-growing diagnostic Set whose only job was proving
  // another now-removed structure was behaving.
  const highestGeneratedBatchIndexRef = useRef(-1);
  // The rightmost world-X edge of anything ever generated for this
  // session -- the scalar frontier counterpart to
  // highestGeneratedBatchIndexRef immediately above, maintained the same
  // way (advanced via Math.max whenever a new batch's own bounds exceed
  // it, in extendGalleryIfNeeded and regenerateGallery). This is what
  // getGalleryTrackWidthFromFrontier and extendGalleryIfNeeded's own
  // remainingTrack check now read instead of scanning a full item
  // history or reading track.scrollWidth from the DOM.
  const frontierRightXRef = useRef(0);
  const animatedImagesRef = useRef(new Set());
  // Registry ownership fix: a single persistent Map(item id -> wrapper DOM
  // node), maintained entirely by each wrapper's own callback ref (see the
  // ref prop on .gallery-image-wrapper below) -- set on mount, deleted on
  // unmount. Replaces the old wrapperById, which was a Map built once via
  // querySelectorAll per run of the big navigation effect (i.e. only when
  // `galleryItems` changed). That snapshot went stale the moment a wrapper
  // was mounted or unmounted for any OTHER reason -- a renderWindow update
  // or a focusedId toggle, both of which run on their own schedule,
  // independent of `galleryItems` -- leaving Gallery Renderer's entrance
  // animations pointed at a detached node (or no node) while React had
  // already mounted a different, untouched one for the same id. This Map
  // is the same object for the lifetime of the component (never
  // reassigned, only mutated by the ref callbacks), so it can never go
  // stale relative to the DOM: registration and deregistration are React
  // mount/unmount events, not a periodic snapshot.
  const wrapperRegistryRef = useRef(new Map());
  // Perf fix (unbounded per-frame entrance/relationship-motion work):
  // mirrors renderedGalleryItems (below, computed once per render from
  // the SAME isItemInRenderWindow filter already used for JSX) so the
  // per-frame animation loop can read the currently-relevant subset
  // without re-filtering the full, ever-growing galleryItems array on
  // every animation frame. Written during render (see
  // renderedGalleryItems below), read imperatively inside the big
  // navigation effect -- the same ref-mirrors-render-value pattern this
  // file already uses for renderWindowRef/openingGeometryRef relative
  // to their own state counterparts.
  const renderedGalleryItemsRef = useRef([]);
  // Archive zoom image-quality pass: DOM handles for each currently-
  // mounted gallery tile's <picture> element (keyed by item.id, written
  // by the ref callback on <picture> in the JSX below), and, separately,
  // the largest `sizes` value already promoted to for that tile this
  // session -- a per-item high-water-mark the polling effect below only
  // ever raises, never lowers, so a tile can't be downgraded/reloaded
  // smaller once genuinely zoomed. Both are plain refs, not state: this
  // pass deliberately avoids adding any new React state/re-render tied
  // to the camera's continuous scale, the same reasoning
  // renderedGalleryItemsRef/viewportScaleRef above already follow.
  const galleryPictureElsRef = useRef(new Map());
  const promotedImageSizesRef = useRef(new Map());
  // Mirrors the isScrolling state (declared further down, with its own
  // comment) for the animateGallery loop's own use: that loop runs every
  // frame and is not recreated when isScrolling changes (its effect only
  // depends on galleryItems -- see that effect's own dependency array), so
  // it needs a ref, not the state itself, to know without a stale closure
  // whether it has already flipped isScrolling this "movement episode" and
  // avoid calling setIsScrolling every single frame. isScrolling remains
  // the actual source of truth read by render/CSS; this ref only prevents
  // redundant setState calls.
  const isScrollingRef = useRef(false);
  // High-End Motion/Transition Polish pass: FIELD_SETTLE_GRACE_MS's own
  // ref (see that constant's comment for the reasoning). Starts true --
  // a freshly loaded page that has never moved is already "at rest," not
  // "waiting to settle," so there's nothing to gate before any motion has
  // ever happened. Flips false the instant real motion begins (mirrors
  // isScrollingRef's own instant-on behavior -- no grace period on the way
  // back INTO motion, only on the way out of it) and flips true again only
  // after the chained FIELD_SETTLE_GRACE_MS timer (armed once
  // isScrollingRef itself has already gone false) completes without motion
  // resuming. Read by updateEntranceAnimations (entrance eligibility +
  // local centerScale/relationshipMotion transform resume) and by
  // isRelationshipActivationBlocked (Relationship Engine hover-intent
  // eligibility) -- three read sites, one ref, no new global state enum.
  const isFieldSettledRef = useRef(true);
  // Camera owns this and this alone: the current zoom scale. No vertical
  // state, no interaction logic. A ref, not state, since it's read every
  // animation frame by Gallery Renderer (galleryMovementRef's own
  // reasoning applies here too: no React re-render is needed just because
  // a frame ticked or a zoom button was clicked -- the next
  // requestAnimationFrame tick picks up the new value on its own). Archive
  // and Navigator still never read this. Set directly by handleZoomStep
  // below, with a plain, un-eased assignment; no smoothing or inertia.
  //
  // Mobile Archive Interaction Pass -- Canonical Mobile/Touch Signals: the
  // LAYOUT/breakpoint signal (see useIsMobileUiMode.js's own comment for
  // why this is deliberately separate from useIsTouchDevice below). Called
  // here, early, so its initial value is already available to
  // viewportScaleRef's own initializer immediately below -- React computes
  // a component's hooks top-to-bottom within one render, so this hook's
  // synchronously-computed initial state (see useIsMobileUiMode.js) is
  // already correct by the time viewportScaleRef reads it, with no extra
  // effect/ref-sync needed for this one first-paint value.
  const isMobileUiMode = useIsMobileUiMode();
  // Mirrors isMobileUiMode into a ref for the same reason
  // isProjectFilterActiveRef mirrors isProjectFilterActive elsewhere in
  // this file: getViewportOpeningGeometry/resetCameraToNeutral are called
  // from regenerateGallery (a useCallback with a `[]` dependency array, so
  // its closure is never recreated when isMobileUiMode changes) and from a
  // plain `window.addEventListener("resize", ...)` handler outside React
  // entirely -- both need the CURRENT value without becoming a dependency
  // that would force regenerateGallery's identity (and therefore the
  // gallery-regenerating effect keyed on it) to change every time the
  // viewport crosses the mobile breakpoint.
  const isMobileUiModeRef = useRef(isMobileUiMode);
  useEffect(() => {
    isMobileUiModeRef.current = isMobileUiMode;
  }, [isMobileUiMode]);
  // Mobile Archive Interaction Pass -- Stage 1A (Header Clearance): the
  // Archive's global <Header> instance reports its own live, measured
  // rendered height here via the new onHeaderHeightChange prop -- the
  // exact same ResizeObserver-on-a-DOM-node pattern already established
  // for the Filter drawer's own height (indexDrawerHeightRef/
  // onDrawerHeightChange, just below) -- so mobile UI mode's header
  // clearance (see getViewportOpeningGeometry) always tracks whatever the
  // header ACTUALLY renders at (idle, scrolled/"is-browsing", or with the
  // drawer open) rather than a second guessed constant that can drift from
  // the CSS the way the old shared clearance formula did. Desktop/tablet's
  // own clearance formula never reads this ref at all -- see
  // getViewportOpeningGeometry's isMobileUiMode branch.
  const headerHeightRef = useRef(MOBILE_HEADER_HEIGHT_FALLBACK_PX);
  const handleHeaderHeightChange = useCallback((height) => {
    if (height > 0) headerHeightRef.current = height;
  }, []);
  // Default (client request, polish pass): starts at CAMERA_ZOOM_MIN, not
  // 1 -- the Archive's existing zoom-out floor is now its opening/default
  // state instead of the old untouched-scale baseline. This is the
  // visitor's own zoom level only; deliberately NOT CAMERA_NEUTRAL_SCALE,
  // even though CAMERA_NEUTRAL_SCALE also happens to equal 1 today --
  // CAMERA_NEUTRAL_SCALE is a separate concept (the drawer scale
  // multiplier's own identity/ceiling value, see viewportDrawerScaleRef
  // and its clamp below) that must stay exactly 1 regardless of what the
  // Archive's own default scale is, so it was deliberately left alone.
  // CAMERA_ZOOM_MIN/MAX/STEP and FILTER_DRAWER_ZOOM_FLOOR are all
  // unchanged -- only where the Archive's own scale STARTS moved.
  //
  // Mobile Archive Interaction Pass -- Stage 1D: mobile UI mode starts (and
  // resets to, see resetCameraToNeutral below) MOBILE_DEFAULT_CAMERA_SCALE
  // instead -- desktop's own CAMERA_ZOOM_MIN default is completely
  // unchanged. isMobileUiMode (not isMobileUiModeRef) is read here since
  // this only runs once, on this ref's own creation -- the same reasoning
  // as isMobileUiModeRef's own comment above.
  const viewportScaleRef = useRef(
    isMobileUiMode ? MOBILE_DEFAULT_CAMERA_SCALE : CAMERA_ZOOM_MIN,
  );
  // Camera Feel pass: what viewportScaleRef is easing TOWARD, not what it
  // currently is. handleZoomStep (wheel/buttons) now only ever writes
  // here, clamped to CAMERA_ZOOM_MIN/MAX exactly as viewportScaleRef
  // itself used to be -- the per-frame ease step in updateGalleryMotion is
  // the only thing that still writes viewportScaleRef directly. Starts
  // equal to viewportScaleRef's own initializer so there is no phantom
  // glide on first paint. Mobile pinch bypasses this entirely (see its own
  // call site) and keeps both refs in sync directly, since a pinch gesture
  // is already a live, continuously-updating direct-manipulation input
  // that should track fingers with no added lag.
  const targetScaleRef = useRef(
    isMobileUiMode ? MOBILE_DEFAULT_CAMERA_SCALE : CAMERA_ZOOM_MIN,
  );
  // Camera Feel pass: the live screen-space anchor (event.clientX for
  // wheel, viewport center for buttons) that the per-frame zoom-ease step
  // keeps visually fixed while viewportScaleRef eases toward
  // targetScaleRef -- see applyZoomAnchor's own comment. Written only by
  // handleZoomStep; read only by the per-frame ease step. window.innerWidth
  // / 2 is a reasonable inert default (center-anchored) for the brief
  // window before any zoom input has ever occurred.
  const zoomAnchorClientXRef = useRef(
    typeof window === "undefined" ? 0 : window.innerWidth / 2,
  );
  // True 2D Cursor Zoom pass: the Y-axis counterpart to
  // zoomAnchorClientXRef immediately above, same lifetime and the same
  // "written only by handleZoomStep (and mobile pinch's own direct call),
  // read only by the per-frame ease step" contract. window.innerHeight / 2
  // is the same kind of inert, center-anchored default.
  const zoomAnchorClientYRef = useRef(
    typeof window === "undefined" ? 0 : window.innerHeight / 2,
  );
  // Camera owns scale, and one pan correction per axis. viewportPanXRef is
  // a constant screen-px offset that makes horizontal zoom anchor on the
  // cursor (or, for the buttons, viewport center) instead of always the
  // center. Purely Camera's own correction term: it neither reads nor
  // writes Navigator's `distance`, Archive never sees it, and it only ever
  // changes inside applyZoomAnchor (below), called every frame the
  // camera's scale is actually easing, in the same plain/un-eased way
  // viewportScaleRef itself is written (each individual write is still a
  // plain assignment -- it is the SEQUENCE of per-frame writes, now driven
  // by the ease step instead of a single event, that produces the visible
  // glide). Defaults to 0, which is a total no-op in
  // projectWorldToScreenX -- so scale = 1 and any zoom sequence anchored
  // exactly at center are unaffected, byte-identical to Phase 1/2.
  const viewportPanXRef = useRef(0);
  // True 2D Cursor Zoom pass: the Y-axis counterpart to viewportPanXRef.
  // Applied alongside (added to, not replacing) the existing scale-only
  // getVerticalScaleCompensation term at the one place Gallery Renderer
  // writes the track's vertical transform (see applyTransform) -- the
  // opening-centered compensation still runs exactly as before and
  // guarantees the composition is centered at scale a viewportPanYRef of 0
  // (e.g. a center-anchored zoom, or before any zoom input has occurred);
  // this ref is purely the ADDITIONAL correction a cursor Y position off
  // the opening's own center asks for, unbounded on its own the same way
  // viewportPanXRef is -- see applyZoomAnchor's own comment for where its
  // bound actually comes from.
  const viewportPanYRef = useRef(0);
  // Layout Bug Fix -- Gallery Shift on Filter Open: the Filter drawer's own,
  // entirely separate multiplier on top of viewportScaleRef -- see
  // getEffectiveScale in createGalleryRenderer, the one place the two are
  // combined. Eased once per animation frame (see updateGalleryMotion
  // below) toward a TARGET that's recomputed every frame from the
  // drawer's actual current height (indexDrawerHeightRef, just below) and
  // the opening's own height -- not a flat guess, so it's correct whether
  // the drawer is closed, mid-open, showing its default row, or fully
  // expanded with Theme/Project/Year's "View All" and however many
  // secondary rows that produces. Same per-frame ease-toward-target idiom
  // updateEntranceAnimations already uses for smoothScale. Never set
  // directly, never touched by handleZoomStep/resetCameraToNeutral, so the
  // visitor's own zoom level is completely unaffected by the drawer
  // opening or closing.
  const viewportDrawerScaleRef = useRef(CAMERA_NEUTRAL_SCALE);
  // The Filter drawer's own live rendered height in px (0 when closed),
  // reported by Header.jsx's ResizeObserver via onDrawerHeightChange --
  // read every animation frame by updateGalleryMotion below, exactly the
  // way viewportScaleRef/openingGeometryRef already are, so no re-render
  // is needed just because the drawer's height changed (whether from
  // opening/closing or from a category expanding/collapsing inside it).
  // This is purely a scale INPUT now -- it never drives any transform,
  // margin, or position; see getEffectiveScale/updateGalleryMotion for the
  // one place it's actually used.
  const indexDrawerHeightRef = useRef(0);
  const handleDrawerHeightChange = useCallback((height) => {
    indexDrawerHeightRef.current = height;
  }, []);
  const focusTimelineRef = useRef(null);
  const focusedIdRef = useRef(null);
  const renderWindowRef = useRef(getGalleryRenderWindow());
  // Mobile Archive Interaction Pass -- Stage 1B (Bottom Control Clearance):
  // zoomControlsRef is attached directly to the rendered .zoom-controls
  // element below (see the JSX); the ResizeObserver effect further down
  // measures its real height into zoomControlsHeightRef the same way
  // headerHeightRef/indexDrawerHeightRef are measured -- so mobile UI
  // mode's bottom clearance always tracks the real control footprint
  // (~44px) instead of reusing the header's own, much larger, reservation
  // the way the old shared formula did.
  const zoomControlsRef = useRef(null);
  const zoomControlsHeightRef = useRef(MOBILE_ZOOM_CONTROLS_HEIGHT_FALLBACK_PX);
  // Application Layout's own state -- the viewing-window opening's
  // position (top/bottom) and size (height) on the page. Read imperatively
  // here (by extendGalleryIfNeeded and by the Gallery Renderer, both inside
  // the per-frame effect) exactly the way renderWindowRef already is;
  // mirrored into React state below purely so the JSX can apply top/height
  // as real, untransformed marginTop/height on .opening-viewport -- the
  // one element that owns the clip boundary (see OpeningViewport's own
  // comment in the JSX and in styles.css).
  //
  // Mobile Archive Interaction Pass -- Stage 1: this initial call runs
  // before headerHeightRef/zoomControlsHeightRef have anything measured
  // yet (their own ResizeObservers haven't attached to the DOM at this
  // point in the very first render), so it deliberately reads their
  // fallback-seeded .current values -- see MOBILE_HEADER_HEIGHT_FALLBACK_PX/
  // MOBILE_ZOOM_CONTROLS_HEIGHT_FALLBACK_PX's own comment for why those
  // fallbacks are chosen close to the real measured sizes rather than a
  // second guessed formula.
  const openingGeometryRef = useRef(
    getViewportOpeningGeometry({
      isMobileUiMode,
      headerHeightPx: headerHeightRef.current,
      zoomControlsHeightPx: zoomControlsHeightRef.current,
    }),
  );
  const columnStateRef = useRef(null);
  // Reversal-safety pass (Round H -- supersedes both the original
  // "complete history" galleryItemsRef array AND Round G's bounded,
  // evicting batch CACHE that replaced it, in that order): the
  // PERMANENT historical store of every gallery item ever
  // procedurally generated this session, keyed by batchIndex ->
  // items[]. Never evicted -- Round G's eviction (removed) could
  // permanently delete a batch and leave no way to restore it later,
  // since neither regeneration (createGalleryBatch is not
  // seeded/deterministic -- see its own call sites and
  // pickImage/shuffleArray/getRandomBetween) nor any backward
  // extension path exists; direct testing showed that could empty the
  // entire visible Archive with no self-recovery. This Map is what
  // makes reversal into any previously-visited world position always
  // find its original tiles again.
  //
  // This is still NOT the Round F anti-pattern: a Map keyed by
  // batchIndex is append-friendly by construction --
  // batchCacheRef.current.set(nextBatchIndex, newBatch) in
  // extendGalleryIfNeeded is an O(1) insert, never a full-array copy
  // (the old galleryItemsRef's `[...galleryItemsRef.current,
  // ...newBatch]` spread was O(everything ever generated) on every
  // single extension; this Map never does that). What Round G got
  // right and this pass keeps: retention/collection reads
  // (collectRetainedItems below) work at BATCH granularity via
  // batchBoundsRef immediately below, not by scanning every
  // individual historical tile. What Round G got wrong, that this
  // pass undoes: batches were also being deleted from here, not just
  // read from here. Plain JS objects only, never mounted -- cheap to
  // keep in full for an entire session.
  const batchCacheRef = useRef(new Map());
  // Companion to batchCacheRef: the same batchIndex keys, mapped to
  // that batch's own {left, right} world-X bounds (see getBatchBounds).
  // Exists so retention/frontier bookkeeping (collectRetainedItems,
  // frontierRightXRef maintenance) never has to re-scan a batch's own
  // items to answer "does this batch's span intersect this window" or
  // "what is this batch's own right edge" -- both O(1) Map lookups
  // instead of an O(batch size) scan, computed once at generation
  // time. Also never pruned, for the same reason batchCacheRef isn't
  // -- see that ref's own comment.
  const batchBoundsRef = useRef(new Map());
  // Mirrors the CURRENT, bounded `galleryItems` state value -- kept in
  // sync at every one of the (now three) call sites that call
  // setGalleryItems, never via a separate effect, so it is exactly as
  // fresh as the state it mirrors with no extra render-cycle lag. Exists
  // so the main gesture/RAF effect below (Continuous-Effect Stability
  // pass) can read "what's currently mounted" without depending on
  // `galleryItems` itself, which is what lets that effect stop rebuilding
  // on every extension.
  const galleryItemsStateRef = useRef([]);
  // Metadata Query Wiring: which image pool the procedural generator
  // (buildGalleryItems/createGalleryBatch/pickImage, all untouched) should
  // draw from -- DEFAULT_IMAGE_POOL (the full library, byte-identical to
  // this file's pre-Search behavior) until Search and/or Filter produce a
  // non-empty match, at which point applyMetadataQuery below points this
  // at the Metadata Query Engine's matching Archive Items' own images
  // instead. Read imperatively by regenerateGallery and
  // extendGalleryIfNeeded, the same way columnStateRef/openingGeometryRef
  // already are, so neither needs this value threaded through as a
  // dependency -- this is also what keeps infinite scroll drawing from
  // whatever pool is currently active, combined query or not.
  // Handshake pass: starts from the live pool computed above (falls back
  // to DEFAULT_IMAGE_POOL internally if the live cache is empty) instead
  // of the static pool directly -- see DEFAULT_LIVE_IMAGE_POOL's own
  // comment. useRef's initial value is only consulted on mount, which is
  // fine here: by the time App() first renders, main.jsx's readiness gate
  // has already resolved, so getArchiveItems() is already warm.
  const activeImagePoolRef = useRef(DEFAULT_LIVE_IMAGE_POOL);
  // Hover Overlay metadata feature: a plain counter, bumped once per
  // regenerateGallery call below, and nowhere else. Not Archive generation
  // itself (buildGalleryItems/createGalleryBatch/createColumnState are
  // untouched) -- this is the same kind of cross-cutting, non-Archive-owned
  // App-level bookkeeping regenerateGallery already does for
  // movement.distance and animatedImagesRef. HoverOverlay uses it (passed
  // down as `generation`) purely as an input to a deterministic per-item
  // shuffle seed, so each item's randomized theme order stays stable
  // across re-renders, scrolling, and virtualization remounts, and only
  // changes when this counter changes -- i.e. only on a real regeneration.
  const galleryGenerationRef = useRef(0);
  // Guards against a burst of logo clicks queueing up multiple
  // regenerations -- set true as soon as a logo-triggered regeneration
  // begins (see handleLogoClick), cleared after the freshly regenerated
  // gallery has settled (GALLERY_REGENERATION_SETTLE_MS).
  const isRegeneratingFromLogoRef = useRef(false);
  // Site-wide fade transition system: a one-shot signal, set the instant
  // a Theme is clicked from HoverOverlay (see handleMetadataFilterCommit
  // below) and consumed by applyMetadataQuery the moment it actually
  // runs. This is what lets applyMetadataQuery -- the single place BOTH a
  // Theme metadata click and an ordinary Filter drawer selection
  // ultimately arrive (see handleFilterChange's own comment on why Theme
  // still routes through the same onFilterChange pipeline as a real
  // drawer click) -- tell the two apart and fade only the former. A ref,
  // not state: nothing needs to re-render off this value, it only needs
  // to still be true by the time applyMetadataQuery synchronously runs at
  // the end of the same effect flush pendingThemeFilterCommit triggers
  // (see Header.jsx's own consuming effect) -- there is no user-facing
  // gap in between where a different regeneration could interleave and
  // read a stale value. The Filter drawer's own selections never set
  // this, which is what keeps Filter itself immediate/un-faded, per the
  // explicit "Filter = control panel" requirement.
  const themeMetadataFadeRef = useRef(false);
  // Archive State Reset: Header owns several pieces of state that are
  // purely its own presentational echo of the archive's browsing state --
  // the Filter drawer's open/closed section and selected values, the
  // Search input's own committed-search echo (which decides whether the
  // input line or the collapsed chip renders) -- and none of it has an
  // existing external reset hook, since Header only ever reports changes
  // outward (onFilterChange/onSearchSubmit), it never accepts them from
  // outside. Header.jsx's own comment already documents that it "remounts
  // fresh on every route change" -- i.e. a full remount is already this
  // codebase's established way to guarantee Header starts from a clean
  // slate (the same idea Router.jsx relies on via key={slug} for
  // ProjectTemplate). A plain logo click causes no route change, so
  // resetArchiveState (below) forces that same clean-slate remount
  // in-place by changing Header's key -- Header itself needs no new
  // conditional logic to support this; unmounting/remounting it is
  // sufficient on its own.
  const [headerResetKey, setHeaderResetKey] = useState(0);
  const [galleryItems, setGalleryItems] = useState([]);
  // Continuous-Effect Stability pass: increments only on a genuine full
  // regeneration (mount, resize, logo click -- see regenerateGallery),
  // never on an ordinary extension or retention-window update. The main
  // gesture/RAF effect below depends on this instead of on `galleryItems`
  // itself, which is what stops it tearing down and rebuilding its
  // listeners/RAF loop on every extension while still rebuilding exactly
  // when it always needed to (a real regeneration invalidates trackRef's
  // geometry, camera-neutral state, etc.).
  const [gallerySessionId, setGallerySessionId] = useState(0);
  const [renderWindow, setRenderWindow] = useState(() =>
    getGalleryRenderWindow(),
  );
  const [openingGeometry, setOpeningGeometry] = useState(() =>
    getViewportOpeningGeometry({
      isMobileUiMode,
      headerHeightPx: headerHeightRef.current,
      zoomControlsHeightPx: zoomControlsHeightRef.current,
    }),
  );
  const [focusedId, setFocusedId] = useState(null);
  const [focusedImage, setFocusedImage] = useState(null);
  const [isIndexDrawerOpen, setIsIndexDrawerOpen] = useState(false);
  // Filter Query State: the single source of truth for Filter's half of
  // the combined Metadata Query, shaped to match queryArchive's query
  // object exactly (theme/project/year, every field an array). Header
  // owns the Filter UI and reports every selection change here via
  // onFilterChange (now handleFilterChange, below, which is what actually
  // combines this with committedSearch and runs the query -- see
  // applyMetadataQuery).
  const [activeFilterQuery, setActiveFilterQuery] = useState(
    EMPTY_FILTER_QUERY,
  );
  // Filter UX refinement (Metadata Filter Sync): NOT a second copy of
  // filter state -- Header's own `selection` remains the only place
  // Theme/Project/Year selections are held for display, and
  // activeFilterQuery above remains the only place the actual query
  // criteria live. This is a one-shot, directional request: "please
  // toggle this Theme value into your own selection," sent to Header
  // every time a Theme is clicked from HoverOverlay (see
  // handleMetadataFilterCommit below) -- an earlier pass only sent this
  // once Filter mode was already active, which is exactly what produced
  // an inconsistent first click vs. every click after it; every Theme
  // click now takes this same path regardless of what was active
  // beforehand. A fresh {value} object every time, never read back or
  // compared by content here -- Header consumes it once, through the
  // exact same handleOptionToggle path a real drawer click already
  // uses, and reports the result back via the existing onFilterChange
  // pipeline. See Header.jsx's own comment at the effect that consumes
  // this for the full reasoning.
  const [pendingThemeFilterCommit, setPendingThemeFilterCommit] =
    useState(null);
  // Metadata Query Wiring: Gallery's own copy of the committed search
  // string. Header still owns the Search UI and its own internal
  // committedSearch (what actually renders the chip) -- this is purely so
  // a Filter-only change (handleFilterChange below) can rebuild the full
  // {search, theme, project, year} query without Search having to
  // change at the same moment. null means "no active search," exactly the
  // value queryArchive's own matchesSearch already treats as "no
  // constraint" (see metadataQueryEngine.js) -- so this needs no special
  // casing anywhere below.
  const [committedSearch, setCommittedSearch] = useState(null);

  // Project Filter Composition (client-requested): true whenever Project
  // is part of the active Filter query, regardless of whether Type/Theme/
  // Year are also selected alongside it -- the one condition the client's
  // brief cares about ("ONLY when...filtered by Project," explicitly NOT
  // for Type/Theme/Year/no-filter). Deliberately derived straight from
  // activeFilterQuery -- the same state applyMetadataQuery already reads
  // -- rather than a new piece of state of its own, so there is exactly
  // one place "is Project selected" can ever disagree with itself.
  const isProjectFilterActive = activeFilterQuery.project.length > 0;
  // Mirrors isProjectFilterActive into a ref for the wheel/touch effect
  // below (see its own comment) to read without needing to be in that
  // effect's dependency array -- that effect's cleanup/re-subscribe cost
  // (removing and re-adding three window-level listeners) is keyed on
  // [galleryItems] today and this deliberately doesn't add a second reason
  // for it to re-run.
  const isProjectFilterActiveRef = useRef(isProjectFilterActive);
  useEffect(() => {
    isProjectFilterActiveRef.current = isProjectFilterActive;
  }, [isProjectFilterActive]);
  // Mobile Archive Interaction Pass -- Stage 0 (Overlay Gesture Guard):
  // isOverlayActive means "Menu is open OR the mobile Search/discovery
  // overlay is open" -- see Header.jsx's own onOverlayActiveChange effect,
  // the one place this state is ever set. Deliberately NOT the desktop
  // Filter drawer (that already has its own, separate accommodation via
  // viewportDrawerScaleRef/updateGalleryMotion -- shrinking the
  // composition to make room rather than needing gestures suppressed
  // underneath it) and deliberately a NEW callback rather than reusing the
  // existing onFilterOpenChange/isIndexDrawerOpen pair, since the
  // investigation found that pair does not reliably fire on every
  // Menu-open path (only when Filter itself was already open and Menu took
  // over) -- reusing it here would have inherited that same gap for a
  // guard that specifically must not have gaps. Mirrored into a ref for the
  // gesture effect below for the same reason isProjectFilterActiveRef is:
  // that effect's identity must not change just because an overlay opened
  // or closed.
  const [isOverlayActive, setIsOverlayActive] = useState(false);
  const isOverlayActiveRef = useRef(isOverlayActive);
  useEffect(() => {
    isOverlayActiveRef.current = isOverlayActive;
  }, [isOverlayActive]);
  // Mobile Archive Interaction Pass -- Stage 5 (Touch-Native Image
  // Inspection): which single gallery tile (if any) is currently showing
  // its HoverOverlay metadata card in response to a genuine tap, on a
  // TOUCH CAPABILITY device -- see isTouchDevice below, the signal this
  // feature is gated on (NOT isMobileUiMode: a touch laptop in a wide
  // viewport should still get tap inspection, and mobile UI mode itself
  // says nothing about whether a pointer can hover, per the canonical
  // signal split this pass establishes throughout). Deliberately a new,
  // purpose-built id -- not a reuse of the dead hoveredGalleryItemId
  // (mouse-only, see its own comment below) or the disabled
  // focusedId/imageFocusEnabled zoom system (a different, unrelated
  // feature that happens to also be gated per-tile) -- because neither
  // already means "this tile's metadata card is being read," and forcing
  // either to also mean that would be exactly the kind of signal-conflation
  // this pass's canonical-signals section warns against.
  //
  // Only one tile is ever inspected at a time (a single id, not a Set):
  // tapping a second tile is a dismiss-the-first/inspect-the-second action
  // (see handleGalleryTileTap below), not a multi-card browsing mode.
  // Mirrored into a ref for the gesture effect below (pan-start/pinch-start
  // dismissal, and background-tap dismissal inside handleTouchEnd) for the
  // same reason isProjectFilterActiveRef/isOverlayActiveRef already are:
  // that effect's own identity must not change just because a tile was
  // tapped.
  const [inspectedItemId, setInspectedItemId] = useState(null);
  const inspectedItemIdRef = useRef(inspectedItemId);
  useEffect(() => {
    inspectedItemIdRef.current = inspectedItemId;
  }, [inspectedItemId]);
  // Mobile Archive Interaction Pass -- Stage 5: opening either overlay
  // (Menu or the mobile Search/discovery overlay -- the same OR
  // isOverlayActive above already tracks) dismisses any open inspection
  // card, so a visitor never returns from Search/Menu to find a stale card
  // still up over an image they can no longer see clearly.
  useEffect(() => {
    if (isOverlayActive) setInspectedItemId(null);
  }, [isOverlayActive]);
  // The Project-filtered row's own image set: queryArchive is a pure,
  // side-effect-free function (see metadataQueryEngine.js's own contract
  // comment) run here a second time against the exact same combined query
  // applyMetadataQuery already runs internally -- not a new matching rule,
  // just reading the same result independently so this row can render
  // without applyMetadataQuery needing to know this composition exists.
  // Results arrive in getArchiveItems()'s own order (queryArchive never
  // reorders), i.e. this Project's own CMS-authored sortOrder -- the same
  // "preserve source order, never hand-pick" rule JournalPage.jsx's own
  // buildJustifiedRows follows for the exact same reason.
  const projectFilterItems = useMemo(
    () =>
      isProjectFilterActive
        ? queryArchive(
            { search: committedSearch, ...activeFilterQuery },
            getArchiveItems(),
          )
        : EMPTY_ARRAY,
    [isProjectFilterActive, committedSearch, activeFilterQuery],
  );
  // Drives a brief opacity dip on the gallery track during a logo-triggered
  // regeneration (see handleLogoClick below and the matching .is-regenerating
  // rule in styles.css) -- mount and resize are untouched and stay instant.
  const [isGalleryTransitioning, setIsGalleryTransitioning] = useState(false);
  // Site-wide fade transition system: entering a Project from the archive
  // (clicking a project-linked gallery tile) changes the interface -- the
  // gallery goes away entirely and Router.jsx swaps in ProjectTemplate, a
  // completely different mounted component -- so this needs the same kind
  // of "fade, then swap" treatment Header.jsx already uses for its own
  // page-transition-veil (Logo/Menu clicks, and the Filter/Search
  // return-to-homepage trip), rather than the in-place opacity dip
  // isGalleryTransitioning drives above (that mechanism fades the gallery
  // TRACK while staying mounted on this same page -- it has nothing to do
  // with leaving the page entirely). Deliberately a small local veil
  // scoped to this component, not a shared cross-component mechanism --
  // reuses the exact same .page-transition-veil CSS class and
  // GALLERY_FADE_MS/var(--reveal-ease) timing Header.jsx and this file
  // already establish, so it reads as the same motion vocabulary, but
  // keeps its own state here rather than threading a ref/imperative
  // handle across the App/Header boundary for one interaction. See the
  // isProjectLinked click handler and the veil's own render below.
  const [isEnteringProject, setIsEnteringProject] = useState(false);
  const enterProjectTimeoutRef = useRef(null);

  useEffect(() => {
    return () => {
      if (enterProjectTimeoutRef.current) {
        clearTimeout(enterProjectTimeoutRef.current);
      }
    };
  }, []);

  // Project Filter Composition: ProjectFilterRow's own click-to-enter,
  // reusing the exact same fade-then-navigate mechanism the normal
  // archive's project-linked tiles already use immediately below in this
  // file (isEnteringProject/enterProjectTimeoutRef/GALLERY_FADE_MS/
  // navigate) -- not a second, competing "enter a project" behavior, just
  // that same one extracted so this isolated row can call it too.
  const handleProjectRowImageClick = useCallback(
    (item) => {
      if (!item.project || isEnteringProject) return;
      setIsEnteringProject(true);
      enterProjectTimeoutRef.current = window.setTimeout(() => {
        navigate(`/projects/${item.project}?image=${item.archiveNumber}`);
      }, GALLERY_FADE_MS);
    },
    [isEnteringProject],
  );
  // Relationship Highlight Pipeline (Commit 3): Gallery (this component) is
  // the single owner of relatedArchiveNumbers, the shared state that drives
  // highlighting below. hoveredGalleryItemId tracks which
  // .gallery-image-wrapper is currently under the pointer, set by plain
  // onMouseEnter/onMouseLeave below; relatedArchiveNumbers is populated by
  // HoverOverlay's own onRelatedArchiveNumbersChange callback (see the call
  // site below), fired only by that component's per-theme hover
  // handlers, and resets to [] the moment a theme hover ends. Neither
  // the Relationship Engine nor HoverOverlay hold this state -- this is
  // purely where it's lifted to.
  //
  // State-management correction (bug fix, post-metadata-hover-rename):
  // hoveredGalleryItemId no longer has any bearing on isDimmed below --
  // relatedArchiveNumbers being non-empty is necessary but, since the
  // Relationship Mode Visibility Gate below, no longer sufficient on its
  // own to activate Relationship Mode (see isRelationshipModeActive further
  // down). hoveredGalleryItemId is kept here, still set on plain image
  // hover, because nothing about image-level hover tracking was broken; it
  // simply isn't a dimming input. The overlay's own visibility remains
  // pure CSS (:hover in styles.css) and was never driven by this state.
  const [hoveredGalleryItemId, setHoveredGalleryItemId] = useState(null);
  const [relatedArchiveNumbers, setRelatedArchiveNumbers] = useState([]);
  // Mobile Baseline Pass -- Task 2: desktop = enabled, mobile/touch =
  // disabled -- see useIsTouchDevice's own comment above for why this
  // reads pointer/hover capability rather than viewport width. Passed to
  // HoverOverlay below (gates the query at its source, in
  // handleThemeHoverStart, so it never runs at all on a touch device) and
  // ANDed into isRelationshipModeActive further down (defense-in-depth --
  // ensures no dimming visual state can ever be left hanging on mobile
  // even if relatedArchiveNumbers were somehow already non-empty, e.g.
  // from a value set just before a hover/pointer-type change).
  const isTouchDevice = useIsTouchDevice();
  const isRelationshipEngineEnabled = !isTouchDevice;
  // Browsing/Exploration mode (interaction-layer only -- see
  // SCROLL_IDLE_DELAY_MS near the top of this file and where this is set,
  // inside the existing animateGallery loop below). True while the gallery
  // is actively moving (real velocity, not just a raw wheel/touch event --
  // this stays true through an inertial glide, not only while the input is
  // physically occurring), false once it's been idle for that delay. Drives
  // one class on .gallery-track (see the render below) that styles.css uses
  // to suspend hover metadata and the Relationship Engine while true --
  // nothing about gallery motion itself reads or is affected by this.
  const [isScrolling, setIsScrolling] = useState(false);
  // Search Query Wiring: true only while a committed search matches zero
  // Archive Items. Doesn't hold the query string itself or the matched
  // items -- Header owns the query string (for the chip's own label) and
  // nothing downstream of this needs the matched items again once
  // activeImagePoolRef has already been built from them. Purely what
  // decides whether the gallery area renders the placeholder message
  // instead of the procedurally generated track (see the render below).
  const [hasNoSearchResults, setHasNoSearchResults] = useState(false);

  // Relationship Highlight Pipeline (Commit 3): the only two handlers this
  // pipeline needs. They just record which item is hovered -- no matching,
  // no rendering decisions, no CSS, and (as of the state-management
  // correction above) no effect on Relationship Mode/dimming either.
  // setRelatedArchiveNumbers itself is passed straight through to
  // HoverOverlay as onRelatedArchiveNumbersChange below; it's already a
  // stable setState function, so no extra useCallback wrapper is needed for
  // it.
  const handleGalleryImageHoverStart = useCallback((itemId) => {
    setHoveredGalleryItemId(itemId);
  }, []);
  const handleGalleryImageHoverEnd = useCallback(() => {
    setHoveredGalleryItemId(null);
  }, []);

  // Relationship Transition Refinement pass: the actual cause of the
  // reported "rollover flash" between two Theme links. HoverOverlay's own
  // handleMetadataHoverEnd (untouched) reports [] the instant ANY theme's
  // mouseleave fires -- including when the cursor is already on its way to
  // a different, adjacent theme (the same card's next li, or a nearby
  // tile's own theme list). Previously that meant: leave fires -> [] ->
  // every dimmed tile undims (the fast deactivation transition) -> the new
  // theme's own fresh 325ms dwell has to elapse in full before anything
  // re-dims. That's a real, visible dim -> undim -> (325ms pause at full
  // brightness) -> dim-again cycle, not a subtle abruptness issue -- this
  // is the state-handoff bug the brief asked to find rather than paper
  // over with a longer fade.
  //
  // Fix: bridge the clear, not the activation. A [] report is held for
  // RELATIONSHIP_CLEAR_BRIDGE_MS before it actually commits. Two things
  // can cancel that hold before it fires: a NEW theme's dwell actually
  // committing (a non-empty report -- the field jumps straight from the
  // old pattern to the new one, never touching a cleared/undimmed state
  // in between), or -- the piece that makes the bridge actually work in
  // practice -- a NEW theme's hover intent simply BEGINNING
  // (handleThemeHoverIntentStart below). A commit alone can't be the only
  // cancel signal: it's gated behind that theme's own full, unmodified
  // 325ms dwell, far longer than any bridge window that would still let a
  // genuine leave feel immediate. Hover-start is cheap and instantaneous,
  // and is exactly the signal that distinguishes "the cursor is already
  // resting on a new theme, something is pending" from "the cursor left
  // and nothing followed" -- so the bridge only needs to survive the
  // brief travel gap between two hover targets, not the dwell itself.
  // Canceling on hover-start doesn't set anything -- it just suppresses
  // the pending clear, so the display keeps showing whatever was already
  // active until that new theme's own dwell resolves one way or another
  // (a real result, replacing it directly; or nothing, if the visitor
  // leaves again before it commits -- which simply restarts this same
  // bridge from the new leave).
  //
  // Deliberately does NOT gate the hard-clear paths below (motion
  // beginning, a metadata commit, an archive reset) -- those always call
  // clearRelatedArchiveNumbersImmediately() directly, bypassing this
  // bridge entirely, so nothing here can make motion-safety or a commit
  // boundary any less instant than before this pass.
  const relationshipClearTimeoutRef = useRef(null);
  // RELATIONSHIP_CLEAR_BRIDGE_MS: only needs to comfortably cover ordinary
  // cursor travel time to a new theme (an adjacent li in the same
  // HoverOverlay card, or a nearby tile's own theme list) given the
  // hover-start cancel above -- not the 325ms dwell itself. Tested against
  // real (non-instant) Playwright pointer travel between two theme
  // elements; still short enough that a genuine, deliberate leave (no new
  // hover follows) doesn't read as a delayed release.
  const RELATIONSHIP_CLEAR_BRIDGE_MS = 140;
  const clearRelatedArchiveNumbersImmediately = useCallback(() => {
    if (relationshipClearTimeoutRef.current !== null) {
      clearTimeout(relationshipClearTimeoutRef.current);
      relationshipClearTimeoutRef.current = null;
    }
    setRelatedArchiveNumbers([]);
  }, []);
  const handleThemeHoverIntentStart = useCallback(() => {
    if (relationshipClearTimeoutRef.current !== null) {
      clearTimeout(relationshipClearTimeoutRef.current);
      relationshipClearTimeoutRef.current = null;
    }
  }, []);
  const handleRelatedArchiveNumbersChange = useCallback((received) => {
    if (received.length > 0) {
      if (relationshipClearTimeoutRef.current !== null) {
        clearTimeout(relationshipClearTimeoutRef.current);
        relationshipClearTimeoutRef.current = null;
      }
      setRelatedArchiveNumbers(received);
      return;
    }
    // Already a clear pending (e.g. a fast fly-by across several themes
    // with none of them committing) -- let the existing timer run rather
    // than restarting the hold on every additional [] report.
    if (relationshipClearTimeoutRef.current !== null) return;
    relationshipClearTimeoutRef.current = setTimeout(() => {
      relationshipClearTimeoutRef.current = null;
      setRelatedArchiveNumbers([]);
    }, RELATIONSHIP_CLEAR_BRIDGE_MS);
  }, []);
  useEffect(
    () => () => {
      if (relationshipClearTimeoutRef.current !== null) {
        clearTimeout(relationshipClearTimeoutRef.current);
      }
    },
    [],
  );

  // Relationship Hover Intent pass: the one check HoverOverlay's own dwell
  // timer needs at the moment its dwell period completes, to decide
  // whether the context that started it is still valid -- "if cursor is
  // still intentionally there AND Archive is settled," per this pass's
  // own brief. Reuses the exact three refs already gating desktop
  // wheel/touch input (isScrollingRef -- the same signal the entrance
  // system already reads as isArchiveInMotionRef, real pan velocity OR an
  // unsettled zoom; isProjectFilterActiveRef; isOverlayActiveRef, mobile
  // Menu/Search) rather than introducing any new state -- a stable
  // useCallback with an empty dependency array (all three are refs, never
  // props/state) so passing it down never causes HoverOverlay to re-render
  // for an unrelated reason. Motion beginning AFTER a dwell timer has
  // already started (not just before it starts) is exactly the case this
  // exists for: CSS already keeps a NEW hover from starting once
  // .is-scrolling is set (see the .hover-overlay__themes li pointer-events
  // rule in styles.css), but an already-pending timer needs this explicit
  // re-check at fire time, since nothing else would stop it.
  const isRelationshipActivationBlocked = useCallback(
    () =>
      isScrollingRef.current ||
      // High-End Motion/Transition Polish pass: also blocked through the
      // short post-motion settle beat (see FIELD_SETTLE_GRACE_MS/
      // isFieldSettledRef's own comments) -- a dwell timer that happens to
      // complete in the narrow window right after the camera stops but
      // before the field has finished settling is still deferred, exactly
      // like one that completes while the camera is still genuinely
      // moving. isFieldSettledRef starts false and only flips true once
      // isScrollingRef has already been false for FIELD_SETTLE_GRACE_MS,
      // so this check alone (with isScrollingRef above) fully covers both
      // phases without a third explicit condition.
      !isFieldSettledRef.current ||
      isProjectFilterActiveRef.current ||
      isOverlayActiveRef.current,
    [],
  );

  // Final Mobile Interaction Model pass (consistency cleanup): ONE rule
  // now governs every Project-linked tile, regardless of tier --
  // "tap once to reveal the project information; tap the selected image
  // again to open the project." Earlier passes had contradictory,
  // tier-dependent paths here (a Thumbnail-only whole-tile shortcut, a
  // text-only-navigation requirement for Medium/Large, a live
  // DOM-measurement gate deciding whether View Project could render at
  // all) -- all of that is retired. What remains:
  //
  //   - First tap on a Project-linked tile (any tier) opens the SAME
  //     inspected state every tile gets: HoverOverlay renders Archive
  //     Number, then attempts View Project below it (see
  //     HoverOverlay.jsx's own render -- no tier gate there any more
  //     either; that component's own small measurement effect decides
  //     whether View Project actually fits and shows, not this handler).
  //   - A second tap ANYWHERE on that same already-inspected tile
  //     navigates to its Project -- isProjectLinked && wasInspected,
  //     below, with no isThumbnailTier condition. Tapping the "View
  //     Project" control itself still navigates directly too (its own
  //     stopPropagation'd onClick in HoverOverlay.jsx), so either a
  //     precise tap on the control or an imprecise tap anywhere else on
  //     the tile gets the visitor into the Project the same way.
  //   - A tap on a DIFFERENT tile (Project-linked or not) always just
  //     opens/moves inspection -- never navigates on that first tap.
  //
  // Non-Project tiles are unaffected by any of this: they can never
  // reach the navigate branch (isProjectLinked is false), and a
  // Thumbnail-tier non-Project tile keeps its pre-existing behavior of
  // never becoming a selection surface at all -- see
  // MOBILE_SELECTABLE_TILE_MIN_WIDTH_PX/_HEIGHT_PX's own declaration
  // comment above for why that floor still exists for that one case.
  const handleGalleryTileTap = useCallback(
    (item) => {
      const width = Number.parseFloat(item.layout.width);
      const height = Number.parseFloat(item.layout.height);
      const isProjectLinked = Boolean(item.project);
      const isThumbnailTier =
        width < MOBILE_SELECTABLE_TILE_MIN_WIDTH_PX ||
        height < MOBILE_SELECTABLE_TILE_MIN_HEIGHT_PX;
      // Final Mobile Interaction Model pass: onEnterProject/View Project
      // eligibility is simply isProjectLinked now -- tier plays no part,
      // there is no separate affordance per tier, and there is no live
      // fit-measurement system deciding this at render time any more
      // (see HoverOverlay.jsx's own render). lastTappedIsThumbnailTier
      // above still records the tier for the one thing it still affects:
      // HoverOverlay's reduced thumbnail-inspected padding, plus whether
      // a non-Project tile is a selection surface at all (the branch
      // just below).
      if (isThumbnailTier && !isProjectLinked) {
        setInspectedItemId(null);
        return;
      }
      const wasInspected = inspectedItemIdRef.current === item.id;
      // Final Mobile Interaction Model pass: the second-tap-anywhere-
      // navigates rule, now uniform across every tier -- see this
      // function's own top comment for the full reasoning. Only ever
      // fires on the SECOND tap of an already-inspected, Project-linked
      // tile (any tier); the first tap on any tile always falls through
      // to the plain inspect/toggle logic below.
      if (isProjectLinked && wasInspected) {
        handleProjectRowImageClick(item);
        return;
      }
      // Mobile Header/Search/Menu Refinement Pass -- Section 6 (Haptics): a
      // genuine inspection tap gets a single, subtle tick -- but only on the
      // tap that OPENS the card, never the second tap that dismisses it (a
      // plain toggle back to nothing shouldn't buzz). inspectedItemIdRef is
      // read here, before the state update is scheduled, rather than inside
      // the setInspectedItemId updater itself -- keeping the updater a pure
      // function of its previous state, with the one-time side effect
      // decided from the ref snapshot of what's committed right now.
      const isOpening = !wasInspected;
      setInspectedItemId((current) => (current === item.id ? null : item.id));
      if (isOpening) hapticTap();
    },
    [handleProjectRowImageClick],
  );

  // Shared regeneration sequence -- used on mount, on window resize, and
  // (see handleLogoClick below) when the logo is clicked on the homepage.
  // REFACTORED (extension-pipeline fix): buildGalleryItems no longer
  // mutates a columnState object in place -- it returns the final one
  // alongside the items, and that's what columnStateRef gets set to. This
  // call site is outside any React updater (setGalleryItems is passed a
  // plain value here, not a function), so it was never part of the bug --
  // this is purely the pure-function-based rebuild the pipeline was
  // refactored to support.
  const regenerateGallery = useCallback(() => {
    galleryMovementRef.current.distance = 0;
    galleryMovementRef.current.distanceY = 0;
    resetCameraToNeutral();
    galleryGenerationRef.current += 1;
    const nextOpeningGeometry = getViewportOpeningGeometry({
      isMobileUiMode: isMobileUiModeRef.current,
      headerHeightPx: headerHeightRef.current,
      zoomControlsHeightPx: zoomControlsHeightRef.current,
    });
    openingGeometryRef.current = nextOpeningGeometry;
    setOpeningGeometry(nextOpeningGeometry);
    renderWindowRef.current = getGalleryRenderWindow(0);
    setRenderWindow(renderWindowRef.current);
    animatedImagesRef.current.clear();

    let items;
    let nextColumnState;

    if (useCenteredInitialComposition) {
      const seedColumnState = createColumnState();
      const centerSeed = createCenterSeedBatch(
        -1,
        seedColumnState,
        nextOpeningGeometry.height,
        activeImagePoolRef.current,
      );
      const seamGapPx = (SEAM_GAP_PCT / 100) * nextOpeningGeometry.height;

      const leftwardResult = createLeftwardGalleryBatch(
        -2,
        {
          cursorX: centerSeed.columnLeft - seamGapPx,
          lastPatternIndex: centerSeed.nextColumnState.lastPatternIndex,
          pickerState: centerSeed.nextColumnState.pickerState,
          moduleIndex: centerSeed.nextColumnState.moduleIndex,
          // Curated Large-Tile Variety: seeded from the center seed's own
          // large tiles (spatially adjacent to where this pass starts),
          // not from any other direction's list -- pickerState above
          // chains center -> leftward -> rightward for bag continuity,
          // but large-tile avoidance is spatial, not sequential, so both
          // leftward and rightward each start fresh from the one column
          // that's actually next to them.
          nearbyLargeTiles: centerSeed.nextColumnState.nearbyLargeTiles,
        },
        nextOpeningGeometry.height,
        activeImagePoolRef.current,
      );

      const rightwardResult = buildGalleryItems(
        {
          cursorX: centerSeed.columnLeft + centerSeed.columnWidthPx + seamGapPx,
          lastPatternIndex: leftwardResult.nextColumnState.lastPatternIndex,
          pickerState: leftwardResult.nextColumnState.pickerState,
          moduleIndex: leftwardResult.nextColumnState.moduleIndex,
          // Curated Large-Tile Variety: seeded from the center seed's own
          // large tiles too (spatially adjacent on this side), not from
          // leftwardResult's -- see the identical comment just above.
          nearbyLargeTiles: centerSeed.nextColumnState.nearbyLargeTiles,
        },
        initialGalleryBatches,
        nextOpeningGeometry.height,
        activeImagePoolRef.current,
      );

      items = [
        ...leftwardResult.items,
        ...centerSeed.items,
        ...rightwardResult.items,
      ];
      nextColumnState = rightwardResult.nextColumnState;
    } else {
      const built = buildGalleryItems(
        createColumnState(),
        initialGalleryBatches,
        nextOpeningGeometry.height,
        activeImagePoolRef.current,
      );
      items = built.items;
      nextColumnState = built.nextColumnState;
    }

    columnStateRef.current = nextColumnState;

    // Bounded Runtime Field pass (Round G refinement): build the bounded
    // batch cache fresh from this one-time initial `items` array --
    // O(initial item count), paid once per genuine regeneration (mount,
    // resize, logo click), never per extension. Grouped by batchIndex
    // (buildGalleryItems always produces a small, fixed number of
    // initial batches -- see initialGalleryBatches -- plus the two fixed
    // leftward/center-seed batches, so this loop is cheap and bounded
    // regardless of session length) rather than retaining `items` itself
    // as one flat unbounded array.
    const initialBatches = new Map();
    for (const item of items) {
      const batchItems = initialBatches.get(item.batchIndex) ?? [];
      batchItems.push(item);
      initialBatches.set(item.batchIndex, batchItems);
    }
    const nextBatchCache = new Map();
    const nextBatchBounds = new Map();
    let highestBatchIndex = -1;
    let frontierRightX = 0;
    for (const [batchIndex, batchItems] of initialBatches) {
      nextBatchCache.set(batchIndex, batchItems);
      const bounds = getBatchBounds(batchItems);
      nextBatchBounds.set(batchIndex, bounds);
      highestBatchIndex = Math.max(highestBatchIndex, batchIndex);
      frontierRightX = Math.max(frontierRightX, bounds.right);
    }
    batchCacheRef.current = nextBatchCache;
    batchBoundsRef.current = nextBatchBounds;
    highestGeneratedBatchIndexRef.current = highestBatchIndex;
    frontierRightXRef.current = frontierRightX;

    galleryItemsStateRef.current = items;
    setGalleryItems(items);
    setGallerySessionId((current) => current + 1);
  }, []);

  useEffect(() => {
    regenerateGallery();
    window.addEventListener("resize", regenerateGallery);

    return () => {
      window.removeEventListener("resize", regenerateGallery);
    };
  }, [regenerateGallery]);

  // Production diagnostic helper (Archive stability pass follow-up):
  // window.__urbanumDebug() is a manually-invoked, read-only snapshot of
  // Archive runtime health for use in a live Chrome session. It performs
  // NO polling, NO interval, NO new RAF work, and NO network/telemetry --
  // it only reads refs/state/DOM that already exist and are already kept
  // fresh elsewhere in this component (galleryItemsStateRef is synced on
  // every commit and by the retention/extension logic; wrapperRegistryRef
  // and batchCacheRef are the same persistent Maps described by their own
  // comments above; focusedIdRef/isProjectFilterActiveRef are already
  // mirrored refs used elsewhere for the same stale-closure-avoidance
  // reason). Calling it does not alter Archive behavior in any way; it is
  // attached/detached alongside this component's own mount lifecycle so it
  // never outlives a real App instance.
  useEffect(() => {
    window.__urbanumDebug = () => {
      const track = trackRef.current;
      const wrapperCount = document.querySelectorAll(".gallery-image-wrapper").length;
      const renderedImageCount = document.querySelectorAll(".gallery-image-wrapper img").length;
      const trackTransform = track ? getComputedStyle(track).transform : null;
      const trackWidth = track ? track.style.width : null;
      const distance = galleryMovementRef.current.distance;

      let cameraX = null;
      let cameraY = null;
      let cameraScale = null;
      if (trackTransform && trackTransform.startsWith("matrix(")) {
        const parts = trackTransform
          .slice("matrix(".length, -1)
          .split(",")
          .map((n) => parseFloat(n.trim()));
        if (parts.length === 6) {
          cameraScale = parts[0];
          cameraX = parts[4];
          cameraY = parts[5];
        }
      }

      const isFiniteNumber = (n) => typeof n === "number" && Number.isFinite(n);

      const report = {
        timestamp: new Date().toISOString(),
        galleryItemsCount: galleryItemsStateRef.current.length,
        mountedWrapperCount: wrapperCount,
        renderedImageCount,
        historicalBatchCount: batchCacheRef.current.size,
        highestGeneratedBatchIndex: highestGeneratedBatchIndexRef.current,
        cameraDistance: distance,
        cameraX,
        cameraY,
        cameraScale,
        galleryTrackExists: !!track,
        galleryTrackTransform: trackTransform,
        galleryTrackWidth: trackWidth,
        documentVisibilityState: document.visibilityState,
        focusedId: focusedIdRef.current,
        isProjectFilterActive: isProjectFilterActiveRef.current,
        valid: {
          distanceIsFinite: isFiniteNumber(distance),
          cameraXIsFinite: cameraX === null || isFiniteNumber(cameraX),
          cameraYIsFinite: cameraY === null || isFiniteNumber(cameraY),
          cameraScaleIsFinite: cameraScale === null || isFiniteNumber(cameraScale),
        },
      };

      // Intentional, manual-only diagnostic output -- never called
      // automatically, so this is not console spam.
      // eslint-disable-next-line no-console
      console.log("[urbanum-debug]", report);
      return report;
    };

    return () => {
      delete window.__urbanumDebug;
    };
  }, []);

  // Mobile Archive Interaction Pass -- Stage 1B (Bottom Control Clearance):
  // measures .zoom-controls' own real rendered height (see zoomControlsRef
  // in the JSX below) into zoomControlsHeightRef, the same ResizeObserver-
  // on-a-DOM-node pattern Header.jsx already uses for the Filter drawer
  // (and now the header itself, see handleHeaderHeightChange above) --
  // mount-only ([] deps), since .zoom-controls' own node identity never
  // changes for the life of this component. Read by
  // getViewportOpeningGeometry's isMobileUiMode branch only; desktop/
  // tablet's clearance formula never reads this ref.
  useEffect(() => {
    const node = zoomControlsRef.current;
    if (!node || typeof ResizeObserver === "undefined") return undefined;

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const height = entry.contentRect.height;
      if (height > 0) zoomControlsHeightRef.current = height;
    });

    observer.observe(node);

    return () => observer.disconnect();
  }, []);

  const getImageWrapper = useCallback((imageId) => {
    return trackRef.current?.querySelector(`[data-image-id="${imageId}"]`);
  }, []);

  // Camera Feel pass: the anchor-preserving pan math, extracted verbatim
  // from what used to be handleZoomStep's own body (Phase 3A) so it can be
  // called from two places that need the identical guarantee: the
  // per-frame zoom-ease step below (oldScale/newScale one small step
  // apart, called every frame while easing) and mobile pinch's own instant
  // path (oldScale/newScale a full gesture-frame apart, called once per
  // touchmove). Both need "whatever world point currently projects to
  // anchorClientX must still project to anchorClientX after this specific
  // scale change" -- the closed-form solution is k*(1 - r) + oldPan*r,
  // where k = anchor-offset-from-viewport-center and r = newScale /
  // oldScale, derived directly from projectWorldToScreenX, solved for the
  // new pan term with distance held fixed (Navigator's `distance` is
  // never read or written here). At k = 0 (buttons, or a wheel/pinch
  // dead-center) this reduces to oldPan*r -- 0 stays 0, matching
  // center-anchored behavior exactly. Because this is an exact algebraic
  // solve rather than an iterative approximation, and because it is
  // reapplied every single frame scale actually changes (not just once at
  // gesture start), zooming in and back out over the same anchor -- even
  // across an animated, multi-frame ease -- returns the pan ref to its
  // exact prior value, and the anchor never drifts while the ease is
  // catching up.
  //
  // True 2D Cursor Zoom pass: anchorClientY / viewportPanYRef is the exact
  // same closed-form solve, on the Y axis, added alongside the X solve
  // above (not a second wrapper transform -- see viewportPanYRef's own
  // comment for where this gets applied). The X solve holds `distance`
  // (Navigator's own horizontal world position) fixed while solving; the Y
  // solve equivalently holds the opening-centered scale compensation
  // (getVerticalScaleCompensation) fixed and solves only for the
  // additional pan term on top of it -- same algebra, different fixed
  // baseline, because Y has no `distance`-equivalent to hold fixed against.
  //
  // Unlike X, Y did not previously have ANY bound -- Navigator's own world
  // bounds (guaranteedWorldReach, untouched by this pass) are what keeps X
  // recoverable; nothing analogous exists for Y, because Y never needed
  // it before this pass. Deriving one here, from the same geometry
  // getVerticalScaleCompensation itself already assumes: the track's own
  // natural (scale = 1) height equals openingHeight (DAPC's own vertical-
  // composition contract -- confirmed directly: measured track height /
  // measured scale === measured opening height, exactly, at every scale
  // checked). At effective scale s the track therefore overflows the
  // opening by openingHeight * (s - 1) total, split evenly above/below by
  // the existing scale-only compensation before this pan term is even
  // added. Half that overflow is exactly how far the pan correction could
  // shift the composition before ONE edge would touch the opening's own
  // boundary and start exposing blank space past it;
  // CAMERA_VERTICAL_ANCHOR_REACH keeps a fraction of that in reserve so the
  // opposite edge never fully reaches the boundary either. At or below
  // neutral scale the track no longer overflows the opening at all, so the
  // bound collapses to exactly 0 -- Y pan is fully suppressed whenever
  // zoomed out enough that any shift would immediately show blank space,
  // and (because this function re-derives the bound from THIS frame's own
  // scale every time it runs, exactly like the anchor math itself) shrinks
  // smoothly toward 0 as a zoom-out ease approaches that point, with no
  // separate "snap back" step needed.
  const applyZoomAnchor = useCallback(
    (oldScale, newScale, anchorClientX, anchorClientY) => {
      if (oldScale === newScale) return;
      const scaleRatio = newScale / oldScale;

      const viewportCenterX = window.innerWidth / 2;
      const kX = anchorClientX - viewportCenterX;
      viewportPanXRef.current =
        kX * (1 - scaleRatio) + viewportPanXRef.current * scaleRatio;

      const viewportCenterY = window.innerHeight / 2;
      const kY = anchorClientY - viewportCenterY;
      const rawPanY = kY * (1 - scaleRatio) + viewportPanYRef.current * scaleRatio;

      const openingHeight = openingGeometryRef.current.height;
      const effectiveNewScale = newScale * viewportDrawerScaleRef.current;
      const verticalOverflow = Math.max(
        0,
        openingHeight * (effectiveNewScale - 1),
      );
      const maxPanY = (verticalOverflow / 2) * CAMERA_VERTICAL_ANCHOR_REACH;
      viewportPanYRef.current = clamp(rawPanY, -maxPanY, maxPanY);
    },
    [],
  );

  // Camera Feel pass: the zoom controls' (and wheel's) only job is now to
  // move targetScaleRef by a step, clamped to a fixed range, and remember
  // where on screen that step should stay anchored -- a plain synchronous
  // assignment to two refs the per-frame zoom-ease step (in
  // updateGalleryMotion) already reads every frame. viewportScaleRef
  // itself is no longer written here at all; the ease step is now the
  // ONLY thing that moves it, which is what turns a burst of discrete
  // wheel events into one continuous glide toward wherever the burst's
  // accumulated target ends up, instead of each event visibly snapping the
  // displayed scale on its own.
  //
  // anchorClientX/anchorClientY is the screen position this particular
  // zoom should hold fixed -- event.clientX/clientY for wheel, or omitted
  // for the buttons, which default to viewport center on both axes (no new
  // state invented just for them, per the original Phase 3A constraint,
  // preserved here and now extended symmetrically to Y).
  //
  // Mobile pinch does NOT call this -- see its own call site's comment.
  const handleZoomStep = useCallback((delta, anchorClientX, anchorClientY) => {
    const viewportCenterX = window.innerWidth / 2;
    const viewportCenterY = window.innerHeight / 2;
    targetScaleRef.current = clamp(
      targetScaleRef.current + delta,
      CAMERA_ZOOM_MIN,
      CAMERA_ZOOM_MAX,
    );
    zoomAnchorClientXRef.current = anchorClientX ?? viewportCenterX;
    zoomAnchorClientYRef.current = anchorClientY ?? viewportCenterY;
  }, []);

  // Camera state/control split: this is a pure mechanism, not a policy.
  // It synchronously restores scale and the (X-only) pan ref to their
  // defaults -- nothing more. It does not watch scale, does not run on an
  // effect, does not get invoked automatically at zoom limits, and does not
  // infer intent from camera values. Camera exposes it; callers (e.g.
  // regenerateGallery) decide when a reset is warranted.
  //
  // Scale target is CAMERA_ZOOM_MIN, matching viewportScaleRef's own new
  // initial value above (client request, polish pass) -- so a reset always
  // returns to the same Archive default the visitor started at, not the
  // old 1.0 baseline. Deliberately not CAMERA_NEUTRAL_SCALE, for the same
  // reason viewportScaleRef's own initializer isn't -- see that ref's
  // comment.
  //
  // Mobile Archive Interaction Pass -- Stage 1D: mirrors viewportScaleRef's
  // own initializer -- mobile UI mode resets to MOBILE_DEFAULT_CAMERA_SCALE
  // instead of CAMERA_ZOOM_MIN, read via isMobileUiModeRef (not the
  // isMobileUiMode hook value directly) since this callback has a `[]`
  // dependency array and must not go stale -- see isMobileUiModeRef's own
  // comment above for why.
  const resetCameraToNeutral = useCallback(() => {
    const neutralScale = isMobileUiModeRef.current
      ? MOBILE_DEFAULT_CAMERA_SCALE
      : CAMERA_ZOOM_MIN;
    viewportScaleRef.current = neutralScale;
    // Camera Feel pass: targetScaleRef must reset alongside
    // viewportScaleRef -- leaving it at a visitor's prior zoom target
    // would make the very next animation frame immediately start easing
    // back AWAY from this reset, toward whatever stale target was still
    // sitting there, undoing the reset within a few frames.
    targetScaleRef.current = neutralScale;
    viewportPanXRef.current = CAMERA_NEUTRAL_PAN;
    // True 2D Cursor Zoom pass: resets alongside viewportPanXRef, same
    // reasoning -- a reset must not leave a stale vertical correction for
    // the very next frame to visibly snap away from.
    viewportPanYRef.current = CAMERA_NEUTRAL_PAN;
  }, []);

  const handleExitFocus = useCallback(() => {
    const activeId = focusedIdRef.current;
    if (activeId === null) return;

    const track = trackRef.current;
    const overlay = overlayRef.current;
    if (!track || !overlay) return;

    focusTimelineRef.current?.kill();
    focusedIdRef.current = null;
    setFocusedId(null);

    const clone = focusedCloneRef.current;
    const relatedClones = gsap.utils.toArray(".related-image-frame");
    const activeWrapper = getImageWrapper(activeId);
    const activeRect = activeWrapper?.getBoundingClientRect();

    const tl = gsap.timeline({
      defaults: { duration: 0.45, ease: "power3.out" },
      onComplete: () => {
        setFocusedImage(null);
        galleryMovementRef.current.enabled = true;
      },
    });

    tl.to(
      overlay,
      {
        opacity: 0,
        duration: 0.3,
        pointerEvents: "none",
      },
      0,
    );

    tl.to(
      ".theme-connectors, .focus-theme-title",
      {
        opacity: 0,
        duration: 0.2,
      },
      0,
    );

    if (clone && activeRect) {
      tl.to(
        clone,
        {
          left: activeRect.left,
          top: activeRect.top,
          width: activeRect.width,
          height: activeRect.height,
          scale: 1,
          duration: 0.45,
        },
        0,
      );
    }

    relatedClones.forEach((relatedClone) => {
      const { left, top, width, height } = relatedClone.dataset;

      tl.to(
        relatedClone,
        {
          left: Number(left),
          top: Number(top),
          width: Number(width),
          height: Number(height),
          scale: 1,
          opacity: 0,
          duration: 0.4,
        },
        0,
      );
    });

    // Continuous-Effect Stability pass: reads galleryItemsStateRef.current
    // (mirrors the current, bounded galleryItems state -- see that ref's
    // own comment) instead of `galleryItems` directly, so this callback
    // itself no longer needs to change identity every time galleryItems
    // changes -- see the deps array below.
    galleryItemsStateRef.current.forEach((item) => {
      const wrapper = getImageWrapper(item.id);
      if (!wrapper) return;

      tl.to(
        wrapper,
        {
          x: 0,
          y: 0,
          scale: 1,
          opacity: item.opacity,
          filter: "none",
          pointerEvents: "auto",
          zIndex: 1,
        },
        item.id === activeId ? 0.18 : 0,
      );
    });

    focusTimelineRef.current = tl;
  }, [getImageWrapper]);

  // Archive State Reset (canonical): the one place the archive returns to
  // its neutral browsing state. Search (handleSearchSubmit/Clear), Filter
  // (handleFilterChange), and Metadata Click (handleMetadataFilterCommit,
  // below) are all just different ways of producing the same {search,
  // theme, project, year} query state that flows into
  // applyMetadataQuery -- this simply resets that same state back to its
  // defaults, through the same setters/refs those paths already use.
  // There is no metadata-specific (or Search-specific, or Filter-specific)
  // branch here, and none should ever be added -- every future entry
  // point should be able to call this same function.
  //
  // activeImagePoolRef is reset directly to DEFAULT_LIVE_IMAGE_POOL rather
  // than routed through applyMetadataQuery/queryArchive with an empty
  // query -- assigning it directly guarantees a byte-identical return to
  // the same pool the homepage started from, no matter what Search/Filter
  // did in between. (Handshake pass: this used to be the static
  // DEFAULT_IMAGE_POOL; see DEFAULT_LIVE_IMAGE_POOL's own comment above
  // for why it's now the live pool that falls back to the static one only
  // when the live cache is empty -- the reasoning for resetting directly,
  // rather than through applyMetadataQuery, is unchanged.)
  //
  // setHeaderResetKey forces Header to unmount/remount (see that state's
  // own comment above) -- the one piece of plumbing this task's "close
  // the Filter drawer" requirement actually needs, since Header's Filter/
  // Search UI state has no existing external reset hook. regenerateGallery
  // itself already calls resetCameraToNeutral(), so the camera/zoom reset
  // this task asks for needs no separate call here.
  const resetArchiveState = useCallback(() => {
    setCommittedSearch(null);
    setActiveFilterQuery(EMPTY_FILTER_QUERY);
    setHasNoSearchResults(false);
    clearRelatedArchiveNumbersImmediately();
    activeImagePoolRef.current = DEFAULT_LIVE_IMAGE_POOL;
    setHeaderResetKey((key) => key + 1);
    regenerateGallery();
  }, [regenerateGallery]);

  // Homepage-only logo behavior: reset the archive to its neutral browsing
  // state via the same pure pipeline used on mount and resize, rather than
  // navigating anywhere. Child pages don't use this at all -- Header keeps
  // their logo on its existing navigate("/") behavior. Deliberately does
  // not touch handleExitFocus's own signature (it's also wired directly as
  // onClick={handleExitFocus} elsewhere, so adding a parameter there would
  // wire the raw click event in as if it were a callback).
  const handleLogoClick = useCallback(() => {
    if (isRegeneratingFromLogoRef.current) return;
    isRegeneratingFromLogoRef.current = true;

    const beginRegeneration = () => {
      // Fade the track out first, swap the composition once it's no
      // longer visible, then let the .is-regenerating class removal fade
      // it back in -- same dip-and-return motion as the veil, just scoped
      // to the track instead of the whole viewport.
      setIsGalleryTransitioning(true);
      window.setTimeout(() => {
        resetArchiveState();
        setIsGalleryTransitioning(false);
        window.setTimeout(() => {
          isRegeneratingFromLogoRef.current = false;
        }, GALLERY_REGENERATION_SETTLE_MS);
      }, GALLERY_FADE_MS);
    };

    if (focusedIdRef.current !== null) {
      handleExitFocus();
      window.setTimeout(beginRegeneration, EXIT_FOCUS_DURATION_MS);
    } else {
      beginRegeneration();
    }
  }, [handleExitFocus, resetArchiveState]);

  // Metadata Query Wiring (final commit): the one place a {search, theme,
  // project, year} query object actually gets built and handed to
  // queryArchive -- handleSearchSubmit/handleSearchClear and
  // handleFilterChange (all below) each build their own version of that
  // object (combining whichever of committedSearch/activeFilterQuery just
  // changed with whatever the other one currently is) and funnel through
  // this same function, so there is exactly one query-running/regeneration
  // path for Search and Filter both, not two separate ones. Gallery still
  // knows nothing about ARCHIVE_ITEMS beyond this: it never matches
  // anything itself, and this is also the one seam that changes, and the
  // only one, when ARCHIVE_ITEMS is later replaced by a real Sanity query.
  const applyMetadataQuery = useCallback(
    (query) => {
      const runQuery = () => {
        const matched = queryArchive(query, getArchiveItems());

        if (matched.length === 0) {
          // No results: there is no procedural batch a genuinely empty
          // image pool could safely build (see pickImage's own bag-refill
          // fallback), so this path deliberately never reaches
          // buildGalleryItems/regenerateGallery at all. Whatever gallery
          // is already on screen is left exactly as it is, untouched; the
          // placeholder rendered below covers the gallery area in its
          // place.
          setHasNoSearchResults(true);
          return;
        }

        setHasNoSearchResults(false);
        activeImagePoolRef.current = buildImagePool(
          matched.map((item) => item.image),
        );
        regenerateGallery();
      };

      // Site-wide fade transition system: a Theme metadata click (see
      // themeMetadataFadeRef's own comment above) fades the archive into
      // its new state, exactly the "logo-triggered regeneration" motion
      // handleLogoClick already established below -- dip the track's
      // opacity out, swap the underlying query/composition while it's not
      // visible, then let removing .is-regenerating fade it back in. An
      // ordinary Filter drawer selection or a Search commit never sets
      // this ref, so both stay exactly as immediate as they already were.
      if (themeMetadataFadeRef.current) {
        themeMetadataFadeRef.current = false;
        setIsGalleryTransitioning(true);
        window.setTimeout(() => {
          runQuery();
          setIsGalleryTransitioning(false);
        }, GALLERY_FADE_MS);
        return;
      }

      runQuery();
    },
    [regenerateGallery],
  );

  // Header owns the Search UI itself (typing, the Enter-to-commit
  // behavior, the collapsed chip) and knows nothing about ARCHIVE_ITEMS,
  // queryArchive, or gallery regeneration -- it only ever calls this with
  // the plain query string once the visitor presses Enter. rawQuery is
  // used directly (not the committedSearch state, which hasn't re-rendered
  // yet) so this always runs against the value that was just typed, paired
  // with whatever Filter selection is currently active.
  const handleSearchSubmit = useCallback(
    (rawQuery) => {
      setCommittedSearch(rawQuery);
      applyMetadataQuery({ search: rawQuery, ...activeFilterQuery });
    },
    [activeFilterQuery, applyMetadataQuery],
  );

  // Clicking the chip's x (in Header): search: null is exactly the value
  // matchesSearch already treats as "no constraint" (see
  // metadataQueryEngine.js), so this is just the combined query with
  // search cleared -- whatever Filter currently has selected is preserved
  // and re-applied, not reset to the full library.
  const handleSearchClear = useCallback(() => {
    setCommittedSearch(null);
    applyMetadataQuery({ search: null, ...activeFilterQuery });
  }, [activeFilterQuery, applyMetadataQuery]);

  // Header owns the Filter UI itself (Theme/Project/Year selection,
  // toggle-add/remove) and reports every change here with the field it
  // just changed already applied (nextFilterQuery) -- so, symmetrically
  // with handleSearchSubmit above, this combines that fresh value with
  // whatever Search currently has committed, rather than reading
  // activeFilterQuery's own not-yet-updated state.
  //
  // Project Filter Alignment: nextFilterQuery.project arrives as Project
  // titles (Header's Project category now displays/selects PROJECT_TITLES,
  // real values instead of the old unrelated placeholder names) --
  // resolved to slugs here, once, via PROJECT_SLUG_BY_TITLE, before
  // activeFilterQuery is stored or combined into a query. Every other
  // field passes through untouched. queryArchive itself never sees a
  // title, exactly as before this commit; it just keeps comparing
  // item.project against a slug, unaware anything changed upstream of it.
  //
  // Year Filter -- "Earlier" Bucket: nextFilterQuery.year can carry the
  // literal label "Earlier" (Header's Year category reports whichever of
  // its own displayed values were clicked, same as every other category --
  // see MOCK_YEARS in Header.jsx), which queryArchive has no notion of.
  // Resolved here, the same way Project titles are resolved to slugs just
  // above and for the same reason: this is the one seam between Header's
  // display-facing values and queryArchive's match-facing ones. "Earlier"
  // becomes { before: EARLIER_CUTOFF_YEAR } (see that constant's own
  // comment for where the cutoff comes from); every other year value
  // (an explicit "2026", "2024", etc.) passes through untouched, exactly
  // as before this change. Running this map again on an already-resolved
  // value (e.g. when handleMetadataFilterCommit below re-merges
  // activeFilterQuery through this same function) is a harmless no-op --
  // a { before } object is never === "Earlier", so it passes straight
  // through, the same idempotency PROJECT_SLUG_BY_TITLE's lookup above
  // already relies on for an already-resolved slug.
  const handleFilterChange = useCallback(
    (nextFilterQuery) => {
      const resolvedFilterQuery = {
        ...nextFilterQuery,
        project: nextFilterQuery.project.map(
          (title) => PROJECT_SLUG_BY_TITLE.get(title) ?? title,
        ),
        year: nextFilterQuery.year.map((value) =>
          value === "Earlier" ? { before: EARLIER_CUTOFF_YEAR } : value,
        ),
      };
      setActiveFilterQuery(resolvedFilterQuery);
      applyMetadataQuery({ search: committedSearch, ...resolvedFilterQuery });
    },
    [committedSearch, applyMetadataQuery],
  );

  // Metadata Click Commit (Hover/Click separation, consistency pass):
  // Theme now always takes the Header-sync path, regardless of whether
  // Filter mode was already active -- the previous pass gated this on
  // isFilterModeActive (a Project/Theme/Year check), which is exactly
  // what produced the inconsistency this pass fixes: a Theme clicked
  // from plain browsing regenerated the gallery correctly but never
  // touched Header's own selection, so the Filter [N] indicator stayed
  // silent on that first click and only started reflecting reality once
  // a second Theme click found Filter mode already active. Per this
  // pass's brief -- "every metadata click commits into the same filter
  // state regardless of whether the user arrived there from normal
  // browsing or while already inside Filter mode" -- there is no longer
  // a first-click/second-click distinction for Theme; isFilterModeActive
  // is gone rather than left unused.
  //
  // Theme does not call handleFilterChange itself at all -- it only ever
  // sends Header a one-shot request to toggle the value into its own
  // selection, through the exact same handleOptionToggle path a real
  // drawer click already uses. Header is still the single source of
  // truth for what's selected: its own onFilterChange call (unchanged,
  // already wired below) is what actually reaches handleFilterChange
  // from there, so there is still exactly one path from "a Theme value
  // was selected" to "the query re-runs," not two, and Header's
  // selection (and therefore Filter [N]) updates on every Theme click,
  // the very first one included. See pendingThemeFilterCommit's own
  // comment above for why this is a one-shot signal, not a second copy
  // of filter state, and Header.jsx's own comment at the effect that
  // consumes it for the rest of the reasoning.
  const handleMetadataFilterCommit = useCallback(
    (field, value) => {
      // Relationship Mode -- Commit Boundary: committing a metadata
      // value (a Theme click) always exits Relationship Mode.
      // relatedArchiveNumbers exists purely to preview relationships
      // against whatever gallery is currently on screen; the moment
      // this function runs, that gallery is being replaced, so a
      // relationship set computed against the old one has nothing left
      // to describe. This is the one function every Theme
      // commit already shares -- the single place a metadata
      // interaction stops being an ephemeral hover preview and becomes
      // a durable, applied change -- so clearing here, unconditionally,
      // before either branch below, covers both fields and runs before
      // every downstream path to regenerateGallery(). Hover-driven
      // preview and Relationship Mode itself while hovering are
      // untouched -- this only ever fires on an actual commit.
      // (This was originally found via a case where hover-end never
      // runs at all -- clicking a chip while the pointer is still
      // resting on it never dispatches mouseleave -- but the clear
      // belongs here regardless of that specific trigger: a commit
      // should always supersede a preview, whatever left it active.)
      // Relationship Transition Refinement pass: a commit is a hard
      // boundary, not an ordinary hover-end -- goes through
      // clearRelatedArchiveNumbersImmediately() (cancels any pending
      // clear-bridge timer too) rather than the bridged
      // handleRelatedArchiveNumbersChange path, so it always wins
      // instantly.
      clearRelatedArchiveNumbersImmediately();
      if (field === "theme") {
        // Site-wide fade transition system: arms themeMetadataFadeRef
        // (see its own comment above) so the applyMetadataQuery call this
        // commit eventually reaches -- via Header's own onFilterChange,
        // once its pendingThemeFilterCommit effect fires -- fades the
        // archive rather than snapping it, per "clicking a Theme should
        // fade the archive into its new state."
        themeMetadataFadeRef.current = true;
        setPendingThemeFilterCommit({ value });
        return;
      }

      handleFilterChange({
        ...activeFilterQuery,
        [field]: [value],
      });
    },
    [activeFilterQuery, handleFilterChange],
  );

  const handleImageClick = useCallback(
    (imageId) => {
      if (focusedIdRef.current !== null) return;

      const wrapper = getImageWrapper(imageId);
      const overlay = overlayRef.current;
      if (!wrapper || !overlay) return;

      focusTimelineRef.current?.kill();
      focusedIdRef.current = imageId;
      setFocusedId(imageId);

      galleryMovementRef.current.enabled = false;
      galleryMovementRef.current.velocity = 0;
      // Precision Dial Pan Weight pass: zero every underlying channel too,
      // not just the computed total -- otherwise a wheelVelocity/
      // appliedWheelVelocity left mid-decay from just before this image
      // was opened would still be sitting there (unlike the old single-
      // field model, where zeroing movement.velocity directly WAS zeroing
      // the only accumulator) and could resume contributing motion the
      // instant enabled flips back to true on close, producing a stray
      // post-close nudge that was never actually re-triggered by input.
      galleryMovementRef.current.wheelVelocity = 0;
      galleryMovementRef.current.appliedWheelVelocity = 0;
      galleryMovementRef.current.touchVelocity = 0;

      const rect = wrapper.getBoundingClientRect();
      const focusedItem = galleryItems.find((item) => item.id === imageId);
      const relatedImages = focusedItem.tag
        ? galleryItems
            .filter((item) => item.id !== imageId && item.tag === focusedItem.tag)
            .map((item) => {
              const relatedWrapper = getImageWrapper(item.id);
              const relatedRect = relatedWrapper?.getBoundingClientRect();

              return {
                id: item.id,
                src: item.src,
                alt: item.alt,
                tag: item.tag,
                rect: relatedRect
                  ? {
                      left: relatedRect.left,
                      top: relatedRect.top,
                      width: relatedRect.width,
                      height: relatedRect.height,
                    }
                  : null,
              };
            })
            .filter((item) => item.rect)
            .slice(0, 6)
        : [];

      setFocusedImage({
        id: imageId,
        src: focusedItem.src,
        alt: focusedItem.alt,
        tag: focusedItem.tag,
        relatedImages,
        rect: {
          left: rect.left,
          top: rect.top,
          width: rect.width,
          height: rect.height,
        },
      });

      const tl = gsap.timeline({
        defaults: { duration: 0.55, ease: "power3.out" },
      });

      tl.to(
        overlay,
        {
          opacity: 0.36,
          duration: 0.35,
          pointerEvents: "auto",
        },
        0,
      );

      // Continuous-Effect Stability pass: see handleExitFocus's identical
      // comment just above its own equivalent forEach.
      galleryItemsStateRef.current.forEach((item) => {
        const imageWrapper = getImageWrapper(item.id);
        if (!imageWrapper) return;

        tl.to(
          imageWrapper,
          {
            x: 0,
            y: 0,
            scale: 0.94,
            opacity: 0,
            filter: "brightness(0.62) saturate(0.82)",
            pointerEvents: "none",
            zIndex: 1,
          },
          0,
        );
      });

      focusTimelineRef.current = tl;
    },
    [getImageWrapper],
  );

  const handleRelatedImageEnter = useCallback((event) => {
    const hovered = event.currentTarget;
    const hoveredScale = Number(hovered.dataset.clusterScale || 1);

    gsap.to(hovered, {
      scale: hoveredScale * 1.14,
      opacity: 1,
      zIndex: 1090,
      duration: 0.22,
      ease: "power2.out",
    });

    gsap.to(".related-image-frame", {
      opacity: (index, target) => (target === hovered ? 1 : 0.46),
      scale: (index, target) =>
        target === hovered
          ? hoveredScale * 1.14
          : Number(target.dataset.clusterScale || 1),
      zIndex: (index, target) => (target === hovered ? 1090 : 1050),
      duration: 0.22,
      ease: "power2.out",
    });
  }, []);

  const handleRelatedImageLeave = useCallback(() => {
    gsap.to(".related-image-frame", {
      opacity: 1,
      scale: (index, target) => Number(target.dataset.clusterScale || 1),
      zIndex: 1050,
      duration: 0.24,
      ease: "power2.out",
    });
  }, []);

  useEffect(() => {
    if (!focusedImage) return;

    const clone = focusedCloneRef.current;
    if (!clone) return;

    const { left, top, width, height } = focusedImage.rect;

    gsap.set(clone, {
      left,
      top,
      width,
      height,
      scale: 1,
      opacity: 1,
      filter: "none",
      transformOrigin: "center center",
    });

    gsap.to(clone, {
      left: window.innerWidth / 2 - width / 2,
      top: window.innerHeight / 2 - height / 2,
      scale: 1.08,
      duration: 0.55,
      ease: "power3.out",
    });

    gsap.fromTo(
      ".focus-theme-title",
      { y: 10, opacity: 0 },
      { y: 0, opacity: 1, duration: 0.35, ease: "power2.out" },
    );

    gsap.utils.toArray(".related-image-frame").forEach((relatedClone, index) => {
      const placement = clusterPlacements[index % clusterPlacements.length];
      const relatedWidth = Number(relatedClone.dataset.width);
      const relatedHeight = Number(relatedClone.dataset.height);
      const clusterScale = placement.scale;
      const clusterCenter = getClusterCenter(placement, focusedImage.rect, {
        width: relatedWidth,
        height: relatedHeight,
      });

      gsap.set(relatedClone, {
        left: Number(relatedClone.dataset.left),
        top: Number(relatedClone.dataset.top),
        width: relatedWidth,
        height: relatedHeight,
        scale: 1,
        opacity: 0,
        transformOrigin: "center center",
      });

      gsap.to(relatedClone, {
        left: clusterCenter.x - relatedWidth / 2,
        top: clusterCenter.y - relatedHeight / 2,
        scale: clusterScale,
        opacity: 1,
        duration: 0.55,
        delay: 0.04 * index,
        ease: "power3.out",
      });
    });

    gsap.utils.toArray(".theme-connector-line").forEach((line, index) => {
      const length = line.getTotalLength();
      const timing = connectorTimings[index % connectorTimings.length];

      gsap.set(line, {
        strokeDasharray: length,
        strokeDashoffset: length,
      });

      gsap.to(line, {
        strokeDashoffset: 0,
        duration: timing.duration,
        delay: timing.delay,
        ease: "power2.out",
      });
    });
  }, [focusedImage]);

  useEffect(() => {
    const scrollKeys = new Set([
      " ",
      "ArrowUp",
      "ArrowDown",
      "ArrowLeft",
      "ArrowRight",
      "PageUp",
      "PageDown",
      "Home",
      "End",
    ]);

    const preventFocusScroll = (event) => {
      if (focusedIdRef.current !== null) {
        event.preventDefault();
      }
    };

    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        handleExitFocus();
        return;
      }

      if (focusedIdRef.current !== null && scrollKeys.has(event.key)) {
        event.preventDefault();
        return;
      }

      // Homepage Space-bar fix: outside the image-focused/zoomed mode
      // above, nothing else on this page relies on native document
      // scroll -- the Archive's own pan/zoom is a separate, transform-
      // driven camera -- but html/body still have real overflow-y: auto
      // (see styles.css), so pressing Space while nothing meaningful has
      // focus triggers the browser's native "page down" scroll, visually
      // desyncing the fixed Header from the Archive underneath even
      // though the camera itself never moves. Scoped to Space only, and
      // only to document.activeElement genuinely being body/the document
      // root (Safari can report either depending on state) -- a focused
      // button/link/input keeps its own native Space behavior untouched.
      if (
        event.key === " " &&
        (document.activeElement === document.body ||
          document.activeElement === document.documentElement ||
          document.activeElement === null)
      ) {
        event.preventDefault();
      }
    };

    window.addEventListener("wheel", preventFocusScroll, { passive: false });
    window.addEventListener("touchmove", preventFocusScroll, { passive: false });
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      window.removeEventListener("wheel", preventFocusScroll);
      window.removeEventListener("touchmove", preventFocusScroll);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [handleExitFocus]);

  useEffect(() => {
    if (galleryItems.length === 0) return;

    const scrollContainer = scrollContainerRef.current;
    const track = trackRef.current;

    if (!scrollContainer || !track) return;

    // Extension-guard reset (Bounded Runtime Field pass -- supersedes the
    // old "extension-race fix" comment that used to live here): this
    // effect body now only runs on a genuine full regeneration (mount,
    // resize, logo click -- see gallerySessionId, this effect's own
    // dependency below), never on an ordinary extension, so this line no
    // longer needs to do any stale-closure bookkeeping -- it is simply
    // "a fresh regeneration starts with no extension in flight." The
    // actual per-extension release now happens synchronously at the end
    // of extendGalleryIfNeeded itself, immediately after it registers
    // the new batch in the bounded batch cache (Round G refinement --
    // see that function's own comment) -- see that function's own
    // comment for why that is safe now that nextBatchIndex is computed
    // from a ref instead of the `galleryItems` closure/state value.
    isExtendingGalleryRef.current = false;

    const movement = galleryMovementRef.current;
    const animatedImages = animatedImagesRef.current;
    const preEntryDistance = 360;
    // Weighted Dial Pan Feel pass: see CAMERA_PAN_FRICTION's own comment
    // for the full reasoning (the one truly shared side effect this pass
    // has on mobile touch-drag's own decay tail, since there is only one
    // movement.velocity accumulator either input source decays through).
    const friction = CAMERA_PAN_FRICTION;
    const browsingThreshold = 48;
    const renderWindowUpdateThreshold = Math.max(window.innerWidth * 0.35, 240);
    let animationFrame = null;
    let touchPoint = null;
    // Mobile Baseline Pass -- Task 3 (Archive pinch-to-zoom): gesture-
    // start-anchored pinch state, same closure-scoped-let lifetime as
    // touchPoint immediately above (reset whenever this effect's own
    // [gallerySessionId] dependency changes -- i.e. on a genuine
    // regeneration, not on an ordinary extension -- exactly like
    // touchPoint already is). null whenever fewer/more than two touches
    // are down; set fresh
    // in handleTouchStart the instant a second touch lands, holding the
    // two-finger distance/midpoint/scale AT THAT MOMENT -- every
    // subsequent touchmove frame computes the desired scale directly from
    // this fixed starting ratio (distance-now / distance-at-gesture-start
    // times scale-at-gesture-start), not by compounding a per-frame
    // delta, so the zoom level tracks finger separation exactly and
    // cannot drift from small per-frame rounding error the way an
    // accumulating approach could over a long hold.
    let pinchState = null;
    // Mobile Archive Interaction Pass -- Stage 0 (Gesture Correctness
    // Foundation): tap-vs-drag disambiguation state, same closure-scoped-
    // let lifetime as touchPoint/pinchState immediately above.
    // touchGestureStartPoint/touchGestureStartTime capture where and when
    // the CURRENT single-finger touch sequence began; touchTotalMovement
    // accumulates real finger travel every touchmove frame (not just the
    // most recent frame's delta), so a slow, deliberate drag -- which can
    // look "small" moment-to-moment -- is still correctly recognized as a
    // drag over its full duration. null/0 whenever there is no live
    // single-finger tap candidate (no touch down, mid-pinch, or already
    // resolved as a drag) -- see handleTouchStart/handleTouchMove/
    // handleTouchEnd below, the only places these are set.
    let touchGestureStartPoint = null;
    let touchGestureStartTime = 0;
    let touchTotalMovement = 0;
    // Set the instant a pinch gesture (pinchState above) ends -- a
    // touchend landing before this timestamp is treated as still part of
    // that pinch ending, never as a fresh tap, regardless of how little
    // that specific lifting finger happened to travel on its own. See
    // handleTouchStart/handleTouchEnd below, the two places this is
    // set/read.
    let pinchCooldownUntil = 0;
    // Browsing/Exploration mode: pending "settle" timer, same lifetime
    // scope as animationFrame/touchPoint above (this whole effect body is
    // now recreated only on a genuine regeneration, not on every ordinary
    // extension -- see gallerySessionId and this effect's own dependency
    // array). Set once motion drops under
    // SCROLL_IDLE_VELOCITY_EPSILON, cleared immediately if real motion
    // resumes before it fires -- see animateGallery below.
    let scrollIdleTimeout = null;
    // High-End Motion/Transition Polish pass: chained off scrollIdleTimeout
    // above -- armed only once that timer has already fired (isScrollingRef
    // already false), cleared immediately if real motion resumes before it
    // fires. See FIELD_SETTLE_GRACE_MS/isFieldSettledRef's own comments.
    let fieldSettleTimeout = null;
    // Bounded Runtime Field pass: the retention window's own debounce
    // baseline, exactly the same idiom renderWindowRef/updateRenderWindow
    // already use for the (narrower) render window -- avoids
    // recomputing and re-collecting retained items from the batch cache
    // on every single frame when the camera has only moved a few px.
    // Initialized against the camera's starting position so the first
    // real frame doesn't immediately treat that as "the window moved."
    let lastRetentionWindow = getGalleryRetentionWindow(movement.distance);
    const retentionWindowUpdateThreshold = Math.max(
      window.innerWidth * 1.5,
      900,
    );
    // Bounded Runtime Field pass: galleryItemsById (below) used to be
    // rebuilt once per effect setup, which was correct only because this
    // effect used to rebuild on every extension too (see this effect's
    // own dependency array further down). Now that it doesn't, the Map
    // is rebuilt lazily, on demand, only when galleryItemsStateRef.current
    // has actually changed since the last build (reference equality --
    // every place that changes it always assigns a fresh array/filter
    // result, never mutates in place) -- see getGalleryItemsById below.
    let cachedGalleryItemsById = null;
    let cachedGalleryItemsByIdSource = null;
    const getGalleryItemsById = () => {
      const current = galleryItemsStateRef.current;
      if (cachedGalleryItemsByIdSource !== current) {
        cachedGalleryItemsById = new Map(
          current.map((item) => [item.id, item]),
        );
        cachedGalleryItemsByIdSource = current;
      }
      return cachedGalleryItemsById;
    };

    scrollContainer.style.height = "100vh";

    // wrapperRegistryRef.current is the same persistent Map for the whole
    // component lifetime, kept correct by each wrapper's own callback ref
    // (mount/unmount), not rebuilt here -- see wrapperRegistryRef's own
    // comment. Passing the Map itself (not a snapshot copy) means every
    // registration/deregistration that happens after this effect starts is
    // still visible through this same reference, exactly like
    // viewportScaleRef or renderWindowRef already are for their own state.
    const galleryRenderer = createGalleryRenderer({
      track,
      wrapperById: wrapperRegistryRef.current,
      animatedImages,
      movement,
      viewportScaleRef,
      viewportDrawerScaleRef,
      viewportPanXRef,
      viewportPanYRef,
      renderWindowRef,
      setRenderWindowState: setRenderWindow,
      focusedIdRef,
      preEntryDistance,
      renderWindowUpdateThreshold,
      openingHeight: openingGeometryRef.current.height,
      isArchiveInMotionRef: isScrollingRef,
      isFieldSettledRef,
    });

    galleryRenderer.primeEntranceState(galleryItems);

    // Perf: Map lookup by id, O(1), built lazily by getGalleryItemsById
    // above only when galleryItemsStateRef.current has actually changed --
    // see that getter's own comment.

    // Reversal-safety pass (Round H -- supersedes the old
    // "galleryItemsRef.current.filter(...)" from before Round G, AND
    // Round G's own "already bounded by evictDistantBatches" framing,
    // since eviction has been removed -- see batchCacheRef's own
    // comment): instead of scanning every item ever generated, only
    // visits the batches in batchBoundsRef -- ALL of them, for the
    // whole session, since nothing is ever evicted from it anymore --
    // at BATCH granularity first (a cheap bounds check per batch,
    // never touching that batch's actual items unless its bounds
    // intersect), then flattens only the intersecting batches' items
    // and applies the exact same per-item isItemInRenderWindow test
    // the old code always used. Cost is O(total lifetime BATCH count +
    // items in batches that actually intersect the window) -- batches
    // are coarse (tens of items each), so this is far cheaper than the
    // old O(total lifetime ITEM count), even though it does still grow
    // slowly with session length. This runs only when the debounced
    // retention-window threshold below is actually crossed, not every
    // frame -- see updateGalleryRetention's own comment.
    const collectRetainedItems = (retentionWindow) => {
      const retained = [];
      for (const [batchIndex, bounds] of batchBoundsRef.current) {
        if (
          bounds.right < retentionWindow.left ||
          bounds.left > retentionWindow.right
        ) {
          continue;
        }
        const batchItems = batchCacheRef.current.get(batchIndex);
        if (!batchItems) continue;
        for (const item of batchItems) {
          if (isItemInRenderWindow(item, retentionWindow)) {
            retained.push(item);
          }
        }
      }
      return retained;
    };

    const extendGalleryIfNeeded = () => {
      // Bounded Runtime Field pass (Round G refinement): reads the
      // scalar frontierRightXRef instead of the DOM's track.scrollWidth
      // -- same value (the track's width IS derived from this same
      // frontier, via getGalleryTrackWidthFromFrontier in the JSX style
      // below), but a scalar read instead of a layout read, which also
      // serves the idle-cost audit (this function runs every RAF
      // frame).
      const remainingTrack =
        getGalleryTrackWidthFromFrontier(frontierRightXRef.current) -
        movement.distance;
      const extensionThreshold = window.innerWidth * 3;

      if (
        remainingTrack > extensionThreshold ||
        isExtendingGalleryRef.current
      ) {
        return;
      }

      isExtendingGalleryRef.current = true;

      // *** THE FIX (extension-pipeline refactor) ***
      //
      // Everything from here down to the setGalleryItems call used to
      // happen INSIDE the functional updater passed to setGalleryItems --
      // including the createGalleryBatch call that mutated
      // columnStateRef.current in place. That made the mutation itself
      // subject to however many times React chose to invoke that updater,
      // which the tracing this session confirmed was happening well beyond
      // the immediate double-check.
      //
      // Now: nextBatchIndex, the batch itself, and the next columnState are
      // all computed and applied HERE -- synchronously, in the body of
      // extendGalleryIfNeeded, which can only reach this point once per
      // real (non-reentrant) invocation, guaranteed by the
      // isExtendingGalleryRef guard above. `galleryItems` is the current
      // render's own state value (this whole effect re-runs and recreates
      // this closure on every galleryItems commit, so it's always the
      // latest committed value by the time a genuinely new invocation gets
      // this far -- the guard is released at the TOP of this effect body,
      // once this closure's own galleryItems commit has actually landed;
      // see that reset's own comment above for why. columnStateRef.current
      // is mutated exactly once, right here, as a single plain assignment
      // -- not from inside anything React could re-invoke.
      //
      // The updater actually passed to setGalleryItems below is now just
      // `(currentItems) => [...currentItems, ...newBatch]` -- newBatch is a
      // fixed, already-computed array closed over from here, and the
      // updater touches nothing else. However many times React invokes
      // that updater, it produces the identical result every time and
      // mutates nothing, so replay is harmless by construction.
      // Bounded Runtime Field pass (Round G refinement -- supersedes the
      // "galleryItemsRef.current (the full, never-pruned generation
      // history)" comment that used to live here): nextBatchIndex is
      // now a single scalar increment of highestGeneratedBatchIndexRef,
      // rather than a scan (of any size) over any item collection. The
      // same reasoning that justified reading a full history instead of
      // the bounded `galleryItems` state still applies -- this scalar,
      // like the old full-history array, is never pruned as the camera
      // moves, so it is always correct regardless of what's currently
      // bounded into view or cached -- it just no longer needs an
      // actual array of items to stay correct.
      const nextBatchIndex = highestGeneratedBatchIndexRef.current + 1;

      // Bounded Runtime Field pass (Round G refinement -- replaces both
      // TEMPORARY DIAGNOSTIC checks that used to live here, including
      // the generatedBatchIndicesRef Set): with nextBatchIndex now
      // derived from a monotonically-advancing scalar (never reset,
      // never recomputed from data that could be stale or pruned), the
      // same index can no longer be computed twice by construction --
      // there is no longer a data shape in which that diagnostic could
      // ever fire, so it has been removed rather than kept as an
      // ever-growing Set whose only job was proving another
      // now-removed structure was behaving. The check below is kept as
      // a genuine, O(1), always-meaningful correctness assertion (it
      // stays meaningful even after the scalar-index design, since the
      // cache could in principle be handed a stale/duplicate batch by
      // a future bug) rather than a leftover mirror of removed state.
      if (batchCacheRef.current.has(nextBatchIndex)) {
        console.warn(
          "[gallery-extension-diagnostic] batchCacheRef already has an entry for nextBatchIndex -- this should be structurally impossible now that nextBatchIndex derives from a monotonic scalar.",
          { nextBatchIndex, timestamp: performance.now() },
        );
      }

      const { items: newBatch, nextColumnState } = createGalleryBatch(
        nextBatchIndex,
        columnStateRef.current,
        openingGeometryRef.current.height,
        activeImagePoolRef.current,
      );

      columnStateRef.current = nextColumnState;

      // Bounded Runtime Field pass (Round G refinement): insert the new
      // batch into the bounded cache (O(new batch size) to compute its
      // own bounds, O(1) to store) instead of appending to an unbounded
      // "full history" array, advance the two frontier scalars, prime
      // the newly-created batch's entrance state exactly like the
      // pre-existing primeEntranceState(galleryItems) call used to for
      // every extension's worth of new items (this effect used to
      // rebuild -- and re-run that call -- on every extension; now it
      // doesn't, so newBatch needs its own explicit prime here instead),
      // then derive the bounded RETENTION window and commit the
      // currently-cached, currently-in-window items to React state via
      // collectRetainedItems (never a full-array filter). This makes
      // the newly-generated batch appear immediately (matching the
      // pre-existing behavior exactly) and performs a prune pass at the
      // one moment growth actually happens, rather than waiting for
      // updateGalleryRetention's own debounced per-frame check (which
      // still runs every frame below and is what handles the
      // reverse-direction case, and the cache-eviction pass -- see that
      // function's own comment).
      const newBatchBounds = getBatchBounds(newBatch);
      batchCacheRef.current.set(nextBatchIndex, newBatch);
      batchBoundsRef.current.set(nextBatchIndex, newBatchBounds);
      highestGeneratedBatchIndexRef.current = nextBatchIndex;
      frontierRightXRef.current = Math.max(
        frontierRightXRef.current,
        newBatchBounds.right,
      );
      galleryRenderer.primeEntranceState(newBatch);
      lastRetentionWindow = getGalleryRetentionWindow(movement.distance);
      const retainedItems = collectRetainedItems(lastRetentionWindow);
      galleryItemsStateRef.current = retainedItems;
      setGalleryItems(retainedItems);

      // Extension-guard release (extension-race fix, revised for the
      // Bounded Runtime Field pass): previously released only once this
      // effect re-ran against the newly-committed `galleryItems` state,
      // specifically to guard against a stale closure recomputing the
      // same nextBatchIndex from a stale `galleryItems` STATE value
      // before React had flushed the update. That hazard no longer
      // exists: nextBatchIndex above is now computed from
      // highestGeneratedBatchIndexRef, a ref updated synchronously a few
      // lines above this comment -- there is no React-commit round trip
      // left to wait for, and no stale closure possible, since a ref
      // read is never stale relative to a synchronous ref write.
      // Releasing immediately, synchronously, is therefore both simpler
      // and correct: the very next call to this function (next RAF
      // frame) will see isExtendingGalleryRef.current === false and
      // highestGeneratedBatchIndexRef.current already reflecting this
      // batch, so it can only ever compute the NEXT index, never a
      // duplicate of this one.
      isExtendingGalleryRef.current = false;
    };

    // Bounded Runtime Field pass (comment revised, Round H): the
    // symmetric counterpart to the append at the end of
    // extendGalleryIfNeeded above. That one only ever runs forward (an
    // extension only ever grows the world in the direction of
    // travel), so it is also the only place that grows React state
    // going forward. This function is what restores previously-pruned
    // items as the camera moves BACK toward them -- reversing
    // direction, or simply drifting back after a long pan -- by
    // reading back out of batchCacheRef, which (as of Round H) is
    // never pruned, so this always finds a previously-visited
    // region's original tiles again, with no exceptions. Only what is
    // currently checked into React state changes here -- the
    // historical store itself is untouched. Debounced exactly like
    // updateRenderWindow (same threshold idiom, a larger distance
    // since the retention window itself is larger), so ordinary small
    // movements don't re-collect retained items from the historical
    // store every frame -- only once the camera has moved far enough
    // that the retained set could actually need to change. (Round G
    // also ran a second, wider-margin batch-CACHE EVICTION pass from
    // here -- removed; see batchCacheRef's own comment for why.)
    const updateGalleryRetention = () => {
      const retentionWindow = getGalleryRetentionWindow(movement.distance);

      if (
        Math.abs(retentionWindow.left - lastRetentionWindow.left) >=
          retentionWindowUpdateThreshold ||
        Math.abs(retentionWindow.right - lastRetentionWindow.right) >=
          retentionWindowUpdateThreshold
      ) {
        lastRetentionWindow = retentionWindow;
        const retainedItems = collectRetainedItems(retentionWindow);
        galleryItemsStateRef.current = retainedItems;
        setGalleryItems(retainedItems);
      }
    };

    const updateGalleryMotion = () => {
      // Layout Bug Fix -- Gallery Shift on Filter Open: recomputes, every
      // frame this loop already runs, exactly how much scale reduction the
      // drawer's CURRENT real height requires, then eases
      // viewportDrawerScaleRef toward it -- the same requestAnimationFrame
      // cadence Camera's own zoom and Navigator's own movement already
      // rely on, not a second animation system.
      //
      // Derivation (pure geometry, no tuned/magic constant): Gallery
      // Renderer scales the track around the opening's own center
      // (getVerticalScaleCompensation), so at scale s the visible
      // composition's top edge sits (openingHeight / 2) * (1 - s) below
      // where it would sit at scale 1 -- and by the same symmetric-scaling
      // fact, its bottom edge gains that identical amount of clearance
      // above .opening-viewport's own bottom edge. Application Layout's
      // openingGeometry.top already reserves enough room for the CLOSED
      // header; what the open drawer needs is that same amount of *extra*
      // top clearance equal to its own real height (indexDrawerHeightRef).
      // Solving (openingHeight / 2) * (1 - s) >= drawerHeight for s gives
      // s <= 1 - (2 * drawerHeight) / openingHeight -- the exact scale that
      // guarantees no header overlap for whatever the drawer's real height
      // currently is, whether that's 0 (closed), the default single row,
      // mid-animation, or Theme/Project/Year fully expanded with however
      // many "View All" secondary rows that produces. The same formula
      // also guarantees the symmetric extra clearance at the bottom, so it
      // covers "no footer overlap" for free -- there is no separate case
      // for that.
      //
      // Bounded below by FILTER_DRAWER_ZOOM_FLOOR, not CAMERA_ZOOM_MIN --
      // see that constant's own comment for why an automatic accommodation
      // and a visitor's deliberate zoom-out are deliberately kept as two
      // separate bounds. A heavily expanded drawer (a long "View All" list)
      // can therefore ask for more reduction than the floor allows; past
      // that point the composition stops shrinking further and the
      // pre-existing .scroll-container--drawer-open dim covers whatever
      // clearance the bounded scale alone doesn't -- a deliberate,
      // documented trade-off (bounded subtlety over an unbounded shrink),
      // not a silent gap. Never above CAMERA_NEUTRAL_SCALE, since the
      // drawer should only ever ask for LESS scale, never more.
      const openingHeight = openingGeometryRef.current.height;
      const requiredDrawerScale =
        openingHeight > 0
          ? 1 - (2 * indexDrawerHeightRef.current) / openingHeight
          : CAMERA_NEUTRAL_SCALE;
      const drawerScaleTarget = clamp(
        requiredDrawerScale,
        FILTER_DRAWER_ZOOM_FLOOR,
        CAMERA_NEUTRAL_SCALE,
      );
      // Ease-toward-target, same idiom updateEntranceAnimations already
      // uses for smoothScale; snaps once close enough, matching
      // movement.velocity's own exact-zero snap above, so the multiplier
      // settles at precisely its target rather than approaching it forever.
      const nextDrawerScale =
        viewportDrawerScaleRef.current +
        (drawerScaleTarget - viewportDrawerScaleRef.current) *
          FILTER_DRAWER_ZOOM_EASE;
      viewportDrawerScaleRef.current =
        Math.abs(nextDrawerScale - drawerScaleTarget) < 0.0005
          ? drawerScaleTarget
          : nextDrawerScale;

      // Camera Feel pass: viewportScaleRef eases toward targetScaleRef
      // every frame, same ease-toward-target idiom as the drawer-scale
      // block immediately above (own tuned rate, CAMERA_ZOOM_EASE -- see
      // its own comment for why). This is what turns handleZoomStep's
      // discrete per-event target nudges into one continuous glide.
      //
      // Critically, applyZoomAnchor is called HERE, every frame scale
      // actually changes, using zoomAnchorClientXRef (the last screen
      // position a zoom gesture asked to hold fixed) and THIS frame's own
      // old/new scale -- not once at the moment handleZoomStep fired. That
      // is what keeps the cursor's world-space anchor point correct
      // THROUGHOUT the animated ease instead of only at its start and end:
      // each small per-frame scale step gets its own exact anchor
      // correction, so the point under the cursor never drifts while the
      // rest of the ease is still catching up, even across many frames.
      const oldCameraScale = viewportScaleRef.current;
      const cameraScaleTarget = targetScaleRef.current;
      const nextCameraScale =
        oldCameraScale +
        (cameraScaleTarget - oldCameraScale) * CAMERA_ZOOM_EASE;
      const settledCameraScale =
        Math.abs(nextCameraScale - cameraScaleTarget) <
        CAMERA_ZOOM_SETTLE_EPSILON
          ? cameraScaleTarget
          : nextCameraScale;
      if (settledCameraScale !== oldCameraScale) {
        applyZoomAnchor(
          oldCameraScale,
          settledCameraScale,
          zoomAnchorClientXRef.current,
          zoomAnchorClientYRef.current,
        );
        viewportScaleRef.current = settledCameraScale;
      }

      galleryRenderer.applyTransform(movement.distance);
      extendGalleryIfNeeded();
      galleryRenderer.updateRenderWindow();
      updateGalleryRetention();
      galleryRenderer.updateEntranceAnimations(getGalleryItemsById());
      if (movement.distance > browsingThreshold) {
        movement.hasBrowsed = true;
      }
      document.documentElement.classList.toggle(
        "is-browsing",
        movement.hasBrowsed,
      );

      // Browsing/Exploration mode: same per-frame placement as is-browsing
      // above, reading movement.velocity right after this frame's friction
      // decay has already been applied. Real motion (above the epsilon)
      // both flips isScrolling on (once) and cancels any pending settle
      // timer, so an inertial glide keeps Browsing Mode active the whole
      // way through, not just while a wheel/touch event is literally
      // firing. Dropping under the epsilon starts a single
      // SCROLL_IDLE_DELAY_MS timer; if real motion doesn't resume before it
      // fires, that's Exploration Mode. Also clears any active
      // Relationship Engine highlight the moment browsing resumes, rather
      // than counting on a hover/pointer-events transition to imply it --
      // see relatedArchiveNumbers's own comment for why Gallery owns that
      // state.
      //
      // Motion-Stability pass: isMovingNow now also counts an in-progress
      // ZOOM ease, not just pan velocity -- previously a pure zoom gesture
      // (no pan) never flipped isScrolling, so Relationship Engine
      // suppression and (see updateEntranceAnimations, which now reads
      // this same isScrolling ref as its own "archive in motion" signal)
      // entrance-pop suppression only ever responded to panning. Reads
      // viewportScaleRef/targetScaleRef equality rather than a new
      // epsilon: the zoom-ease step just above snaps
      // viewportScaleRef.current to exactly targetScaleRef.current once
      // within CAMERA_ZOOM_SETTLE_EPSILON, so inequality here already
      // means "still actively easing toward a target," precisely and with
      // no new constant to keep in sync. This is the whole
      // "isArchiveInMotion" signal this pass asked for: real pan velocity
      // OR an unsettled zoom, with the exact same on/off hysteresis
      // (instant on, SCROLL_IDLE_DELAY_MS debounced off) the existing
      // Browsing/Exploration mode already had -- no new state system, no
      // per-frame chatter around zero.
      const isZoomInMotion = viewportScaleRef.current !== targetScaleRef.current;
      const isMovingNow =
        Math.abs(movement.velocity) > SCROLL_IDLE_VELOCITY_EPSILON ||
        isZoomInMotion;
      if (isMovingNow) {
        if (scrollIdleTimeout !== null) {
          clearTimeout(scrollIdleTimeout);
          scrollIdleTimeout = null;
        }
        // High-End Motion/Transition Polish pass: real motion resuming
        // cancels a pending settle exactly like it cancels a pending
        // scrollIdleTimeout above, and resets isFieldSettledRef instantly
        // (no grace on the way back INTO motion) -- see that ref's own
        // comment.
        if (fieldSettleTimeout !== null) {
          clearTimeout(fieldSettleTimeout);
          fieldSettleTimeout = null;
        }
        isFieldSettledRef.current = false;
        if (!isScrollingRef.current) {
          isScrollingRef.current = true;
          setIsScrolling(true);
          // Relationship Transition Refinement pass: motion beginning is
          // the hard motion-safety clear -- goes through
          // clearRelatedArchiveNumbersImmediately() so it always cancels
          // any pending clear-bridge timer and wins instantly, never
          // debounced by the Theme-to-Theme handoff bridge.
          clearRelatedArchiveNumbersImmediately();
        }
      } else if (isScrollingRef.current && scrollIdleTimeout === null) {
        scrollIdleTimeout = setTimeout(() => {
          isScrollingRef.current = false;
          setIsScrolling(false);
          scrollIdleTimeout = null;
          // High-End Motion/Transition Polish pass: the camera itself is
          // now judged stopped (pointer-events/text-color hover already
          // came back the instant is-scrolling's CSS class lifted, via
          // this same setIsScrolling(false)) -- chain the shorter
          // FIELD_SETTLE_GRACE_MS grace before the passive/visual systems
          // (entrance, local transform resume, relationship hover-intent)
          // become eligible. See FIELD_SETTLE_GRACE_MS's own comment.
          fieldSettleTimeout = setTimeout(() => {
            isFieldSettledRef.current = true;
            fieldSettleTimeout = null;
          }, FIELD_SETTLE_GRACE_MS);
        }, SCROLL_IDLE_DELAY_MS);
      }
    };

    const animateGallery = () => {
      const canMove = movement.enabled && focusedIdRef.current === null;
      // Precision Dial Pan Weight pass: this frame's actual applied
      // velocity is whatever last frame's decay/ease step (bottom of this
      // function) already left sitting in the two channels -- touch's
      // direct accumulator plus wheel's Stage-2 eased-applied value. This
      // is the one and only place the two channels are summed; everything
      // below this line (direction, worldDelta, distance) is completely
      // unchanged from before this pass and has no idea wheel and touch
      // are now separate accumulators upstream.
      const currentVelocity = canMove
        ? movement.touchVelocity + movement.appliedWheelVelocity
        : 0;

      if (currentVelocity !== 0) {
        movement.direction = currentVelocity > 0 ? 1 : -1;
      }

      // Camera Feel pass: movement.velocity is deliberately treated as a
      // SCREEN-space quantity (how many px/frame this pan should visibly
      // read as) -- but movement.distance is WORLD-space, and
      // projectWorldToScreenX multiplies world-space distance by the
      // current scale to get screen pixels. Adding velocity to distance
      // un-divided, as this used to, means the SAME velocity produces
      // MORE screen movement at high zoom and LESS at low zoom -- measured
      // directly in the previous pass: ~2.94x more screen-space pan speed
      // at max zoom (2.5) than min zoom (0.8) for identical wheel input.
      // That is exactly the "hyper-sensitive when zoomed in" /
      // "sluggish when zoomed out" feel this pass was asked to remove.
      //
      // Dividing by the current effective scale here, at the one place
      // velocity is actually converted into a world-space move, cancels
      // that multiplication back out: screen movement this frame =
      // (velocity / scale) * scale = velocity, invariant of scale. Reads
      // last frame's scale (the zoom-ease step below hasn't run yet this
      // frame) rather than this frame's -- scale only ever changes by a
      // small per-frame ease fraction, so the one-frame lag here is well
      // under a rendered frame's worth of visible difference, not a
      // correctness issue. This does not change what movement.distance
      // MEANS (still the same world-space position every render-window/
      // DAPC/browsing-threshold consumer already reads) or how fast it
      // decays (friction, below, is untouched) -- only how much WORLD
      // distance a given SCREEN-space velocity impulse covers per frame.
      const effectiveScale =
        viewportScaleRef.current * viewportDrawerScaleRef.current;
      const worldDelta =
        effectiveScale > 0 ? currentVelocity / effectiveScale : currentVelocity;

      movement.distance = Math.max(0, movement.distance + worldDelta);

      if (movement.distance === 0 && currentVelocity < 0) {
        // Precision Dial Pan Weight pass: same hard-stop this boundary
        // check always applied -- kill velocity outright rather than let
        // it decay, so bottoming out at distance 0 doesn't leave a
        // lingering phantom push. Now has to zero every underlying channel
        // (not just the computed total below) so a still-decaying
        // wheelVelocity/appliedWheelVelocity can't reawaken the blocked
        // motion a few frames later once distance is no longer pinned at
        // exactly 0.
        movement.wheelVelocity = 0;
        movement.appliedWheelVelocity = 0;
        movement.touchVelocity = 0;
      } else {
        // Stage 1: wheel's own target/force layer decays via its own
        // dedicated CAMERA_PAN_WHEEL_FRICTION (see that constant's own
        // comment for why this is now separate from touch's) -- the same
        // decay behavior wheel always had, just no longer sharing the
        // constant touch also uses.
        movement.wheelVelocity *= CAMERA_PAN_WHEEL_FRICTION;
        // Stage 2: applied wheel velocity eases toward the (just-decayed)
        // target every frame -- the new acceleration-limiting step. See
        // CAMERA_PAN_WHEEL_ACCEL_EASE's own comment for the rate and why.
        movement.appliedWheelVelocity +=
          (movement.wheelVelocity - movement.appliedWheelVelocity) *
          CAMERA_PAN_WHEEL_ACCEL_EASE;
        // Touch keeps its original single-stage direct decay, byte-
        // identical to what movement.velocity's own decay used to do when
        // touch was writing into that same shared field.
        movement.touchVelocity *= friction;
      }

      // Kept in sync purely for downstream readers that only ever expect
      // "the current applied velocity" (its sign for movement.direction
      // above, and any future consumer) -- not itself fed back into next
      // frame's math; the two channels above are the actual state.
      movement.velocity = currentVelocity;

      // Archive touch-camera upgrade (vertical pan) + Desktop Archive Zoom
      // Polish pass: the Y counterpart to the X block above -- same
      // canMove gate, same scale-invariant division, same friction.
      // movement.touchVelocityY is no longer touch-exclusive despite its
      // name (kept unrenamed to avoid a disruptive rename across every
      // existing call site/comment that already references it) -- desktop
      // wheel/trackpad input now also writes into this SAME channel, via
      // addWheelPanVelocityY (see its own comment, next to
      // addTouchPanVelocityY below, for why sharing one channel rather
      // than duplicating a parallel wheel-only field is the right call
      // here). Both sources land in the identical downstream gate below
      // (freePanYActivation, derived from CAMERA_FREE_PAN_Y_ACTIVATION_
      // SCALE/FULL_SCALE), so desktop now respects the exact same
      // approved zoom-level thresholds mobile already does, with no new
      // gating logic of any kind.
      const currentVelocityY = canMove ? movement.touchVelocityY : 0;
      const worldDeltaY =
        effectiveScale > 0
          ? currentVelocityY / effectiveScale
          : currentVelocityY;

      // Vertical bounds, derived from real generated geometry rather than
      // a guessed pixel constant: DAPC's own vertical-composition
      // contract (see getVerticalScaleCompensation's own comment)
      // guarantees the generated track's natural (scale = 1) height
      // equals openingHeight exactly, so at this frame's effective scale
      // the track overflows the opening by openingHeight * (scale - 1)
      // total, split evenly above/below -- the identical quantity
      // applyZoomAnchor's own Y-anchor bound already derives, reusing
      // CAMERA_VERTICAL_ANCHOR_REACH's same reserved margin rather than a
      // second constant. Collapses smoothly to 0 the moment the track no
      // longer overflows the opening (scale at or below neutral), and is
      // re-derived fresh every frame from THIS frame's own scale, so a
      // live zoom change shrinks/grows the available travel continuously
      // with nothing to snap back from.
      //
      // viewportPanYRef (the zoom-anchor correction) and this free-pan
      // term are two independent additive components of the same final
      // trackY (see applyTransform's own comment) drawing from that same
      // overflow budget -- reserving only whatever budget isn't already
      // spent by viewportPanYRef's own current value guarantees the two
      // can never combine to push either edge past the true derived
      // boundary, without merging them into one shared bound.
      const openingHeightForVerticalBounds = openingGeometryRef.current.height;
      const verticalOverflowForFreePan = Math.max(
        0,
        openingHeightForVerticalBounds * (effectiveScale - 1),
      );
      // Default-overview Y lock: a 0-1 activation factor, re-derived
      // fresh from THIS frame's own live effectiveScale exactly like
      // every other quantity in this block -- 0 at/below
      // CAMERA_FREE_PAN_Y_ACTIVATION_SCALE (free Y pan fully locked),
      // ramping linearly to 1 by CAMERA_FREE_PAN_Y_FULL_SCALE (the
      // existing geometry-derived budget below fully available). Purely
      // a multiplier on the free-pan ceiling itself -- everything below
      // (the "remaining budget" subtraction against viewportPanYRef,
      // the hard-stop-at-bound velocity zeroing, the clamp) is
      // completely unchanged, and pinch's own Y-anchor correction never
      // reads this factor at all.
      const freePanYActivation = clamp(
        (effectiveScale - CAMERA_FREE_PAN_Y_ACTIVATION_SCALE) /
          (CAMERA_FREE_PAN_Y_FULL_SCALE - CAMERA_FREE_PAN_Y_ACTIVATION_SCALE),
        0,
        1,
      );
      const maxFreePanScreenY =
        (verticalOverflowForFreePan / 2) *
        CAMERA_VERTICAL_ANCHOR_REACH *
        freePanYActivation;
      const maxFreePanScreenYRemaining = Math.max(
        0,
        maxFreePanScreenY - Math.abs(viewportPanYRef.current),
      );
      const maxFreePanWorldY =
        effectiveScale > 0
          ? maxFreePanScreenYRemaining / effectiveScale
          : maxFreePanScreenYRemaining;

      const desiredDistanceY = movement.distanceY + worldDeltaY;
      const hitUpperBoundY =
        desiredDistanceY >= maxFreePanWorldY && currentVelocityY > 0;
      const hitLowerBoundY =
        desiredDistanceY <= -maxFreePanWorldY && currentVelocityY < 0;
      movement.distanceY = clamp(
        desiredDistanceY,
        -maxFreePanWorldY,
        maxFreePanWorldY,
      );

      if (hitUpperBoundY || hitLowerBoundY) {
        // Same hard-stop precedent as movement.distance's own boundary
        // check above: bottoming out against either derived edge kills
        // the velocity outright rather than letting it decay, so panning
        // back off the edge a few frames later never has a lingering
        // phantom push still baked in.
        movement.touchVelocityY = 0;
      } else {
        movement.touchVelocityY *= friction;
      }

      updateGalleryMotion();
      animationFrame = requestAnimationFrame(animateGallery);
    };

    // Precision Dial Pan Weight pass: wheel input now lands in its own
    // Stage-1 target accumulator (movement.wheelVelocity) rather than the
    // value that directly drives motion -- animateGallery's Stage 2 is
    // what actually eases that into applied velocity every frame. delta is
    // still expected to already be fully shaped (soft-saturated and
    // impulse-scaled) by the caller; this function itself applies no
    // multiplier of its own, same as before.
    const addWheelPanVelocity = (delta, cap = CAMERA_PAN_WHEEL_VELOCITY_CAP) => {
      if (!movement.enabled || focusedIdRef.current !== null) return;

      if (delta !== 0) {
        movement.direction = delta > 0 ? 1 : -1;
      }

      movement.wheelVelocity = clamp(movement.wheelVelocity + delta, -cap, cap);
    };

    // Precision Dial Pan Weight pass: touch-drag deliberately keeps the
    // OLD single-stage direct-injection model, writing straight into its
    // own movement.touchVelocity -- no Stage 2, no added latency. This is
    // the one and only change touch's own physics gets from this pass: a
    // dedicated field instead of a field shared with wheel, which has no
    // observable effect on touch's own behavior since it was already the
    // sole other writer of the old shared value between wheel events.
    const addTouchPanVelocity = (delta, cap = CAMERA_PAN_TOUCH_VELOCITY_CAP) => {
      if (!movement.enabled || focusedIdRef.current !== null) return;

      if (delta !== 0) {
        movement.direction = delta > 0 ? 1 : -1;
      }

      movement.touchVelocity = clamp(movement.touchVelocity + delta, -cap, cap);
    };

    // Archive touch-camera upgrade (vertical pan): the Y counterpart to
    // addTouchPanVelocity immediately above -- identical guard/clamp/cap
    // shape, same shared CAMERA_PAN_TOUCH_IMPULSE_COEFF/
    // CAMERA_PAN_TOUCH_VELOCITY_CAP constants at the call site (see
    // handleTouchMove's single-finger branch below), no new tuning.
    // Deliberately does NOT touch movement.direction: that field is an
    // X-axis-only semantic (browse direction, read solely by the
    // Relationship Engine's relationshipMotion placement -- see its own
    // usage above) and must stay governed exclusively by horizontal
    // velocity exactly as before this pass, so a vertical-only drag can
    // never flip it. No wheel/desktop code path calls this function --
    // grep confirms it is only ever called from handleTouchMove's
    // single-finger branch, same as addTouchPanVelocity itself.
    const addTouchPanVelocityY = (
      delta,
      cap = CAMERA_PAN_TOUCH_VELOCITY_CAP,
    ) => {
      if (!movement.enabled || focusedIdRef.current !== null) return;

      movement.touchVelocityY = clamp(
        movement.touchVelocityY + delta,
        -cap,
        cap,
      );
    };

    // Desktop Archive Zoom Polish pass: the wheel/trackpad counterpart to
    // addTouchPanVelocityY immediately above -- writes into the SAME
    // movement.touchVelocityY channel (not a separate wheel-only field)
    // deliberately: unlike X (which has a real, tuned "Weighted Dial Pan
    // Feel" two-stage model -- wheelVelocity easing into
    // appliedWheelVelocity -- because the horizontal browse mechanic is
    // this Archive's primary interaction), Y-pan on mobile has always
    // used this same plain single-stage decay, and the goal here is
    // specifically to give desktop the SAME feel mobile already has, not
    // a second, differently-tuned vertical mechanic. Sharing the channel
    // is what guarantees that: identical friction, identical bounds
    // (maxFreePanWorldY below), identical hard-stop-at-edge behavior,
    // for whichever input produced the velocity. Deliberately does NOT
    // touch movement.direction, same as addTouchPanVelocityY -- that
    // field is X-axis-only semantics (Relationship Engine placement) and
    // must stay governed exclusively by horizontal velocity.
    const addWheelPanVelocityY = (
      delta,
      cap = CAMERA_PAN_TOUCH_VELOCITY_CAP,
    ) => {
      if (!movement.enabled || focusedIdRef.current !== null) return;

      movement.touchVelocityY = clamp(
        movement.touchVelocityY + delta,
        -cap,
        cap,
      );
    };

    const handleWheel = (event) => {
      // Project Filter Composition: while the archive is showing
      // ProjectFilterRow instead of the normal composition, this global
      // window-level handler steps aside entirely -- no preventDefault,
      // no camera velocity -- so ProjectFilterRow's own small, locally-
      // scoped wheel handler (see its useWheelToHorizontalScroll) is the
      // only thing that responds to the gesture, rather than the two
      // fighting over the same wheel event. Reads a ref, not state, so
      // this effect's own dependency array ([gallerySessionId]) never
      // needs Project-filter state added to it.
      //
      // Mobile Archive Interaction Pass -- Stage 0 (Overlay Gesture
      // Guard): same early-return, now also while Menu or the mobile
      // Search/discovery overlay is open (isOverlayActiveRef) -- the
      // Archive must not respond to input happening underneath either
      // overlay. See isOverlayActiveRef's own comment for why this is a
      // dedicated new signal rather than reusing isIndexDrawerOpen.
      if (isProjectFilterActiveRef.current || isOverlayActiveRef.current) {
        return;
      }

      // preventDefault unconditionally, before branching -- this is what
      // stops the browser's own native page-zoom, which Chrome/Firefox/
      // Safari all trigger from a ctrlKey wheel event (see below) exactly
      // as they would from an actual Ctrl+scroll.
      event.preventDefault();

      // Camera Feel pass: normalize deltaMode once, up front, so every
      // branch below reads pixel-equivalent values regardless of what this
      // particular browser/OS/input-driver combination actually reported
      // -- see normalizeWheelAxisDelta's own comment.
      const deltaY = normalizeWheelAxisDelta(
        event.deltaY,
        event.deltaMode,
        window.innerHeight,
      );
      const deltaX = normalizeWheelAxisDelta(
        event.deltaX,
        event.deltaMode,
        window.innerWidth,
      );

      // Browsers report a trackpad pinch gesture as a wheel event with
      // ctrlKey set to true (a deliberate synthesized signal, the same one
      // browsers use internally to distinguish "the user is pinch-zooming"
      // from "the user is two-finger-scrolling") -- so this one check
      // covers both real Ctrl+wheel and a natural trackpad pinch, with no
      // separate gesture-detection logic of its own. event.clientX/clientY
      // is the cursor's actual screen position at the moment of this
      // gesture -- the exact point the per-frame zoom-ease step (see
      // updateGalleryMotion) will keep visually anchored, on BOTH axes as
      // of the True 2D Cursor Zoom pass (previously X only).
      if (event.ctrlKey) {
        // Desktop Zoom + Motion Polish pass: clamp this one event's own
        // magnitude to CAMERA_ZOOM_WHEEL_STEP_MAX (see that constant's own
        // comment for why a discrete wheel notch needs this and trackpad
        // pinch normally never engages it) before handleZoomStep ever sees
        // it -- clamp(..., -MAX, MAX) rather than a one-sided cap so a fast
        // zoom-out notch (positive deltaY) is bounded exactly as
        // symmetrically as a fast zoom-in one. Camera Feel pass: this now
        // nudges targetScaleRef, not viewportScaleRef directly -- the
        // per-frame ease step is what actually moves the visible scale
        // (and re-anchors every frame it does), turning what used to be an
        // instant per-event snap into one continuous glide.
        const rawDelta = -deltaY * CAMERA_ZOOM_WHEEL_SENSITIVITY;
        handleZoomStep(
          clamp(rawDelta, -CAMERA_ZOOM_WHEEL_STEP_MAX, CAMERA_ZOOM_WHEEL_STEP_MAX),
          event.clientX,
          event.clientY,
        );
        return;
      }

      // Weighted Dial Pan Feel pass: raw (deltaMode-normalized) delta goes
      // through the soft-saturation curve first (see softenWheelPanDelta),
      // THEN gets scaled into a velocity contribution by the wheel-side
      // coefficient, THEN clamped to the wheel-side cap -- see
      // CAMERA_PAN_WHEEL_SATURATION_PX/CAMERA_PAN_WHEEL_IMPULSE_COEFF's
      // own comments for why each of these three numbers is what it is.
      addWheelPanVelocity(
        softenWheelPanDelta(deltaY + deltaX) * CAMERA_PAN_WHEEL_IMPULSE_COEFF,
        CAMERA_PAN_WHEEL_VELOCITY_CAP,
      );
      // Desktop Archive Zoom Polish pass: deltaY ALSO drives a second,
      // independent vertical contribution -- deliberately not removed
      // from the horizontal line above, since that combined deltaY+deltaX
      // horizontal-pan behavior is the existing, approved default-scale
      // interaction (critically, what lets a plain vertical mouse wheel,
      // which only ever reports deltaY and never deltaX, still pan the
      // Archive horizontally -- removing it would break that). deltaX is
      // deliberately excluded here: it is already a purely horizontal
      // input signal, same as mobile's own per-axis split (deltaX -> X,
      // deltaY -> Y, never combined) via addTouchPanVelocity/
      // addTouchPanVelocityY. At the default/overview scale this is a
      // no-op in practice: maxFreePanWorldY (see updateGalleryMotion)
      // evaluates to 0 below CAMERA_FREE_PAN_Y_ACTIVATION_SCALE, so
      // movement.distanceY stays clamped to exactly 0 regardless of any
      // accumulated velocity here -- vertical pan only ever becomes
      // visible once genuinely zoomed past that same approved threshold.
      addWheelPanVelocityY(
        -deltaY * CAMERA_PAN_WHEEL_IMPULSE_COEFF,
      );
    };

    // Mobile Baseline Pass -- Task 3: two small, stateless read-outs of a
    // native TouchList -- no camera/scale knowledge, just geometry. Pulled
    // out to their own named helpers (rather than inlined at each call
    // site) purely so handleTouchStart/handleTouchMove below read as
    // "get the distance, get the midpoint" instead of repeating the same
    // Math.hypot/averaging twice each.
    const getTouchDistance = (touches) =>
      Math.hypot(
        touches[0].clientX - touches[1].clientX,
        touches[0].clientY - touches[1].clientY,
      );
    const getTouchMidpointX = (touches) =>
      (touches[0].clientX + touches[1].clientX) / 2;
    // True 2D Cursor Zoom pass: Y counterpart, same shape as
    // getTouchMidpointX -- used only by pinch's own applyZoomAnchor call.
    const getTouchMidpointY = (touches) =>
      (touches[0].clientY + touches[1].clientY) / 2;

    const handleTouchStart = (event) => {
      // Project Filter Composition: same guard handleWheel/handleTouchMove
      // already have -- Stage 0 adds it HERE too (previously missing on
      // this one handler; harmless in practice since it only ever wrote
      // closure state and never called preventDefault, but every touch
      // handler now steps aside consistently rather than three of four
      // doing so). Overlay guard (Menu/mobile Search open) included for
      // the same reason -- see isOverlayActiveRef's own comment.
      if (isProjectFilterActiveRef.current || isOverlayActiveRef.current) {
        return;
      }

      // Mobile Baseline Pass -- Task 3: the moment a second finger lands,
      // pinchState is (re)initialized from the CURRENT two-finger
      // geometry. A second finger landing mid-gesture also means whatever
      // single-finger tap candidate was in progress is no longer a tap --
      // clear its tracking so a stray touchend later (see handleTouchEnd
      // below) can never mistake this for a completed single-finger
      // gesture.
      if (event.touches.length === 2) {
        // Mobile Archive Interaction Pass -- Stage 5: a second finger
        // landing is an unambiguous pinch-start -- dismiss any open
        // inspection card immediately rather than waiting for
        // handleTouchMove's own pinch branch to actually change scale, so
        // the card never lingers, even briefly, over a photo that's about
        // to be zoomed. inspectedItemIdRef (not the isInspected prop this
        // ref ultimately drives) is what this closure-scoped handler can
        // read without becoming a dependency of the effect itself -- see
        // its own declaration for why.
        if (inspectedItemIdRef.current !== null) {
          setInspectedItemId(null);
        }
        touchPoint = null;
        pinchState = {
          // Math.max(..., 1): guards the division in handleTouchMove below
          // against a zero/near-zero denominator on the (extremely rare,
          // but not impossible) frame where both touch points are
          // reported at nearly the same coordinate -- without this, that
          // single frame could divide by ~0 and hand viewportScaleRef a
          // NaN/Infinity delta, corrupting the camera for the rest of the
          // session until reload. 1px floor is far below any real pinch's
          // starting finger separation, so it has no effect on normal use.
          distance: Math.max(getTouchDistance(event.touches), 1),
          startScale: viewportScaleRef.current,
        };
        touchGestureStartPoint = null;
        touchTotalMovement = 0;
        return;
      }

      // Mobile Archive Interaction Pass -- Stage 0 correction: a pinch
      // ending because ONE of its two fingers lifts (not both) is a
      // touchend, not a touchstart -- per the DOM Touch Events spec,
      // touchstart only ever fires for a NEW touch point touching down,
      // never for one lifting. That transition is now handled by
      // handleTouchEnd below, which re-derives pinchState/touchPoint from
      // whatever touches actually remain rather than waiting for a fresh
      // touchstart that may never come. This branch therefore only ever
      // runs for a genuinely NEW single-finger touch sequence -- start
      // fresh tap-vs-drag tracking here alongside the existing pan
      // tracking.
      pinchState = null;
      const touch = event.touches[0];
      touchPoint = touch ? { x: touch.clientX, y: touch.clientY } : null;
      touchGestureStartPoint = touchPoint;
      touchGestureStartTime = performance.now();
      touchTotalMovement = 0;
    };

    const handleTouchMove = (event) => {
      // Project Filter Composition: same reasoning as handleWheel's own
      // guard immediately above -- native touch scrolling on
      // ProjectFilterRow's own overflow-x container already works with no
      // JS needed, so this global handler must not preventDefault/consume
      // the gesture out from under it.
      //
      // Mobile Archive Interaction Pass -- Stage 0 (Overlay Gesture
      // Guard): same early-return, now also while Menu or the mobile
      // Search/discovery overlay is open -- see isOverlayActiveRef's own
      // comment.
      if (isProjectFilterActiveRef.current || isOverlayActiveRef.current) {
        return;
      }

      // Mobile Baseline Pass -- Task 3: two fingers down and a live
      // pinchState (set by handleTouchStart above the instant the second
      // finger landed) means this frame is a pinch, not a pan -- branch
      // here and return before any of the single-finger pan logic below
      // ever runs, so a pinch never also accumulates gallery pan velocity
      // from whichever finger happens to be touches[0]. The desired scale
      // is computed directly from the fixed gesture-start distance/scale
      // in pinchState (not the previous frame's scale), so it tracks
      // finger separation exactly with no compounding drift.
      //
      // Camera Feel pass: this no longer goes through handleZoomStep (that
      // now only nudges targetScaleRef for the EASED wheel/button path --
      // see its own comment). A pinch is already a live,
      // continuously-updating direct-manipulation gesture firing on every
      // touchmove frame, tracking real finger separation 1:1 -- routing it
      // through the ease as well would add perceptible lag between finger
      // and image, which is exactly wrong for a gesture the visitor is
      // physically driving in real time. So this calls applyZoomAnchor
      // directly (the same exact anchor math the ease step uses, just
      // applied once per touchmove instead of once per animation frame)
      // and writes viewportScaleRef immediately -- byte-identical to this
      // gesture's behavior before this pass. targetScaleRef is kept in
      // lockstep with viewportScaleRef on every one of these frames too,
      // so there is no stale target left behind for the ease step to
      // "catch up" to (and produce a spurious glide) once the pinch ends.
      //
      // True 2D Cursor Zoom pass: now also passes the two fingers' own
      // midpointY, the same shared applyZoomAnchor call the desktop wheel
      // ease step uses -- true midpoint X+Y anchoring for pinch was
      // explicitly requested where it can be added safely, and this is
      // the same direct, un-eased, per-touchmove-frame call it already
      // was, just with one more argument. No new latency, no change to
      // when/how often this runs.
      if (event.touches.length === 2 && pinchState) {
        event.preventDefault();
        const distance = getTouchDistance(event.touches);
        const midpointX = getTouchMidpointX(event.touches);
        const midpointY = getTouchMidpointY(event.touches);
        const desiredScale = clamp(
          pinchState.startScale * (distance / pinchState.distance),
          CAMERA_ZOOM_MIN,
          CAMERA_ZOOM_MAX,
        );
        applyZoomAnchor(
          viewportScaleRef.current,
          desiredScale,
          midpointX,
          midpointY,
        );
        viewportScaleRef.current = desiredScale;
        targetScaleRef.current = desiredScale;
        return;
      }

      const touch = event.touches[0];
      if (!touch || !touchPoint) return;

      event.preventDefault();

      // Mobile Archive Interaction Pass -- Stage 5: pan-start dismissal --
      // the instant a single-finger move is actually being applied as
      // gallery pan (below), any open inspection card is dismissed. This
      // fires on every frame a pan is in progress, not just the first, but
      // setInspectedItemId is a no-op once the ref is already null (React
      // bails out on an identical value), so this is not a meaningfully
      // repeated write -- it just guarantees the very first real pan frame
      // clears it, whichever frame that turns out to be.
      if (inspectedItemIdRef.current !== null) {
        setInspectedItemId(null);
      }

      const deltaX = touchPoint.x - touch.clientX;
      const deltaY = touchPoint.y - touch.clientY;
      touchPoint = { x: touch.clientX, y: touch.clientY };
      // Mobile Archive Interaction Pass -- Stage 0: accumulates REAL
      // finger travel across every frame of this touch sequence, not just
      // this frame's own delta -- what handleTouchEnd below compares
      // against TAP_MOVEMENT_THRESHOLD_PX to decide whether the sequence
      // that's about to end was a tap or a drag. Math.hypot of the exact
      // same per-frame delta already being applied as pan velocity below,
      // so this never diverges from what the visitor's finger actually
      // did.
      touchTotalMovement += Math.hypot(deltaX, deltaY);
      // Weighted Dial Pan Feel pass: explicitly applies the exact prior
      // shared coefficient/cap (CAMERA_PAN_TOUCH_IMPULSE_COEFF = 0.16,
      // CAMERA_PAN_TOUCH_VELOCITY_CAP = 42) rather than the new wheel-side
      // defaults -- see that constant's own comment. Finger-drag stays
      // exactly as directly responsive as it already was; only the shared
      // friction decay tail (below, in animateGallery) is different now.
      //
      // Archive touch-camera upgrade (vertical pan): deltaX and deltaY
      // used to be summed into this ONE call, collapsing genuine vertical
      // finger travel into horizontal camera motion -- the confirmed root
      // cause of "vertical exploration is limited" from the completed
      // audit. Each axis now gets its own call into its own channel, same
      // coefficient/cap on both (no new tuning, parity first): a diagonal
      // drag naturally drives both at once since both calls fire from the
      // same touchmove frame off the same real deltaX/deltaY, a purely
      // horizontal drag leaves deltaY (and therefore the Y channel) at
      // exactly 0, and a purely vertical drag leaves deltaX (and the X
      // channel) at exactly 0.
      addTouchPanVelocity(
        deltaX * CAMERA_PAN_TOUCH_IMPULSE_COEFF,
        CAMERA_PAN_TOUCH_VELOCITY_CAP,
      );
      // Inverted at this single source point only (natural-drag
      // direction fix): swipe top->bottom should bring the Archive's own
      // top edge down, i.e. the camera should move opposite to the raw
      // finger delta on this axis -- so the sign flips here, before
      // deltaY ever reaches the Y impulse channel, and nothing downstream
      // (velocity cap, friction, bounds, transform) needs to know about it.
      addTouchPanVelocityY(
        -deltaY * CAMERA_PAN_TOUCH_IMPULSE_COEFF,
        CAMERA_PAN_TOUCH_VELOCITY_CAP,
      );
    };

    // Mobile Archive Interaction Pass -- Stage 0 (Gesture Correctness
    // Foundation): the load-bearing gap the investigation found -- no
    // touchend/touchcancel listener existed anywhere in this codebase, so
    // tap-vs-drag disambiguation relied entirely on the browser's own
    // undocumented synthetic-click heuristic. This is the anchor point for
    // that disambiguation, for the post-pinch stray-tap guard, and (in a
    // later stage) for touch inspection's own "was this a genuine tap"
    // signal.
    const handleTouchEnd = (event) => {
      // Same guards as every other touch handler above -- see their own
      // comments. While ProjectFilterRow or an overlay is active, this
      // handler must not suppress/consume anything either, so native
      // touch scrolling (ProjectFilterRow) or an overlay's own touch
      // handling is never interfered with.
      if (isProjectFilterActiveRef.current || isOverlayActiveRef.current) {
        return;
      }

      // event.touches (NOT event.changedTouches) is exactly the set of
      // touches still down AFTER this lift -- what decides whether this
      // was the pinch's last finger, its second-to-last, or an ordinary
      // single-finger release.
      const remainingTouches = event.touches;

      if (pinchState) {
        // A pinch is ending -- start the post-pinch cooldown (see
        // POST_PINCH_TAP_COOLDOWN_MS's own comment) so a stray click can't
        // fire on whatever image happens to sit under the lifting finger,
        // and clear pinch tracking. If exactly one finger remains, resume
        // single-finger pan tracking from THAT finger's current, real
        // position -- there is no pre-pinch touchPoint to fall back to
        // (it was cleared the instant this became a pinch, see
        // handleTouchStart's 2-finger branch), and extrapolating from a
        // stale position is exactly what would make the pinch-to-pan
        // handoff jump. This sequence is never a tap candidate -- it
        // included a pinch.
        pinchState = null;
        pinchCooldownUntil = performance.now() + POST_PINCH_TAP_COOLDOWN_MS;

        if (remainingTouches.length === 1) {
          const touch = remainingTouches[0];
          touchPoint = { x: touch.clientX, y: touch.clientY };
        } else {
          touchPoint = null;
        }
        touchGestureStartPoint = null;
        touchTotalMovement = 0;
        return;
      }

      if (remainingTouches.length > 0) {
        // A finger lifted but this wasn't a pinch and at least one finger
        // is still down -- nothing to evaluate as a tap yet; leave the
        // remaining finger's own pan tracking untouched.
        return;
      }

      // Genuine end of a single-finger touch sequence that was never part
      // of a pinch. A tap is recognized only when movement stayed under
      // the threshold, the sequence had a real start point (guards
      // against an already-invalidated sequence -- e.g. one that started
      // as a 2-finger touch and never got its own single-finger start),
      // it wasn't excessively long, and it isn't still inside the
      // post-pinch cooldown from a DIFFERENT very recent pinch on this
      // same continued interaction.
      const withinPostPinchCooldown = performance.now() < pinchCooldownUntil;
      const isGenuineTap =
        !withinPostPinchCooldown &&
        touchGestureStartPoint !== null &&
        touchTotalMovement <= TAP_MOVEMENT_THRESHOLD_PX &&
        performance.now() - touchGestureStartTime <= TAP_MAX_DURATION_MS;

      if (!isGenuineTap) {
        // This was a drag (or a stray post-pinch release) -- suppress the
        // browser's own synthetic click that would otherwise follow this
        // touchend, rather than relying on the browser's own tap-
        // suppression heuristic (unreliable here -- see
        // TAP_MOVEMENT_THRESHOLD_PX's own comment on why this is a
        // virtual, transform-driven world, not native-scrolled DOM).
        // preventDefault on touchend is what stops that synthetic click
        // from ever being dispatched.
        event.preventDefault();
      } else if (inspectedItemIdRef.current !== null) {
        // Mobile Archive Interaction Pass -- Stage 5: background-tap
        // dismissal. A genuine tap that DIDN'T land on any gallery tile --
        // empty gallery canvas, the zoom controls, anywhere else -- closes
        // an open inspection card. event.target is a TouchEvent's original
        // touch-start target (unlike a MouseEvent, it does not follow the
        // finger), which is exactly "where this tap actually began."
        // Tapping the tile that's already inspected, a different tile, or
        // the "View Project" control inside the inspected card's own
        // HoverOverlay all still land inside .gallery-image-wrapper, so
        // none of those are mistaken for a background tap here -- those
        // are handled by handleGalleryTileTap/the control's own onClick,
        // not here.
        const tappedGalleryTile = event.target?.closest?.(
          ".gallery-image-wrapper",
        );
        if (!tappedGalleryTile) {
          setInspectedItemId(null);
        }
      }

      touchPoint = null;
      touchGestureStartPoint = null;
      touchTotalMovement = 0;
    };

    // A touchcancel means the browser itself aborted this touch sequence
    // (an incoming system gesture, an OS alert, the tab losing visibility
    // mid-touch, etc.) -- no synthetic click follows a cancel, so there is
    // nothing to suppress; this only resets tracking to a clean slate so a
    // future touchstart never inherits stale state from an aborted
    // sequence.
    const handleTouchCancel = () => {
      pinchState = null;
      touchPoint = null;
      touchGestureStartPoint = null;
      touchTotalMovement = 0;
    };

    // Part 8 -- Resize/Orientation Hardening: regenerateGallery (bound to
    // window resize elsewhere) resets camera scale/pan refs to neutral, but
    // it has no access to this effect's own closure-scoped gesture-tracking
    // state (pinchState/touchPoint/touchGestureStartPoint/touchTotalMovement).
    // Without this, a resize or Safari dynamic-toolbar/orientation change
    // mid-gesture leaves that state referencing a camera position that no
    // longer exists, producing a stale-baseline jump on the next touchmove.
    // This handler clears exactly that gesture-tracking state (plus the new
    // free-Y-pan velocity, since a fresh gesture should start settled) so
    // the next touch begins clean from the just-reset camera. It does NOT
    // touch movement.touchVelocity (X) -- only the new Y channel, per spec.
    // Passive: it never calls preventDefault, matching touchstart/touchcancel.
    const handleGestureInvalidatingResize = () => {
      pinchState = null;
      touchPoint = null;
      touchGestureStartPoint = null;
      touchTotalMovement = 0;
      movement.touchVelocityY = 0;
    };

    updateGalleryMotion();
    animationFrame = requestAnimationFrame(animateGallery);

    window.addEventListener("wheel", handleWheel, { passive: false });
    window.addEventListener("touchstart", handleTouchStart, { passive: true });
    window.addEventListener("touchmove", handleTouchMove, { passive: false });
    // Mobile Archive Interaction Pass -- Stage 0: touchend must be
    // non-passive -- it conditionally calls event.preventDefault() above
    // to suppress the synthetic click that would otherwise follow a
    // drag/stray-post-pinch touchend. touchcancel never calls
    // preventDefault, so it stays passive like touchstart.
    window.addEventListener("touchend", handleTouchEnd, { passive: false });
    window.addEventListener("touchcancel", handleTouchCancel, {
      passive: true,
    });
    window.addEventListener("resize", handleGestureInvalidatingResize, {
      passive: true,
    });

    return () => {
      focusTimelineRef.current?.kill();
      cancelAnimationFrame(animationFrame);
      if (scrollIdleTimeout !== null) clearTimeout(scrollIdleTimeout);
      if (fieldSettleTimeout !== null) clearTimeout(fieldSettleTimeout);
      window.removeEventListener("wheel", handleWheel);
      window.removeEventListener("touchstart", handleTouchStart);
      window.removeEventListener("touchmove", handleTouchMove);
      window.removeEventListener("touchend", handleTouchEnd);
      window.removeEventListener("touchcancel", handleTouchCancel);
      window.removeEventListener("resize", handleGestureInvalidatingResize);
    };
    // Continuous-Effect Stability pass: depends on gallerySessionId
    // instead of galleryItems -- see that state's own declaration comment.
    // This is the actual fix for the confirmed diagnostic finding that
    // this effect (listeners + RAF loop) used to tear down and rebuild on
    // every ordinary gallery extension, not just on a genuine
    // regeneration.
  }, [gallerySessionId]);

  // TEMPORARY DIAGNOSTIC (extension-race verification pass, comment
  // updated for the Round G bounded-batch-cache refinement --
  // generatedBatchIndicesRef itself has been removed, see
  // highestGeneratedBatchIndexRef's own comment for why the race it
  // guarded against is now structurally impossible). Runs whenever the
  // bounded `galleryItems` state commits and scans for duplicate
  // item.id values within it -- O(currently-retained item count), not
  // O(total lifetime item count), since `galleryItems` itself has been
  // bounded since the prior pass. Kept as a cheap, genuine correctness
  // assertion for the batch-cache refactor too: a duplicate id here
  // would mean two different cached batches produced overlapping items,
  // which should also now be structurally impossible. Self-contained
  // and side-effect-free (console.warn only) -- safe to delete this
  // entire effect once both fixes are considered fully verified.
  useEffect(() => {
    const seenIds = new Set();
    for (const item of galleryItems) {
      if (seenIds.has(item.id)) {
        console.warn(
          "[gallery-extension-diagnostic] duplicate item.id present in committed galleryItems.",
          { id: item.id, batchIndex: item.batchIndex, galleryItemsLength: galleryItems.length, timestamp: performance.now() },
        );
      }
      seenIds.add(item.id);
    }
  }, [galleryItems]);

  // Perf: this used to be a plain `const` recomputed on every render of
  // this component -- including renders triggered by state that has
  // nothing to do with scroll position (hover, drawer, search, etc.) --
  // re-filtering the full, unboundedly growing galleryItems array each
  // time. Memoizing means the filter only re-runs when one of its actual
  // inputs (galleryItems, renderWindow, focusedId) changes, which is what
  // was already intended by "recomputed when the render window moves."
  // Same inputs, same output, same isItemInRenderWindow logic -- just no
  // longer redone on unrelated re-renders.
  // Archive zoom image-quality pass (launch blocker, Josh review): a
  // tile's `sizes` (getGalleryImageSizes above) describes only its
  // static, un-transformed CSS layout box -- the browser's native
  // srcset/sizes algorithm has no way to know the Archive camera later
  // renders that same box larger via `transform: scale(...)` (see
  // createGalleryRenderer's applyTransform/viewportScaleRef above), so a
  // zoomed-in tile keeps showing whatever candidate it fetched for its
  // neutral footprint, reading as blurry once genuinely magnified. This
  // effect does not touch the camera itself -- no camera math, zoom
  // limits/behavior, pan, or RAF-loop changes -- it only READS the
  // already-existing viewportScaleRef.current, the same live eased scale
  // the camera loop itself writes every frame. It does not touch
  // virtualization either: it only ever inspects
  // renderedGalleryItemsRef.current, the existing, already-virtualized
  // set the render loop maintains for its own purposes (see that ref's
  // own comment above) -- an item outside that set is left alone.
  //
  // On a coarse interval (ARCHIVE_ZOOM_QUALITY_POLL_MS -- independent of
  // the camera's own 60fps loop), for each currently-rendered tile this
  // computes the physical pixel width the camera's current scale plus
  // devicePixelRatio actually demand, and -- only if that exceeds the
  // largest `sizes` already promoted to for that tile this session
  // (promotedImageSizesRef, a high-water-mark that only ever grows) --
  // imperatively raises the `sizes` attribute on that tile's two
  // <picture><source> elements (galleryPictureElsRef, populated by the
  // ref callback on <picture> in the JSX below). Raising `sizes` is the
  // entire mechanism: it fetches nothing itself, it only tells the
  // browser's own native responsive-image algorithm that a larger box is
  // now in play. That algorithm's existing candidate list
  // (getArchiveOptimizedImageSrcSet, unchanged -- already 400/800/1200,
  // plus, for local assets, the true full-resolution original above
  // 1200px, see that function's own comment in imageOptimization.js)
  // does the rest: fetches the smallest still-sufficient candidate,
  // lets the browser cache it natively, and never re-fetches a smaller
  // one afterward -- exactly the "promote to the next existing tier,
  // never downgrade, rely on the browser cache" behavior this pass asks
  // for, with no manual fetching or caching code of any kind.
  //
  // A tile's INITIAL `sizes` (and therefore initial fetch/quality) is
  // completely unaffected: this effect only ever raises `sizes` above
  // its starting value, in response to genuine zoom, strictly after
  // mount -- never on first paint, and never for a tile outside the
  // current render window.
  useEffect(() => {
    const intervalId = window.setInterval(() => {
      const scale = viewportScaleRef.current || 1;
      const dpr = window.devicePixelRatio || 1;

      for (const item of renderedGalleryItemsRef.current) {
        const pictureEl = galleryPictureElsRef.current.get(item.id);
        if (!pictureEl) continue;

        const baseWidth = Number.parseFloat(getGalleryImageSizes(item.layout));
        const neededWidth = Math.ceil(baseWidth * scale * dpr);
        const currentPromoted =
          promotedImageSizesRef.current.get(item.id) || baseWidth;

        if (neededWidth > currentPromoted) {
          const sizesValue = `${neededWidth}px`;
          pictureEl.querySelectorAll("source").forEach((sourceEl) => {
            sourceEl.sizes = sizesValue;
          });
          promotedImageSizesRef.current.set(item.id, neededWidth);
        }
      }
    }, ARCHIVE_ZOOM_QUALITY_POLL_MS);

    return () => window.clearInterval(intervalId);
  }, []);

  const renderedGalleryItems = useMemo(
    () =>
      focusedId === null
        ? galleryItems.filter((item) => isItemInRenderWindow(item, renderWindow))
        : galleryItems,
    [galleryItems, renderWindow, focusedId],
  );

  if (galleryItems.length === 0) {
    return <div className="app-shell" />;
  }

  renderedGalleryItemsRef.current = renderedGalleryItems;

  // Relationship Mode Visibility Gate: evaluated once per render, not per
  // item -- shouldActivateRelationshipMode doesn't depend on which item is
  // being rendered, only on the current candidate list
  // (relatedArchiveNumbers, from the Relationship Engine via HoverOverlay,
  // untouched) and the current active gallery. Deliberately reads
  // galleryItems here, not renderedGalleryItems: "active gallery" means
  // whatever Search/Filter/mount/logo-click most recently generated (the
  // full current pool), not whichever slice happens to be inside the
  // virtualization render window at this exact scroll position -- a
  // visitor scrolling shouldn't flip Relationship Mode on or off on its
  // own. This is also precisely why Search, Filter, and any future Zoom
  // Mode need no special-casing here: each of those already only changes
  // galleryItems (via activeImagePoolRef/regenerateGallery -- see
  // applyMetadataQuery), so this gate automatically evaluates against
  // whichever of them is currently active without knowing any of them
  // exist.
  const activeGalleryArchiveNumbers = galleryItems
    .map((item) => item.archiveNumber)
    .filter(Boolean);
  // Mobile Baseline Pass -- Task 2: ANDed with isRelationshipEngineEnabled
  // as defense-in-depth (see that flag's own comment above) -- the primary
  // gate is HoverOverlay never querying the engine at all on a touch
  // device, but this ensures the dimming visual itself can never activate
  // on mobile either way. shouldActivateRelationshipMode itself is
  // untouched.
  const isRelationshipModeActive =
    isRelationshipEngineEnabled &&
    shouldActivateRelationshipMode(
      relatedArchiveNumbers,
      activeGalleryArchiveNumbers,
    );

  // Relationship Field Recede pass: the spatial origin variants (B/C) need
  // to know WHICH tile the visitor's cursor is still resting over when the
  // dwell commits -- reuses hoveredGalleryItemId as-is (the plain-image
  // hover ref this file already tracks via handleGalleryImageHoverStart/
  // End on every wrapper's own onMouseEnter/onMouseLeave, untouched by
  // this pass) rather than threading a new value through HoverOverlay's
  // callback, per the "don't couple these systems unless there's a
  // compelling reason" instruction. A theme's dwell only ever commits
  // while the cursor is still physically inside that same tile's wrapper
  // (leaving cancels the dwell -- HoverOverlay's own mechanism, untouched),
  // so hoveredGalleryItemId reliably names the committing tile at the
  // moment relatedArchiveNumbers actually changes. Computed only while
  // Relationship Mode is active -- zero cost on every ordinary render.
  const relationshipOriginItem = isRelationshipModeActive
    ? (renderedGalleryItems.find((item) => item.id === hoveredGalleryItemId) ??
      null)
    : null;
  const relationshipOriginLayout = relationshipOriginItem
    ? {
        cx:
          Number.parseFloat(relationshipOriginItem.layout.left) +
          Number.parseFloat(relationshipOriginItem.layout.width) / 2,
        cy:
          Number.parseFloat(relationshipOriginItem.layout.top) +
          Number.parseFloat(relationshipOriginItem.layout.height) / 2,
      }
    : null;

  return (
    <div className="app-shell">
      {/* Archive State Reset: key={headerResetKey} forces a full
          unmount/remount whenever the logo triggers resetArchiveState --
          the same "guarantee a clean slate" mechanism Router.jsx already
          uses (key={slug} on ProjectTemplate) for an equivalent problem.
          Header owns several pieces of state that are purely its own echo
          of the archive's browsing state (Filter drawer open/selected
          values, the Search input's committed-search echo) with no
          existing external reset hook; remounting resets all of it at
          once, with no new conditional logic inside Header.jsx itself.
          headerResetKey only ever changes inside resetArchiveState, so
          Header never remounts on an ordinary Search submit, Filter
          change, or Metadata click -- only on this canonical reset. */}
      <Header
        key={headerResetKey}
        projects={PROJECT_TITLES}
        themes={THEME_NAMES}
        years={YEAR_OPTIONS}
        types={PROJECT_TYPES}
        onFilterOpenChange={setIsIndexDrawerOpen}
        onFilterChange={handleFilterChange}
        onDrawerHeightChange={handleDrawerHeightChange}
        onHeaderHeightChange={handleHeaderHeightChange}
        onOverlayActiveChange={setIsOverlayActive}
        onLogoClick={handleLogoClick}
        onSearchSubmit={handleSearchSubmit}
        onSearchClear={handleSearchClear}
        pendingThemeFilterCommit={pendingThemeFilterCommit}
      />

      {/* Layout Bug Fix -- Gallery Shift on Filter Open: this container
          itself carries no drawer-driven style at all -- no transform, no
          margin, no size change. .site-header is position:fixed, so an
          open drawer growing the header never actually consumes any of
          this container's layout space; there is nothing here to push out
          of the way. The drawer's only influence on the gallery is
          entirely inside Camera -- viewportDrawerScaleRef, eased every
          frame toward whatever scale the drawer's real, currently
          measured height (indexDrawerHeightRef) requires, combined with
          the visitor's own zoom in getEffectiveScale
          (createGalleryRenderer) -- which reads as the composition
          zooming out slightly to make room, via the exact same
          scale/centering math the zoom controls already use, correct for
          the drawer closed, mid-open, showing its default row, or any
          category fully expanded, rather than any second positioning
          system. .scroll-container--drawer-open's opacity dim still
          applies alongside it, unrelated and untouched. */}
      <div
        className={`scroll-container${
          isIndexDrawerOpen ? " scroll-container--drawer-open" : ""
        }`}
        ref={scrollContainerRef}
      >
        <div className="sticky-wrapper">
          {/* OpeningViewport: the only element that owns the visible
              opening. It receives Application Layout's opening geometry
              directly -- marginTop positions it, height sizes it -- and its
              own overflow:hidden is the true clip boundary. It is never a
              transform target: Gallery Renderer continues writing only to
              .gallery-track below. */}
          <div
            className="opening-viewport"
            style={{
              marginTop: `${openingGeometry.top}px`,
              height: `${openingGeometry.height}px`,
            }}
          >
            <div
              className={`gallery-track${
                isGalleryTransitioning ? " is-regenerating" : ""
              }${isScrolling ? " is-scrolling" : ""}`}
              ref={trackRef}
              style={{
                // Bounded Runtime Field pass (Round G refinement): reads
                // frontierRightXRef.current (a scalar, maintained
                // alongside the bounded batch cache -- see that ref's
                // own comment), not the bounded `galleryItems` state --
                // this width has to keep representing the TRUE full
                // generated extent regardless of how much of that
                // extent is currently retained in state or cache, since
                // extendGalleryIfNeeded's own remainingTrack check
                // depends on it staying accurate.
                width: `${getGalleryTrackWidthFromFrontier(frontierRightXRef.current)}px`,
                // Project Filter Composition: hidden (never unmounted) while
                // ProjectFilterRow is what's showing instead -- trackRef
                // must stay pointed at the same, permanently-mounted DOM
                // node the Camera/GSAP quickSetter machinery above was
                // created against (see createGalleryRenderer's own
                // gsap.quickSetter(track, ...) calls); unmounting this div
                // here and remounting a fresh one later would silently
                // leave that machinery writing to a detached node forever.
                // display:none removes it from .opening-viewport's flex
                // layout and from view with no risk to that stability.
                display: isProjectFilterActive ? "none" : undefined,
              }}
            >
              {!isProjectFilterActive && (hasNoSearchResults ? (
                // Metadata Query Wiring: the only UI this commit adds
                // beyond the existing Search field/chip and Filter drawer.
                // Deliberately plain -- no redesign, no animation -- just a
                // placeholder covering the gallery area while the combined
                // Search+Filter query matches nothing. galleryItems itself
                // is left untouched (see applyMetadataQuery), so clearing
                // Search, changing Filter, or a fresh query that matches
                // again all just resume rendering renderedGalleryItems
                // below normally.
                <p
                  className="archive-empty-state"
                  style={{
                    width: "100%",
                    textAlign: "center",
                    padding: "6rem 1.5rem",
                    color: "#9d9d9d",
                    fontSize: "0.85rem",
                    letterSpacing: "0.04em",
                  }}
                >
                  No archive items match your search.
                </p>
              ) : (
                renderedGalleryItems.map((item) => {
              const dimensions = getImageDimensions(item.src);
              // Click is navigation, per the approved Project Template
              // architecture: an image that belongs to a Project always
              // routes to it, regardless of imageFocusEnabled. The
              // existing focus-overlay path below is left exactly as it
              // was -- not removed, not built around -- for images that
              // aren't part of a Project yet, until hover/click are
              // properly separated as their own later task.
              const isProjectLinked = Boolean(item.project);
              const isInteractive = isProjectLinked || imageFocusEnabled;
              // Final Mobile Interaction Model pass: the same
              // Thumbnail-tier formula handleGalleryTileTap already uses,
              // reused here (not re-derived) so both places agree on what
              // "this tile's own size" means. Its only remaining jobs: (1)
              // HoverOverlay's own reduced thumbnail-inspected padding
              // (isThumbnailTier prop below), (2) whether a non-Project
              // tile becomes a selection surface at all
              // (handleGalleryTileTap's own early-return branch), and,
              // as of the Single Presentation Authority pass, (3)
              // whether View Project renders at all (see this same prop
              // passed to HoverOverlay below, and that component's own
              // render condition). It still never decides which
              // navigation path a Project-linked tile gets -- that's
              // uniform across tiers, see handleGalleryTileTap's own top
              // comment. Only touch-device tiles need this at all: on
              // desktop, onEnterProject/isThumbnailTier are never read by
              // anything meaningful (isInspected is always false there,
              // see HoverOverlay's own guard), so computing it here has
              // no desktop-visible effect either way -- kept simple by
              // not special-casing isTouchDevice explicitly. A prior pass
              // computed a second, independent width/height variable
              // here (isTooSmallForViewProject, at its own 120x72
              // thresholds) specifically for the View Project decision --
              // removed, see this constant's own MOBILE_SELECTABLE_TILE_
              // MIN_WIDTH_PX/_HEIGHT_PX declaration comment above for why
              // a second threshold was the wrong fix and what replaced
              // it (redesigned typography, not a second cutoff).
              const isThumbnailTier =
                Number.parseFloat(item.layout.width) <
                  MOBILE_SELECTABLE_TILE_MIN_WIDTH_PX ||
                Number.parseFloat(item.layout.height) <
                  MOBILE_SELECTABLE_TILE_MIN_HEIGHT_PX;
              // Relationship Visualization (Commit 4), corrected by the
              // state-management bug fix, and now gated by the
              // Relationship Mode Visibility Gate above: consumes only
              // relatedArchiveNumbers and isRelationshipModeActive -- no
              // new matching here, just a membership check against state
              // that's already computed. Relationship Mode is active only
              // when isRelationshipModeActive says so -- i.e. at least two
              // of the current candidate archive numbers are actually
              // present in the active gallery (see
              // relationshipModeEvaluator.js) -- not merely whenever
              // relatedArchiveNumbers is non-empty. A lone match (one
              // visible related image, or matches that exist in the
              // archive but aren't part of the currently active
              // gallery) leaves the interface exactly as it was, per the
              // Relationship Mode Visibility Gate's own design intent.
              // Plain image hover still has no effect here either way: it
              // only ever reveals the HoverOverlay card (pure CSS), never
              // dims anything on its own. When Relationship Mode is
              // active, everything is dimmed unless its archiveNumber is
              // in relatedArchiveNumbers -- there is no "hovered item"
              // exclusion because the hovered image itself isn't
              // guaranteed to be the one currently reporting
              // relatedArchiveNumbers (a theme inside any card can be
              // hovered), so membership in relatedArchiveNumbers is the
              // only test.
              const isDimmed =
                isRelationshipModeActive &&
                !(
                  item.archiveNumber &&
                  relatedArchiveNumbers.includes(item.archiveNumber)
                );
              // Relationship Field Recede pass: computed unconditionally
              // (cheap, deterministic) but only ever has a visible effect
              // on a tile that's actually isDimmed this render -- see
              // .gallery-image--dimmed's own transition-delay in
              // styles.css, which is the only rule that reads this custom
              // property. Related tiles and any tile outside Relationship
              // Mode carry the property but never consume it.
              const relationshipRecedeDelayMs = getRelationshipRecedeDelayMs(
                item,
                relationshipOriginLayout,
              );

              return (
                <button
                  key={item.id}
                  ref={(node) => {
                    // Registry ownership fix: register/deregister with the
                    // persistent wrapperRegistryRef Map directly on
                    // mount/unmount -- see that ref's own comment. This is
                    // the only place anything writes to that Map.
                    if (node) {
                      wrapperRegistryRef.current.set(item.id, node);
                    } else {
                      wrapperRegistryRef.current.delete(item.id);
                    }
                  }}
                  type="button"
                  data-image-id={item.id}
                  data-batch-index={item.batchIndex}
                  data-module-index={item.moduleIndex}
                  data-pattern-index={item.patternIndex}
                  className={`gallery-image-wrapper${
                    isInteractive ? "" : " gallery-image-wrapper--disabled"
                  }${
                    // Mobile Archive Interaction Pass -- Stage 5: the one
                    // class the JS-driven touch inspection state adds --
                    // purely presentational (see the matching
                    // :not(.is-scrolling) .gallery-image-wrapper--inspected
                    // rule in styles.css, mirroring the existing plain
                    // :hover rule above it), never set on a non-touch
                    // device since inspectedItemId itself is only ever
                    // written by the touch-only handleGalleryTileTap below.
                    isTouchDevice && inspectedItemId === item.id
                      ? " gallery-image-wrapper--inspected"
                      : ""
                  }`}
                  onClick={
                    // Mobile Archive Interaction Pass -- Stage 5: on a
                    // TOUCH CAPABILITY device, every tile's tap (Project-
                    // linked or not) goes through handleGalleryTileTap
                    // first -- inspect/dismiss, never an immediate
                    // navigation -- per the approved hybrid design (see
                    // that handler's own comment). This click only ever
                    // fires from a genuine tap to begin with: Stage 0's
                    // handleTouchEnd suppresses the synthetic click for
                    // anything that wasn't one. Desktop's own click
                    // behavior (below) is completely unchanged.
                    isTouchDevice
                      ? () => handleGalleryTileTap(item)
                      : isProjectLinked
                        ? () => {
                            // Site-wide fade transition system: see
                            // isEnteringProject's own comment above. Guarded
                            // against re-entry so a second click during the
                            // fade (or on a different tile) can't stack a
                            // second timeout/navigation on top of the first.
                            if (isEnteringProject) return;
                            setIsEnteringProject(true);
                            enterProjectTimeoutRef.current = window.setTimeout(
                              () => {
                                navigate(
                                  `/projects/${item.project}?image=${item.archiveNumber}`,
                                );
                              },
                              GALLERY_FADE_MS,
                            );
                          }
                        : imageFocusEnabled
                          ? () => handleImageClick(item.id)
                          : undefined
                  }
                  onMouseEnter={() => handleGalleryImageHoverStart(item.id)}
                  onMouseLeave={handleGalleryImageHoverEnd}
                  aria-label={
                    isProjectLinked
                      ? `View project: ${item.alt}`
                      : imageFocusEnabled
                        ? `Focus ${item.alt}`
                        : item.alt
                  }
                  aria-pressed={
                    !isProjectLinked && imageFocusEnabled
                      ? focusedId === item.id
                      : undefined
                  }
                  // Mobile Archive Interaction Pass -- Stage 5: exposes
                  // this tile's own inspected/dismissed state to assistive
                  // tech on touch devices, mirroring aria-pressed's own
                  // "only set this attribute when it's actually meaningful
                  // for this tile" pattern immediately above -- undefined
                  // (i.e. the attribute is simply absent) on every desktop
                  // tile, exactly as before this stage.
                  aria-expanded={
                    isTouchDevice ? inspectedItemId === item.id : undefined
                  }
                  tabIndex={isInteractive ? 0 : -1}
                  style={{
                    width: item.layout.width,
                    height: item.layout.height,
                    left: item.layout.left,
                    top: item.layout.top,
                    zIndex: item.layout.zIndex,
                    // Relationship Field Recede pass: read by
                    // .gallery-image--dimmed's transition-delay in
                    // styles.css only. A plain CSS custom property, not a
                    // timer -- see getRelationshipRecedeDelayMs's own
                    // comment for why this is the whole mechanism.
                    "--relationship-recede-delay": `${relationshipRecedeDelayMs}ms`,
                  }}
                >
                  <picture
                    ref={(el) => {
                      // Archive zoom image-quality pass: registers this
                      // tile's <picture> so the polling effect above can
                      // later raise its <source>s' `sizes` in response to
                      // camera zoom -- see that effect's own comment.
                      // Purely a lookup handle; does not affect layout,
                      // paint, or any existing behavior on its own.
                      if (el) galleryPictureElsRef.current.set(item.id, el);
                      else galleryPictureElsRef.current.delete(item.id);
                    }}
                  >
                    <source
                      type="image/webp"
                      srcSet={getArchiveOptimizedImageSrcSet(item.src, "webp")}
                      sizes={getGalleryImageSizes(item.layout)}
                    />
                    <source
                      type="image/jpeg"
                      srcSet={getArchiveOptimizedImageSrcSet(item.src, "jpg")}
                      sizes={getGalleryImageSizes(item.layout)}
                    />
                    <img
                      src={getArchiveOptimizedImageSrc(item.src)}
                      alt={item.alt}
                      className={`gallery-image${
                        isDimmed ? " gallery-image--dimmed" : ""
                      }`}
                      width={dimensions.width}
                      height={dimensions.height}
                      loading={shouldEagerLoadImage(item) ? "eager" : "lazy"}
                      fetchpriority={
                        shouldEagerLoadImage(item) ? "high" : "auto"
                      }
                      decoding="async"
                    />
                  </picture>
                  {/* Hover Overlay -- presentation only. Metadata now comes
                      directly from the Archive Item itself (item.themes /
                      item.theme / item.archiveNumber, carried
                      through by createGalleryBatch above from
                      mockArchiveItems.js -- see the Prototype Data Contract
                      comment there); no hardcoded literals remain.
                      HoverOverlay's themes prop wiring fix: prefer the
                      richer plural item.themes (2-3 entries per the
                      Commit 3.5 mock data) whenever it's present and
                      non-empty; only fall back to wrapping the legacy
                      singular item.theme in a one-element array when
                      item.themes is missing/empty. theme itself is
                      untouched and still exists on the Archive Item
                      contract, so this stays backward compatible with any
                      record that only ever sets the singular field.
                      HoverOverlay itself is unchanged -- both paths hand it
                      the same array shape it always accepted. Items with no
                      matching Archive Item simply pass null/[];
                      HoverOverlay's own existing empty-state checks already
                      handle that, same as before. Purely additive: an
                      absolutely-positioned child, so it cannot affect this
                      wrapper's own box, Masonry's
                      layout.width/height/left/top above, or any sibling
                      wrapper. itemId + generation are only a stable seed
                      for HoverOverlay's own per-item theme shuffle --
                      see galleryGenerationRef's comment above.
                      onRelatedArchiveNumbersChange: moved off image hover
                      onto individual theme hover in an earlier commit --
                      HoverOverlay itself decides when to call this, per
                      metadata item, and no longer needs to know whether
                      this specific image is hovered to do so (the
                      isHovered prop it used to take is gone). This
                      component still just receives the reported Archive
                      Numbers into relatedArchiveNumbers, same as before.
                      State-management bug fix: isDimmed below reads
                      isRelationshipModeActive (derived from
                      relatedArchiveNumbers via the Relationship Mode
                      Visibility Gate), never hoveredGalleryItemId -- see
                      the Relationship Highlight Pipeline comment near
                      hoveredGalleryItemId's declaration above and the
                      isDimmed comment below for why. Plain image hover
                      here only ever reveals this card; it has no bearing
                      on dimming either way.
                      onMetadataCommit (Hover/Click separation): a Theme
                      click inside HoverOverlay calls this straight
                      through to handleMetadataFilterCommit above, which
                      itself is a thin wrapper around the existing
                      handleFilterChange -- the exact same Metadata Query
                      pipeline Search and Filter already share. This
                      wrapper button's own onClick (navigate/focus, above)
                      never fires for these clicks: HoverOverlay calls
                      event.stopPropagation() before invoking this, since
                      the theme elements are DOM descendants of this
                      button. */}
                  <HoverOverlay
                    archiveNumber={item.archiveNumber}
                    themes={
                      item.themes?.length
                        ? item.themes
                        : item.theme
                          ? [item.theme]
                          : []
                    }
                    itemId={item.id}
                    generation={galleryGenerationRef.current}
                    onRelatedArchiveNumbersChange={
                      handleRelatedArchiveNumbersChange
                    }
                    onThemeHoverIntentStart={handleThemeHoverIntentStart}
                    onMetadataCommit={handleMetadataFilterCommit}
                    relationshipEngineEnabled={isRelationshipEngineEnabled}
                    // Relationship Hover Intent pass: see this callback's
                    // own comment at its declaration -- the fire-time
                    // re-check HoverOverlay's dwell timer uses before
                    // actually committing a relationship activation.
                    isRelationshipActivationBlocked={
                      isRelationshipActivationBlocked
                    }
                    // Discovery Mask (the only editorial gate): carried
                    // straight through from the tile's own layout.discovery
                    // (see createGalleryBatch above). Discovery decides
                    // WHETHER metadata should appear; responsive typography
                    // in styles.css decides HOW LARGE it renders. Only
                    // genuine physical impossibility at the 9px font floor
                    // ever prevents a Discovery tile from showing a theme --
                    // see HoverOverlay's own comment.
                    discovery={item.layout.discovery}
                    // Mobile Lexicon Removal pass: Josh explicitly asked
                    // for Lexicon/theme hashtags to never render on the
                    // mobile Archive -- not on Tiny, Medium, or Large/
                    // selected tiles -- while leaving the data itself and
                    // desktop's own Lexicon hover/click-to-filter behavior
                    // completely untouched. !isTouchDevice mirrors
                    // relationshipEngineEnabled's own capability-gate
                    // pattern immediately above: true (render Themes,
                    // exactly as before) on every desktop/fine-pointer
                    // device, false on every touch device regardless of
                    // discovery/isInspected. This is belt-and-suspenders
                    // alongside styles.css's own fix to the plain :hover
                    // reveal rule (now scoped to (hover: hover) and
                    // (pointer: fine), see that rule's own comment) --
                    // between the two, Themes can neither become visible
                    // nor even be present in HoverOverlay's own rendered
                    // output on a touch device, under any state.
                    themesEnabled={!isTouchDevice}
                    // Mobile Archive Interaction Pass -- Stage 5: isInspected
                    // is this tile's own touch-driven visibility signal --
                    // the JS equivalent of the plain CSS :hover this same
                    // component already renders under on desktop (see
                    // styles.css's matching --inspected rule) -- always
                    // false on a non-touch device, since inspectedItemId
                    // itself is never written there. Passed down so
                    // HoverOverlay can decide, itself, whether it's
                    // currently meaningful to expose to assistive tech (its
                    // own aria-hidden) and whether to render the "View
                    // Project" control below -- this component still holds
                    // no state and performs no gesture logic of its own.
                    isInspected={isTouchDevice && inspectedItemId === item.id}
                    // Final Mobile Interaction Model pass: no longer
                    // decides View Project's render eligibility or which
                    // navigation path a Project-linked tile gets -- both
                    // are uniform across every tier now (see
                    // HoverOverlay.jsx's own render and
                    // handleGalleryTileTap's own top comment). What this
                    // still does: tells HoverOverlay whether to apply its
                    // own Thumbnail-only reduced safe-area padding (still
                    // needed -- small tiles still benefit from less
                    // padding eating into Archive Number/View Project's
                    // own usable interior). See isThumbnailTier's own
                    // declaration above for the shared formula.
                    isThumbnailTier={isThumbnailTier}
                    // Stage 5 (hybrid touch-inspection design): only
                    // Project-linked tiles get an onEnterProject callback at
                    // all -- undefined for every other tile, which is what
                    // tells HoverOverlay not to render View Project (see
                    // its own prop default/guard). Single Presentation
                    // Authority pass: every Project-linked tile that is
                    // ALSO not isThumbnailTier attempts to render it,
                    // inside .hover-overlay__project-stack; a
                    // Project-linked tile where isThumbnailTier is true
                    // renders Archive Number alone instead (see
                    // HoverOverlay.jsx's own render condition) -- the same
                    // prop passed above for padding is now the ONLY
                    // presentation cutoff for View Project too, not a
                    // second, independent width/height gate (a prior pass
                    // tried that, at 120x72 -- see
                    // MOBILE_SELECTABLE_TILE_MIN_WIDTH_PX's own
                    // declaration comment for why it was removed).
                    // handleProjectRowImageClick is the exact same
                    // fade-then-navigate function the Project Filter Row
                    // already calls -- reused verbatim, not a second
                    // "enter a project" implementation, and it's also what
                    // handleGalleryTileTap's own second-tap-anywhere branch
                    // calls now, so a tap on this control and a tap
                    // elsewhere on an already-inspected tile both resolve
                    // to the same navigation.
                    onEnterProject={
                      isProjectLinked
                        ? () => handleProjectRowImageClick(item)
                        : undefined
                    }
                  />
                </button>
              );
            })
              ))}
            </div>

            {/* Project Filter Composition: mounted only while the archive
                is filtered by Project -- see isProjectFilterActive above.
                A sibling of .gallery-track, never a child of it, so the
                Camera/GSAP machinery targeting trackRef (see the comment
                on .gallery-track's own style above) never touches this
                element, and this element's own isolated wheel/scroll
                handling never fights with that machinery's global window
                listeners (see the handleWheel/handleTouchMove guards
                above). Reuses the same "no results" placeholder as the
                normal composition's own hasNoSearchResults branch above,
                for the edge case where Project is combined with another
                filter/search term that leaves nothing matching. */}
            {isProjectFilterActive &&
              (hasNoSearchResults ? (
                <p
                  className="archive-empty-state"
                  style={{
                    width: "100%",
                    textAlign: "center",
                    padding: "6rem 1.5rem",
                    color: "#9d9d9d",
                    fontSize: "0.85rem",
                    letterSpacing: "0.04em",
                  }}
                >
                  No archive items match your search.
                </p>
              ) : (
                <ProjectFilterRow
                  items={projectFilterItems}
                  openingHeight={openingGeometry.height}
                  onSelectImage={handleProjectRowImageClick}
                />
              ))}
          </div>
        </div>
      </div>

      <div
        className="zoom-controls"
        aria-label="Zoom controls"
        ref={zoomControlsRef}
      >
        {/* Mobile Header/Search/Menu Refinement Pass -- Section 6: haptics
            on the zoom buttons are gated on isTouchDevice, exactly the same
            capability signal handleGalleryTileTap's own touch-only wiring
            above already uses -- "Do NOT apply haptics on desktop/mouse
            interaction" means these must stay silent for every mouse click
            on a non-touch device, regardless of viewport width. */}
        <button
          type="button"
          className="zoom-control"
          aria-label="Zoom out"
          onClick={() => {
            handleZoomStep(-CAMERA_ZOOM_STEP);
            if (isTouchDevice) hapticTap();
          }}
        >
          -
        </button>
        <button
          type="button"
          className="zoom-control"
          aria-label="Zoom in"
          onClick={() => {
            handleZoomStep(CAMERA_ZOOM_STEP);
            if (isTouchDevice) hapticTap();
          }}
        >
          +
        </button>
      </div>

      <button
        ref={overlayRef}
        type="button"
        className="gallery-overlay"
        onClick={handleExitFocus}
        aria-label="Close focused image"
      />

      {focusedImage?.tag && (
        <div className="focus-theme-title">{focusedImage.tag}</div>
      )}

      {focusedImage?.relatedImages.length > 0 && (
        <svg className="theme-connectors" aria-hidden="true">
          {focusedImage.relatedImages.map((item, index) => {
            const connector = getClusterConnector(item, index, focusedImage.rect);

            return (
              <g key={item.id}>
                <line
                  className="theme-connector-line"
                  x1={connector.x1}
                  y1={connector.y1}
                  x2={connector.x2}
                  y2={connector.y2}
                />
              </g>
            );
          })}
        </svg>
      )}

      {focusedImage && (
        <div ref={focusedCloneRef} className="focused-image-frame">
          {(() => {
            const dimensions = getImageDimensions(focusedImage.src);

            return (
          <picture>
            <source
              type="image/webp"
              srcSet={getArchiveOptimizedImageSrcSet(focusedImage.src, "webp")}
              sizes="90vw"
            />
            <source
              type="image/jpeg"
              srcSet={getArchiveOptimizedImageSrcSet(focusedImage.src, "jpg")}
              sizes="90vw"
            />
            <img
              src={getArchiveOptimizedImageSrc(focusedImage.src, 1200)}
              alt={focusedImage.alt}
              width={dimensions.width}
              height={dimensions.height}
              loading="eager"
              fetchpriority="high"
              decoding="async"
            />
          </picture>
            );
          })()}
        </div>
      )}

      {focusedImage?.relatedImages.map((item, index) => {
        const dimensions = getImageDimensions(item.src);

        return (
          <div
            key={item.id}
            className="focused-image-frame related-image-frame"
            data-left={item.rect.left}
            data-top={item.rect.top}
            data-width={item.rect.width}
            data-height={item.rect.height}
            data-cluster-scale={
              clusterPlacements[index % clusterPlacements.length].scale
            }
            onMouseEnter={handleRelatedImageEnter}
            onMouseLeave={handleRelatedImageLeave}
          >
            <picture>
              <source
                type="image/webp"
                srcSet={getArchiveOptimizedImageSrcSet(item.src, "webp")}
                sizes="30vw"
              />
              <source
                type="image/jpeg"
                srcSet={getArchiveOptimizedImageSrcSet(item.src, "jpg")}
                sizes="30vw"
              />
              <img
                src={getArchiveOptimizedImageSrc(item.src)}
                alt={item.alt}
                width={dimensions.width}
                height={dimensions.height}
                loading="lazy"
                decoding="async"
              />
            </picture>
          </div>
        );
      })}

      {/* Site-wide fade transition system: the entering-a-project veil (see
          isEnteringProject's own comment above). Reuses Header.jsx's own
          .page-transition-veil class as-is -- same fixed full-viewport
          cream surface, same opacity transition -- rather than defining a
          second, near-identical CSS rule here. Rendered unconditionally
          and normally fully transparent/non-interactive, exactly like
          Header's copy, so .is-opaque is always animating a real
          transition rather than an abrupt mount. */}
      <div
        className={`page-transition-veil${
          isEnteringProject ? " is-opaque" : ""
        }`}
        aria-hidden="true"
      />
    </div>
  );
}

export default App;
