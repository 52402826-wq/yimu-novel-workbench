import { mkdirSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createClient, type Client } from "@libsql/client";
import { drizzle, type LibSQLDatabase } from "drizzle-orm/libsql";
import * as schema from "./schema";

const dataDir =
  process.env.NOVEL_WORKBENCH_DATA_DIR ?? "/Users/ray/Documents/NovelWorkbenchData";

export const databasePath = join(dataDir, "novel-workbench.db");

let rawClient: Client | null = null;
let database: LibSQLDatabase<typeof schema> | null = null;

export function getRawClient() {
  mkdirSync(dataDir, { recursive: true });
  assertDataDirectoryWritable();
  rawClient ??= createClient({
    url: `file:${databasePath}`,
  });
  return rawClient;
}

export function getDb() {
  database ??= drizzle(getRawClient(), { schema });
  return database;
}

let initPromise: Promise<void> | null = null;

export function initDatabase() {
  initPromise ??= initializeDatabase();
  return initPromise;
}

async function initializeDatabase() {
  const rawClient = getRawClient();

  await rawClient.execute("PRAGMA foreign_keys = ON");
  await rawClient.execute(`
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);
  await rawClient.execute(`
    CREATE TABLE IF NOT EXISTS volumes (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      sort_order INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);
  await rawClient.execute(`
    CREATE TABLE IF NOT EXISTS chapters (
      id TEXT PRIMARY KEY,
      volume_id TEXT NOT NULL REFERENCES volumes(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      summary TEXT NOT NULL DEFAULT '',
      story_time TEXT NOT NULL DEFAULT '',
      content_json TEXT NOT NULL DEFAULT '{"type":"doc","content":[{"type":"paragraph"}]}',
      content_text TEXT NOT NULL DEFAULT '',
      word_count INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT '草稿',
      sort_order INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);
  await rawClient.execute(`
    CREATE TABLE IF NOT EXISTS scenes (
      id TEXT PRIMARY KEY,
      chapter_id TEXT NOT NULL REFERENCES chapters(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      summary TEXT NOT NULL DEFAULT '',
      pov TEXT NOT NULL DEFAULT '',
      goal TEXT NOT NULL DEFAULT '',
      conflict TEXT NOT NULL DEFAULT '',
      outcome TEXT NOT NULL DEFAULT '',
      story_time TEXT NOT NULL DEFAULT '',
      content_json TEXT NOT NULL,
      content_text TEXT NOT NULL DEFAULT '',
      word_count INTEGER NOT NULL DEFAULT 0,
      sort_order INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT '草稿',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);
  await addColumnIfMissing("scenes", "summary", "TEXT NOT NULL DEFAULT ''");
  await addColumnIfMissing("scenes", "pov", "TEXT NOT NULL DEFAULT ''");
  await addColumnIfMissing("scenes", "goal", "TEXT NOT NULL DEFAULT ''");
  await addColumnIfMissing("scenes", "conflict", "TEXT NOT NULL DEFAULT ''");
  await addColumnIfMissing("scenes", "outcome", "TEXT NOT NULL DEFAULT ''");
  await addColumnIfMissing("scenes", "story_time", "TEXT NOT NULL DEFAULT ''");
  await rawClient.execute(`
    CREATE TABLE IF NOT EXISTS beats (
      id TEXT PRIMARY KEY,
      scene_id TEXT NOT NULL REFERENCES scenes(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      summary TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT '计划中',
      sort_order INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);
  await rawClient.execute(`
    CREATE TABLE IF NOT EXISTS world_entities (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      type TEXT NOT NULL,
      name TEXT NOT NULL,
      summary TEXT NOT NULL DEFAULT '',
      content TEXT NOT NULL DEFAULT '',
      tags TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT '活跃',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);
  await rawClient.execute(`
    CREATE TABLE IF NOT EXISTS narrative_threads (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      summary TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT '计划中',
      start_scene_id TEXT REFERENCES scenes(id) ON DELETE SET NULL,
      resolved_scene_id TEXT REFERENCES scenes(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);
  await rawClient.execute(`
    CREATE TABLE IF NOT EXISTS library_items (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      content TEXT NOT NULL DEFAULT '',
      source TEXT NOT NULL DEFAULT '',
      tags TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);
  await rawClient.execute(`
    CREATE TABLE IF NOT EXISTS relations (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      source_type TEXT NOT NULL,
      source_id TEXT NOT NULL,
      target_type TEXT NOT NULL,
      target_id TEXT NOT NULL,
      relation_type TEXT NOT NULL,
      note TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);
  await rawClient.execute(`
    CREATE TABLE IF NOT EXISTS timeline_events (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      event_time TEXT NOT NULL DEFAULT '',
      type TEXT NOT NULL DEFAULT '正文',
      location TEXT NOT NULL DEFAULT '',
      participants TEXT NOT NULL DEFAULT '',
      scene_id TEXT REFERENCES scenes(id) ON DELETE SET NULL,
      summary TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);
  await rawClient.execute(`
    CREATE TABLE IF NOT EXISTS ai_providers (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      provider TEXT NOT NULL,
      base_url TEXT NOT NULL DEFAULT '',
      api_key TEXT NOT NULL DEFAULT '',
      default_model TEXT NOT NULL DEFAULT '',
      enabled INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);
  await rawClient.execute(`
    CREATE TABLE IF NOT EXISTS ai_model_aliases (
      id TEXT PRIMARY KEY,
      mode TEXT NOT NULL,
      provider_id TEXT REFERENCES ai_providers(id) ON DELETE SET NULL,
      model_name TEXT NOT NULL DEFAULT '',
      temperature INTEGER NOT NULL DEFAULT 50,
      top_p INTEGER NOT NULL DEFAULT 90,
      max_tokens INTEGER NOT NULL DEFAULT 1600,
      max_context_chars INTEGER NOT NULL DEFAULT 6000,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);
  await addColumnIfMissing("ai_model_aliases", "temperature", "INTEGER NOT NULL DEFAULT 50");
  await addColumnIfMissing("ai_model_aliases", "top_p", "INTEGER NOT NULL DEFAULT 90");
  await addColumnIfMissing("ai_model_aliases", "max_tokens", "INTEGER NOT NULL DEFAULT 1600");
  await addColumnIfMissing("ai_model_aliases", "max_context_chars", "INTEGER NOT NULL DEFAULT 6000");
  await addColumnIfMissing("chapters", "summary", "TEXT NOT NULL DEFAULT ''");
  await addColumnIfMissing("chapters", "story_time", "TEXT NOT NULL DEFAULT ''");
  await addColumnIfMissing("chapters", "content_json", "TEXT NOT NULL DEFAULT '{\"type\":\"doc\",\"content\":[{\"type\":\"paragraph\"}]}'");
  await addColumnIfMissing("chapters", "content_text", "TEXT NOT NULL DEFAULT ''");
  await addColumnIfMissing("chapters", "word_count", "INTEGER NOT NULL DEFAULT 0");
  await addColumnIfMissing("chapters", "status", "TEXT NOT NULL DEFAULT '草稿'");
  await rawClient.execute(
    "CREATE INDEX IF NOT EXISTS idx_volumes_project ON volumes(project_id, sort_order)"
  );
  await rawClient.execute(
    "CREATE INDEX IF NOT EXISTS idx_chapters_volume ON chapters(volume_id, sort_order)"
  );
  await rawClient.execute(
    "CREATE INDEX IF NOT EXISTS idx_scenes_chapter ON scenes(chapter_id, sort_order)"
  );
  await rawClient.execute(
    "CREATE INDEX IF NOT EXISTS idx_beats_scene ON beats(scene_id, sort_order)"
  );
  await rawClient.execute(
    "CREATE INDEX IF NOT EXISTS idx_world_entities_project ON world_entities(project_id, type, updated_at)"
  );
  await rawClient.execute(
    "CREATE INDEX IF NOT EXISTS idx_threads_project ON narrative_threads(project_id, type, updated_at)"
  );
  await rawClient.execute(
    "CREATE INDEX IF NOT EXISTS idx_library_project ON library_items(project_id, type, updated_at)"
  );
  await rawClient.execute(
    "CREATE INDEX IF NOT EXISTS idx_relations_project ON relations(project_id, source_type, source_id)"
  );
  await rawClient.execute(
    "CREATE INDEX IF NOT EXISTS idx_timeline_project ON timeline_events(project_id, event_time, updated_at)"
  );
  await rawClient.execute(
    "CREATE INDEX IF NOT EXISTS idx_ai_providers_provider ON ai_providers(provider, updated_at)"
  );
  await rawClient.execute(
    "CREATE UNIQUE INDEX IF NOT EXISTS idx_ai_aliases_mode ON ai_model_aliases(mode)"
  );
}

async function addColumnIfMissing(tableName: string, columnName: string, definition: string) {
  const rawClient = getRawClient();
  const result = await rawClient.execute(`PRAGMA table_info(${tableName})`);
  const hasColumn = result.rows.some((row) => row.name === columnName);

  if (!hasColumn) {
    await rawClient.execute(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`);
  }
}

function assertDataDirectoryWritable() {
  const testPath = join(dataDir, ".novel-workbench-write-test");
  try {
    writeFileSync(testPath, "ok");
    unlinkSync(testPath);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`乙木数据目录没有写入权限：${dataDir}。请重新运行 start-workbench.command，或允许当前终端访问 Documents。原始错误：${message}`);
  }
}
