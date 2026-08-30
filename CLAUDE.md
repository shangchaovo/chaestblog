# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Chase Xie 个人导航/枢纽站(chaestblog)。**无构建、无框架、无第三方依赖**:`index.html` + `css/` + `js/`(原生 ESM)+ `server.js`(本地)+ Cloudflare Pages Functions(线上)。线上 https://chaestblog.pages.dev。

## 常用命令

```bash
node server.js                  # 本地 http://127.0.0.1:8777(端口被占用会直接退出,不自动换)
python3 scripts/test-api.py     # API + 页面冒烟:自起临时端口跑 server.js,测完恢复 data/*.json
python3 scripts/make-webp.py    # assets/shots/ 的 JPG → 同名 WebP(加了新截图就重跑)
node scripts/build-static.mjs   # 从 shared/view.mjs 重新生成 404.html
bash scripts/deploy-pages.sh    # 手动发生产(需 env:CLOUDFLARE_API_TOKEN + CLOUDFLARE_ACCOUNT_ID)
```

没有 lint / 单元测试框架;`scripts/test-api.py` 是唯一的自动化检查。

## 内容从哪来(最重要,先看这个)

首页的卡片、观点、盯盘**不是直接渲染 `data/*.json`**,而是两条路:

1. HTML 里有一份**静态兜底**(供 SEO 和无 JS)。
2. `js/app.js` 加载时调 `GET /api/content`,拿到内容后**用 JS 重新渲染**整页(在线站点计数、卡片、观点列表都是动态生成的)。

`/api/content` 的内容优先级:**KV(`HUB_KV`)> 仓库里的 `data/*.json`(种子)> 代码内置 fallback**。线上 KV 已有数据,所以**改线上内容必须写 KV**(网页内容工作台,或直接 `PUT /api/projects` 等);只改 `data/site.json` 不会改变线上。

- 所有写接口都要管理员态。
- 每次写经 `writeStoreVersioned` 在 KV 里留最近 10 个版本;`POST /api/restore` 可恢复默认稿或上一版。

## 认证

`HUB_ADMIN_TOKEN`(Pages 环境变量)→ `POST /api/session` 换取 HMAC 签名的 `HubSession` cookie(7 天)→ `isAdmin` 闸门保护全部写接口。同一 IP 连续 5 次口令错误锁 10 分钟(计数存 KV)。

## 线上/本地对应关系

- **线上 Pages Functions**:
  - `functions/api/[[path]].js` 承接全部 `/api/*`;`functions/_utils.js` 是它的 KV / 会话 / 探活工具集。
  - `functions/notes/[[path]].js` 承接 `/notes/*`,`functions/notes.js` 把 `/notes` 301 到 `/notes/`。
  - `functions/rss.xml.js`、`functions/sitemap.xml.js` 动态生成订阅源和站点地图。
- **本地**:`server.js` 用 Node 内置 http **复刻了同一套路由**(没有 KV,改用 `data/*.json` + 内存 Map 模拟),所以本地能完整跑通工作台、弹幕、截图上传、观点页、RSS。

⚠️ **Pages 是 Function 优先、静态兜底**(按自动生成的 `_routes.json`),不是反过来。所以 `functions/notes/[[path]].js` 里先 `await context.next()`,拿到 200 就把手写的 `notes/<slug>/index.html` 原样返回,只有没有静态页的 slug 才走动态渲染。`server.js` 也是同样的顺序。

### 唯一来源:`shared/`

`shared/` 是 ESM,`functions/`(esbuild 打包时内联)和 `server.js`(启动时 `await import()`)都从这里取,**不要在任何地方复制第二份**:

- `shared/rules.mjs` — 全部 `assertDanmaku/assertNotes/assertWatchlist/assertNow/assertProjects/assertProjectShot` 与限流、长度常量。
- `shared/view.mjs` — 服务端模板:观点页、`/notes/` 归档页、404、RSS、sitemap,外加一个不依赖第三方的 Markdown 子集渲染器(`## 标题`、列表、引用、代码块、`[链接]()`、`**粗体**`,先转义再套行内格式)。`ASSET_V` 是这些模板里 CSS/JS 的 `?v=` 版本号。

## 前端模块

- `index.html` → `js/app.js`(主入口:拉内容 + 渲染 + 跑马灯)→ 引入 `theme.js`(三套主题)+ `admin.js`(内容工作台)+ `danmaku.js`(弹幕)+ `palette.js`(⌘K 命令面板)+ `util.js`(esc/api/icon/shotImg 等)。
- `about/`、`notes/` 子页 → `js/page.js` → `theme.js`。
- `js/api.js`、`arbitrage.js`、`countdown.js`、`history.js` **没有任何引用**,是仓库来源(funding-dashboard)的遗留,别在上面改。
- `loadContent()` **先打 `/api/content`**,只有失败才回落去取 `data/*.json` 种子稿——不要改回无条件先拉静态那份。
- 首屏之后有两个装饰性的补充请求,失败都静默:`/api/health`(把卡片状态换成真实探活)和 `/api/hit`(一次会话只上报一笔)。

## 探活与访问计数

- `GET /api/health` 拿 KV 里 10 分钟内的探活结果;过期就**先返回旧结果**、用 `waitUntil` 后台重探(别让访客等 6 秒超时)。结果只在 KV 键 `health`。
- `applyHealth()` 只改 `[data-health]` 上的 `.pill-label` 和 class,**不重渲染卡片**,否则跑马灯动画会跳回起点。跑马灯的副本卡片 `data-id` 相同,所以用 `querySelectorAll` 全改。
- `POST /api/hit` 累加 KV 键 `hits`(`{total, days}`,留最近 30 天)。前端用 `sessionStorage` 保证一次会话只写一次,免得打满 KV 每日写配额。

## 站点区跑马灯

「在线站点」是**自动横向无缝跑马灯**:`#siteGrid` 外套 `.board-marquee` 视口;`renderSites` 在「非管理态 + 非减少动态 + 项目数 ≥ 4」时把卡片渲染**两份**(副本 `aria-hidden` + `tabindex=-1`)并给 body 加 `.marquee-on`,CSS 用 `translateX(-50%)` 无缝循环、悬停/聚焦暂停、两侧渐隐,时长按轨道半宽/65px/s 动态算。**无 JS / 减少动态 / 管理态自动回退普通 grid**。改卡片结构时 `siteCardHtml()` 和 HTML 静态兜底要一起改。

## 部署

两种方式发 Cloudflare Pages(项目名 `chaestblog`,生产分支 `main`),**都只增量上传同一组受控文件**:`index.html`、`404.html`、`robots.txt`、`rss.xsl`、`_headers` + 目录 `assets/ css/ js/ data/ functions/ shared/ about/ notes/ rss/`:

1. **GitHub Actions(推荐)**:`.github/workflows/deploy-pages.yml`,push 到 `main` 自动发生产。需在 repo Settings → Secrets 配 `CLOUDFLARE_API_TOKEN`(Pages 编辑权限)。仓库是 `shangchaovo/chaestblog`,不要推到 funding-dashboard。
2. **本机手动**:`bash scripts/deploy-pages.sh`。

- **新增顶层文件/目录不会被部署**,除非加进这两个脚本/yml。`server.js`、`.env`、`scripts/`、`launchd/`、`node_modules` 都不上传。
- `shared/` 不是路由,但 `functions/` 从它 import,**必须一起进 staging**,否则线上打包会失败。
- `404.html` 由 `node scripts/build-static.mjs` 生成(两个部署入口都会先跑一次)。**它必须是真实静态文件**:Pages 的未匹配路径不会走 Function。没有它的时候 Pages 会拿首页兜底并返回 200,变成 soft 404。
- `rss.xml` / `sitemap.xml` **已经没有静态文件了**,由 Function 生成。别再往仓库里放同名静态文件——Function 优先,但两份内容会互相误导。
- `_headers` 给 `css/ js/`(有 `?v=` 指纹)7 天缓存、`assets/` 1 天 + SWR,并加了 CSP / `X-Frame-Options` / `Permissions-Policy`。**引入任何外部脚本、图片或接口都要同步改 CSP**,否则线上会被拦掉。
- **改环境变量或 KV 绑定后必须重新部署才生效**(Pages 的 env 在部署时绑定)。
- 部署用的 API token(`pages-deploy`,存 `~/.config/cloudflare/env`)**只有 Pages 编辑权限、没有 KV 写权限**,改不了线上内容;内容只能走管理口令那条路。
- CSS/JS 用 `?v=YYYYMMDDxx` 查询串防缓存,**改了样式/脚本记得 bump**。要改**两处**:`index.html`(含 `about/`、`notes/`、`rss/` 子页)里的字面量,和 `shared/view.mjs` 的 `ASSET_V`(服务端渲染的页面用它)。

## 观点(博客)那条链路

一条观点有三种形态,取决于填了什么:

| 填了 | 首页列表 | 独立页面 | RSS / sitemap |
| --- | --- | --- | --- |
| 只有标题 + 摘要 | 显示 | 无 | 不进 |
| 加了 `slug` | 显示 + 「阅读全文」 | 有(动态或静态) | 进 |
| 加了 `slug` + `article` | 同上 | 动态渲染 Markdown 全文 | 进 |

- **加一篇长文不需要改仓库**:工作台里填「文章路径」+「全文(Markdown)」,保存进 KV,`/notes/<slug>/`、`/notes/` 归档页、`rss.xml`、`sitemap.xml` 会一起更新。
- 想要更精细排版(像 `notes/hbm-supply/`)才手写静态 HTML,放到 `notes/<slug>/index.html`,它会自动盖住动态渲染。
- `article` 上限 20000 字,`body`(摘要)4000。

## SEO / 域名

canonical / OG / `robots.txt` / JSON-LD 当前都指向 `chaestblog.pages.dev`,`sitemap.xml` 由 Function 按同一个 `ORIGIN` 生成。改域名时只需要动 `shared/view.mjs` 的 `ORIGIN` 和各静态 HTML 里的字面量。自定义域 `chaestblog.is-a.dev` 的 is-a.dev 注册 PR 合并后:把 canonical 切回 is-a.dev 并对 pages.dev 做 301,再按 README「公网」一节绑定域名。
