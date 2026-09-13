#!/usr/bin/env python3
"""Smoke-test the hub API on a temporary port. Restores data JSON afterwards."""
from __future__ import annotations

import json
import os
import socket
import subprocess
import sys
import time
import urllib.error
import urllib.request
import xml.etree.ElementTree as ET
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
FILES = ["site.json", "notes.json", "watchlist.json", "danmaku.json", "now.json"]


def free_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind(("127.0.0.1", 0))
        return sock.getsockname()[1]


def request(base: str, path: str, method="GET", body=None, headers=None, cookies=None, timeout=5):
    data = None if body is None else json.dumps(body).encode()
    req = urllib.request.Request(base + path, data=data, method=method)
    req.add_header("Content-Type", "application/json")
    for key, value in (headers or {}).items():
        req.add_header(key, value)
    if cookies:
        req.add_header("Cookie", cookies)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as res:
            raw = res.read().decode()
            cookie = res.headers.get("Set-Cookie", "")
            payload = json.loads(raw) if raw else {}
            return res.status, payload, cookie
    except urllib.error.HTTPError as error:
        raw = error.read().decode()
        try:
            payload = json.loads(raw) if raw else {}
        except json.JSONDecodeError:
            payload = {"error": raw}
        return error.code, payload, ""


def fetch_text(base: str, path: str):
    req = urllib.request.Request(base + path, method="GET")
    with urllib.request.urlopen(req, timeout=5) as res:
        return res.status, res.headers.get("Content-Type", ""), res.read().decode()


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        return None


def fetch_raw(base: str, path: str):
    """不跟随重定向、不因 4xx 抛异常，用来断言状态码本身。"""
    opener = urllib.request.build_opener(NoRedirect)
    req = urllib.request.Request(base + path, method="GET")
    try:
        with opener.open(req, timeout=5) as res:
            return res.status, res.headers.get("Location", ""), res.read().decode()
    except urllib.error.HTTPError as error:
        return error.code, error.headers.get("Location", ""), error.read().decode()


def main() -> int:
    backups = {name: (ROOT / "data" / name).read_bytes() for name in FILES}
    port = free_port()
    env = os.environ.copy()
    env["PORT"] = str(port)
    env["HUB_ADMIN_TOKEN"] = "test-token"
    proc = subprocess.Popen(
        [sys.executable.replace("python3", "node") if False else "node", "server.js"],
        cwd=ROOT,
        env=env,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
    )
    base = f"http://127.0.0.1:{port}"
    try:
        for _ in range(40):
            try:
                status, _, _ = request(base, "/api/content")
                if status == 200:
                    break
            except Exception:
                time.sleep(0.05)
        else:
            raise SystemExit("server did not start")

        with urllib.request.urlopen(base + "/", timeout=5) as res:
            html = res.read().decode()
            assert res.status == 200
            assert "Chase Xie" in html
            assert "正在载入" not in html
            assert "application/ld+json" in html
            assert "https://chaestblog.pages.dev/" in html
            assert "chaestblog.is-a.dev" not in html
            assert "WordPaper" in html
            assert "HBM" in html
            assert 'id="adminLoginBtn" type="submit"' in html
            assert 'id="adminCancelBtn" type="button"' in html

        status, ctype, robots = fetch_text(base, "/robots.txt")
        assert status == 200 and "text/plain" in ctype, (status, ctype)
        assert "OAI-SearchBot" in robots and "Sitemap:" in robots

        status, ctype, notes_module = fetch_text(base, "/shared/notes.mjs")
        assert status == 200 and "application/javascript" in ctype, (status, ctype)
        assert "export function noteHref" in notes_module

        status, ctype, sitemap = fetch_text(base, "/sitemap.xml")
        assert status == 200 and "xml" in ctype, (status, ctype)
        assert "https://chaestblog.pages.dev/about/" in sitemap
        assert "https://chaestblog.pages.dev/notes/hbm-supply/" in sitemap

        status, ctype, rss = fetch_text(base, "/rss.xml")
        assert status == 200 and "xml" in ctype, (status, ctype)
        assert "application/rss+xml" in rss and "HBM 比标题先紧" in rss
        assert 'href="/rss.xsl"' in rss

        status, ctype, rss_xsl = fetch_text(base, "/rss.xsl")
        assert status == 200 and "xml" in ctype, (status, ctype)
        assert "打开订阅助手" in rss_xsl and "这就是可订阅的源" in rss_xsl

        status, _, rss_helper = fetch_text(base, "/rss/")
        assert status == 200 and "copyRssBtn" in rss_helper and "rssFeedUrl" in rss_helper

        status, _, about = fetch_text(base, "/about/")
        assert status == 200 and "独立开发者" in about and "shangchaovo" in about
        assert "/assets/icons/rss.svg" in about and "about-projects" in about
        status, _, about_noslash = fetch_text(base, "/about")
        assert status == 200 and "独立开发者" in about_noslash

        status, _, note = fetch_text(base, "/notes/hbm-supply/")
        assert status == 200 and "High Bandwidth Memory" in note
        assert "application/ld+json" in note
        assert "article-page" in note and "application/rss+xml" in note

        status, _, archive = fetch_text(base, "/notes/")
        assert status == 200 and "archive-item" in archive, status
        assert "/notes/hbm-supply/" in archive and "HBM 比标题先紧" in archive

        status, location, _ = fetch_raw(base, "/notes")
        assert status == 301 and location == "/notes/", (status, location)

        status, _, missing = fetch_raw(base, "/notes/does-not-exist/")
        assert status == 404 and "这页不在了" in missing, status

        status, _, notfound = fetch_raw(base, "/nope")
        assert status == 404 and "这页不在了" in notfound, status

        status, content, _ = request(base, "/api/content")
        assert status == 200 and "site" in content and "notes" in content and "watchlist" in content

        status, health, _ = request(base, "/api/health", timeout=20)
        assert status == 200 and isinstance(health.get("checks"), list), (status, health)

        status, hit, _ = request(base, "/api/hit", "POST")
        assert status == 200 and hit["total"] >= 1, (status, hit)

        status, _, _ = request(base, "/api/session", "POST", {"token": "nope"})
        assert status == 403

        status, session, cookie = request(base, "/api/session", "POST", {"token": "test-token"})
        assert status == 200 and session.get("admin") is True
        assert "HubSession=" in cookie
        session_cookie = cookie.split(";", 1)[0]

        status, saved, _ = request(
            base,
            "/api/notes",
            "PUT",
            {"items": [{"id": "n_test", "slug": "hbm-supply", "title": "测试", "body": "仅接口测试", "createdAt": "2026-08-17T00:00:00.000Z"}]},
            cookies=session_cookie,
        )
        assert status == 200 and saved["notes"]["items"][0]["title"] == "测试"
        assert saved["notes"]["items"][0].get("slug") == "hbm-supply"

        status, _, homepage = fetch_text(base, "/")
        assert status == 200 and 'data-id="n_test"' in homepage
        assert 'data-id="n_cmipldxjd4"' not in homepage and 'data-id="n_hbm"' not in homepage
        assert "<!-- hub:note-count:start -->1<!-- hub:note-count:end -->" in homepage

        # 首页反映已保存的内容，手写文章的静态优先行为仍保留。
        status, _, static_note = fetch_text(base, "/notes/hbm-supply/")
        assert status == 200 and "High Bandwidth Memory" in static_note

        status, restored, _ = request(
            base,
            "/api/restore",
            "POST",
            {"key": "notes", "source": "latest"},
            cookies=session_cookie,
        )
        assert status == 200 and restored["data"]["items"][0]["title"] == "CPU和GPU将1:1", (status, restored)

        # 工作台中的长文和无 slug 短记：归档与订阅都能找到，只有长文有独立页面。
        short_body = "无需文章路径也能阅读。" * 20 + "\n完整短记的结尾 & 来源保留。"
        status, published, _ = request(
            base,
            "/api/notes",
            "PUT",
            {"items": [{
                "id": "n_dyn",
                "slug": "dynamic-note",
                "title": "动态渲染的观点",
                "body": "这条只存在于内容接口里。",
                "article": "## 小标题\n\n正文一段，带 **粗体**。\n\n- 第一条\n- 第二条\n",
                "createdAt": "2026-08-30T00:00:00.000Z",
            }, {
                "id": "n_short",
                "title": "短记 & 固定链接",
                "body": short_body,
                "createdAt": "2026-09-05T00:00:00.000Z",
            }]},
            cookies=session_cookie,
        )
        assert status == 200 and published["notes"]["items"][0]["article"].startswith("## 小标题"), status

        status, _, dynamic = fetch_text(base, "/notes/dynamic-note/")
        assert status == 200 and "<h2>小标题</h2>" in dynamic, status
        assert "<strong>粗体</strong>" in dynamic and "<li>第一条</li>" in dynamic
        assert "application/ld+json" in dynamic and "article-page" in dynamic

        status, _, archive_dyn = fetch_text(base, "/notes/")
        assert status == 200 and "共 2 条" in archive_dyn
        assert 'id="note-n_short"' in archive_dyn and 'href="/notes/#note-n_short"' in archive_dyn
        assert "完整短记的结尾 &amp; 来源保留。" in archive_dyn
        assert "短记 &amp; 固定链接" in archive_dyn
        assert "/notes/dynamic-note/" in archive_dyn and "HBM 比标题先紧" not in archive_dyn

        status, _, rss_dyn = fetch_text(base, "/rss.xml")
        assert status == 200 and "/notes/dynamic-note/" in rss_dyn, status
        feed_items = ET.fromstring(rss_dyn).findall("./channel/item")
        assert len(feed_items) == 2
        short_item = next(item for item in feed_items if item.findtext("title") == "短记 & 固定链接")
        assert short_item.findtext("link") == "https://chaestblog.pages.dev/notes/#note-n_short"
        assert short_item.findtext("guid") == short_item.findtext("link")

        status, _, sitemap_dyn = fetch_text(base, "/sitemap.xml")
        assert status == 200 and "/notes/dynamic-note/" in sitemap_dyn, status
        sitemap_urls = [node.text for node in ET.fromstring(sitemap_dyn).iter("{http://www.sitemaps.org/schemas/sitemap/0.9}loc")]
        assert "https://chaestblog.pages.dev/notes/" in sitemap_urls
        assert all("#" not in url and "n_short" not in url for url in sitemap_urls)

        status, _, missing_short_page = fetch_raw(base, "/notes/n_short/")
        assert status == 404 and "这页不在了" in missing_short_page

        status, _, homepage = fetch_text(base, "/")
        assert status == 200 and 'href="/notes/#note-n_short"' in homepage
        assert 'href="/notes/dynamic-note/"' in homepage
        assert "<!-- hub:note-count:start -->2<!-- hub:note-count:end -->" in homepage
        assert "HBM 比标题先紧" not in homepage and 'data-id="n_test"' not in homepage
        with urllib.request.urlopen(urllib.request.Request(base + "/", method="HEAD"), timeout=5) as res:
            assert res.status == 200 and res.read() == b""
            assert "text/html" in res.headers.get("Content-Type", "")
            assert res.headers.get("Cache-Control") == "no-store"

        # 删除全部观点后，首屏不能重新出现仓库中的旧条目，归档和订阅也应为空。
        status, _, _ = request(base, "/api/notes", "PUT", {"items": []}, cookies=session_cookie)
        assert status == 200
        status, _, empty_home = fetch_text(base, "/")
        assert status == 200 and "最近没什么想写的。" in empty_home
        assert "<!-- hub:note-count:start -->0<!-- hub:note-count:end -->" in empty_home
        assert all(title not in empty_home for title in ["HBM 比标题先紧", "CPU和GPU将1:1", "动态渲染的观点", "短记 &amp; 固定链接"])
        status, _, empty_archive = fetch_text(base, "/notes/")
        assert status == 200 and "共 0 条" in empty_archive and "还没有公开的观点" in empty_archive
        status, _, empty_rss = fetch_text(base, "/rss.xml")
        assert status == 200 and ET.fromstring(empty_rss).findall("./channel/item") == []

        status, project_saved, _ = request(
            base,
            "/api/projects",
            "PUT",
            {"projects": [{"id": "test-project", "name": "测试项目", "tag": "测试", "summary": "测试项目管理", "live": "https://example.com/", "status": "live"}]},
            cookies=session_cookie,
        )
        assert status == 200 and project_saved["site"]["projects"][0]["name"] == "测试项目", (status, project_saved)

        status, shot_saved, _ = request(
            base,
            "/api/project-shot",
            "POST",
            {"projectId": "test-project", "dataUrl": "data:image/png;base64,iVBORw0KGgo="},
            cookies=session_cookie,
        )
        assert status == 200 and shot_saved["path"] == "api/project-shot/test-project", (status, shot_saved)

        status, now_saved, _ = request(
            base,
            "/api/now",
            "PUT",
            {"text": "测试最近在做"},
            cookies=session_cookie,
        )
        assert status == 200 and now_saved["now"]["text"] == "测试最近在做", (status, now_saved)

        status, _, _ = request(base, "/api/notes", "PUT", {"items": []})
        assert status == 401

        status, danmaku, _ = request(base, "/api/danmaku", "POST", {"nick": "访客", "text": "好看"})
        assert status == 200 and danmaku["item"]["text"] == "好看", (status, danmaku)

        status, blocked, _ = request(base, "/api/danmaku", "POST", {"text": "https://spam.example"})
        assert status == 400, (status, blocked)

        status, limited, _ = request(base, "/api/danmaku", "POST", {"text": "第二条"})
        assert status == 429, (status, limited)

        print("ok")
        return 0
    finally:
        proc.terminate()
        try:
            proc.wait(timeout=2)
        except subprocess.TimeoutExpired:
            proc.kill()
        for name, blob in backups.items():
            (ROOT / "data" / name).write_bytes(blob)


if __name__ == "__main__":
    raise SystemExit(main())
