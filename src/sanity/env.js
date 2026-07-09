export const apiVersion = "2026-07-08";
export const dataset = import.meta.env.VITE_SANITY_DATASET || "production";
export const projectId = import.meta.env.VITE_SANITY_PROJECT_ID || "";

export const isSanityConfigured = Boolean(projectId && dataset);
