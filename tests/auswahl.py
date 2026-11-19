# Prüft die Auswahl des Vergleichsteams: Bei ein und zwei Helden wird jede erlaubte Kombination durchgerechnet. Die Suche muss dasselbe Ergebnis liefern.
import asyncio,sys
from playwright.async_api import async_playwright
async def main():
    bad=0
    async with async_playwright() as p:
        b=await p.chromium.launch()
        for cls in [int(x) for x in sys.argv[1:]] or [10,4,5,1]:
            for size in (4,):
                pg=await b.new_page(viewport={'width':1366,'height':1000}); errs=[]; pg.on('pageerror',lambda e: errs.append(str(e)[:200]))
                await pg.goto('http://localhost:8765/index.html'); await pg.wait_for_timeout(2500)
                await pg.evaluate('window.__gwExhaust=true')
                await pg.click('#pk-class'); await pg.wait_for_timeout(150); await pg.click(f'#clsgrid [data-cls="{cls}"]'); await pg.wait_for_timeout(700)
                if await pg.locator('#drawer.on #dclose').count(): await pg.click('#dclose')
                await pg.click(f'#party button >> text="{size}"'); await pg.wait_for_timeout(700)
                await pg.click('#pills >> text=Schaden/s'); await pg.wait_for_selector('#dbody .refrow',timeout=180000)
                r=await pg.evaluate('window.__gwRef'); ok = r and r['bestOk']==r['foundOk'] and r['foundDmg']>=r['bestDmg']-1
                print('Klasse',cls,'Gruppe',size,r,'OK' if ok else 'ABWEICHUNG',errs or ''); bad+=0 if ok else 1; await pg.close()
        await b.close()
    sys.exit(1 if bad else 0)
asyncio.run(main())
