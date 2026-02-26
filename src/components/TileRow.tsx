import Tile from "./Tile";
import type { AtlasMap, TileCode } from "../lib/tileAtlas";

type Props = {
  tiles: TileCode[];
  atlas: AtlasMap;
  scale?: number;
  compact?: boolean;
};

export default function TileRow({ tiles, atlas, scale, compact = false }: Props) {
  return (
    <div className={`tile-row ${compact ? "tile-row-compact" : ""}`.trim()}>
      {tiles.map((tile, idx) => (
        <Tile key={`${tile}-${idx}`} code={tile} atlas={atlas} scale={scale} />
      ))}
    </div>
  );
}
