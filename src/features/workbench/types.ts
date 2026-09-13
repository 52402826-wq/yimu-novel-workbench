export interface BeatNode {
  id: string;
  sceneId: string;
  title: string;
  summary: string;
  status: string;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface SceneNode {
  id: string;
  chapterId: string;
  title: string;
  summary: string;
  pov: string;
  goal: string;
  conflict: string;
  outcome: string;
  storyTime: string;
  contentJson: string;
  contentText: string;
  wordCount: number;
  sortOrder: number;
  status: string;
  createdAt: string;
  updatedAt: string;
  beats: BeatNode[];
}

export interface ChapterNode {
  id: string;
  volumeId: string;
  title: string;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
  scenes: SceneNode[];
}

export interface VolumeNode {
  id: string;
  projectId: string;
  title: string;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
  chapters: ChapterNode[];
}

export interface ProjectNode {
  id: string;
  name: string;
  description: string;
  createdAt: string;
  updatedAt: string;
  volumes: VolumeNode[];
}

export interface WorldEntity {
  id: string;
  projectId: string;
  type: string;
  name: string;
  summary: string;
  content: string;
  tags: string;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export interface NarrativeThread {
  id: string;
  projectId: string;
  type: string;
  title: string;
  summary: string;
  status: string;
  startSceneId: string | null;
  resolvedSceneId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface LibraryItem {
  id: string;
  projectId: string;
  type: string;
  title: string;
  content: string;
  source: string;
  tags: string;
  createdAt: string;
  updatedAt: string;
}

export interface RelationItem {
  id: string;
  projectId: string;
  sourceType: string;
  sourceId: string;
  targetType: string;
  targetId: string;
  relationType: string;
  note: string;
  createdAt: string;
  updatedAt: string;
}

export interface TimelineEvent {
  id: string;
  projectId: string;
  title: string;
  eventTime: string;
  type: string;
  location: string;
  participants: string;
  sceneId: string | null;
  summary: string;
  createdAt: string;
  updatedAt: string;
}

export interface AiProviderSetting {
  id: string;
  name: string;
  provider: string;
  baseUrl: string;
  defaultModel: string;
  enabled: number;
  apiKeyPreview: string;
  hasApiKey: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AiModelAlias {
  id: string;
  mode: string;
  providerId: string | null;
  modelName: string;
  temperature: number;
  topP: number;
  maxTokens: number;
  maxContextChars: number;
  createdAt: string;
  updatedAt: string;
}

export interface AiSettingsData {
  providers: AiProviderSetting[];
  aliases: AiModelAlias[];
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
  projects: ProjectNode[];
  activeProjectId: string | null;
  worldEntities: WorldEntity[];
  narrativeThreads: NarrativeThread[];
  libraryItems: LibraryItem[];
  relations: RelationItem[];
  timelineEvents: TimelineEvent[];
  aiSettings: AiSettingsData;
  dashboard: DashboardStats;
}

export interface SearchResult {
  kind: string;
  id: string;
  title: string;
  subtitle: string;
  excerpt: string;
  updatedAt: string;
  sceneId?: string;
}
