export const structure = (S) =>
  S.list()
    .title("Content")
    .items([
      S.listItem()
        .title("Images")
        .schemaType("archiveImage")
        .child(
          S.documentTypeList("archiveImage")
            .title("Images")
            .defaultOrdering([{ field: "archiveNumber", direction: "asc" }]),
        ),
      S.documentTypeListItem("category").title("Categories"),
      S.documentTypeListItem("tag").title("Tags"),
    ]);
