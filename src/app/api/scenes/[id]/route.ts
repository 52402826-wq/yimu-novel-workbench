import { NextResponse } from "next/server";
import { deleteScene, getScene, updateScene } from "@/db/queries";

export const runtime = "nodejs";

type SceneContext = {
  params: Promise<{ id: string }>;
};

export async function GET(_request: Request, context: SceneContext) {
  const { id } = await context.params;
  const scene = await getScene(id);

  if (!scene) {
    return NextResponse.json({ message: "没有找到这个场景。" }, { status: 404 });
  }

  return NextResponse.json({ scene });
}

export async function PATCH(request: Request, context: SceneContext) {
  const { id } = await context.params;
  const body = (await request.json()) as {
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
  };
  const scene = await updateScene(id, body);

  if (!scene) {
    return NextResponse.json({ message: "没有找到这个场景。" }, { status: 404 });
  }

  return NextResponse.json({ scene });
}

export async function DELETE(_request: Request, context: SceneContext) {
  const { id } = await context.params;
  const deleted = await deleteScene(id);

  if (!deleted) {
    return NextResponse.json({ message: "没有找到这个场景。" }, { status: 404 });
  }

  return NextResponse.json({ deleted: true });
}
