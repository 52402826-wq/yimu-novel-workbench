import { NextResponse } from "next/server";
import { deleteChapter } from "@/db/queries";

export const runtime = "nodejs";

type ChapterContext = {
  params: Promise<{ id: string }>;
};

export async function DELETE(_request: Request, context: ChapterContext) {
  const { id } = await context.params;
  const deleted = await deleteChapter(id);

  if (!deleted) {
    return NextResponse.json({ message: "没有找到这一章。" }, { status: 404 });
  }

  return NextResponse.json({ deleted: true });
}
