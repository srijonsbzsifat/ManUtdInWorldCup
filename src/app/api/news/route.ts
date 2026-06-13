import { NextResponse } from "next/server";
import { fetchNewsForAllPlayers } from "@/lib/news";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const news = await fetchNewsForAllPlayers();
    return NextResponse.json(
      { news },
      { headers: { "Cache-Control": "s-maxage=120, stale-while-revalidate=120" } }
    );
  } catch (err) {
    console.error("news fetch failed", err);
    return NextResponse.json(
      { error: "Failed to fetch news" },
      { status: 500 }
    );
  }
}
