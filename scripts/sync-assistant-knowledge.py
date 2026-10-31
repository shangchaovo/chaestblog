#!/usr/bin/env python3
"""Refresh the assistant's public page excerpts. No credentials or private sources.

python3 scripts/sync-assistant-knowledge.py --proxy http://127.0.0.1:1082
The current /api/content directory remains authoritative at answer time.
"""
import argparse
import concurrent.futures
import datetime
import html.parser
import ipaddress
import json
import re
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def public_url(value):
    url = urllib.parse.urlparse(value or "")
    if url.scheme not in ("http", "https") or not url.hostname or url.username or url.password:
        return False
    if "." not in url.hostname or url.hostname.endswith((".local", ".internal")):
        return False
    try:
        return ipaddress.ip_address(url.hostname).is_global
    except ValueError:
        return True


class PageText(html.parser.HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.skip = 0
        self.parts = []

    def handle_starttag(self, tag, attrs):
        if tag in ("script", "style", "svg", "nav", "footer", "noscript"):
            self.skip += 1
        if not self.skip and tag in ("p", "div", "h1", "h2", "h3", "li", "section", "br"):
            self.parts.append("\n")

    def handle_endtag(self, tag):
        if tag in ("script", "style", "svg", "nav", "footer", "noscript"):
            self.skip = max(0, self.skip - 1)
        if not self.skip and tag in ("p", "div", "h1", "h2", "h3", "li", "section"):
            self.parts.append("\n")

    def handle_data(self, value):
        if not self.skip:
            self.parts.append(value)

    def text(self):
        return "\n".join(line for line in (re.sub(r"\s+", " ", line).strip() for line in "".join(self.parts).splitlines()) if line)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--origin", default="https://chaestblog.pages.dev")
    parser.add_argument("--proxy")
    args = parser.parse_args()
    if not public_url(args.origin):
        raise SystemExit("Use a public site origin")
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({"http": args.proxy, "https": args.proxy} if args.proxy else {}))

    def fetch(url, accept="text/html"):
        request = urllib.request.Request(url, headers={"User-Agent": "chaestblog-public-guide/1.0", "Accept": accept})
        with opener.open(request, timeout=18) as response:
            if not public_url(response.url):
                raise ValueError("Non-public redirect")
            raw = response.read(1_000_001)
            if len(raw) > 1_000_000:
                raise ValueError("Page exceeds the public excerpt limit")
            return raw.decode("utf-8", errors="replace"), response.url

    content = json.loads(fetch(args.origin.rstrip("/") + "/api/content", "application/json")[0])
    tasks = []
    for project in content.get("site", {}).get("projects", []):
        if project.get("status") != "live":
            continue
        url = project.get("live") or ""
        if public_url(url):
            tasks.append({"projectId": project["id"], "title": project["name"], "url": url, "fetchUrl": url})
        github = project.get("github") or ""
        match = re.fullmatch(r"https://github\.com/([\w.-]+)/([\w.-]+)/?", github)
        if match and project.get("githubPublic") is not False and "fork" not in project.get("tag", "").lower():
            # Anonymous GitHub API cannot return a private README.
            tasks.append({"projectId": project["id"], "title": project["name"] + " · README", "url": github, "fetchUrl": f"https://api.github.com/repos/{match[1]}/{match[2]}/readme", "markdown": True})
    for note in content.get("notes", {}).get("items", []):
        if not note.get("slug") or note.get("article"):
            continue
        url = "/notes/" + urllib.parse.quote(note["slug"], safe="") + "/"
        tasks.append({"noteId": note["id"], "title": note["title"], "url": url, "fetchUrl": args.origin.rstrip("/") + url})

    stamp = datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds")

    def excerpt(task):
        try:
            raw, final_url = fetch(task["fetchUrl"], "application/vnd.github.raw+json" if task.get("markdown") else "text/html")
            if task.get("markdown"):
                text = re.sub(r"<!--[\s\S]*?-->", "", raw)
                text = re.sub(r"!\[[^\]]*\]\([^)]*\)", "", text)
            else:
                page = PageText()
                page.feed(raw)
                text = page.text()
            if len(text.strip()) < 80:
                raise ValueError("No useful public text")
            record = {k: v for k, v in task.items() if k not in ("fetchUrl", "markdown")}
            record.update({"text": text.strip()[:7000], "fetchedAt": stamp})
            print(f"OK  {task['title']} ({len(record['text'])} characters)", flush=True)
            return record
        except Exception as error:
            print(f"SKIP {task['title']}: {type(error).__name__}", flush=True)
            return None

    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
        sources = [record for record in pool.map(excerpt, tasks) if record]
    if not sources:
        raise SystemExit("No public pages refreshed; previous knowledge file retained")
    output = {"updatedAt": stamp, "description": "Public page excerpts only. Current KV directory controls visibility and links.", "sources": sources}
    destination = ROOT / "data/assistant.json"
    temporary = destination.with_suffix(".json.tmp")
    temporary.write_text(json.dumps(output, ensure_ascii=False, indent=2) + "\n")
    temporary.replace(destination)
    print(f"Saved {len(sources)} public excerpts to data/assistant.json")


if __name__ == "__main__":
    main()
