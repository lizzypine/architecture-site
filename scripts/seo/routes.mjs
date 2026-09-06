// PHASE 1 -- prerender route table. Kept separate from the runner
// (scripts/prerender.mjs) so "what gets prerendered" stays a short,
// readable list independent of "how prerendering happens."
//
// Three categories, per the approved Phase 1 scope:
//
//   FIXED_ROUTES  -- static content pages that already exist as real
//                    page components. One entry each, added by hand.
//
//   Project routes -- deliberately NOT listed here as data. They are
//                    discovered at run time from Sanity's own published
//                    Project documents (see buildProjectRoutes() in
//                    scripts/prerender.mjs, which calls the exact same
//                    getProjects()/loadProjects() every other component
//                    already uses) -- no slug, title, or any other
//                    Project fact is hardcoded anywhere in this file or
//                    the runner. Today's Sanity content is test/mock
//                    data; whatever is actually published is what gets
//                    discovered, and that's by design.
//
//   ARCHIVE_ROUTE -- "/" is a documented NON-route for this phase, not
//                    an oversight. Archive's DOM is procedural/
//                    randomized (Math.random()-driven composition) and
//                    reads window/document without guards outside
//                    effects -- confirmed unsafe for renderToString in
//                    the earlier feasibility audit, and explicitly
//                    locked besides. A later, separate metadata-only
//                    phase will inject <head> tags into the existing
//                    dist/index.html WITHOUT ever calling renderToString
//                    on App.jsx. Nothing in this file or the runner
//                    touches dist/index.html.

export const FIXED_ROUTES = [
  {
    urlPath: "/practice",
    outFile: "practice/index.html",
    componentPath: "/src/AboutPage.jsx",
  },
  {
    urlPath: "/contact",
    outFile: "contact/index.html",
    componentPath: "/src/ContactPage.jsx",
  },
  {
    urlPath: "/projects",
    outFile: "projects/index.html",
    componentPath: "/src/ProjectsPage.jsx",
  },
  {
    urlPath: "/journal",
    outFile: "journal/index.html",
    componentPath: "/src/JournalPage.jsx",
  },
  // Phase 3 -- publicly presented as "About the Practice" (its H1 and
  // <title>, see PracticeQuestionsPage.jsx / seo/metadata.mjs); the URL
  // stays "/practice/questions" by deliberate decision, not an
  // oversight -- the two are intentionally allowed to differ. A static
  // editorial page (no FAQ schema, no CMS content), prerendered exactly
  // like every other fixed route above via the same generic
  // FIXED_ROUTES loop in scripts/prerender.mjs -- no change to that
  // loop's own logic was needed for this. Deliberately NOT part of
  // Header's primary navigation -- see AboutPage.jsx's own history for
  // the direct Practice-page link that briefly existed here and was
  // removed by explicit instruction; this route's only crawlable path
  // in from the rest of the site is planned for a later, separate
  // secondary-utility layer (Accessibility/Copyright/Site Information),
  // not built in this phase.
  {
    urlPath: "/practice/questions",
    outFile: "practice/questions/index.html",
    componentPath: "/src/PracticeQuestionsPage.jsx",
  },
  // Utility Information Phase -- the canonical, crawlable /site-information
  // page (Accessibility + Copyright + the one sanctioned link into
  // /practice/questions, see SiteInformationPage.jsx's own header
  // comment). Prerendered exactly like every other fixed route above via
  // the same generic FIXED_ROUTES loop -- no change to that loop's own
  // logic was needed for this either. The one site-wide bottom-right
  // utility link that points here is mounted once in Router.jsx (not a
  // page component), so it is not itself part of any single fixed
  // route's own prerendered output -- see that file's own comment on why.
  {
    urlPath: "/site-information",
    outFile: "site-information/index.html",
    componentPath: "/src/SiteInformationPage.jsx",
  },
];

// The component used for every dynamically-discovered Project route.
// ProjectTemplate takes { slug, imageId } as props (see Router.jsx's own
// <ProjectTemplate key={slug} slug={slug} imageId={imageId} /> for the
// precedent) -- this script renders it directly, the same way it renders
// every other page directly, without importing or executing Router.jsx
// itself (Router.jsx reads window.location.search at render time, which
// is Router's own concern and is left completely untouched here).
export const PROJECT_TEMPLATE_COMPONENT_PATH = "/src/ProjectTemplate.jsx";
export const PROJECT_ROUTE_OUT_SUBDIR = "projects";

export const ARCHIVE_ROUTE = Object.freeze({
  urlPath: "/",
  bodyPrerendered: false,
  note:
    "Archive's DOM is procedural/randomized and stays entirely client-owned. " +
    "PHASE 2: prerender.mjs's writeHomepageMetadata() now injects <head> " +
    "metadata (see seo/metadata.mjs's FIXED_ROUTE_METADATA['/']) into " +
    "dist/index.html -- but ONLY <head>, verified by an explicit <body> " +
    "byte-equality check before the file is written. App.jsx is still " +
    "never imported or passed to renderToString anywhere in this pipeline. " +
    "This entry remains documentation of that boundary, not something the " +
    "runner reads.",
});
