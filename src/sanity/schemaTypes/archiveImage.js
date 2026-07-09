import { defineField, defineType } from "sanity";
import { apiVersion } from "../env";

export const archiveImage = defineType({
  name: "archiveImage",
  title: "Image",
  type: "document",
  groups: [
    {
      name: "required",
      title: "Required",
      default: true,
    },
    {
      name: "details",
      title: "Details",
    },
    {
      name: "notes",
      title: "Notes",
    },
  ],
  fields: [
    defineField({
      name: "image",
      title: "Image",
      type: "image",
      group: "required",
      description: "Upload the photograph or visual archive item.",
      options: {
        hotspot: true,
        metadata: ["blurhash", "lqip", "palette", "exif", "location"],
      },
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: "archiveNumber",
      title: "Archive Number",
      type: "string",
      group: "required",
      description: "Unique identifier for this image, for example URB-0001.",
      validation: (Rule) =>
        Rule.required().custom(async (archiveNumber, context) => {
          if (!archiveNumber) return true;

          const documentId = context.document?._id?.replace(/^drafts\./, "");
          if (!documentId) return true;

          const count = await context
            .getClient({ apiVersion })
            .fetch(
              `count(*[
                _type == "archiveImage" &&
                archiveNumber == $archiveNumber &&
                !(_id in [$draftId, $publishedId])
              ])`,
              {
                archiveNumber,
                draftId: `drafts.${documentId}`,
                publishedId: documentId,
              },
            );

          return count === 0 || "Archive Number must be unique.";
        }),
    }),
    defineField({
      name: "category",
      title: "Legacy Category",
      type: "string",
      group: "required",
      description: "Old category value kept for existing images.",
      hidden: true,
      readOnly: true,
    }),
    defineField({
      name: "categoryRef",
      title: "Category",
      type: "reference",
      group: "required",
      description: "Choose the single best primary category.",
      to: [{ type: "category" }],
      validation: (Rule) =>
        Rule.custom((categoryRef, context) => {
          if (categoryRef?._ref || context.document?.category) return true;

          return "Category is required.";
        }),
    }),
    defineField({
      name: "tags",
      title: "Tags",
      type: "array",
      group: "required",
      description: "Add at least one searchable tag.",
      of: [{ type: "reference", to: [{ type: "tag" }] }],
      validation: (Rule) => Rule.required().min(1),
    }),
    defineField({
      name: "title",
      title: "Title",
      type: "string",
      group: "details",
      description: "Optional public-facing title.",
    }),
    defineField({
      name: "description",
      title: "Description",
      type: "text",
      group: "details",
      description: "Optional caption or descriptive text.",
      rows: 3,
    }),
    defineField({
      name: "location",
      title: "Location",
      type: "string",
      group: "details",
      description: "Optional place, project, city, room, or site reference.",
    }),
    defineField({
      name: "date",
      title: "Date",
      type: "date",
      group: "details",
      description: "Optional date associated with the image.",
    }),
    defineField({
      name: "notes",
      title: "Internal Notes",
      type: "text",
      group: "notes",
      description: "Private notes for editors. These do not need to appear on the site.",
      rows: 4,
    }),
    defineField({
      name: "sortOrder",
      title: "Sort Order",
      type: "number",
      group: "details",
      description: "Optional manual ordering value. Lower numbers appear first.",
    }),
  ],
  orderings: [
    {
      name: "archiveNumberAsc",
      title: "Archive Number",
      by: [{ field: "archiveNumber", direction: "asc" }],
    },
    {
      name: "sortOrderAsc",
      title: "Sort Order",
      by: [{ field: "sortOrder", direction: "asc" }],
    },
  ],
  preview: {
    select: {
      archiveNumber: "archiveNumber",
      category: "categoryRef.title",
      legacyCategory: "category",
      media: "image",
      tags: "tags",
      title: "title",
    },
    prepare({ archiveNumber, category, legacyCategory, media, tags, title }) {
      const tagCount = tags?.length || 0;
      return {
        title: title || archiveNumber || "Untitled image",
        subtitle: [
          archiveNumber,
          category || legacyCategory,
          tagCount ? `${tagCount} tag${tagCount === 1 ? "" : "s"}` : null,
        ]
          .filter(Boolean)
          .join(" - "),
        media,
      };
    },
  },
});
