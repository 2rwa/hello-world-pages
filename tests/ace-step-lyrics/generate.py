#!/usr/bin/env python3
import argparse
import html
import json
import os
import resource
import time
from pathlib import Path

from acestep.handler import AceStepHandler
from acestep.llm_inference import LLMHandler
from acestep.inference import GenerationParams, GenerationConfig, generate_music

DURATION = 20
BPM = 104
SEED = 20261002

CASES = [
    {
        "id": "english",
        "title": "English lyrics control",
        "language": "en",
        "caption": "Dry funk hip-hop groove, male rap-singing vocal starts immediately at 0 seconds, no intro, clear diction, sparse bass and drums",
        "lyrics": "[Verse]\nI walk through the city with the beat in my feet\nEvery word hits hard and every rhythm feels complete\nKeep moving forward while the night is shining bright\nSay it from the first beat, no intro, start tonight",
    },
    {
        "id": "japanese",
        "title": "Japanese lyrics test",
        "language": "ja",
        "caption": "Dry funk hip-hop groove, Japanese male rap-singing vocal starts immediately at 0 seconds, no intro, clear diction, sparse bass and drums",
        "lyrics": "[Verse]\nあいのことばを ビートにのせて\nきょうもまちを あるいてく\nつよいことばと よわいことばを\nリズムのなかで つないでく",
    },
]

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--output-dir", required=True)
    args = ap.parse_args()
    out = Path(args.output_dir)
    out.mkdir(parents=True, exist_ok=True)

    project_root = Path.cwd()
    dit = AceStepHandler()
    llm = LLMHandler()

    t0 = time.perf_counter()
    init_status, enable_generate = dit.initialize_service(
        project_root=str(project_root),
        config_path="acestep-v15-turbo",
        device="cpu",
        use_flash_attention=False,
        compile_model=False,
        offload_to_cpu=False,
        offload_dit_to_cpu=False,
        prefer_source="huggingface",
    )
    init_seconds = time.perf_counter() - t0

    if not enable_generate:
        raise RuntimeError(f"DiT init failed: {init_status}")

    results = []
    for i, case in enumerate(CASES):
        case_dir = out / case["id"]
        case_dir.mkdir(exist_ok=True)
        params = GenerationParams(
            task_type="text2music",
            caption=case["caption"],
            lyrics=case["lyrics"],
            instrumental=False,
            vocal_language=case["language"],
            bpm=BPM,
            timesignature="4",
            duration=DURATION,
            inference_steps=8,
            seed=SEED + i,
            thinking=False,
            use_cot_metas=False,
            use_cot_caption=False,
            use_cot_lyrics=False,
            use_cot_language=False,
        )
        config = GenerationConfig(
            batch_size=1,
            audio_format="wav",
        )

        started = time.perf_counter()
        result = generate_music(dit, llm, params, config, save_dir=str(case_dir))
        wall = time.perf_counter() - started

        entry = {
            **case,
            "duration": DURATION,
            "bpm": BPM,
            "wall_seconds": round(wall, 3),
            "success": bool(result.success),
        }
        if result.success:
            paths = []
            for audio in result.audios:
                p = Path(audio["path"])
                try:
                    rel = p.relative_to(out)
                except Exception:
                    rel = Path(case["id"]) / p.name
                paths.append(str(rel))
            entry["audio_files"] = paths
        else:
            entry["error"] = str(result.error)
        results.append(entry)

    meta = {
        "model": "ACE-Step 1.5 / acestep-v15-turbo",
        "device": "cpu",
        "llm_enabled": False,
        "duration_per_case": DURATION,
        "bpm": BPM,
        "model_init_seconds": round(init_seconds, 3),
        "peak_rss_mb": round(resource.getrusage(resource.RUSAGE_SELF).ru_maxrss / 1024.0, 1),
        "cases": results,
    }
    (out / "results.json").write_text(json.dumps(meta, ensure_ascii=False, indent=2)+"\n", encoding="utf-8")

    cards=[]
    for r in results:
        audios = "".join(
            f'<audio controls preload="metadata" src="{html.escape(p)}"></audio>'
            for p in r.get("audio_files", [])
        )
        cards.append(f"""<section>
<h2>{html.escape(r['title'])}</h2>
<p><b>language:</b> {html.escape(r['language'])} / <b>20s / 104 BPM / no intro</b></p>
<pre>{html.escape(r['lyrics'])}</pre>
{audios if audios else '<p class="ng">generation failed</p>'}
<p>{html.escape(str(r.get('error','')))}</p>
<p class="meta">wall: {r['wall_seconds']}s</p>
</section>""")

    page=f"""<!doctype html><html lang="ja"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>ACE-Step lyrics CPU test</title>
<style>
body{{font-family:system-ui,sans-serif;max-width:900px;margin:auto;padding:24px;background:#0d1117;color:#e6edf3}}
section{{border:1px solid #30363d;background:#161b22;padding:18px;border-radius:14px;margin:16px 0}}
audio{{width:100%;margin:.5rem 0}}pre{{white-space:pre-wrap;background:#0d1117;padding:12px;border-radius:8px}}
.meta{{color:#8b949e}}.ng{{color:#ff7b72}}
</style></head><body>
<h1>ACE-Step 1.5: English vs Japanese lyrics</h1>
<p>CPU-only / DiT direct lyric conditioning / 20 seconds / vocals requested from beat 1.</p>
{''.join(cards)}
<pre>{html.escape(json.dumps(meta,ensure_ascii=False,indent=2))}</pre>
</body></html>"""
    (out / "index.html").write_text(page, encoding="utf-8")

if __name__ == "__main__":
    main()
