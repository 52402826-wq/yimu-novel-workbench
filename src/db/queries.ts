import { and, asc, desc, eq, like, or, sql } from "drizzle-orm";
import { countWords, emptyDocument, stringifyContent } from "@/lib/content";
import { createId } from "@/lib/ids";
import { getDb, initDatabase } from "./client";
import {
  aiModelAliases,
  aiProviders,
  beats,
  chapters,
  libraryItems,
  narrativeThreads,
  projects,
  relations,
  scenes,
  timelineEvents,
  volumes,
  worldEntities,
  type AiModelAlias,
  type AiProviderSetting,
  type Beat,
  type Chapter,
  type LibraryItem,
  type NarrativeThread,
  type Project,
  type Relation,
  type Scene,
  type TimelineEvent,
  type Volume,
  type WorldEntity,
} from "./schema";

export interface WorkspaceProject extends Project {
  volumes: Array<Volume & { chapters: Array<Chapter & { scenes: Array<Scene & { beats: Beat[] }> }> }>;
}

export interface DashboardStats {
  totalWords: number;
  projectCount: number;
  volumeCount: number;
  chapterCount: number;
  sceneCount: number;
  unfinishedScenes: number;
  unresolvedThreads: number;
  entityCount: number;
  libraryCount: number;
  recentlyUpdated: Array<{ id: string; title: string; updatedAt: string; wordCount: number }>;
}

export interface WorkbenchData {
  projects: WorkspaceProject[];
  activeProjectId: string | null;
  worldEntities: WorldEntity[];
  narrativeThreads: NarrativeThread[];
  libraryItems: LibraryItem[];
  relations: Relation[];
  timelineEvents: TimelineEvent[];
  aiSettings: AiSettingsData;
  dashboard: DashboardStats;
}

export interface SafeAiProviderSetting extends Omit<AiProviderSetting, "apiKey"> {
  apiKeyPreview: string;
  hasApiKey: boolean;
}

export interface AiSettingsData {
  providers: SafeAiProviderSetting[];
  aliases: AiModelAlias[];
}

export interface AiRuntimeProviderSetting extends AiProviderSetting {
  mode: string;
  modelName: string;
  temperature: number;
  topP: number;
  maxTokens: number;
  maxContextChars: number;
}

export async function getWorkspace() {
  await initDatabase();
  const db = getDb();

  const [projectRows, volumeRows, chapterRows, sceneRows, beatRows] = await Promise.all([
    db.select().from(projects).orderBy(desc(projects.updatedAt)),
    db.select().from(volumes).orderBy(asc(volumes.sortOrder)),
    db.select().from(chapters).orderBy(asc(chapters.sortOrder)),
    db.select().from(scenes).orderBy(asc(scenes.sortOrder)),
    db.select().from(beats).orderBy(asc(beats.sortOrder)),
  ]);

  return projectRows.map((project) => ({
    ...project,
    volumes: volumeRows
      .filter((volume) => volume.projectId === project.id)
      .map((volume) => ({
        ...volume,
        chapters: chapterRows
          .filter((chapter) => chapter.volumeId === volume.id)
          .map((chapter) => ({
            ...chapter,
            scenes: sceneRows
              .filter((scene) => scene.chapterId === chapter.id)
              .map((scene) => ({
                ...scene,
                beats: beatRows.filter((beat) => beat.sceneId === scene.id),
              })),
          })),
      })),
  }));
}

export async function getWorkbenchData(projectId?: string): Promise<WorkbenchData> {
  await initDatabase();
  const db = getDb();

  const projects = await getWorkspace();
  const activeProjectId = projectId ?? projects[0]?.id ?? null;

  if (!activeProjectId) {
    return {
      projects,
      activeProjectId,
      worldEntities: [],
      narrativeThreads: [],
      libraryItems: [],
      relations: [],
      timelineEvents: [],
      aiSettings: await getAiSettings(),
      dashboard: {
        totalWords: 0,
        projectCount: 0,
        volumeCount: 0,
        chapterCount: 0,
        sceneCount: 0,
        unfinishedScenes: 0,
        unresolvedThreads: 0,
        entityCount: 0,
        libraryCount: 0,
        recentlyUpdated: [],
      },
    };
  }

  const project = projects.find((item) => item.id === activeProjectId) ?? projects[0];
  const chapterRows = project?.volumes.flatMap((volume) =>
    volume.chapters
  ) ?? [];
  const [entityRows, threadRows, libraryRows, relationRows, timelineRows] = await Promise.all([
    db
      .select()
      .from(worldEntities)
      .where(eq(worldEntities.projectId, activeProjectId))
      .orderBy(desc(worldEntities.updatedAt)),
    db
      .select()
      .from(narrativeThreads)
      .where(eq(narrativeThreads.projectId, activeProjectId))
      .orderBy(desc(narrativeThreads.updatedAt)),
    db
      .select()
      .from(libraryItems)
      .where(eq(libraryItems.projectId, activeProjectId))
      .orderBy(desc(libraryItems.updatedAt)),
    db
      .select()
      .from(relations)
      .where(eq(relations.projectId, activeProjectId))
      .orderBy(desc(relations.updatedAt)),
    db
      .select()
      .from(timelineEvents)
      .where(eq(timelineEvents.projectId, activeProjectId))
      .orderBy(asc(timelineEvents.eventTime), desc(timelineEvents.updatedAt)),
  ]);
  const recentlyUpdated = [...chapterRows]
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, 5)
    .map((chapter) => ({
      id: chapter.id,
      title: chapter.title,
      updatedAt: chapter.updatedAt,
      wordCount: chapter.wordCount,
    }));

  return {
    projects,
    activeProjectId,
    worldEntities: entityRows,
    narrativeThreads: threadRows,
    libraryItems: libraryRows,
    relations: relationRows,
    timelineEvents: timelineRows,
    aiSettings: await getAiSettings(),
    dashboard: {
      totalWords: chapterRows.reduce((sum, chapter) => sum + chapter.wordCount, 0),
      projectCount: projects.length,
      volumeCount: project?.volumes.length ?? 0,
      chapterCount: project?.volumes.reduce((sum, volume) => sum + volume.chapters.length, 0) ?? 0,
      sceneCount: 0,
      unfinishedScenes: chapterRows.filter((chapter) => chapter.status !== "完成").length,
      unresolvedThreads: threadRows.filter((thread) => thread.status !== "已回收" && thread.status !== "废弃").length,
      entityCount: entityRows.length,
      libraryCount: libraryRows.length,
      recentlyUpdated,
    },
  };
}

export async function getAiSettings(): Promise<AiSettingsData> {
  await initDatabase();
  const db = getDb();
  const [providerRows, aliasRows] = await Promise.all([
    db.select().from(aiProviders).orderBy(desc(aiProviders.updatedAt)),
    db.select().from(aiModelAliases).orderBy(asc(aiModelAliases.mode)),
  ]);

  return {
    providers: providerRows.map(maskAiProvider),
    aliases: aliasRows,
  };
}

export async function resolveAiRuntimeProvider(input: {
  mode: string;
  providerId?: string | null;
  modelName?: string;
}): Promise<AiRuntimeProviderSetting | null> {
  await initDatabase();
  const db = getDb();
  const normalizedMode = input.mode.trim() || "默认";
  const explicitModelName = input.modelName?.trim() ?? "";
  let alias: AiModelAlias | null = null;
  let provider: AiProviderSetting | null = null;

  if (input.providerId) {
    const [providerRow] = await db
      .select()
      .from(aiProviders)
      .where(eq(aiProviders.id, input.providerId))
      .limit(1);
    provider = providerRow ?? null;
    if (!provider) {
      return null;
    }
  }

  if (!provider) {
    const [modeAlias] = await db
      .select()
      .from(aiModelAliases)
      .where(eq(aiModelAliases.mode, normalizedMode))
      .limit(1);
    alias = modeAlias ?? null;

    if (!alias && normalizedMode !== "默认") {
      const [defaultAlias] = await db
        .select()
        .from(aiModelAliases)
        .where(eq(aiModelAliases.mode, "默认"))
        .limit(1);
      alias = defaultAlias ?? null;
    }

    if (alias?.providerId) {
      const [providerRow] = await db
        .select()
        .from(aiProviders)
        .where(eq(aiProviders.id, alias.providerId))
        .limit(1);
      provider = providerRow ?? null;
    }
  }

  if (!provider) {
    const [enabledProvider] = await db
      .select()
      .from(aiProviders)
      .where(eq(aiProviders.enabled, 1))
      .orderBy(desc(aiProviders.updatedAt))
      .limit(1);
    provider = enabledProvider ?? null;
  }

  if (!provider) {
    return null;
  }

  const modelName = explicitModelName || alias?.modelName.trim() || provider.defaultModel.trim();
  const params = aiModeDefaults(normalizedMode);

  return {
    ...provider,
    mode: normalizedMode,
    modelName,
    temperature: alias?.temperature ?? params.temperature,
    topP: alias?.topP ?? params.topP,
    maxTokens: alias?.maxTokens ?? params.maxTokens,
    maxContextChars: alias?.maxContextChars ?? params.maxContextChars,
  };
}

export async function createAiProviderSetting(input: {
  name: string;
  provider: string;
  baseUrl?: string;
  apiKey?: string;
  defaultModel?: string;
}) {
  await initDatabase();
  const db = getDb();
  const now = new Date().toISOString();
  const setting = {
    id: createId(),
    name: input.name.trim(),
    provider: input.provider.trim(),
    baseUrl: input.baseUrl?.trim() ?? "",
    apiKey: input.apiKey?.trim() ?? "",
    defaultModel: input.defaultModel?.trim() ?? "",
    enabled: 1,
    createdAt: now,
    updatedAt: now,
  };

  await db.insert(aiProviders).values(setting);
  return maskAiProvider(setting);
}

export async function updateAiProviderSetting(
  id: string,
  input: Partial<Pick<AiProviderSetting, "name" | "provider" | "baseUrl" | "apiKey" | "defaultModel" | "enabled">>
) {
  await initDatabase();
  const db = getDb();
  const patch: Partial<AiProviderSetting> = { updatedAt: new Date().toISOString() };

  for (const key of ["name", "provider", "baseUrl", "defaultModel"] as const) {
    if (typeof input[key] === "string") {
      patch[key] = input[key].trim();
    }
  }

  if (typeof input.apiKey === "string" && input.apiKey.trim()) {
    patch.apiKey = input.apiKey.trim();
  }

  if (typeof input.enabled === "number") {
    patch.enabled = input.enabled ? 1 : 0;
  }

  await db.update(aiProviders).set(patch).where(eq(aiProviders.id, id));
  const [provider] = await db.select().from(aiProviders).where(eq(aiProviders.id, id)).limit(1);
  return provider ? maskAiProvider(provider) : null;
}

export async function deleteAiProviderSetting(id: string) {
  await initDatabase();
  const db = getDb();

  const [provider] = await db.select().from(aiProviders).where(eq(aiProviders.id, id)).limit(1);
  if (!provider) {
    return false;
  }

  await db
    .update(aiModelAliases)
    .set({ providerId: null, updatedAt: new Date().toISOString() })
    .where(eq(aiModelAliases.providerId, id));
  await db.delete(aiProviders).where(eq(aiProviders.id, id));
  return true;
}

export async function upsertAiModelAlias(
  mode: string,
  providerId: string | null,
  modelName: string,
  params?: Partial<Pick<AiModelAlias, "temperature" | "topP" | "maxTokens" | "maxContextChars">>
) {
  await initDatabase();
  const db = getDb();
  const now = new Date().toISOString();
  const defaults = aiModeDefaults(mode);
  const normalizedParams = normalizeAiParams(params, defaults);
  const [existing] = await db
    .select()
    .from(aiModelAliases)
    .where(eq(aiModelAliases.mode, mode))
    .limit(1);

  if (existing) {
    await db
      .update(aiModelAliases)
      .set({
        providerId,
        modelName: modelName.trim(),
        ...normalizedParams,
        updatedAt: now,
      })
      .where(eq(aiModelAliases.mode, mode));
    const [updated] = await db
      .select()
      .from(aiModelAliases)
      .where(eq(aiModelAliases.mode, mode))
      .limit(1);
    return updated;
  }

  const alias = {
    id: createId(),
    mode,
    providerId,
    modelName: modelName.trim(),
    ...normalizedParams,
    createdAt: now,
    updatedAt: now,
  };
  await db.insert(aiModelAliases).values(alias);
  return alias;
}

function maskAiProvider(provider: AiProviderSetting): SafeAiProviderSetting {
  return {
    id: provider.id,
    name: provider.name,
    provider: provider.provider,
    baseUrl: provider.baseUrl,
    defaultModel: provider.defaultModel,
    enabled: provider.enabled,
    createdAt: provider.createdAt,
    updatedAt: provider.updatedAt,
    apiKeyPreview: provider.apiKey
      ? `${provider.apiKey.slice(0, 4)}••••${provider.apiKey.slice(-4)}`
      : "",
    hasApiKey: Boolean(provider.apiKey),
  };
}

async function findWorldEntityBySourceTag(projectId: string, sourceTag: string) {
  const db = getDb();
  const rows = await db.select().from(worldEntities).where(eq(worldEntities.projectId, projectId));
  return rows.find((entity) => splitTags(entity.tags).includes(sourceTag)) ?? null;
}

async function findNarrativeThreadBySourceTag(projectId: string, sourceTag: string) {
  const db = getDb();
  const rows = await db.select().from(narrativeThreads).where(eq(narrativeThreads.projectId, projectId));
  return rows.find((thread) => thread.summary.includes(sourceTag)) ?? null;
}

function mergeTags(existingTags: string, sourceTag: string) {
  return [...new Set([...splitTags(existingTags), sourceTag].filter(Boolean))].join(", ");
}

function splitTags(tags: string) {
  return tags
    .split(/[,，]/)
    .map((tag) => tag.trim())
    .filter(Boolean);
}

function appendSourceTag(text: string, sourceTag: string) {
  const body = text.replace(/\n\n导入来源：[\s\S]+$/, "").trim();
  return `${body}\n\n导入来源：${sourceTag}`.trim();
}

function aiModeDefaults(mode: string) {
  const defaults: Record<string, Pick<AiModelAlias, "temperature" | "topP" | "maxTokens" | "maxContextChars">> = {
    默认: { temperature: 50, topP: 90, maxTokens: 1600, maxContextChars: 6000 },
    创作: { temperature: 78, topP: 95, maxTokens: 2600, maxContextChars: 8000 },
    分析: { temperature: 35, topP: 85, maxTokens: 2200, maxContextChars: 10000 },
    快速: { temperature: 30, topP: 80, maxTokens: 900, maxContextChars: 3000 },
  };
  return defaults[mode] ?? defaults["默认"];
}

function normalizeAiParams(
  params: Partial<Pick<AiModelAlias, "temperature" | "topP" | "maxTokens" | "maxContextChars">> | undefined,
  defaults: Pick<AiModelAlias, "temperature" | "topP" | "maxTokens" | "maxContextChars">
) {
  return {
    temperature: clampInteger(params?.temperature, 0, 200, defaults.temperature),
    topP: clampInteger(params?.topP, 1, 100, defaults.topP),
    maxTokens: clampInteger(params?.maxTokens, 300, 12000, defaults.maxTokens),
    maxContextChars: clampInteger(params?.maxContextChars, 1000, 50000, defaults.maxContextChars),
  };
}

function clampInteger(value: unknown, min: number, max: number, fallback: number) {
  const number = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(number)) {
    return fallback;
  }
  return Math.max(min, Math.min(max, Math.round(number)));
}

export async function createProject(name: string) {
  await initDatabase();
  const db = getDb();

  const now = new Date().toISOString();
  const project = {
    id: createId(),
    name: name.trim(),
    description: "",
    createdAt: now,
    updatedAt: now,
  };
  const volume = {
    id: createId(),
    projectId: project.id,
    title: "第一卷",
    sortOrder: 1,
    createdAt: now,
    updatedAt: now,
  };
  const chapter = {
    id: createId(),
    volumeId: volume.id,
    title: "第一章",
    summary: "",
    storyTime: "",
    contentJson: stringifyContent(emptyDocument),
    contentText: "",
    wordCount: 0,
    status: "草稿",
    sortOrder: 1,
    createdAt: now,
    updatedAt: now,
  };
  const scene = {
    id: createId(),
    chapterId: chapter.id,
    title: `${chapter.title} · 底层场景`,
    summary: "",
    pov: "",
    goal: "",
    conflict: "",
    outcome: "",
    storyTime: "",
    contentJson: stringifyContent(emptyDocument),
    contentText: "",
    wordCount: 0,
    sortOrder: 1,
    status: "草稿",
    createdAt: now,
    updatedAt: now,
  };

  await db.insert(projects).values(project);
  await db.insert(volumes).values(volume);
  await db.insert(chapters).values(chapter);
  await db.insert(scenes).values(scene);

  return { project, volume, chapter: { ...chapter, scenes: [scene] } };
}

export async function deleteProject(id: string) {
  await initDatabase();
  const db = getDb();

  const [project] = await db.select().from(projects).where(eq(projects.id, id)).limit(1);
  if (!project) {
    return false;
  }

  await db.delete(projects).where(eq(projects.id, id));
  return true;
}

export async function createVolume(projectId: string, title: string) {
  await initDatabase();
  const db = getDb();

  const now = new Date().toISOString();
  const [{ nextSort }] = await db
    .select({ nextSort: sql<number>`coalesce(max(${volumes.sortOrder}), 0) + 1` })
    .from(volumes)
    .where(eq(volumes.projectId, projectId));
  const volume = {
    id: createId(),
    projectId,
    title: title.trim(),
    sortOrder: nextSort,
    createdAt: now,
    updatedAt: now,
  };

  await db.insert(volumes).values(volume);
  await db.update(projects).set({ updatedAt: now }).where(eq(projects.id, projectId));

  return volume;
}

export async function deleteVolume(id: string) {
  await initDatabase();
  const db = getDb();

  const [volume] = await db.select().from(volumes).where(eq(volumes.id, id)).limit(1);
  if (!volume) {
    return false;
  }

  const chapterRows = await db.select().from(chapters).where(eq(chapters.volumeId, id));
  const chapterIds = new Set(chapterRows.map((chapter) => chapter.id));
  const sceneRows = (await db.select().from(scenes)).filter((scene) => chapterIds.has(scene.chapterId));
  for (const scene of sceneRows) {
    await db.delete(relations).where(or(eq(relations.sourceId, scene.id), eq(relations.targetId, scene.id)));
  }

  await db.delete(volumes).where(eq(volumes.id, id));
  await db.update(projects).set({ updatedAt: new Date().toISOString() }).where(eq(projects.id, volume.projectId));
  return true;
}

export async function createChapter(volumeId: string, title: string) {
  await initDatabase();
  const db = getDb();

  const now = new Date().toISOString();
  const [{ nextSort }] = await db
    .select({ nextSort: sql<number>`coalesce(max(${chapters.sortOrder}), 0) + 1` })
    .from(chapters)
    .where(eq(chapters.volumeId, volumeId));
  const chapter = {
    id: createId(),
    volumeId,
    title: title.trim(),
    summary: "",
    storyTime: "",
    contentJson: stringifyContent(emptyDocument),
    contentText: "",
    wordCount: 0,
    status: "草稿",
    sortOrder: nextSort,
    createdAt: now,
    updatedAt: now,
  };
  const scene = {
    id: createId(),
    chapterId: chapter.id,
    title: `${chapter.title} · 底层场景`,
    summary: "",
    pov: "",
    goal: "",
    conflict: "",
    outcome: "",
    storyTime: "",
    contentJson: stringifyContent(emptyDocument),
    contentText: "",
    wordCount: 0,
    sortOrder: 1,
    status: "草稿",
    createdAt: now,
    updatedAt: now,
  };

  await db.insert(chapters).values(chapter);
  await db.insert(scenes).values(scene);
  return { ...chapter, scenes: [scene] };
}

export async function deleteChapter(id: string) {
  await initDatabase();
  const db = getDb();

  const [chapter] = await db.select().from(chapters).where(eq(chapters.id, id)).limit(1);
  if (!chapter) {
    return false;
  }

  const sceneRows = await db.select().from(scenes).where(eq(scenes.chapterId, id));
  for (const scene of sceneRows) {
    await db.delete(relations).where(or(eq(relations.sourceId, scene.id), eq(relations.targetId, scene.id)));
  }

  await db.delete(chapters).where(eq(chapters.id, id));
  return true;
}

export async function getChapter(chapterId: string) {
  await initDatabase();
  const db = getDb();

  const [chapter] = await db.select().from(chapters).where(eq(chapters.id, chapterId)).limit(1);
  return chapter ?? null;
}

export async function updateChapter(
  chapterId: string,
  input: {
    title?: string;
    summary?: string;
    storyTime?: string;
    status?: string;
    contentJson?: string;
    contentText?: string;
  }
) {
  await initDatabase();
  const db = getDb();

  const now = new Date().toISOString();
  const patch: Partial<Chapter> = { updatedAt: now };

  if (typeof input.title === "string" && input.title.trim()) {
    patch.title = input.title.trim();
  }

  for (const key of ["summary", "storyTime", "status"] as const) {
    if (typeof input[key] === "string") {
      patch[key] = input[key].trim();
    }
  }

  if (typeof input.contentJson === "string") {
    patch.contentJson = input.contentJson;
  }

  if (typeof input.contentText === "string") {
    patch.contentText = input.contentText;
    patch.wordCount = countWords(input.contentText);
  }

  await db.update(chapters).set(patch).where(eq(chapters.id, chapterId));
  if (patch.title) {
    const [baseScene] = await db
      .select()
      .from(scenes)
      .where(eq(scenes.chapterId, chapterId))
      .orderBy(asc(scenes.sortOrder))
      .limit(1);
    if (baseScene) {
      await db
        .update(scenes)
        .set({ title: `${patch.title} · 底层场景`, updatedAt: now })
        .where(eq(scenes.id, baseScene.id));
    }
  }
  return getChapter(chapterId);
}

export async function createScene(chapterId: string, title: string) {
  await initDatabase();
  const db = getDb();

  const now = new Date().toISOString();
  const [{ nextSort }] = await db
    .select({ nextSort: sql<number>`coalesce(max(${scenes.sortOrder}), 0) + 1` })
    .from(scenes)
    .where(eq(scenes.chapterId, chapterId));
  const scene = {
    id: createId(),
    chapterId,
    title: title.trim(),
    summary: "",
    pov: "",
    goal: "",
    conflict: "",
    outcome: "",
    storyTime: "",
    contentJson: stringifyContent(emptyDocument),
    contentText: "",
    wordCount: 0,
    sortOrder: nextSort,
    status: "草稿",
    createdAt: now,
    updatedAt: now,
  };

  await db.insert(scenes).values(scene);
  return scene;
}

export async function deleteScene(id: string) {
  await initDatabase();
  const db = getDb();

  const [scene] = await db.select().from(scenes).where(eq(scenes.id, id)).limit(1);
  if (!scene) {
    return false;
  }

  await db.delete(relations).where(or(eq(relations.sourceId, id), eq(relations.targetId, id)));
  await db.delete(scenes).where(eq(scenes.id, id));
  return true;
}

export async function getScene(sceneId: string) {
  await initDatabase();
  const db = getDb();

  const [scene] = await db.select().from(scenes).where(eq(scenes.id, sceneId)).limit(1);
  return scene ?? null;
}

export async function updateScene(
  sceneId: string,
  input: {
    title?: string;
    summary?: string;
    pov?: string;
    goal?: string;
    conflict?: string;
    outcome?: string;
    storyTime?: string;
    status?: string;
    contentJson?: string;
    contentText?: string;
  }
) {
  await initDatabase();
  const db = getDb();

  const now = new Date().toISOString();
  const patch: Partial<Scene> = { updatedAt: now };

  if (typeof input.title === "string" && input.title.trim()) {
    patch.title = input.title.trim();
  }

  for (const key of ["summary", "pov", "goal", "conflict", "outcome", "storyTime", "status"] as const) {
    if (typeof input[key] === "string") {
      patch[key] = input[key].trim();
    }
  }

  if (typeof input.contentJson === "string") {
    patch.contentJson = input.contentJson;
  }

  if (typeof input.contentText === "string") {
    patch.contentText = input.contentText;
    patch.wordCount = countWords(input.contentText);
  }

  await db.update(scenes).set(patch).where(eq(scenes.id, sceneId));
  return getScene(sceneId);
}

export async function createBeat(sceneId: string, title: string) {
  await initDatabase();
  const db = getDb();

  const now = new Date().toISOString();
  const [{ nextSort }] = await db
    .select({ nextSort: sql<number>`coalesce(max(${beats.sortOrder}), 0) + 1` })
    .from(beats)
    .where(eq(beats.sceneId, sceneId));
  const beat = {
    id: createId(),
    sceneId,
    title: title.trim(),
    summary: "",
    status: "计划中",
    sortOrder: nextSort,
    createdAt: now,
    updatedAt: now,
  };

  await db.insert(beats).values(beat);
  return beat;
}

export async function deleteBeat(id: string) {
  await initDatabase();
  const db = getDb();

  const [beat] = await db.select().from(beats).where(eq(beats.id, id)).limit(1);
  if (!beat) {
    return false;
  }

  await db.delete(beats).where(eq(beats.id, id));
  return true;
}

export async function createWorldEntity(projectId: string, type: string, name: string) {
  await initDatabase();
  const db = getDb();
  const now = new Date().toISOString();
  const entity = {
    id: createId(),
    projectId,
    type,
    name: name.trim(),
    summary: "",
    content: "",
    tags: "",
    status: "活跃",
    createdAt: now,
    updatedAt: now,
  };

  await db.insert(worldEntities).values(entity);
  return entity;
}

export async function importWorldEntities(
  projectId: string,
  items: Array<Pick<WorldEntity, "type" | "name" | "summary" | "content" | "tags"> & { sourceTag: string }>
) {
  await initDatabase();
  const db = getDb();
  const now = new Date().toISOString();
  const imported: WorldEntity[] = [];
  let created = 0;
  let updated = 0;

  for (const input of items) {
    const tags = mergeTags(input.tags, input.sourceTag);
    const existing = await findWorldEntityBySourceTag(projectId, input.sourceTag);
    const nextEntity = {
      projectId,
      type: input.type.trim() || "资料",
      name: input.name.trim(),
      summary: input.summary.trim(),
      content: input.content.trim(),
      tags,
      status: "活跃",
      updatedAt: now,
    };

    if (existing) {
      await db.update(worldEntities).set(nextEntity).where(eq(worldEntities.id, existing.id));
      const [entity] = await db.select().from(worldEntities).where(eq(worldEntities.id, existing.id)).limit(1);
      if (entity) {
        imported.push(entity);
      }
      updated += 1;
      continue;
    }

    const entity = {
      id: createId(),
      ...nextEntity,
      createdAt: now,
    };
    await db.insert(worldEntities).values(entity);
    imported.push(entity);
    created += 1;
  }

  return { imported, created, updated };
}

export async function deleteWorldEntitiesBySourceTags(projectId: string, sourceTags: string[]) {
  await initDatabase();
  const db = getDb();
  const uniqueTags = [...new Set(sourceTags.map((tag) => tag.trim()).filter(Boolean))];
  let deleted = 0;

  for (const sourceTag of uniqueTags) {
    const entity = await findWorldEntityBySourceTag(projectId, sourceTag);
    if (!entity) {
      continue;
    }
    await db.delete(relations).where(or(eq(relations.sourceId, entity.id), eq(relations.targetId, entity.id)));
    await db.delete(worldEntities).where(eq(worldEntities.id, entity.id));
    deleted += 1;
  }

  return deleted;
}

export async function updateWorldEntity(id: string, input: Partial<Pick<WorldEntity, "type" | "name" | "summary" | "content" | "tags" | "status">>) {
  await initDatabase();
  const db = getDb();
  const patch: Partial<WorldEntity> = { updatedAt: new Date().toISOString() };

  for (const key of ["type", "name", "summary", "content", "tags", "status"] as const) {
    if (typeof input[key] === "string") {
      patch[key] = input[key]?.trim() ?? "";
    }
  }

  await db.update(worldEntities).set(patch).where(eq(worldEntities.id, id));
  const [entity] = await db.select().from(worldEntities).where(eq(worldEntities.id, id)).limit(1);
  return entity ?? null;
}

export async function deleteWorldEntity(id: string) {
  await initDatabase();
  const db = getDb();

  const [entity] = await db.select().from(worldEntities).where(eq(worldEntities.id, id)).limit(1);
  if (!entity) {
    return false;
  }

  await db.delete(relations).where(or(eq(relations.sourceId, id), eq(relations.targetId, id)));
  await db.delete(worldEntities).where(eq(worldEntities.id, id));
  return true;
}

export async function createNarrativeThread(projectId: string, type: string, title: string, summary = "") {
  await initDatabase();
  const db = getDb();
  const now = new Date().toISOString();
  const thread = {
    id: createId(),
    projectId,
    type,
    title: title.trim(),
    summary: summary.trim(),
    status: "计划中",
    startSceneId: null,
    resolvedSceneId: null,
    createdAt: now,
    updatedAt: now,
  };

  await db.insert(narrativeThreads).values(thread);
  return thread;
}

export async function importNarrativeThreads(
  projectId: string,
  items: Array<Pick<NarrativeThread, "type" | "title" | "summary"> & { sourceTag: string }>
) {
  await initDatabase();
  const db = getDb();
  const now = new Date().toISOString();
  const imported: NarrativeThread[] = [];
  let created = 0;
  let updated = 0;

  for (const input of items) {
    const existing = await findNarrativeThreadBySourceTag(projectId, input.sourceTag);
    const nextThread = {
      projectId,
      type: input.type.trim() || "伏笔",
      title: input.title.trim(),
      summary: appendSourceTag(input.summary.trim(), input.sourceTag),
      status: "计划中",
      startSceneId: null,
      resolvedSceneId: null,
      updatedAt: now,
    };

    if (existing) {
      await db.update(narrativeThreads).set(nextThread).where(eq(narrativeThreads.id, existing.id));
      const [thread] = await db.select().from(narrativeThreads).where(eq(narrativeThreads.id, existing.id)).limit(1);
      if (thread) {
        imported.push(thread);
      }
      updated += 1;
      continue;
    }

    const thread = {
      id: createId(),
      ...nextThread,
      createdAt: now,
    };
    await db.insert(narrativeThreads).values(thread);
    imported.push(thread);
    created += 1;
  }

  return { imported, created, updated };
}

export async function deleteNarrativeThreadsBySourceTags(projectId: string, sourceTags: string[]) {
  await initDatabase();
  const db = getDb();
  const uniqueTags = [...new Set(sourceTags.map((tag) => tag.trim()).filter(Boolean))];
  let deleted = 0;

  for (const sourceTag of uniqueTags) {
    const thread = await findNarrativeThreadBySourceTag(projectId, sourceTag);
    if (!thread) {
      continue;
    }
    await db.delete(relations).where(or(eq(relations.sourceId, thread.id), eq(relations.targetId, thread.id)));
    await db.delete(narrativeThreads).where(eq(narrativeThreads.id, thread.id));
    deleted += 1;
  }

  return deleted;
}

export async function updateNarrativeThread(
  id: string,
  input: Partial<Pick<NarrativeThread, "type" | "title" | "summary" | "status" | "startSceneId" | "resolvedSceneId">>
) {
  await initDatabase();
  const db = getDb();
  const patch: Partial<NarrativeThread> = { updatedAt: new Date().toISOString() };

  for (const key of ["type", "title", "summary", "status"] as const) {
    if (typeof input[key] === "string") {
      patch[key] = input[key].trim();
    }
  }

  for (const key of ["startSceneId", "resolvedSceneId"] as const) {
    if (typeof input[key] === "string") {
      patch[key] = input[key].trim() || null;
    }
  }

  await db.update(narrativeThreads).set(patch).where(eq(narrativeThreads.id, id));
  const [thread] = await db.select().from(narrativeThreads).where(eq(narrativeThreads.id, id)).limit(1);
  return thread ?? null;
}

export async function deleteNarrativeThread(id: string) {
  await initDatabase();
  const db = getDb();

  const [thread] = await db.select().from(narrativeThreads).where(eq(narrativeThreads.id, id)).limit(1);
  if (!thread) {
    return false;
  }

  await db.delete(relations).where(or(eq(relations.sourceId, id), eq(relations.targetId, id)));
  await db.delete(narrativeThreads).where(eq(narrativeThreads.id, id));
  return true;
}

export async function createLibraryItem(projectId: string, type: string, title: string) {
  await initDatabase();
  const db = getDb();
  const now = new Date().toISOString();
  const item = {
    id: createId(),
    projectId,
    type,
    title: title.trim(),
    content: "",
    source: "",
    tags: "",
    createdAt: now,
    updatedAt: now,
  };

  await db.insert(libraryItems).values(item);
  return item;
}

export async function importLibraryItems(
  projectId: string,
  items: Array<Pick<LibraryItem, "type" | "title" | "content" | "source" | "tags">>
) {
  await initDatabase();
  const db = getDb();
  const now = new Date().toISOString();
  const imported: LibraryItem[] = [];
  let created = 0;
  let updated = 0;

  for (const input of items) {
    const source = input.source.trim();
    const [existing] = source
      ? await db
          .select()
          .from(libraryItems)
          .where(and(eq(libraryItems.projectId, projectId), eq(libraryItems.source, source)))
          .limit(1)
      : [];
    const nextItem = {
      projectId,
      type: input.type.trim() || "资料",
      title: input.title.trim(),
      content: input.content.trim(),
      source,
      tags: input.tags.trim(),
      updatedAt: now,
    };

    if (existing) {
      await db.update(libraryItems).set(nextItem).where(eq(libraryItems.id, existing.id));
      const [item] = await db.select().from(libraryItems).where(eq(libraryItems.id, existing.id)).limit(1);
      if (item) {
        imported.push(item);
      }
      updated += 1;
      continue;
    }

    const item = {
      id: createId(),
      ...nextItem,
      createdAt: now,
    };
    await db.insert(libraryItems).values(item);
    imported.push(item);
    created += 1;
  }

  return { imported, created, updated };
}

export async function deleteLibraryItemsBySources(projectId: string, sources: string[]) {
  await initDatabase();
  const db = getDb();
  const uniqueSources = [...new Set(sources.map((source) => source.trim()).filter(Boolean))];
  let deleted = 0;

  for (const source of uniqueSources) {
    const rows = await db
      .select()
      .from(libraryItems)
      .where(and(eq(libraryItems.projectId, projectId), eq(libraryItems.source, source)));
    for (const item of rows) {
      await db.delete(relations).where(or(eq(relations.sourceId, item.id), eq(relations.targetId, item.id)));
      await db.delete(libraryItems).where(eq(libraryItems.id, item.id));
      deleted += 1;
    }
  }

  return deleted;
}

export async function updateLibraryItem(id: string, input: Partial<Pick<LibraryItem, "type" | "title" | "content" | "source" | "tags">>) {
  await initDatabase();
  const db = getDb();
  const patch: Partial<LibraryItem> = { updatedAt: new Date().toISOString() };

  for (const key of ["type", "title", "content", "source", "tags"] as const) {
    if (typeof input[key] === "string") {
      patch[key] = input[key]?.trim() ?? "";
    }
  }

  await db.update(libraryItems).set(patch).where(eq(libraryItems.id, id));
  const [item] = await db.select().from(libraryItems).where(eq(libraryItems.id, id)).limit(1);
  return item ?? null;
}

export async function deleteLibraryItem(id: string) {
  await initDatabase();
  const db = getDb();

  const [item] = await db.select().from(libraryItems).where(eq(libraryItems.id, id)).limit(1);
  if (!item) {
    return false;
  }

  await db.delete(relations).where(or(eq(relations.sourceId, id), eq(relations.targetId, id)));
  await db.delete(libraryItems).where(eq(libraryItems.id, id));
  return true;
}

export async function createRelation(
  projectId: string,
  input: Pick<Relation, "sourceType" | "sourceId" | "targetType" | "targetId" | "relationType"> & {
    note?: string;
  }
) {
  await initDatabase();
  const db = getDb();
  const now = new Date().toISOString();
  const [existing] = await db
    .select()
    .from(relations)
    .where(
      and(
        eq(relations.projectId, projectId),
        eq(relations.sourceType, input.sourceType),
        eq(relations.sourceId, input.sourceId),
        eq(relations.targetType, input.targetType),
        eq(relations.targetId, input.targetId)
      )
    )
    .limit(1);

  if (existing) {
    const patch = {
      relationType: input.relationType,
      note: input.note?.trim() ?? existing.note,
      updatedAt: now,
    };
    await db.update(relations).set(patch).where(eq(relations.id, existing.id));
    const [relation] = await db.select().from(relations).where(eq(relations.id, existing.id)).limit(1);
    return relation ?? existing;
  }

  const relation = {
    id: createId(),
    projectId,
    sourceType: input.sourceType,
    sourceId: input.sourceId,
    targetType: input.targetType,
    targetId: input.targetId,
    relationType: input.relationType,
    note: input.note?.trim() ?? "",
    createdAt: now,
    updatedAt: now,
  };

  await db.insert(relations).values(relation);
  return relation;
}

export async function deleteRelation(id: string) {
  await initDatabase();
  const db = getDb();

  const [relation] = await db.select().from(relations).where(eq(relations.id, id)).limit(1);
  if (!relation) {
    return false;
  }

  await db.delete(relations).where(eq(relations.id, id));
  return true;
}

export async function createTimelineEvent(
  projectId: string,
  input: Pick<TimelineEvent, "title"> &
    Partial<Pick<TimelineEvent, "eventTime" | "type" | "location" | "participants" | "sceneId" | "summary">>
) {
  await initDatabase();
  const db = getDb();
  const now = new Date().toISOString();
  const event = {
    id: createId(),
    projectId,
    title: input.title.trim(),
    eventTime: input.eventTime?.trim() ?? "",
    type: input.type?.trim() || "正文",
    location: input.location?.trim() ?? "",
    participants: input.participants?.trim() ?? "",
    sceneId: input.sceneId?.trim() || null,
    summary: input.summary?.trim() ?? "",
    createdAt: now,
    updatedAt: now,
  };

  await db.insert(timelineEvents).values(event);
  return event;
}

export async function updateTimelineEvent(
  id: string,
  input: Partial<Pick<TimelineEvent, "title" | "eventTime" | "type" | "location" | "participants" | "sceneId" | "summary">>
) {
  await initDatabase();
  const db = getDb();
  const patch: Partial<TimelineEvent> = { updatedAt: new Date().toISOString() };

  for (const key of ["title", "eventTime", "type", "location", "participants", "summary"] as const) {
    if (typeof input[key] === "string") {
      patch[key] = input[key]?.trim() ?? "";
    }
  }

  if (typeof input.sceneId === "string") {
    patch.sceneId = input.sceneId.trim() || null;
  }

  await db.update(timelineEvents).set(patch).where(eq(timelineEvents.id, id));
  const [event] = await db.select().from(timelineEvents).where(eq(timelineEvents.id, id)).limit(1);
  return event ?? null;
}

export async function deleteTimelineEvent(id: string) {
  await initDatabase();
  const db = getDb();

  const [event] = await db.select().from(timelineEvents).where(eq(timelineEvents.id, id)).limit(1);
  if (!event) {
    return false;
  }

  await db.delete(timelineEvents).where(eq(timelineEvents.id, id));
  return true;
}

export async function searchAll(query: string, projectId?: string) {
  await initDatabase();
  const db = getDb();

  const trimmed = query.trim();
  if (!trimmed) {
    return [];
  }

  const pattern = `%${trimmed}%`;

  const chapterResults = await db
    .select({
      kind: sql<string>`'正文'`,
      id: chapters.id,
      title: chapters.title,
      subtitle: volumes.title,
      excerpt: chapters.contentText,
      updatedAt: chapters.updatedAt,
    })
    .from(chapters)
    .innerJoin(volumes, eq(volumes.id, chapters.volumeId))
    .innerJoin(projects, eq(projects.id, volumes.projectId))
    .where(or(like(chapters.title, pattern), like(chapters.contentText, pattern)))
    .orderBy(desc(chapters.updatedAt))
    .limit(40);
  const [entityResults, threadResults, libraryResults] = await Promise.all([
    db
      .select({
        kind: sql<string>`'世界'`,
        id: worldEntities.id,
        title: worldEntities.name,
        subtitle: worldEntities.type,
        excerpt: worldEntities.summary,
        updatedAt: worldEntities.updatedAt,
      })
      .from(worldEntities)
      .where(or(like(worldEntities.name, pattern), like(worldEntities.summary, pattern), like(worldEntities.content, pattern)))
      .orderBy(desc(worldEntities.updatedAt))
      .limit(30),
    db
      .select({
        kind: sql<string>`'线索'`,
        id: narrativeThreads.id,
        title: narrativeThreads.title,
        subtitle: narrativeThreads.type,
        excerpt: narrativeThreads.summary,
        updatedAt: narrativeThreads.updatedAt,
      })
      .from(narrativeThreads)
      .where(or(like(narrativeThreads.title, pattern), like(narrativeThreads.summary, pattern)))
      .orderBy(desc(narrativeThreads.updatedAt))
      .limit(30),
    db
      .select({
        kind: sql<string>`'资料'`,
        id: libraryItems.id,
        title: libraryItems.title,
        subtitle: libraryItems.type,
        excerpt: libraryItems.content,
        updatedAt: libraryItems.updatedAt,
      })
      .from(libraryItems)
      .where(or(like(libraryItems.title, pattern), like(libraryItems.content, pattern), like(libraryItems.source, pattern)))
      .orderBy(desc(libraryItems.updatedAt))
      .limit(30),
  ]);

  const allResults = [...chapterResults, ...entityResults, ...threadResults, ...libraryResults]
    .filter((result) => {
      if (!projectId || result.kind === "正文") {
        return true;
      }
      return true;
    })
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, 60);

  return allResults;
}
