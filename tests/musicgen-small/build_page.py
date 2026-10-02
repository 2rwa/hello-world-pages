#!/usr/bin/env python3
import html
import json
import sys
from pathlib import Path

def fmt(v, suffix=""):
    if v is None:
        return "—"
    return f"{v}{suffix}"

def main() -> None:
    out = Path(sys.argv[1] if len(sys.argv) > 1 else "musicgen-small-test")
    rows = []
    cards = []

    for seconds in (5, 10, 20, 30):
        p = out / f"result_{seconds}.json"
        if p.exists():
            d = json.loads(p.read_text(encoding="utf-8"))
        else:
            d = {"requested_seconds": seconds, "status": "missing"}

        status = html.escape(str(d.get("status", "missing")))
        ok = d.get("status") == "success"
        rows.append(
            "<tr>"
            f"<td>{seconds}s</td>"
            f"<td class='{ 'ok' if ok else 'ng' }'>{status}</td>"
            f"<td>{fmt(d.get('actual_seconds'), ' s')}</td>"
            f"<td>{fmt(d.get('generate_wall_seconds'), ' s')}</td>"
            f"<td>{fmt(d.get('realtime_factor'), '×')}</td>"
            f"<td>{fmt(d.get('peak_rss_mb'), ' MB')}</td>"
            f"<td>{fmt(round(d.get('wav_bytes', 0)/1024) if d.get('wav_bytes') else None, ' KiB')}</td>"
            "</tr>"
        )
        wav = d.get("wav_file")
        if ok and wav and (out / wav).exists():
            cards.append(
                f"<section><h2>{seconds} 秒要求</h2>"
                f"<audio controls preload='metadata' src='{html.escape(wav)}'></audio>"
                f"<pre>{html.escape(json.dumps(d, ensure_ascii=False, indent=2))}</pre></section>"
            )
        else:
            cards.append(
                f"<section><h2>{seconds} 秒要求</h2>"
                f"<p class='ng'>生成できませんでした: {status}</p>"
                f"<pre>{html.escape(json.dumps(d, ensure_ascii=False, indent=2))}</pre></section>"
            )

    page = f"""<!doctype html>
<html lang="ja"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>MusicGen small CPU length test</title>
<style>
body{{font-family:system-ui,sans-serif;max-width:1100px;margin:auto;padding:24px;background:#0c1015;color:#edf2f7}}
a{{color:#8fd8ff}} table{{width:100%;border-collapse:collapse;margin:1rem 0 2rem}}
th,td{{padding:.65rem;border-bottom:1px solid #2a3440;text-align:right}}th:first-child,td:first-child{{text-align:left}}
section{{background:#141b23;border:1px solid #2b3540;border-radius:14px;padding:16px;margin:14px 0}}
audio{{width:100%}} pre{{white-space:pre-wrap;overflow:auto;background:#090c10;padding:12px;border-radius:8px}}
.ok{{color:#80e6a3}} .ng{{color:#ff9b9b}} .muted{{color:#9aabba}}
</style></head><body>
<h1>MusicGen-small / GitHub Actions CPU length test</h1>
<p class="muted">facebook/musicgen-small を GitHub-hosted ubuntu runner の CPU だけで生成。各ケースは最大25分で打ち切り。</p>
<table><thead><tr><th>要求長</th><th>状態</th><th>実WAV長</th><th>生成時間</th><th>実時間比</th><th>Peak RSS</th><th>WAV</th></tr></thead>
<tbody>{''.join(rows)}</tbody></table>
{''.join(cards)}
</body></html>"""
    (out / "index.html").write_text(page, encoding="utf-8")

    summary = {
        "model": "facebook/musicgen-small",
        "cases": [json.loads((out / f"result_{s}.json").read_text(encoding="utf-8")) for s in (5,10,20,30) if (out / f"result_{s}.json").exists()]
    }
    (out / "results.json").write_text(json.dumps(summary, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

if __name__ == "__main__":
    main()
