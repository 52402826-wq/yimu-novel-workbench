import { NextResponse } from "next/server";
import {
  deleteLibraryItemsBySources,
  deleteNarrativeThreadsBySourceTags,
  deleteWorldEntitiesBySourceTags,
  importLibraryItems,
  importNarrativeThreads,
  importWorldEntities,
} from "@/db/queries";
import { normalizeMarkdownForLibrary, readDocumentFiles, splitDocumentIntoSegments } from "@/features/import/documents";
import type { DocumentFileContent, DocumentImportSegment } from "@/features/import/documents";

export const runtime = "nodejs";

type ImportTarget = "auto" | "world" | "thread" | "library" | "skip";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      projectId?: string;
      sourcePath?: string;
      splitByHeadings?: boolean;
      files?: Array<{ path: string; type?: string; title?: string; tags?: string[]; target?: ImportTarget }>;
    };

    if (!body.projectId || !body.sourcePath?.trim() || !body.files?.length) {
      return NextResponse.json({ message: "请选择小说项目、文档路径和要导入的文件。" }, { status: 400 });
    }

    const filePaths = body.files.map((file) => file.path);
    const contents = await readDocumentFiles(body.sourcePath, filePaths);
    const overrides = new Map(body.files.map((file) => [file.path, file]));
    const segments: Array<DocumentFileContent | DocumentImportSegment> =
      body.splitByHeadings === false ? contents : contents.flatMap((file) => splitDocumentIntoSegments(file));
    const removedWholeDocuments =
      body.splitByHeadings === false
        ? 0
        : await deleteLibraryItemsBySources(
            body.projectId,
            contents.map((file) => file.path)
          );
    const normalizedItems = segments.map((file) => {
      const isSegment = "sourcePath" in file && file.sourcePath !== file.path;
      const override = overrides.get("sourcePath" in file ? file.sourcePath : file.path) ?? overrides.get(file.path);
      const type = isSegment ? file.typeGuess || override?.type?.trim() || "资料" : override?.type?.trim() || file.typeGuess || "资料";
      const target = resolveImportTarget(override?.target, type);
      const title = cleanImportTitle(file.title);
      const content = normalizeMarkdownForLibrary(file.content);
      const sourceTag = sourceTagFor(file.path);
      const tags = ["文档导入", ...(override?.tags?.length ? override.tags : file.tags)];
      return { file, type, target, title, content, sourceTag, tags };
    });

    const worldItems = normalizedItems.filter((item) => item.target === "world");
    const threadItems = normalizedItems.filter((item) => item.target === "thread");
    const libraryItems = normalizedItems.filter((item) => item.target === "library");
    const skipped = normalizedItems.filter((item) => item.target === "skip").length;

    await Promise.all([
      deleteLibraryItemsBySources(
        body.projectId,
        normalizedItems.filter((item) => item.target !== "library").map((item) => item.file.path)
      ),
      deleteWorldEntitiesBySourceTags(
        body.projectId,
        normalizedItems.filter((item) => item.target !== "world").map((item) => item.sourceTag)
      ),
      deleteNarrativeThreadsBySourceTags(
        body.projectId,
        normalizedItems.filter((item) => item.target !== "thread").map((item) => item.sourceTag)
      ),
    ]);

    const [worldResult, threadResult, libraryResult] = await Promise.all([
      importWorldEntities(
        body.projectId,
        worldItems.map((item) => ({
          type: item.type,
          name: item.title,
          summary: buildWorldCoreSetting(item.type, item.content),
          content: item.content,
          tags: item.tags.join(", "),
          sourceTag: item.sourceTag,
        }))
      ),
      importNarrativeThreads(
        body.projectId,
        threadItems.map((item) => ({
          type: item.type,
          title: item.title,
          summary: item.content,
          sourceTag: item.sourceTag,
        }))
      ),
      importLibraryItems(
        body.projectId,
        libraryItems.map((item) => ({
          type: item.type,
          title: item.title,
          content: item.content,
          source: item.file.path,
          tags: item.tags.join(", "),
        }))
      ),
    ]);

    return NextResponse.json({
      created: worldResult.created + threadResult.created + libraryResult.created,
      updated: worldResult.updated + threadResult.updated + libraryResult.updated,
      skipped,
      removedWholeDocuments,
      world: worldResult,
      threads: threadResult,
      library: libraryResult,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "导入文档失败。";
    return NextResponse.json({ message }, { status: 500 });
  }
}

function resolveImportTarget(target: ImportTarget | undefined, type: string): Exclude<ImportTarget, "auto"> {
  if (target && target !== "auto") {
    return target;
  }
  if (["人物", "地点", "势力", "组织", "规则", "能力", "物品", "事件", "术语"].includes(type)) {
    return "world";
  }
  if (["伏笔", "悬念", "秘密", "线索", "任务", "感情线", "冲突线"].includes(type)) {
    return "thread";
  }
  return "library";
}

function cleanImportTitle(title: string) {
  return title
    .replace(/^\s*\d+(?:\.\d+)*\s*/, "")
    .replace(/^\s*[一二三四五六七八九十]+[、.]\s*/, "")
    .trim();
}

function sourceTagFor(source: string) {
  return `导入来源:${source}`;
}

function buildWorldCoreSetting(type: string, content: string) {
  const lines = content
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => line !== "项目 内容");
  const preferredLabels =
    type === "人物"
      ? ["身份", "性格", "核心欲望", "死因", "鬼类型", "职业轨迹"]
      : type === "地点"
        ? ["定位", "配套", "补充", "关键事件", "氛围"]
        : type === "规则" || type === "能力"
          ? ["适用范围", "表现方式", "限制", "能力", "规则"]
          : ["定位", "作用", "目标", "补充"];
  const picked: string[] = [];

  for (const label of preferredLabels) {
    const match = lines.find((line) => line.startsWith(`${label} `) || line.startsWith(`${label}：`) || line.startsWith(`${label}:`));
    if (match) {
      picked.push(match);
    }
    if (picked.length >= 3) {
      break;
    }
  }

  if (picked.length) {
    return picked.join("\n");
  }

  return lines.slice(1, 4).join("\n").slice(0, 280);
}
