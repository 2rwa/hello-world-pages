# Linux FTP Lab — real Linux kernel in the browser

Uses the v86 WebAssembly x86 emulator and an actual Buildroot Linux kernel. This is not a mock terminal and not a syscall-only Linux emulation layer.

## Guest flow

1. Boot real Linux; inspect uname -a, /proc/version, and ps.
2. Mount writable 9p shared filesystem in guest under /mnt/share.
3. Edit index.html in the browser and stage it into the guest share.
4. Start a BusyBox ftpd server via tcpsvd, bound to GUEST loopback 127.0.0.1:2121.
5. Use guest ftpput to upload index.html over real guest TCP to /srv/www.
6. Start guest httpd on 127.0.0.1:8080 and capture actual guest HTTP GET using wget into /mnt/share/preview.html.
7. Read HTTP output through the v86 9p API and display it inside a sandboxed iframe.

The browser does not directly forward guest HTTP/TCP. HTTP preview shows the response fetched by the Linux guest.

Unverified requirement: The upstream v86 Buildroot image may not contain all BusyBox applets (tcpsvd, ftpd, ftpput, httpd). If absent, commands genuinely fail, and we must create a custom guest image. The first commit is a proof-of-concept, not a verified full FTP end-to-end release.

## Host on le00

Run these from the linux-ftp-lab folder:

    bash scripts/prepare-assets.sh
    python3 -m http.server 8765 --bind 0.0.0.0

Open http://le00:8765/ on LAN, if name resolution works. The repo includes a push-triggered GitHub Actions workflow that installs the app and downloads v86 assets onto le00-runner under the runner user's home directory, no sudo or nginx changes.

The GitHub Pages test URL is https://2rwa.github.io/hello-world-pages/linux-ftp-lab/ and uses upstream URLs if vendor assets are not present, potentially limited by CORS.

## Safety

FTP and HTTP are loopback-only within the guest. Browser HTTP preview has iframe sandbox without script privileges. The host only serves static files; input commands do not execute on le00. LAN-bound port 8765 is unauthenticated: do not forward it to public internet without access control. Vendor dependencies must be pinned and audited for production.
