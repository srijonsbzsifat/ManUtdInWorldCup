import { cn } from "@/lib/utils";
import type { MatchStatus } from "@/types";

export function StatusPill({ status, minute, stoppage }: { status: MatchStatus; minute?: number | string | null; stoppage?: number }) {
  const { text, cls, dot } = (() => {
    switch (status) {
      case "IN_PLAY":
        return { text: typeof minute === "number" ? `${minute}${stoppage ? `+${stoppage}` : ""}'` : "LIVE", cls: "bg-red-500/15 text-red-300 border border-red-500/30", dot: true };
      case "PAUSED":
        return { text: "HT", cls: "bg-yellow-500/15 text-yellow-300 border border-yellow-500/30", dot: false };
      case "FINISHED":
        return { text: "FT", cls: "bg-white/10 text-white/70 border border-white/10", dot: false };
      case "POSTPONED":
        return { text: "PP", cls: "bg-white/10 text-white/60 border border-white/10", dot: false };
      case "CANCELED":
        return { text: "CANC", cls: "bg-white/10 text-white/60 border border-white/10", dot: false };
      default:
        return { text: "KO", cls: "bg-emerald-500/10 text-emerald-300 border border-emerald-500/20", dot: false };
    }
  })();

  return (
    <span className={cn("pill", cls)}>
      {dot && <span className="live-dot" aria-hidden="true" />}
      {text}
    </span>
  );
}
