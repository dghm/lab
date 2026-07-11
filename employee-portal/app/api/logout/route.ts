import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
import { destroySession } from "@/lib/session";

export async function POST() {
  await destroySession();
  return NextResponse.json({ ok: true });
}
