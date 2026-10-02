#!/usr/bin/env python3
import argparse
import json
from pathlib import Path

def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--seconds", type=int, required=True)
    ap.add_argument("--exit-code", type=int, required=True)
    ap.add_argument("--elapsed", type=float, required=True)
    ap.add_argument("--output-dir", required=True)
    args = ap.parse_args()

    status = "timeout" if args.exit_code in (124, 137, 143) else "process_error"
    out = Path(args.output_dir)
    out.mkdir(parents=True, exist_ok=True)
    data = {
        "status": status,
        "model": "facebook/musicgen-small",
        "requested_seconds": args.seconds,
        "process_exit_code": args.exit_code,
        "total_wall_seconds": args.elapsed,
    }
    p = out / f"result_{args.seconds}.json"
    p.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(data, ensure_ascii=False, indent=2))

if __name__ == "__main__":
    main()
