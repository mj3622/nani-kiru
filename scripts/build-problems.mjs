import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadAndValidateProblems } from "./problem-utils.mjs";

const OUT_DIR = resolve(process.cwd(), "public/data");

const { problems, errors, categories } = loadAndValidateProblems();
if (errors.length > 0) {
  console.error("题库构建失败（校验未通过）：");
  for (const err of errors) console.error(`- ${err}`);
  process.exit(1);
}

mkdirSync(OUT_DIR, { recursive: true });

const sorted = [...problems].sort((a, b) => a.id.localeCompare(b.id));
const index = sorted.map((p) => ({
  id: p.id,
  category_id: p.category_id,
  category_title: p.category_title,
  title: p.title,
  round_label: p.round_label,
  seat_wind: p.seat_wind,
  turn: p.turn
}));

writeFileSync(resolve(OUT_DIR, "categories.json"), JSON.stringify(categories, null, 2), "utf-8");
writeFileSync(resolve(OUT_DIR, "problems.index.json"), JSON.stringify(index, null, 2), "utf-8");

const byCategory = new Map(categories.map((c) => [c.id, []]));
for (const p of sorted) {
  if (!byCategory.has(p.category_id)) byCategory.set(p.category_id, []);
  byCategory.get(p.category_id).push(p);
}
for (const category of categories) {
  const categoryDir = resolve(OUT_DIR, "categories", category.id);
  const problemsDir = resolve(categoryDir, "problems");
  mkdirSync(problemsDir, { recursive: true });
  const rows = byCategory.get(category.id) ?? [];
  const titleMap = rows.map((p) => ({
    id: p.id,
    title: p.title,
    round_label: p.round_label,
    seat_wind: p.seat_wind,
    turn: p.turn,
    file: `/data/categories/${category.id}/problems/${p.id}.json`
  }));
  writeFileSync(
    resolve(categoryDir, "titles.json"),
    JSON.stringify(titleMap, null, 2),
    "utf-8"
  );
  for (const p of rows) {
    writeFileSync(
      resolve(problemsDir, `${p.id}.json`),
      JSON.stringify(p, null, 2),
      "utf-8"
    );
  }
}

console.log(
  `题库构建完成：${sorted.length} 题，${categories.length} 分类，输出目录 ${OUT_DIR}`
);
