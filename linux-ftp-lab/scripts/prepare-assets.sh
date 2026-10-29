#!/usr/bin/env bash
set -euo pipefail
here="$(cd "$(dirname "$0")/.." && pwd)"
dest="$here/vendor"
mkdir -p "$dest"
get() {
  local url="$1" name="$2" min="$3" size
  curl -fSL --retry 3 --connect-timeout 15 --max-time 180 "$url" -o "$dest/$name.part"
  size=$(wc -c < "$dest/$name.part")
  if (( size < min )); then echo "$name too small: $size" >&2; exit 1; fi
  mv "$dest/$name.part" "$dest/$name"
}
get https://copy.sh/v86/build/libv86.js libv86.js 50000
get https://copy.sh/v86/build/v86.wasm v86.wasm 200000
get https://copy.sh/v86/bios/seabios.bin seabios.bin 10000
get https://copy.sh/v86/bios/vgabios.bin vgabios.bin 10000
get https://i.copy.sh/buildroot-bzimage68.bin buildroot-bzimage68.bin 200000
get https://busybox.net/downloads/binaries/1.35.0-i686-linux-musl/busybox busybox-i386 300000
chmod +x "$dest/busybox-i386"
for cmd in ftpd ftpput tcpsvd httpd wget; do "$dest/busybox-i386" --list | grep -qx "$cmd"; done
(cd "$dest" && sha256sum libv86.js v86.wasm seabios.bin vgabios.bin buildroot-bzimage68.bin busybox-i386 > SHA256SUMS)
echo "Ready: $dest"
