# chaestblog

个人页，也是我那些已经挂在公网上的工具的入口。

**线上：[chaestblog.pages.dev](https://chaestblog.pages.dev/)**

第一屏是正在跑的站点，下面是最近写的观点和正在盯的板块。路过可以打个招呼。卡片上的「在线」会真的去探活（带一点延迟），挂了能看出来，不是写死的绿点。

## 挂上去的站

- **[加密终端](https://crypto-funding-arbitrage.pages.dev/)** — 资金费率套利、链上 Meme 异动、主力清算热图、BTC/ETH 期权墙。[源码](https://github.com/shangchaovo/crypto-funding-arbitrage)
- **[外资研报](https://fresearch.cc.cd/)** — UBS / Citi / 摩跟 / 大摩的评级和目标价，发完之后相对 SPY 验证过没有。[源码](https://github.com/shangchaovo/ib-research)
- **[WordPaper](https://wordpaper.pages.dev/)** — 把每天要背的单词做成壁纸，雅思 / 四六级 / 考研 / 日语都有。[源码](https://github.com/shangchaovo/wordpaper)
- **[简历工坊](https://resume-5lv.pages.dev/)** — 校招简历编辑器，左表单右 A4，导出矢量 PDF。[源码](https://github.com/shangchaovo/resume-site)
- **[Predict Pulse](https://predict-pulse.signal-harbor.workers.dev/?view=sentiment)** — 预测市场的热点盘口、聪明钱持仓和带来源权重的情绪。
- **[Signal Harbor](https://signal-harbor-terminal.signal-harbor.workers.dev/#overview)** — 美股 AI / 半导体新闻、分析师观点、OCC 官方期权持仓墙。
- **[交易每日报告](https://dailytrade.cc.cd/)** — 开盘前把 A 股扫描、外资研报、美股监控和宏观拼成一张日报。

## 站点上还有什么

- **在线站点**：就是上面这些。探活失败会从「在线」变成挂掉。
- **观点**：首页列表 + [`/notes/`](https://chaestblog.pages.dev/notes/) 归档。长文与短记都可订阅；填了文章路径就有独立页面，并进入 sitemap。
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
node --experimental-vm-modules scripts/test-modules.mjs # 单次启动、共享状态和模块版本
node scripts/test-home-function.mjs # 线上首页函数、KV 失败回退和响应头
python3 scripts/make-webp.py   # 新增截图后生成同名 WebP
node scripts/build-static.mjs  # 重新生成 404.html
```

## 写内容

导航栏点「更多」→「管理」，输入 `HUB_ADMIN_TOKEN`。登录后可以改项目、观点、盯盘和「最近在做」，也能下载备份、恢复默认稿或撤销上一版。

发一篇长文：工作台里填 **文章路径**（英文小写，如 `cpu-gpu`）+ **全文（Markdown）**，保存即可。`/notes/<路径>/`、归档页、RSS、sitemap 会一起更新，不用改仓库。想精细排版再手写 `notes/<slug>/index.html`，它会盖住动态渲染。

只写标题和摘要也会进入归档和 RSS，短记的固定链接是 `/notes/#note-<id>`，正文完整保留在归档中。sitemap 只列独立页面。

首页的观点和观点数会先由 Pages Function 从当前 KV 渲染，再交给前端加载 `/api/content`，因此删除观点后，无 JavaScript 的首屏也会同步。`index.html` 中的 `hub:notes` 和 `hub:note-count` 注释标记是这两个替换区的边界，调整布局时请保留；静态文件中的内容仍是服务不可用时的兜底稿。

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

`server.js`、`.env`、`scripts/` 不会上传。改了 CSS/JS 记得统一更新各静态 HTML、`shared/view.mjs` 的 `ASSET_V` 和所有前端模块 import 的 `?v=`。首页由 `js/main.js` 单次启动，业务模块不要回引入口文件；模块回归检查会校验版本一致性。

自定义域 `chaestblog.is-a.dev`：Pages 上线后，等 is-a.dev 的注册 PR 合并，再到 [cf-pages.is-a.dev](https://cf-pages.is-a.dev) 绑定。

## 联系

写在 `data/site.json` 的 `socials` 里。现在公开的是 [GitHub](https://github.com/shangchaovo)、邮箱、[X](https://x.com/johny_xie)（@johny_xie）、[Telegram](https://t.me/chaestgetrichbot)（@chaestgetrichbot）和 [Buy Me a Coffee](https://buymeacoffee.com/chasetse)。没有的渠道不要占空位。
