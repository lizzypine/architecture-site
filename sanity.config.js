import { defineConfig } from "sanity";
import { structureTool } from "sanity/structure";
import { dataset, projectId } from "./src/sanity/env";
import { schemaTypes } from "./src/sanity/schemaTypes";
import { structure } from "./src/sanity/structure";
import { StudioIcon } from "./src/sanity/StudioIcon";
import { StudioNavbar } from "./src/sanity/StudioNavbar";

export default defineConfig({
  name: "urbanum",
  title: "urbanum",
  projectId,
  dataset,
  basePath: "/admin",
  icon: StudioIcon,
  releases: {
    enabled: false,
  },
  scheduledDrafts: {
    enabled: false,
  },
  studio: {
    components: {
      navbar: StudioNavbar,
    },
  },
  plugins: [
    structureTool({
      structure,
    }),
  ],
  schema: {
    types: schemaTypes,
  },
});
