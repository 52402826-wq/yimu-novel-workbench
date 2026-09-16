"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import Placeholder from "@tiptap/extension-placeholder";
import { EditorContent, Mark, mergeAttributes, useEditor, type Editor, type JSONContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { parseContent } from "@/lib/content";
import type { ChapterNode } from "./types";

interface ManuscriptEditorProps {
  chapter: ChapterNode | null;
  fontSize: number;
  fontFamily: string;
  textColor: string;
  backgroundColor: string;
  annotationColors: AnnotationColors;
  formatTick: number;
  onChange: (content: JSONContent, text: string) => void;
  onSelectionAction: (action: ManuscriptSelectionAction, text: string) => void;
}

export type ManuscriptSelectionAction = "分析" | "润色" | "改写" | "续写" | "入轴" | "伏笔" | "场景";
export type AnnotationKind = "伏笔" | "时间轴" | "场景";
export type AnnotationColors = Record<AnnotationKind, string>;

const AnnotationMark = Mark.create({
  name: "annotation",

  addAttributes() {
    return {
      kind: {
        default: "场景",
        parseHTML: (element: HTMLElement) => element.getAttribute("data-annotation-kind") || "场景",
        renderHTML: (attributes: { kind?: string }) => ({ "data-annotation-kind": attributes.kind }),
      },
      color: {
        default: "#d8f3dc",
        parseHTML: (element: HTMLElement) => element.getAttribute("data-annotation-color") || element.style.backgroundColor || "#d8f3dc",
        renderHTML: (attributes: { color?: string }) => ({
          "data-annotation-color": attributes.color,
          style: `background-color: ${attributes.color};`,
        }),
      },
    };
  },

  parseHTML() {
    return [{ tag: "span[data-annotation-kind]" }];
  },

  renderHTML({ HTMLAttributes }: { HTMLAttributes: Record<string, unknown> }) {
    return ["span", mergeAttributes(HTMLAttributes, { class: "annotation-mark" }), 0];
  },
});

export function ManuscriptEditor({
  chapter,
  fontSize,
  fontFamily,
  textColor,
  backgroundColor,
  annotationColors,
  formatTick,
  onChange,
  onSelectionAction,
}: ManuscriptEditorProps) {
  const loadingChapterId = useRef<string | null>(null);
  const loadedChapterId = useRef<string | null>(null);
  const handledFormatTick = useRef(0);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [menu, setMenu] = useState<{ x: number; y: number; text: string } | null>(null);

  const editor = useEditor({
    extensions: [
      StarterKit,
      AnnotationMark,
      Placeholder.configure({
        placeholder: "从这里开始写正文。",
      }),
    ],
    content: chapter ? parseContent(chapter.contentJson) : undefined,
    immediatelyRender: false,
    editorProps: {
      attributes: {
        "aria-label": "正文编辑器",
      },
      handleDOMEvents: {
        contextmenu: (view, event) => {
          const selection = view.state.selection;
          if (!selection || selection.empty) {
            setMenu(null);
            return false;
          }

          const text = view.state.doc.textBetween(selection.from, selection.to, "\n").trim();
          if (!text) {
            setMenu(null);
            return false;
          }

          event.preventDefault();
          setMenu({ x: event.clientX, y: event.clientY, text });
          return true;
        },
      },
    },
    onUpdate({ editor }) {
      if (loadingChapterId.current === chapter?.id) {
        return;
      }
      onChange(editor.getJSON(), editor.getText());
    },
  });

  useEffect(() => {
    if (!editor || !chapter) {
      loadedChapterId.current = null;
      return;
    }
    if (loadedChapterId.current === chapter.id) {
      return;
    }

    loadingChapterId.current = chapter.id;
    loadedChapterId.current = chapter.id;
    editor.commands.setContent(parseContent(chapter.contentJson), { emitUpdate: false });
    queueMicrotask(() => {
      loadingChapterId.current = null;
    });
  }, [editor, chapter?.id]);

  useEffect(() => {
    const closeMenu = () => setMenu(null);
    window.addEventListener("click", closeMenu);
    window.addEventListener("keydown", closeMenu);
    window.addEventListener("scroll", closeMenu, true);
    return () => {
      window.removeEventListener("click", closeMenu);
      window.removeEventListener("keydown", closeMenu);
      window.removeEventListener("scroll", closeMenu, true);
    };
  }, []);

  useEffect(() => {
    if (!menu || !menuRef.current) {
      return;
    }
    const rect = menuRef.current.getBoundingClientRect();
    const next = fitMenuPosition(menu.x, menu.y, rect.width, rect.height);
    if (next.x !== menu.x || next.y !== menu.y) {
      setMenu((current) => (current ? { ...current, ...next } : current));
    }
  }, [menu]);

  useEffect(() => {
    if (!editor || !chapter || formatTick === 0 || handledFormatTick.current === formatTick) {
      return;
    }
    handledFormatTick.current = formatTick;
    const formatted = formatManuscriptText(editor.getText({ blockSeparator: "\n" }));
    if (!formatted) {
      return;
    }
    const content = textToDocument(formatted);
    editor.commands.setContent(content, { emitUpdate: false });
    onChange(content, formatted);
  }, [editor, chapter?.id, formatTick, onChange]);

  if (!chapter) {
    return (
      <div className="flex min-h-[420px] items-center justify-center px-8 text-center muted">
        新建一本小说后，选择一个章节开始写作。
      </div>
    );
  }

  return (
    <div
      className="manuscript-editor-surface"
      style={
        {
          "--editor-font-size": `${fontSize}px`,
          "--editor-font-family": fontFamily,
          "--editor-text-color": textColor,
          "--editor-bg": backgroundColor,
        } as CSSProperties
      }
    >
      <EditorContent editor={editor} />
      {menu ? (
        <div
          ref={menuRef}
          className="selection-context-menu"
          style={{ left: menu.x, top: menu.y } as CSSProperties}
          onClick={(event) => event.stopPropagation()}
        >
          {(["分析", "润色", "改写", "续写", "入轴", "伏笔", "场景"] as const).map((action) => (
            <button
              key={action}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                applyAnnotation(editor, action, annotationColors);
                onSelectionAction(action, menu.text);
                setMenu(null);
              }}
            >
              {selectionActionLabel(action)}
            </button>
          ))}
          <button
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => {
              removeAnnotation(editor);
              setMenu(null);
            }}
          >
            取消标记
          </button>
        </div>
      ) : null}
    </div>
  );
}

function applyAnnotation(
  editor: Editor | null,
  action: ManuscriptSelectionAction,
  annotationColors: AnnotationColors
) {
  if (!editor) {
    return;
  }
  const kind = annotationKindForAction(action);
  if (!kind) {
    return;
  }
  editor
    .chain()
    .focus()
    .setMark("annotation", {
      kind,
      color: annotationColors[kind],
    })
    .run();
}

function removeAnnotation(editor: Editor | null) {
  if (!editor) {
    return;
  }
  editor.chain().focus().unsetMark("annotation").run();
}

function annotationKindForAction(action: ManuscriptSelectionAction): AnnotationKind | null {
  if (action === "伏笔") {
    return "伏笔";
  }
  if (action === "入轴") {
    return "时间轴";
  }
  if (action === "场景") {
    return "场景";
  }
  return null;
}

function fitMenuPosition(x: number, y: number, width: number, height: number) {
  const padding = 10;
  return {
    x: Math.max(padding, Math.min(x, window.innerWidth - width - padding)),
    y: Math.max(padding, Math.min(y, window.innerHeight - height - padding)),
  };
}

function formatManuscriptText(text: string) {
  return text
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => `　　${line.replace(/^(　　|\s{2,})+/, "")}`)
    .join("\n\n");
}

function textToDocument(text: string): JSONContent {
  return {
    type: "doc",
    content: text.split(/\n{2,}/).map((paragraph) => ({
      type: "paragraph",
      content: paragraph
        ? [
            {
              type: "text",
              text: paragraph,
            },
          ]
        : undefined,
    })),
  };
}

function selectionActionLabel(action: ManuscriptSelectionAction) {
  const labels: Record<ManuscriptSelectionAction, string> = {
    分析: "分析选中段落",
    润色: "润色建议",
    改写: "改写建议",
    续写: "续写建议",
    入轴: "加入时间轴",
    伏笔: "标记伏笔",
    场景: "划分场景",
  };
  return labels[action];
}
