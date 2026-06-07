import { NextResponse } from "next/server";
import { fetchNewsForAllPlayers } from "@/lib/news";

export const revalidate = 120;

export async function GET() {
  try {
    const news = await fetchNewsForAllPlayers();
    return NextResponse.json({ news });
  } catch (err) {
    console.error("news fetch failed", err);
    return NextResponse.json(
      { error: "Failed to fetch news", detail: String(err) },
      { status: 500 }
    );
  }
}
