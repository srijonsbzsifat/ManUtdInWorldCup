import { NextResponse } from "next/server";
import { UNITED_PLAYERS } from "@/lib/players";

export const revalidate = 3600;

export async function GET() {
  return NextResponse.json({
    count: UNITED_PLAYERS.length,
    players: UNITED_PLAYERS,
  });
}
