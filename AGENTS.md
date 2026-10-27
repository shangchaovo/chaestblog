# AGENTS.md

This file provides guidance to Codex (Codex.ai/code) when working with code in this repository.

Chase Xie 个人导航/枢纽站(chaestblog)。**无构建、无框架、无第三方依赖**:`index.html` + `css/` + `js/`(原生 ESM)+ `server.js`(本地)+ Cloudflare Pages Functions(线上)。线上 https://chaestblog.pages.dev。

## 常用命令

```bash
node server.js                  # 本地 http://127.0.0.1:8777(端口被占用会直接退出,不自动换)
python3 scripts/test-api.py     # API + 页面冒烟:自起临时端口跑 server.js,测完恢复 data/*.json
node --experimental-vm-modules scripts/test-modules.mjs  # ESM 启动、缓存版本与内容渲染
node --experimental-vm-modules scripts/test-marquee.mjs  # 调速、释放、编辑隔离与空闲停帧
node scripts/test-home-function.mjs  # 首页 KV 内容与安全响应头
python3 scripts/make-webp.py    # assets/shots/ 的 JPG → 同名 WebP(加了新截图就重跑)
node scripts/build-static.mjs   # 从 shared/view.mjs 重新生成 404.html
bash scripts/deploy-pages.sh    # 手动发生产(需 env:CLOUDFLARE_API_TOKEN + CLOUDFLARE_ACCOUNT_ID)
```

没有 lint / 单元测试框架；上面的脚本直接检查实际 API、原生模块及首页 Function，不需要额外依赖。

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

## 公开仓库展示

`site.projects` 同时存放线上站点和只有公开源码的项目；`status: "live"` 表示公开展示。填写 `live` 的项目进入站点跑马灯；只有 `github` 且 `githubPublic !== false` 的项目进入 `#opensource` 的 `#repoGrid`。公开仓库数量覆盖两区，已整合项目、Profile 和 Fork 用标签及摘要说明，不冒充独立上线产品。命令面板同时检索站点和源码；编辑器允许线上地址留空。同步公开仓库时先核验 GitHub 实际可见性，保留现有介绍、顺序和 KV 其他内容；静态种子和 HTML 兜底也要一起更新。

## 探活与访问计数

- `GET /api/health` 拿 KV 里 10 分钟内的探活结果;过期就**先返回旧结果**、用 `waitUntil` 后台重探(别让访客等 6 秒超时)。结果只在 KV 键 `health`。
- `applyHealth()` 只改 `[data-health]` 上的 `.pill-label` 和 class,**不重渲染卡片**,否则跑马灯动画会跳回起点。跑马灯的副本卡片 `data-id` 相同,所以用 `querySelectorAll` 全改。
- `POST /api/hit` 累加 KV 键 `hits`(`{total, days}`,留最近 30 天)。前端用 `sessionStorage` 保证一次会话只写一次,免得打满 KV 每日写配额。

## 站点区跑马灯

「在线站点」默认自动横向无缝流动:`#siteGrid` 外套 `.board-marquee`;`renderSites` 在「非管理态 + 非减少动态 + 项目数 ≥ 4」时把卡片渲染两份(副本 `aria-hidden` + `tabindex=-1`),给 body 加 `.marquee-on`。CSS 用 `translateX(-50%)` 循环、键盘聚焦暂停、两侧渐隐,速度约 48px/s。「暂停流动」只切换 `.marquee-paused`，保留原 DOM 和时间线，继续时从当前位置衔接。`js/marquee.js` 在该区可见时接管未占用的 ← / →：按住分别平滑到 0.25× / 3×，松开恢复 1×；触屏也可按住屏幕上的箭头。调速使用现有 CSS Animation 的 `updatePlaybackRate()`，不修改 `currentTime`、不重建卡片。鼠标悬停保持自然流动，静止阅读使用暂停按钮；手动暂停优先，输入框、编辑器、命令面板和系统组合键不接管；失焦、离屏或切后台释放按键，速度收敛即停止 rAF。无 JS / 减少动态 / 管理态回退普通 grid。卡片结构要同步修改 `siteCardHtml()` 和 HTML 静态兜底。

首屏打字在 `js/hero.js`：第一句来自 KV 的 `profile.title`，无障碍文本始终保留原句；隐藏的完整句子预留高度，避免轮换时页面跳动。内容或计数更新不重启轮换，离屏/后台暂停，管理态和减少动态时静态显示原句。新增站点要核验实际公网内容并使用真实截图，重定向别名只保留主入口，不把欢迎页或同站历史入口当成新产品。

用户最不想要的是彩色光晕：背景、玻璃材质和装饰阴影保持中性黑白灰，不能添加彩色环境光或按项目染色的光晕。按钮强调色、状态色以及头像、图标和截图的本色可保留，不要把整个站点灰度化。现有悬浮、跟手、入场等动效保留。

Liquid UI 的材质与动画在 `css/liquid.css` 和 `js/motion.js`：首屏真实项目悬浮桌面、灰阶环境光、玻璃边缘/高光、分层入场、鼠标弹簧倾斜/磁吸、导航滑块、点击涟漪、主题过渡。保持原生 ESM、无第三方依赖。连续动画优先直接动画 transform/opacity；材质模糊保持静态，不逐帧改变 filter/渐变。JS 只在交互弹簧未收敛时调度 rAF，离屏和后台暂停装饰，尊重减少动态/透明度偏好。内容更新、探活和访问计数不得重播首屏动画。项目桌面也必须来自 `/api/content`，不能硬编码覆盖线上内容。

`js/glass.js` 为 Chromium 的导航和首屏五个浮窗生成静态圆角边缘 SVG 位移图；只在尺寸变化时更新，不为跑马灯卡片生成滤镜。Safari / Firefox 保留 CSS 磨砂与双层高光。内容重绘时回收旧滤镜，减少透明度时禁用折射。按压回弹使用独立的 `scale` 动画，与原有倾斜/浮动叠加，失焦、取消触摸、管理态和减少动态时清理。

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
