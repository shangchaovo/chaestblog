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

        status, restored, _ = request(
            base,
            "/api/restore",
            "POST",
            {"key": "notes", "source": "latest"},
            cookies=session_cookie,
        )
        assert status == 200 and restored["data"]["items"][0]["title"] == "CPU和GPU将1:1", (status, restored)

        # 只靠工作台发一篇长文：没有静态 HTML 也要有独立页面、进 RSS 和 sitemap
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
            }]},
            cookies=session_cookie,
        )
        assert status == 200 and published["notes"]["items"][0]["article"].startswith("## 小标题"), status

        status, _, dynamic = fetch_text(base, "/notes/dynamic-note/")
        assert status == 200 and "<h2>小标题</h2>" in dynamic, status
        assert "<strong>粗体</strong>" in dynamic and "<li>第一条</li>" in dynamic
        assert "application/ld+json" in dynamic and "article-page" in dynamic

        status, _, rss_dyn = fetch_text(base, "/rss.xml")
        assert status == 200 and "/notes/dynamic-note/" in rss_dyn, status

        status, _, sitemap_dyn = fetch_text(base, "/sitemap.xml")
        assert status == 200 and "/notes/dynamic-note/" in sitemap_dyn, status

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
