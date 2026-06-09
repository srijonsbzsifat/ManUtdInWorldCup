"use client";

import { useEffect } from "react";
import Link from "next/link";

export default function MatchDetailError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="glass p-8 text-center">
      <p className="text-base font-semibold mb-1">This match could not be loaded.</p>
      <p className="text-sm text-white/50 mb-4">
        Try refreshing. The data feed may only be unavailable temporarily.
      </p>
      <div className="flex justify-center gap-3">
        <button
          type="button"
          onClick={reset}
          className="px-4 py-2 rounded-lg bg-united-red text-white text-sm font-semibold"
        >
          Try again
        </button>
        <Link
          href="/matches"
          className="px-4 py-2 rounded-lg bg-white/10 text-white text-sm font-semibold"
        >
          All matches
        </Link>
      </div>
    </div>
  );
}
