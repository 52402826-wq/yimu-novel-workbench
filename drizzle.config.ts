import { defineConfig } from "drizzle-kit";

const dataDir =
  process.env.NOVEL_WORKBENCH_DATA_DIR ?? "/Users/ray/Documents/NovelWorkbenchData";

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./src/db/migrations",
  dialect: "sqlite",
  dbCredentials: {
    url: `${dataDir}/novel-workbench.db`,
  },
});
