import { cn, ratingColor, ratingLabel } from "@/lib/utils";

export function RatingBadge({
  rating,
  size = "md",
  showLabel = false,
}: {
  rating: number | null | undefined;
  size?: "sm" | "md" | "lg";
  showLabel?: boolean;
}) {
  const sizeClass =
    size === "lg" ? "w-14 h-14 text-lg" : size === "sm" ? "w-8 h-8 text-xs" : "w-11 h-11 text-sm";
  return (
    <div className="flex flex-col items-center gap-1">
      <div
        className={cn(
          "rounded-full flex items-center justify-center font-bold tabular-nums shadow-md",
          sizeClass,
          ratingColor(rating)
        )}
        title={ratingLabel(rating)}
      >
        {rating === null || rating === undefined ? "—" : rating.toFixed(1)}
      </div>
      {showLabel && (
        <div className="text-[10px] uppercase tracking-wider text-white/50">
          {ratingLabel(rating)}
        </div>
      )}
    </div>
  );
}
