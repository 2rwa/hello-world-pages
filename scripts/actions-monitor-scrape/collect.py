#!/usr/bin/env python3
"""Deliberately small/brittle public GitHub Actions HTML scraper.

No GitHub REST API and no secrets. If GitHub changes its HTML, fix this parser.
On per-repository failure, previous good data is retained when possible.
"""
from __future__ import annotations

import html as html_lib
import json
import re
import sys
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

OWNER = "2rwa"
ROOT = Path(__file__).resolve().parents[2]
SEEDS = ROOT / "scripts/actions-monitor-scrape/repos.txt"
OUTPUT = ROOT / "tests/actions-monitor-scrape/actions-status.json"
EXCLUDE = {"hello-world-pages"}
DISCOVERY_PAGES = 4
RUNS_PER_REPO = 4
TIMEOUT = 25
UA = "2rwa-actions-monitor-scrape/0.1 (+public GitHub HTML monitor)"

RUN_RE_TEMPLATE = r'href=["\']/{owner}/{repo}/actions/runs/(\d+)(?:[^"\']*)["\']'
TAG_RE = re.compile(r"<[^>]+>")
SPACE_RE = re.compile(r"\s+")

def utc_now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")

def fetch(url: str) -> str:
    req = urllib.request.Request(url, headers={
        "User-Agent": UA,
        "Accept": "text/html,application/xhtml+xml",
        "Accept-Language": "en-US,en;q=0.9,ja;q=0.7",
    })
    with urllib.request.urlopen(req, timeout=TIMEOUT) as response:
        return response.read().decode("utf-8", "replace")

def plain(fragment: str) -> str:
    return SPACE_RE.sub(" ", html_lib.unescape(TAG_RE.sub(" ", fragment))).strip()

def load_seeds() -> set[str]:
    result = set()
    if not SEEDS.exists():
        return result
    for line in SEEDS.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if line and not line.startswith("#") and re.fullmatch(r"[A-Za-z0-9_.-]+", line):
            result.add(line)
    return result

def discover_repos():
    repos = load_seeds()
    errors = []
    owner_escaped = re.escape(OWNER)
    patterns = [
        re.compile(rf'<a[^>]*itemprop=["\']name codeRepository["\'][^>]*href=["\']/{owner_escaped}/([^"\'/?#]+)'),
        re.compile(rf'<a[^>]*href=["\']/{owner_escaped}/([^"\'/?#]+)["\'][^>]*itemprop=["\']name codeRepository["\']'),
    ]
    for page in range(1, DISCOVERY_PAGES + 1):
        url = f"https://github.com/{OWNER}?tab=repositories&type=source&sort=updated&page={page}"
        try:
            doc = fetch(url)
        except Exception as exc:
            errors.append(f"repo discovery page {page}: {type(exc).__name__}: {exc}")
            break
        found = set()
        for pattern in patterns:
            found.update(pattern.findall(doc))
        repos.update(found)
        if not found:
            break
    repos.difference_update(EXCLUDE)
    return repos, errors

def status_from_label(label: str):
    low = html_lib.unescape(label or "").strip().lower()
    if low.startswith("completed successfully:"):
        return "completed", "success"
    if low.startswith(("failed:", "completed with failure:")):
        return "completed", "failure"
    if low.startswith(("cancelled:", "canceled:")):
        return "completed", "cancelled"
    if low.startswith("skipped:"):
        return "completed", "skipped"
    if low.startswith(("in progress:", "in_progress:", "running:")):
        return "in_progress", None
    if low.startswith(("queued:", "waiting:", "pending:", "requested:")):
        return "queued", None
    return "unknown", None

def extract_row(doc: str, match) -> str:
    start = doc.rfind('<div class="Box-row', 0, match.start())
    if start < 0:
        start = max(0, match.start() - 2000)
    end = doc.find('<div class="Box-row', match.end())
    if end < 0:
        end = min(len(doc), match.end() + 6000)
    return doc[start:end]

def extract_anchor(row: str, run_id: str, repo: str):
    pattern = re.compile(
        rf"<a\\b([^>]*)href=['\"]/{re.escape(OWNER)}/{re.escape(repo)}/actions/runs/{re.escape(run_id)}[^'\"]*['\"]([^>]*)>(.*?)</a>",
        re.I | re.S,
    )
    m = pattern.search(row)
    if not m:
        return "", f"Run {run_id}"
    attrs = m.group(1) + " " + m.group(2)
    label_match = re.search(r"aria-label=['\"]([^'\"]+)['\"]", attrs, re.I)
    label = html_lib.unescape(label_match.group(1)).strip() if label_match else ""
    title = plain(m.group(3))
    if not title or len(title) > 180:
        title = f"Run {run_id}"
    return label, title

def extract_time(row: str):
    values = re.findall(r"<relative-time[^>]+datetime=['\"]([^'\"]+)", row, re.I)
    return values[0] if values else None

def extract_branch(row: str, repo: str):
    patterns = [
        rf"/{re.escape(OWNER)}/{re.escape(repo)}/tree/([^'\"?#<]+)",
        r"refs/heads/([A-Za-z0-9_./-]+)",
    ]
    for pattern in patterns:
        m = re.search(pattern, row)
        if m:
            value = html_lib.unescape(urllib.parse.unquote(m.group(1))).strip("/")
            if value.startswith("refs/heads/"):
                value = value[len("refs/heads/"):]
            return value
    return None

def scrape_repo(repo: str) -> dict:
    url = f"https://github.com/{OWNER}/{repo}/actions"
    doc = fetch(url)
    run_re = re.compile(RUN_RE_TEMPLATE.format(owner=re.escape(OWNER), repo=re.escape(repo)), re.I)
    matches = list(run_re.finditer(doc))
    seen = set()
    runs = []
    for match in matches:
        run_id = match.group(1)
        if run_id in seen:
            continue
        seen.add(run_id)
        row = extract_row(doc, match)
        status_label, title = extract_anchor(row, run_id, repo)
        status, conclusion = status_from_label(status_label)
        runs.append({
            "id": int(run_id),
            "title": title,
            "status": status,
            "conclusion": conclusion,
            "status_label": status_label,
            "branch": extract_branch(row, repo),
            "time": extract_time(row),
            "url": f"https://github.com/{OWNER}/{repo}/actions/runs/{run_id}",
        })
        if len(runs) >= RUNS_PER_REPO:
            break
    return {
        "name": repo,
        "url": f"https://github.com/{OWNER}/{repo}",
        "actions_url": url,
        "runs": runs,
    }

def stable_payload(payload: dict) -> dict:
    copy = dict(payload)
    copy.pop("updated_at", None)
    return copy

def main() -> int:
    previous = {}
    if OUTPUT.exists():
        try:
            previous = json.loads(OUTPUT.read_text(encoding="utf-8"))
        except Exception:
            previous = {}
    previous_by_name = {
        r.get("name"): r for r in previous.get("repositories", [])
        if isinstance(r, dict) and r.get("name")
    }
    repos, errors = discover_repos()
    collected = []
    for repo in sorted(repos, key=str.lower):
        try:
            collected.append(scrape_repo(repo))
            print(f"OK {repo}")
        except Exception as exc:
            msg = f"{repo}: {type(exc).__name__}: {exc}"
            print(f"WARN {msg}", file=sys.stderr)
            errors.append(msg)
            old = previous_by_name.get(repo)
            if old:
                kept = dict(old)
                kept["stale"] = True
                collected.append(kept)

    payload = {
        "version": 1,
        "owner": OWNER,
        "source": "github-html-scrape",
        "repositories": collected,
        "errors": errors,
    }

    if previous and stable_payload(previous) == stable_payload(payload):
        print("No state change; JSON left untouched.")
        return 0

    payload["updated_at"] = utc_now()
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Updated {OUTPUT}")
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
