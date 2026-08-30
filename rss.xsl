<?xml version="1.0" encoding="UTF-8"?>
<xsl:stylesheet version="1.0"
  xmlns:xsl="http://www.w3.org/1999/XSL/Transform"
  xmlns:atom="http://www.w3.org/2005/Atom">
  <xsl:output method="html" encoding="UTF-8" doctype-system="about:legacy-compat" />
  <xsl:template match="/">
    <html lang="zh-CN" data-theme="liquid">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>RSS 订阅 · chaestblog</title>
        <meta name="description" content="订阅 chaestblog 的最新博文。" />
        <link rel="icon" type="image/svg+xml" href="/assets/favicon.svg" />
        <link rel="alternate" type="application/rss+xml" title="chaestblog RSS" href="https://chaestblog.pages.dev/rss.xml" />
        <link rel="stylesheet" href="/css/themes.css?v=20260825b" />
        <link rel="stylesheet" href="/css/styles.css?v=20260825b" />
      </head>
      <body class="page rss-page">
        <div class="atmosphere" aria-hidden="true">
          <span class="blob blob-a"></span>
          <span class="blob blob-b"></span>
          <span class="blob blob-c"></span>
        </div>
        <header class="nav glass">
          <a class="brand" href="/">
            <img class="brand-avatar" src="/assets/avatar.jpg" alt="Chase Xie" width="40" height="40" />
            <span class="brand-copy"><strong>Chase Xie</strong><small>Personal Hub</small></span>
          </a>
          <nav class="nav-links" aria-label="页面">
            <a href="/#sites">站点</a>
            <a href="/#notes">观点</a>
            <a href="/about/">关于</a>
            <a href="/#contact">联系</a>
          </nav>
          <div class="theme-switch" role="radiogroup" aria-label="主题">
            <button class="theme-btn" type="button" data-theme="liquid" aria-pressed="true" title="Liquid Glass"><i class="orb orb-liquid" aria-hidden="true"></i><span>玻璃</span></button>
            <button class="theme-btn" type="button" data-theme="eye" aria-pressed="false" title="护眼"><i class="orb orb-eye" aria-hidden="true"></i><span>护眼</span></button>
            <button class="theme-btn" type="button" data-theme="ink" aria-pressed="false" title="墨夜"><i class="orb orb-ink" aria-hidden="true"></i><span>墨夜</span></button>
          </div>
        </header>

        <main class="rss-view">
          <section class="rss-hero glass">
            <div class="rss-copy">
              <p class="kicker">RSS 2.0 · Feed is live</p>
              <h1>把更新交给阅读器</h1>
              <p class="lede"><xsl:value-of select="rss/channel/description" /></p>
              <div class="rss-address">
                <label for="rssFeedUrl">订阅地址</label>
                <div class="rss-address-row">
                  <input id="rssFeedUrl" type="url" readonly="readonly" value="{rss/channel/atom:link[@rel='self']/@href}" />
                  <a class="btn primary" href="/rss/">打开订阅助手</a>
                </div>
                <p>这是阅读器直接读取的标准 RSS 源；需要复制地址时，请打开订阅助手。</p>
              </div>
            </div>
            <div class="rss-beacon" aria-hidden="true">
              <span class="rss-ring rss-ring-a"></span>
              <span class="rss-ring rss-ring-b"></span>
              <img src="/assets/icons/rss.svg" alt="" width="92" height="92" />
            </div>
          </section>

          <section class="rss-help">
            <div>
              <p class="kicker">How it works</p>
              <h2>这就是可订阅的源</h2>
            </div>
            <p>浏览器原先显示的 XML 是给阅读器读取的数据，不是报错。现在浏览器会显示这个界面；阅读器仍会直接读取同一份标准 RSS。</p>
          </section>

          <section class="rss-entries" aria-labelledby="rssEntriesTitle">
            <div class="rss-section-head">
              <h2 id="rssEntriesTitle">最近更新</h2>
              <span><xsl:value-of select="count(rss/channel/item)" /> 篇</span>
            </div>
            <xsl:for-each select="rss/channel/item">
              <a class="rss-entry glass" href="{link}">
                <span class="rss-entry-icon"><img src="/assets/icons/notes.svg" alt="" width="42" height="42" /></span>
                <span class="rss-entry-copy">
                  <time><xsl:value-of select="pubDate" /></time>
                  <strong><xsl:value-of select="title" /></strong>
                  <small><xsl:value-of select="description" /></small>
                </span>
                <span class="rss-entry-arrow" aria-hidden="true">→</span>
              </a>
            </xsl:for-each>
          </section>
        </main>
        <script src="/js/page.js?v=20260818a" type="module"></script>
      </body>
    </html>
  </xsl:template>
</xsl:stylesheet>
