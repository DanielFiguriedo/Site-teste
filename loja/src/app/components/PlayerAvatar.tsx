import { useEffect, useState } from "react";
import { avatarUrl } from "../lib/player";
import { UserIcon } from "./Icons";
import { cn } from "../lib/cn";

/**
 * The player head.
 *
 * The avatar comes from a public third-party service that may be down or rate
 * limiting. When that happens it falls back to the generic icon instead of
 * leaving an empty square on screen, which reads as a broken store.
 */
export function PlayerAvatar({
  nick,
  size = 56,
  className,
}: {
  nick: string;
  size?: number;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);

  // Switching nick has to give the image a fresh chance to load.
  useEffect(() => setFailed(false), [nick]);

  return (
    <span
      className={cn("grid shrink-0 place-items-center overflow-hidden bg-surface-inset", className)}
      style={{ width: size, height: size }}
    >
      {failed ? (
        <span className="h-1/2 w-1/2 text-ink-faint">
          <UserIcon />
        </span>
      ) : (
        <img
          src={avatarUrl(nick, size * 2)}
          alt=""
          width={size}
          height={size}
          onError={() => setFailed(true)}
          className="h-full w-full"
          style={{ imageRendering: "pixelated" }}
        />
      )}
    </span>
  );
}
