import { useEffect } from "react";
import App from "./App";
import AboutPage from "./AboutPage";
import ContactPage from "./ContactPage";
import ProjectsPage from "./ProjectsPage";
import JournalPage from "./JournalPage";
import PracticeQuestionsPage from "./PracticeQuestionsPage";
import SiteInformationPage from "./SiteInformationPage";
import ProjectTemplate from "./ProjectTemplate";
import { navigate, useCurrentPath } from "./navigation";

// Matches "/projects/:slug" and captures the slug -- the one dynamic
// segment this router needs. Deliberately a plain regex rather than a
// routing library: one dynamic pattern doesn't justify a dependency, and
// everything else here is still exact-match.
const PROJECT_ROUTE = /^\/projects\/([^/]+)$/;

// The entire routing surface this site needs right now: the gallery at
// "/", the Practice page (AboutPage.jsx) at "/practice", the Contact page
// at "/contact", the Projects index at "/projects", the dynamic Project
// Template at "/projects/:slug", and the Journal at "/journal". Not a
// general-purpose router -- just enough to pick one of a small number of
// top-level pages (or one dynamic template) based on the current path.
// Another static page later is one more path check here, not a new
// dependency -- Contact (Contact drawer -> Contact page milestone) is
// exactly that: one more check, mirroring About's own.
// Mobile Page-Spacing pass -- Contact initial-scroll fix: this hand-rolled
// router (see navigation.js's own top comment -- plain history.pushState +
// a manually dispatched popstate, no routing library) has never reset
// scroll position on navigation, on any route. pushState/popstate don't do
// this on their own -- every SPA router that appears to "just work" is
// actually doing this exact reset itself; this one never has. That's
// invisible on a page tall enough that whatever scrollY carried over from
// the previous page still lands somewhere plausible-looking, but Contact
// is this site's shortest routed page: arriving from a taller page (a
// Project, Journal, the Archive's own document-level scroll parent) can
// leave a scrollY beyond Contact's own max scroll range, which the browser
// then clamps to Contact's bottom -- reads as "loaded already scrolled
// down," heading cut off, exactly the reported symptom. Not layout shift,
// not autofocus (grepped this codebase -- neither exists here), not a
// Contact-specific height/overflow rule (.contact-page-layout/
// .contact-layout are plain top-aligned flow, not centered/clipped), and
// not a top-spacing issue (that's Task A, a separate and unrelated fix in
// styles.css) -- it is genuinely preserved scroll position across a
// client-side route change, with Contact simply being the one page short
// enough to expose it.
//
// history.scrollRestoration = 'manual' (module scope, set once -- this
// file's own routing component only ever mounts once) additionally
// disables the BROWSER's own native scroll-position memory for real
// Back/Forward navigation (this app listens for genuine popstate events
// the same way it listens for its own synthetic ones -- see
// useCurrentPath -- so real Back/Forward already reaches this same code
// path). Without it, a real Back/Forward could restore the browser's own
// remembered offset first and then have the effect below reset it,
// risking exactly the visible double-jump the brief asks to avoid.
if (typeof window !== "undefined" && "scrollRestoration" in window.history) {
  window.history.scrollRestoration = "manual";
}

export default function Router() {
  const path = useCurrentPath();

  // Mobile Page-Spacing pass -- Contact initial-scroll fix: the shared
  // fix itself -- reset to the true top on every route change, before the
  // next page's own content paints. Deliberately scoped to exactly this
  // (one effect, keyed on the same `path` this component already reads),
  // not a broader router/navigation change: it does not touch the
  // Archive's own camera/pan state (App.jsx's pan-zoom is transform-
  // driven, not document scroll, so this is a no-op for it) and gives
  // every other page -- including ones "already behaving correctly" --
  // the same clean top-of-page start a fresh route should have, rather
  // than a scroll position the router never controlled before.
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [path]);

  // Practice route consolidation (launch fidelity): "/about" was the
  // page's only path before the nav label became "Practice"; "/practice"
  // is now canonical (see Header.jsx's own MENU_LINK_PATHS comment).
  // "/about" keeps working as a backward-compatible alias for old links/
  // bookmarks -- this only rewrites the address bar (history.replaceState,
  // no extra back-stack entry, no reload) once AboutPage has rendered for
  // it below; the component and its CMS content are completely untouched.
  useEffect(() => {
    if (path === "/about") {
      window.history.replaceState({}, "", "/practice");
    }
  }, [path]);

  // Utility Information Phase: the current page, exactly as this
  // function has always resolved it below -- unchanged branching, just
  // named so the one new site-wide utility link (see the return
  // statement below) can be appended as a sibling without duplicating it
  // inside every branch.
  function renderPage() {
    if (path === "/practice" || path === "/about") {
      return <AboutPage />;
    }

    if (path === "/contact") {
      return <ContactPage />;
    }

    if (path === "/projects") {
      return <ProjectsPage />;
    }

    if (path === "/journal") {
      return <JournalPage />;
    }

    if (path === "/practice/questions") {
      return <PracticeQuestionsPage />;
    }

    if (path === "/site-information") {
      return <SiteInformationPage />;
    }

    const projectMatch = path.match(PROJECT_ROUTE);
    if (projectMatch) {
      const slug = projectMatch[1];
      // The clicked Archive Item's id travels as a query param (?image=),
      // not through Router/navigation.js's path-only state -- read directly
      // here rather than growing useCurrentPath's contract for one route.
      // key={slug} gives ProjectTemplate a clean remount whenever the
      // Project itself changes (Previous/Next Project), rather than trying
      // to reconcile its internal image-selection state across projects.
      const imageId = new URLSearchParams(window.location.search).get("image");
      return <ProjectTemplate key={slug} slug={slug} imageId={imageId} />;
    }

    return <App />;
  }

  return (
    <>
      {renderPage()}
      {/* Utility Information Phase: one site-wide, minimal, real <a href>
          to /site-information, bottom-right, fixed (styling in
          styles.css's own ".site-utility-link" rule). Mounted exactly
          once, here -- Router is the only point every route already
          passes through, so this is the smallest way to make the link
          genuinely persistent without touching Archive/Projects/Contact/
          Journal/Practice/ProjectTemplate (all under visual lock)
          individually. Plain preventDefault-then-navigate on an
          unmodified left click only -- a real href, so it still works
          with JS disabled and in a prerendered snapshot. Deliberately no
          beginPageTransition() fade: that's Header's own nav
          choreography, out of scope for this minimal link per
          instruction ("no animation beyond existing global link
          behavior"). */}
      <a
        href="/site-information"
        className="site-utility-link"
        onClick={(event) => {
          if (
            event.defaultPrevented ||
            event.button !== 0 ||
            event.metaKey ||
            event.ctrlKey ||
            event.shiftKey ||
            event.altKey
          ) {
            return;
          }
          event.preventDefault();
          navigate("/site-information");
        }}
      >
        © Urbānum
      </a>
    </>
  );
}
