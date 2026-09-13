"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { JSONContent } from "@tiptap/react";
import clsx from "clsx";
import {
  BookOpen,
  Bot,
  CalendarDays,
  FilePlus2,
  FileText,
  FolderPlus,
  GitBranch,
  Home,
  KeyRound,
  Library,
  Link2,
  MapPin,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Save,
  Search,
  Sparkles,
  Target,
  Trash2,
  UploadCloud,
  Users,
} from "lucide-react";
import { stringifyContent } from "@/lib/content";
import { ManuscriptEditor } from "./ManuscriptEditor";
import type { ManuscriptSelectionAction } from "./ManuscriptEditor";
import type {
  AiModelAlias,
  AiProviderSetting,
  AiSettingsData,
  LibraryItem,
  NarrativeThread,
  ProjectNode,
  SceneNode,
  SearchResult,
  WorkbenchData,
  WorldEntity,
} from "./types";

type SaveState = "已保存" | "保存中" | "有改动" | "保存失败";
type ViewKey = "首页" | "正文" | "构建" | "故事" | "世界" | "线索" | "时间轴" | "资料" | "关系" | "导入" | "AI";
type ManuscriptSideTab = "AI" | "关联";
type AiAction = "分析当前 Scene" | "续写建议" | "润色建议" | "改写建议" | "故事构建";
type AiMode = "默认" | "创作" | "分析" | "快速";
type AiAliasParams = Pick<AiModelAlias, "temperature" | "topP" | "maxTokens" | "maxContextChars">;
type AiAliasDraft = {
  providerId: string;
  modelName: string;
} & AiAliasParams;
type BuildMessage = {
  role: "你" | "AI";
  content: string;
};
type BuildTab = "创意访谈" | "总纲生成" | "模块沉淀" | "章节细纲";
type BuildHistoryItem = {
  id: string;
  title: string;
  kind: "总纲" | "章节细纲";
  focus: string;
  content: string;
  createdAt: string;
};
type AiProviderInput = {
  name: string;
  provider: string;
  baseUrl: string;
  defaultModel: string;
  apiKey: string;
};
type ImportScanItem = {
  path: string;
  relativePath: string;
  title: string;
  typeGuess: string;
  tags: string[];
  links: string[];
  excerpt: string;
  size: number;
  modifiedAt: string;
};
type ImportTarget = "auto" | "world" | "thread" | "library" | "skip";

const entityTypes = ["人物", "地点", "势力", "组织", "物品", "规则", "能力", "事件", "术语"];
const threadTypes = ["伏笔", "悬念", "任务", "秘密", "感情线", "冲突线"];
const libraryTypes = ["资料", "大纲", "人物", "地点", "势力", "规则", "伏笔", "Scene 参考", "灵感", "研究资料", "摘录", "参考", "笔记"];
const timelineTypes = ["前史", "正文", "尾声", "伏笔", "回收", "背景"];
const importTargetOptions: Array<{ value: ImportTarget; label: string }> = [
  { value: "auto", label: "自动分流" },
  { value: "world", label: "世界" },
  { value: "thread", label: "线索" },
  { value: "library", label: "资料库" },
  { value: "skip", label: "暂不导入" },
];
const sceneStatuses = ["草稿", "修订", "完成", "废稿"];
const threadStatuses = ["计划中", "已埋设", "推进中", "已回收", "废弃"];
const aiProviderTypes = ["openai", "deepseek", "kimi", "claude", "gemini", "openai-compatible"];
const aiAliasModes: AiMode[] = ["默认", "创作", "分析", "快速"];
const aiAliasDefaultParams: Record<AiMode, AiAliasParams> = {
  默认: { temperature: 50, topP: 90, maxTokens: 1600, maxContextChars: 6000 },
  创作: { temperature: 78, topP: 95, maxTokens: 2600, maxContextChars: 8000 },
  分析: { temperature: 35, topP: 85, maxTokens: 2200, maxContextChars: 10000 },
  快速: { temperature: 30, topP: 80, maxTokens: 900, maxContextChars: 3000 },
};
const buildFocusOptions = ["完整新书", "故事核心", "人物关系", "世界规则", "伏笔暗线", "章节推进"];

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...init?.headers,
      },
    });
  } catch {
    throw new Error("无法连接工作台服务。请运行 start-workbench.command，或在项目目录执行 pnpm workbench:start。");
  }

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    const error = parseErrorMessage(errorText);
    if (error) {
      throw new Error(error);
    }
    if (response.status >= 500) {
      throw new Error("服务器写入失败。常见原因是数据目录没有写入权限，或服务需要重新启动。请运行 start-workbench.command 后再试。");
    }
    throw new Error("请求失败。");
  }

  return response.json() as Promise<T>;
}

function parseErrorMessage(text: string) {
  if (!text) {
    return "";
  }
  try {
    const error = JSON.parse(text) as { message?: string };
    return error.message ?? "";
  } catch {
    return "";
  }
}

function firstScene(projects: ProjectNode[]) {
  for (const project of projects) {
    for (const volume of project.volumes) {
      for (const chapter of volume.chapters) {
        if (chapter.scenes[0]) {
          return chapter.scenes[0];
        }
      }
    }
  }
  return null;
}

function findScene(projects: ProjectNode[], sceneId: string | null) {
  if (!sceneId) {
    return null;
  }
  for (const project of projects) {
    for (const volume of project.volumes) {
      for (const chapter of volume.chapters) {
        const scene = chapter.scenes.find((item) => item.id === sceneId);
        if (scene) {
          return scene;
        }
      }
    }
  }
  return null;
}

function excerpt(text: string, query: string) {
  if (!text) {
    return "还没有正文或摘要。";
  }
  const index = query ? text.indexOf(query) : -1;
  const start = index > 18 ? index - 18 : 0;
  return text.slice(start, start + 96);
}

function countText(text: string) {
  const chinese = text.match(/[\u4e00-\u9fa5]/g)?.length ?? 0;
  const words = text.replace(/[\u4e00-\u9fa5]/g, " ").split(/\s+/).filter(Boolean).length;
  return chinese + words;
}

function formatDate(value: string) {
  if (!value) {
    return "未记录";
  }
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function confirmDelete(message: string) {
  return window.confirm(message);
}

function replaceSceneInWorkbench(
  data: WorkbenchData | null,
  scene: SceneNode
): WorkbenchData | null {
  if (!data) {
    return data;
  }

  return {
    ...data,
    projects: data.projects.map((project) => ({
      ...project,
      volumes: project.volumes.map((volume) => ({
        ...volume,
        chapters: volume.chapters.map((chapter) => ({
          ...chapter,
          scenes: chapter.scenes.map((item) =>
            item.id === scene.id ? { ...scene, beats: item.beats } : item
          ),
        })),
      })),
    })),
    dashboard: {
      ...data.dashboard,
      totalWords: data.projects.reduce(
        (sum, project) =>
          sum +
          project.volumes.reduce(
            (volumeSum, volume) =>
              volumeSum +
              volume.chapters.reduce(
                (chapterSum, chapter) =>
                  chapterSum +
                  chapter.scenes.reduce(
                    (sceneSum, item) => sceneSum + (item.id === scene.id ? scene.wordCount : item.wordCount),
                    0
                  ),
                0
              ),
            0
          ),
        0
      ),
      recentlyUpdated: data.dashboard.recentlyUpdated.map((item) =>
        item.id === scene.id
          ? { id: scene.id, title: scene.title, updatedAt: scene.updatedAt, wordCount: scene.wordCount }
          : item
      ),
    },
  };
}

export function WorkbenchShell() {
  const [view, setView] = useState<ViewKey>("首页");
  const [data, setData] = useState<WorkbenchData | null>(null);
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [selectedSceneId, setSelectedSceneId] = useState<string | null>(null);
  const [selectedScene, setSelectedScene] = useState<SceneNode | null>(null);
  const [selectedEntityId, setSelectedEntityId] = useState<string | null>(null);
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);
  const [selectedLibraryId, setSelectedLibraryId] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<SaveState>("已保存");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [message, setMessage] = useState("");
  const [aiResult, setAiResult] = useState("");
  const [aiRunning, setAiRunning] = useState(false);
  const [aiPrompt, setAiPrompt] = useState("");
  const [buildInput, setBuildInput] = useState("");
  const [buildFocus, setBuildFocus] = useState("完整新书");
  const [buildMessages, setBuildMessages] = useState<BuildMessage[]>([]);
  const [buildResult, setBuildResult] = useState("");
  const [buildChapterResult, setBuildChapterResult] = useState("");
  const [buildTab, setBuildTab] = useState<BuildTab>("创意访谈");
  const [buildHistory, setBuildHistory] = useState<BuildHistoryItem[]>([]);
  const [buildRunning, setBuildRunning] = useState(false);
  const [navCollapsed, setNavCollapsed] = useState(false);
  const [manuscriptSideTab, setManuscriptSideTab] = useState<ManuscriptSideTab>("AI");
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const selectedSceneRef = useRef<SceneNode | null>(null);

  const projects = data?.projects ?? [];
  const activeProject = projects.find((project) => project.id === activeProjectId) ?? projects[0] ?? null;
  const selectedEntity =
    data?.worldEntities.find((entity) => entity.id === selectedEntityId) ?? data?.worldEntities[0] ?? null;
  const selectedThread =
    data?.narrativeThreads.find((thread) => thread.id === selectedThreadId) ??
    data?.narrativeThreads[0] ??
    null;
  const selectedLibrary =
    data?.libraryItems.find((item) => item.id === selectedLibraryId) ?? data?.libraryItems[0] ?? null;

  const relatedEntities = useMemo(() => {
    if (!selectedScene) {
      return [];
    }
    const text = [selectedScene.title, selectedScene.summary, selectedScene.contentText].join("\n");
    return (data?.worldEntities ?? []).filter((entity) => text.includes(entity.name)).slice(0, 8);
  }, [data?.worldEntities, selectedScene]);

  const relatedThreads = useMemo(() => {
    if (!selectedScene) {
      return [];
    }
    const text = [selectedScene.title, selectedScene.summary, selectedScene.contentText].join("\n");
    return (data?.narrativeThreads ?? []).filter((thread) => text.includes(thread.title)).slice(0, 8);
  }, [data?.narrativeThreads, selectedScene]);

  const loadWorkbench = useCallback(
    async (projectId = activeProjectId ?? undefined) => {
      const suffix = projectId ? `?projectId=${encodeURIComponent(projectId)}` : "";
      const nextData = await fetchJson<WorkbenchData>(`/api/workbench${suffix}`);
      setData(nextData);
      setActiveProjectId(nextData.activeProjectId);

      setSelectedSceneId((current) => {
        if (findScene(nextData.projects, current)) {
          return current;
        }
        return firstScene(nextData.projects)?.id ?? null;
      });

      setSelectedEntityId((current) =>
        nextData.worldEntities.some((entity) => entity.id === current) ? current : nextData.worldEntities[0]?.id ?? null
      );
      setSelectedThreadId((current) =>
        nextData.narrativeThreads.some((thread) => thread.id === current) ? current : nextData.narrativeThreads[0]?.id ?? null
      );
      setSelectedLibraryId((current) =>
        nextData.libraryItems.some((item) => item.id === current) ? current : nextData.libraryItems[0]?.id ?? null
      );
    },
    [activeProjectId]
  );

  useEffect(() => {
    loadWorkbench().catch((error) => setMessage(error.message));
  }, [loadWorkbench]);

  useEffect(() => {
    if (!selectedSceneId) {
      setSelectedScene(null);
      selectedSceneRef.current = null;
      return;
    }

    fetchJson<{ scene: Omit<SceneNode, "beats"> }>(`/api/scenes/${selectedSceneId}`)
      .then((result) => {
        const treeScene = findScene(projects, selectedSceneId);
        const nextScene = { ...result.scene, beats: treeScene?.beats ?? [] };
        selectedSceneRef.current = nextScene;
        setSelectedScene(nextScene);
        setSaveState("已保存");
      })
      .catch((error) => setMessage(error.message));
  }, [projects, selectedSceneId]);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (!searchQuery.trim()) {
        setSearchResults([]);
        return;
      }

      const suffix = activeProjectId ? `&projectId=${encodeURIComponent(activeProjectId)}` : "";
      fetchJson<{ results: SearchResult[] }>(
        `/api/search?q=${encodeURIComponent(searchQuery.trim())}${suffix}`
      )
        .then((result) => setSearchResults(result.results))
        .catch((error) => setMessage(error.message));
    }, 260);

    return () => clearTimeout(timer);
  }, [activeProjectId, searchQuery]);

  const createNovel = async () => {
    const name = window.prompt("小说名称");
    if (!name?.trim()) {
      return;
    }

    const result = await fetchJson<{ scene: SceneNode }>("/api/projects", {
      method: "POST",
      body: JSON.stringify({ name }),
    });
    setSelectedSceneId(result.scene.id);
    await loadWorkbench();
    setMessage("已新建小说。");
  };

  const addVolume = async () => {
    if (!activeProject) {
      return;
    }
    const title = window.prompt("卷名", `第${activeProject.volumes.length + 1}卷`);
    if (!title?.trim()) {
      return;
    }
    await fetchJson("/api/volumes", {
      method: "POST",
      body: JSON.stringify({ projectId: activeProject.id, title }),
    });
    await loadWorkbench(activeProject.id);
  };

  const addChapter = async (volumeId: string, count: number) => {
    const title = window.prompt("章节名", `第${count + 1}章`);
    if (!title?.trim()) {
      return;
    }
    await fetchJson("/api/chapters", {
      method: "POST",
      body: JSON.stringify({ volumeId, title }),
    });
    await loadWorkbench(activeProjectId ?? undefined);
  };

  const addScene = async (chapterId: string, count: number) => {
    const title = window.prompt("Scene 名称", `Scene ${count + 1}`);
    if (!title?.trim()) {
      return;
    }
    const result = await fetchJson<{ scene: SceneNode }>("/api/scenes", {
      method: "POST",
      body: JSON.stringify({ chapterId, title }),
    });
    setSelectedSceneId(result.scene.id);
    setView("正文");
    await loadWorkbench(activeProjectId ?? undefined);
  };

  const addBeat = async () => {
    if (!selectedScene) {
      return;
    }
    const title = window.prompt("Beat 名称", `Beat ${selectedScene.beats.length + 1}`);
    if (!title?.trim()) {
      return;
    }
    await fetchJson("/api/beats", {
      method: "POST",
      body: JSON.stringify({ sceneId: selectedScene.id, title }),
    });
    await loadWorkbench(activeProjectId ?? undefined);
    setMessage("已添加 Beat。");
  };

  const createEntity = async () => {
    if (!activeProject) {
      return;
    }
    const type = window.prompt("实体类型：人物 / 地点 / 势力 / 物品 / 规则 / 事件 / 术语", "人物");
    const name = window.prompt("名称");
    if (!type?.trim() || !name?.trim()) {
      return;
    }
    const result = await fetchJson<{ entity: WorldEntity }>("/api/world-entities", {
      method: "POST",
      body: JSON.stringify({ projectId: activeProject.id, type, name }),
    });
    setSelectedEntityId(result.entity.id);
    setView("世界");
    await loadWorkbench(activeProject.id);
  };

  const createThread = async () => {
    if (!activeProject) {
      return;
    }
    const type = window.prompt("线索类型：伏笔 / 悬念 / 任务 / 秘密 / 感情线 / 冲突线", "伏笔");
    const title = window.prompt("线索名称");
    if (!type?.trim() || !title?.trim()) {
      return;
    }
    const result = await fetchJson<{ thread: NarrativeThread }>("/api/narrative-threads", {
      method: "POST",
      body: JSON.stringify({ projectId: activeProject.id, type, title }),
    });
    setSelectedThreadId(result.thread.id);
    setView("线索");
    await loadWorkbench(activeProject.id);
  };

  const createLibraryItem = async () => {
    if (!activeProject) {
      return;
    }
    const type = window.prompt("资料类型：灵感 / 研究资料 / 摘录 / 参考 / 笔记", "灵感");
    const title = window.prompt("资料标题");
    if (!type?.trim() || !title?.trim()) {
      return;
    }
    const result = await fetchJson<{ item: LibraryItem }>("/api/library-items", {
      method: "POST",
      body: JSON.stringify({ projectId: activeProject.id, type, title }),
    });
    setSelectedLibraryId(result.item.id);
    setView("资料");
    await loadWorkbench(activeProject.id);
  };

  const createSceneRelation = async (targetType: "世界实体" | "叙事线索" | "资料", targetId: string, relationType: string) => {
    if (!activeProject || !selectedScene || !targetId) {
      return;
    }
    await fetchJson("/api/relations", {
      method: "POST",
      body: JSON.stringify({
        projectId: activeProject.id,
        sourceType: "Scene",
        sourceId: selectedScene.id,
        targetType,
        targetId,
        relationType,
      }),
    });
    await loadWorkbench(activeProject.id);
    setMessage("已更新当前 Scene 的关联。");
  };

  const createTimelineEvent = async () => {
    if (!activeProject) {
      setMessage("请先创建或选择一本小说。");
      return;
    }
    const title = window.prompt("时间轴事件标题", selectedScene?.title ?? "新事件");
    if (!title?.trim()) {
      return;
    }
    await fetchJson("/api/timeline-events", {
      method: "POST",
      body: JSON.stringify({
        projectId: activeProject.id,
        title,
        eventTime: selectedScene?.storyTime ?? "",
        type: selectedScene ? "正文" : "背景",
        sceneId: selectedScene?.id ?? "",
        summary: selectedScene?.summary ?? "",
      }),
    });
    await loadWorkbench(activeProject.id);
    setView("时间轴");
    setMessage("已创建时间轴事件。");
  };

  const handleSelectionAction = async (action: ManuscriptSelectionAction, text: string) => {
    const selectedText = text.trim();
    if (!selectedText) {
      return;
    }

    if (action === "分析" || action === "润色" || action === "改写") {
      const prompt =
        action === "分析"
          ? `请分析下面这段选中文字，重点看节奏、信息量、人物状态和是否偏离当前 Scene 目标。只给建议，不要改写原文。\n\n${selectedText}`
          : action === "润色"
            ? `请给下面这段选中文字提供润色建议。只输出建议和可参考版本，不要替换原文。\n\n${selectedText}`
            : `请改写下面这段选中文字。输出格式：先给 1 个推荐改写版，再给 2-3 条改写思路。只作为建议，不要替换原文。\n\n${selectedText}`;
      setAiPrompt(prompt);
      setAiResult("");
      setManuscriptSideTab("AI");
      setMessage("已把选中文字放入 AI 输入框。确认内容后点击对应按钮发送。");
      return;
    }

    if (action === "入轴") {
      await createTimelineEventFromSelection(selectedText);
      return;
    }

    if (action === "伏笔") {
      await createForeshadowingFromSelection(selectedText);
    }
  };

  const createTimelineEventFromSelection = async (text: string) => {
    if (!activeProject || !selectedScene) {
      setMessage("请先选择小说和 Scene。");
      return;
    }
    await fetchJson("/api/timeline-events", {
      method: "POST",
      body: JSON.stringify({
        projectId: activeProject.id,
        title: selectedTextTitle(text),
        eventTime: selectedScene.storyTime,
        type: "正文",
        sceneId: selectedScene.id,
        summary: text,
      }),
    });
    await loadWorkbench(activeProject.id);
    setView("时间轴");
    setMessage("已用选中文字创建时间轴事件。");
  };

  const createForeshadowingFromSelection = async (text: string) => {
    if (!activeProject) {
      setMessage("请先选择一本小说。");
      return;
    }
    const result = await fetchJson<{ thread: NarrativeThread }>("/api/narrative-threads", {
      method: "POST",
      body: JSON.stringify({
        projectId: activeProject.id,
        type: "伏笔",
        title: selectedTextTitle(text),
        summary: text,
      }),
    });
    setSelectedThreadId(result.thread.id);
    await loadWorkbench(activeProject.id);
    setView("线索");
    setMessage("已用选中文字创建伏笔线索。");
  };

  const updateTimelineEventById = async (id: string, patch: Partial<WorkbenchData["timelineEvents"][number]>) => {
    const result = await fetchJson<{ event: WorkbenchData["timelineEvents"][number] }>(`/api/timeline-events/${id}`, {
      method: "PATCH",
      body: JSON.stringify(patch),
    });
    setData((current) =>
      current
        ? {
            ...current,
            timelineEvents: current.timelineEvents
              .map((event) => (event.id === id ? result.event : event))
              .sort(compareTimelineEvents),
          }
        : current
    );
  };

  const deleteTimelineEventById = async (id: string, title: string) => {
    const deleted = await deleteByUrl(`/api/timeline-events/${id}`, `确定删除时间轴事件「${title}」吗？`, "已删除时间轴事件。");
    if (deleted) {
      await loadWorkbench(activeProjectId ?? undefined);
    }
  };

  const deleteByUrl = async (url: string, confirmMessage: string, successMessage: string) => {
    if (!confirmDelete(confirmMessage)) {
      return false;
    }
    await fetchJson(url, { method: "DELETE" });
    setMessage(successMessage);
    return true;
  };

  const deleteProjectById = async (project: ProjectNode) => {
    const deleted = await deleteByUrl(
      `/api/projects/${project.id}`,
      `确定删除小说《${project.name}》吗？这会删除它的卷、章节、Scene、世界、线索、资料和关系。`,
      "已删除小说。"
    );
    if (deleted) {
      setActiveProjectId(null);
      setSelectedSceneId(null);
      await loadWorkbench(undefined);
      setView("首页");
    }
  };

  const deleteVolumeById = async (volumeId: string, title: string) => {
    const deleted = await deleteByUrl(
      `/api/volumes/${volumeId}`,
      `确定删除「${title}」吗？这一卷下的章节、Scene 和 Beat 会一起删除。`,
      "已删除卷。"
    );
    if (deleted) {
      await loadWorkbench(activeProjectId ?? undefined);
    }
  };

  const deleteChapterById = async (chapterId: string, title: string) => {
    const deleted = await deleteByUrl(
      `/api/chapters/${chapterId}`,
      `确定删除「${title}」吗？这一章下的 Scene 和 Beat 会一起删除。`,
      "已删除章节。"
    );
    if (deleted) {
      await loadWorkbench(activeProjectId ?? undefined);
    }
  };

  const deleteSceneById = async (sceneId: string, title: string) => {
    if (saveTimer.current) {
      clearTimeout(saveTimer.current);
      saveTimer.current = null;
    }
    const deleted = await deleteByUrl(
      `/api/scenes/${sceneId}`,
      `确定删除 Scene「${title}」吗？正文、Beat 和相关关系会一起删除。`,
      "已删除 Scene。"
    );
    if (deleted) {
      if (selectedSceneId === sceneId) {
        setSelectedSceneId(null);
      }
      await loadWorkbench(activeProjectId ?? undefined);
    }
  };

  const deleteBeatById = async (beatId: string, title: string) => {
    const deleted = await deleteByUrl(`/api/beats/${beatId}`, `确定删除 Beat「${title}」吗？`, "已删除 Beat。");
    if (deleted) {
      await loadWorkbench(activeProjectId ?? undefined);
    }
  };

  const deleteEntityById = async (entity: WorldEntity) => {
    const deleted = await deleteByUrl(
      `/api/world-entities/${entity.id}`,
      `确定删除世界条目「${entity.name}」吗？相关关系会一起删除。`,
      "已删除世界条目。"
    );
    if (deleted) {
      setSelectedEntityId(null);
      await loadWorkbench(activeProjectId ?? undefined);
    }
  };

  const deleteThreadById = async (thread: NarrativeThread) => {
    const deleted = await deleteByUrl(
      `/api/narrative-threads/${thread.id}`,
      `确定删除叙事线索「${thread.title}」吗？相关关系会一起删除。`,
      "已删除叙事线索。"
    );
    if (deleted) {
      setSelectedThreadId(null);
      await loadWorkbench(activeProjectId ?? undefined);
    }
  };

  const deleteLibraryById = async (item: LibraryItem) => {
    const deleted = await deleteByUrl(
      `/api/library-items/${item.id}`,
      `确定删除资料「${item.title}」吗？相关关系会一起删除。`,
      "已删除资料。"
    );
    if (deleted) {
      setSelectedLibraryId(null);
      await loadWorkbench(activeProjectId ?? undefined);
    }
  };

  const deleteRelationById = async (relationId: string) => {
    const deleted = await deleteByUrl(`/api/relations/${relationId}`, "确定删除这条关系吗？", "已删除关系。");
    if (deleted) {
      await loadWorkbench(activeProjectId ?? undefined);
    }
  };

  const saveScene = useCallback(async (scene: SceneNode) => {
    setSaveState("保存中");
    try {
      const result = await fetchJson<{ scene: Omit<SceneNode, "beats"> }>(`/api/scenes/${scene.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          title: scene.title,
          summary: scene.summary,
          pov: scene.pov,
          goal: scene.goal,
          conflict: scene.conflict,
          outcome: scene.outcome,
          storyTime: scene.storyTime,
          status: scene.status,
          contentJson: scene.contentJson,
          contentText: scene.contentText,
        }),
      });
      const nextScene = { ...result.scene, beats: scene.beats };
      selectedSceneRef.current = nextScene;
      setSelectedScene(nextScene);
      setData((current) => replaceSceneInWorkbench(current, nextScene));
      setSaveState("已保存");
    } catch (error) {
      setSaveState("保存失败");
      setMessage(error instanceof Error ? error.message : "保存失败。");
    }
  }, []);

  const scheduleSave = (scene: SceneNode) => {
    setSaveState("有改动");
    if (saveTimer.current) {
      clearTimeout(saveTimer.current);
    }
    saveTimer.current = setTimeout(() => {
      saveScene(scene);
    }, 850);
  };

  const updateScene = (patch: Partial<SceneNode>) => {
    if (!selectedScene) {
      return;
    }
    const nextScene = { ...selectedScene, ...patch };
    selectedSceneRef.current = nextScene;
    setSelectedScene(nextScene);
    scheduleSave(nextScene);
  };

  const updateContent = (content: JSONContent, text: string) => {
    updateScene({
      contentJson: stringifyContent(content),
      contentText: text,
      wordCount: countText(text),
    });
  };

  const saveCurrentSceneNow = () => {
    const scene = selectedSceneRef.current;
    if (!scene || saveState === "保存中") {
      return;
    }
    if (saveTimer.current) {
      clearTimeout(saveTimer.current);
      saveTimer.current = null;
    }
    void saveScene(scene);
  };

  const updateEntity = async (patch: Partial<WorldEntity>) => {
    if (!selectedEntity) {
      return;
    }
    const result = await fetchJson<{ entity: WorldEntity }>(`/api/world-entities/${selectedEntity.id}`, {
      method: "PATCH",
      body: JSON.stringify(patch),
    });
    setSelectedEntityId(result.entity.id);
    await loadWorkbench(activeProjectId ?? undefined);
  };

  const updateThread = async (patch: Partial<NarrativeThread>) => {
    if (!selectedThread) {
      return;
    }
    const result = await fetchJson<{ thread: NarrativeThread }>(
      `/api/narrative-threads/${selectedThread.id}`,
      {
        method: "PATCH",
        body: JSON.stringify(patch),
      }
    );
    setSelectedThreadId(result.thread.id);
    await loadWorkbench(activeProjectId ?? undefined);
  };

  const updateLibrary = async (patch: Partial<LibraryItem>) => {
    if (!selectedLibrary) {
      return;
    }
    const result = await fetchJson<{ item: LibraryItem }>(`/api/library-items/${selectedLibrary.id}`, {
      method: "PATCH",
      body: JSON.stringify(patch),
    });
    setSelectedLibraryId(result.item.id);
    await loadWorkbench(activeProjectId ?? undefined);
  };

  const createAiProvider = async (input: AiProviderInput) => {
    const result = await fetchJson<{ provider: AiProviderSetting }>("/api/ai-settings", {
      method: "POST",
      body: JSON.stringify(input),
    });
    await loadWorkbench(activeProjectId ?? undefined);
    setMessage(`已新建 Provider：${result.provider.name}。`);
  };

  const updateAiProvider = async (id: string, patch: Partial<AiProviderSetting> & { apiKey?: string }) => {
    await fetchJson(`/api/ai-settings/providers/${id}`, {
      method: "PATCH",
      body: JSON.stringify(patch),
    });
    await loadWorkbench(activeProjectId ?? undefined);
  };

  const deleteAiProvider = async (provider: AiProviderSetting) => {
    const deleted = await deleteByUrl(
      `/api/ai-settings/providers/${provider.id}`,
      `确定删除 Provider「${provider.name}」吗？相关用途绑定会清空。`,
      "已删除 AI Provider。"
    );
    if (deleted) {
      await loadWorkbench(activeProjectId ?? undefined);
    }
  };

  const updateAiAlias = async (mode: string, providerId: string | null, modelName: string, params?: Partial<AiAliasParams>) => {
    await fetchJson(`/api/ai-settings/aliases/${encodeURIComponent(mode)}`, {
      method: "PATCH",
      body: JSON.stringify({ providerId, modelName, ...params }),
    });
    await loadWorkbench(activeProjectId ?? undefined);
  };

  const testAiProvider = async (providerId: string) => {
    try {
      setMessage("正在测试 Provider 连接...");
      const result = await fetchJson<{
        ok: boolean;
        providerName: string;
        modelName: string;
        text: string;
      }>(`/api/ai-settings/providers/${providerId}/test`, {
        method: "POST",
      });
      setMessage(`Provider 测试通过：${result.providerName} / ${result.modelName}`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Provider 测试失败。");
    }
  };

  const testAiSettingsShape = () => {
    const providers = data?.aiSettings.providers ?? [];
    const enabled = providers.filter((provider) => provider.enabled);
    const incomplete = enabled.filter(
      (provider) => !provider.name.trim() || !provider.provider.trim() || !provider.defaultModel.trim() || !provider.hasApiKey
    );

    if (!enabled.length) {
      setMessage("还没有启用的 AI Provider。");
      return;
    }

    if (incomplete.length) {
      setMessage(`有 ${incomplete.length} 个 Provider 缺少模型名或 API Key。`);
      return;
    }

    setMessage("AI 配置形态可用。当前未发起真实 API 请求。");
  };

  const runAiWritingAction = async (
    action: AiAction,
    mode: AiMode,
    prompt: string,
    providerId: string | null,
    modelName: string
  ) => {
    if (!selectedScene) {
      setMessage("请先选择一个 Scene。");
      return;
    }

    setAiRunning(true);
    setAiResult("");
    setMessage(`正在请求 AI：${action}`);

    try {
      const result = await fetchJson<{
        result: {
          text: string;
          providerName: string;
          modelName: string;
          mode: string;
        };
      }>("/api/ai/run", {
        method: "POST",
        body: JSON.stringify({
          action,
          mode,
          providerId,
          modelName,
          prompt,
          context: {
            scene: {
              title: selectedScene.title,
              summary: selectedScene.summary,
              goal: selectedScene.goal,
              conflict: selectedScene.conflict,
              outcome: selectedScene.outcome,
              contentText: selectedScene.contentText,
            },
            entities: relatedEntities.map((entity) => ({
              type: entity.type,
              name: entity.name,
              summary: entity.summary,
            })),
            threads: relatedThreads.map((thread) => ({
              type: thread.type,
              title: thread.title,
              status: thread.status,
              summary: thread.summary,
            })),
            library: (data?.libraryItems ?? []).slice(0, 6).map((item) => ({
              type: item.type,
              title: item.title,
              content: item.content,
            })),
          },
        }),
      });
      setAiResult(result.result.text);
      setMessage(`AI 已返回：${result.result.providerName} / ${result.result.modelName}`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "AI 请求失败。");
    } finally {
      setAiRunning(false);
    }
  };

  const continueStoryBuild = async () => {
    if (!activeProject) {
      setMessage("请先创建或选择一本小说。");
      return;
    }
    if (!buildInput.trim()) {
      setMessage(buildMessages.length ? "请先回答 AI 的问题。" : "请先写下故事想法。");
      return;
    }

    const nextMessages: BuildMessage[] = [...buildMessages, { role: "你", content: buildInput.trim() }];
    setBuildMessages(nextMessages);
    setBuildInput("");
    setBuildRunning(true);
    setMessage("AI 正在继续访谈...");

    try {
      const result = await fetchJson<{
        result: {
          text: string;
          providerName: string;
          modelName: string;
          mode: string;
        };
      }>("/api/ai/run", {
        method: "POST",
        body: JSON.stringify({
          action: "故事构建",
          mode: "创作",
          prompt: buildStoryQuestionPrompt(buildFocus, nextMessages),
          context: "本次创意访谈只使用用户在构建页面输入的访谈内容，不自动读取现有资料库、世界设定或正文。",
        }),
      });
      setBuildMessages([...nextMessages, { role: "AI", content: result.result.text }]);
      setBuildTab("创意访谈");
      setMessage(`AI 已继续访谈：${result.result.providerName} / ${result.result.modelName}`);
    } catch (error) {
      setBuildMessages(buildMessages);
      setBuildInput(nextMessages[nextMessages.length - 1]?.content ?? "");
      setMessage(error instanceof Error ? error.message : "创意访谈失败。");
    } finally {
      setBuildRunning(false);
    }
  };

  const generateBuildDraft = async () => {
    if (!activeProject) {
      setMessage("请先创建或选择一本小说。");
      return;
    }
    if (!buildMessages.length && !buildInput.trim()) {
      setMessage("请先进行至少一轮创意访谈。");
      return;
    }

    const sourceMessages: BuildMessage[] = buildInput.trim()
      ? [...buildMessages, { role: "你", content: buildInput.trim() }]
      : buildMessages;
    if (buildInput.trim()) {
      setBuildMessages(sourceMessages);
      setBuildInput("");
    }
    setBuildRunning(true);
    setBuildResult("");
    setMessage("正在整理故事总纲...");

    try {
      const result = await fetchJson<{
        result: {
          text: string;
          providerName: string;
          modelName: string;
          mode: string;
        };
      }>("/api/ai/run", {
        method: "POST",
        body: JSON.stringify({
          action: "故事构建",
          mode: "创作",
          prompt: buildStoryDraftPrompt(buildFocus, sourceMessages),
          context: "本次故事总纲只使用用户在构建页面输入的访谈内容，不自动读取现有资料库、世界设定或正文。",
        }),
      });
      setBuildResult(result.result.text);
      setBuildHistory((history) => [
        {
          id: crypto.randomUUID(),
          title: buildHistoryTitle(result.result.text, buildFocus),
          kind: "总纲" as const,
          focus: buildFocus,
          content: result.result.text,
          createdAt: new Date().toISOString(),
        },
        ...history,
      ].slice(0, 12));
      setBuildTab("总纲生成");
      setMessage(`故事总纲完成：${result.result.providerName} / ${result.result.modelName}`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "生成故事总纲失败。");
    } finally {
      setBuildRunning(false);
    }
  };

  const generateChapterOutline = async () => {
    if (!activeProject) {
      setMessage("请先创建或选择一本小说。");
      return;
    }
    if (!buildResult.trim() && !buildMessages.length && !buildInput.trim()) {
      setMessage("请先完成创意访谈或生成故事总纲。");
      return;
    }

    const sourceMessages: BuildMessage[] = buildInput.trim()
      ? [...buildMessages, { role: "你", content: buildInput.trim() }]
      : buildMessages;
    if (buildInput.trim()) {
      setBuildMessages(sourceMessages);
      setBuildInput("");
    }
    setBuildRunning(true);
    setBuildChapterResult("");
    setMessage("正在生成章节细纲...");

    try {
      const result = await fetchJson<{
        result: {
          text: string;
          providerName: string;
          modelName: string;
          mode: string;
        };
      }>("/api/ai/run", {
        method: "POST",
        body: JSON.stringify({
          action: "故事构建",
          mode: "创作",
          prompt: buildChapterOutlinePrompt(buildFocus, sourceMessages, buildResult),
          context: "本次章节细纲只使用构建页面的访谈内容和已生成总纲，不自动读取现有资料库、世界设定或正文。",
        }),
      });
      setBuildChapterResult(result.result.text);
      setBuildHistory((history) => [
        {
          id: crypto.randomUUID(),
          title: buildHistoryTitle(result.result.text, "章节细纲"),
          kind: "章节细纲" as const,
          focus: buildFocus,
          content: result.result.text,
          createdAt: new Date().toISOString(),
        },
        ...history,
      ].slice(0, 12));
      setBuildTab("章节细纲");
      setMessage(`章节细纲完成：${result.result.providerName} / ${result.result.modelName}`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "生成章节细纲失败。");
    } finally {
      setBuildRunning(false);
    }
  };

  const resetStoryBuild = () => {
    if ((buildMessages.length || buildResult || buildChapterResult || buildInput.trim()) && !window.confirm("确定清空当前构建内容吗？")) {
      return;
    }
    setBuildInput("");
    setBuildMessages([]);
    setBuildResult("");
    setBuildChapterResult("");
    setBuildTab("创意访谈");
    setMessage("已清空构建内容。");
  };

  const saveBuildResultToLibrary = async () => {
    if (!activeProject) {
      setMessage("请先创建或选择一本小说。");
      return;
    }
    const saveKind = buildTab === "章节细纲" ? "章节细纲" : "故事总纲";
    const content = buildTab === "章节细纲" ? buildChapterResult : buildResult;
    if (!content.trim()) {
      setMessage("还没有可保存的构建结果。");
      return;
    }

    const title = window.prompt("保存为资料标题", `${buildFocus}${saveKind}`);
    if (!title?.trim()) {
      return;
    }

    const result = await fetchJson<{ item: LibraryItem }>("/api/library-items", {
      method: "POST",
      body: JSON.stringify({ projectId: activeProject.id, type: "大纲", title }),
    });
    await fetchJson<{ item: LibraryItem }>(`/api/library-items/${result.item.id}`, {
      method: "PATCH",
      body: JSON.stringify({
        content,
        source: "AI 故事构建",
        tags: `AI构建, ${buildFocus}, ${saveKind}`,
      }),
    });
    setSelectedLibraryId(result.item.id);
    await loadWorkbench(activeProject.id);
    setMessage(`已保存${saveKind}到资料库。`);
  };

  const navItems: Array<{ key: ViewKey; icon: React.ReactNode }> = [
    { key: "首页", icon: <Home size={16} /> },
    { key: "正文", icon: <BookOpen size={16} /> },
    { key: "构建", icon: <Sparkles size={16} /> },
    { key: "故事", icon: <Target size={16} /> },
    { key: "世界", icon: <Users size={16} /> },
    { key: "线索", icon: <GitBranch size={16} /> },
    { key: "时间轴", icon: <CalendarDays size={16} /> },
    { key: "资料", icon: <Library size={16} /> },
    { key: "关系", icon: <Link2 size={16} /> },
    { key: "导入", icon: <UploadCloud size={16} /> },
    { key: "AI", icon: <Sparkles size={16} /> },
  ];

  return (
    <main className={clsx("app-shell app-shell-v2", navCollapsed && "app-shell-nav-collapsed")}>
      <aside className={clsx("sidebar nav-sidebar", navCollapsed && "nav-sidebar-collapsed")}>
        <div className="nav-sidebar-head">
          <div>
            <div className="brand brand-full text-xl">乙木</div>
            <div className="brand brand-short text-xl">乙木</div>
            <div className="text-sm muted nav-subtitle">本地小说创作工作台</div>
          </div>
          <button
            className="button icon-button"
            onClick={() => setNavCollapsed((value) => !value)}
            title={navCollapsed ? "展开左侧栏" : "收起左侧栏"}
            aria-label={navCollapsed ? "展开左侧栏" : "收起左侧栏"}
          >
            {navCollapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
          </button>
        </div>

        <button className="button button-primary mb-4 w-full nav-create-button" onClick={createNovel} title="新建小说">
          <Plus size={16} />
          <span className="nav-label">新建小说</span>
        </button>

        <div className="nav-block">
          {navItems.map((item) => (
            <button
              key={item.key}
              className={clsx("nav-button", view === item.key && "nav-button-active")}
              onClick={() => setView(item.key)}
              title={item.key}
            >
              {item.icon}
              <span className="nav-label">{item.key}</span>
            </button>
          ))}
        </div>

        <div className="panel-block mt-5 nav-project-panel">
          <div className="panel-title">当前小说</div>
          {projects.length === 0 ? (
            <p className="text-sm leading-7 muted">还没有小说项目。先新建一本，工作台会生成第一卷、第一章和开场 Scene。</p>
          ) : (
            <div className="space-y-2">
              {projects.map((project) => (
                <button
                  key={project.id}
                  className={clsx("tree-item", activeProject?.id === project.id && "tree-item-active")}
                  onClick={() => {
                    setActiveProjectId(project.id);
                    loadWorkbench(project.id).catch((error) => setMessage(error.message));
                  }}
                >
                  <span className="block truncate font-semibold">{project.name}</span>
                  <span className="block text-xs muted">{project.volumes.length} 卷</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </aside>

      <section className="main-stage workbench-stage">
        {view === "首页" ? (
          <DashboardView
            data={data}
            activeProjectName={activeProject?.name ?? "未创建"}
            onCreateEntity={createEntity}
            onCreateThread={createThread}
            onCreateLibrary={createLibraryItem}
            onContinue={() => setView("正文")}
            onDeleteProject={() => activeProject && deleteProjectById(activeProject)}
            onSelectScene={(id) => {
              setSelectedSceneId(id);
              setView("正文");
            }}
          />
        ) : null}
        {view === "正文" ? (
          <ManuscriptView
            activeProject={activeProject}
            selectedScene={selectedScene}
            saveState={saveState}
            searchQuery={searchQuery}
            searchResults={searchResults}
            onAddVolume={addVolume}
            onAddChapter={addChapter}
            onAddScene={addScene}
            onDeleteVolume={deleteVolumeById}
            onDeleteChapter={deleteChapterById}
            onDeleteScene={deleteSceneById}
            onSelectScene={setSelectedSceneId}
            onUpdateScene={updateScene}
            onUpdateContent={updateContent}
            onManualSave={saveCurrentSceneNow}
            onCreateTimelineEvent={createTimelineEvent}
            onSelectionAction={handleSelectionAction}
            onSearchQueryChange={setSearchQuery}
            onOpenSearchResult={(result) => {
              if (result.kind === "正文") {
                setSelectedSceneId(result.id);
                setView("正文");
              }
            }}
          />
        ) : null}
        {view === "构建" ? (
          <BuildView
            activeProject={activeProject}
            input={buildInput}
            focus={buildFocus}
            messages={buildMessages}
            result={buildResult}
            chapterResult={buildChapterResult}
            activeTab={buildTab}
            history={buildHistory}
            running={buildRunning}
            onInputChange={setBuildInput}
            onFocusChange={setBuildFocus}
            onTabChange={setBuildTab}
            onContinue={continueStoryBuild}
            onGenerateDraft={generateBuildDraft}
            onGenerateChapterOutline={generateChapterOutline}
            onReset={resetStoryBuild}
            onSelectHistory={(item) => {
              setBuildFocus(item.focus);
              if (item.kind === "章节细纲") {
                setBuildChapterResult(item.content);
                setBuildTab("章节细纲");
                return;
              }
              setBuildResult(item.content);
              setBuildTab("总纲生成");
            }}
            onSave={saveBuildResultToLibrary}
          />
        ) : null}
        {view === "故事" ? (
          <StoryView
            activeProject={activeProject}
            selectedSceneId={selectedSceneId}
            onAddVolume={addVolume}
            onAddChapter={addChapter}
            onAddScene={addScene}
            onAddBeat={addBeat}
            onDeleteVolume={deleteVolumeById}
            onDeleteChapter={deleteChapterById}
            onDeleteScene={deleteSceneById}
            onDeleteBeat={deleteBeatById}
            onSelectScene={(id) => {
              setSelectedSceneId(id);
              setView("正文");
            }}
          />
        ) : null}
        {view === "世界" ? (
          <WorldView
            entities={data?.worldEntities ?? []}
            selectedEntity={selectedEntity}
            onCreate={createEntity}
            onSelect={setSelectedEntityId}
            onUpdate={updateEntity}
            onDelete={deleteEntityById}
          />
        ) : null}
        {view === "线索" ? (
          <ThreadView
            threads={data?.narrativeThreads ?? []}
            selectedThread={selectedThread}
            onCreate={createThread}
            onSelect={setSelectedThreadId}
            onUpdate={updateThread}
            onDelete={deleteThreadById}
          />
        ) : null}
        {view === "时间轴" ? (
          <TimelineView
            events={data?.timelineEvents ?? []}
            scenes={activeProject?.volumes.flatMap((volume) => volume.chapters.flatMap((chapter) => chapter.scenes)) ?? []}
            onCreate={createTimelineEvent}
            onUpdate={updateTimelineEventById}
            onDelete={deleteTimelineEventById}
          />
        ) : null}
        {view === "资料" ? (
          <LibraryView
            items={data?.libraryItems ?? []}
            selectedItem={selectedLibrary}
            onCreate={createLibraryItem}
            onSelect={setSelectedLibraryId}
            onUpdate={updateLibrary}
            onDelete={deleteLibraryById}
          />
        ) : null}
        {view === "关系" ? (
          <RelationView
            relations={data?.relations ?? []}
            selectedScene={selectedScene}
            entities={data?.worldEntities ?? []}
            threads={data?.narrativeThreads ?? []}
            libraryItems={data?.libraryItems ?? []}
            onCreateRelation={createSceneRelation}
            onDelete={deleteRelationById}
          />
        ) : null}
        {view === "导入" ? (
          <ImportView
            activeProject={activeProject}
            onImported={() => loadWorkbench(activeProjectId ?? undefined)}
          />
        ) : null}
        {view === "AI" ? (
          <AiContextView
            aiSettings={data?.aiSettings ?? { providers: [], aliases: [] }}
            onCreateProvider={createAiProvider}
            onUpdateProvider={updateAiProvider}
            onDeleteProvider={deleteAiProvider}
            onUpdateAlias={updateAiAlias}
            onTestProvider={testAiProvider}
            onTestSettings={testAiSettingsShape}
          />
        ) : null}
      </section>

      <aside className="search-panel context-panel">
        {view === "正文" ? (
          <ManuscriptSidePanel
            activeTab={manuscriptSideTab}
            onTabChange={setManuscriptSideTab}
            selectedScene={selectedScene}
            relations={data?.relations ?? []}
            entities={data?.worldEntities ?? []}
            threads={data?.narrativeThreads ?? []}
            libraryItems={data?.libraryItems ?? []}
            aiPrompt={aiPrompt}
            aiResult={aiResult}
            aiRunning={aiRunning}
            onAiPromptChange={setAiPrompt}
            onCreateRelation={createSceneRelation}
            onDeleteRelation={deleteRelationById}
            onRunAiAction={runAiWritingAction}
          />
        ) : (
          <>
            <SearchTool
              searchQuery={searchQuery}
              searchResults={searchResults}
              onSearchQueryChange={setSearchQuery}
              onOpenResult={(result) => {
                if (result.kind === "正文") {
                  setSelectedSceneId(result.id);
                  setView("正文");
                }
              }}
            />

            <ContextSummary
              activeProjectName={activeProject?.name ?? "未创建"}
              selectedScene={selectedScene}
              message={message}
              entityCount={data?.worldEntities.length ?? 0}
              threadCount={data?.narrativeThreads.length ?? 0}
              libraryCount={data?.libraryItems.length ?? 0}
            />
          </>
        )}
      </aside>
    </main>
  );
}

function DashboardView({
  data,
  activeProjectName,
  onCreateEntity,
  onCreateThread,
  onCreateLibrary,
  onContinue,
  onDeleteProject,
  onSelectScene,
}: {
  data: WorkbenchData | null;
  activeProjectName: string;
  onCreateEntity: () => void;
  onCreateThread: () => void;
  onCreateLibrary: () => void;
  onContinue: () => void;
  onDeleteProject: () => void;
  onSelectScene: (id: string) => void;
}) {
  const stats = data?.dashboard;
  return (
    <div className="workspace-page">
      <header className="workspace-header">
        <div>
          <div className="eyebrow">当前小说</div>
          <h1>{activeProjectName}</h1>
        </div>
        <button className="button button-primary" onClick={onContinue}>
          <BookOpen size={16} />
          继续写作
        </button>
        <button className="button button-danger" onClick={onDeleteProject}>
          <Trash2 size={16} />
          删除小说
        </button>
      </header>
      <div className="metric-grid">
        <Metric label="总字数" value={stats?.totalWords ?? 0} />
        <Metric label="章节" value={stats?.chapterCount ?? 0} />
        <Metric label="Scene" value={stats?.sceneCount ?? 0} />
        <Metric label="未完成 Scene" value={stats?.unfinishedScenes ?? 0} />
        <Metric label="世界条目" value={stats?.entityCount ?? 0} />
        <Metric label="未回收线索" value={stats?.unresolvedThreads ?? 0} />
      </div>
      <div className="workspace-grid">
        <section className="panel-block">
          <div className="panel-title">最近编辑</div>
          <div className="space-y-2">
            {stats?.recentlyUpdated.length ? (
              stats.recentlyUpdated.map((scene) => (
                <button key={scene.id} className="list-row" onClick={() => onSelectScene(scene.id)}>
                  <span>{scene.title}</span>
                  <span className="muted">{formatDate(scene.updatedAt)} / {scene.wordCount} 字</span>
                </button>
              ))
            ) : (
              <p className="text-sm muted">还没有最近编辑的 Scene。</p>
            )}
          </div>
        </section>
        <section className="panel-block">
          <div className="panel-title">快速沉淀</div>
          <div className="quick-actions">
            <button className="button" onClick={onCreateEntity}>
              <Users size={16} />
              新建世界条目
            </button>
            <button className="button" onClick={onCreateThread}>
              <GitBranch size={16} />
              新建叙事线索
            </button>
            <button className="button" onClick={onCreateLibrary}>
              <Library size={16} />
              新建资料
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}

function SearchTool({
  searchQuery,
  searchResults,
  onSearchQueryChange,
  onOpenResult,
}: {
  searchQuery: string;
  searchResults: SearchResult[];
  onSearchQueryChange: (query: string) => void;
  onOpenResult: (result: SearchResult) => void;
}) {
  return (
    <div className="search-tool">
      <div className="mb-3">
        <div className="mb-2 flex items-center gap-2 font-bold">
          <Search size={17} />
          全局搜索
        </div>
        <input
          className="input"
          value={searchQuery}
          onChange={(event) => onSearchQueryChange(event.target.value)}
          placeholder="搜正文、人物、线索、资料"
        />
      </div>

      <div className="search-results-list">
        {searchResults.map((result) => (
          <button
            key={`${result.kind}-${result.id}`}
            className="search-result w-full text-left"
            onClick={() => onOpenResult(result)}
          >
            <div className="flex items-center justify-between gap-3">
              <div className="font-bold">{result.title}</div>
              <span className="pill">{result.kind}</span>
            </div>
            <div className="mb-2 text-xs muted">{result.subtitle}</div>
            <div className="text-sm leading-6 muted">{excerpt(result.excerpt, searchQuery)}</div>
          </button>
        ))}
        {searchQuery.trim() && searchResults.length === 0 ? (
          <div className="text-sm muted">没有搜到匹配内容。</div>
        ) : null}
      </div>
    </div>
  );
}

function BuildView({
  activeProject,
  input,
  focus,
  messages,
  result,
  chapterResult,
  activeTab,
  history,
  running,
  onInputChange,
  onFocusChange,
  onTabChange,
  onContinue,
  onGenerateDraft,
  onGenerateChapterOutline,
  onReset,
  onSelectHistory,
  onSave,
}: {
  activeProject: ProjectNode | null;
  input: string;
  focus: string;
  messages: BuildMessage[];
  result: string;
  chapterResult: string;
  activeTab: BuildTab;
  history: BuildHistoryItem[];
  running: boolean;
  onInputChange: (value: string) => void;
  onFocusChange: (value: string) => void;
  onTabChange: (value: BuildTab) => void;
  onContinue: () => void;
  onGenerateDraft: () => void;
  onGenerateChapterOutline: () => void;
  onReset: () => void;
  onSelectHistory: (item: BuildHistoryItem) => void;
  onSave: () => void;
}) {
  const tabs: BuildTab[] = ["创意访谈", "总纲生成", "模块沉淀", "章节细纲"];
  const activeText = activeTab === "章节细纲" ? chapterResult : result;
  const canGenerateOutline = messages.length > 0 || input.trim().length > 0;
  const canGenerateChapter = result.trim().length > 0 || canGenerateOutline;

  return (
    <div className="workspace-page build-page">
      <header className="workspace-header">
        <div>
          <div className="eyebrow">Story Builder</div>
          <h1>新书构建</h1>
        </div>
        <div className="flex gap-2">
          <button className="button" disabled={running || !canGenerateOutline} onClick={onGenerateDraft}>
            <FileText size={16} />
            生成总纲
          </button>
          <button className="button" disabled={running || !canGenerateChapter} onClick={onGenerateChapterOutline}>
            <BookOpen size={16} />
            生成细纲
          </button>
          <button className="button" disabled={!activeText.trim()} onClick={onSave}>
            <Library size={16} />
            保存当前稿
          </button>
          <button className="button" disabled={running} onClick={onReset}>
            清空
          </button>
        </div>
      </header>

      <div className="module-tabs">
        {tabs.map((tab) => (
          <button key={tab} className={clsx("module-tab", activeTab === tab && "module-tab-active")} onClick={() => onTabChange(tab)}>
            {tab}
          </button>
        ))}
      </div>

      {activeTab === "创意访谈" ? (
        <div className="build-qa-layout">
          <section className="panel-block build-input-panel">
            <div className="panel-title">创意访谈</div>
            <label>
              当前侧重
              <select className="input" value={focus} onChange={(event) => onFocusChange(event.target.value)}>
                {buildFocusOptions.map((option) => (
                  <option key={option}>{option}</option>
                ))}
              </select>
            </label>
            <label>
              {messages.length ? "回答 AI 的问题 / 补充新灵感" : "先写下你想创作什么故事"}
              <div className="build-input-compose">
                <textarea
                  className="textarea build-idea-input"
                  value={input}
                  onChange={(event) => onInputChange(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                      event.preventDefault();
                      onContinue();
                    }
                  }}
                  placeholder={
                    messages.length
                      ? "回答上一轮问题，也可以补充新人物、伏笔、限制、偏好、你不想要的套路。"
                      : "比如：题材、主角、冲突、氛围、你想写的爽点或恐惧点，以及你想避免的套路。"
                  }
                />
                <button className="button button-primary build-send-button" disabled={running || !activeProject || !input.trim()} onClick={onContinue}>
                  <Sparkles size={16} />
                  {messages.length ? "发送" : "开始"}
                </button>
              </div>
            </label>
            <p className="text-sm leading-7 muted">
              访谈只会发送这里的访谈内容，不会自动读取正文、世界设定或资料库。
            </p>
          </section>

          <section className="panel-block build-result-panel">
            <div className="panel-title">访谈记录</div>
            <BuildChatBox messages={messages} running={running} />
          </section>
        </div>
      ) : null}

      {activeTab === "总纲生成" ? (
        <section className="panel-block build-draft-panel">
          <div className="panel-title">故事总纲</div>
          <div className="build-result-box build-result-box-large">
            {result ? <pre>{result}</pre> : <p className="muted">访谈足够后，点击“生成总纲”。它会整理故事核心、人物、世界规则、冲突、伏笔和篇章骨架。</p>}
          </div>
        </section>
      ) : null}

      {activeTab === "模块沉淀" ? (
        <div className="build-module-layout">
          <section className="panel-block build-draft-panel">
            <div className="panel-title">沉淀方式</div>
            <div className="build-module-grid">
              <BuildModuleCard title="资料库" description="保存总纲、访谈整理稿、章节细纲，作为长期参考。" action="当前可保存" />
              <BuildModuleCard title="世界" description="人物、地点、组织、规则、能力体系，适合从总纲里拆出来后再写入。" action="后续拆分" />
              <BuildModuleCard title="线索" description="伏笔、暗线、秘密、悬念、感情线，适合确认后单独沉淀。" action="后续拆分" />
              <BuildModuleCard title="时间轴" description="前史、关键事件、转折节点、回收节点，适合按时间顺序整理。" action="后续拆分" />
            </div>
            <p className="text-sm leading-7 muted">
              当前版本先让“总纲”和“章节细纲”稳定保存到资料库。等你确认这套流程顺手后，再升级成“预览拆分 → 勾选 → 写入世界/线索/时间轴/正文树”。
            </p>
          </section>
          <section className="panel-block build-history-panel">
            <div className="panel-title">本次构建历史</div>
            <BuildHistoryList history={history} onSelectHistory={onSelectHistory} />
          </section>
        </div>
      ) : null}

      {activeTab === "章节细纲" ? (
        <section className="panel-block build-draft-panel">
          <div className="panel-title">章节细纲</div>
          <div className="build-result-box build-result-box-large">
            {chapterResult ? <pre>{chapterResult}</pre> : <p className="muted">先生成总纲，再点击“生成细纲”。AI 会把故事推进拆成卷、章、Scene、冲突变化和结尾钩子。</p>}
          </div>
        </section>
      ) : null}
    </div>
  );
}

function BuildModuleCard({ title, description, action }: { title: string; description: string; action: string }) {
  return (
    <article className="build-module-card">
      <div>
        <strong>{title}</strong>
        <span>{action}</span>
      </div>
      <p>{description}</p>
    </article>
  );
}

function BuildHistoryList({ history, onSelectHistory }: { history: BuildHistoryItem[]; onSelectHistory: (item: BuildHistoryItem) => void }) {
  if (!history.length) {
    return <p className="muted">本次打开工作台后生成的总纲和章节细纲会出现在这里。需要长期保存时，点击“保存当前稿”。</p>;
  }

  return (
    <div className="build-history-list">
      {history.map((item) => (
        <button key={item.id} className="build-history-item" onClick={() => onSelectHistory(item)}>
          <strong>{item.title}</strong>
          <span>{item.kind} / {item.focus} / {formatDate(item.createdAt)}</span>
        </button>
      ))}
    </div>
  );
}

function BuildChatBox({ messages, running }: { messages: BuildMessage[]; running: boolean }) {
  return (
    <div className="build-chat-box">
      {messages.length ? (
        messages.map((message, index) => (
          <article key={`${message.role}-${index}`} className={clsx("build-message", message.role === "AI" && "build-message-ai")}>
            <div className="build-message-role">{message.role}</div>
            <p>{message.content}</p>
          </article>
        ))
      ) : (
        <p className="muted">AI 会先追问关键问题，逐步帮你逼近故事方案。</p>
      )}
      {running ? <p className="muted">AI 正在处理...</p> : null}
    </div>
  );
}

function ManuscriptView({
  activeProject,
  selectedScene,
  saveState,
  searchQuery,
  searchResults,
  onAddVolume,
  onAddChapter,
  onAddScene,
  onDeleteVolume,
  onDeleteChapter,
  onDeleteScene,
  onSelectScene,
  onUpdateScene,
  onUpdateContent,
  onManualSave,
  onCreateTimelineEvent,
  onSelectionAction,
  onSearchQueryChange,
  onOpenSearchResult,
}: {
  activeProject: ProjectNode | null;
  selectedScene: SceneNode | null;
  saveState: SaveState;
  searchQuery: string;
  searchResults: SearchResult[];
  onAddVolume: () => void;
  onAddChapter: (volumeId: string, count: number) => void;
  onAddScene: (chapterId: string, count: number) => void;
  onDeleteVolume: (volumeId: string, title: string) => void;
  onDeleteChapter: (chapterId: string, title: string) => void;
  onDeleteScene: (sceneId: string, title: string) => void;
  onSelectScene: (id: string) => void;
  onUpdateScene: (patch: Partial<SceneNode>) => void;
  onUpdateContent: (content: JSONContent, text: string) => void;
  onManualSave: () => void;
  onCreateTimelineEvent: () => void;
  onSelectionAction: (action: ManuscriptSelectionAction, text: string) => void;
  onSearchQueryChange: (query: string) => void;
  onOpenSearchResult: (result: SearchResult) => void;
}) {
  const [treeCollapsed, setTreeCollapsed] = useState(false);
  const [editorFontSize, setEditorFontSize] = useState(18);

  return (
    <div className="manuscript-layout">
      <aside className={clsx("writing-left-panel", treeCollapsed && "writing-left-panel-tree-collapsed")}>
        <section className="story-tree-panel">
          <div className="mb-3 flex items-center justify-between gap-2">
            <div className="panel-title">正文树</div>
            {treeCollapsed ? (
              <button
                className="button icon-button"
                onClick={() => setTreeCollapsed(false)}
                title="展开正文树"
                aria-label="展开正文树"
              >
                <PanelLeftOpen size={15} />
              </button>
            ) : (
              <span className="inline-flex gap-1">
                <button className="button icon-button" onClick={onAddVolume} title="新建卷">
                  <FolderPlus size={15} />
                </button>
                <button
                  className="button icon-button"
                  onClick={() => setTreeCollapsed(true)}
                  title="收起正文树"
                  aria-label="收起正文树"
                >
                  <PanelLeftClose size={15} />
                </button>
              </span>
            )}
          </div>
          {treeCollapsed ? (
            <p className="text-sm leading-7 muted">正文树已收起，搜索区已扩大。</p>
          ) : (
            <div className="story-tree-content">
              {activeProject?.volumes.map((volume) => (
                <div key={volume.id} className="tree-group">
                  <div className="tree-heading">
                    <span>{volume.title}</span>
                    <span className="inline-flex gap-1">
                      <button className="button icon-button" onClick={() => onAddChapter(volume.id, volume.chapters.length)} title="新建章节">
                        <FilePlus2 size={14} />
                      </button>
                      <button className="button icon-button button-danger" onClick={() => onDeleteVolume(volume.id, volume.title)} title="删除卷">
                        <Trash2 size={14} />
                      </button>
                    </span>
                  </div>
                  {volume.chapters.map((chapter) => (
                    <div key={chapter.id} className="tree-nest">
                      <div className="tree-subheading">
                        <span>{chapter.title}</span>
                        <span className="inline-flex gap-1">
                          <button className="button icon-button" onClick={() => onAddScene(chapter.id, chapter.scenes.length)} title="新建 Scene">
                            <Plus size={14} />
                          </button>
                          <button className="button icon-button button-danger" onClick={() => onDeleteChapter(chapter.id, chapter.title)} title="删除章节">
                            <Trash2 size={14} />
                          </button>
                        </span>
                      </div>
                      {chapter.scenes.map((scene) => (
                        <div key={scene.id} className="tree-line">
                          <button
                            className={clsx("tree-item text-sm", selectedScene?.id === scene.id && "tree-item-active")}
                            onClick={() => onSelectScene(scene.id)}
                          >
                            <span className="block truncate">{scene.title}</span>
                            <span className="block text-xs muted">{scene.status} / {scene.wordCount} 字</span>
                          </button>
                          <button className="button icon-button button-danger" onClick={() => onDeleteScene(scene.id, scene.title)} title="删除 Scene">
                            <Trash2 size={14} />
                          </button>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}
        </section>
        <section className="manuscript-search-panel">
          <SearchTool
            searchQuery={searchQuery}
            searchResults={searchResults}
            onSearchQueryChange={onSearchQueryChange}
            onOpenResult={onOpenSearchResult}
          />
        </section>
      </aside>
      <div className="editor-frame editor-frame-v2">
        <div className="editor-topbar">
          <input
            className="title-input"
            value={selectedScene?.title ?? ""}
            onChange={(event) => onUpdateScene({ title: event.target.value })}
            placeholder="选择或新建一个 Scene"
            disabled={!selectedScene}
          />
          <div className="editor-topbar-actions">
            <label className="font-size-control">
              字号
              <select className="input" value={editorFontSize} onChange={(event) => setEditorFontSize(Number(event.target.value))}>
                {[14, 16, 18, 20, 22].map((size) => (
                  <option key={size} value={size}>
                    {size}
                  </option>
                ))}
              </select>
            </label>
            <button
              className={clsx("button save-button", (saveState === "有改动" || saveState === "保存失败") && "button-primary")}
              disabled={!selectedScene || saveState === "保存中"}
              onClick={onManualSave}
              title="立即保存当前 Scene"
            >
              <Save size={15} />
              {saveState}
            </button>
            <button className="button save-button" disabled={!selectedScene} onClick={onCreateTimelineEvent} title="用当前 Scene 创建时间轴事件">
              <CalendarDays size={15} />
              入轴
            </button>
          </div>
        </div>
        {selectedScene ? (
          <div className="scene-meta-grid">
            <label>
              状态
              <select className="input" value={selectedScene.status} onChange={(event) => onUpdateScene({ status: event.target.value })}>
                {sceneStatuses.map((status) => (
                  <option key={status}>{status}</option>
                ))}
              </select>
            </label>
            <label>
              POV
              <input className="input" value={selectedScene.pov} onChange={(event) => onUpdateScene({ pov: event.target.value })} placeholder="谁的视角" />
            </label>
            <label>
              故事时间
              <input className="input" value={selectedScene.storyTime} onChange={(event) => onUpdateScene({ storyTime: event.target.value })} placeholder="例如：帝国历 17 年冬" />
            </label>
            <label className="wide">
              Scene 摘要
              <input className="input" value={selectedScene.summary} onChange={(event) => onUpdateScene({ summary: event.target.value })} placeholder="这一场发生了什么" />
            </label>
            <label>
              目标
              <input className="input" value={selectedScene.goal} onChange={(event) => onUpdateScene({ goal: event.target.value })} placeholder="角色想要什么" />
            </label>
            <label>
              冲突
              <input className="input" value={selectedScene.conflict} onChange={(event) => onUpdateScene({ conflict: event.target.value })} placeholder="什么阻止他" />
            </label>
            <label>
              结果
              <input className="input" value={selectedScene.outcome} onChange={(event) => onUpdateScene({ outcome: event.target.value })} placeholder="结尾改变了什么" />
            </label>
          </div>
        ) : null}
        <ManuscriptEditor scene={selectedScene} fontSize={editorFontSize} onChange={onUpdateContent} onSelectionAction={onSelectionAction} />
      </div>
    </div>
  );
}

function ManuscriptSidePanel({
  activeTab,
  onTabChange,
  selectedScene,
  relations,
  entities,
  threads,
  libraryItems,
  aiPrompt,
  aiResult,
  aiRunning,
  onAiPromptChange,
  onCreateRelation,
  onDeleteRelation,
  onRunAiAction,
}: {
  activeTab: ManuscriptSideTab;
  onTabChange: (tab: ManuscriptSideTab) => void;
  selectedScene: SceneNode | null;
  relations: WorkbenchData["relations"];
  entities: WorldEntity[];
  threads: NarrativeThread[];
  libraryItems: LibraryItem[];
  aiPrompt: string;
  aiResult: string;
  aiRunning: boolean;
  onAiPromptChange: (prompt: string) => void;
  onCreateRelation: (targetType: "世界实体" | "叙事线索" | "资料", targetId: string, relationType: string) => void;
  onDeleteRelation: (relationId: string) => void;
  onRunAiAction: (
    action: AiAction,
    mode: AiMode,
    prompt: string,
    providerId: string | null,
    modelName: string
  ) => void;
}) {
  return (
    <div className="manuscript-side-panel">
      <div className="side-tabs" role="tablist" aria-label="正文侧栏">
        {(["AI", "关联"] as const).map((tab) => (
          <button
            key={tab}
            className={clsx("side-tab", activeTab === tab && "side-tab-active")}
            onClick={() => onTabChange(tab)}
            role="tab"
            aria-selected={activeTab === tab}
          >
            {tab === "AI" ? "AI 辅助" : "Scene 关联"}
          </button>
        ))}
      </div>
      {activeTab === "AI" ? (
        <ManuscriptAiPanel
          selectedScene={selectedScene}
          prompt={aiPrompt}
          aiResult={aiResult}
          aiRunning={aiRunning}
          onPromptChange={onAiPromptChange}
          onRunAiAction={onRunAiAction}
        />
      ) : (
        <SceneRelationsPanel
          selectedScene={selectedScene}
          relations={relations}
          entities={entities}
          threads={threads}
          libraryItems={libraryItems}
          onCreateRelation={onCreateRelation}
          onDeleteRelation={onDeleteRelation}
        />
      )}
    </div>
  );
}

function ManuscriptAiPanel({
  selectedScene,
  prompt,
  aiResult,
  aiRunning,
  onPromptChange,
  onRunAiAction,
}: {
  selectedScene: SceneNode | null;
  prompt: string;
  aiResult: string;
  aiRunning: boolean;
  onPromptChange: (prompt: string) => void;
  onRunAiAction: (
    action: AiAction,
    mode: AiMode,
    prompt: string,
    providerId: string | null,
    modelName: string
  ) => void;
}) {
  const runAuto = (action: AiAction, mode: AiMode) => {
    onRunAiAction(action, mode, prompt, null, "");
  };
  const askQuestion = () => {
    const question = window.prompt("你想问当前 Scene 什么？", prompt);
    if (!question?.trim()) {
      return;
    }
    onPromptChange(question);
    onRunAiAction("分析当前 Scene", "分析", question, null, "");
  };

  return (
    <section className="manuscript-ai-panel">
      <div>
        <div className="panel-title">AI 写作辅助</div>
        <p className="text-sm leading-7 muted">跟随当前 Scene 自动分析、续写或润色，只给建议，不改正文。</p>
      </div>
      <div className="manuscript-ai-scene">
        <div className="font-bold">{selectedScene?.title ?? "未选择 Scene"}</div>
        <div className="text-xs muted">{selectedScene ? `${selectedScene.wordCount} 字 / 自动匹配模型` : "选择 Scene 后可使用"}</div>
      </div>
      <textarea
        className="textarea manuscript-ai-prompt"
        value={prompt}
        onChange={(event) => onPromptChange(event.target.value)}
        placeholder="可选：比如“帮我看节奏是否拖慢”“这段对白哪里不自然”“给我三个续写方向”。"
      />
      <div className="manuscript-ai-actions">
        <button className="button" disabled={aiRunning || !selectedScene} onClick={askQuestion}>
          <Bot size={16} />
          提问
        </button>
        <button className="button" disabled={aiRunning || !selectedScene} onClick={() => runAuto("分析当前 Scene", "分析")}>
          <Target size={16} />
          分析
        </button>
        <button className="button button-primary" disabled={aiRunning || !selectedScene} onClick={() => runAuto("续写建议", "创作")}>
          <Sparkles size={16} />
          续写
        </button>
        <button className="button" disabled={aiRunning || !selectedScene} onClick={() => runAuto("润色建议", "创作")}>
          <FileText size={16} />
          润色
        </button>
        <button className="button" disabled={aiRunning || !selectedScene} onClick={() => runAuto("改写建议", "创作")}>
          <FileText size={16} />
          改写
        </button>
      </div>
      <div className="manuscript-ai-result">
        {aiRunning ? (
          <div className="muted">AI 正在阅读当前 Scene...</div>
        ) : aiResult ? (
          <pre>{aiResult}</pre>
        ) : (
          <div className="muted">建议会显示在这里，方便你边写边参考。</div>
        )}
      </div>
    </section>
  );
}

function SceneRelationsPanel({
  selectedScene,
  relations,
  entities,
  threads,
  libraryItems,
  onCreateRelation,
  onDeleteRelation,
}: {
  selectedScene: SceneNode | null;
  relations: WorkbenchData["relations"];
  entities: WorldEntity[];
  threads: NarrativeThread[];
  libraryItems: LibraryItem[];
  onCreateRelation: (targetType: "世界实体" | "叙事线索" | "资料", targetId: string, relationType: string) => void;
  onDeleteRelation: (relationId: string) => void;
}) {
  const [entityTarget, setEntityTarget] = useState("");
  const [threadTarget, setThreadTarget] = useState("");
  const [libraryTarget, setLibraryTarget] = useState("");
  const sceneRelations = useMemo(
    () => relations.filter((relation) => selectedScene && relation.sourceType === "Scene" && relation.sourceId === selectedScene.id),
    [relations, selectedScene]
  );
  const relationGroups = useMemo(
    () => buildSceneRelationGroups(sceneRelations, entities, threads, libraryItems),
    [sceneRelations, entities, threads, libraryItems]
  );

  const addRelation = (targetType: "世界实体" | "叙事线索" | "资料", targetId: string) => {
    if (!targetId) {
      return;
    }
    onCreateRelation(targetType, targetId, defaultRelationType(targetType, targetId, entities));
    if (targetType === "世界实体") {
      setEntityTarget("");
    } else if (targetType === "叙事线索") {
      setThreadTarget("");
    } else {
      setLibraryTarget("");
    }
  };

  return (
    <section className="scene-relations-panel">
      <div>
        <div className="panel-title">当前 Scene 关联</div>
        <p className="text-sm leading-7 muted">{selectedScene ? selectedScene.title : "选择 Scene 后可绑定人物、地点、线索和资料。"}</p>
      </div>

      {selectedScene ? (
        <>
          <div className="scene-relation-adders">
            <RelationPicker
              label="世界"
              value={entityTarget}
              options={entities.map((entity) => ({ id: entity.id, title: entity.name, meta: entity.type }))}
              onChange={setEntityTarget}
              onAdd={() => addRelation("世界实体", entityTarget)}
            />
            <RelationPicker
              label="线索"
              value={threadTarget}
              options={threads.map((thread) => ({ id: thread.id, title: thread.title, meta: thread.type }))}
              onChange={setThreadTarget}
              onAdd={() => addRelation("叙事线索", threadTarget)}
            />
            <RelationPicker
              label="资料"
              value={libraryTarget}
              options={libraryItems.map((item) => ({ id: item.id, title: item.title, meta: item.type }))}
              onChange={setLibraryTarget}
              onAdd={() => addRelation("资料", libraryTarget)}
            />
          </div>
          <div className="scene-relation-groups">
            {relationGroups.map((group) => (
              <div key={group.title} className="scene-relation-group">
                <div className="scene-relation-group-title">{group.title}</div>
                {group.items.length ? (
                  group.items.map((item) => (
                    <div key={item.relation.id} className="scene-relation-chip">
                      <span>
                        {item.title}
                        <small>{item.meta}</small>
                      </span>
                      <button className="button icon-button button-danger" onClick={() => onDeleteRelation(item.relation.id)} title="移除关联">
                        <Trash2 size={13} />
                      </button>
                    </div>
                  ))
                ) : (
                  <p className="text-sm muted">暂无</p>
                )}
              </div>
            ))}
          </div>
        </>
      ) : null}
    </section>
  );
}

function RelationPicker({
  label,
  value,
  options,
  onChange,
  onAdd,
}: {
  label: string;
  value: string;
  options: Array<{ id: string; title: string; meta: string }>;
  onChange: (value: string) => void;
  onAdd: () => void;
}) {
  return (
    <label className="relation-picker">
      {label}
      <span>
        <select className="input" value={value} onChange={(event) => onChange(event.target.value)}>
          <option value="">选择{label}</option>
          {options.map((option) => (
            <option key={option.id} value={option.id}>
              {option.meta} / {option.title}
            </option>
          ))}
        </select>
        <button className="button" onClick={onAdd} disabled={!value}>
          添加
        </button>
      </span>
    </label>
  );
}

function StoryView({
  activeProject,
  selectedSceneId,
  onAddVolume,
  onAddChapter,
  onAddScene,
  onAddBeat,
  onDeleteVolume,
  onDeleteChapter,
  onDeleteScene,
  onDeleteBeat,
  onSelectScene,
}: {
  activeProject: ProjectNode | null;
  selectedSceneId: string | null;
  onAddVolume: () => void;
  onAddChapter: (volumeId: string, count: number) => void;
  onAddScene: (chapterId: string, count: number) => void;
  onAddBeat: () => void;
  onDeleteVolume: (volumeId: string, title: string) => void;
  onDeleteChapter: (chapterId: string, title: string) => void;
  onDeleteScene: (sceneId: string, title: string) => void;
  onDeleteBeat: (beatId: string, title: string) => void;
  onSelectScene: (id: string) => void;
}) {
  return (
    <div className="workspace-page">
      <header className="workspace-header">
        <div>
          <div className="eyebrow">Story Tree</div>
          <h1>故事树</h1>
        </div>
        <button className="button button-primary" onClick={onAddVolume}>
          <FolderPlus size={16} />
          新建卷
        </button>
      </header>
      <div className="story-board">
        {activeProject?.volumes.map((volume) => (
          <section key={volume.id} className="story-column">
            <div className="story-column-header">
              <strong>{volume.title}</strong>
              <span className="inline-flex gap-1">
                <button className="button icon-button" onClick={() => onAddChapter(volume.id, volume.chapters.length)} title="新建章节">
                  <FilePlus2 size={14} />
                </button>
                <button className="button icon-button button-danger" onClick={() => onDeleteVolume(volume.id, volume.title)} title="删除卷">
                  <Trash2 size={14} />
                </button>
              </span>
            </div>
            {volume.chapters.map((chapter) => (
              <div key={chapter.id} className="chapter-card">
                <div className="story-column-header">
                  <span>{chapter.title}</span>
                  <span className="inline-flex gap-1">
                    <button className="button icon-button" onClick={() => onAddScene(chapter.id, chapter.scenes.length)} title="新建 Scene">
                      <Plus size={14} />
                    </button>
                    <button className="button icon-button button-danger" onClick={() => onDeleteChapter(chapter.id, chapter.title)} title="删除章节">
                      <Trash2 size={14} />
                    </button>
                  </span>
                </div>
                {chapter.scenes.map((scene) => (
                  <div key={scene.id} className={clsx("scene-card", selectedSceneId === scene.id && "scene-card-active")}>
                    <button className="scene-card-main" onClick={() => onSelectScene(scene.id)}>
                      <div className="font-bold">{scene.title}</div>
                      <div className="text-xs muted">{scene.status} / {scene.wordCount} 字</div>
                      {scene.summary ? <p>{scene.summary}</p> : null}
                    </button>
                    <button className="button icon-button button-danger scene-delete-button" onClick={() => onDeleteScene(scene.id, scene.title)} title="删除 Scene">
                      <Trash2 size={14} />
                    </button>
                    {scene.beats.length ? (
                      <div className="beat-list">
                        {scene.beats.map((beat) => (
                          <span key={beat.id}>
                            {beat.title}
                            <button className="beat-delete" onClick={() => onDeleteBeat(beat.id, beat.title)} title="删除 Beat">
                              ×
                            </button>
                          </span>
                        ))}
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            ))}
          </section>
        ))}
      </div>
      <button className="button mt-4" onClick={onAddBeat}>
        <Plus size={16} />
        给当前 Scene 添加 Beat
      </button>
    </div>
  );
}

function WorldView(props: {
  entities: WorldEntity[];
  selectedEntity: WorldEntity | null;
  onCreate: () => void;
  onSelect: (id: string) => void;
  onUpdate: (patch: Partial<WorldEntity>) => void;
  onDelete: (entity: WorldEntity) => void;
}) {
  return (
    <div className="workspace-page">
      <header className="workspace-header">
        <div>
          <div className="eyebrow">World Entities</div>
          <h1>世界</h1>
        </div>
        <button className="button button-primary" onClick={props.onCreate}>
          <Plus size={16} />
          新建
        </button>
      </header>
      <div className="split-panel">
        <ItemList items={props.entities} selectedId={props.selectedEntity?.id ?? null} titleKey="name" onSelect={props.onSelect} />
        {props.selectedEntity ? (
          <WorldDetailPanel
            entity={props.selectedEntity}
            onUpdate={props.onUpdate}
            onDelete={props.onDelete}
          />
        ) : (
          <EmptyPanel text="人物、地点、势力、物品、规则和事件都会沉淀在这里。" />
        )}
      </div>
    </div>
  );
}

function TimelineView({
  events,
  scenes,
  onCreate,
  onUpdate,
  onDelete,
}: {
  events: WorkbenchData["timelineEvents"];
  scenes: SceneNode[];
  onCreate: () => void;
  onUpdate: (id: string, patch: Partial<WorkbenchData["timelineEvents"][number]>) => void;
  onDelete: (id: string, title: string) => void;
}) {
  const sceneMap = new Map(scenes.map((scene) => [scene.id, scene]));
  const grouped = groupTimelineEvents(events);

  return (
    <div className="workspace-page">
      <header className="workspace-header">
        <div>
          <div className="eyebrow">Timeline</div>
          <h1>时间轴</h1>
        </div>
        <button className="button button-primary" onClick={onCreate}>
          <Plus size={16} />
          新建事件
        </button>
      </header>

      <div className="timeline-board">
        {grouped.map((group) => (
          <section key={group.type} className="timeline-section">
            <div className="timeline-section-head">
              <span>{group.type}</span>
              <small>{group.events.length} 个事件</small>
            </div>
            <div className="timeline-event-list">
              {group.events.map((event) => (
                <article key={event.id} className="timeline-card">
                  <div className="timeline-card-head">
                    <input
                      className="input timeline-title-input"
                      defaultValue={event.title}
                      onBlur={(inputEvent) => onUpdate(event.id, { title: inputEvent.target.value })}
                    />
                    <button className="button icon-button button-danger" onClick={() => onDelete(event.id, event.title)} title="删除事件">
                      <Trash2 size={14} />
                    </button>
                  </div>
                  <div className="timeline-fields">
                    <label>
                      时间
                      <input
                        className="input"
                        defaultValue={event.eventTime}
                        onBlur={(inputEvent) => onUpdate(event.id, { eventTime: inputEvent.target.value })}
                        placeholder="例如：2015 年 / 第 8 章夜里"
                      />
                    </label>
                    <label>
                      类型
                      <select className="input" value={event.type} onChange={(inputEvent) => onUpdate(event.id, { type: inputEvent.target.value })}>
                        {timelineTypes.map((type) => (
                          <option key={type}>{type}</option>
                        ))}
                      </select>
                    </label>
                    <label>
                      地点
                      <input
                        className="input"
                        defaultValue={event.location}
                        onBlur={(inputEvent) => onUpdate(event.id, { location: inputEvent.target.value })}
                        placeholder="地点"
                      />
                    </label>
                    <label>
                      关联 Scene
                      <select
                        className="input"
                        value={event.sceneId ?? ""}
                        onChange={(inputEvent) => onUpdate(event.id, { sceneId: inputEvent.target.value })}
                      >
                        <option value="">不关联</option>
                        {scenes.map((scene) => (
                          <option key={scene.id} value={scene.id}>
                            {scene.title}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <label>
                    参与人物
                    <input
                      className="input"
                      defaultValue={event.participants}
                      onBlur={(inputEvent) => onUpdate(event.id, { participants: inputEvent.target.value })}
                      placeholder="用逗号分隔"
                    />
                  </label>
                  <label>
                    说明
                    <textarea
                      className="textarea timeline-summary"
                      defaultValue={event.summary}
                      onBlur={(inputEvent) => onUpdate(event.id, { summary: inputEvent.target.value })}
                      placeholder="这件事改变了什么？埋下或回收了什么？"
                    />
                  </label>
                  {event.sceneId && sceneMap.get(event.sceneId) ? (
                    <div className="timeline-linked-scene">关联正文：{sceneMap.get(event.sceneId)?.title}</div>
                  ) : null}
                </article>
              ))}
              {!group.events.length ? <p className="text-sm muted">暂无事件。</p> : null}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

function WorldDetailPanel({
  entity,
  onUpdate,
  onDelete,
}: {
  entity: WorldEntity;
  onUpdate: (patch: Partial<WorldEntity>) => void;
  onDelete: (entity: WorldEntity) => void;
}) {
  const structured = buildWorldStructure(entity);

  return (
    <section key={entity.id} className="detail-panel world-detail-panel">
      <div className="detail-actions">
        <button className="button button-danger" onClick={() => onDelete(entity)}>
          <Trash2 size={16} />
          删除
        </button>
      </div>
      <div className="detail-title">
        <MapPin size={16} />
        <span>{entity.name}</span>
      </div>
      <div className="world-basic-grid">
        <label>
          类型
          <select className="input" value={entity.type} onChange={(event) => onUpdate({ type: event.target.value })}>
            {entityTypes.map((type) => (
              <option key={type}>{type}</option>
            ))}
          </select>
        </label>
        <label>
          名称
          <input className="input" defaultValue={entity.name} onBlur={(event) => onUpdate({ name: event.target.value })} />
        </label>
      </div>
      <label>
        {worldCoreLabel(entity.type)}
        <textarea
          className="textarea"
          defaultValue={entity.summary}
          onBlur={(event) => onUpdate({ summary: event.target.value })}
          placeholder={worldCorePlaceholder(entity.type)}
        />
      </label>
      <section className="world-structured-view">
        <div className="panel-title">设定速览</div>
        {structured.fields.length ? (
          <div className="world-field-grid">
            {structured.fields.map((field) => (
              <div key={`${field.label}-${field.value.slice(0, 16)}`} className="world-field">
                <span>{field.label}</span>
                <p>{field.value}</p>
              </div>
            ))}
          </div>
        ) : null}
        {structured.sections.map((section) => (
          <article key={section.title} className="world-section">
            <h3>{section.title}</h3>
            <p>{section.body}</p>
          </article>
        ))}
        {!structured.fields.length && !structured.sections.length ? (
          <p className="text-sm muted">还没有可拆分的设定内容。</p>
        ) : null}
      </section>
      <label>
        标签与来源
        <input className="input" defaultValue={entity.tags} onBlur={(event) => onUpdate({ tags: event.target.value })} placeholder="用逗号分隔" />
      </label>
    </section>
  );
}

function ThreadView({
  threads,
  selectedThread,
  onCreate,
  onSelect,
  onUpdate,
  onDelete,
}: {
  threads: NarrativeThread[];
  selectedThread: NarrativeThread | null;
  onCreate: () => void;
  onSelect: (id: string) => void;
  onUpdate: (patch: Partial<NarrativeThread>) => void;
  onDelete: (thread: NarrativeThread) => void;
}) {
  return (
    <div className="workspace-page">
      <header className="workspace-header">
        <div>
          <div className="eyebrow">Narrative Threads</div>
          <h1>叙事线索</h1>
        </div>
        <button className="button button-primary" onClick={onCreate}>
          <Plus size={16} />
          新建线索
        </button>
      </header>
      <div className="split-panel">
        <ItemList items={threads} selectedId={selectedThread?.id ?? null} titleKey="title" onSelect={onSelect} />
        {selectedThread ? (
          <section className="detail-panel">
            <div className="detail-actions">
              <button className="button button-danger" onClick={() => onDelete(selectedThread)}>
                <Trash2 size={16} />
                删除线索
              </button>
            </div>
            <label>
              类型
              <select className="input" value={selectedThread.type} onChange={(event) => onUpdate({ type: event.target.value })}>
                {threadTypes.map((type) => (
                  <option key={type}>{type}</option>
                ))}
              </select>
            </label>
            <label>
              名称
              <input className="input" defaultValue={selectedThread.title} onBlur={(event) => onUpdate({ title: event.target.value })} />
            </label>
            <label>
              状态
              <select className="input" value={selectedThread.status} onChange={(event) => onUpdate({ status: event.target.value })}>
                {threadStatuses.map((status) => (
                  <option key={status}>{status}</option>
                ))}
              </select>
            </label>
            <label>
              摘要
              <textarea className="textarea thread-summary-textarea" defaultValue={selectedThread.summary} onBlur={(event) => onUpdate({ summary: event.target.value })} />
            </label>
          </section>
        ) : (
          <EmptyPanel text="还没有叙事线索。" />
        )}
      </div>
    </div>
  );
}

function LibraryView(props: {
  items: LibraryItem[];
  selectedItem: LibraryItem | null;
  onCreate: () => void;
  onSelect: (id: string) => void;
  onUpdate: (patch: Partial<LibraryItem>) => void;
  onDelete: (item: LibraryItem) => void;
}) {
  return (
    <EntityLikeView
      eyebrow="Research Library"
      title="资料"
      emptyText="灵感、研究资料、摘录和参考会保存在这里。"
      items={props.items}
      selectedItem={props.selectedItem}
      typeOptions={libraryTypes}
      titleKey="title"
      icon={<FileText size={16} />}
      onCreate={props.onCreate}
      onSelect={props.onSelect}
      onUpdate={props.onUpdate}
      onDelete={props.onDelete}
    />
  );
}

function EntityLikeView<T extends WorldEntity | LibraryItem>({
  eyebrow,
  title,
  emptyText,
  items,
  selectedItem,
  typeOptions,
  titleKey,
  icon,
  onCreate,
  onSelect,
  onUpdate,
  onDelete,
}: {
  eyebrow: string;
  title: string;
  emptyText: string;
  items: T[];
  selectedItem: T | null;
  typeOptions: string[];
  titleKey: "name" | "title";
  icon: React.ReactNode;
  onCreate: () => void;
  onSelect: (id: string) => void;
  onUpdate: (patch: Partial<T>) => void;
  onDelete: (item: T) => void;
}) {
  return (
    <div className="workspace-page">
      <header className="workspace-header">
        <div>
          <div className="eyebrow">{eyebrow}</div>
          <h1>{title}</h1>
        </div>
        <button className="button button-primary" onClick={onCreate}>
          <Plus size={16} />
          新建
        </button>
      </header>
      <div className="split-panel">
        <ItemList items={items} selectedId={selectedItem?.id ?? null} titleKey={titleKey} onSelect={onSelect} />
        {selectedItem ? (
          <section key={selectedItem.id} className={clsx("detail-panel", title === "资料" && "library-detail-panel")}>
            <div className="detail-actions">
              <button className="button button-danger" onClick={() => onDelete(selectedItem)}>
                <Trash2 size={16} />
                删除
              </button>
            </div>
            <div className="detail-title">
              {icon}
              <span>{getItemTitle(selectedItem, titleKey)}</span>
            </div>
            <label>
              类型
              <select className="input" value={selectedItem.type} onChange={(event) => onUpdate({ type: event.target.value } as Partial<T>)}>
                {typeOptions.map((type) => (
                  <option key={type}>{type}</option>
                ))}
              </select>
            </label>
            <label>
              名称
              <input className="input" defaultValue={getItemTitle(selectedItem, titleKey)} onBlur={(event) => onUpdate({ [titleKey]: event.target.value } as unknown as Partial<T>)} />
            </label>
            {"status" in selectedItem ? (
              <label>
                状态
                <input className="input" defaultValue={selectedItem.status} onBlur={(event) => onUpdate({ status: event.target.value } as unknown as Partial<T>)} />
              </label>
            ) : null}
            {"summary" in selectedItem ? (
              <label>
                摘要
                <textarea
                  className="textarea"
                  defaultValue={selectedItem.summary}
                  onBlur={(event) => onUpdate({ summary: event.target.value } as unknown as Partial<T>)}
                />
              </label>
            ) : null}
            <label>
              {"summary" in selectedItem ? "正文 / 备注" : "正文内容"}
              <textarea className="textarea tall" defaultValue={selectedItem.content} onBlur={(event) => onUpdate({ content: event.target.value } as unknown as Partial<T>)} />
            </label>
            <label>
              标签
              <input className="input" defaultValue={selectedItem.tags} onBlur={(event) => onUpdate({ tags: event.target.value } as unknown as Partial<T>)} placeholder="用逗号分隔" />
            </label>
            {"source" in selectedItem ? (
              <label>
                来源
                <input className="input" defaultValue={selectedItem.source} onBlur={(event) => onUpdate({ source: event.target.value } as unknown as Partial<T>)} />
              </label>
            ) : null}
          </section>
        ) : (
          <EmptyPanel text={emptyText} />
        )}
      </div>
    </div>
  );
}

function RelationView({
  relations,
  selectedScene,
  entities,
  threads,
  libraryItems,
  onCreateRelation,
  onDelete,
}: {
  relations: WorkbenchData["relations"];
  selectedScene: SceneNode | null;
  entities: WorldEntity[];
  threads: NarrativeThread[];
  libraryItems: LibraryItem[];
  onCreateRelation: (targetType: "世界实体" | "叙事线索" | "资料", targetId: string, relationType: string) => void;
  onDelete: (relationId: string) => void;
}) {
  const [targetType, setTargetType] = useState<"世界实体" | "叙事线索" | "资料">("世界实体");
  const [targetId, setTargetId] = useState("");
  const [relationType, setRelationType] = useState("相关");
  const sceneRelations = relations.filter((relation) => selectedScene && relation.sourceType === "Scene" && relation.sourceId === selectedScene.id);
  const targetOptions =
    targetType === "世界实体"
      ? entities.map((entity) => ({ id: entity.id, title: entity.name, meta: entity.type }))
      : targetType === "叙事线索"
        ? threads.map((thread) => ({ id: thread.id, title: thread.title, meta: thread.type }))
        : libraryItems.map((item) => ({ id: item.id, title: item.title, meta: item.type }));
  const targetTitle = (relation: WorkbenchData["relations"][number]) =>
    relationTargetTitle(relation, entities, threads, libraryItems);

  const addRelation = () => {
    if (!selectedScene || !targetId) {
      return;
    }
    onCreateRelation(targetType, targetId, relationType.trim() || defaultRelationType(targetType, targetId, entities));
    setTargetId("");
  };

  return (
    <div className="workspace-page">
      <header className="workspace-header">
        <div>
          <div className="eyebrow">Relations</div>
          <h1>关系</h1>
        </div>
      </header>
      <div className="workspace-grid">
        <section className="panel-block">
          <div className="panel-title">给当前 Scene 添加关联</div>
          <p className="text-sm leading-7 muted">当前 Scene：{selectedScene?.title ?? "未选择 Scene"}</p>
          <div className="relation-create-grid">
            <label>
              类型
              <select
                className="input"
                value={targetType}
                onChange={(event) => {
                  const nextType = event.target.value as "世界实体" | "叙事线索" | "资料";
                  setTargetType(nextType);
                  setTargetId("");
                  setRelationType(defaultRelationType(nextType, "", entities));
                }}
              >
                <option value="世界实体">世界</option>
                <option value="叙事线索">线索</option>
                <option value="资料">资料</option>
              </select>
            </label>
            <label>
              对象
              <select className="input" value={targetId} onChange={(event) => setTargetId(event.target.value)}>
                <option value="">请选择</option>
                {targetOptions.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.title} / {option.meta}
                  </option>
                ))}
              </select>
            </label>
            <label>
              关系说明
              <input className="input" value={relationType} onChange={(event) => setRelationType(event.target.value)} placeholder="例如：出场人物、出现地点、涉及线索" />
            </label>
            <button className="button button-primary" disabled={!selectedScene || !targetId} onClick={addRelation}>
              <Link2 size={16} />
              添加关联
            </button>
          </div>
        </section>
        <section className="panel-block">
          <div className="panel-title">当前 Scene 已有关联</div>
          <div className="space-y-2">
            {sceneRelations.length ? (
              sceneRelations.map((relation) => (
                <div key={relation.id} className="list-row static-row">
                  <span>{selectedScene?.title} → {targetTitle(relation)}</span>
                  <span className="muted">{relation.relationType}</span>
                  <button className="button icon-button button-danger" onClick={() => onDelete(relation.id)} title="删除关系">
                    <Trash2 size={14} />
                  </button>
                </div>
              ))
            ) : (
              <p className="text-sm muted">当前 Scene 还没有关系。请先明确选择对象，再添加关联。</p>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

function ImportView({
  activeProject,
  onImported,
}: {
  activeProject: ProjectNode | null;
  onImported: () => void;
}) {
  const [sourcePath, setSourcePath] = useState("");
  const [sourceMode, setSourceMode] = useState<"file" | "folder">("file");
  const [splitByHeadings, setSplitByHeadings] = useState(true);
  const [files, setFiles] = useState<ImportScanItem[]>([]);
  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(new Set());
  const [typeOverrides, setTypeOverrides] = useState<Record<string, string>>({});
  const [targetOverrides, setTargetOverrides] = useState<Record<string, ImportTarget>>({});
  const [importMessage, setImportMessage] = useState("");
  const [isScanning, setIsScanning] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const selectedFiles = files.filter((file) => selectedPaths.has(file.path));

  const scanDocuments = async () => {
    if (!sourcePath.trim()) {
      setImportMessage("请先填写 Markdown 文件或文件夹路径。");
      return;
    }
    setIsScanning(true);
    setImportMessage(sourceMode === "file" ? "正在读取 Markdown 文件..." : "正在扫描 Markdown 文件夹...");
    try {
      const result = await fetchJson<{ files: ImportScanItem[] }>("/api/import/documents/scan", {
        method: "POST",
        body: JSON.stringify({ sourcePath }),
      });
      setFiles(result.files);
      setSelectedPaths(new Set(result.files.map((file) => file.path)));
      setTypeOverrides(Object.fromEntries(result.files.map((file) => [file.path, file.typeGuess])));
      setTargetOverrides(Object.fromEntries(result.files.map((file) => [file.path, "auto" as ImportTarget])));
      setImportMessage(sourceMode === "file" ? "已读取 1 个 Markdown 文件。" : `已扫描到 ${result.files.length} 个 Markdown 文件。`);
    } catch (error) {
      setImportMessage(error instanceof Error ? error.message : "扫描失败。");
    } finally {
      setIsScanning(false);
    }
  };

  const importSelected = async () => {
    if (!activeProject) {
      setImportMessage("请先创建或选择一本小说。");
      return;
    }
    if (!selectedFiles.length) {
      setImportMessage("请选择要导入的文件。");
      return;
    }
    setIsImporting(true);
    setImportMessage("正在导入资料库...");
    try {
      const result = await fetchJson<{
        created: number;
        updated: number;
        skipped: number;
        world: { created: number; updated: number };
        threads: { created: number; updated: number };
        library: { created: number; updated: number };
      }>("/api/import/documents/import", {
        method: "POST",
        body: JSON.stringify({
          projectId: activeProject.id,
          sourcePath,
          splitByHeadings,
          files: selectedFiles.map((file) => ({
            path: file.path,
            title: file.title,
            type: typeOverrides[file.path] || file.typeGuess,
            target: targetOverrides[file.path] || "auto",
            tags: file.tags,
          })),
        }),
      });
      onImported();
      setImportMessage(
        `导入完成：世界 ${result.world.created + result.world.updated} 条，线索 ${
          result.threads.created + result.threads.updated
        } 条，资料库 ${result.library.created + result.library.updated} 条，跳过 ${result.skipped} 条。`
      );
    } catch (error) {
      setImportMessage(error instanceof Error ? error.message : "导入失败。");
    } finally {
      setIsImporting(false);
    }
  };

  const toggleFile = (filePath: string) => {
    setSelectedPaths((current) => {
      const next = new Set(current);
      if (next.has(filePath)) {
        next.delete(filePath);
      } else {
        next.add(filePath);
      }
      return next;
    });
  };

  const selectAll = () => setSelectedPaths(new Set(files.map((file) => file.path)));
  const selectNone = () => setSelectedPaths(new Set());

  return (
    <div className="workspace-page import-page">
      <header className="workspace-header">
        <div>
          <div className="eyebrow">文档导入</div>
          <h1>把本地资料搬进工作台</h1>
        </div>
        <div className="flex gap-2">
          <button className="button" onClick={selectAll} disabled={!files.length}>
            全选
          </button>
          <button className="button" onClick={selectNone} disabled={!files.length}>
            清空
          </button>
          <button className="button button-primary" onClick={importSelected} disabled={isImporting || !selectedFiles.length}>
            <UploadCloud size={16} />
            导入选中
          </button>
        </div>
      </header>

      <section className="panel-block import-source-panel">
        <label>
          Markdown 文件或文件夹路径
          <div className="import-mode-row">
            <button
              className={clsx("button", sourceMode === "file" && "button-primary")}
              onClick={() => setSourceMode("file")}
              type="button"
            >
              单个文件
            </button>
            <button
              className={clsx("button", sourceMode === "folder" && "button-primary")}
              onClick={() => setSourceMode("folder")}
              type="button"
            >
              文件夹扫描
            </button>
          </div>
          <div className="import-path-row">
            <input
              className="input"
              value={sourcePath}
              onChange={(event) => setSourcePath(event.target.value)}
              placeholder={
                sourceMode === "file"
                  ? "/Users/ray/Documents/Obsidian/Ray/整理/《转角遇见\"鬼\"》设定集.md"
                  : "/Users/ray/Documents/Obsidian/Ray/整理"
              }
            />
            <button className="button button-primary" onClick={scanDocuments} disabled={isScanning}>
              {isScanning ? "处理中" : sourceMode === "file" ? "读取文档" : "扫描文件夹"}
            </button>
          </div>
        </label>
        <p className="text-sm leading-7 muted">
          工作台只复制 Markdown 内容，不会移动或删除原文件。自动分流规则：人物、地点、势力、规则进入世界；伏笔和悬念进入线索；大纲、资料和 Scene 参考留在资料库。
        </p>
        <label className="toggle-row">
          <input
            type="checkbox"
            checked={splitByHeadings}
            onChange={(event) => setSplitByHeadings(event.target.checked)}
          />
          按 Markdown 标题拆分为多条资料
        </label>
        {importMessage ? <div className="import-message">{importMessage}</div> : null}
      </section>

      <div className="import-grid">
        <section className="panel-block import-list-panel">
          <div className="panel-title">扫描结果</div>
          <div className="import-file-list">
            {files.map((file) => (
              <button
                key={file.path}
                className={clsx("import-file-row", selectedPaths.has(file.path) && "import-file-row-selected")}
                onClick={() => toggleFile(file.path)}
              >
                <span className="import-check">{selectedPaths.has(file.path) ? "已选" : "跳过"}</span>
                <span>
                  <strong>{file.title}</strong>
                  <span className="block text-xs muted">{file.relativePath}</span>
                </span>
                <span className="pill">{importTargetLabel(targetOverrides[file.path] || "auto")}</span>
              </button>
            ))}
            {!files.length ? <p className="text-sm leading-7 muted">填写文件或文件夹路径后处理，这里会显示 Markdown 文档。</p> : null}
          </div>
        </section>

        <section className="panel-block import-preview-panel">
          <div className="panel-title">分类预览</div>
          <div className="import-preview-list">
            {selectedFiles.map((file) => (
              <article key={file.path} className="import-preview-card">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <strong>{file.title}</strong>
                    <div className="text-xs muted">{file.relativePath}</div>
                  </div>
                  <select
                    className="input import-type-select"
                    value={typeOverrides[file.path] || file.typeGuess}
                    onChange={(event) => setTypeOverrides((current) => ({ ...current, [file.path]: event.target.value }))}
                  >
                    {["大纲", "人物", "地点", "势力", "规则", "伏笔", "Scene 参考", "资料"].map((type) => (
                      <option key={type}>{type}</option>
                    ))}
                  </select>
                  <select
                    className="input import-type-select"
                    value={targetOverrides[file.path] || "auto"}
                    onChange={(event) =>
                      setTargetOverrides((current) => ({ ...current, [file.path]: event.target.value as ImportTarget }))
                    }
                  >
                    {importTargetOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
                <p className="text-sm leading-7 muted">{file.excerpt || "没有可预览正文。"}</p>
                <div className="import-tags">
                  {file.tags.slice(0, 8).map((tag) => (
                    <span key={tag} className="pill">#{tag}</span>
                  ))}
                  {file.links.slice(0, 4).map((link) => (
                    <span key={link} className="pill">[[{link}]]</span>
                  ))}
                </div>
              </article>
            ))}
            {!selectedFiles.length ? <p className="text-sm leading-7 muted">选择文件后，这里会显示导入预览和分类建议。</p> : null}
          </div>
        </section>
      </div>
    </div>
  );
}

function buildAiAliasDraft(mode: AiMode, alias?: AiModelAlias): AiAliasDraft {
  const defaults = aiAliasDefaultParams[mode];
  return {
    providerId: alias?.providerId ?? "",
    modelName: alias?.modelName ?? "",
    temperature: alias?.temperature ?? defaults.temperature,
    topP: alias?.topP ?? defaults.topP,
    maxTokens: alias?.maxTokens ?? defaults.maxTokens,
    maxContextChars: alias?.maxContextChars ?? defaults.maxContextChars,
  };
}

function aliasDraftParams(draft: AiAliasDraft): AiAliasParams {
  return {
    temperature: draft.temperature,
    topP: draft.topP,
    maxTokens: draft.maxTokens,
    maxContextChars: draft.maxContextChars,
  };
}

function clampAliasInteger(value: number, min: number, max: number, fallback: number) {
  if (!Number.isFinite(value)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, Math.round(value)));
}

function AiContextView({
  aiSettings,
  onCreateProvider,
  onUpdateProvider,
  onDeleteProvider,
  onUpdateAlias,
  onTestProvider,
  onTestSettings,
}: {
  aiSettings: AiSettingsData;
  onCreateProvider: (input: AiProviderInput) => Promise<void>;
  onUpdateProvider: (id: string, patch: Partial<AiProviderSetting> & { apiKey?: string }) => void;
  onDeleteProvider: (provider: AiProviderSetting) => void;
  onUpdateAlias: (mode: string, providerId: string | null, modelName: string, params?: Partial<AiAliasParams>) => void;
  onTestProvider: (providerId: string) => void;
  onTestSettings: () => void;
}) {
  const aliasModes = aiAliasModes;
  const [aliasDrafts, setAliasDrafts] = useState<Record<string, AiAliasDraft>>({});
  const [showProviderForm, setShowProviderForm] = useState(false);
  const [providerFormMessage, setProviderFormMessage] = useState("");
  const [providerForm, setProviderForm] = useState<AiProviderInput>({
    name: "",
    provider: "openai-compatible",
    baseUrl: "",
    defaultModel: "",
    apiKey: "",
  });
  const defaultAlias = aiSettings.aliases.find((item) => item.mode === "默认");
  const defaultProvider = aiSettings.providers.find((item) => item.id === defaultAlias?.providerId);
  const defaultModelLabel = defaultAlias?.modelName || defaultProvider?.defaultModel || "未绑定";
  useEffect(() => {
    setAliasDrafts(
      Object.fromEntries(
        aliasModes.map((mode) => {
          const alias = aiSettings.aliases.find((item) => item.mode === mode);
          return [mode, buildAiAliasDraft(mode, alias)];
        })
      )
    );
  }, [aiSettings.aliases, aliasModes]);
  const setDefaultProvider = (provider: AiProviderSetting) => {
    const draft = aliasDrafts["默认"] ?? buildAiAliasDraft("默认", defaultAlias);
    onUpdateAlias("默认", provider.id, provider.defaultModel, aliasDraftParams(draft));
  };
  const bindProviderMode = (mode: string, provider: AiProviderSetting) => {
    const aiMode = mode as AiMode;
    const alias = aiSettings.aliases.find((item) => item.mode === mode);
    const draft = aliasDrafts[mode] ?? buildAiAliasDraft(aiMode, alias);
    onUpdateAlias(mode, provider.id, provider.defaultModel, aliasDraftParams(draft));
  };
  const submitProviderForm = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!providerForm.name.trim() || !providerForm.provider.trim() || !providerForm.defaultModel.trim()) {
      setProviderFormMessage("请填写名称、类型和默认模型。");
      return;
    }
    try {
      await onCreateProvider(providerForm);
      setProviderForm({
        name: "",
        provider: "openai-compatible",
        baseUrl: "",
        defaultModel: "",
        apiKey: "",
      });
      setProviderFormMessage("");
      setShowProviderForm(false);
    } catch (error) {
      setProviderFormMessage(error instanceof Error ? error.message : "Provider 保存失败。");
    }
  };
  return (
    <div className="workspace-page">
      <header className="workspace-header">
        <div>
          <div className="eyebrow">AI Router</div>
          <h1>AI 设置中心</h1>
        </div>
        <div className="flex gap-2">
          <button className="button" onClick={onTestSettings}>
            <KeyRound size={16} />
            检查配置
          </button>
          <button className="button button-primary" onClick={() => setShowProviderForm((value) => !value)}>
            <Plus size={16} />
            新建 Provider
          </button>
        </div>
      </header>

      {showProviderForm ? (
        <form className="panel-block ai-provider-form" onSubmit={submitProviderForm}>
          <div>
            <div className="panel-title">新建 Provider</div>
            <p className="text-sm leading-7 muted">Provider 是一个完整的服务商配置，包括接口地址、默认模型和 API Key。</p>
          </div>
          <div className="ai-form-grid">
            <label>
              名称
              <input
                className="input"
                value={providerForm.name}
                onChange={(event) => setProviderForm((form) => ({ ...form, name: event.target.value }))}
                placeholder="例如 OpenAI 主账号 / Kimi / 本地兼容接口"
              />
            </label>
            <label>
              类型
              <select
                className="input"
                value={providerForm.provider}
                onChange={(event) => setProviderForm((form) => ({ ...form, provider: event.target.value }))}
              >
                {aiProviderTypes.map((type) => (
                  <option key={type}>{type}</option>
                ))}
              </select>
            </label>
            <label className="wide">
              Base URL
              <input
                className="input"
                value={providerForm.baseUrl}
                onChange={(event) => setProviderForm((form) => ({ ...form, baseUrl: event.target.value }))}
                placeholder="例如 https://api.openai.com/v1，官方默认可留空"
              />
            </label>
            <label>
              默认模型
              <input
                className="input"
                value={providerForm.defaultModel}
                onChange={(event) => setProviderForm((form) => ({ ...form, defaultModel: event.target.value }))}
                placeholder="例如 gpt-4.1 / moonshot-v1-8k / 自定义模型名"
              />
            </label>
            <label>
              API Key
              <input
                className="input"
                type="password"
                value={providerForm.apiKey}
                onChange={(event) => setProviderForm((form) => ({ ...form, apiKey: event.target.value }))}
                placeholder="保存在本地 SQLite，页面脱敏显示"
              />
            </label>
          </div>
          <div className="ai-form-actions">
            <button className="button button-primary" type="submit">
              保存 Provider
            </button>
            <button className="button" type="button" onClick={() => setShowProviderForm(false)}>
              取消
            </button>
          </div>
          {providerFormMessage ? <p className="text-sm leading-7 muted">{providerFormMessage}</p> : null}
        </form>
      ) : null}

      <div className="ai-settings-grid">
        <section className="panel-block">
          <div className="panel-title">Provider</div>
          <div className="ai-default-card">
            <div>
              <div className="font-bold">当前默认模型配置</div>
              <div className="text-sm muted">
                {defaultProvider
                  ? `${defaultProvider.name} / ${defaultProvider.provider} / ${defaultModelLabel}`
                  : "未绑定 Provider，会回退到最近启用的 Provider"}
              </div>
            </div>
            <label className="ai-default-menu">
              替换为
              <select
                className="input"
                value={defaultAlias?.providerId ?? ""}
                onChange={(event) => {
                  const provider = aiSettings.providers.find((item) => item.id === event.target.value);
                  const draft = aliasDrafts["默认"] ?? buildAiAliasDraft("默认", defaultAlias);
                  onUpdateAlias("默认", provider?.id ?? null, provider?.defaultModel ?? "", aliasDraftParams(draft));
                }}
              >
                <option value="">未绑定 Provider</option>
                {aiSettings.providers.map((provider) => (
                  <option key={provider.id} value={provider.id}>
                    {provider.name} / {provider.provider} / {provider.defaultModel || "未填写模型"}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="space-y-3">
            {aiSettings.providers.length ? (
              aiSettings.providers.map((provider) => {
                const usedModes = aliasModes.filter((mode) =>
                  aiSettings.aliases.some((alias) => alias.mode === mode && alias.providerId === provider.id)
                );
                return (
                  <div key={provider.id} className="ai-provider-card">
                    <div className="ai-provider-head">
                      <div>
                        <strong>{provider.name}</strong>
                        <div className="text-xs muted">
                          {provider.provider}
                          {defaultProvider?.id === provider.id ? " / 当前默认" : ""}
                        </div>
                        <div className={usedModes.length ? "ai-provider-usage" : "ai-provider-usage muted"}>
                          {usedModes.length ? `已绑定：${usedModes.join(" / ")}` : "未绑定任何用途"}
                        </div>
                      </div>
                      <div className="ai-provider-actions">
                        <button className="button" onClick={() => onTestProvider(provider.id)}>
                          测试连接
                        </button>
                        <button className="button button-danger" onClick={() => onDeleteProvider(provider)}>
                          删除
                        </button>
                        <div className="ai-bind-buttons">
                          <button className="button" onClick={() => setDefaultProvider(provider)}>
                            设为默认
                          </button>
                          <button className="button" onClick={() => bindProviderMode("创作", provider)}>
                            绑定创作
                          </button>
                          <button className="button" onClick={() => bindProviderMode("分析", provider)}>
                            绑定分析
                          </button>
                          <button className="button" onClick={() => bindProviderMode("快速", provider)}>
                            绑定快速
                          </button>
                        </div>
                        <label className="toggle-row">
                          <input
                            type="checkbox"
                            defaultChecked={Boolean(provider.enabled)}
                            onChange={(event) => onUpdateProvider(provider.id, { enabled: event.target.checked ? 1 : 0 })}
                          />
                          启用
                        </label>
                      </div>
                    </div>
                    <div className="ai-form-grid">
                    <label>
                      名称
                      <input className="input" defaultValue={provider.name} onBlur={(event) => onUpdateProvider(provider.id, { name: event.target.value })} />
                    </label>
                    <label>
                      类型
                      <select className="input" defaultValue={provider.provider} onChange={(event) => onUpdateProvider(provider.id, { provider: event.target.value })}>
                        {aiProviderTypes.map((item) => (
                          <option key={item}>{item}</option>
                        ))}
                      </select>
                    </label>
                    <label className="wide">
                      Base URL
                      <input className="input" defaultValue={provider.baseUrl} onBlur={(event) => onUpdateProvider(provider.id, { baseUrl: event.target.value })} placeholder="兼容接口或代理地址，官方服务可留空" />
                    </label>
                    <label>
                      默认模型
                      <input className="input" defaultValue={provider.defaultModel} onBlur={(event) => onUpdateProvider(provider.id, { defaultModel: event.target.value })} placeholder="例如 deepseek-chat" />
                    </label>
                    <label>
                      API Key
                      <input
                        className="input"
                        type="password"
                        placeholder={provider.hasApiKey ? provider.apiKeyPreview : "填写后保存到本地 SQLite"}
                        onBlur={(event) => {
                          if (event.target.value.trim()) {
                            onUpdateProvider(provider.id, { apiKey: event.target.value });
                            event.target.value = "";
                          }
                        }}
                      />
                    </label>
                    </div>
                  </div>
                );
              })
            ) : (
              <p className="text-sm leading-7 muted">还没有 AI Provider。点击“新建 Provider”添加 OpenAI、DeepSeek、Kimi、Claude、Gemini 或 OpenAI Compatible 接口。</p>
            )}
          </div>
        </section>

        <section className="panel-block">
          <div className="panel-title">用途绑定 / 模型参数</div>
          <div className="space-y-3">
            {aliasModes.map((mode) => {
              const alias = aiSettings.aliases.find((item) => item.mode === mode);
              const draft = aliasDrafts[mode] ?? buildAiAliasDraft(mode, alias);
              const aliasProvider = aiSettings.providers.find((provider) => provider.id === draft.providerId);
              const saveDraft = (nextDraft: AiAliasDraft) => {
                onUpdateAlias(mode, nextDraft.providerId || null, nextDraft.providerId ? nextDraft.modelName : "", aliasDraftParams(nextDraft));
              };
              return (
                <div key={mode} className="alias-row">
                  <div className="alias-row-head">
                    <div>
                      <div className="font-bold">{mode}用途</div>
                      <div className="text-xs muted">
                        {aliasProvider ? `${aliasProvider.name} / ${draft.modelName || aliasProvider.defaultModel || "未填写模型"}` : "未绑定"}
                      </div>
                    </div>
                    <button className="button" onClick={() => saveDraft(draft)}>
                      保存参数
                    </button>
                  </div>
                  <div className="alias-main-grid">
                    <label>
                      替换 Provider
                      <select
                        className="input"
                        value={draft.providerId}
                        onChange={(event) => {
                          const provider = aiSettings.providers.find((item) => item.id === event.target.value);
                          const nextDraft = { ...draft, providerId: provider?.id ?? "", modelName: provider?.defaultModel ?? "" };
                          setAliasDrafts((drafts) => ({ ...drafts, [mode]: nextDraft }));
                          saveDraft(nextDraft);
                        }}
                      >
                        <option value="">未绑定 Provider</option>
                        {aiSettings.providers.map((provider) => (
                          <option key={provider.id} value={provider.id}>
                            {provider.name} / {provider.provider}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      模型名
                      <input
                        className="input"
                        disabled={!draft.providerId}
                        value={draft.modelName}
                        onChange={(event) =>
                          setAliasDrafts((drafts) => ({
                            ...drafts,
                            [mode]: { ...draft, modelName: event.target.value },
                          }))
                        }
                        onBlur={(event) => {
                          const nextDraft = { ...draft, modelName: event.target.value };
                          setAliasDrafts((drafts) => ({ ...drafts, [mode]: nextDraft }));
                          saveDraft(nextDraft);
                        }}
                        placeholder="模型名，可覆盖 Provider 默认模型"
                      />
                    </label>
                  </div>
                  <div className="alias-param-grid">
                    <label>
                      温度
                      <input
                        className="input"
                        type="number"
                        min="0"
                        max="2"
                        step="0.01"
                        value={draft.temperature / 100}
                        onChange={(event) => {
                          const nextDraft = {
                            ...draft,
                            temperature: clampAliasInteger(event.currentTarget.valueAsNumber * 100, 0, 200, draft.temperature),
                          };
                          setAliasDrafts((drafts) => ({ ...drafts, [mode]: nextDraft }));
                        }}
                        onBlur={(event) => {
                          const nextDraft = {
                            ...draft,
                            temperature: clampAliasInteger(event.currentTarget.valueAsNumber * 100, 0, 200, draft.temperature),
                          };
                          setAliasDrafts((drafts) => ({ ...drafts, [mode]: nextDraft }));
                          saveDraft(nextDraft);
                        }}
                      />
                    </label>
                    <label>
                      创意
                      <input
                        className="input"
                        type="number"
                        min="0.01"
                        max="1"
                        step="0.01"
                        value={draft.topP / 100}
                        onChange={(event) => {
                          const nextDraft = {
                            ...draft,
                            topP: clampAliasInteger(event.currentTarget.valueAsNumber * 100, 1, 100, draft.topP),
                          };
                          setAliasDrafts((drafts) => ({ ...drafts, [mode]: nextDraft }));
                        }}
                        onBlur={(event) => {
                          const nextDraft = {
                            ...draft,
                            topP: clampAliasInteger(event.currentTarget.valueAsNumber * 100, 1, 100, draft.topP),
                          };
                          setAliasDrafts((drafts) => ({ ...drafts, [mode]: nextDraft }));
                          saveDraft(nextDraft);
                        }}
                      />
                    </label>
                    <label>
                      最大输出
                      <input
                        className="input"
                        type="number"
                        min="300"
                        max="12000"
                        step="100"
                        value={draft.maxTokens}
                        onChange={(event) => {
                          const nextDraft = {
                            ...draft,
                            maxTokens: clampAliasInteger(event.currentTarget.valueAsNumber, 300, 12000, draft.maxTokens),
                          };
                          setAliasDrafts((drafts) => ({ ...drafts, [mode]: nextDraft }));
                        }}
                        onBlur={(event) => {
                          const nextDraft = {
                            ...draft,
                            maxTokens: clampAliasInteger(event.currentTarget.valueAsNumber, 300, 12000, draft.maxTokens),
                          };
                          setAliasDrafts((drafts) => ({ ...drafts, [mode]: nextDraft }));
                          saveDraft(nextDraft);
                        }}
                      />
                    </label>
                    <label>
                      最大上下文
                      <input
                        className="input"
                        type="number"
                        min="1000"
                        max="50000"
                        step="1000"
                        value={draft.maxContextChars}
                        onChange={(event) => {
                          const nextDraft = {
                            ...draft,
                            maxContextChars: clampAliasInteger(event.currentTarget.valueAsNumber, 1000, 50000, draft.maxContextChars),
                          };
                          setAliasDrafts((drafts) => ({ ...drafts, [mode]: nextDraft }));
                        }}
                        onBlur={(event) => {
                          const nextDraft = {
                            ...draft,
                            maxContextChars: clampAliasInteger(event.currentTarget.valueAsNumber, 1000, 50000, draft.maxContextChars),
                          };
                          setAliasDrafts((drafts) => ({ ...drafts, [mode]: nextDraft }));
                          saveDraft(nextDraft);
                        }}
                      />
                    </label>
                  </div>
                </div>
              );
            })}
          </div>
          <p className="mt-3 text-sm leading-7 muted">
            在这里替换 Provider 后，会默认使用该 Provider 卡片里的“默认模型”。右侧输入框可以按用途覆盖模型名。
          </p>
        </section>

        <section className="panel-block ai-note-panel">
          <div className="panel-title">当前策略</div>
          <div className="space-y-2 text-sm leading-7 muted">
            <div className="flex items-center gap-2"><Bot size={15} /> 当前已支持 DeepSeek / OpenAI / Kimi / OpenAI Compatible 的真实请求。</div>
            <div>API Key 保存在本机 SQLite：`novel-workbench.db`。</div>
            <div>页面只显示脱敏 Key；已有 Key 不会回传到前端明文。</div>
            <div>Claude 和 Gemini 会在单独适配器完成后启用。</div>
          </div>
        </section>
      </div>
    </div>
  );
}

function ContextSummary({
  activeProjectName,
  selectedScene,
  message,
  entityCount,
  threadCount,
  libraryCount,
}: {
  activeProjectName: string;
  selectedScene: SceneNode | null;
  message: string;
  entityCount: number;
  threadCount: number;
  libraryCount: number;
}) {
  return (
    <div className="mb-5 border-y border-[var(--line)] py-4 text-sm leading-7">
      <div className="flex items-center gap-2 font-bold">
        <Library size={16} />
        当前状态
      </div>
      <div className="muted">作品：{activeProjectName}</div>
      <div className="muted">Scene：{selectedScene?.title ?? "未选择"}</div>
      <div className="muted">字数：{selectedScene?.wordCount ?? 0}</div>
      <div className="muted">世界 / 线索 / 资料：{entityCount} / {threadCount} / {libraryCount}</div>
      {message ? <div className="mt-2 text-[var(--accent)]">{message}</div> : null}
    </div>
  );
}

function ItemList<T extends { id: string; type: string; updatedAt: string } & ({ name: string } | { title: string })>({
  items,
  selectedId,
  titleKey,
  onSelect,
}: {
  items: T[];
  selectedId: string | null;
  titleKey: "name" | "title";
  onSelect: (id: string) => void;
}) {
  return (
    <aside className="item-list">
      {items.map((item) => (
        <button key={item.id} className={clsx("item-row", selectedId === item.id && "item-row-active")} onClick={() => onSelect(item.id)}>
          <span className="item-row-main">
            <span className="font-bold">{getItemTitle(item, titleKey)}</span>
            {"content" in item && typeof item.content === "string" && item.content ? (
              <span className="block text-sm leading-6 muted">{item.content.replace(/\s+/g, " ").slice(0, 72)}</span>
            ) : null}
          </span>
          <span className="muted item-row-meta">{item.type} / {formatDate(item.updatedAt)}</span>
        </button>
      ))}
      {items.length === 0 ? <p className="p-3 text-sm muted">还没有条目。</p> : null}
    </aside>
  );
}

function getItemTitle(item: { name?: string; title?: string }, titleKey: "name" | "title") {
  return titleKey === "name" ? item.name ?? "" : item.title ?? "";
}

function buildWorldStructure(entity: WorldEntity) {
  const lines = entity.content
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => line !== entity.name && line !== "项目 内容");
  const fieldLabels = worldFieldLabels(entity.type);
  const fields: Array<{ label: string; value: string }> = [];
  const sections: Array<{ title: string; body: string }> = [];
  let currentSection: { title: string; body: string[] } | null = null;

  const flushSection = () => {
    if (currentSection?.body.length) {
      sections.push({ title: currentSection.title, body: currentSection.body.join("\n") });
    }
    currentSection = null;
  };

  for (const line of lines) {
    const field = parseWorldField(line, fieldLabels);
    if (field) {
      flushSection();
      fields.push(field);
      continue;
    }

    if (isWorldSectionTitle(line)) {
      flushSection();
      currentSection = { title: line, body: [] };
      continue;
    }

    if (currentSection) {
      currentSection.body.push(line);
    } else if (sections.length < 4 && line.length > 18) {
      sections.push({ title: "补充说明", body: line });
    }
  }

  flushSection();
  return { fields: fields.slice(0, 18), sections: sections.slice(0, 8) };
}

function parseWorldField(line: string, labels: string[]) {
  const colonMatch = line.match(/^([^：:]{2,18})[：:]\s*(.+)$/);
  if (colonMatch && labels.includes(colonMatch[1].trim())) {
    return { label: colonMatch[1].trim(), value: colonMatch[2].trim() };
  }

  const spaceMatch = line.match(/^([^\s：:]{2,18})\s+(.+)$/);
  if (spaceMatch && labels.includes(spaceMatch[1].trim())) {
    return { label: spaceMatch[1].trim(), value: spaceMatch[2].trim() };
  }

  return null;
}

function isWorldSectionTitle(line: string) {
  return line.length <= 24 && !/[。；;，,]/.test(line) && /轨迹|证据|关系|规则|限制|表现|事件|设定|补充|地点|场景|能力|类型/.test(line);
}

function worldFieldLabels(type: string) {
  const common = ["定位", "身份", "作用", "目标", "动机", "关系", "限制", "补充", "来源"];
  if (type === "人物") {
    return [
      ...common,
      "年龄",
      "身高",
      "学历",
      "职业轨迹",
      "出身",
      "性格",
      "死因",
      "鬼类型",
      "核心欲望",
      "人物弧光",
    ];
  }
  if (type === "地点") {
    return [...common, "A 区", "B 区", "C 区", "内部景观河", "配套", "氛围", "关键事件"];
  }
  if (type === "规则" || type === "能力") {
    return [...common, "适用范围", "表现方式", "能力", "代价", "触发", "例外"];
  }
  return common;
}

function worldCoreLabel(type: string) {
  if (type === "人物") {
    return "核心设定";
  }
  if (type === "地点") {
    return "地点作用";
  }
  if (type === "规则" || type === "能力") {
    return "规则要点";
  }
  return "核心设定";
}

function worldCorePlaceholder(type: string) {
  if (type === "人物") {
    return "例如：角色定位、核心欲望、主要矛盾。";
  }
  if (type === "地点") {
    return "例如：地点功能、氛围、关联事件。";
  }
  if (type === "规则" || type === "能力") {
    return "例如：适用范围、表现方式、限制。";
  }
  return "写下这条设定最重要的用途。";
}

function importTargetLabel(target: ImportTarget) {
  return importTargetOptions.find((option) => option.value === target)?.label ?? "自动分流";
}

function buildSceneRelationGroups(
  sceneRelations: WorkbenchData["relations"],
  entities: WorldEntity[],
  threads: NarrativeThread[],
  libraryItems: LibraryItem[]
) {
  const entityMap = new Map(entities.map((entity) => [entity.id, entity]));
  const threadMap = new Map(threads.map((thread) => [thread.id, thread]));
  const libraryMap = new Map(libraryItems.map((item) => [item.id, item]));
  const groups = [
    { title: "出场人物", items: [] as SceneRelationDisplayItem[] },
    { title: "地点 / 场景", items: [] as SceneRelationDisplayItem[] },
    { title: "规则 / 设定", items: [] as SceneRelationDisplayItem[] },
    { title: "线索", items: [] as SceneRelationDisplayItem[] },
    { title: "参考资料", items: [] as SceneRelationDisplayItem[] },
  ];

  for (const relation of sceneRelations) {
    if (relation.targetType === "世界实体") {
      const entity = entityMap.get(relation.targetId);
      if (!entity) {
        continue;
      }
      const item = { relation, title: entity.name, meta: entity.type };
      if (entity.type === "人物") {
        groups[0].items.push(item);
      } else if (entity.type === "地点") {
        groups[1].items.push(item);
      } else {
        groups[2].items.push(item);
      }
      continue;
    }

    if (relation.targetType === "叙事线索") {
      const thread = threadMap.get(relation.targetId);
      if (thread) {
        groups[3].items.push({ relation, title: thread.title, meta: thread.type });
      }
      continue;
    }

    if (relation.targetType === "资料") {
      const item = libraryMap.get(relation.targetId);
      if (item) {
        groups[4].items.push({ relation, title: item.title, meta: item.type });
      }
    }
  }

  return groups;
}

type SceneRelationDisplayItem = {
  relation: WorkbenchData["relations"][number];
  title: string;
  meta: string;
};

function relationTargetTitle(
  relation: WorkbenchData["relations"][number],
  entities: WorldEntity[],
  threads: NarrativeThread[],
  libraryItems: LibraryItem[]
) {
  if (relation.targetType === "世界实体") {
    const entity = entities.find((item) => item.id === relation.targetId);
    return entity ? `${entity.name} / ${entity.type}` : "已删除的世界条目";
  }
  if (relation.targetType === "叙事线索") {
    const thread = threads.find((item) => item.id === relation.targetId);
    return thread ? `${thread.title} / ${thread.type}` : "已删除的线索";
  }
  if (relation.targetType === "资料") {
    const item = libraryItems.find((libraryItem) => libraryItem.id === relation.targetId);
    return item ? `${item.title} / ${item.type}` : "已删除的资料";
  }
  return relation.targetType;
}

function defaultRelationType(targetType: "世界实体" | "叙事线索" | "资料", targetId: string, entities: WorldEntity[]) {
  if (targetType === "资料") {
    return "参考资料";
  }
  if (targetType === "叙事线索") {
    return "涉及线索";
  }
  const entity = entities.find((item) => item.id === targetId);
  if (entity?.type === "人物") {
    return "出场人物";
  }
  if (entity?.type === "地点") {
    return "出现地点";
  }
  return "使用设定";
}

function groupTimelineEvents(events: WorkbenchData["timelineEvents"]) {
  const sorted = [...events].sort(compareTimelineEvents);
  return timelineTypes.map((type) => ({
    type,
    events: sorted.filter((event) => event.type === type),
  })).concat(
    sorted.some((event) => !timelineTypes.includes(event.type))
      ? [
          {
            type: "其他",
            events: sorted.filter((event) => !timelineTypes.includes(event.type)),
          },
        ]
      : []
  );
}

function compareTimelineEvents(a: WorkbenchData["timelineEvents"][number], b: WorkbenchData["timelineEvents"][number]) {
  const timeCompare = normalizeTimelineSortKey(a.eventTime).localeCompare(normalizeTimelineSortKey(b.eventTime), "zh-CN");
  if (timeCompare !== 0) {
    return timeCompare;
  }
  return a.updatedAt.localeCompare(b.updatedAt);
}

function normalizeTimelineSortKey(value: string) {
  return value.trim() || "~~~~";
}

function selectedTextTitle(text: string) {
  const compact = text.replace(/\s+/g, " ").trim();
  return compact.length > 22 ? `${compact.slice(0, 22)}…` : compact || "选中文字";
}

function buildHistoryTitle(text: string, focus: string) {
  const firstLine = text
    .split("\n")
    .map((line) => line.replace(/^#+\s*/, "").trim())
    .find(Boolean);
  const compact = firstLine ?? focus;
  return compact.length > 24 ? `${compact.slice(0, 24)}…` : compact;
}

function buildStoryQuestionPrompt(focus: string, messages: BuildMessage[]) {
  return [
    "请作为中文小说新书孵化助手，用访谈方式帮助作者把最初构想逐步聊清楚。",
    `当前侧重：${focus}`,
    "已有访谈：",
    formatBuildMessages(messages),
    "输出要求：",
    "1. 不要直接给完整大纲，也不要替作者一次性拍板。",
    "2. 先用 3-5 句话复述你抓到的有效信息。",
    "3. 判断目前最缺哪一块：主角欲望、核心冲突、反派/阻力、世界规则、爽点/恐惧点、结局方向、开篇钩子、长线伏笔。",
    "4. 只问 3-5 个最关键的问题，问题要具体，作者可以直接回答。",
    "5. 如果作者卡住，可以给 2-3 个可选方向，并说明每个方向会带来什么故事效果。",
    "6. 留意访谈中出现的伏笔、暗线、章节点子，但先只标记，不要要求作者立刻分类。",
  ].join("\n\n");
}

function buildStoryDraftPrompt(focus: string, messages: BuildMessage[]) {
  return [
    "请作为中文小说前期策划助手，根据下面访谈整理一份可执行的新书故事总纲。",
    `当前侧重：${focus}`,
    "访谈记录：",
    formatBuildMessages(messages),
    "输出结构：",
    "1. 一句话故事核心。",
    "2. 类型定位、读者期待、核心卖点。",
    "3. 主角：外在身份、核心欲望、内在缺陷、成长弧线。",
    "4. 主要人物关系：盟友、对手、暧昧/情感、隐藏关系。",
    "5. 主线冲突：外部阻力、阶段目标、失败代价。",
    "6. 世界规则或现实约束：必须具体，能约束剧情。",
    "7. 篇章骨架：按卷/篇章或三幕式列出推进。",
    "8. 开篇 Scene：场景、钩子、冲突、结尾变化。",
    "9. 线索与伏笔：建议埋设点和回收方向。",
    "10. 模块沉淀建议：哪些内容适合进入世界、线索、时间轴、资料库。",
    "11. 下一步最应该确认的 5 个问题。",
    "不要写宣传文案。不要自称 AI。不要添加访谈中完全没有依据的庞大设定；可以标注“待确认”。",
  ].join("\n\n");
}

function buildChapterOutlinePrompt(focus: string, messages: BuildMessage[], outline: string) {
  return [
    "请作为中文小说章节细纲助手，根据已有新书构建内容，生成可执行的卷、章、Scene 规划。",
    `当前侧重：${focus}`,
    outline.trim() ? "故事总纲：" : "访谈记录：",
    outline.trim() || formatBuildMessages(messages),
    "输出结构：",
    "1. 建议篇幅与结构：短篇/中篇/长篇，卷数或章节数建议。",
    "2. 卷/阶段规划：每卷目标、核心冲突、阶段结尾变化。",
    "3. 章节细纲：按章节列出章节目标、关键事件、人物变化、冲突推进、结尾钩子。",
    "4. Scene 建议：每章可拆成哪些 Scene，每个 Scene 的场景、冲突、信息增量和情绪变化。",
    "5. 伏笔与回收：标出建议埋设位置、推进位置、回收位置。",
    "6. 写作风险：节奏拖慢、信息过密、人物动机不足等需要注意的点。",
    "只基于已提供内容生成；信息不足时写“待确认”，不要硬编庞大设定。",
  ].join("\n\n");
}

function formatBuildMessages(messages: BuildMessage[]) {
  return messages.map((message) => `${message.role}：${message.content}`).join("\n\n");
}

function EmptyPanel({ text }: { text: string }) {
  return <section className="detail-panel muted">{text}</section>;
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="metric">
      <div className="metric-value">{value.toLocaleString("zh-CN")}</div>
      <div className="metric-label">{label}</div>
    </div>
  );
}
