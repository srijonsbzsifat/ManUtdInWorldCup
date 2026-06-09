"use client";
import { useState } from "react";
import Image from "next/image";
import type { UnitedPlayer } from "@/types";
import { cn } from "@/lib/utils";
import { NationFlag } from "./NationFlag";

interface PlayerAvatarProps {
  player: UnitedPlayer;
  size?: number;
  className?: string;
  showNationBadge?: boolean;
}

/**
 * Circular player thumbnail.
 *
 * Renders the player's photo when `player.imageUrl` is set and the network
 * request succeeds.  Falls back to the shirt number on a Man-United gradient
 * if the image is missing or fails to load.
 */
export function PlayerAvatar({
  player,
  size = 48,
  className,
  showNationBadge = true,
}: PlayerAvatarProps) {
  const [errored, setErrored] = useState(false);
  const showImage = Boolean(player.imageUrl) && !errored;
  const flagSize = Math.max(12, Math.round(size * 0.4));
  const flagOffset = Math.max(2, Math.round(size * 0.08));

  return (
    <div
      className={cn("relative flex-shrink-0", className)}
      style={{ width: size, height: size }}
    >
      <div
        className="w-full h-full rounded-full overflow-hidden bg-gradient-to-br from-united-red to-united-darkred flex items-center justify-center font-bold text-white shadow-lg"
        style={{ fontSize: size * 0.36 }}
      >
        {showImage ? (
          <Image
            src={player.imageUrl!}
            alt={player.name}
            width={size}
            height={size}
            loading="lazy"
            referrerPolicy="no-referrer"
            onError={() => setErrored(true)}
            className="w-full h-full object-cover"
          />
        ) : (
          <span>{player.shirtNumber}</span>
        )}
      </div>
      {showNationBadge && (
        <div
          className="absolute rounded-full overflow-hidden border-2 border-united-dark bg-white"
          style={{
            width: flagSize,
            height: flagSize,
            bottom: -flagOffset,
            right: -flagOffset,
          }}
          title={player.nation.name}
        >
          <NationFlag
            code={player.nation.code}
            shortName={player.nation.shortName ?? player.nation.name}
            emoji={player.nation.flag}
            size={flagSize}
            rounded
            title={player.nation.name}
          />
        </div>
      )}
    </div>
  );
}
