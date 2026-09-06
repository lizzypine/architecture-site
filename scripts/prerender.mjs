// PHASE 1 -- prerender mechanism (productionized from the proven
// /practice-only experiment). Still run manually (node scripts/prerender.mjs),
// still NOT wired into `npm run build`, still adds nothing to package.json
// or vercel.json. Scope is deliberately narrow: render real page
// components to real HTML and inject that HTML into dist/<route>/index.html.
// No per-route <title>/<meta description>/canonical/JSON-LD -- that is a
// separate, later metadata phase. No FAQ content, no sitemap, no robots,
// no redirects. "/" (Archive) is never rendered through React here at all.
//
// Usage: node scripts/prerender.mjs
// Requires a fresh dist/ (e.g. `npx vite build --emptyOutDir=false`, or
// the project's normal `npm run build` -- either works, this script only
// reads dist/index.html as a template and never runs a build itself).

import { createServer } from "vite";
import { renderToString } from "react-dom/server";
import React from "react";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import process from "node:process";
import { FIXED_ROUTES, PROJECT_TEMPLATE_COMPONENT_PATH } from "./seo/routes.mjs";

// -----------------------------------------------------------------------
// KNOWN, DELIBERATE SHIM -- unchanged in spirit from the /practice proof.
// Header.jsx's useCurrentPath() (src/navigation.js) reads
// window.location.pathname inside a useState LAZY INITIALIZER -- i.e. at
// render time, not inside an effect -- so it throws under plain Node
// unless `window` exists at all. The SSR-safety audit for this phase
// (ContactPage, ProjectsPage, JournalPage, ProjectTemplate, and their
// directly-rendered dependencies: projectContent.js, ProjectBreadcrumb,
// ImageViewer, ImageNavigation, ProjectArchiveIndex, ProjectInfoPanel)
// found no other render-time window/document/navigator/Math.random
// usage anywhere in any of those trees -- every window/document
// reference in them (ImageViewer's fade timers, ProjectTemplate's
// trackpad-scroller setup) is inside a useEffect, which never runs
// during renderToString. So the same single minimal stub is still
// enough. pathname is updated per-route below (not fixed to one value)
// so Header's own nav-highlight state matches whichever page is
// currently being rendered.
// -----------------------------------------------------------------------
const windowShim = {
  location: { pathname: "/" },
  addEventListener() {},
  removeEventListener() {},
};
if (typeof globalThis.window === "undefined") {
  globalThis.window = windowShim;
}

const ROOT = process.cwd();
const DIST_INDEX = path.join(ROOT, "dist", "index.html");

async function main() {
  let pristineTemplate;
  try {
    pristineTemplate = await fs.readFile(DIST_INDEX, "utf-8");
  } catch (err) {
    console.error(
      `[prerender] Could not read ${DIST_INDEX}. Build first (e.g. "npm run build"). Original error:`,
      err.message,
    );
    process.exit(1);
  }

  // Safety net: dist/index.html (Archive's own file) must never be a
  // write target for this script. Recorded once up front so it can be
  // diffed again after every route is written (see the summary at the
  // end of main()).
  const distIndexStatBefore = await fs.stat(DIST_INDEX);

  // cacheDir deliberately points OUTSIDE the repo, in the OS temp dir --
  // same reasoning as the /practice experiment: this sandbox's bridge
  // filesystem refuses to delete/rewrite some pre-existing files under
  // the repo's own node_modules/.vite. A scratch cache dir sidesteps
  // that without touching anything inside the repo and leaves nothing
  // behind.
  const cacheDir = await fs.mkdtemp(path.join(os.tmpdir(), "urbanum-prerender-vite-"));

  const vite = await createServer({
    root: ROOT,
    cacheDir,
    server: { middlewareMode: true },
    appType: "custom",
    logLevel: "warn",
  });

  const results = [];

  try {
    const content = await vite.ssrLoadModule("/src/content/index.js");
    const {
      loadAboutPage,
      loadArchiveItems,
      loadProjects,
      loadThemes,
      loadJournalEntries,
      loadContactPage,
      getAboutPage,
      getContactPage,
      getProjects,
      getJournalEntries,
      getArchiveItems,
      getThemes,
    } = content;

    // Same LOAD_TIMEOUT_MS-races-the-real-fetch loaders every component
    // already uses, completely unmodified. Retried a few times only to
    // survive a cold Node process's first-connection latency -- the
    // constant itself is never touched. Mirrors the retry that proved
    // out successfully in the /practice experiment, generalized across
    // all six loaders main.jsx itself already waits on together.
    const MAX_LOAD_ATTEMPTS = 4;
    let anyContentLoaded = false;
    for (let attempt = 1; attempt <= MAX_LOAD_ATTEMPTS; attempt += 1) {
      console.log(
        `[prerender] Loading live content from Sanity (attempt ${attempt}/${MAX_LOAD_ATTEMPTS})...`,
      );
      // eslint-disable-next-line no-await-in-loop
      await Promise.all([
        loadAboutPage(),
        loadArchiveItems(),
        loadProjects(),
        loadThemes(),
        loadJournalEntries(),
        loadContactPage(),
      ]);
      anyContentLoaded =
        Boolean(getAboutPage()) ||
        Boolean(getContactPage()) ||
        getProjects().length > 0 ||
        getJournalEntries().length > 0 ||
        getArchiveItems().length > 0 ||
        getThemes().length > 0;
      if (anyContentLoaded) break;
    }
    if (!anyContentLoaded) {
      console.error(
        `[prerender] No content of any kind loaded after ${MAX_LOAD_ATTEMPTS} attempts -- proceeding anyway so each route's failure mode is visible in its own output file rather than aborting the whole run.`,
      );
    }

    // Dynamic Project route discovery -- published documents only, real
    // slugs only, nothing hardcoded. PROJECTS_QUERY (src/cms/queries.js)
    // already excludes drafts and already requires slug.current to
    // exist for the "slug" field to be populated; this only adds a
    // defensive filter for the (should-be-impossible) case of a
    // published Project with no slug at all, so a bad document can
    // never produce a route rather than being silently skipped.
    const projects = getProjects();
    const projectRoutes = projects
      .filter((project) => typeof project?.slug === "string" && project.slug.length > 0)
      .map((project) => ({
        urlPath: `/projects/${project.slug}`,
        outFile: `projects/${project.slug}/index.html`,
        slug: project.slug,
      }));
    const skippedProjectCount = projects.length - projectRoutes.length;

    console.log(
      `[prerender] Discovered ${projectRoutes.length} published Project route(s) from Sanity` +
        (skippedProjectCount > 0
          ? ` (${skippedProjectCount} published Project document(s) skipped -- no slug)`
          : "") +
        (projectRoutes.length > 0 ? `: ${projectRoutes.map((r) => r.slug).join(", ")}` : "."),
    );

    const { default: ProjectTemplate } = await vite.ssrLoadModule(
      PROJECT_TEMPLATE_COMPONENT_PATH,
    );

    // --- Render + write every FIXED route ---------------------------
    for (const route of FIXED_ROUTES) {
      // eslint-disable-next-line no-await-in-loop
      const result = await renderRouteToFile({
        vite,
        urlPath: route.urlPath,
        outFile: route.outFile,
        pristineTemplate,
        loadComponent: async () => {
          const mod = await vite.ssrLoadModule(route.componentPath);
          return React.createElement(mod.default);
        },
      });
      results.push({ urlPath: route.urlPath, ...result });
    }

    // --- Render + write every discovered Project route ---------------
    for (const route of projectRoutes) {
      // eslint-disable-next-line no-await-in-loop
      const result = await renderRouteToFile({
        vite,
        urlPath: route.urlPath,
        outFile: route.outFile,
        pristineTemplate,
        loadComponent: async () =>
          React.createElement(ProjectTemplate, { slug: route.slug, imageId: null }),
      });
      results.push({ urlPath: route.urlPath, ...result });
    }

    // --- Confirm Archive's dist/index.html was never touched ---------
    const distIndexStatAfter = await fs.stat(DIST_INDEX);
    const archiveUntouched =
      distIndexStatBefore.mtimeMs === distIndexStatAfter.mtimeMs &&
      distIndexStatBefore.size === distIndexStatAfter.size;

    // --- Summary -------------------------------------------------------
    console.log("\n[prerender] ==================== SUMMARY ====================");
    for (const r of results) {
      console.log(
        `[prerender] ${r.ok ? "OK  " : "FAIL"}  ${r.urlPath.padEnd(28)} -> ${r.outFile ?? "(not written)"}` +
          (r.ok ? `  (appHtml ${r.appHtmlLength} chars, file ${r.fileBytes} bytes)` : `  ${r.error}`),
      );
    }
    console.log(
      `[prerender] dist/index.html (Archive) untouched: ${archiveUntouched ? "YES" : "NO -- INVESTIGATE"}`,
    );
    console.log(
      `[prerender] Project routes discovered from Sanity (not hardcoded): ${projectRoutes.length}`,
    );
    console.log("[prerender] ===================================================\n");

    const anyFailed = results.some((r) => !r.ok);
    if (anyFailed || !archiveUntouched) {
      process.exitCode = 1;
    }
  } finally {
    await vite.close();
  }
}

// Renders one route's component to a string and writes it into a fresh
// copy of the pristine dist/index.html template. Deliberately does NOT
// touch <title>, <meta>, or anything else in <head> -- that's out of
// scope for this phase; every generated file keeps the exact same head
// Vite's own build produced. Returns a small result record instead of
// throwing, so one route's failure doesn't abort the whole run.
async function renderRouteToFile({ urlPath, outFile, pristineTemplate, loadComponent }) {
  try {
    windowShim.location.pathname = urlPath;

    const element = await loadComponent();
    const appHtml = renderToString(element);

    if (!appHtml || appHtml.trim().length === 0) {
      return {
        ok: false,
        error: "renderToString produced empty output",
        outFile: null,
      };
    }

    const rootMatches = pristineTemplate.match(/<div id="root"><\/div>/g) ?? [];
    if (rootMatches.length !== 1) {
      return {
        ok: false,
        error: `Expected exactly one empty <div id="root"></div> in dist/index.html, found ${rootMatches.length}`,
        outFile: null,
      };
    }

    const html = pristineTemplate.replace(
      '<div id="root"></div>',
      `<div id="root">${appHtml}</div>`,
    );

    const outPath = path.join(process.cwd(), "dist", outFile);
    if (path.resolve(outPath) === path.resolve(DIST_INDEX)) {
      // Should be unreachable given the route table, but this is exactly
      // the invariant that must never break: Archive's own dist/index.html
      // is never a prerender write target.
      throw new Error("Refusing to overwrite dist/index.html (Archive's own file).");
    }

    await fs.mkdir(path.dirname(outPath), { recursive: true });
    await fs.writeFile(outPath, html, "utf-8");

    return {
      ok: true,
      outFile,
      appHtmlLength: appHtml.length,
      fileBytes: Buffer.byteLength(html, "utf-8"),
    };
  } catch (err) {
    return { ok: false, error: err.message, outFile: null };
  }
}

main().catch((err) => {
  console.error("[prerender] Failed:", err);
  process.exit(1);
});
