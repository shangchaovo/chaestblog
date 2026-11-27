# chaestblog

这是我的个人主页，从这里可以打开我发布的工具、找到本地项目的源码，也可以读我写的市场观察。

[打开主页](https://chaestblog.pages.dev/)，按 `/` 搜一个项目，例如 `WordPaper`，回车即可前往。也可以用 `⌘K` / `Ctrl+K` 搜站点、观点和关注板块。

## 挑一个入口

| 想做什么 | 去哪里 |
| --- | --- |
| 把今天的生词做成桌面壁纸 | [WordPaper](https://wordpaper.pages.dev/) · [源码](https://github.com/shangchaovo/wordpaper) |
| 准备一份可导出 PDF 的校招简历 | [简历工坊](https://resume-5lv.pages.dev/) · [源码](https://github.com/shangchaovo/resume-site) |
| 比较火车直达、同车分段和中转方案 | [同车余票](https://rail-same-train-pages.pages.dev/) |
| 查机构评级与目标价，回看发布后相对 SPY 的表现 | [外资投行研报](https://fresearch.cc.cd/) · [源码](https://github.com/shangchaovo/ib-research) |
| 查加密资金费率、清算热图和 BTC / ETH 期权墙 | [加密终端](https://crypto-funding-arbitrage.pages.dev/) · [源码](https://github.com/shangchaovo/crypto-funding-arbitrage) |
| 看预测市场的盘口与持仓、美股 AI / 半导体消息，或交易日报 | [Predict Pulse](https://predict-pulse.signal-harbor.workers.dev/?view=sentiment) · [Signal Harbor](https://signal-harbor-terminal.signal-harbor.workers.dev/#overview) · [交易每日报告](https://dailytrade.cc.cd/) |

首页还有简报看板、Quantse 模拟盘和入门学堂。ChartBridge、东方财富 Mac 导入助手等本地工具放在「更多公开仓库」，从卡片进入源码。站点卡片会显示最近一次探测结果，线上探活缓存约 10 分钟，刷新期间可能先看到旧结果。

只想读文章，可以订阅长文与短记。盯盘区记录的是我个人关注的板块和股票，不构成投资建议。右下角可留言，也可以点「问问助理」，按用途找项目或查观点的原文出处。[观点归档](https://chaestblog.pages.dev/notes/) · [RSS](https://chaestblog.pages.dev/rss.xml)

## 在本机看站或改内容

前端是 HTML、CSS 和原生 JavaScript 模块。本机由 Node 提供页面和 API，无需前端构建或安装 npm 包。先在仓库根目录设置管理口令并启动服务。

```bash
cp .env.example .env
# 在 .env 中把 HUB_ADMIN_TOKEN 换成自己的管理口令
node server.js
```

打开 `http://127.0.0.1:8777`。默认端口被占用时服务会退出。要编辑站点，在导航栏选「更多 → 管理」登录。

- **发短记**，填标题和摘要，保存后出现在归档与 RSS 中，固定链接是 `/notes/#note-<id>`。
- **发长文**，另填文章路径（例如 `cpu-gpu`）和 Markdown 全文，就有独立的 `/notes/cpu-gpu/` 和 sitemap 条目。需要特殊排版时可提供 `notes/<slug>/index.html`，它优先于动态文章页。
- **改目录或恢复旧稿**，也在管理页操作，可下载备份，保存时保留最近 10 个版本。管理员会话有效期为 7 天。

本机内容写入 `data/*.json`。线上内容工作台写入 Cloudflare KV（绑定名 `HUB_KV`）。仓库种子文件和静态首页提供兜底，单改种子文件不能更新已有的线上 KV 内容。

## 站点助理的资料与配置

助理根据当前公开的项目、观点、关注板块与近况，以及公开页面和 README 摘录作答，并附出处。它不做全网实时检索。窗口收起可继续本页对话，刷新或换页后清空。上游模型服务暂不可用时仍可浏览目录与文章。

本机直连时在 `.env` 中配置 `MAGPIE_BASE_URL`（含 `/v1`）和 `MAGPIE_API_KEY`，由服务端使用固定模型 `workbuddy/deepseek-v4.1-flash`。公开摘录可用 `python3 scripts/sync-assistant-knowledge.py` 更新。密钥留在服务端。

私网模型可通过 `node scripts/assistant-relay.mjs` 接入。中转默认只监听本机，需要至少 32 字符的独立 `ASSISTANT_RELAY_TOKEN`。Pages 配置中转的 HTTPS `/chat` 地址 `ASSISTANT_RELAY_URL` 及同名 token secret，改后重新部署。源码默认 Pages 每 IP 每小时 12 次、全站每日 180 次（尽力限流），中转另限每日 240 次、同时 3 次请求。[服务端助理](shared/assistant.mjs) · [中转脚本](scripts/assistant-relay.mjs)

## 验证与部署

```bash
python3 scripts/test-api.py
node --experimental-vm-modules scripts/test-modules.mjs
node scripts/test-home-function.mjs
node scripts/test-assistant.mjs
```

新增截图可用 `python3 scripts/make-webp.py` 生成 WebP。修改前端资源后同步更新各 HTML、模块 import 的 `?v=` 和 `shared/view.mjs` 的 `ASSET_V`。`node scripts/build-static.mjs` 重建静态 404 页。

Cloudflare Pages 生产项目为 `chaestblog`。工作流在 `main` 更新时发布，需配置有 Pages 编辑权限的 `CLOUDFLARE_API_TOKEN`。自行部署时将工作流指向自己的账号，设置 `HUB_ADMIN_TOKEN` 与 `HUB_KV` 绑定。手动发布脚本需 `CLOUDFLARE_API_TOKEN` 和 `CLOUDFLARE_ACCOUNT_ID`。[部署工作流](.github/workflows/deploy-pages.yml) · [手动发布脚本](scripts/deploy-pages.sh)

反馈站点问题或建议收录入口，请到[仓库 Issues](https://github.com/shangchaovo/chaestblog/issues)。
