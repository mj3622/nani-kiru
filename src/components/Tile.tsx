import { memo } from "react";
import type { AtlasMap, TileCode } from "../lib/tileAtlas";

const BASE = (import.meta.env.BASE_URL ?? "/").replace(/\/?$/, "/");

type Props = {
  code: TileCode;
  atlas: AtlasMap;
  scale?: number;
};

function Tile({ code, atlas, scale = 0.7 }: Props) {
  const rect = atlas.tiles[code];
  if (!rect) {
    return <div className="tile-missing">?</div>;
  }
  const source = rect.source ?? atlas.meta.image;
  const usingAtlas = !rect.source;
  const bgPosition = usingAtlas
    ? `${-rect.x * scale}px ${-rect.y * scale}px`
    : "0 0";
  const bgSize = usingAtlas
    ? `${atlas.meta.atlas_width * scale}px ${atlas.meta.atlas_height * scale}px`
    : `${rect.w * scale}px ${rect.h * scale}px`;

  return (
    <div
      className="tile"
      style={{
        width: `${rect.w * scale}px`,
        height: `${rect.h * scale}px`,
        backgroundImage: `url('${BASE}assets/tiles/${source}')`,
        backgroundPosition: bgPosition,
        backgroundSize: bgSize
      }}
      aria-label={code}
      title={code}
    />
  );
}

export default memo(Tile);
