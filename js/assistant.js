import { esc } from "./util.js?v=2026103101";

const MARK = `<svg viewBox="0 0 40 40" fill="none" aria-hidden="true"><circle cx="20" cy="20" r="14" stroke="currentColor" stroke-opacity=".3"/><path d="M20 2v5m0 26v5M2 20h5m26 0h5" stroke="currentColor" stroke-linecap="round"/><path d="m24.8 15.2-2.4 7.2-7.2 2.4 2.4-7.2z" fill="currentColor"/><circle cx="20" cy="20" r="2" fill="var(--bg-0)"/></svg>`;
const glyph = (path) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${path}</svg>`;
const SEND = glyph('<path d="M12 19V5m-6 6 6-6 6 6"/>');
const STOP = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="7" y="7" width="10" height="10" rx="2" fill="currentColor"/></svg>';
const SUGGESTIONS = [
  ["01", "第一次来，带我逛逛", "从作者、作品到公开分享"],
  ["02", "WordPaper 可以怎么用？", "让英语学习融入日常"],
  ["03", "有哪些市场研究工具？", "按用途找到合适的入口"],
  ["04", "最近在分享哪些观点？", "读懂想法，也找到原文"],
];

function sourceLink(source) {
  try {
    const url = new URL(source.url, location.origin);
    if (!/^https?:$/.test(url.protocol) || url.username || url.password) return "";
    return url.origin === location.origin ? `${url.pathname}${url.search}${url.hash}` : url.href;
  } catch { return ""; }
}

function link(source, label, className = "") {
  const href = sourceLink(source);
  if (!href) return esc(label);
  return `<a class="${className}" href="${esc(href)}" data-assistant-source ${href.startsWith("/") ? "" : 'target="_blank" rel="noopener noreferrer"'} aria-label="${esc(`来源 ${source.id}：${source.title}`)}">${label}</a>`;
}

// Only our numbered source links become anchors. Model-produced HTML/URLs stay text.
export function answerHtml(value, sources = []) {
  const inline = (line) => esc(line)
    .replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>")
    .replace(/`([^`\n]+)`/g, "<code>$1</code>")
    .replace(/\[(\d{1,2})\]/g, (match, id) => {
      const source = sources.find((s) => s.id === Number(id));
      return source ? link(source, esc(id), "assistant-cite") : match;
    });
  let list = false;
  const out = [];
  for (const line of String(value).split("\n")) {
    const bullet = line.match(/^\s*(?:[-*]|\d+[.)、])\s+(.+)/);
    if (bullet) {
      if (!list) { out.push("<ul>"); list = true; }
      out.push(`<li>${inline(bullet[1])}</li>`);
    } else {
      if (list) { out.push("</ul>"); list = false; }
      const heading = line.match(/^#{1,4}\s+(.+)/);
      if (heading) out.push(`<h4>${inline(heading[1])}</h4>`);
      else if (line.trim()) out.push(`<p>${inline(line)}</p>`);
    }
  }
  if (list) out.push("</ul>");
  return out.join("");
}

export function conversationMessages(history, question) {
  const messages = [...history.slice(-8), { role: "user", content: question }];
  while (messages.length > 1 && (new TextEncoder().encode(JSON.stringify({ messages })).length > 23_000 || messages.reduce((sum, m) => sum + m.content.length, 0) > 16_000)) {
    messages.splice(0, 2);
  }
  return messages;
}

export function initAssistant() {
  if (typeof window.HTMLDialogElement === "undefined" || document.getElementById("assistantRoot")) return;
  const root = document.createElement("div");
  root.id = "assistantRoot";
  root.innerHTML = `
    <button class="assistant-launcher" id="assistantLauncher" type="button" aria-haspopup="dialog" aria-controls="assistantDialog" aria-expanded="false">
      <span class="assistant-mark">${MARK}</span><span class="assistant-launcher-copy"><strong>问问助理</strong><small>作品、想法与使用指南</small></span><span class="assistant-launcher-arrow" aria-hidden="true">↗</span>
    </button>
    <dialog class="assistant-dialog" id="assistantDialog" aria-labelledby="assistantTitle" aria-describedby="assistantDescription">
      <div class="assistant-shell">
        <header class="assistant-header">
          <span class="assistant-avatar">${MARK}</span><div class="assistant-heading"><span class="assistant-eyebrow">CHASE / GUIDE</span><h2 id="assistantTitle">站点助理 <span>AI</span></h2></div>
          <button class="assistant-icon-btn" type="button" id="assistantReset" aria-label="开始新对话" title="开始新对话" disabled>${glyph('<path d="M3 10a9 9 0 1 1 2.4 8M3 4v6h6"/>')}</button>
          <button class="assistant-icon-btn" type="button" id="assistantClose" aria-label="收起助理" title="收起助理">${glyph('<path d="m6 6 12 12M18 6 6 18"/>')}</button>
        </header>
        <div class="assistant-scroll" id="assistantScroll">
          <div class="assistant-welcome" id="assistantWelcome">
            <div class="assistant-welcome-mark">${MARK}<span class="assistant-mark-star" aria-hidden="true">✦</span></div>
            <p class="assistant-eyebrow">MAKE YOURSELF AT HOME</p>
            <h3>逛一逛，<br>从一个问题开始<span>。</span></h3>
            <p id="assistantDescription">找一个顺手的工具，或读懂一条观点。<br>我帮你把这里的作品与分享连起来。</p>
            <div class="assistant-suggestions">${SUGGESTIONS.map(([n, q, hint]) => `<button type="button" data-assistant-question="${esc(q)}"><span class="assistant-suggestion-number">${n}</span><span><strong>${esc(q)}</strong><small>${esc(hint)}</small></span><span class="assistant-suggestion-arrow" aria-hidden="true">↗</span></button>`).join("")}</div>
            <div class="assistant-public-note">${glyph('<path d="M12 3 4.5 6v5c0 4.2 3 7.8 7.5 10 4.5-2.2 7.5-5.8 7.5-10V6z"/><path d="m8.5 12 2.3 2.3 4.7-4.7"/>')}<span>从公开内容出发，每次回答都能找到出处。</span></div>
          </div>
          <div class="assistant-messages" id="assistantMessages" role="log" aria-label="与站点助理的对话" aria-live="off"></div>
        </div>
        <form class="assistant-composer" id="assistantForm">
          <div class="assistant-input-wrap"><label class="sr-only" for="assistantInput">向站点助理提问</label><textarea id="assistantInput" rows="1" maxlength="1600" placeholder="想了解什么？" enterkeyhint="send"></textarea><button class="assistant-send" id="assistantSend" type="submit" aria-label="发送问题" disabled>${SEND}</button></div>
          <div class="assistant-composer-meta"><span>基于公开分享 · 请以原文为准</span><span class="assistant-enter-hint">↵ 发送</span></div>
          <div class="sr-only" id="assistantAnnouncement" role="status" aria-live="polite"></div>
        </form>
      </div>
    </dialog>`;
  document.body.append(root);
  const find = (id) => root.querySelector(`#${id}`);
  const dialog = find("assistantDialog");
  const launcher = find("assistantLauncher");
  const form = find("assistantForm");
  const input = find("assistantInput");
  const send = find("assistantSend");
  const reset = find("assistantReset");
  const welcome = find("assistantWelcome");
  const messages = find("assistantMessages");
  const scroll = find("assistantScroll");
  const announcement = find("assistantAnnouncement");
  let history = [];
  let controller = null;
  let generation = 0;
  let stickToBottom = true;

  function resizeInput() {
    input.style.height = "auto";
    input.style.height = `${Math.min(108, input.scrollHeight)}px`;
    send.disabled = !controller && !input.value.trim();
  }
  function scrollDown() { if (stickToBottom) scroll.scrollTop = scroll.scrollHeight; }
  function viewport() {
    const view = window.visualViewport;
    dialog.style.setProperty("--assistant-vh", `${view?.height || window.innerHeight}px`);
    dialog.style.setProperty("--assistant-keyboard", `${view ? Math.max(0, window.innerHeight - view.height - view.offsetTop) : 0}px`);
  }
  function open() {
    if (dialog.open) return;
    viewport();
    dialog.showModal();
    launcher.setAttribute("aria-expanded", "true");
    window.visualViewport?.addEventListener("resize", viewport);
    if (window.matchMedia("(min-width: 600px)").matches) input.focus({ preventScroll: true });
    else find("assistantClose").focus({ preventScroll: true });
    if (welcome.hidden) scrollDown();
    else scroll.scrollTop = 0;
  }
  function message(role, content = "") {
    const item = document.createElement("article");
    item.className = `assistant-message assistant-message-${role}`;
    item.setAttribute("aria-label", role === "user" ? "你的问题" : "助理的回答");
    item.innerHTML = role === "user"
      ? `<div class="assistant-user-text"></div>`
      : `<div class="assistant-answer-label"><span>${MARK}</span>站点助理</div><div class="assistant-answer"></div><div class="assistant-answer-footer"></div>`;
    if (role === "user") item.firstElementChild.textContent = content;
    messages.append(item);
    return item;
  }
  function action(label, run) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "assistant-text-btn";
    button.textContent = label;
    button.addEventListener("click", run);
    return button;
  }

  async function ask(question, retryItem = null) {
    if (controller || !question.trim()) return;
    const current = ++generation;
    controller = new AbortController();
    const signal = controller.signal;
    welcome.hidden = true;
    reset.disabled = false;
    input.value = "";
    resizeInput();
    send.disabled = false;
    send.innerHTML = STOP;
    send.setAttribute("aria-label", "停止生成");
    stickToBottom = true;
    if (retryItem) retryItem.remove();
    else message("user", question);
    const item = message("assistant");
    const answer = item.querySelector(".assistant-answer");
    const footer = item.querySelector(".assistant-answer-footer");
    answer.innerHTML = '<div class="assistant-thinking"><span></span><span></span><span></span><em>在公开内容里找一找</em></div>';
    item.setAttribute("aria-busy", "true");
    announcement.textContent = "助理正在整理公开内容";
    scrollDown();
    let reply = "";
    let sources = [];
    let done = false;
    let paintQueued = false;
    let reader;
    const paint = () => {
      if (paintQueued) return;
      paintQueued = true;
      requestAnimationFrame(() => {
        paintQueued = false;
        if (generation !== current) return;
        answer.innerHTML = answerHtml(reply, sources);
        scrollDown();
      });
    };
    try {
      const response = await fetch("/api/assistant", {
        method: "POST", credentials: "same-origin", signal,
        headers: { "Content-Type": "application/json", Accept: "application/x-ndjson" },
        body: JSON.stringify({ messages: conversationMessages(history, question) }),
      });
      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        throw new Error(error.error || "助理暂时不可用，请稍后再试");
      }
      if (!response.body || !response.headers.get("Content-Type")?.includes("application/x-ndjson")) throw new Error("助理连接异常，请重试");
      reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const chunk = await reader.read();
        if (generation !== current) return;
        buffer += decoder.decode(chunk.value, { stream: !chunk.done });
        let at;
        while ((at = buffer.indexOf("\n")) >= 0) {
          const line = buffer.slice(0, at);
          buffer = buffer.slice(at + 1);
          if (!line.trim()) continue;
          const event = JSON.parse(line);
          if (event.type === "sources") sources = event.sources;
          else if (event.type === "delta") { reply += event.text; paint(); }
          else if (event.type === "done") done = true;
          else if (event.type === "error") throw new Error(event.error);
        }
        if (chunk.done) break;
      }
      if (!done || !reply) throw new Error("回答尚未完成，连接已中断，可以重试");
      answer.innerHTML = answerHtml(reply, sources);
      history.push({ role: "user", content: question }, { role: "assistant", content: reply.slice(0, 6000) });
      history = history.slice(-8);
      const cited = new Set([...reply.matchAll(/\[(\d{1,2})\]/g)].map((m) => Number(m[1])));
      const used = sources.filter((s) => cited.has(s.id));
      if (used.length) {
        const refs = document.createElement("div");
        refs.className = "assistant-sources";
        refs.innerHTML = `<span>内容出处</span>${used.map((s) => link(s, `${esc(s.title)} <span aria-hidden="true">↗</span>`, "assistant-source")).join("")}`;
        footer.append(refs);
      }
      if (navigator.clipboard) footer.append(action("复制回答", async (event) => {
        const button = event.currentTarget;
        try { await navigator.clipboard.writeText(reply); button.textContent = "已复制"; }
        catch { announcement.textContent = "无法复制，请选择回答文字后复制"; }
      }));
      announcement.textContent = "助理回答已完成，可以继续提问";
    } catch (error) {
      if (generation !== current) return;
      if (reply) answer.innerHTML = answerHtml(reply, sources);
      else answer.replaceChildren();
      const note = document.createElement("p");
      note.className = "assistant-message-note";
      note.textContent = signal.aborted ? "已停止生成" : error.message || "连接暂时中断，请重试";
      footer.append(note, action("重新提问 ↗", () => ask(question, item)));
      announcement.textContent = note.textContent;
    } finally {
      await reader?.cancel().catch(() => {});
      if (generation === current) {
        controller = null;
        item.removeAttribute("aria-busy");
        send.innerHTML = SEND;
        send.setAttribute("aria-label", "发送问题");
        resizeInput();
        scrollDown();
      }
    }
  }

  launcher.addEventListener("click", open);
  find("assistantClose").addEventListener("click", () => dialog.close());
  dialog.addEventListener("close", () => {
    controller?.abort();
    launcher.setAttribute("aria-expanded", "false");
    window.visualViewport?.removeEventListener("resize", viewport);
    launcher.focus({ preventScroll: true });
  });
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) {
      const box = dialog.getBoundingClientRect();
      if (event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom) dialog.close();
    }
    const suggestion = event.target.closest("[data-assistant-question]");
    if (suggestion) ask(suggestion.dataset.assistantQuestion);
    const source = event.target.closest("[data-assistant-source]");
    if (source?.getAttribute("href").startsWith("/")) dialog.close();
  });
  form.addEventListener("submit", (event) => { event.preventDefault(); if (!controller) ask(input.value.trim()); });
  send.addEventListener("click", (event) => { if (controller) { event.preventDefault(); controller.abort(); } });
  input.addEventListener("input", resizeInput);
  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey && !event.isComposing && event.keyCode !== 229) {
      event.preventDefault();
      if (!controller) form.requestSubmit();
    }
  });
  scroll.addEventListener("scroll", () => { stickToBottom = scroll.scrollHeight - scroll.scrollTop - scroll.clientHeight < 100; }, { passive: true });
  reset.addEventListener("click", () => {
    generation += 1;
    controller?.abort();
    controller = null;
    history = [];
    input.value = "";
    messages.replaceChildren();
    welcome.hidden = false;
    reset.disabled = true;
    send.innerHTML = SEND;
    send.setAttribute("aria-label", "发送问题");
    announcement.textContent = "已开始新对话";
    resizeInput();
    input.focus({ preventScroll: true });
  });
}
