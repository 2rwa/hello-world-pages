#!/usr/bin/env python3
import argparse
import html
import json
import resource
import time
import wave
from pathlib import Path

import numpy as np
import torch
from transformers import AutoProcessor, MusicgenForConditionalGeneration

MODEL_ID = "facebook/musicgen-small"
SECONDS = 10
SEED = 20261002

CASES = [
    {
        "id": "jp-instrumental",
        "title": "① 日本語プロンプト：伴奏のみ",
        "prompt": "104 BPMの日本語ラップ向けファンク・ヒップホップ。乾いたドラム、シンコペーションしたベース、短いコードスタブ。強いアクセントと弱拍の圧縮感。ボーカルなし。",
        "goal": "日本語の自然言語指示だけで音楽的内容を理解できるか"
    },
    {
        "id": "jp-vocal",
        "title": "② 日本語プロンプト：日本語ラップ要求",
        "prompt": "104 BPMの日本語ラップ。男性ボーカルが『あいのことばを びーとにのせて きょうもまちをあるいてく』と日本語ではっきりラップする。乾いたドラムとベース。歌ではなくリズミカルなラップ。",
        "goal": "日本語ボーカルや日本語らしい発音が出るか"
    },
    {
        "id": "en-vocal",
        "title": "③ 英語プロンプト：同じ日本語ラップ要求",
        "prompt": "104 BPM Japanese rap with a male vocalist clearly rapping the exact Japanese phrase 'あいのことばを びーとにのせて きょうもまちをあるいてく'. Dry drums and bass, rhythmic spoken rap rather than singing.",
        "goal": "日本語指示そのものではなく、英語指示なら日本語ボーカルを誘導できるか"
    },
]

def write_wav(path: Path, audio: np.ndarray, sample_rate: int):
    audio = np.asarray(audio, dtype=np.float32)
    if audio.ndim != 1:
        audio = audio.reshape(-1)
    peak = float(np.max(np.abs(audio))) if audio.size else 0.0
    if peak > 0.99:
        audio *= 0.99 / peak
    pcm = np.int16(np.clip(audio, -1, 1) * 32767)
    with wave.open(str(path), "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(sample_rate)
        wf.writeframes(pcm.tobytes())

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--output-dir", required=True)
    args = ap.parse_args()
    out = Path(args.output_dir)
    out.mkdir(parents=True, exist_ok=True)

    torch.manual_seed(SEED)
    torch.set_num_threads(4)

    t0 = time.perf_counter()
    processor = AutoProcessor.from_pretrained(MODEL_ID)
    model = MusicgenForConditionalGeneration.from_pretrained(MODEL_ID)
    model.eval().to("cpu")
    load_seconds = time.perf_counter() - t0

    frame_rate = float(getattr(model.config.audio_encoder, "frame_rate", 50))
    sample_rate = int(model.config.audio_encoder.sampling_rate)
    max_tokens = min(1500, int(round(SECONDS * frame_rate)))

    results = []
    for i, case in enumerate(CASES):
        torch.manual_seed(SEED + i)
        inputs = processor(text=[case["prompt"]], padding=True, return_tensors="pt")
        started = time.perf_counter()
        with torch.inference_mode():
            audio_values = model.generate(
                **inputs,
                do_sample=True,
                guidance_scale=3.0,
                max_new_tokens=max_tokens,
            )
        gen_s = time.perf_counter() - started
        audio = audio_values[0, 0].detach().cpu().float().numpy()
        wav = f"{case['id']}.wav"
        write_wav(out / wav, audio, sample_rate)
        actual = len(audio) / sample_rate
        results.append({
            **case,
            "status": "success",
            "wav": wav,
            "requested_seconds": SECONDS,
            "actual_seconds": round(actual, 3),
            "generate_wall_seconds": round(gen_s, 3),
            "realtime_factor": round(gen_s / max(actual, 1e-9), 3),
            "wav_bytes": (out / wav).stat().st_size,
        })

    meta = {
        "model": MODEL_ID,
        "seed_base": SEED,
        "model_load_seconds": round(load_seconds, 3),
        "sample_rate": sample_rate,
        "frame_rate": frame_rate,
        "peak_rss_mb": round(resource.getrusage(resource.RUSAGE_SELF).ru_maxrss / 1024.0, 1),
        "cases": results,
    }
    (out / "results.json").write_text(json.dumps(meta, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    cards = []
    for r in results:
        cards.append(f"""
<section>
  <h2>{html.escape(r['title'])}</h2>
  <p><strong>目的:</strong> {html.escape(r['goal'])}</p>
  <p class="prompt">{html.escape(r['prompt'])}</p>
  <audio controls preload="metadata" src="{html.escape(r['wav'])}"></audio>
  <p class="meta">実WAV {r['actual_seconds']}秒 / 生成 {r['generate_wall_seconds']}秒 / RTF {r['realtime_factor']}×</p>
</section>""")

    page = f"""<!doctype html>
<html lang="ja"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>MusicGen Japanese test</title>
<style>
body{{font-family:system-ui,sans-serif;max-width:1000px;margin:auto;padding:24px;background:#0c1015;color:#eef3f7}}
section{{background:#151c24;border:1px solid #2c3743;border-radius:15px;padding:18px;margin:16px 0}}
audio{{width:100%}} .prompt{{white-space:pre-wrap;background:#0a0e12;padding:12px;border-radius:9px;line-height:1.6}}
.meta{{color:#9fb0bd}} code{{color:#9ee1ff}}
</style></head><body>
<h1>MusicGen-small 日本語テスト</h1>
<p><code>facebook/musicgen-small</code> / CPU / 10秒 × 3条件。まず日本語プロンプト理解と日本語ボーカル生成の可否だけを見る。</p>
{''.join(cards)}
<pre>{html.escape(json.dumps(meta, ensure_ascii=False, indent=2))}</pre>
</body></html>"""
    (out / "index.html").write_text(page, encoding="utf-8")

if __name__ == "__main__":
    main()
