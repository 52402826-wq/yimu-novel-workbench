"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import Placeholder from "@tiptap/extension-placeholder";
import { EditorContent, useEditor, type JSONContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { parseContent } from "@/lib/content";
import type { SceneNode } from "./types";

interface ManuscriptEditorProps {
  scene: SceneNode | null;
  fontSize: number;
  onChange: (content: JSONContent, text: string) => void;
  onSelectionAction: (action: ManuscriptSelectionAction, text: string) => void;
}

export type ManuscriptSelectionAction = "分析" | "润色" | "改写" | "入轴" | "伏笔";

export function ManuscriptEditor({ scene, fontSize, onChange, onSelectionAction }: ManuscriptEditorProps) {
  const loadingSceneId = useRef<string | null>(null);
  const [menu, setMenu] = useState<{ x: number; y: number; text: string } | null>(null);

  const editor = useEditor({
    extensions: [
      StarterKit,
      Placeholder.configure({
        placeholder: "从这里开始写正文。",
      }),
    ],
    content: scene ? parseContent(scene.contentJson) : undefined,
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
      if (loadingSceneId.current === scene?.id) {
        return;
      }
      onChange(editor.getJSON(), editor.getText());
    },
  });

  useEffect(() => {
    if (!editor || !scene) {
      return;
    }

    loadingSceneId.current = scene.id;
    editor.commands.setContent(parseContent(scene.contentJson), { emitUpdate: false });
    queueMicrotask(() => {
      loadingSceneId.current = null;
    });
  }, [editor, scene?.id, scene?.contentJson]);

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

  if (!scene) {
    return (
      <div className="flex min-h-[420px] items-center justify-center px-8 text-center muted">
        新建一本小说后，选择一个场景开始写作。
      </div>
    );
  }

  return (
    <div className="manuscript-editor-surface" style={{ "--editor-font-size": `${fontSize}px` } as CSSProperties}>
      <EditorContent editor={editor} />
      {menu ? (
        <div
          className="selection-context-menu"
          style={{ left: menu.x, top: menu.y } as CSSProperties}
          onClick={(event) => event.stopPropagation()}
        >
          {(["分析", "润色", "改写", "入轴", "伏笔"] as const).map((action) => (
            <button
              key={action}
              onClick={() => {
                onSelectionAction(action, menu.text);
                setMenu(null);
              }}
            >
              {selectionActionLabel(action)}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function selectionActionLabel(action: ManuscriptSelectionAction) {
  const labels: Record<ManuscriptSelectionAction, string> = {
    分析: "分析选中段落",
    润色: "润色建议",
    改写: "改写建议",
    入轴: "加入时间轴",
    伏笔: "标记伏笔",
  };
  return labels[action];
}
