"""Privacy policy smoke and local-save regression in the packaged, offline-capable Web app.

Requires `npm run build:www` and `pip install playwright` with Chromium installed.
Run from the repository root: python game/tests/test_privacy.py
"""
import functools
import http.server
from pathlib import Path
import threading
from urllib.parse import urlsplit

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
WWW = ROOT / 'www'


class QuietHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass


def main():
    policy = WWW / 'privacy.html'
    assert policy.is_file(), 'build:www must package privacy.html'
    text = policy.read_text(encoding='utf-8')
    assert 'クリスマス粉砕大作戦' in text
    assert 'OSのバックアップ' in text
    assert 'localStorage' in text
    assert 'christmas-smash' in text
    assert '<script' not in text.lower(), 'policy must not execute scripts'

    server = http.server.ThreadingHTTPServer(
        ('127.0.0.1', 0), functools.partial(QuietHandler, directory=str(WWW))
    )
    threading.Thread(target=server.serve_forever, daemon=True).start()
    origin = f'http://127.0.0.1:{server.server_port}'
    try:
        with sync_playwright() as pw:
            browser = pw.chromium.launch()
            context = browser.new_context(viewport={'width': 390, 'height': 844})
            external, js_errors, bad_responses = [], [], []

            def block_external(route):
                parsed = urlsplit(route.request.url)
                if parsed.scheme in ('http', 'https') and f'{parsed.scheme}://{parsed.netloc}' != origin:
                    external.append(route.request.url)
                    route.abort()
                else:
                    route.continue_()

            context.route('**/*', block_external)
            page = context.new_page()
            page.on('pageerror', lambda error: js_errors.append(str(error)))
            page.on('response', lambda res:
                    bad_responses.append(res.url) if res.status >= 400
                    and not ('/assets/v4/' in res.url and res.status == 404) else None)
            page.goto(origin + '/index.html', wait_until='domcontentloaded')
            page.locator('#btnSettings').click()
            page.evaluate('''() => {
              XMAS.save.unlocked = 3;
              XMAS.save.best4 = {'1': {score: 9876, rank: 'A'}};
              localStorage.setItem(XMAS.SKEY, JSON.stringify(XMAS.save));
              localStorage.setItem('other-site-test-key', 'keep');
            }''')
            before = page.evaluate("localStorage.getItem(XMAS.SKEY)")
            page.locator('#btnPrivacy').click()
            assert page.locator('#ovPrivacy').is_visible()
            assert page.frame_locator('#privacyFrame').locator('h1').is_visible()
            assert 'バックアップ' in page.frame_locator('#privacyFrame').locator('body').inner_text()
            assert page.evaluate("localStorage.getItem(XMAS.SKEY)") == before

            page.locator('#btnPrivacyBack').click()
            assert page.locator('#ovSettings').is_visible()
            assert page.evaluate("localStorage.getItem(XMAS.SKEY)") == before

            page.once('dialog', lambda dialog: dialog.accept())
            page.locator('#btnWipe').click()
            page.wait_for_function(
                "() => window.XMAS && XMAS.save.unlocked === 1 && "
                "Object.keys(XMAS.save.best4).length === 0"
            )
            assert page.evaluate("localStorage.getItem('other-site-test-key')") == 'keep'
            assert not external, external
            assert not js_errors, js_errors
            assert not bad_responses, bad_responses
            context.close()
            browser.close()
    finally:
        server.shutdown()
        server.server_close()
    print('PASS: packaged privacy page, offline iframe, settings return, save preservation, reset')


if __name__ == '__main__':
    main()
