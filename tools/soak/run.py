import asyncio, json, sys
from playwright.async_api import async_playwright
OUT='/tmp/claude-0/-home-claude/eac79df6-aa0e-58d8-9215-5cffc0d0f101/scratchpad/soak/'
async def main():
    seed = sys.argv[2] if len(sys.argv)>2 else 'echo-lag'
    async with async_playwright() as p:
        b=await p.chromium.launch(args=['--use-gl=swiftshader','--enable-webgl','--ignore-gpu-blocklist'])
        ctx=await b.new_context(viewport={'width':1200,'height':800})
        await ctx.add_init_script("localStorage.setItem('echo.settings', JSON.stringify({hideHelp:true, tutorialDone:true, quality:'low'})); window._errs=[]; window._stage='boot'; const ce=console.error; console.error=function(...a){ try{ window._errs.push(window._stage+' :: '+a.map(x=>x&&x.stack?x.stack:String(x)).join(' ').slice(0,700)); }catch(e){} return ce.apply(console,a); }; window.addEventListener('error', e=>window._errs.push(window._stage+' :: UNCAUGHT '+(e.error&&e.error.stack||e.message).slice(0,700)));")
        pg=await ctx.new_page(); errs=[]
        pg.on('pageerror', lambda e: errs.append('PAGEERROR '+str(e)[:600]))
        await pg.goto('file://'+OUT+'g.html'); await pg.wait_for_timeout(2500)
        await pg.mouse.click(5,5)
        await pg.click('button[data-a=new]'); await pg.fill('#ws', seed); await pg.click('button[data-a=go]')
        await pg.wait_for_selector('[data-home]', timeout=180000)
        await pg.click('[data-home]'); await pg.click('button[data-a=go]'); await pg.wait_for_timeout(3000)
        js=open(sys.argv[1]).read()
        r = await pg.evaluate(js)
        e2 = await pg.evaluate("() => window._errs")
        print(json.dumps(r, indent=0))
        seen=set()
        for e in list(e2)+errs:
            k=e[:220]
            if k in seen: continue
            seen.add(k); print('ERR', e)
        await b.close()
asyncio.run(main())
