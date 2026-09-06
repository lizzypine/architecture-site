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
  // "/practice/questions" (Practice Questions) is intentionally absent.
  // Per the current, explicit decision it will be a static editorial
  // page (no FAQ schema) added later as one more entry here once that
  // page component exists -- not part of Phase 1.
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
    "A later, separate metadata-only phase will inject <head> tags into " +
    "dist/index.html WITHOUT calling renderToString on App.jsx. This entry " +
    "is documentation only -- the runner never acts on it.",
});
