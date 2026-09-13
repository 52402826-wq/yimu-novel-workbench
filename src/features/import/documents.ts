import { readdir, readFile, stat } from "node:fs/promises";
import { basename, dirname, extname, join, relative, resolve, sep } from "node:path";

export interface DocumentScanItem {
  path: string;
  relativePath: string;
  title: string;
  typeGuess: string;
  tags: string[];
  links: string[];
  excerpt: string;
  size: number;
  modifiedAt: string;
}

export interface DocumentFileContent extends DocumentScanItem {
  content: string;
}

export interface DocumentImportSegment {
  path: string;
  sourcePath: string;
  relativePath: string;
  title: string;
  typeGuess: string;
  tags: string[];
  links: string[];
  excerpt: string;
  content: string;
}

type DocumentSource = { kind: "file"; root: string; filePath: string } | { kind: "folder"; root: string };

const ignoredDirNames = new Set([".obsidian", ".git", "node_modules", ".trash", ".DS_Store"]);
const forbiddenRoots = ["/etc", "/System", "/Library", "/boot", "/sys", "/proc"];
const forbiddenHomeDirs = [".ssh", ".gnupg"];
const maxScanFiles = 500;
const maxImportFileBytes = 900_000;

export async function scanDocumentSource(inputPath: string): Promise<DocumentScanItem[]> {
  const source = await safeDocumentSource(inputPath);
  const files: string[] = [];

  if (source.kind === "file") {
    files.push(source.filePath);
  } else {
    await walkMarkdownFiles(source.root, files);
  }

  const items = await Promise.all(
    files.slice(0, maxScanFiles).map(async (filePath) => {
      const fileStat = await stat(filePath);
      const content = await readMarkdownPreview(filePath);
      const parsed = parseMarkdown(content, filePath, source.root);
      return {
        ...parsed,
        size: fileStat.size,
        modifiedAt: fileStat.mtime.toISOString(),
      };
    })
  );

  return items.sort((a, b) => a.relativePath.localeCompare(b.relativePath, "zh-CN"));
}

export async function readDocumentFiles(sourcePath: string, filePaths: string[]): Promise<DocumentFileContent[]> {
  const source = await safeDocumentSource(sourcePath);
  const normalizedPaths = filePaths.map((filePath) => {
    const resolved = resolve(cleanInputPath(filePath));
    if (extname(resolved).toLowerCase() !== ".md") {
      throw new Error("当前版本只支持导入 Markdown 文件。");
    }
    if (source.kind === "file" && resolved !== source.filePath) {
      throw new Error("单文档导入只能导入当前指定的文件。");
    }
    if (source.kind === "folder" && !isInside(source.root, resolved)) {
      throw new Error("只能导入所选文件夹里的 Markdown 文件。");
    }
    return resolved;
  });

  const files = await Promise.all(
    normalizedPaths.map(async (filePath) => {
      const fileStat = await stat(filePath);
      if (fileStat.size > maxImportFileBytes) {
        throw new Error(`文件过大，已跳过：${basename(filePath)}`);
      }
      const content = await readFile(filePath, "utf8");
      const parsed = parseMarkdown(content, filePath, source.root);
      return {
        ...parsed,
        content,
        size: fileStat.size,
        modifiedAt: fileStat.mtime.toISOString(),
      };
    })
  );

  return files;
}

export function splitDocumentIntoSegments(file: DocumentFileContent): DocumentImportSegment[] {
  const { frontmatter, body } = splitFrontmatter(file.content);
  const inheritedTags = unique([...file.tags, ...getFrontmatterTags(frontmatter)]);
  const sections = splitMarkdownSections(body);

  if (sections.length <= 1) {
    return [documentFileToSegment(file, file.title, body || file.content, inheritedTags)];
  }

  const usableSections = sections.filter((section) => section.content.replace(/^#+\s+/gm, "").trim().length >= 40);
  if (usableSections.length <= 1) {
    return [documentFileToSegment(file, file.title, body || file.content, inheritedTags)];
  }

  return usableSections.map((section) => {
    const title = section.title || file.title;
    const content = section.content.trim();
    const tags = unique([...inheritedTags, ...extractTags(content)]);
    const plainText = markdownToPlainText(content);
    return {
      path: `${file.path}#${slugAnchor(title)}`,
      sourcePath: file.path,
      relativePath: `${file.relativePath}#${title}`,
      title,
      typeGuess: guessType({ title, relativePath: file.relativePath, tags, text: plainText }),
      tags,
      links: unique([...file.links, ...extractLinks(content)]),
      excerpt: plainText.slice(0, 220),
      content: plainText,
    };
  });
}

export function normalizeMarkdownForLibrary(content: string) {
  const { body } = splitFrontmatter(content);
  return markdownToPlainText(body || content);
}

async function safeDocumentSource(inputPath: string): Promise<DocumentSource> {
  const target = resolve(cleanInputPath(inputPath));
  if (!target || target === sep) {
    throw new Error("请选择具体的 Markdown 文件或文件夹。");
  }
  if (forbiddenRoots.some((forbidden) => target === forbidden || target.startsWith(`${forbidden}${sep}`))) {
    throw new Error("为了安全，不能扫描系统目录。请选择你的资料文件或资料文件夹。");
  }
  if (forbiddenHomeDirs.some((dir) => target.includes(`${sep}${dir}`))) {
    throw new Error("为了安全，不能扫描密钥或隐私目录。请选择你的资料文件或资料文件夹。");
  }

  const targetStat = await stat(target);
  if (targetStat.isFile()) {
    if (extname(target).toLowerCase() !== ".md") {
      throw new Error("当前版本只支持导入 Markdown 文件。");
    }
    return { kind: "file", root: dirname(target), filePath: target };
  }
  if (targetStat.isDirectory()) {
    return { kind: "folder", root: target };
  }

  throw new Error("请选择 Markdown 文件或文件夹。");
}

function cleanInputPath(inputPath: string) {
  let path = inputPath.trim();
  while (
    path.length >= 2 &&
    ((path.startsWith("'") && path.endsWith("'")) || (path.startsWith("\"") && path.endsWith("\"")))
  ) {
    path = path.slice(1, -1).trim();
  }
  return path;
}

async function walkMarkdownFiles(dirPath: string, files: string[]) {
  if (files.length >= maxScanFiles) {
    return;
  }

  const entries = await readdir(dirPath, { withFileTypes: true });
  for (const entry of entries) {
    if (files.length >= maxScanFiles) {
      return;
    }
    if (entry.name.startsWith(".") || ignoredDirNames.has(entry.name)) {
      continue;
    }
    const fullPath = join(dirPath, entry.name);
    if (entry.isDirectory()) {
      await walkMarkdownFiles(fullPath, files);
      continue;
    }
    if (entry.isFile() && extname(entry.name).toLowerCase() === ".md") {
      files.push(fullPath);
    }
  }
}

async function readMarkdownPreview(filePath: string) {
  const fileStat = await stat(filePath);
  if (fileStat.size > maxImportFileBytes) {
    return `${basename(filePath)}\n\n文件较大，扫描阶段只记录文件信息。`;
  }
  return readFile(filePath, "utf8");
}

function parseMarkdown(content: string, filePath: string, root: string) {
  const relativePath = relative(root, filePath) || basename(filePath);
  const { frontmatter, body } = splitFrontmatter(content);
  const frontmatterTitle = getFrontmatterValue(frontmatter, "title");
  const headingTitle = body.match(/^#\s+(.+)$/m)?.[1]?.trim();
  const title = frontmatterTitle || headingTitle || basename(filePath, ".md");
  const tags = unique([...getFrontmatterTags(frontmatter), ...extractTags(body)]);
  const links = extractLinks(body);
  const plainText = markdownToPlainText(body);

  return {
    path: filePath,
    relativePath,
    title,
    typeGuess: guessType({ title, relativePath, tags, text: plainText }),
    tags,
    links,
    excerpt: plainText.slice(0, 220),
  };
}

function documentFileToSegment(file: DocumentFileContent, title: string, content: string, tags: string[]): DocumentImportSegment {
  const plainText = markdownToPlainText(content);
  return {
    path: file.path,
    sourcePath: file.path,
    relativePath: file.relativePath,
    title,
    typeGuess: guessType({ title, relativePath: file.relativePath, tags, text: plainText }),
    tags,
    links: extractLinks(content),
    excerpt: plainText.slice(0, 220),
    content: plainText || normalizeMarkdownForLibrary(file.content),
  };
}

function splitMarkdownSections(body: string) {
  const headingMatches = [...body.matchAll(/^(#{1,3})\s+(.+)$/gm)];
  if (!headingMatches.length) {
    return [{ title: "", content: body }];
  }

  return headingMatches.map((match, index) => {
    const start = match.index ?? 0;
    const end = headingMatches[index + 1]?.index ?? body.length;
    return {
      level: match[1].length,
      title: match[2].trim(),
      content: body.slice(start, end).trim(),
    };
  });
}

function markdownToPlainText(text: string) {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/```([\s\S]*?)```/g, "$1")
    .replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_match, target: string, alias?: string) => alias || target)
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/gm, "")
    .replace(/^\s*[-*_]{3,}\s*$/gm, "")
    .replace(/^\s*>\s?/gm, "")
    .replace(/^\s*[-*+]\s+/gm, "")
    .replace(/^\s*\d+\.\s+/gm, "")
    .replace(/\|/g, "  ")
    .replace(/[*_`~#]/g, "")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function extractLinks(text: string) {
  return unique([...text.matchAll(/\[\[([^\]]+)\]\]/g)].map((match) => match[1].split("|")[0].trim()).filter(Boolean));
}

function slugAnchor(title: string) {
  return encodeURIComponent(title.trim().replace(/\s+/g, "-")).slice(0, 100);
}

function splitFrontmatter(content: string) {
  if (!content.startsWith("---")) {
    return { frontmatter: "", body: content };
  }
  const endIndex = content.indexOf("\n---", 3);
  if (endIndex === -1) {
    return { frontmatter: "", body: content };
  }
  return {
    frontmatter: content.slice(3, endIndex).trim(),
    body: content.slice(endIndex + 4).trim(),
  };
}

function getFrontmatterValue(frontmatter: string, key: string) {
  const match = frontmatter.match(new RegExp(`^${key}:\\s*(.+)$`, "m"));
  return match?.[1]?.replace(/^['"]|['"]$/g, "").trim() ?? "";
}

function getFrontmatterTags(frontmatter: string) {
  const lines = frontmatter.split(/\r?\n/);
  const tags: string[] = [];

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const match = line.match(/^tags:\s*(.*)$/);
    if (!match) {
      continue;
    }

    const inline = match[1].trim();
    if (inline && inline !== "-") {
      tags.push(...splitTagText(inline));
    }

    for (let nextIndex = index + 1; nextIndex < lines.length; nextIndex += 1) {
      const nextLine = lines[nextIndex];
      if (/^\S/.test(nextLine)) {
        break;
      }
      const listItem = nextLine.match(/^\s*-\s*(.+)$/);
      if (listItem?.[1]) {
        tags.push(...splitTagText(listItem[1]));
      }
    }
    break;
  }

  return unique(tags);
}

function splitTagText(text: string) {
  return text
    .replace(/^\[|\]$/g, "")
    .split(/[,，\s]+/)
    .map((tag) => tag.replace(/^#/, "").trim())
    .filter((tag) => tag && tag !== "-");
}

function extractTags(text: string) {
  return [...text.matchAll(/(^|\s)#([\p{L}\p{N}_/-]+)/gu)].map((match) => match[2]).filter(Boolean);
}

function guessType(input: { title: string; relativePath: string; tags: string[]; text: string }) {
  const title = input.title.toLowerCase();
  const titleRules: Array<[string, RegExp]> = [
    ["规则", /写作守则|鬼的类型|鬼的能力|鬼的规则|能力|规则/],
    ["资料", /基本信息/],
    ["大纲", /故事简介|前史|历年|正文章节|主题|大纲/],
    ["人物", /人物|男主|女主|女鬼|凶手|刑警|同事|介绍人|沈遇|林艳艳|王健|刘宪国|小周|刘庄伟/],
    ["地点", /地点|场景|小区|车库|枫华庭/],
  ];
  const titleMatch = titleRules.find(([, pattern]) => pattern.test(title));
  if (titleMatch) {
    return titleMatch[0];
  }

  const haystack = [input.title, input.relativePath, ...input.tags, input.text.slice(0, 500)].join(" ").toLowerCase();
  const rules: Array<[string, RegExp]> = [
    ["人物", /人物|角色|主角|男主|女主|配角|反派|凶手|刑警|同事|姓名|年龄|身高|学历|沈遇|林艳艳|王健|刘宪国|小周|刘庄伟|character/],
    ["地点", /地点|场景|小区|车库|城市|国家|地理|地图|scene|location/],
    ["势力", /势力|组织|家族|门派|公司|帝国|阵营/],
    ["规则", /写作守则|鬼的类型|鬼的能力|鬼的规则|能力|体系|规则|法则|设定|魔法|异能|术法|skill|power/],
    ["伏笔", /伏笔|悬念|秘密|线索|谜团/],
    ["大纲", /大纲|主线|剧情|章节|卷纲|章纲|故事简介|前史|历年|主题|outline|plot/],
  ];
  return rules.find(([, pattern]) => pattern.test(haystack))?.[0] ?? "资料";
}

function unique(values: string[]) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))].slice(0, 24);
}

function isInside(root: string, filePath: string) {
  const rel = relative(root, filePath);
  return Boolean(rel) && !rel.startsWith("..") && !rel.startsWith(sep);
}
