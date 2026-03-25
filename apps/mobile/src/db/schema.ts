import { appSchema, tableSchema } from "@nozbe/watermelondb";

export const matexSchema = appSchema({
  version: 1,
  tables: [
    tableSchema({
      name: "listings",
      columns: [
        { name: "title", type: "string" },
        { name: "category", type: "string" },
        { name: "price", type: "number" },
        { name: "status", type: "string" },
        { name: "synced_at", type: "number", isOptional: true },
      ],
    }),
    tableSchema({
      name: "messages",
      columns: [
        { name: "thread_id", type: "string", isIndexed: true },
        { name: "content", type: "string" },
        { name: "sender_id", type: "string" },
        { name: "synced_at", type: "number", isOptional: true },
      ],
    }),
    tableSchema({
      name: "favorites",
      columns: [
        { name: "listing_id", type: "string", isIndexed: true },
        { name: "synced_at", type: "number", isOptional: true },
      ],
    }),
  ],
});
