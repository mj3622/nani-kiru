#!/usr/bin/env node
/**
 * 从 corrected/*.json 牌谱批量导入题目到 problems（通过调用 add:problem 指令）
 * 用法：在 frontend 目录下执行 node scripts/import-corrected.mjs
 * 数据源：../corrected/*.json
 */

import { readFileSync, readdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const FRONTEND_DIR = resolve(__dirname, "..");
const CORRECTED_DIR = resolve(FRONTEND_DIR, "..", "corrected");

const HAND_TILE_COUNT = 14;

function buildEffString(tileEfficiency, answerDiscard) {
  const eff = tileEfficiency && typeof tileEfficiency === "object" ? tileEfficiency : {};
  const entries = Object.entries(eff).filter(([, v]) => typeof v === "number" && !Number.isNaN(v));
  if (entries.length === 0) {
    return `${answerDiscard}:1`;
  }
  return entries.map(([tile, val]) => `${tile}:${val}`).join(",");
}

function main() {
  let files;
  try {
    files = readdirSync(CORRECTED_DIR).filter((f) => f.endsWith(".json")).sort();
  } catch (e) {
    console.error("无法读取 corrected 目录:", e.message);
    process.exit(1);
  }

  if (files.length === 0) {
    console.log("corrected 下没有 json 文件");
    return;
  }

  console.log(`找到 ${files.length} 个 json 文件，开始导入…\n`);

  let ok = 0;
  let skip = 0;
  let fail = 0;

  for (const file of files) {
    const path = resolve(CORRECTED_DIR, file);
    let data;
    try {
      data = JSON.parse(readFileSync(path, "utf-8"));
    } catch (e) {
      console.error(`[${file}] 解析失败:`, e.message);
      fail++;
      continue;
    }

    const handTiles = Array.isArray(data.hand_tiles) ? data.hand_tiles : [];
    if (handTiles.length !== HAND_TILE_COUNT) {
      console.log(`[${file}] 跳过: hand_tiles 不是 14 张 (当前 ${handTiles.length} 张)`);
      skip++;
      continue;
    }

    const category = data.category_id || "what-to-discard-300";
    const title = data.title || file.replace(/\.json$/i, "");
    const round = data.round_label || "东1局";
    const seat = data.seat_wind || "east";
    const turn = String(data.turn ?? 0);
    const dora = Array.isArray(data.dora) ? data.dora.join(" ") : String(data.dora || "");
    const hand = handTiles.join(" ");
    const answer = data.answer_discard || "";
    const shanten = String(data.shanten ?? 0);
    const eff = buildEffString(data.tile_efficiency, answer);
    const reasoning = (data.reasoning || "").trim().replace(/\n/g, "\\n") || "（无解析）";

    const argv = [
      process.execPath,
      resolve(FRONTEND_DIR, "scripts/add-problem.mjs"),
      "--category", category,
      "--title", title,
      "--round", round,
      "--seat", seat,
      "--turn", turn,
      "--dora", dora,
      "--hand", hand,
      "--answer", answer,
      "--shanten", shanten,
      "--eff", eff,
      "--reasoning", reasoning
    ];

    const result = spawnSync(argv[0], argv.slice(1), {
      cwd: FRONTEND_DIR,
      stdio: "pipe",
      encoding: "utf-8"
    });

    if (result.status === 0) {
      console.log(`[${file}] 已添加: ${title}`);
      ok++;
    } else {
      const err = (result.stderr || result.stdout || "").trim();
      console.error(`[${file}] 添加失败:`, err || result.status);
      fail++;
    }
  }

  console.log(`\n完成: 成功 ${ok}，跳过 ${skip}，失败 ${fail}`);
}

main();
