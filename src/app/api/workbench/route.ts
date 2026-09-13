import { NextResponse } from "next/server";
import { getWorkbenchData } from "@/db/queries";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const projectId = url.searchParams.get("projectId") ?? undefined;
  const data = await getWorkbenchData(projectId);

  return NextResponse.json(data);
}
