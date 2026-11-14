from playwright.sync_api import sync_playwright
from PIL import Image
from pathlib import Path
import base64, json, io, zipfile
out=Path(__file__).parent/'test-output'
out.mkdir(exist_ok=True)
flags=['--enable-unsafe-webgpu','--enable-features=Vulkan','--use-vulkan=swiftshader','--disable-vulkan-fallback-to-gl-for-testing','--use-webgpu-adapter=swiftshader','--enable-webgpu-developer-features','--enable-dawn-features=allow_unsafe_apis','--disable-dawn-features=use_dxc','--use-gpu-in-tests','--enable-unsafe-swiftshader','--no-sandbox']
with sync_playwright() as p:
    browser=p.chromium.launch(executable_path='/usr/bin/google-chrome',args=flags)
    page=browser.new_page()
    page.on('console',lambda m:print('browser:',m.type,m.text))
    page.on('pageerror',lambda e:print('pageerror:',e))
    page.goto('http://127.0.0.1:8000/ocular-stickers/?ci')
    page.wait_for_function("['ok','error'].includes(document.querySelector('#status').dataset.state)",timeout=120000)
    print(page.locator('#status').inner_text())
    assert page.locator('#status').get_attribute('data-state')=='ok'
    page.locator('#preview').screenshot(path=str(out/'preview.png'))
    results=[]
    assert page.locator('#choices button').count()==16
    page.locator('#choices button').nth(8).click()
    assert page.locator('#choices button').nth(8).get_attribute('aria-pressed')=='true'
    # Tear slider is per-sticker, changes the actual GPU silhouette and resets.
    page.locator('#choices button').nth(10).click()
    assert page.locator('#tearPreset').inner_text()=='1.73×'
    page.locator('#tearAmount').fill('75')
    assert page.locator('#tearValue').inner_text()=='75%'
    low=page.evaluate('''async ()=>{const s=ocularSticker;await s.render(10,0);const a=s.eyeCanvas.getContext('2d').getImageData(0,0,270,270).data;let n=0;for(let j=3;j<a.length;j+=4)n+=a[j]>0;return [s.motion(10,0).tear,n]}''')
    page.locator('#tearAmount').fill('125')
    high=page.evaluate('''async ()=>{const s=ocularSticker;await s.render(10,0);const a=s.eyeCanvas.getContext('2d').getImageData(0,0,270,270).data;let n=0;for(let j=3;j<a.length;j+=4)n+=a[j]>0;return [s.motion(10,0).tear,n]}''')
    assert high[0]>low[0] and high[1]!=low[1],(low,high)
    page.locator('#choices button').nth(8).click()
    assert page.locator('#tearAmount').input_value()=='100'
    page.locator('#choices button').nth(10).click()
    assert page.locator('#tearAmount').input_value()=='125'
    page.locator('#tearReset').click()
    assert page.locator('#tearAmount').input_value()=='100'
    assert page.evaluate('''()=>{const s=ocularSticker;return s.motion(10,0).tear>s.motion(13,0).tear&&s.motion(11,0).tear>s.motion(14,0).tear}''')
    # Validate analytic framing of every frame at both slider extremes.
    assert page.evaluate('''()=>{const s=ocularSticker;for(let i=0;i<16;i++){for(const v of [75,100,125]){s.tearAmounts[i]=v;const d=s.cameraDistance(i);for(let k=0;k<20;k++){const [x0,y0,x1,y1]=s.projectedBounds(s.motion(i,k),d);if(x0<12||y0<62||x1>258||y1>258)return false;}}s.tearAmounts[i]=100;}return true}''')
    page.locator('#choices button').nth(8).click()
    # CI has no animation loop; render explicitly using the production compositor.
    overlay=page.evaluate('''async ()=>{const s=ocularSticker; const m=await s.render(8,5);const c=document.querySelector('#preview');const ctx=c.getContext('2d');const e=document.querySelector('#effects');e.checked=true;s.composite(8,m);const a=ctx.getImageData(0,0,270,270).data;e.checked=false;s.composite(8,m);const b=ctx.getImageData(0,0,270,270).data;e.checked=true;s.composite(8,m);let n=0;for(let i=0;i<a.length;i+=4)if(a[i]!==b[i]||a[i+1]!==b[i+1]||a[i+2]!==b[i+2]||a[i+3]!==b[i+3])n++;return n}''')
    assert overlay>100,overlay
    page.locator('#preview').screenshot(path=str(out/'morning.png'))
    for i in range(16):
        encoded=page.evaluate("""async i=>{const b=await ocularSticker.make(i);let s='';for(let j=0;j<b.length;j+=8192)s+=String.fromCharCode(...b.subarray(j,j+8192));return btoa(s)}""",i)
        b=base64.b64decode(encoded)
        (out/f'{i+1:02}.png').write_bytes(b)
        im=Image.open(io.BytesIO(b))
        assert im.size==(270,270) and im.n_frames==20 and im.info['loop']==2
        assert len(b)<=1000000
        total=0
        for k in range(im.n_frames):
            im.seek(k)
            total+=im.info['duration']
            a=im.convert('RGBA').getchannel('A')
            assert a.getextrema()==(0,255)
            x0,y0,x1,y1=a.getbbox()
            assert min(x0,y0,270-x1,270-y1)>=1,(i,k,a.getbbox())
        assert total==2000,total
        results.append({'file':f'{i+1:02}.png','bytes':len(b),'frames':im.n_frames,'duration_ms':total})
    # Exercise the actual ZIP button, including main and tab assets.
    page.set_default_timeout(600000)
    with page.expect_download(timeout=600000) as dl:
        page.locator('#font').select_option('mac')
        page.locator('#all').click()
    dl.value.save_as(str(out/'ocular-stickers-16.zip'))
    with zipfile.ZipFile(out/'ocular-stickers-16.zip') as z:
        assert set(z.namelist())=={f'{i:02}.png' for i in range(1,17)}|{'main.png','tab.png'}
        for name,size in [('main.png',(240,240)),('tab.png',(96,74))]:
            im=Image.open(io.BytesIO(z.read(name)))
            assert im.size==size and len(z.read(name))<=1000000
            assert im.n_frames==(20 if name=='main.png' else 1)
    (out/'report.json').write_text(json.dumps({'overlay_changed_pixels':overlay,'tear_slider_low':low,'tear_slider_high':high,'stickers':results},indent=2))
    browser.close()
