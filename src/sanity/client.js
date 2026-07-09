import { createClient } from "@sanity/client";
import imageUrlBuilder from "@sanity/image-url";
import { apiVersion, dataset, isSanityConfigured, projectId } from "./env";

export const sanityClient = isSanityConfigured
  ? createClient({
      projectId,
      dataset,
      apiVersion,
      useCdn: true,
    })
  : null;

const imageBuilder = sanityClient ? imageUrlBuilder(sanityClient) : null;

export function urlForImage(source) {
  return imageBuilder?.image(source);
}

export function getSanityImageUrl(source, width = 800, format = "auto") {
  if (!imageBuilder || !source) return "";

  const builder = imageBuilder
    .image(source)
    .width(width)
    .fit("max")
    .auto("format");

  return format === "auto" ? builder.url() : builder.format(format).url();
}

export async function fetchArchiveImages() {
  if (!sanityClient) return [];

  return sanityClient.fetch(`*[_type == "archiveImage" && defined(image.asset)] | order(sortOrder asc, archiveNumber asc) {
    _id,
    archiveNumber,
    "category": coalesce(categoryRef->title, category),
    title,
    description,
    location,
    date,
    featured,
    sortOrder,
    image {
      asset->{
        _id,
        url,
        metadata {
          dimensions,
          lqip,
          palette
        }
      },
      crop,
      hotspot
    },
    "tags": tags[]->title
  }`);
}
