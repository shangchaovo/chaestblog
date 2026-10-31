#!/usr/bin/env python3
"""Browser acceptance checks against a running local server (mocked AI, no model calls).

python3 scripts/test-assistant-ui.py --base http://127.0.0.1:8777
Requires the developer's Python Playwright and Chrome / Playwright Chromium.
"""
import argparse
import json
from pathlib import Path
from playwright.sync_api import sync_playwright, expect


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base", default="http://127.0.0.1:8777")
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True, **({"channel": "chrome"} if Path("/Applications/Google Chrome.app").exists() else {}))
        page = browser.new_page(viewport={"width": 1440, "height": 1000})
        errors, requests, held = [], [], []
        mode = {"value": "ok"}
        page.on("pageerror", lambda error: errors.append(str(error)))

        def respond(route):
            requests.append(route.request.post_data_json)
            if mode["value"] == "hold":
                held.append(route)
                return
            if mode["value"] == "error":
                route.fulfill(status=503, content_type="application/json", body=json.dumps({"error": "助理暂时不可用，稍后重试"}))
                return
            events = [
                {"type": "sources", "sources": [{"id": 3, "title": "公开项目页面", "url": "/#sites", "kind": "项目"}]},
                {"type": "delta", "text": "**公开项目介绍** [3]\n<img src=x onerror=alert(1)>"},
                {"type": "done"},
            ]
            route.fulfill(content_type="application/x-ndjson; charset=utf-8", body="".join(json.dumps(e, ensure_ascii=False) + "\n" for e in events))

        page.route("**/api/assistant", respond)
        page.goto(args.base)
        page.wait_for_load_state("networkidle")
        expect(page.locator("#assistantLauncher")).to_be_visible()
        page.locator("#assistantLauncher").click()
        expect(page.locator("#assistantDialog")).to_be_visible()
        page.locator("#assistantDialog").evaluate("el => Promise.all(el.getAnimations().map(a => a.finished))")
        if args.output:
            args.output.mkdir(parents=True, exist_ok=True)
            page.screenshot(path=str(args.output / "assistant-desktop.png"))
        page.locator("[data-assistant-question]").first.click()
        expect(page.locator(".assistant-source")).to_have_count(1)
        assert "第一次来" in requests[-1]["messages"][-1]["content"]
        assert page.locator(".assistant-answer img").count() == 0
        assert "<img" in page.locator(".assistant-answer").inner_text()
        page.locator("#assistantInput").fill("继续介绍")
        page.locator("#assistantInput").press("Enter")
        expect(page.locator(".assistant-source")).to_have_count(2)
        assert [m["role"] for m in requests[-1]["messages"]] == ["user", "assistant", "user"]
        page.locator("#assistantInput").fill("换行")
        page.locator("#assistantInput").press("Shift+Enter")
        assert page.locator("#assistantInput").input_value().endswith("\n")
        before = len(requests)
        page.locator("#assistantInput").evaluate("el => el.dispatchEvent(new KeyboardEvent('keydown', {key:'Enter', isComposing:true, bubbles:true}))")
        assert len(requests) == before
        page.locator("#assistantClose").click()
        page.locator("#assistantLauncher").click()
        expect(page.locator(".assistant-message-user")).to_have_count(2)
        page.locator("#assistantReset").click()
        expect(page.locator("#assistantWelcome")).to_be_visible()
        assert page.locator("#assistantInput").input_value() == ""
        mode["value"] = "error"
        page.locator("[data-assistant-question]").first.click()
        expect(page.locator(".assistant-message-note")).to_contain_text("暂时不可用")
        mode["value"] = "ok"
        page.get_by_role("button", name="重新提问 ↗").click()
        expect(page.locator(".assistant-source")).to_have_count(1)
        expect(page.locator(".assistant-message-user")).to_have_count(1)
        assert len(requests[-1]["messages"]) == 1
        page.locator("#assistantReset").click()
        mode["value"] = "hold"
        page.locator("[data-assistant-question]").first.click()
        expect(page.locator("#assistantSend")).to_have_attribute("aria-label", "停止生成")
        page.locator("#assistantSend").click()
        expect(page.locator(".assistant-message-note")).to_have_text("已停止生成")
        page.locator("#assistantInput").press("Escape")
        expect(page.locator("#assistantDialog")).not_to_be_visible()
        expect(page.locator("#assistantLauncher")).to_be_focused()
        for route in held:
            try:
                route.abort()
            except Exception:
                pass
        for theme in ("liquid", "eye", "ink"):
            page.evaluate("theme => localStorage.setItem('hubTheme', theme)", theme)
            page.reload()
            page.wait_for_load_state("networkidle")
            page.locator("#assistantLauncher").click()
            expect(page.locator("#assistantDialog")).to_be_visible()
            assert page.evaluate("document.documentElement.scrollWidth <= innerWidth")
            if args.output and theme == "ink":
                page.locator("#assistantDialog").evaluate("el => Promise.all(el.getAnimations().map(a => a.finished))")
                page.screenshot(path=str(args.output / "assistant-dark.png"))
            page.locator("#assistantClose").click()
        for width, height in ((390, 844), (320, 568)):
            mobile = browser.new_page(viewport={"width": width, "height": height}, is_mobile=True, has_touch=True, reduced_motion="reduce")
            mobile.goto(args.base)
            mobile.wait_for_load_state("networkidle")
            mobile.locator("#assistantLauncher").click()
            box = mobile.locator("#assistantDialog").bounding_box()
            assert box["x"] >= 0 and box["x"] + box["width"] <= width
            assert box["y"] >= 0 and box["y"] + box["height"] <= height
            assert mobile.evaluate("document.documentElement.scrollWidth <= innerWidth")
            assert mobile.locator("#assistantDialog").evaluate("el => getComputedStyle(el).animationName") == "none"
            if args.output and width == 390:
                mobile.screenshot(path=str(args.output / "assistant-mobile.png"))
            mobile.close()
        for path in ("/about/", "/notes/", "/rss/", "/notes/hbm-supply/", "/does-not-exist/"):
            page.goto(args.base + path)
            page.wait_for_load_state("networkidle")
            page.locator("#assistantLauncher").click()
            expect(page.locator("#assistantDialog")).to_be_visible()
        assert not errors, errors
        browser.close()
    print("Assistant UI passed: safe citations, follow-ups, IME/newlines, retry, stop, reset, focus/Escape, three themes, small screens and all page types.")


if __name__ == "__main__":
    main()
