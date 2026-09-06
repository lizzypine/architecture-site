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

// JSON-LD Structured Data Foundation pass: PROJECT_ROUTE_OUT_SUBDIR is
// the one existing source of truth for a Project route's URL shape
// (see scripts/seo/routes.mjs's own comment) -- reused here so a
// Project's JSON-LD @id/url is derived from the same constant
// prerender.mjs already uses to decide where that route's file is
// written, rather than re-hardcoding "/projects/" a second time.
import { PROJECT_ROUTE_OUT_SUBDIR } from "./routes.mjs";

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

  // Same absolute-URL treatment buildHeadMetadataHtml gives ogImagePath,
  // computed here too because the JSON-LD `image` field is a structured-
  // data property in its own right, not something read back out of the
  // og:image tag -- and, unlike ogImagePath below, it is never defaulted
  // to the sitewide brand logo when a Project has no resolvable image of
  // its own: DEFAULT_OG_IMAGE_PATH is a fallback for the Open Graph
  // preview concern only, not a real fact about this specific Project.
  const absoluteImage = representativeImageSrc ? toAbsoluteUrl(representativeImageSrc) : null;

  return {
    title,
    description: buildProjectDescription(project),
    ogType: "article",
    ogImagePath: representativeImageSrc || undefined,
    projectJsonLd: buildProjectJsonLdNode(project, absoluteImage),
  };
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// -----------------------------------------------------------------------
// SEO PHASE -- Structured Data Foundation. Minimal JSON-LD, built ONLY
// from facts already established for this practice (see this pass's own
// report for the exact source of each field) -- no NCARB, no invented
// service claims, no geo/service-area invention beyond "Florida-based,"
// no ratings/reviews, no founding date, no social URLs (none confirmed
// to exist), no FAQ schema, and no address/phone -- neither is used
// verbatim as a static string anywhere in this codebase (the Contact
// page's address/phone live only in Sanity CMS content, in a different
// format than specified, with no confirmed-live production source to
// check them against), so both are left out entirely rather than
// guessed at.
//
// Stable @id values below let WebSite/Organization/Person reference each
// other instead of duplicating disconnected objects -- the same
// "reference, don't repeat" graph convention JSON-LD is designed for.
// -----------------------------------------------------------------------
const WEBSITE_ID = `${SITE_ORIGIN}/#website`;
const ORGANIZATION_ID = `${SITE_ORIGIN}/#organization`;
const PRINCIPAL_ID = `${SITE_ORIGIN}/#principal`;

const ORGANIZATION_LEGAL_NAME = "URBANUM LLC";
const PRINCIPAL_NAME = "Joshua Sperduti-Figueroa";
const PRINCIPAL_DESIGNATION = "AIA";
const ORGANIZATION_DESCRIPTION = "Florida-based architecture practice";

// Sitewide entity graph -- present on every prerendered route (via
// buildHeadMetadataHtml below), not just the homepage, so the same
// stable @id set is available no matter which page a crawler lands on
// first. Organization is used rather than a LocalBusiness-family type
// (ProfessionalService/Architect/etc.) because those conventionally
// expect address/geo fields to be well-formed, and no address is
// included in this pass -- see the comment above.
function buildSiteJsonLdGraph() {
  return [
    {
      "@type": "WebSite",
      "@id": WEBSITE_ID,
      url: SITE_ORIGIN,
      name: SITE_NAME,
      publisher: { "@id": ORGANIZATION_ID },
    },
    {
      "@type": "Organization",
      "@id": ORGANIZATION_ID,
      name: SITE_NAME,
      legalName: ORGANIZATION_LEGAL_NAME,
      url: SITE_ORIGIN,
      description: ORGANIZATION_DESCRIPTION,
      founder: { "@id": PRINCIPAL_ID },
    },
    {
      "@type": "Person",
      "@id": PRINCIPAL_ID,
      name: PRINCIPAL_NAME,
      honorificSuffix: PRINCIPAL_DESIGNATION,
      jobTitle: "Principal Architect",
      worksFor: { "@id": ORGANIZATION_ID },
    },
  ];
}

// Project JSON-LD -- completely data-driven, exactly like
// buildProjectDescription() above: every field is read from the real
// object getProjectBySlug() returns, and a missing field is simply
// omitted from the node rather than defaulted or invented. Returns null
// when there's no project at all (an unresolved slug) or no slug to
// build a stable @id/url from, so callers can drop it from the graph
// entirely rather than emitting a placeholder node.
function buildProjectJsonLdNode(project, absoluteImage) {
  if (!project || !project.slug) return null;

  const url = `${SITE_ORIGIN}/${PROJECT_ROUTE_OUT_SUBDIR}/${project.slug}`;
  const node = {
    "@type": "CreativeWork",
    "@id": `${url}#project`,
    url,
    isPartOf: { "@id": WEBSITE_ID },
    creator: { "@id": ORGANIZATION_ID },
  };

  if (typeof project.title === "string" && project.title.trim()) {
    node.name = project.title.trim();
  }

  const description =
    typeof project.description === "string" ? project.description.trim() : "";
  if (description) {
    node.description = description;
  }

  if (typeof project.location === "string" && project.location.trim()) {
    node.contentLocation = { "@type": "Place", name: project.location.trim() };
  }

  if (project.year) {
    node.dateCreated = String(project.year);
  }

  if (Array.isArray(project.types) && project.types.filter(Boolean).length > 0) {
    node.keywords = project.types.filter(Boolean).join(", ");
  }

  if (absoluteImage) {
    node.image = absoluteImage;
  }

  return node;
}

// Serializes the graph as one <script type="application/ld+json">
// element. "<" is escaped to "\u003c" (valid inside a JSON string,
// invisible to any JSON.parse) so a value that happened to contain
// "</script>" could never prematurely close the tag -- standard
// practice for embedding JSON inside HTML, not specific to any value
// currently in this graph.
function buildJsonLdScriptTag(nodes) {
  const graph = { "@context": "https://schema.org", "@graph": nodes };
  const json = JSON.stringify(graph).replace(/</g, "\\u003c");
  return `<script type="application/ld+json">${json}</script>`;
}


// The one function that ever writes tag markup, used identically for
// fixed routes, dynamic Project routes, and the head-only homepage case
// -- so the tag SET itself never has to be kept in sync across call
// sites. Returns a block starting with <title>...</title> (so callers
// can replace the pristine template's existing <title> tag with this
// whole block in one string substitution) followed by meta description,
// canonical link, Open Graph, and Twitter Card tags. No JSON-LD, no
// FAQ/sitemap/robots markup -- out of scope for this phase.
export function buildHeadMetadataHtml({ urlPath, title, description, ogType, ogImagePath, projectJsonLd }) {
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

  // Structured Data Foundation: one script tag per route, carrying the
  // sitewide WebSite/Organization/Person graph plus (Project routes
  // only) this route's own data-driven Project node -- see
  // buildSiteJsonLdGraph()/buildProjectJsonLdNode() above. Placed inside
  // this same function, and inside the SAME marker-wrapped block
  // returned below, so it inherits the exact idempotent replace-on-
  // rerun behavior scripts/prerender.mjs's injectHeadMetadata() already
  // gives every other tag here -- no second document-head mechanism, no
  // separate marker pair, nothing new for that function to know about.
  const jsonLdNodes = buildSiteJsonLdGraph();
  if (projectJsonLd) {
    jsonLdNodes.push(projectJsonLd);
  }
  lines.push(buildJsonLdScriptTag(jsonLdNodes));

  // Wrapped in a pair of unique HTML comment markers so
  // scripts/prerender.mjs's injectHeadMetadata() can always find and
  // replace this ENTIRE block on any later run, not just the bare
  // <title> tag inside it -- see that function's own comment for the
  // canonical-tag-duplication bug this fixes. Purely additive: no tag,
  // value, or canonical strategy above this line changed.
  return [
    "<!-- urbanum-seo-metadata:start -->",
    ...lines,
    "<!-- urbanum-seo-metadata:end -->",
  ].join("\n    ");
}
