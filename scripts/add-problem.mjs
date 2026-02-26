import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const DATA_DIR = resolve(process.cwd(), "public/data");
const CATEGORY_MAP_PATH = resolve(DATA_DIR, "categories.json");
const CATEGORIES_DIR = resolve(DATA_DIR, "categories");

const TILE_RE = /^(?:[0-9][mps]|east|south|west|north|white|green|red|back)$/;
const SEAT_WINDS = new Set(["east", "south", "west", "north"]);
const ROUND_LABEL_RE = /^(东|南|西|北)(\d+)(局)?$/;
const HAND_TILE_COUNT = 14;

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith("--")) continue;
    const key = token.slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith("--")) {
      out[key] = true;
    } else {
      out[key] = next;
      i += 1;
    }
  }
  return out;
}

function parseTileList(value) {
  if (value == null || String(value).trim() === "") return [];
  return String(value)
    .split(/[,\s]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function parseTileEfficiency(value) {
  if (value == null || String(value).trim() === "") return null;
  const out = {};
  const parts = String(value).split(",");
  for (const part of parts) {
    const [tile, num] = part.split(":").map((s) => s.trim());
    if (!tile) continue;
    const n = Number(num);
    out[tile] = Number.isFinite(n) ? n : NaN;
  }
  return out;
}

function normalizeRoundLabel(round) {
  const s = String(round).trim();
  const m = s.match(ROUND_LABEL_RE);
  if (!m) return null;
  return m[3] ? s : `${m[1]}${m[2]}局`;
}

function validateTile(code, ctx, errors) {
  if (typeof code !== "string" || !TILE_RE.test(code)) {
    errors.push(`${ctx}: 非法牌码 "${String(code)}"`);
  }
}

function extractReasoningTiles(text) {
  const matches = String(text).match(/\[([^\]]+)\]/g) ?? [];
  return matches.map((m) => m.slice(1, -1).trim());
}

function validateAddProblemArgs(args, errors) {
  const required = [
    "category",
    "title",
    "round",
    "seat",
    "turn",
    "dora",
    "hand",
    "answer",
    "shanten",
    "eff",
    "reasoning"
  ];
  for (const key of required) {
    if (args[key] == null || String(args[key]).trim() === "") {
      errors.push(`缺少必填项: --${key}`);
    }
  }
  if (errors.length > 0) return;

  const roundLabel = normalizeRoundLabel(args.round);
  if (!roundLabel) {
    errors.push(
      `--round 格式非法: 应为「东南西北」+ 数字 + 可选「局」，如 东1局、南2、西3局，当前: "${String(args.round)}"`
    );
  }

  if (!SEAT_WINDS.has(String(args.seat).toLowerCase())) {
    errors.push(`--seat 必须为 east|south|west|north，当前: "${String(args.seat)}"`);
  }

  const turn = Number(args.turn);
  if (!Number.isInteger(turn) || turn < 0) {
    errors.push(`--turn 必须为非负整数，当前: "${String(args.turn)}"`);
  }

  const dora = parseTileList(args.dora);
  if (dora.length === 0) {
    errors.push("--dora 至少需要 1 张牌");
  } else {
    for (const t of dora) validateTile(t, "dora", errors);
  }

  const hand = parseTileList(args.hand);
  if (hand.length !== HAND_TILE_COUNT) {
    errors.push(`--hand 必须为 ${HAND_TILE_COUNT} 张牌，当前 ${hand.length} 张`);
  } else {
    for (const t of hand) validateTile(t, "hand", errors);
  }

  const answer = String(args.answer).trim();
  if (!answer) {
    errors.push("--answer 不能为空");
  } else {
    validateTile(answer, "answer", errors);
  }

  const shanten = Number(args.shanten);
  if (!Number.isInteger(shanten)) {
    errors.push(`--shanten 必须为整数，当前: "${String(args.shanten)}"`);
  }

  const eff = parseTileEfficiency(args.eff);
  if (eff === null || Object.keys(eff).length === 0) {
    errors.push("--eff 至少需要一组「牌:数值」，如 6s:18,8s:14");
  } else {
    for (const [tile, value] of Object.entries(eff)) {
      validateTile(tile, "eff", errors);
      if (typeof value !== "number" || Number.isNaN(value)) {
        errors.push(`--eff 中 "${tile}" 的数值必须为数字`);
      }
    }
  }

  const reasoning = String(args.reasoning).trim();
  if (!reasoning) {
    errors.push("--reasoning 不能为空");
  } else {
    const tokens = extractReasoningTiles(reasoning);
    for (const token of tokens) {
      validateTile(token, "reasoning 中的 [牌码]", errors);
    }
  }

  if (args.title != null && String(args.title).trim() === "") {
    errors.push("--title 不能为空");
  }
}

function ensureJsonCategories() {
  const categories = JSON.parse(readFileSync(CATEGORY_MAP_PATH, "utf-8"));
  if (!Array.isArray(categories) || categories.length === 0) {
    throw new Error("categories.json 为空或格式错误");
  }
  return categories;
}

function printHelp() {
  console.log(`用法:
  npm run add:problem -- --category <id|标题> --title "<题目名>" --round "<局数>" --seat <自风> --turn <巡目> --dora "<宝牌>" --hand "<14张手牌>" --answer "<切牌>" --shanten <向听> --eff "<牌:数值,...>" --reasoning "<解析>"

除 --id 外均为必填；--id 不传则自动生成。

参数说明与校验:
  --category           分类 id 或标题（须在 categories.json 中存在）
  --title              题目标题，非空
  --round              局数：东南西北 + 数字 + 可选「局」，如 东1局、南2、西3局（缺「局」会自动补）
  --seat               east | south | west | north
  --turn               巡目，非负整数
  --dora               宝牌，至少 1 张，牌码同 hand
  --hand               手牌，必须恰好 14 张，牌码：1m-9m 万、1p-9p 筒、1s-9s 索、east/south/west/north/white/green/red、back
  --answer             正确答案（切哪张），1 张牌码
  --shanten            向听数，整数
  --eff                牌效率，格式 牌:数值,牌:数值，如 6s:18,8s:14,white:10
  --reasoning          解析文案，牌用 [6s] 会渲染为牌图；换行写 \\n 如 "第一行\\n第二行"
  --id                 题目 id，不传则自动生成
  --list-categories    列出分类并退出
`);
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const categories = ensureJsonCategories();

  if (args["list-categories"]) {
    console.log("可用分类:");
    for (const c of categories) {
      console.log(`- ${c.id}: ${c.title}`);
    }
    return;
  }

  if (args.help || args.h) {
    printHelp();
    return;
  }

  const validationErrors = [];
  validateAddProblemArgs(args, validationErrors);
  if (validationErrors.length > 0) {
    console.error("参数校验失败：");
    validationErrors.forEach((e) => console.error(`  - ${e}`));
    process.exit(1);
  }

  const category = categories.find(
    (c) => c.id === args.category || c.title === args.category
  );
  if (!category) {
    console.error(`未找到分类: ${args.category}，可运行 --list-categories 查看`);
    process.exit(1);
  }

  const id =
    args.id != null && String(args.id).trim() !== ""
      ? String(args.id).trim()
      : `${category.id}-${Date.now().toString(36)}`;
  const categoryDir = resolve(CATEGORIES_DIR, category.id);
  const problemsDir = resolve(categoryDir, "problems");
  const outPath = resolve(problemsDir, `${id}.json`);

  const roundLabel = normalizeRoundLabel(args.round);
  const seatWind = String(args.seat).toLowerCase();
  const handTiles = parseTileList(args.hand);
  const doraTiles = parseTileList(args.dora);
  const tileEff = parseTileEfficiency(args.eff);

  const problem = {
    id,
    category: category.title,
    category_id: category.id,
    category_title: category.title,
    title: String(args.title).trim(),
    round_label: roundLabel,
    seat_wind: seatWind,
    turn: Number(args.turn),
    dora: doraTiles,
    hand_tiles: handTiles,
    answer_discard: String(args.answer).trim(),
    shanten: Number(args.shanten),
    tile_efficiency: tileEff,
    reasoning: String(args.reasoning).trim().replace(/\\n/g, "\n")
  };

  mkdirSync(problemsDir, { recursive: true });
  writeFileSync(outPath, `${JSON.stringify(problem, null, 2)}\n`, "utf-8");

  const titlesPath = resolve(categoryDir, "titles.json");
  let titles = [];
  try {
    titles = JSON.parse(readFileSync(titlesPath, "utf-8"));
  } catch {
    titles = [];
  }
  if (!Array.isArray(titles)) titles = [];
  titles.push({
    id: problem.id,
    title: problem.title,
    round_label: problem.round_label,
    seat_wind: problem.seat_wind,
    turn: problem.turn,
    file: `/data/categories/${category.id}/problems/${id}.json`
  });
  writeFileSync(titlesPath, JSON.stringify(titles, null, 2) + "\n", "utf-8");

  const indexPath = resolve(DATA_DIR, "problems.index.json");
  let indexList = [];
  try {
    indexList = JSON.parse(readFileSync(indexPath, "utf-8"));
  } catch {
    indexList = [];
  }
  if (!Array.isArray(indexList)) indexList = [];
  indexList.push({
    id: problem.id,
    category_id: category.id,
    category_title: category.title,
    title: problem.title,
    round_label: problem.round_label,
    seat_wind: problem.seat_wind,
    turn: problem.turn
  });
  writeFileSync(indexPath, JSON.stringify(indexList, null, 2) + "\n", "utf-8");

  console.log(`已创建题目: ${outPath}`);
  console.log("下一步建议:");
  console.log("  npm run validate:problems");
}

try {
  main();
} catch (err) {
  console.error(`新增题目失败: ${err.message}`);
  process.exit(1);
}
