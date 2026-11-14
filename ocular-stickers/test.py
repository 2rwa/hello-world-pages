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
    for i in range(8):
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
    (out/'report.json').write_text(json.dumps(results,indent=2))
    browser.close()
