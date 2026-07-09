import { defineField, defineType } from "sanity";

export const tag = defineType({
  name: "tag",
  title: "Tag",
  type: "document",
  fields: [
    defineField({
      name: "title",
      title: "Title",
      type: "string",
      description: "Short label used for filtering and search.",
      validation: (Rule) => Rule.required(),
    }),
    defineField({
      name: "slug",
      title: "Slug",
      type: "slug",
      description: "Optional URL-friendly version of the tag label.",
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
      description: "Optional internal note about how this tag should be used.",
    }),
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
