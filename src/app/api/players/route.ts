import { NextResponse } from "next/server";
import { UNITED_PLAYERS } from "@/lib/players";

// Pure in-memory squad data — only changes on redeploy, so serve it statically.
export const dynamic = "force-static";

export async function GET() {
  return NextResponse.json({
    count: UNITED_PLAYERS.length,
    players: UNITED_PLAYERS,
  });
}
