#!/usr/bin/env python3
import argparse
import json
import os
import resource
import shutil
import time
import wave
from pathlib import Path

import numpy as np
import torch
from transformers import AutoProcessor, MusicgenForConditionalGeneration

MODEL_ID = "facebook/musicgen-small"
PROMPT = (
    "Japanese funk hip-hop instrumental groove at 104 BPM, "
    "syncopated dry drums, electric bass, sparse chord stabs, "
    "clear rhythmic accents, no vocals"
)

def write_wav(path: Path, audio: np.ndarray, sample_rate: int) -> None:
    audio = np.asarray(audio, dtype=np.float32)
    peak = float(np.max(np.abs(audio))) if audio.size else 0.0
    if peak > 0.99:
        audio = audio * (0.99 / peak)
    pcm = np.int16(np.clip(audio, -1.0, 1.0) * 32767)
    with wave.open(str(path), "wb") as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(sample_rate)
        wf.writeframes(pcm.tobytes())

def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--seconds", type=int, required=True)
    ap.add_argument("--output-dir", required=True)
    ap.add_argument("--seed", type=int, default=20261002)
    args = ap.parse_args()

    out = Path(args.output_dir)
    out.mkdir(parents=True, exist_ok=True)
    result_path = out / f"result_{args.seconds}.json"
    wav_path = out / f"musicgen_{args.seconds}s.wav"

    started = time.perf_counter()
    result = {
        "status": "error",
        "model": MODEL_ID,
        "prompt": PROMPT,
        "requested_seconds": args.seconds,
        "seed": args.seed,
    }

    try:
        torch.manual_seed(args.seed)
        torch.set_num_threads(max(1, min(4, os.cpu_count() or 1)))

        processor = AutoProcessor.from_pretrained(MODEL_ID)
        model = MusicgenForConditionalGeneration.from_pretrained(MODEL_ID)
        model.eval()
        model.to("cpu")

        frame_rate = float(getattr(model.config.audio_encoder, "frame_rate", 50))
        sample_rate = int(model.config.audio_encoder.sampling_rate)
        max_tokens = min(1500, max(1, int(round(args.seconds * frame_rate))))

        inputs = processor(text=[PROMPT], padding=True, return_tensors="pt")
        gen_started = time.perf_counter()
        with torch.inference_mode():
            audio_values = model.generate(
                **inputs,
                do_sample=True,
                guidance_scale=3.0,
                max_new_tokens=max_tokens,
            )
        generate_seconds = time.perf_counter() - gen_started

        audio = audio_values[0, 0].detach().cpu().float().numpy()
        write_wav(wav_path, audio, sample_rate)
        actual_seconds = len(audio) / sample_rate

        peak_rss_mb = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss / 1024.0
        disk = shutil.disk_usage(out)

        result.update({
            "status": "success",
            "max_new_tokens": max_tokens,
            "frame_rate": frame_rate,
            "sample_rate": sample_rate,
            "actual_seconds": round(actual_seconds, 3),
            "generate_wall_seconds": round(generate_seconds, 3),
            "total_wall_seconds": round(time.perf_counter() - started, 3),
            "realtime_factor": round(generate_seconds / max(actual_seconds, 1e-9), 3),
            "peak_rss_mb": round(peak_rss_mb, 1),
            "wav_bytes": wav_path.stat().st_size,
            "wav_file": wav_path.name,
            "disk_free_gb_after": round(disk.free / (1024**3), 2),
        })
        return_code = 0
    except Exception as exc:
        result.update({
            "status": "error",
            "error_type": type(exc).__name__,
            "error": str(exc),
            "total_wall_seconds": round(time.perf_counter() - started, 3),
            "peak_rss_mb": round(resource.getrusage(resource.RUSAGE_SELF).ru_maxrss / 1024.0, 1),
        })
        return_code = 1

    result_path.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return return_code

if __name__ == "__main__":
    raise SystemExit(main())
