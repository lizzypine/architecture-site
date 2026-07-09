import { defineField, defineType } from "sanity";

export const category = defineType({
  name: "category",
  title: "Category",
  type: "document",
  fields: [
    defineField({
      name: "title",
      title: "Title",
      type: "string",
      description: "Category name shown to editors and used for filtering.",
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: "slug",
      title: "Slug",
      type: "slug",
      description: "Optional URL-friendly version of the category name.",
      options: {
        source: "title",
        maxLength: 96,
      },
    }),
    defineField({
      name: "description",
      title: "Description",
      type: "text",
      rows: 2,
      description: "Optional internal note about when to use this category.",
    }),
    defineField({
      name: "sortOrder",
      title: "Sort Order",
      type: "number",
      description: "Optional manual ordering value. Lower numbers appear first.",
    }),
  ],
  orderings: [
    {
      name: "sortOrderAsc",
      title: "Sort Order",
      by: [{ field: "sortOrder", direction: "asc" }],
    },
    {
      name: "titleAsc",
      title: "Title",
      by: [{ field: "title", direction: "asc" }],
    },
  ],
  preview: {
    select: {
      description: "description",
      title: "title",
    },
    prepare({ description, title }) {
      return {
        title,
        subtitle: description,
      };
    },
  },
});
