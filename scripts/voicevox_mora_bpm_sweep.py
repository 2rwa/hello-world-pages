#!/usr/bin/env python3
import argparse
import copy
import datetime as dt
import json
import math
import os
import subprocess
import tempfile
import time
import urllib.request
from pathlib import Path

SEMITONE_LOG = math.log(2.0) / 12.0

BPMS = [80, 100, 120, 140, 160]
GRIDS = [
    ("loose", 1.5),
    ("eighth", 2.0),
    ("triplet", 3.0),
]
SWINGS = [0.00, 0.08, 0.16, 0.24]
PITCH_PATTERNS = ["natural", "downbeat", "alternate", "rise", "fall", "syncopated"]

def parse_args():
    p = argparse.ArgumentParser()
    p.add_argument("--base-query", required=True)
    p.add_argument("--source-text", required=True)
    p.add_argument("--speaker", required=True, type=int)
    p.add_argument("--style", required=True)
    p.add_argument("--output", required=True)
    return p.parse_args()

def voiced_shift(pattern, i):
    if pattern == "natural":
        return 0.0
    if pattern == "downbeat":
        return 3.0 if i % 4 == 0 else -0.5
    if pattern == "alternate":
        return 2.0 if i % 2 == 0 else -2.0
    if pattern == "rise":
        seq = [-2.5, -1.5, -0.5, 0.5, 1.5, 2.5, 3.5, 2.5]
        return seq[i % len(seq)]
    if pattern == "fall":
        seq = [3.5, 2.5, 1.5, 0.5, -0.5, -1.5, -2.5, -1.5]
        return seq[i % len(seq)]
    if pattern == "syncopated":
        seq = [0.0, 3.0, -1.0, 1.5, -2.0, 2.5]
        return seq[i % len(seq)]
    raise ValueError(pattern)

def retime_query(base, bpm, grid_divisor, swing, pitch_pattern):
    q = copy.deepcopy(base)
    beat = 60.0 / bpm
    mora_target = beat / grid_divisor
    mora_index = 0

    for phrase in q["accent_phrases"]:
        for mora in phrase["moras"]:
            factor = (1.0 + swing) if (mora_index % 2) else (1.0 - swing)
            target = mora_target * factor

            c = mora.get("consonant_length")
            v = mora.get("vowel_length") or 0.0
            if c is None:
                mora["vowel_length"] = max(0.035, target)
            else:
                base_total = max(0.001, c + v)
                consonant_ratio = min(0.55, max(0.18, c / base_total))
                new_c = max(0.018, target * consonant_ratio)
                new_v = max(0.035, target - new_c)
                mora["consonant_length"] = new_c
                mora["vowel_length"] = new_v

            if (mora.get("pitch") or 0.0) > 0.0:
                mora["pitch"] = max(
                    3.0,
                    min(8.5, mora["pitch"] + voiced_shift(pitch_pattern, mora_index) * SEMITONE_LOG),
                )
            mora_index += 1

        if phrase.get("pause_mora"):
            phrase["pause_mora"]["vowel_length"] = max(0.05, mora_target)

    q["speedScale"] = 1.0
    q["pitchScale"] = 0.0
    q["intonationScale"] = 1.0
    q["prePhonemeLength"] = min(0.12, mora_target * 0.5)
    q["postPhonemeLength"] = min(0.12, mora_target * 0.5)
    q["pauseLength"] = None
    q["pauseLengthScale"] = 1.0
    q["outputSamplingRate"] = 24000
    q["outputStereo"] = False
    return q, mora_index, mora_target

def synthesize(query, speaker, wav_path):
    body = json.dumps(query, ensure_ascii=False).encode("utf-8")
    req = urllib.request.Request(
        f"http://127.0.0.1:50021/synthesis?speaker={speaker}",
        data=body,
        method="POST",
        headers={"Content-Type": "application/json"},
    )
    with urllib.request.urlopen(req, timeout=120) as res:
        wav_path.write_bytes(res.read())

def encode_mp3(wav_path, mp3_path):
    subprocess.run(
        [
            "ffmpeg", "-hide_banner", "-loglevel", "error", "-y",
            "-i", str(wav_path),
            "-codec:a", "libmp3lame",
            "-q:a", "5",
            "-ar", "24000",
            "-ac", "1",
            str(mp3_path),
        ],
        check=True,
    )

def probe(mp3_path):
    out = subprocess.check_output(
        [
            "ffprobe", "-v", "error",
            "-show_entries", "format=duration,bit_rate,size",
            "-of", "json",
            str(mp3_path),
        ],
        text=True,
    )
    data = json.loads(out)["format"]
    return {
        "duration_seconds": round(float(data["duration"]), 3),
        "bit_rate": int(data.get("bit_rate", 0) or 0),
        "size_bytes": int(data.get("size", mp3_path.stat().st_size)),
    }

def main():
    args = parse_args()
    started = time.monotonic()
    started_iso = dt.datetime.now(dt.timezone.utc).isoformat()
    base = json.loads(Path(args.base_query).read_text(encoding="utf-8"))
    source = Path(args.source_text).read_text(encoding="utf-8").strip()
    out_root = Path(args.output)
    mp3_root = out_root / "mp3"
    mp3_root.mkdir(parents=True, exist_ok=True)

    entries = []
    failures = []
    expected = len(BPMS) * len(GRIDS) * len(SWINGS) * len(PITCH_PATTERNS)
    n = 0

    with tempfile.TemporaryDirectory() as td:
        td = Path(td)
        wav = td / "tmp.wav"

        for bpm in BPMS:
            for grid_name, grid_divisor in GRIDS:
                for swing in SWINGS:
                    for pitch_pattern in PITCH_PATTERNS:
                        n += 1
                        key = f"b{bpm:03d}_{grid_name}_s{int(round(swing*100)):02d}_{pitch_pattern}"
                        mp3_path = mp3_root / f"{key}.mp3"
                        t0 = time.monotonic()
                        try:
                            query, mora_count, target = retime_query(
                                base, bpm, grid_divisor, swing, pitch_pattern
                            )
                            synthesize(query, args.speaker, wav)
                            encode_mp3(wav, mp3_path)
                            info = probe(mp3_path)
                            assert info["duration_seconds"] > 0.5
                            assert info["size_bytes"] > 1000
                            entries.append({
                                "id": key,
                                "file": f"mp3/{mp3_path.name}",
                                "bpm": bpm,
                                "grid": grid_name,
                                "moras_per_beat": grid_divisor,
                                "target_mora_seconds": round(target, 5),
                                "swing": swing,
                                "pitch_pattern": pitch_pattern,
                                "mora_count": mora_count,
                                **info,
                                "generation_seconds": round(time.monotonic() - t0, 3),
                            })
                        except Exception as e:
                            failures.append({
                                "id": key,
                                "bpm": bpm,
                                "grid": grid_name,
                                "swing": swing,
                                "pitch_pattern": pitch_pattern,
                                "error": repr(e),
                            })
                            if mp3_path.exists():
                                mp3_path.unlink()

                        if n % 20 == 0 or n == expected:
                            elapsed = time.monotonic() - started
                            print(
                                f"[{n}/{expected}] success={len(entries)} "
                                f"failure={len(failures)} elapsed={elapsed:.1f}s",
                                flush=True,
                            )

    elapsed = round(time.monotonic() - started, 3)
    total_bytes = sum((mp3_root / Path(e["file"]).name).stat().st_size for e in entries)
    manifest = {
        "title": "Zundamon mora BPM parameter sweep",
        "credit": "VOICEVOX:ずんだもん",
        "source_text": source,
        "speaker": "ずんだもん",
        "style": args.style,
        "speaker_id": args.speaker,
        "started_at_utc": started_iso,
        "completed_at_utc": dt.datetime.now(dt.timezone.utc).isoformat(),
        "parameter_space": {
            "bpm": BPMS,
            "grid": [{"name": n, "moras_per_beat": d} for n, d in GRIDS],
            "swing": SWINGS,
            "pitch_patterns": PITCH_PATTERNS,
        },
        "summary": {
            "expected": expected,
            "success": len(entries),
            "failure": len(failures),
            "elapsed_seconds": elapsed,
            "total_mp3_bytes": total_bytes,
        },
        "variants": entries,
        "failures": failures,
    }
    (out_root / "manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )

    summary = [
        "# ずんだもん モーラBPM sweep",
        "",
        f"- credit: VOICEVOX:ずんだもん",
        f"- source: {source}",
        f"- expected: {expected}",
        f"- success: {len(entries)}",
        f"- failure: {len(failures)}",
        f"- elapsed: {elapsed} sec",
        f"- MP3 total: {total_bytes} bytes",
        "",
        "## Parameter space",
        "",
        f"- BPM: {', '.join(map(str, BPMS))}",
        f"- grids: {', '.join(n for n, _ in GRIDS)}",
        f"- swing: {', '.join(str(x) for x in SWINGS)}",
        f"- pitch patterns: {', '.join(PITCH_PATTERNS)}",
        "",
    ]
    (out_root / "summary.md").write_text("\n".join(summary), encoding="utf-8")

    print(json.dumps(manifest["summary"], ensure_ascii=False, indent=2))
    if len(entries) < math.ceil(expected * 0.90):
        raise SystemExit(f"Too many failures: {len(failures)}/{expected}")

if __name__ == "__main__":
    main()
