# Linux FTP Lab: real Linux kernel in browser

A working interactive educational experiment: **real Linux kernel 6.8.12 inside an x86 v86 emulated computer in the visitor's browser**, complete with serial console and real guest TCP networking.

## What is real?

- v86 emulates the x86 CPU/hardware and boots a real kernel. Verify via uname -a, /proc/version and /proc/net/tcp in the console.
- The stock v86 Buildroot image does not include FTP applets. A static i686-musl BusyBox 1.35.0 binary is delivered to the guest via v86's 9p host9p filesystem and copied into /tmp.
- BusyBox ifconfig brings guest lo/127.0.0.1 up.
- A genuine guest FTP server (tcpsvd + ftpd -A -w) listens on guest 127.0.0.1:2121, accepting anonymous writes ONLY inside the browser VM.
- BusyBox ftpput sends index.html using guest TCP and FTP protocol into /srv/www/index.html.
- Guest httpd listens on 127.0.0.1:8080 and serves that file. Guest wget fetches the HTTP response into /mnt/preview.html.
- JS reads the guest 9p response and displays it using sandboxed iframe. There is **no browser TCP-to-guest direct connection**.
- Everything other than serving static assets runs in the visitor's browser, not on le00.

## CI proof

The real Chromium CI run https://github.com/2rwa/hello-world-pages/actions/runs/40908322575 logged both REAL_LINUX_SHELL_READY and FTP_HTTP_END_TO_END_OK. It verified uname -a and the exact HTML string in the guest's HTTP response.

## Public test

https://2rwa.github.io/hello-world-pages/linux-ftp-lab/

The central GitHub Pages deployment pipeline downloads v86, the Buildroot kernel, the BusyBox binary and its corresponding source code/configuration into linux-ftp-lab/vendor before publishing, so the browser can run without depending on cross-origin upstream scripts.

## le00 LAN hosting

The project has a push-triggered workflow (.github/workflows/linux-ftp-lab-le00.yml) for [self-hosted, Linux, X64, le00-runner]. It downloads assets, installs a static-only HTTP application into the runner user's home under ~/.local/share/browser-linux-ftp-lab, and tries to start port 8765 via user-scope systemd, with a detached HTTP fallback. No sudo or system nginx changes.

Manual setup from linux-ftp-lab directory:

    bash scripts/prepare-assets.sh
    python3 -m http.server 8765 --bind 0.0.0.0

Open http://le00:8765/ if DNS is configured for le00.

**Runner installation is not verified** as of the CI success; the le00-install jobs were queued rather than assigned to a runner. A successful GitHub browser CI test proves functionality but does NOT prove le00 has installed the app.

## Licensing and security

- v86 is BSD-2-Clause; https://github.com/copy/v86
- BusyBox is GPLv2; corresponding 1.35.0 source tarball and binary configuration are shipped next to the binary (vendor/busybox-1.35.0.tar.bz2 and vendor/busybox-i386.config). The binary comes from the BusyBox project's official static build directory.
- Guest ftpd -A -w is anonymous and writable, but only binds to 127.0.0.1 **inside the guest virtual machine**, never to le00's host network.
- Guest HTTP binds to guest loopback. The iframe has sandbox="" (no active scripts or same-origin).
- Don't store secrets in an ephemeral browser guest; the static LAN service on le00:8765 must not be Internet-exposed without authorization.
- Pin checksums before long-term or production operation; initial bootstrap currently downloads third-party artifacts from upstream on CI.
