import { NextResponse } from "next/server";
import { deleteChapter, getChapter, updateChapter } from "@/db/queries";

export const runtime = "nodejs";

type ChapterContext = {
  params: Promise<{ id: string }>;
};

export async function GET(_request: Request, context: ChapterContext) {
  const { id } = await context.params;
  const chapter = await getChapter(id);

  if (!chapter) {
    return NextResponse.json({ message: "没有找到这一章。" }, { status: 404 });
  }

  return NextResponse.json({ chapter });
}

export async function PATCH(request: Request, context: ChapterContext) {
  const { id } = await context.params;
  const body = (await request.json()) as {
    title?: string;
    summary?: string;
    storyTime?: string;
    status?: string;
    contentJson?: string;
    contentText?: string;
  };
  const chapter = await updateChapter(id, body);

  if (!chapter) {
    return NextResponse.json({ message: "没有找到这一章。" }, { status: 404 });
  }

  return NextResponse.json({ chapter });
}

export async function DELETE(_request: Request, context: ChapterContext) {
  const { id } = await context.params;
  const deleted = await deleteChapter(id);

  if (!deleted) {
    return NextResponse.json({ message: "没有找到这一章。" }, { status: 404 });
  }

  return NextResponse.json({ deleted: true });
}
