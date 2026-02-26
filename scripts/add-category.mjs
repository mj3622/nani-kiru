import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const DATA_DIR = resolve(process.cwd(), "public/data");
const CATEGORY_MAP_PATH = resolve(DATA_DIR, "categories.json");
const CATEGORIES_DIR = resolve(DATA_DIR, "categories");
const TITLES_JSON_FILENAME = "titles.json";
const PROBLEMS_SUBDIR = "problems";

const ID_RE = /^[a-z0-9-]+$/i;

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

function ensureCategoryDirAndTitlesJson(categoryDir) {
  mkdirSync(categoryDir, { recursive: true });
  const problemsDir = resolve(categoryDir, PROBLEMS_SUBDIR);
  mkdirSync(problemsDir, { recursive: true });
  const titlesPath = resolve(categoryDir, TITLES_JSON_FILENAME);
  if (!existsSync(titlesPath)) {
    writeFileSync(titlesPath, "[]\n", "utf-8");
    return { titlesCreated: true };
  }
  return { titlesCreated: false };
}

function printHelp() {
  console.log(`用法:
  npm run add:category -- --id <分类id> --title "<分类显示名>"

参数:
  --id <分类id>      必填，英文标识，仅允许 a-z、0-9、连字符，如 defense、speed
  --title "<显示名>"  必填，中文显示名，将作为题目目录名与 category 字段值
  --help, -h         显示此帮助

若分类已存在于 categories.json（例如只删过目录），会只同步创建对应文件夹与 titles.json，不报错。

示例:
  npm run add:category -- --id defense --title "防守"
`);
}

function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.help || args.h) {
    printHelp();
    return;
  }

  const id = args.id != null ? String(args.id).trim() : "";
  const title = args.title != null ? String(args.title).trim() : "";

  if (!id) {
    console.error("错误: 必须指定 --id");
    printHelp();
    process.exit(1);
  }
  if (!ID_RE.test(id)) {
    console.error(`错误: id 仅允许字母、数字、连字符，当前为 "${id}"`);
    process.exit(1);
  }

  let categories = [];
  try {
    const raw = readFileSync(CATEGORY_MAP_PATH, "utf-8");
    categories = JSON.parse(raw);
    if (!Array.isArray(categories)) categories = [];
  } catch (err) {
    if (err.code === "ENOENT") {
      mkdirSync(DATA_DIR, { recursive: true });
      categories = [];
    } else {
      console.error(`错误: 无法读取 ${CATEGORY_MAP_PATH} (${err.message})`);
      process.exit(1);
    }
  }

  const existingById = categories.find((c) => c.id === id);
  const existingByTitle = title ? categories.find((c) => c.title === title) : null;

  if (existingById) {
    const categoryDir = resolve(CATEGORIES_DIR, id);
    const { titlesCreated } = ensureCategoryDirAndTitlesJson(categoryDir);
    console.log(`分类已存在 (id: ${id}, title: ${existingById.title})，已同步目录与 ${TITLES_JSON_FILENAME}`);
    if (titlesCreated) console.log(`已创建: ${resolve(categoryDir, TITLES_JSON_FILENAME)}`);
    return;
  }

  if (!title) {
    console.error("错误: 新建分类必须指定 --title");
    printHelp();
    process.exit(1);
  }
  if (existingByTitle) {
    console.error(`错误: 已存在 title 为 "${title}" 的分类 (id: ${existingByTitle.id})`);
    process.exit(1);
  }

  categories.push({ id, title });
  writeFileSync(CATEGORY_MAP_PATH, JSON.stringify(categories, null, 2) + "\n", "utf-8");
  console.log(`已写入分类: ${CATEGORY_MAP_PATH}`);

  const categoryDir = resolve(CATEGORIES_DIR, id);
  ensureCategoryDirAndTitlesJson(categoryDir);
  console.log(`已创建分类目录: ${categoryDir}`);
  console.log(`已创建映射文件: ${resolve(categoryDir, TITLES_JSON_FILENAME)}`);
  console.log(`已创建题目子目录: ${resolve(categoryDir, PROBLEMS_SUBDIR)}`);

  console.log("\n下一步建议:");
  console.log("1) 使用 npm run add:problem -- --category " + id + " --title \"<题目名>\" 添加题目");
  console.log("2) 或在该目录下手动添加题目 JSON 文件");
  console.log("3) npm run validate:problems && npm run build:problems");
}

main();
