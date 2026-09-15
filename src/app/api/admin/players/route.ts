// GET /api/admin/players?q=&page=: the roster the console works from.
import { NextRequest, NextResponse } from "next/server";
import { requireStaff } from "@/lib/admin/guard";
import { listPlayers } from "@/lib/admin/actions";

export async function GET(req: NextRequest) {
  const user = await requireStaff();
  if (user instanceof NextResponse) return user;
  const params = req.nextUrl.searchParams;
  const page = Number(params.get("page") ?? "1");
  const result = await listPlayers({
    query: params.get("q") ?? "",
    page: Number.isFinite(page) ? page : 1,
  });
  return NextResponse.json(result);
}
