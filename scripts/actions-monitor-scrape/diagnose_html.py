#!/usr/bin/env python3
from __future__ import annotations

import html as html_lib
import json
import re
import urllib.request
from pathlib import Path

OWNER = "2rwa"
ROOT = Path(__file__).resolve().parents[2]
SEEDS = ROOT / "scripts/actions-monitor-scrape/repos.txt"
OUT = ROOT / "diagnostics/actions-monitor-html"
UA = "2rwa-actions-monitor-diagnostics/0.1"
TIMEOUT = 25
RUNS_PER_REPO = 6

RUN_HREF = re.compile(r'href=["\']/{owner}/{repo}/actions/runs/(\d+)(?:[^"\']*)["\']', re.I)
ATTR = re.compile(r'(aria-label|title|class|data-[a-z0-9_-]+)=["\']([^"\']+)["\']', re.I)
TOKENS = (
    "success", "successful", "failure", "failed", "cancel", "queued",
    "waiting", "pending", "in progress", "in_progress", "running",
    "skipped", "timed out", "timed_out", "conclusion", "status",
    "octicon", "check-circle", "x-circle", "stop", "dot-fill"
)

def fetch(url: str) -> str:
    req = urllib.request.Request(url, headers={
        "User-Agent": UA,
        "Accept": "text/html,application/xhtml+xml",
        "Accept-Language": "en-US,en;q=0.9",
    })
    with urllib.request.urlopen(req, timeout=TIMEOUT) as r:
        return r.read().decode("utf-8", "replace")

def seeds() -> list[str]:
    result = []
    for line in SEEDS.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if line and not line.startswith("#"):
            result.append(line)
    return result

def unique_run_ids(doc: str, repo: str) -> list[str]:
    p = re.compile(RUN_HREF.pattern.format(owner=re.escape(OWNER), repo=re.escape(repo)), re.I)
    out, seen = [], set()
    for m in p.finditer(doc):
        rid = m.group(1)
        if rid not in seen:
            seen.add(rid)
            out.append(rid)
        if len(out) >= RUNS_PER_REPO:
            break
    return out

def around(doc: str, repo: str, run_id: str, radius: int = 3500) -> str:
    p = re.compile(
        rf'href=["\']/{re.escape(OWNER)}/{re.escape(repo)}/actions/runs/{re.escape(run_id)}(?:[^"\']*)["\']',
        re.I,
    )
    m = p.search(doc)
    if not m:
        return ""
    return doc[max(0, m.start() - radius): min(len(doc), m.end() + radius)]

def compact_text(s: str) -> str:
    s = re.sub(r"<[^>]+>", " ", s)
    s = html_lib.unescape(s)
    return re.sub(r"\s+", " ", s).strip()

def signals(fragment: str) -> list[str]:
    vals = []
    for name, value in ATTR.findall(fragment):
        low = html_lib.unescape(value).lower()
        if any(t in low for t in TOKENS):
            vals.append(f"{name}={html_lib.unescape(value)}")
    visible = compact_text(fragment).lower()
    words = sorted({t for t in TOKENS if t in visible})
    vals.extend("text:" + x for x in words)
    # de-dup preserving order
    return list(dict.fromkeys(vals))[:80]

def title_from_page(doc: str) -> str | None:
    m = re.search(r"<title>(.*?)</title>", doc, re.I | re.S)
    return compact_text(m.group(1)) if m else None

def main() -> int:
    OUT.mkdir(parents=True, exist_ok=True)
    summary = {"owner": OWNER, "repositories": [], "errors": []}

    for repo in seeds():
        repo_dir = OUT / repo
        repo_dir.mkdir(parents=True, exist_ok=True)
        list_url = f"https://github.com/{OWNER}/{repo}/actions"
        try:
            list_html = fetch(list_url)
        except Exception as exc:
            summary["errors"].append(f"{repo} list: {type(exc).__name__}: {exc}")
            continue

        (repo_dir / "actions.html").write_text(list_html, encoding="utf-8")
        ids = unique_run_ids(list_html, repo)
        repo_result = {"name": repo, "runs": []}

        for rid in ids:
            snip = around(list_html, repo, rid)
            (repo_dir / f"{rid}-list-snippet.html").write_text(snip, encoding="utf-8")
            detail_url = f"https://github.com/{OWNER}/{repo}/actions/runs/{rid}"
            detail_html = ""
            err = None
            try:
                detail_html = fetch(detail_url)
                (repo_dir / f"{rid}-detail.html").write_text(detail_html, encoding="utf-8")
            except Exception as exc:
                err = f"{type(exc).__name__}: {exc}"

            run_result = {
                "id": int(rid),
                "detail_url": detail_url,
                "list_signals": signals(snip),
                "list_text": compact_text(snip)[:1200],
                "detail_title": title_from_page(detail_html) if detail_html else None,
                "detail_signals": signals(detail_html) if detail_html else [],
                "detail_text": compact_text(detail_html)[:1800] if detail_html else "",
                "error": err,
            }
            repo_result["runs"].append(run_result)
        summary["repositories"].append(repo_result)

    (OUT / "summary.json").write_text(
        json.dumps(summary, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )

    lines = ["# GitHub Actions HTML diagnostics", ""]
    for repo in summary["repositories"]:
        lines.append(f"## {repo['name']}")
        for run in repo["runs"]:
            lines.append(f"### run {run['id']}")
            lines.append(f"- detail title: {run['detail_title']}")
            lines.append("- list signals:")
            for x in run["list_signals"][:20]:
                lines.append(f"  - {x}")
            lines.append("- detail signals:")
            for x in run["detail_signals"][:30]:
                lines.append(f"  - {x}")
            lines.append("")
    if summary["errors"]:
        lines.append("## Errors")
        lines.extend(f"- {e}" for e in summary["errors"])
    (OUT / "summary.md").write_text("\n".join(lines) + "\n", encoding="utf-8")
    print("\n".join(lines))
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
