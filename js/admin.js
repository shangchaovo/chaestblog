import { api, toast, uid, esc } from "./util.js";
import { getState, setAdmin, setContent, render } from "./app.js";

function dialog(id) {
  return document.getElementById(id);
}

function field(label, name, value, type = "text", extra = "") {
  if (type === "textarea") {
    return `<label class="field"><span>${esc(label)}</span><textarea name="${esc(name)}" ${extra}>${esc(value)}</textarea></label>`;
  }
  return `<label class="field"><span>${esc(label)}</span><input type="${esc(type)}" name="${esc(name)}" value="${esc(value)}" ${extra}></label>`;
}

function selectField(label, name, value, options) {
  return `<label class="field"><span>${esc(label)}</span><select name="${esc(name)}">${options.map(([key, text]) => (
    `<option value="${esc(key)}" ${key === value ? "selected" : ""}>${esc(text)}</option>`
  )).join("")}</select></label>`;
}

function openEditor({ title, html, onSubmit }) {
  const box = dialog("editorDialog");
  document.getElementById("editorTitle").textContent = title;
  document.getElementById("editorFields").innerHTML = html;
  const form = document.getElementById("editorForm");
  form.onsubmit = async (event) => {
    event.preventDefault();
    const submit = form.querySelector('[type="submit"]');
    submit.disabled = true;
    form.setAttribute("aria-busy", "true");
    try {
      const data = Object.fromEntries(new FormData(form).entries());
      await onSubmit(data);
      box.close();
      toast("已经保存");
    } catch (error) {
      toast(error.message || "保存失败");
    } finally {
      submit.disabled = false;
      form.removeAttribute("aria-busy");
    }
  };
  document.getElementById("editorCancel").onclick = () => box.close();
  box.showModal();
}

async function refreshContent() {
  const content = await api("/api/content");
  setContent(content);
  render();
}

async function saveNotes(items) {
  await api("/api/notes", { method: "PUT", body: JSON.stringify({ items }) });
  await refreshContent();
}

async function saveNow(text) {
  await api("/api/now", { method: "PUT", body: JSON.stringify({ text }) });
  await refreshContent();
}

async function saveWatchlist(watchlist) {
  await api("/api/watchlist", { method: "PUT", body: JSON.stringify(watchlist) });
  await refreshContent();
}

async function saveProjects(projects) {
  await api("/api/projects", { method: "PUT", body: JSON.stringify({ projects }) });
  await refreshContent();
}

function openAdmin() {
  const target = getState().admin ? dialog("adminPanelDialog") : dialog("adminDialog");
  if (target && !target.open) {
    target.showModal();
    target.querySelector("input")?.focus();
  }
}

function bindAvatarUnlock() {
  const avatar = document.getElementById("heroAvatarBtn") || document.getElementById("heroAvatar");
  let taps = [];
  const maybeOpen = () => {
    const now = Date.now();
    taps = taps.filter((time) => now - time < 2200);
    taps.push(now);
    if (taps.length >= 5) {
      taps = [];
      openAdmin();
    }
  };
  avatar?.addEventListener("click", maybeOpen);
  document.getElementById("openAdminBtn")?.addEventListener("click", openAdmin);
  if (new URLSearchParams(location.search).has("edit")) openAdmin();
}

function bindLogin() {
  const form = document.getElementById("adminForm");
  const button = document.getElementById("adminLoginBtn");
  const tokenInput = document.getElementById("adminToken");
  form?.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (button.disabled) return;
    const token = document.getElementById("adminToken").value;
    button.disabled = true;
    try {
      await api("/api/session", { method: "POST", body: JSON.stringify({ token }) });
      setAdmin(true);
      dialog("adminDialog").close();
      dialog("adminPanelDialog").showModal();
      document.getElementById("adminToken").value = "";
      toast("已进入内容工作台");
    } catch (error) {
      toast(error.message || "口令不对");
    } finally {
      button.disabled = false;
    }
  });
  document.getElementById("adminCancelBtn")?.addEventListener("click", () => {
    dialog("adminDialog").close();
    tokenInput.value = "";
  });
}

function editNow() {
  openEditor({
    title: "最近在做",
    html: field("一句话", "text", getState().now?.text, "text", "maxlength=80 required"),
    onSubmit: async (data) => saveNow(data.text),
  });
}

function editNote(existing) {
  openEditor({
    title: existing ? "修改观点" : "发布观点",
    html:
      field("标题", "title", existing?.title, "text", "maxlength=80 required") +
      field("文章路径（英文小写，填了就有独立页面 /notes/<路径>/）", "slug", existing?.slug, "text", "pattern=[a-z0-9-]{1,80}") +
      field("摘要（首页和 RSS 里显示）", "body", existing?.body, "textarea", "maxlength=4000 required") +
      field("全文（Markdown，可留空；支持 ## 标题、列表、引用、代码块、[链接](地址)）", "article", existing?.article, "textarea", "maxlength=20000") +
      `<p class="field-note">填了「文章路径」+「全文」，保存后 /notes/ 归档页、RSS 和 sitemap 会自动带上这篇，不需要改仓库。</p>`,
    onSubmit: async (data) => {
      const items = [...(getState().notes.items || [])];
      const patch = {
        title: data.title,
        body: data.body,
        slug: data.slug || undefined,
        article: data.article || undefined,
      };
      if (existing) {
        const index = items.findIndex((item) => item.id === existing.id);
        if (index >= 0) items[index] = { ...existing, ...patch, updatedAt: new Date().toISOString() };
      } else {
        items.unshift({ id: uid("n"), ...patch, createdAt: new Date().toISOString() });
      }
      await saveNotes(items);
    },
  });
}

function editSector(existing) {
  openEditor({
    title: existing ? "修改板块" : "添加板块",
    html:
      field("板块名", "name", existing?.name, "text", "maxlength=40 required") +
      field("关注逻辑", "thesis", existing?.thesis, "textarea", "maxlength=800 required"),
    onSubmit: async (data) => {
      const watchlist = structuredClone(getState().watchlist);
      if (existing) {
        const sector = watchlist.sectors.find((item) => item.id === existing.id);
        if (sector) Object.assign(sector, { name: data.name, thesis: data.thesis });
      } else {
        watchlist.sectors.push({ id: uid("s"), name: data.name, thesis: data.thesis, stocks: [] });
      }
      await saveWatchlist(watchlist);
    },
  });
}

function editStock(sectorId, existing) {
  const sectors = getState().watchlist.sectors || [];
  openEditor({
    title: existing ? "修改个股" : "添加个股",
    html:
      selectField("所属板块", "sectorId", sectorId, sectors.map((sector) => [sector.id, sector.name])) +
      field("代码", "symbol", existing?.symbol, "text", "maxlength=12 required") +
      field("名称", "name", existing?.name, "text", "maxlength=40 required") +
      field("关注理由", "reason", existing?.reason, "textarea", "maxlength=800 required"),
    onSubmit: async (data) => {
      const watchlist = structuredClone(getState().watchlist);
      if (existing) {
        for (const sector of watchlist.sectors) sector.stocks = (sector.stocks || []).filter((item) => item.id !== existing.id);
      }
      const sector = watchlist.sectors.find((item) => item.id === data.sectorId);
      if (!sector) throw new Error("找不到板块");
      sector.stocks = sector.stocks || [];
      sector.stocks.push({
        id: existing?.id || uid("k"),
        symbol: String(data.symbol || "").toUpperCase(),
        name: data.name,
        reason: data.reason,
      });
      await saveWatchlist(watchlist);
    },
  });
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    if (file.size > 2_000_000) return reject(new Error("截图不能超过 2 MB"));
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("读取截图失败"));
    reader.readAsDataURL(file);
  });
}

async function uploadProjectShot(projectId, file) {
  const dataUrl = await fileToDataUrl(file);
  const result = await api("/api/project-shot", {
    method: "POST",
    body: JSON.stringify({ projectId, dataUrl }),
  });
  return result.path;
}

function editProject(existing) {
  const projectId = existing?.id || `project-${Date.now().toString(36)}`;
  openEditor({
    title: existing ? "修改项目" : "添加项目",
    html:
      `<div class="field-grid">` +
      field("项目名称", "name", existing?.name, "text", "maxlength=60 required") +
      field("分类标签", "tag", existing?.tag, "text", "maxlength=24 required") +
      `</div>` +
      field("项目介绍", "summary", existing?.summary, "textarea", "maxlength=500 required") +
      field("线上地址", "live", existing?.live, "url", "required") +
      field("GitHub（可留空）", "github", existing?.github, "url") +
      `<div class="field-grid">` +
      selectField("图标", "icon", existing?.icon || "chart", [["chart", "图表"], ["pulse", "脉冲"], ["book", "书本"], ["terminal", "终端"], ["candles", "交易"], ["file", "文件"]]) +
      selectField("色彩", "tint", existing?.tint || "blue", [["blue", "蓝色"], ["green", "绿色"], ["cyan", "青色"], ["violet", "紫色"], ["amber", "琥珀"], ["gold", "金色"], ["rose", "玫红"]]) +
      selectField("状态", "status", existing?.status || "live", [["live", "公开上线"], ["hidden", "暂时隐藏"]]) +
      `</div>` +
      field("现有截图路径", "shot", existing?.shot, "text", "placeholder=assets/shots/example.jpg") +
      `<label class="field upload-field"><span>上传新截图（JPG / PNG / WebP，不超过 2 MB）</span><input type="file" name="shotFile" accept="image/jpeg,image/png,image/webp"></label>`,
    onSubmit: async (data) => {
      let shot = data.shot;
      if (data.shotFile instanceof File && data.shotFile.size) shot = await uploadProjectShot(projectId, data.shotFile);
      const projects = structuredClone(getState().site.projects || []);
      const next = {
        ...(existing || {}), id: projectId, name: data.name, tag: data.tag, summary: data.summary,
        live: data.live, github: data.github, icon: data.icon, tint: data.tint, status: data.status,
        shot, updatedAt: new Date().toISOString(),
      };
      const index = projects.findIndex((item) => item.id === projectId);
      if (index >= 0) projects[index] = next;
      else projects.unshift(next);
      await saveProjects(projects);
    },
  });
}

async function restoreContent(key, source, label) {
  const action = source === "default" ? `恢复仓库里的默认${label}` : `撤销${label}的上一次保存`;
  if (!confirm(`${action}？当前内容会自动留一份历史版本。`)) return;
  await api("/api/restore", { method: "POST", body: JSON.stringify({ key, source }) });
  await refreshContent();
  toast(`${label}已恢复`);
}

function downloadBackup() {
  const state = getState();
  const payload = { exportedAt: new Date().toISOString(), site: state.site, notes: state.notes, watchlist: state.watchlist, now: state.now };
  const blob = new Blob([`${JSON.stringify(payload, null, 2)}\n`], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `chase-hub-backup-${new Date().toISOString().slice(0, 10)}.json`;
  link.click();
  URL.revokeObjectURL(url);
  toast("备份已经下载");
}

function bindAdminPanel() {
  document.getElementById("adminPanelClose")?.addEventListener("click", () => dialog("adminPanelDialog").close());
  document.getElementById("panelAddProjectBtn")?.addEventListener("click", () => { dialog("adminPanelDialog").close(); editProject(null); });
  document.getElementById("panelAddNoteBtn")?.addEventListener("click", () => { dialog("adminPanelDialog").close(); editNote(null); });
  document.getElementById("panelAddSectorBtn")?.addEventListener("click", () => { dialog("adminPanelDialog").close(); editSector(null); });
  document.getElementById("downloadBackupBtn")?.addEventListener("click", downloadBackup);
  document.getElementById("restoreDefaultsBtn")?.addEventListener("click", async () => {
    if (!confirm("恢复默认观点与关注板块？当前线上内容会自动备份。")) return;
    try {
      await api("/api/restore", { method: "POST", body: JSON.stringify({ key: "notes", source: "default" }) });
      await api("/api/restore", { method: "POST", body: JSON.stringify({ key: "watchlist", source: "default" }) });
      await refreshContent();
      toast("默认内容已经恢复");
    } catch (error) {
      toast(error.message || "恢复失败");
    }
  });
  document.getElementById("undoNotesBtn")?.addEventListener("click", () => restoreContent("notes", "latest", "观点").catch((error) => toast(error.message)));
  document.getElementById("undoWatchlistBtn")?.addEventListener("click", () => restoreContent("watchlist", "latest", "关注板块").catch((error) => toast(error.message)));
  document.getElementById("undoProjectsBtn")?.addEventListener("click", () => restoreContent("site", "latest", "项目").catch((error) => toast(error.message)));
  document.getElementById("clearDanmakuBtn")?.addEventListener("click", async () => {
    if (!confirm("清空所有留言？")) return;
    await api("/api/danmaku", { method: "DELETE" });
    toast("留言已清空");
  });
  document.getElementById("logoutBtn")?.addEventListener("click", async () => {
    await api("/api/session", { method: "DELETE" });
    dialog("adminPanelDialog").close();
    setAdmin(false);
    toast("已退出编辑");
  });
}

function bindEditors() {
  document.getElementById("editNowBtn")?.addEventListener("click", editNow);
  document.getElementById("addProjectBtn")?.addEventListener("click", () => editProject(null));
  document.getElementById("addNoteBtn")?.addEventListener("click", () => editNote(null));
  document.getElementById("addSectorBtn")?.addEventListener("click", () => editSector(null));
  document.getElementById("addStockBtn")?.addEventListener("click", () => {
    const first = getState().watchlist.sectors?.[0];
    if (!first) return toast("先加一个板块");
    editStock(first.id, null);
  });

  document.body.addEventListener("click", async (event) => {
    const target = event.target.closest("[data-edit-note], [data-del-note], [data-edit-sector], [data-del-sector], [data-edit-stock], [data-del-stock], [data-edit-project], [data-del-project], [data-move-project]");
    if (!target || !getState().admin) return;
    try {
      if (target.dataset.editNote) editNote(getState().notes.items.find((item) => item.id === target.dataset.editNote));
      else if (target.dataset.delNote) {
        if (confirm("删除这条观点？保存前会自动备份。")) await saveNotes(getState().notes.items.filter((item) => item.id !== target.dataset.delNote));
      } else if (target.dataset.editSector) editSector(getState().watchlist.sectors.find((item) => item.id === target.dataset.editSector));
      else if (target.dataset.delSector) {
        if (!confirm("删除这个板块和下面的个股？保存前会自动备份。")) return;
        const watchlist = structuredClone(getState().watchlist);
        watchlist.sectors = watchlist.sectors.filter((item) => item.id !== target.dataset.delSector);
        await saveWatchlist(watchlist);
      } else if (target.dataset.editStock) {
        const [sectorId, stockId] = target.dataset.editStock.split(":");
        const sector = getState().watchlist.sectors.find((item) => item.id === sectorId);
        editStock(sectorId, sector?.stocks.find((item) => item.id === stockId));
      } else if (target.dataset.delStock) {
        const [sectorId, stockId] = target.dataset.delStock.split(":");
        const watchlist = structuredClone(getState().watchlist);
        const sector = watchlist.sectors.find((item) => item.id === sectorId);
        if (sector) sector.stocks = sector.stocks.filter((item) => item.id !== stockId);
        await saveWatchlist(watchlist);
      } else if (target.dataset.editProject) editProject(getState().site.projects.find((item) => item.id === target.dataset.editProject));
      else if (target.dataset.delProject) {
        if (!confirm("删除这个项目？保存前会自动备份。")) return;
        await saveProjects(getState().site.projects.filter((item) => item.id !== target.dataset.delProject));
      } else if (target.dataset.moveProject) {
        const [projectId, direction] = target.dataset.moveProject.split(":");
        const projects = structuredClone(getState().site.projects);
        const from = projects.findIndex((item) => item.id === projectId);
        const to = Math.max(0, Math.min(projects.length - 1, from + Number(direction)));
        if (from !== to) {
          projects.splice(to, 0, projects.splice(from, 1)[0]);
          await saveProjects(projects);
        }
      }
    } catch (error) {
      toast(error.message || "保存失败");
    }
  });
}

export function initAdmin() {
  const entry = document.getElementById("openAdminBtn");
  if (!entry || entry.dataset.adminReady === "true") return;
  entry.dataset.adminReady = "true";
  bindAvatarUnlock();
  bindLogin();
  bindAdminPanel();
  bindEditors();
}
