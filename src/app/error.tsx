"use client";
import { useEffect } from "react";
import Link from "next/link";

export default function Error({
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
      <div className="text-4xl mb-4" aria-hidden>⚠</div>
      <p className="text-base font-semibold mb-1">Something went wrong</p>
      <p className="text-sm text-white/50 mb-4">
        The page could not be loaded. This is usually a temporary problem.
      </p>
      <div className="flex justify-center gap-3">
        <button
          onClick={reset}
          className="px-4 py-2 rounded-lg bg-united-red text-white text-sm font-semibold"
        >
          Try again
        </button>
        <Link
          href="/"
          className="px-4 py-2 rounded-lg bg-white/10 text-white text-sm font-semibold"
        >
          Go home
        </Link>
      </div>
    </div>
  );
}
