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

首页也收录全部 12 个公开 GitHub 仓库：有线上地址的项目附源码入口，其余放在「更多公开仓库」。ChartBridge 和东方财富 Mac 导入助手为本地工具；历史仓库、GitHub Profile 与 Fork 会明确标注。铁路助手可直接在线体验。

在线传送带目前展示 15 个站点，另含简报看板、Quantse 模拟盘与入门学堂的目录及四门独立课程。按住 → 加速、按住 ← 减速，松开恢复自然速度；也可按住页面上的箭头。首屏标题循环打字，桌面项目错峰悬浮；减少动态偏好会自动显示静态内容。

## 站点上还有什么

- **在线站点**：就是上面这些。探活失败会从「在线」变成挂掉。
- **观点**：首页列表 + [`/notes/`](https://chaestblog.pages.dev/notes/) 归档。长文与短记都可订阅；填了文章路径就有独立页面，并进入 sitemap。
- **盯盘**：最近在看的板块和个股，个人记录，不是投资建议。
- **⌘K**（或按 `/`）：搜站点、观点、板块，也能切主题。
- **玻璃 / 护眼 / 墨夜** 三套主题；没选过就跟系统深色模式。
- 右下角可以留言。RSS：[`/rss.xml`](https://chaestblog.pages.dev/rss.xml)
- **站点助理**：右下角「问问助理」，了解项目用途、按需求找入口、解读公开观点；回答逐字出现，附可点击出处，支持停止、新对话和复制，首页与子页都能使用。

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
node scripts/test-assistant.mjs # 内容范围、流式回答、限额、私网中转与安全渲染
node scripts/test-assistant-workerd.mjs # 使用已安装的 Wrangler，在 Cloudflare 本身的运行时验证接口
python3 scripts/test-assistant-ui.py # 已启动本机服务时运行；需开发机的 Playwright / Chrome
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

## AI 站点助理

使用 Magpie 列表中的 `workbuddy/deepseek-v4.1-flash`，固定模型由服务端决定。浏览器只访问本站 `/api/assistant`，密钥不进入 HTML、JS、对话或公开数据。默认回答围绕当前公开目录，不作全网实时搜索，也不把本机私有文件当知识库。

每次提问从与 `/api/content` 相同的 KV 键读取作者介绍、项目、观点全文、关注与近况，再结合 `data/assistant.json` 中的公开页面 / README 摘录。删除或隐藏项目、修改项目地址、删除观点后，旧摘录会被排除。仓库部署说明只作技术背景，不用于断言当前线上服务状态。数字引用及下方出处卡片由服务端提供的资料列表生成；模型返回的 HTML 和任意链接不会直接执行。

本机直连：在不入库的 `.env` 中配置 `MAGPIE_BASE_URL`（含 `/v1`）、`MAGPIE_API_KEY`。随后正常启动 `node server.js`。刷新公开摘录：

```bash
python3 scripts/sync-assistant-knowledge.py
# 本机网络需要代理时：
python3 scripts/sync-assistant-knowledge.py --proxy http://127.0.0.1:1082
```

当 Magpie 只在 Tailscale 私网中时，Pages 通过独立鉴权的 HTTPS 中转访问：

```text
浏览器 → 本站 Pages Function（读取当前 KV 内容）
       → HTTPS 中转（独立口令、固定模型、调用限额）
       → 私网 Magpie → DeepSeek 4.1 Flash
```

私网设备的 `.env` 额外配置 32 字符以上的随机 `ASSISTANT_RELAY_TOKEN`，运行 `node scripts/assistant-relay.mjs`。它只监听 `127.0.0.1:8778`，开放需鉴权的 `/chat` 与 `/healthz`，不提供模型列表、管理或任意目标代理。可用 `python3 scripts/install-assistant-relay.py` 安装 macOS 登录自启与退出重启；日志只记录服务启动 / 故障，应用不写入聊天正文。项目外盘必须保持挂载。

当前通过 Tailscale Funnel 的独立 HTTPS 8443 端口连接；原有其他端口保持各自服务。Pages **生产环境**配置 `ASSISTANT_RELAY_URL`（完整 HTTPS `/chat` 地址）与 Secret 类型的 `ASSISTANT_RELAY_TOKEN`，然后重新部署。远端口令与私网设备一致，Magpie 主密钥只在私网设备上。此模式依赖中转设备开机、网络与 Tailscale 正常；离线时助理给出可重试提示，站点内容仍可浏览。

为限制公开调用，Pages 在 KV 中按匿名化 IP 每小时最多 12 次、全站每天 180 次，KV 配额为尽力限制；中转另有持久化的每日 240 次硬上限和 3 个并发上限，每次最多 1800 输出 token。应用不持久化对话，窗口收起后保留本页对话，刷新 / 换页清空。停止、关闭或超时会取消正在生成的请求，半途断流会明确标记未完成。

停止本机中转（按需手动操作）：

```bash
launchctl bootout gui/$(id -u) ~/Library/LaunchAgents/com.chaestblog.assistant.plist
tailscale funnel --https=8443 off
```

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
