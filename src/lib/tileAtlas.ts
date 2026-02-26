export type TileCode =
  | `${0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9}${"m" | "p" | "s"}`
  | "east"
  | "south"
  | "west"
  | "north"
  | "white"
  | "green"
  | "red"
  | "back";

export type AtlasTileRect = {
  x: number;
  y: number;
  w: number;
  h: number;
  source?: string;
};

export type AtlasMap = {
  meta: {
    image: string;
    atlas_width: number;
    atlas_height: number;
    tile_width: number;
    tile_height: number;
    origin: "top-left";
    layout: number[];
    row_order: string[];
    fallback_images?: Record<string, string>;
  };
  tiles: Record<string, AtlasTileRect>;
};

const BASE = (import.meta.env.BASE_URL ?? "/").replace(/\/?$/, "/");

export async function loadAtlasMap(): Promise<AtlasMap> {
  const res = await fetch(BASE + "assets/tiles/tile-atlas-map.json");
  if (!res.ok) {
    throw new Error(`加载图集映射失败: ${res.status}`);
  }
  return (await res.json()) as AtlasMap;
}
