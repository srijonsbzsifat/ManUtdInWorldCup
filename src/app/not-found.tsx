import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="text-7xl mb-4">⚽</div>
      <h1 className="text-3xl font-extrabold mb-2">Page not found</h1>
      <p className="text-sm text-white/50 max-w-sm mb-6">
        We couldn&apos;t find that page. Maybe the match hasn&apos;t started
        yet, or the link is broken.
      </p>
      <Link
        href="/"
        className="px-4 py-2 rounded-lg bg-united-red text-white text-sm font-semibold hover:bg-united-darkred"
      >
        Back to dashboard
      </Link>
    </div>
  );
}
