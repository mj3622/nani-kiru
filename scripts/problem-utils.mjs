import { readdirSync, readFileSync, statSync } from "node:fs";
import { resolve, relative } from "node:path";

const DATA_DIR = resolve(process.cwd(), "public/data");
const CATEGORY_MAP_PATH = resolve(process.cwd(), "public/data/categories.json");
const CATEGORIES_DIR = resolve(DATA_DIR, "categories");
const TILE_RE = /^(?:[0-9][mps]|east|south|west|north|white|green|red|back)$/;
const SEAT_WINDS = new Set(["east", "south", "west", "north"]);

function walkCategoryProblemFiles() {
  const out = [];
  try {
    if (!statSync(DATA_DIR).isDirectory()) return out;
  } catch {
    return out;
  }
  let categoryDirs;
  try {
    categoryDirs = readdirSync(CATEGORIES_DIR, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const dirent of categoryDirs) {
    if (!dirent.isDirectory()) continue;
    const problemsDir = resolve(CATEGORIES_DIR, dirent.name, "problems");
    let files;
    try {
      files = readdirSync(problemsDir);
    } catch {
      continue;
    }
    for (const f of files) {
      if (f.endsWith(".json")) out.push(resolve(problemsDir, f));
    }
  }
  return out;
}

function toArray(value) {
  return Array.isArray(value) ? value : [];
}

function validateTile(code, ctx, errors) {
  if (typeof code !== "string" || !TILE_RE.test(code)) {
    errors.push(`${ctx}: 非法牌码 "${String(code)}"`);
  }
}

function extractReasoningTokens(text) {
  const matches = String(text).match(/\[([^\]]+)\]/g) ?? [];
  return matches.map((m) => m.slice(1, -1).trim());
}

function validateProblem(problem, filePath) {
  const errors = [];
  const requiredStringFields = [
    "id",
    "title",
    "round_label",
    "seat_wind",
    "answer_discard",
    "reasoning"
  ];
  for (const key of requiredStringFields) {
    if (typeof problem[key] !== "string" || problem[key].trim() === "") {
      errors.push(`${filePath}: 字段 ${key} 必须是非空字符串`);
    }
  }
  if (problem.category != null && (typeof problem.category !== "string" || problem.category.trim() === "")) {
    errors.push(`${filePath}: 字段 category 如存在必须是非空字符串`);
  }
  if (!Number.isInteger(problem.turn) || problem.turn < 0) {
    errors.push(`${filePath}: 字段 turn 必须是非负整数`);
  }
  if (!Number.isInteger(problem.shanten)) {
    errors.push(`${filePath}: 字段 shanten 必须是整数`);
  }
  if (!SEAT_WINDS.has(problem.seat_wind)) {
    errors.push(`${filePath}: seat_wind 只能是 east/south/west/north`);
  }

  const dora = toArray(problem.dora);
  const handTiles = toArray(problem.hand_tiles);
  if (dora.length === 0) {
    errors.push(`${filePath}: dora 至少需要 1 张牌`);
  }
  if (handTiles.length === 0) {
    errors.push(`${filePath}: hand_tiles 不能为空`);
  }
  for (const t of dora) validateTile(t, `${filePath} dora`, errors);
  for (const t of handTiles) validateTile(t, `${filePath} hand_tiles`, errors);
  validateTile(problem.answer_discard, `${filePath} answer_discard`, errors);

  const eff = problem.tile_efficiency ?? {};
  if (typeof eff !== "object" || Array.isArray(eff) || eff === null) {
    errors.push(`${filePath}: tile_efficiency 必须是对象`);
  } else {
    for (const [tile, value] of Object.entries(eff)) {
      validateTile(tile, `${filePath} tile_efficiency key`, errors);
      if (typeof value !== "number" || Number.isNaN(value)) {
        errors.push(`${filePath}: tile_efficiency["${tile}"] 必须是数字`);
      }
    }
  }

  const reasoningTiles = extractReasoningTokens(problem.reasoning);
  for (const token of reasoningTiles) {
    validateTile(token, `${filePath} reasoning`, errors);
  }

  return errors;
}

function loadAndValidateProblems() {
  const problems = [];
  const errors = [];
  const ids = new Set();
  let categoryList = [];
  try {
    categoryList = JSON.parse(readFileSync(CATEGORY_MAP_PATH, "utf-8"));
  } catch (err) {
    errors.push(`${CATEGORY_MAP_PATH}: JSON 解析失败 (${err.message})`);
  }
  const categoriesByTitle = new Map();
  const categoriesById = new Map();
  for (const c of Array.isArray(categoryList) ? categoryList : []) {
    if (typeof c?.id !== "string" || !/^[a-z0-9-]+$/i.test(c.id)) {
      errors.push(`${CATEGORY_MAP_PATH}: 分类 id 非法 "${String(c?.id)}"`);
      continue;
    }
    if (typeof c?.title !== "string" || c.title.trim() === "") {
      errors.push(`${CATEGORY_MAP_PATH}: 分类 title 非法 "${String(c?.title)}"`);
      continue;
    }
    if (categoriesById.has(c.id)) {
      errors.push(`${CATEGORY_MAP_PATH}: 分类 id 重复 "${c.id}"`);
      continue;
    }
    if (categoriesByTitle.has(c.title)) {
      errors.push(`${CATEGORY_MAP_PATH}: 分类 title 重复 "${c.title}"`);
      continue;
    }
    categoriesById.set(c.id, c);
    categoriesByTitle.set(c.title, c);
  }

  const files = walkCategoryProblemFiles();
  for (const filePath of files) {
    const rel = relative(CATEGORIES_DIR, filePath);
    const parts = rel.split(/[/\\]/);
    const categoryId = parts[0];
    if (parts[1] !== "problems" || parts.length !== 3) {
      errors.push(`${filePath}: 路径应为 categories/<id>/problems/<id>.json`);
      continue;
    }
    const categoryMeta = categoriesById.get(categoryId);
    if (!categoryMeta) {
      errors.push(`${filePath}: 分类 id "${categoryId}" 未在 categories.json 中配置`);
      continue;
    }
    let parsed;
    try {
      parsed = JSON.parse(readFileSync(filePath, "utf-8"));
    } catch (err) {
      errors.push(`${filePath}: JSON 解析失败 (${err.message})`);
      continue;
    }
    const fileErrors = validateProblem(parsed, filePath);
    errors.push(...fileErrors);
    if (ids.has(parsed.id)) {
      errors.push(`${filePath}: id 重复 "${parsed.id}"`);
    } else {
      ids.add(parsed.id);
    }
    if (parsed.category != null && parsed.category !== categoryMeta.title) {
      errors.push(`${filePath}: category 与路径不一致 (路径为 ${categoryId}，category 为 "${parsed.category}")`);
    }
    parsed.category_id = categoryId;
    parsed.category_title = categoryMeta.title;
    parsed.category = categoryMeta.title;
    problems.push(parsed);
  }
  return {
    files,
    problems,
    errors,
    categories: Array.from(categoriesById.values())
  };
}

export { DATA_DIR, CATEGORY_MAP_PATH, loadAndValidateProblems };
