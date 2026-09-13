import { NextResponse } from "next/server";
import { deleteLibraryItem, updateLibraryItem } from "@/db/queries";

export const runtime = "nodejs";

type LibraryContext = {
  params: Promise<{ id: string }>;
};

export async function PATCH(request: Request, context: LibraryContext) {
  const { id } = await context.params;
  const item = await updateLibraryItem(id, await request.json());

  if (!item) {
    return NextResponse.json({ message: "没有找到这条资料。" }, { status: 404 });
  }

  return NextResponse.json({ item });
}

export async function DELETE(_request: Request, context: LibraryContext) {
  const { id } = await context.params;
  const deleted = await deleteLibraryItem(id);

  if (!deleted) {
    return NextResponse.json({ message: "没有找到这条资料。" }, { status: 404 });
  }

  return NextResponse.json({ deleted: true });
}
