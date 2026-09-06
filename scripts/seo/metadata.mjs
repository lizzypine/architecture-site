// PHASE 2 -- centralized SEO metadata architecture. Single source of
// truth for <title>/meta description/canonical/Open Graph/Twitter Card
// values across every prerendered route, kept separate from both the
// route table (scripts/seo/routes.mjs, which only knows WHICH routes
// exist) and the runner (scripts/prerender.mjs, which only knows HOW to
// inject a rendered page and this module's markup into a template).
// Nothing here renders React or touches the filesystem -- pure string
// building, so it's readable and reviewable as one place rather than
// head logic scattered across page components.
//
// CONTENT SOURCE: every word of factual practice-positioning copy below
// (Miami-based, South Florida, the specific service/project types named,
// the "contextual, material-driven" design language) is drawn directly
// from Josh's "AEO answers" document -- edited for length and web
// readability, nothing added. Deliberately NOT included here, because
// Josh's document either didn't confirm it for public use or explicitly
// marked it absent: any named client/builder/institution (his document
// answers "N/A" for this), any award or publication, specific license
// numbers, and the wider secondary-market geography (Broward, Palm
// Beach, Central Florida, Tampa, Sarasota, Naples, etc. -- all real per
// his answers, but reserved for a later, larger content pass rather than
// crammed into a one-line meta description, which this phase's own
// instructions warn against: "do this naturally, do not keyword-stuff").
// See this phase's report for the full list of what was deliberately
// left out and why.

export const SITE_ORIGIN = "https://urbanumarchitecture.org";
export const SITE_NAME = "Urbānum";

// Real, existing brand asset (public/urbanum-logo.jpg) -- the sitewide
// fallback whenever a route has no more specific, legitimate image of
// its own. Never a placeholder or a stand-in for content that doesn't
// exist.
export const DEFAULT_OG_IMAGE_PATH = "/urbanum-logo.jpg";

export function toAbsoluteUrl(pathOrUrl) {
  if (!pathOrUrl) return null;
  if (/^https?:\/\//i.test(pathOrUrl)) return pathOrUrl;
  return `${SITE_ORIGIN}${pathOrUrl.startsWith("/") ? "" : "/"}${pathOrUrl}`;
}

function canonicalFor(urlPath) {
  return urlPath === "/" ? `${SITE_ORIGIN}/` : `${SITE_ORIGIN}${urlPath}`;
}

// Fixed-route metadata, keyed by urlPath -- including "/" itself, which
// prerender.mjs's writeHomepageMetadata() injects into dist/index.html's
// <head> WITHOUT ever calling renderToString on App.jsx or touching
// anything inside <body>. Every title/description here is finished,
// reviewable copy, not a placeholder.
export const FIXED_ROUTE_METADATA = {
  "/": {
    title: "Urbānum — Architecture Practice in Miami, FL",
    description:
      "Urbānum is a Miami-based architecture practice specializing in contextual residential design, historic preservation, and adaptive reuse across South Florida.",
    ogType: "website",
  },
  "/practice": {
    title: "Practice — Urbānum",
    description:
      "Urbānum practices contextual, material-driven architecture — residential design, historic preservation, and adaptive reuse work across South Florida.",
    ogType: "website",
  },
  "/contact": {
    title: "Contact — Urbānum",
    description:
      "Contact Urbānum, a Miami-based architecture practice serving clients across South Florida.",
    ogType: "website",
    // ContactPage.jsx's own CONTACT_IMAGE_SRC constant -- a real, always-
    // rendered asset, not CMS-dependent, so it's safe to reuse here
    // without a live Sanity fetch.
    ogImagePath: "/img/urbanum-office-exterior.jpg",
  },
  "/projects": {
    title: "Projects — Urbānum",
    description:
      "Selected residential, historic preservation, adaptive reuse, and cultural architecture projects by Urbānum, a Miami-based practice serving South Florida.",
    ogType: "website",
  },
  "/journal": {
    title: "Journal — Urbānum",
    description:
      "Notes on architecture and design from Urbānum, a Miami-based architecture practice serving South Florida.",
    ogType: "website",
  },
  // Phase 3 -- About the Practice (public page name; the route itself
  // stays "/practice/questions" -- see routes.mjs's own comment on why
  // the URL and the visible title deliberately don't match). Distinct
  // from "/practice"'s own description above rather than a near-
  // duplicate: that one summarizes what Urbānum practices, this one
  // describes the page itself as a direct-answer format, matching the
  // final, client-approved 9-question page (services/geography/
  // residential/preservation/approach) without repeating its wording.
  // No credentials claim here -- the page itself currently asks no
  // credentials question, pending verified entity/license wording (see
  // PracticeQuestionsPage.jsx's own comment). No em dash, no HNW/
  // internal-targeting language, and no unsupported claim in this
  // entry's title or description -- the same editorial rule as the
  // page's own Q&A copy.
  "/practice/questions": {
    title: "About the Practice | Urbānum",
    description:
      "Answers about Urbānum's architecture practice: services, service areas, residential work, historic preservation, and design approach.",
    ogType: "website",
  },
  // Utility Information Phase -- Accessibility, Copyright, and a link to
  // About the Practice. Sparse and factual by design, not a marketing
  // page.
  "/site-information": {
    title: "Site Information | Urbānum",
    description:
      "Accessibility, copyright, and additional information about the Urbānum website and architecture practice.",
    ogType: "website",
  },
};

function truncate(text, maxLength) {
  if (text.length <= maxLength) return text;
  const cut = text.slice(0, maxLength);
  const lastSpace = cut.lastIndexOf(" ");
  return `${cut.slice(0, lastSpace > 0 ? lastSpace : maxLength).trimEnd()}…`;
}

// Fallback tiers, each using ONLY fields the Sanity Project document
// actually has -- never inferring one field's presence from another,
// and never combining fields into a claim the CMS doesn't itself
// support (no "award-winning," no client names, no size/material
// specifics unless the document's own `description` field already says
// so in the editor's own words):
//   1. The Project's own `description` field, verbatim (truncated) --
//      this is the CMS editor's own words, not written by this script.
//   2. type + location, if both exist.
//   3. type alone.
//   4. location alone.
//   5. A bare, factual, non-specific fallback with no invented detail.
function buildProjectDescription(project) {
  const rawDescription =
    typeof project?.description === "string" ? project.description.trim() : "";
  if (rawDescription) {
    return truncate(rawDescription, 160);
  }

  const type =
    Array.isArray(project?.types) && project.types.length > 0 ? project.types[0] : null;
  const location =
    typeof project?.location === "string" && project.location.trim()
      ? project.location.trim()
      : null;

  if (type && location) {
    return `A ${type.toLowerCase()} project by ${SITE_NAME} in ${location}.`;
  }
  if (type) {
    return `A ${type.toLowerCase()} project by ${SITE_NAME}.`;
  }
  if (location) {
    return `An architecture project by ${SITE_NAME} in ${location}.`;
  }
  return `An architecture project by ${SITE_NAME}.`;
}

// `project` is exactly the object getProjectBySlug() already returns
// (title, slug, description, location, year, types, images, ...) -- the
// same shape ProjectTemplate.jsx renders from, not a separate query.
// `representativeImageSrc` is a pre-resolved optimized image path (or
// null/undefined), computed by the caller via the app's own
// resolveInitialImageId() + getOptimizedImageSrc() -- this module never
// makes its own image-selection decision, it only formats whatever the
// app's existing logic already picked (or falls back to the sitewide
// brand image if nothing was resolved).
export function buildProjectMetadata(project, representativeImageSrc) {
  const title = project?.title ? `${project.title} — ${SITE_NAME}` : `Project — ${SITE_NAME}`;

  return {
    title,
    description: buildProjectDescription(project),
    ogType: "article",
    ogImagePath: representativeImageSrc || undefined,
  };
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// The one function that ever writes tag markup, used identically for
// fixed routes, dynamic Project routes, and the head-only homepage case
// -- so the tag SET itself never has to be kept in sync across call
// sites. Returns a block starting with <title>...</title> (so callers
// can replace the pristine template's existing <title> tag with this
// whole block in one string substitution) followed by meta description,
// canonical link, Open Graph, and Twitter Card tags. No JSON-LD, no
// FAQ/sitemap/robots markup -- out of scope for this phase.
export function buildHeadMetadataHtml({ urlPath, title, description, ogType, ogImagePath }) {
  const canonical = canonicalFor(urlPath);
  const absoluteImage = toAbsoluteUrl(ogImagePath ?? DEFAULT_OG_IMAGE_PATH);

  const lines = [
    `<title>${escapeHtml(title)}</title>`,
    `<meta name="description" content="${escapeHtml(description)}" />`,
    `<link rel="canonical" href="${canonical}" />`,
    `<meta property="og:site_name" content="${escapeHtml(SITE_NAME)}" />`,
    `<meta property="og:type" content="${ogType}" />`,
    `<meta property="og:title" content="${escapeHtml(title)}" />`,
    `<meta property="og:description" content="${escapeHtml(description)}" />`,
    `<meta property="og:url" content="${canonical}" />`,
  ];

  if (absoluteImage) {
    lines.push(`<meta property="og:image" content="${absoluteImage}" />`);
  }

  lines.push(
    `<meta name="twitter:card" content="${absoluteImage ? "summary_large_image" : "summary"}" />`,
    `<meta name="twitter:title" content="${escapeHtml(title)}" />`,
    `<meta name="twitter:description" content="${escapeHtml(description)}" />`,
  );

  if (absoluteImage) {
    lines.push(`<meta name="twitter:image" content="${absoluteImage}" />`);
  }

  return lines.join("\n    ");
}
