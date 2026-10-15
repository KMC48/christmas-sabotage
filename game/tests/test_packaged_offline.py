"""Check packaged www/ with external requests blocked (not a native startup benchmark).

Run npm run sync first. Each run uses a fresh browser context without cached assets.
NATIVE_QA_OUTPUT selects a directory for the screenshot and web timing samples.
"""
import functools
import http.server
import json
import os
from pathlib import Path
import threading
from urllib.parse import urlsplit

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
OUT = Path(os.environ.get('NATIVE_QA_OUTPUT', '/tmp/xmas-native-qa'))
# Existing v4 asset hooks explicitly use procedural/older-art fallbacks until delivery.
OPTIONAL_ASSETS = {
    '/assets/v4/' + name for name in (
        'prop_reindeer.png', 'prop_gift.png', 'prop_snowman.png',
        'prop_bluetree.png', 'player_agent_back.png', 'bg_stage6.jpg')
}


class QuietHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(QuietHandler, directory=str(ROOT / 'www')))
    threading.Thread(target=server.serve_forever, daemon=True).start()
    origin = f'http://127.0.0.1:{server.server_port}'
    samples = []
    try:
        with sync_playwright() as pw:
            browser = pw.chromium.launch(executable_path=os.environ.get('PLAYWRIGHT_CHROMIUM_EXECUTABLE') or None)
            for trial in range(3):
                context = browser.new_context(viewport={'width': 390, 'height': 844}, service_workers='block')
                external, errors, failed, optional_missing = [], [], [], []

                def route_request(route):
                    url = route.request.url
                    parsed = urlsplit(url)
                    if parsed.scheme in ('http', 'https') and f'{parsed.scheme}://{parsed.netloc}' != origin:
                        external.append(url)
                        route.abort()
                    else:
                        route.continue_()

                context.route('**/*', route_request)
                page = context.new_page()
                page.on('pageerror', lambda e: errors.append(str(e)))
                page.on('requestfailed', lambda r: failed.append(r.url))
                def check_response(response):
                    path = urlsplit(response.url).path
                    if response.status == 404 and path in OPTIONAL_ASSETS:
                        optional_missing.append(path)
                    elif response.status >= 400:
                        failed.append(f'{response.status} {response.url}')

                page.on('response', check_response)
                page.goto(origin + '/index.html', wait_until='domcontentloaded')
                page.locator('#titleMain').wait_for(state='visible')
                page.wait_for_function("() => window.XMAS && XMAS.img('title_key') && getComputedStyle(document.querySelector('#titleArt')).backgroundImage !== 'none'")
                timing = page.evaluate('''async () => {
                  await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
                  const titleReadyMs = performance.now();
                  const specs = ['400 20px "Dela Gothic One"', '400 16px "Noto Sans JP"',
                    '500 16px "Chakra Petch"', '600 16px "Chakra Petch"', '700 16px "Chakra Petch"'];
                  const loaded = await Promise.all(specs.map(s => document.fonts.load(s)));
                  await document.fonts.ready;
                  return {titleReadyMs, fontsReadyMs: performance.now(),
                    fontCounts: loaded.map(x => x.length),
                    fonts: [...document.fonts].map(f => ({family: f.family, status: f.status}))};
                }''')
                assert all(n > 0 for n in timing['fontCounts']), timing
                assert all(f['status'] == 'loaded' for f in timing['fonts']), timing
                # Verify actual Japanese glyph rendering, not only successful font downloads.
                cdp = context.new_cdp_session(page)
                cdp.send('DOM.enable')
                cdp.send('CSS.enable')
                document = cdp.send('DOM.getDocument')
                label = cdp.send('DOM.querySelector', {'nodeId': document['root']['nodeId'], 'selector': '#brief b'})
                rendered = cdp.send('CSS.getPlatformFontsForNode', {'nodeId': label['nodeId']})['fonts']
                assert any(f['isCustomFont'] and 'Noto Sans JP' in f['familyName'] and f['glyphCount'] > 0 for f in rendered), rendered
                cdp.detach()
                assert '日本のクリスマス' in page.locator('#titleLead').inner_text()
                if trial == 0:
                    page.screenshot(path=str(OUT / 'title-offline.png'))
                page.evaluate('XMAS.beginPlay(0)')
                page.wait_for_function("() => XMAS.G.state === 'playing'")
                page.wait_for_load_state('networkidle')
                assert not external, external
                assert not errors, errors
                assert not failed, failed
                timing['knownOptionalAssetsMissing'] = sorted(optional_missing)
                samples.append(timing)
                context.close()
            browser.close()
    finally:
        server.shutdown()
    result = {'scope': 'Linux Chromium, localhost packaged assets, external traffic blocked; not native cold-start time', 'samples': samples}
    (OUT / 'web-timings.json').write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps(result, ensure_ascii=False, indent=2))
    print('PASS: three fresh contexts; title, all five fonts, STAGE 1; no external requests, unexpected asset errors or JS errors')


if __name__ == '__main__':
    main()
