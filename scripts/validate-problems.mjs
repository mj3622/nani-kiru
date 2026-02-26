import { loadAndValidateProblems } from "./problem-utils.mjs";

const { files, problems, errors } = loadAndValidateProblems();

if (errors.length > 0) {
  console.error("题库校验失败：");
  for (const err of errors) console.error(`- ${err}`);
  process.exit(1);
}

console.log(`题库校验通过：${files.length} 文件，${problems.length} 题`);
