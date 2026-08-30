#!/usr/bin/env bash
# Deploy Chase hub to Cloudflare Pages.
# 只上传页面、静态资源和 functions；不上传 server.js / .env / .git。
set -euo pipefail

cd "$(dirname "$0")/.."
STAGE="$(mktemp -d /tmp/chase-hub.XXXXXX)"
trap 'rm -rf "$STAGE"' EXIT

# 404.html 必须是真实静态文件：Pages 的未匹配路径不会走 Function
node scripts/build-static.mjs

# rss.xml / sitemap.xml 由 functions/ 动态生成，不再上传静态副本
cp index.html 404.html robots.txt rss.xsl _headers "$STAGE/"
# shared/ 不是路由，但 functions/ 从它 import 校验规则和模板，必须一起打包
for dir in assets css js data functions shared about notes rss; do
  cp -R "$dir" "$STAGE/"
done

# 默认发生产分支 main。不指定 --branch 时 wrangler 会跟当前 git 分支走，变成预览部署。
npx -y wrangler@4.113.0 pages deploy "$STAGE" \
  --project-name "${CLOUDFLARE_PAGES_PROJECT:-chaestblog}" \
  --branch "${CLOUDFLARE_PAGES_BRANCH:-main}" \
  --commit-dirty=true

echo "部署完成。生产地址：https://chaestblog.pages.dev/"
echo "弹幕和在线编辑还要在 Pages 设置里加："
echo "  环境变量 HUB_ADMIN_TOKEN = 你的管理口令"
echo "  KV 命名空间，绑定名必须是 HUB_KV（需要 Workers KV 权限，不只是 Pages 编辑）"
