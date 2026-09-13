import type { JSONContent } from "@tiptap/react";

export const emptyDocument: JSONContent = {
  type: "doc",
  content: [{ type: "paragraph" }],
};

export function stringifyContent(content: JSONContent) {
  return JSON.stringify(content);
}

export function parseContent(content: string | null | undefined): JSONContent {
  if (!content) {
    return emptyDocument;
  }

  try {
    return JSON.parse(content) as JSONContent;
  } catch {
    return emptyDocument;
  }
}

export function countWords(text: string) {
  const chinese = text.match(/[\u4e00-\u9fa5]/g)?.length ?? 0;
  const words = text
    .replace(/[\u4e00-\u9fa5]/g, " ")
    .split(/\s+/)
    .filter(Boolean).length;

  return chinese + words;
}
