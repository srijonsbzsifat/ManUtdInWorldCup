"use client";
import { useState } from "react";
import Image from "next/image";
import { cn } from "@/lib/utils";
import { flagFallbackLabel, figmaFlagSlug } from "@/lib/flags";

interface NationFlagProps {
  /** 3-letter FIFA code, used to build the flagcdn.com URL. */
  code: string;
  /** Team short name, used as a fallback label. */
  shortName?: string;
  /** Unicode flag emoji (used as a fallback if the image fails to load). */
  emoji?: string;
  size?: number;
  className?: string;
  /** When true, the flag is rendered as a circular badge (good for avatars). */
  rounded?: boolean;
  title?: string;
}

/**
 * Country flag renderer that prefers a real PNG (from flagcdn.com) and falls
 * back to the unicode emoji if the image fails to load, then to a 3-letter
 * text label as a last resort.  Using a real image means the flag is always
 * visible regardless of the user's emoji font support.
 */
export function NationFlag({
  code,
  shortName,
  emoji,
  size = 24,
  className,
  rounded = false,
  title,
}: NationFlagProps) {
  const slug = figmaFlagSlug(code);
  const url = slug ? `https://flagcdn.com/w80/${slug}.png` : null;
  const [imgFailed, setImgFailed] = useState(false);

  // If we don't have a slug AND no emoji, show a 3-letter text label so
  // the UI never has a "blank" flag slot.
  if (!url) {
    return (
      <span
        className={cn(
          "inline-flex items-center justify-center text-[10px] font-bold bg-white/10 border border-white/20",
          rounded ? "rounded-full" : "rounded-sm",
          className
        )}
        style={{ width: size, height: Math.round(size * 0.66), color: "#fff" }}
        title={title ?? shortName ?? code}
      >
        {flagFallbackLabel(shortName, code)}
      </span>
    );
  }

  if (imgFailed && emoji) {
    return (
      <span
        className={cn("inline-flex items-center justify-center leading-none", className)}
        style={{ fontSize: size, width: size, height: size }}
        title={title ?? shortName ?? code}
      >
        {emoji}
      </span>
    );
  }

  return (
    <Image
      src={url}
      alt={title ?? `${code} flag`}
      width={size}
      height={Math.round(size * 0.66)}
      loading="lazy"
      onError={() => setImgFailed(true)}
      className={cn(
        "inline-block object-cover flex-shrink-0 bg-white",
        rounded ? "rounded-full" : "rounded-sm",
        className
      )}
      style={{ width: size, height: Math.round(size * 0.66) }}
      title={title ?? shortName ?? code}
    />
  );
}
