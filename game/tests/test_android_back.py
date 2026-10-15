"""Real game UI + mocked Capacitor App boundary (not an Android device test).

    python -m pip install playwright
    python -m playwright install chromium
    python game/tests/test_android_back.py

BACK_QA_OUTPUT optionally saves the exit-dialog screenshot for visual inspection.
"""
import functools
import http.server
import json
import os
from pathlib import Path
import threading
import unittest

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
GAME = ROOT / 'game'
MOCK = """({platform, native, missingApp, rejectListener}) => {
  const listeners = {};
  window.nativeTest = {listeners, exits: 0, rejectExit: false,
    emit(name, data = {}) { for (const fn of listeners[name] || []) fn(data); }};
  window.Capacitor = {
    isNativePlatform: () => native, getPlatform: () => platform,
    Plugins: missingApp ? {} : {App: {
      addListener(name, fn) {
        if (rejectListener) return Promise.reject(new Error('registration failed'));
        (listeners[name] ||= []).push(fn);
        return Promise.resolve({remove: async () => {}});
      },
      exitApp() {
        nativeTest.exits++;
        return nativeTest.rejectExit ? Promise.reject(new Error('exit failed')) : Promise.resolve();
      }
    }}
  };
}"""


class Handler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass


class AndroidBackTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.server = http.server.ThreadingHTTPServer(
            ('127.0.0.1', 0), functools.partial(Handler, directory=str(GAME)))
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()
        cls.url = f'http://127.0.0.1:{cls.server.server_port}/index.html'
        cls.pw = sync_playwright().start()
        cls.browser = cls.pw.chromium.launch(
            executable_path=os.environ.get('PLAYWRIGHT_CHROMIUM_EXECUTABLE') or None)

    @classmethod
    def tearDownClass(cls):
        cls.browser.close()
        cls.pw.stop()
        cls.server.shutdown()
        cls.server.server_close()
        cls.thread.join()

    def setUp(self):
        self.context = self.browser.new_context(viewport={'width': 390, 'height': 844})
        self.page = None
        self.errors = []
        self.load()

    def tearDown(self):
        self.context.close()
        self.assertEqual(self.errors, [])

    def load(self, platform='android', native=True, missing_app=False, reject_listener=False):
        if self.page:
            self.page.close()
        self.page = self.context.new_page()
        self.page.on('pageerror', lambda e: self.errors.append(str(e)))
        config = dict(platform=platform, native=native, missingApp=missing_app,
                      rejectListener=reject_listener)
        # Each test/navigation injects the mock before the unchanged production script.
        self.page.add_init_script(f'({MOCK})({json.dumps(config)})')
        self.page.goto(self.url)
        self.page.wait_for_function('window.XMAS !== undefined')
        self.page.evaluate('XMAS.setAuto(false)')

    def back(self, wait=True):
        if wait:
            self.page.wait_for_timeout(310)
        self.page.evaluate("nativeTest.emit('backButton', {canGoBack: true})")

    def overlay(self, expected):
        self.assertEqual(self.page.locator('.ov.on').evaluate_all('(els) => els.map(e => e.id)'),
                         [expected] if expected else [])

    def click(self, id):
        self.page.locator('#' + id).click()

    def begin(self):
        self.page.evaluate('XMAS.beginPlay(0)')

    def stored(self):
        return self.page.evaluate('localStorage.getItem(XMAS.SKEY)')

    def snapshot(self):
        return self.page.evaluate('''() => {
          const g = XMAS.G;
          // Compare gameplay progress, not render-only glow/pulse animation counters.
          return JSON.stringify({score:g.score, left:g.left, time:g.time, mood:g.mood,
            player:g.player, targets:g.targets.map(t=>({done:t.done,mood:t.mood})),
            events:g.events.map(e=>({phase:e.phase,t:e.t,startAt:e.startAt,outcome:e.outcome})),
            guards:g.guards.map(p=>({x:p.x,y:p.y,mode:p.mode})),
            action:g.action && {phase:g.action.phase,t:g.action.t,dur:g.action.dur,
              started:g.action.started,target:g.targets.indexOf(g.action.target)},
            combo:g.combo,comboT:g.comboT,detect:g.detect,just:g.just,metrics:g.metrics
            });
        }''')

    def win(self, stage=0):
        self.page.evaluate('''(stage) => {
          XMAS.beginPlay(stage);
          const t = XMAS.G.targets[0]; XMAS.leaveOnly(t); XMAS.sabotage(t); XMAS.step(0);
        }''', stage)

    def test_android_listener_registered_once(self):
        self.assertEqual(self.page.evaluate('Object.fromEntries(Object.entries(nativeTest.listeners).map(([k,v])=>[k,v.length]))'),
                         {'backButton': 1, 'pause': 1, 'resume': 1})

    def test_play_pause_freezes_run_and_releases_held_input(self):
        self.begin()
        self.page.evaluate('''() => {
          const x=XMAS,g=x.G,t=g.targets[0];
          g.player.x=t.x+60;g.player.y=t.y+40;x.step(1/60);x.startAction();x.run(.1);
          x.input.keys.r=1;x.ctl.stick.vx=1;x.ctl.stick.id=7;x.ctl.work.id=8;
        }''')
        self.assertTrue(self.page.evaluate('!!XMAS.G.action'))
        before, saved = self.snapshot(), self.stored()
        self.back()
        self.overlay('ovPause')
        self.page.evaluate('XMAS.run(5)')
        self.assertEqual(self.snapshot(), before)
        self.assertEqual(self.stored(), saved)
        self.assertEqual(self.page.evaluate('[XMAS.input.keys.r,XMAS.ctl.stick.vx,XMAS.ctl.stick.id,XMAS.ctl.work.id]'), [0, 0, None, None])
        self.back()
        self.overlay(None)
        self.assertEqual(self.snapshot(), before)
        self.assertEqual(self.page.evaluate('XMAS.G.state'), 'playing')
        self.assertEqual(self.page.evaluate('nativeTest.exits'), 0)
        self.page.evaluate('XMAS.run(1.5)')
        self.assertTrue(self.page.evaluate('XMAS.G.targets[0].done'))
        self.assertEqual(self.page.evaluate('XMAS.G.doneCount'), 1)

    def test_ready_timer_cannot_resume_paused_game(self):
        self.click('btnStart')
        self.back(wait=False)
        self.overlay('ovPause')
        self.page.wait_for_timeout(1200)
        self.assertEqual(self.page.evaluate('XMAS.G.state'), 'pause')
        self.click('btnResume')
        self.assertEqual(self.page.evaluate('XMAS.G.state'), 'playing')

    def test_rapid_back_is_not_a_second_navigation(self):
        self.begin()
        self.page.evaluate("nativeTest.emit('backButton');nativeTest.emit('backButton');nativeTest.emit('backButton')")
        self.overlay('ovPause')
        self.assertEqual(self.page.evaluate('nativeTest.exits'), 0)

    def test_title_exit_requires_explicit_confirmation_and_preserves_save(self):
        before = self.stored()
        self.back()
        self.overlay('ovExit')
        self.assertEqual(self.page.evaluate('document.activeElement.id'), 'btnExitCancel')
        self.assertEqual(self.page.evaluate('nativeTest.exits'), 0)
        out = os.environ.get('BACK_QA_OUTPUT')
        if out:
            Path(out).mkdir(parents=True, exist_ok=True)
            self.page.screenshot(path=str(Path(out) / 'exit-dialog.png'))
        self.back()
        self.overlay('ovTitle')
        self.back()
        self.click('btnExitCancel')
        self.overlay('ovTitle')
        self.back()
        self.click('btnExitConfirm')
        self.assertEqual(self.page.evaluate('nativeTest.exits'), 1)
        self.assertEqual(self.stored(), before)
        self.page.reload()
        self.page.wait_for_function('window.XMAS !== undefined')
        self.assertEqual(self.stored(), before)

    def test_exit_failure_recovers_ui_without_losing_save(self):
        before = self.stored()
        self.page.evaluate('nativeTest.rejectExit=true')
        self.back()
        self.click('btnExitConfirm')
        self.overlay('ovTitle')
        self.assertFalse(self.page.locator('#btnExitConfirm').is_disabled())
        self.assertEqual(self.stored(), before)

    def test_title_settings_returns_to_title(self):
        self.click('btnSettings')
        self.back()
        self.overlay('ovTitle')
        self.assertEqual(self.page.evaluate('nativeTest.exits'), 0)

    def test_nested_layout_settings_pause_and_resume(self):
        self.begin()
        self.back()
        self.click('btnSettings2')
        self.click('swSe')
        before = self.stored()
        self.click('btnLayout')
        self.page.evaluate('''() => {
          XMAS.editor.pos.stick.x += 15; XMAS.editor.id=42;XMAS.editor.which='stick';
        }''')
        self.back()
        self.overlay('ovSettings')
        self.assertEqual(self.stored(), before)
        self.assertEqual(self.page.evaluate('[XMAS.editor.id,XMAS.editor.which,XMAS.editor.pos]'), [None, None, None])
        self.click('btnLayout')
        self.assertIsNone(self.page.evaluate('XMAS.editor.id'))
        self.click('btnLayoutCancel')
        self.back()
        self.overlay('ovPause')
        self.assertEqual(self.page.evaluate('XMAS.G.state'), 'pause')
        self.back()
        self.assertEqual(self.page.evaluate('XMAS.G.state'), 'playing')
        self.assertEqual(self.stored(), before)

    def test_select_returns_to_title(self):
        self.click('btnSelect')
        self.back()
        self.overlay('ovTitle')
        self.assertEqual(self.page.evaluate('XMAS.G.state'), 'title')

    def test_clear_transition_result_select_title_preserves_record(self):
        self.win()
        self.assertEqual(self.page.evaluate('XMAS.G.state'), 'finishing')
        before = self.stored()
        total = self.page.evaluate('XMAS.G.result.total')
        self.back()
        self.overlay('ovResult')
        self.assertEqual(self.page.evaluate('XMAS.G.result.total'), total)
        self.back()
        self.overlay('ovSelect')
        self.back()
        self.overlay('ovTitle')
        self.assertEqual(self.stored(), before)
        self.assertEqual(self.page.evaluate('nativeTest.exits'), 0)
        self.page.reload()
        self.page.wait_for_function('window.XMAS !== undefined')
        self.assertEqual(self.stored(), before)

    def test_failure_transition_and_result_use_existing_select_action(self):
        self.begin()
        self.page.evaluate('XMAS.G.left=0;XMAS.step(.01)')
        self.assertEqual(self.page.evaluate('XMAS.G.state'), 'failing')
        before = self.stored()
        self.back()
        self.overlay('ovFail')
        self.back()
        self.overlay('ovSelect')
        self.assertEqual(self.stored(), before)

    def test_first_all_clear_ending_back_keeps_unlocks_and_result(self):
        for i in range(5):
            self.win(i)
        self.assertEqual(self.page.evaluate('XMAS.G.state'), 'ending')
        before = self.stored()
        self.back()
        self.overlay('ovResult')
        self.assertTrue(self.page.evaluate('XMAS.save.specialUnlocked && XMAS.save.allClearEndingUnlocked'))
        self.assertEqual(self.stored(), before)

    def test_ending_replay_returns_to_its_origin(self):
        self.win()
        self.back()
        self.page.evaluate("XMAS.startEnding(true,'ovResult')")
        before = self.stored()
        self.back()
        self.overlay('ovResult')
        self.assertEqual(self.stored(), before)
        self.click('btnSelect2')
        self.page.evaluate("XMAS.startEnding(true,'ovSelect')")
        self.back()
        self.overlay('ovSelect')

    def test_abort_button_returns_to_title_without_erasing_record(self):
        self.begin()
        before = self.stored()
        self.back()
        self.click('btnQuit')
        self.overlay('ovTitle')
        self.assertIsNone(self.page.evaluate('XMAS.G.stage'))
        self.assertEqual(self.stored(), before)

    def test_background_ready_and_resume_stay_paused(self):
        self.click('btnStart')
        self.page.evaluate("nativeTest.emit('pause')")
        self.overlay('ovPause')
        self.page.wait_for_timeout(1200)
        self.page.evaluate("nativeTest.emit('resume')")
        self.assertEqual(self.page.evaluate('XMAS.G.state'), 'pause')
        self.click('btnResume')
        self.assertEqual(self.page.evaluate('XMAS.G.state'), 'playing')

    def test_background_does_not_dismiss_settings(self):
        self.begin()
        self.back()
        self.click('btnSettings2')
        self.page.evaluate("nativeTest.emit('pause');nativeTest.emit('resume')")
        self.overlay('ovSettings')
        self.assertEqual(self.page.evaluate('XMAS.G.state'), 'pause')

    def test_unsupported_platforms_do_not_register_native_navigation(self):
        for platform, native, missing in [('web', False, False), ('ios', True, False), ('android', True, True)]:
            with self.subTest(platform=platform, missing=missing):
                self.load(platform, native, missing)
                self.assertEqual(self.page.evaluate('nativeTest.listeners'), {})
                self.click('btnStart')
                self.assertEqual(self.page.evaluate('XMAS.G.state'), 'ready')

    def test_listener_rejection_does_not_crash_game(self):
        self.load(reject_listener=True)
        self.click('btnStart')
        self.assertEqual(self.page.evaluate('XMAS.G.state'), 'ready')

    def test_web_without_capacitor_preserves_pause_controls(self):
        with self.browser.new_page() as page:
            page.goto(self.url)
            page.wait_for_function('window.XMAS !== undefined')
            self.assertTrue(page.evaluate('window.Capacitor === undefined'))
            page.evaluate('XMAS.setAuto(false);XMAS.beginPlay(0)')
            page.keyboard.press('Escape')
            self.assertTrue(page.locator('#ovPause').is_visible())
            page.locator('#btnResume').click()
            self.assertEqual(page.evaluate('XMAS.G.state'), 'playing')


if __name__ == '__main__':
    unittest.main(verbosity=2)
