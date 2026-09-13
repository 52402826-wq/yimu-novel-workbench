import { NextResponse } from "next/server";
import { searchAll } from "@/db/queries";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const query = url.searchParams.get("q") ?? "";
  const projectId = url.searchParams.get("projectId") ?? undefined;
  const results = await searchAll(query, projectId);

  return NextResponse.json({ results });
}
