import { NextResponse } from "next/server";
import { fetchAllFixtures, fetchMatchDetails } from "@/lib/espn";

export const revalidate = 15;

export async function GET(
  _req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const MAX_DATE = new Date("2026-07-30T23:59:59Z");

    const today = new Date();
    const start = new Date(today);
    start.setDate(start.getDate() - 30);
    const end = new Date(today);
    end.setDate(end.getDate() + 30);
    const endCapped = end > MAX_DATE ? MAX_DATE : end;

    const fixtures = await fetchAllFixtures({ dateRange: { start, end: endCapped } });
    const found = fixtures.find((m) => m.id === params.id);
    if (!found) {
      return NextResponse.json({ error: "Match not found" }, { status: 404 });
    }
    const detailed = await fetchMatchDetails(found);
    return NextResponse.json({ match: detailed });
  } catch (err) {
    console.error("match detail failed", err);
    return NextResponse.json(
      { error: "Failed to load match", detail: String(err) },
      { status: 500 }
    );
  }
}
