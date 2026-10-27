"""Real headless WebGPU regression test using Chrome CDP and a GPU readback."""
import json
import os
import shutil
import subprocess
import sys
import time
import urllib.request
import websocket

ROOT=os.path.abspath(os.path.join(os.path.dirname(__file__),".."))
BROWSER=shutil.which("google-chrome") or shutil.which("chromium")
if not BROWSER:
    raise RuntimeError("No Chrome/Chromium available on the runner")
print("browser:",subprocess.check_output([BROWSER,"--version"],text=True).strip(),flush=True)
server=subprocess.Popen([sys.executable,"-m","http.server","8123","--bind","127.0.0.1"],cwd=ROOT,stdout=subprocess.DEVNULL,stderr=subprocess.STDOUT)
flags=[
    BROWSER,"--headless=new","--no-sandbox","--disable-dev-shm-usage",
    "--no-first-run","--disable-background-networking",
    "--remote-debugging-port=9222","--remote-allow-origins=*",
    "--user-data-dir=/tmp/gaussian-spectral-ocean-chrome",
    "--enable-unsafe-webgpu","--enable-features=Vulkan",
    "--use-vulkan=swiftshader","--disable-vulkan-fallback-to-gl-for-testing",
    "--use-webgpu-adapter=swiftshader","--enable-webgpu-developer-features",
    "--enable-dawn-features=allow_unsafe_apis","--disable-dawn-features=use_dxc",
    "--use-gpu-in-tests","--enable-unsafe-swiftshader",
    "about:blank",
]
logfile=open("/tmp/gaussian-spectral-ocean-chrome.log","w+")
browser=subprocess.Popen(flags,stdout=logfile,stderr=subprocess.STDOUT)
try:
    deadline=time.time()+35
    while True:
        try:
            pages=json.load(urllib.request.urlopen("http://127.0.0.1:9222/json",timeout=1))
            page=next(p for p in pages if p.get("type")=="page")
            break
        except Exception:
            if time.time()>deadline:raise TimeoutError("Chrome CDP did not start")
            time.sleep(.2)
    ws=websocket.create_connection(page["webSocketDebuggerUrl"],timeout=8)
    serial=0
    def command(method,parameters=None):
        global serial
        serial+=1
        ws.send(json.dumps({"id":serial,"method":method,"params":parameters or {}}))
        while True:
            message=json.loads(ws.recv())
            if message.get("id")==serial:return message
    command("Runtime.enable")
    target="http://127.0.0.1:8123/gaussian-spectral-ocean/?ci=1"
    print("navigating:",target,flush=True)
    command("Page.navigate",{"url":target})
    deadline=time.time()+180
    last=""
    while time.time()<deadline:
        answer=command("Runtime.evaluate",{"expression":"document.getElementById('ci-state')?.textContent || document.readyState","returnByValue":True})
        value=answer.get("result",{}).get("result",{}).get("value","")
        if value!=last:print("stage:",value,flush=True);last=value
        if value.startswith("ok:"):
            print("GAUSSIAN_SPECTRAL_OCEAN_OK",value,flush=True)
            break
        if value.startswith("error:"):raise RuntimeError(value)
        if browser.poll() is not None:raise RuntimeError("Browser exited early")
        time.sleep(.5)
    else:
        raise TimeoutError("CI timed out in stage: "+last)
    ws.close()
finally:
    server.terminate()
    browser.terminate()
    try:browser.wait(timeout=3)
    except subprocess.TimeoutExpired:browser.kill()
    logfile.flush();logfile.seek(0)
    log=logfile.read()
    if log:print("Chrome stderr last 5000 chars:\n"+log[-5000:],flush=True)
    logfile.close()
