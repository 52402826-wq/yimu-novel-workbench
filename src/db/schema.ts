import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const projects = sqliteTable("projects", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description").notNull().default(""),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const volumes = sqliteTable("volumes", {
  id: text("id").primaryKey(),
  projectId: text("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  sortOrder: integer("sort_order").notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const chapters = sqliteTable("chapters", {
  id: text("id").primaryKey(),
  volumeId: text("volume_id")
    .notNull()
    .references(() => volumes.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  summary: text("summary").notNull().default(""),
  storyTime: text("story_time").notNull().default(""),
  contentJson: text("content_json").notNull(),
  contentText: text("content_text").notNull().default(""),
  wordCount: integer("word_count").notNull().default(0),
  status: text("status").notNull().default("草稿"),
  sortOrder: integer("sort_order").notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const scenes = sqliteTable("scenes", {
  id: text("id").primaryKey(),
  chapterId: text("chapter_id")
    .notNull()
    .references(() => chapters.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  summary: text("summary").notNull().default(""),
  pov: text("pov").notNull().default(""),
  goal: text("goal").notNull().default(""),
  conflict: text("conflict").notNull().default(""),
  outcome: text("outcome").notNull().default(""),
  storyTime: text("story_time").notNull().default(""),
  contentJson: text("content_json").notNull(),
  contentText: text("content_text").notNull().default(""),
  wordCount: integer("word_count").notNull().default(0),
  sortOrder: integer("sort_order").notNull(),
  status: text("status").notNull().default("草稿"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const beats = sqliteTable("beats", {
  id: text("id").primaryKey(),
  sceneId: text("scene_id")
    .notNull()
    .references(() => scenes.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  summary: text("summary").notNull().default(""),
  status: text("status").notNull().default("计划中"),
  sortOrder: integer("sort_order").notNull(),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const worldEntities = sqliteTable("world_entities", {
  id: text("id").primaryKey(),
  projectId: text("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  type: text("type").notNull(),
  name: text("name").notNull(),
  summary: text("summary").notNull().default(""),
  content: text("content").notNull().default(""),
  tags: text("tags").notNull().default(""),
  status: text("status").notNull().default("活跃"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const narrativeThreads = sqliteTable("narrative_threads", {
  id: text("id").primaryKey(),
  projectId: text("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  type: text("type").notNull(),
  title: text("title").notNull(),
  summary: text("summary").notNull().default(""),
  status: text("status").notNull().default("计划中"),
  startSceneId: text("start_scene_id").references(() => scenes.id, { onDelete: "set null" }),
  resolvedSceneId: text("resolved_scene_id").references(() => scenes.id, { onDelete: "set null" }),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const libraryItems = sqliteTable("library_items", {
  id: text("id").primaryKey(),
  projectId: text("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  type: text("type").notNull(),
  title: text("title").notNull(),
  content: text("content").notNull().default(""),
  source: text("source").notNull().default(""),
  tags: text("tags").notNull().default(""),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const relations = sqliteTable("relations", {
  id: text("id").primaryKey(),
  projectId: text("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  sourceType: text("source_type").notNull(),
  sourceId: text("source_id").notNull(),
  targetType: text("target_type").notNull(),
  targetId: text("target_id").notNull(),
  relationType: text("relation_type").notNull(),
  note: text("note").notNull().default(""),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const timelineEvents = sqliteTable("timeline_events", {
  id: text("id").primaryKey(),
  projectId: text("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  eventTime: text("event_time").notNull().default(""),
  type: text("type").notNull().default("正文"),
  location: text("location").notNull().default(""),
  participants: text("participants").notNull().default(""),
  sceneId: text("scene_id").references(() => scenes.id, { onDelete: "set null" }),
  summary: text("summary").notNull().default(""),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const aiProviders = sqliteTable("ai_providers", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  provider: text("provider").notNull(),
  baseUrl: text("base_url").notNull().default(""),
  apiKey: text("api_key").notNull().default(""),
  defaultModel: text("default_model").notNull().default(""),
  enabled: integer("enabled").notNull().default(1),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export const aiModelAliases = sqliteTable("ai_model_aliases", {
  id: text("id").primaryKey(),
  mode: text("mode").notNull(),
  providerId: text("provider_id").references(() => aiProviders.id, { onDelete: "set null" }),
  modelName: text("model_name").notNull().default(""),
  temperature: integer("temperature").notNull().default(50),
  topP: integer("top_p").notNull().default(90),
  maxTokens: integer("max_tokens").notNull().default(1600),
  maxContextChars: integer("max_context_chars").notNull().default(6000),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

export type Project = typeof projects.$inferSelect;
export type Volume = typeof volumes.$inferSelect;
export type Chapter = typeof chapters.$inferSelect;
export type Scene = typeof scenes.$inferSelect;
export type Beat = typeof beats.$inferSelect;
export type WorldEntity = typeof worldEntities.$inferSelect;
export type NarrativeThread = typeof narrativeThreads.$inferSelect;
export type LibraryItem = typeof libraryItems.$inferSelect;
export type Relation = typeof relations.$inferSelect;
export type TimelineEvent = typeof timelineEvents.$inferSelect;
export type AiProviderSetting = typeof aiProviders.$inferSelect;
export type AiModelAlias = typeof aiModelAliases.$inferSelect;
