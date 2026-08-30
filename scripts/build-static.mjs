#!/usr/bin/env node
// 从 shared/view.mjs 生成需要以静态文件存在的页面（Cloudflare Pages 的 404 兜底
// 必须是真实的 /404.html，Function 接不到未匹配路径）。
import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { notFoundPage } from "../shared/view.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

await writeFile(join(root, "404.html"), notFoundPage());
console.log("wrote 404.html");
