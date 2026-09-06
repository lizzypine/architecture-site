// PHASE 1 -- prerender mechanism (productionized from the proven
// /practice-only experiment), extended in PHASE 2 with centralized SEO
// metadata injection (scripts/seo/metadata.mjs). Still run manually
// (node scripts/prerender.mjs), still NOT wired into `npm run build`,
// still adds nothing to package.json or vercel.json. No JSON-LD, no FAQ
// content, no sitemap, no robots, no redirects -- all explicitly out of
// scope for this phase.
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
import { FIXED_ROUTE_METADATA, buildHeadMetadataHtml, buildProjectMetadata } from "./seo/metadata.mjs";

// -----------------------------------------------------------------------
// KNOWN, DELIBERATE SHIM -- unchanged in spirit from the /practice proof.
// Header.jsx's useCurrentPath() (src/navigation.js) reads
// window.location.pathname inside a useState LAZY INITIALIZER -- i.e. at
// render time, not inside an effect -- so it throws under plain Node
// unless `window` exists at all. The Phase 1 SSR-safety audit (Contact,
// Projects, Journal, ProjectTemplate, and their directly-rendered
// dependencies) found no other render-time window/document/navigator/
// Math.random usage anywhere in any of those trees. pathname is updated
// per-route below so Header's own nav-highlight state matches whichever
// page is currently being rendered.
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

  // cacheDir deliberately points OUTSIDE the repo, in the OS temp dir --
  // this sandbox's bridge filesystem refuses to delete/rewrite some
  // pre-existing files under the repo's own node_modules/.vite. A
  // scratch cache dir sidesteps that without touching anything inside
  // the repo and leaves nothing behind.
  const cacheDir = await fs.mkdtemp(path.join(os.tmpdir(), "urbanum-prerender-vite-"));

  const vite = await createServer({
    root: ROOT,
    cacheDir,
    server: { middlewareMode: true },
    appType: "custom",
    logLevel: "warn",
  });

  const results = [];
  let homepageResult = null;

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
    // survive a cold Node process's first-connection latency.
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
    // published Project with no slug at all.
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
    // Same content-layer functions ProjectTemplate.jsx itself calls
    // (src/projectContent.js) and the same image-resolution/optimization
    // helpers ImageViewer.jsx/ProjectTemplate.jsx already use
    // (src/imageOptimization.js) -- reused here purely to compute a
    // representative OG image for each Project route the exact same way
    // the app already decides which image to show first. No new
    // image-selection logic, no new query.
    const { getProjectBySlug, resolveInitialImageId } = await vite.ssrLoadModule(
      "/src/projectContent.js",
    );
    const { getOptimizedImageSrc } = await vite.ssrLoadModule("/src/imageOptimization.js");

    // --- Render + write every FIXED route ---------------------------
    for (const route of FIXED_ROUTES) {
      const metadata = FIXED_ROUTE_METADATA[route.urlPath];
      const metaHtml = buildHeadMetadataHtml({ urlPath: route.urlPath, ...metadata });
      // eslint-disable-next-line no-await-in-loop
      const result = await renderRouteToFile({
        urlPath: route.urlPath,
        outFile: route.outFile,
        pristineTemplate,
        metaHtml,
        loadComponent: async () => {
          const mod = await vite.ssrLoadModule(route.componentPath);
          return React.createElement(mod.default);
        },
      });
      results.push({ urlPath: route.urlPath, ...result });
    }

    // --- Render + write every discovered Project route ---------------
    for (const route of projectRoutes) {
      const project = getProjectBySlug(route.slug);

      // Representative image, derived only from real Sanity/Archive Item
      // data already attached to this Project (project.images), using
      // the app's own selection order (Featured, then lowest sortOrder
      // visible) -- never a separate or invented heuristic. Falls back
      // to the sitewide brand image (handled inside buildHeadMetadataHtml
      // via DEFAULT_OG_IMAGE_PATH) only when a Project genuinely has no
      // resolvable image.
      let representativeImageSrc = null;
      if (project) {
        const imageId = resolveInitialImageId(project, null);
        const item = project.images.find((img) => img.archiveNumber === imageId);
        if (item?.image) {
          representativeImageSrc = getOptimizedImageSrc(item.image, 1200);
        }
      }

      const metadata = buildProjectMetadata(project, representativeImageSrc);
      const metaHtml = buildHeadMetadataHtml({ urlPath: route.urlPath, ...metadata });

      // eslint-disable-next-line no-await-in-loop
      const result = await renderRouteToFile({
        urlPath: route.urlPath,
        outFile: route.outFile,
        pristineTemplate,
        metaHtml,
        loadComponent: async () =>
          React.createElement(ProjectTemplate, { slug: route.slug, imageId: null }),
      });
      results.push({ urlPath: route.urlPath, ...result, ogImage: representativeImageSrc });
    }

    // --- Homepage: <head>-only metadata, body untouched, App.jsx never
    //     imported or rendered -----------------------------------------
    homepageResult = await writeHomepageMetadata(pristineTemplate);

    // --- Summary -------------------------------------------------------
    console.log("\n[prerender] ==================== SUMMARY ====================");
    for (const r of results) {
      console.log(
        `[prerender] ${r.ok ? "OK  " : "FAIL"}  ${r.urlPath.padEnd(28)} -> ${r.outFile ?? "(not written)"}` +
          (r.ok ? `  (appHtml ${r.appHtmlLength} chars, file ${r.fileBytes} bytes)` : `  ${r.error}`),
      );
    }
    console.log(
      `[prerender] ${homepageResult.ok ? "OK  " : "FAIL"}  / (head-only)              -> dist/index.html` +
        (homepageResult.ok
          ? `  (body unchanged: ${homepageResult.bodyUnchanged ? "YES" : "NO -- INVESTIGATE"}, file ${homepageResult.fileBytes} bytes)`
          : `  ${homepageResult.error}`),
    );
    console.log(
      `[prerender] Project routes discovered from Sanity (not hardcoded): ${projectRoutes.length}`,
    );
    console.log("[prerender] ===================================================\n");

    const anyFailed = results.some((r) => !r.ok) || !homepageResult.ok || !homepageResult.bodyUnchanged;
    if (anyFailed) {
      process.exitCode = 1;
    }
  } finally {
    await vite.close();
  }
}

// Renders one route's component to a string and writes it into a fresh
// copy of the pristine dist/index.html template, with metaHtml replacing
// the template's existing <title>...</title> tag. Returns a small result
// record instead of throwing, so one route's failure doesn't abort the
// whole run. Refuses outright to ever write to dist/index.html itself --
// that path is reserved exclusively for writeHomepageMetadata() below.
async function renderRouteToFile({ urlPath, outFile, pristineTemplate, loadComponent, metaHtml }) {
  try {
    windowShim.location.pathname = urlPath;

    const element = await loadComponent();
    const appHtml = renderToString(element);

    if (!appHtml || appHtml.trim().length === 0) {
      return { ok: false, error: "renderToString produced empty output", outFile: null };
    }

    const titleMatches = pristineTemplate.match(/<title>.*?<\/title>/) ? 1 : 0;
    if (titleMatches !== 1) {
      return {
        ok: false,
        error: "Expected exactly one <title> tag in dist/index.html template",
        outFile: null,
      };
    }
    let html = pristineTemplate.replace(/<title>.*?<\/title>/, metaHtml);

    const rootMatches = html.match(/<div id="root"><\/div>/g) ?? [];
    if (rootMatches.length !== 1) {
      return {
        ok: false,
        error: `Expected exactly one empty <div id="root"></div>, found ${rootMatches.length}`,
        outFile: null,
      };
    }
    html = html.replace('<div id="root"></div>', `<div id="root">${appHtml}</div>`);

    const outPath = path.join(process.cwd(), "dist", outFile);
    if (path.resolve(outPath) === path.resolve(DIST_INDEX)) {
      // Should be unreachable given the route table, but this is exactly
      // the invariant that must never break: Archive's own dist/index.html
      // is written only by writeHomepageMetadata(), never here.
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

// The ONLY function permitted to write dist/index.html. Injects <head>
// metadata for "/" (see seo/metadata.mjs's FIXED_ROUTE_METADATA["/"])
// and nothing else -- App.jsx is never imported, never passed to
// renderToString, and <div id="root"></div> is never touched. Proves
// that guarantee programmatically (not just by convention) with an
// explicit <body>-section byte-equality check before writing: if
// anything about the body differs from the pristine template for any
// reason, this throws instead of writing.
async function writeHomepageMetadata(pristineTemplate) {
  try {
    const metadata = FIXED_ROUTE_METADATA["/"];
    const metaHtml = buildHeadMetadataHtml({ urlPath: "/", ...metadata });

    const titleMatches = pristineTemplate.match(/<title>.*?<\/title>/) ? 1 : 0;
    if (titleMatches !== 1) {
      return {
        ok: false,
        error: "Expected exactly one <title> tag in dist/index.html template",
      };
    }
    const html = pristineTemplate.replace(/<title>.*?<\/title>/, metaHtml);

    const bodyOf = (s) => s.slice(s.indexOf("<body"));
    const bodyUnchanged = bodyOf(html) === bodyOf(pristineTemplate);
    if (!bodyUnchanged) {
      throw new Error(
        "Homepage metadata injection unexpectedly altered <body> -- refusing to write dist/index.html.",
      );
    }

    await fs.writeFile(DIST_INDEX, html, "utf-8");

    return {
      ok: true,
      bodyUnchanged,
      metaHtmlLength: metaHtml.length,
      fileBytes: Buffer.byteLength(html, "utf-8"),
    };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

main().catch((err) => {
  console.error("[prerender] Failed:", err);
  process.exit(1);
});
