# Chase Xie · chaestblog

独立开发者的个人枢纽站：**一页看完已经挂在公网上的市场工具和学习产品**，再写下最近的观点和盯盘。

**线上站点：[chaestblog.pages.dev](https://chaestblog.pages.dev/)**

Personal hub for Chase Xie’s live **market terminals**, **WordPaper**, **FResearch**, and **campus resume builder** — plus notes and a watchlist.

## 核心用处

这不是博客框架，而是一张「已经能用」的工作台：卡片上的「在线」会真实探活（带延迟），点进去就是正在跑的站点。

| 产品 | 核心用处 | 线上 | 源码 |
| --- | --- | --- | --- |
| Predict Pulse | 预测市场热点、聪明钱与带权重的情绪 | [打开](https://predict-pulse.signal-harbor.workers.dev/?view=sentiment) | — |
| Signal Harbor | 美股 AI/半导体新闻、分析师观点、OCC 期权墙 | [打开](https://signal-harbor-terminal.signal-harbor.workers.dev/#overview) | — |
| WordPaper | 每日单词壁纸 + 艾宾浩斯复习 | [wordpaper.pages.dev](https://wordpaper.pages.dev/) | [wordpaper](https://github.com/shangchaovo/wordpaper) |
| 加密终端 | 资金费率套利 / Meme / 清算热图 / 期权 Wall | [crypto-funding-arbitrage.pages.dev](https://crypto-funding-arbitrage.pages.dev/) | [crypto-funding-arbitrage](https://github.com/shangchaovo/crypto-funding-arbitrage) |
| 外资研报 | 投行评级、目标价、相对 SPY 验证 | [fresearch.cc.cd](https://fresearch.cc.cd/) | [ib-research](https://github.com/shangchaovo/ib-research) |
| 交易每日报告 | 开盘前跨市场作战台 | [dailytrade.cc.cd](https://dailytrade.cc.cd/) | — |
| 简历工坊 | 校招 A4 简历，导出矢量 PDF | [resume-5lv.pages.dev](https://resume-5lv.pages.dev/) | [resume-site](https://github.com/shangchaovo/resume-site) |

## 站点上还有什么

- **在线站点**：上表这些产品。卡片上的「在线」是真实探活，带延迟。
- **观点**：首页列表 + [`/notes/`](https://chaestblog.pages.dev/notes/) 归档。填了文章路径就会有独立页面，RSS / sitemap 跟着更新。
- **盯盘**：最近在看的板块和个股，个人记录，不是投资建议。
- **⌘K**（或按 `/`）：搜站点、观点、板块，也能切主题。
- **玻璃 / 护眼 / 墨夜** 三套主题；没选过就跟系统深色模式。
- 右下角可以留言。RSS：[`/rss.xml`](https://chaestblog.pages.dev/rss.xml)

无构建、无框架、无第三方依赖：静态 HTML/CSS + 原生 ESM，线上走 Cloudflare Pages Functions。

## 本机

```bash
cp .env.example .env   # 改 HUB_ADMIN_TOKEN
node server.js         # http://127.0.0.1:8777
```

端口被占用会直接退出，不会自动换。

```bash
python3 scripts/test-api.py    # 接口 + 页面冒烟
python3 scripts/make-webp.py   # 新增截图后生成同名 WebP
node scripts/build-static.mjs  # 重新生成 404.html
```

## 写内容

导航栏点「管理」，输入 `HUB_ADMIN_TOKEN`。登录后可以改项目、观点、盯盘和「最近在做」，也能下载备份、恢复默认稿或撤销上一版。

发一篇长文：工作台里填 **文章路径**（英文小写，如 `cpu-gpu`）+ **全文（Markdown）**，保存即可。`/notes/<路径>/`、归档页、RSS、sitemap 会一起更新，不用改仓库。想精细排版再手写 `notes/<slug>/index.html`，它会盖住动态渲染。

- **线上**写进 KV（`HUB_KV`），只改仓库里的 `data/*.json` 不会改变线上。
- **本机**写进 `data/site.json`、`data/notes.json`、`data/watchlist.json`、`data/now.json`、`data/danmaku.json`。
- 每次保存留最近 10 个版本；登录状态 7 天。

## 部署

生产：[chaestblog.pages.dev](https://chaestblog.pages.dev/)。项目名 `chaestblog`，生产分支 `main`。

推送到 `main`，GitHub Actions 会发生产。仓库 Secrets 需要 `CLOUDFLARE_API_TOKEN`（Pages 编辑权限）。

本机手动发：

```bash
bash scripts/deploy-pages.sh   # 需要 CLOUDFLARE_API_TOKEN + CLOUDFLARE_ACCOUNT_ID
```

Pages 项目里还要有：

1. 环境变量 `HUB_ADMIN_TOKEN`
2. KV 命名空间，绑定名必须是 `HUB_KV`

`server.js`、`.env`、`scripts/` 不会上传。改了 CSS/JS 记得 bump `index.html` 和 `shared/view.mjs` 里的 `?v=`。

自定义域 `chaestblog.is-a.dev`：Pages 上线后，等 is-a.dev 的注册 PR 合并，再到 [cf-pages.is-a.dev](https://cf-pages.is-a.dev) 绑定。

## 联系

写在 `data/site.json` 的 `socials` 里。现在公开的是 [GitHub](https://github.com/shangchaovo)、邮箱、[X](https://x.com/johny_xie)（@johny_xie）和 [Buy Me a Coffee](https://buymeacoffee.com/chasetse)。没有的渠道不要占空位。
