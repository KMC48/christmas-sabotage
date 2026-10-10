"""v4歩行画像の実ブラウザ検証。python game/tests/test_walk_sprites.py

Dependencies: Pillow, playwright + Chromium.
PLAYWRIGHT_CHROMIUM_EXECUTABLE can select an already installed Chromium.
WALK_QA_OUTPUT controls the screenshot directory (default: /tmp/xmas-walk-qa).
Only the test server response exposes drawing functions; production JS is not changed.
"""
import functools
import http.server
import json
import math
import os
from pathlib import Path
import threading

from PIL import Image
from playwright.sync_api import sync_playwright

GAME = Path(__file__).resolve().parents[1]
OUT = Path(os.environ.get('WALK_QA_OUTPUT', '/tmp/xmas-walk-qa'))
OUT.mkdir(parents=True, exist_ok=True)
KINDS = ('guard', 'couple')
DIRECTIONS = ('side', 'front', 'back')
KEYS = [f'npc_{k}_walk_{d}' for k in KINDS for d in DIRECTIONS]
BOUNDS = {}


class Handler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass


def main():
    for key in KEYS:
        with Image.open(GAME / 'assets' / 'v4' / (key + '.png')) as im:
            assert im.mode == 'RGBA', key
            assert im.size == ((512, 512) if 'guard' in key else (640, 512)), key
            alpha = im.getchannel('A')
            assert alpha.getextrema() == (0, 255), key
            x, y, r, b = alpha.point(lambda v: 255 if v > 12 else 0).getbbox()
            BOUNDS[key] = [x, y, r-x, b-y]
            assert b == 512 and b-y == 508, (key, BOUNDS[key])
    print('PASS: six PNGs, exact sizes, alpha, common height and bottom baseline')
    server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(Handler, directory=str(GAME)))
    threading.Thread(target=server.serve_forever, daemon=True).start()
    url = f'http://127.0.0.1:{server.server_port}/index.html'
    source = (GAME / 'game.js').read_text()
    source = source.replace('window.XMAS = {', 'window.__walkQA = {drawWalker, drawGuard, drawCouple, drawMob, ctx, TRIM}; window.XMAS = {', 1)
    results = []
    try:
        with sync_playwright() as pw:
            browser = pw.chromium.launch(executable_path=os.environ.get('PLAYWRIGHT_CHROMIUM_EXECUTABLE') or None)
            for viewport in ({'width': 1280, 'height': 900}, {'width': 390, 'height': 844}):
                page = browser.new_page(viewport=viewport, device_scale_factor=1)
                errors = []
                page.on('pageerror', lambda e: errors.append(str(e)))
                page.route('**/game.js', lambda route: route.fulfill(body=source, content_type='application/javascript'))
                page.goto(url)
                page.wait_for_function('(keys) => window.XMAS && keys.every(k=>XMAS.img(k))', arg=KEYS)
                page.evaluate('XMAS.setAuto(false)')
                registered = page.evaluate('() => __walkQA.TRIM')
                assert all(registered[key] == bounds for key, bounds in BOUNDS.items())
                # Real drawWalker calls: asset choice, flip, actual crop, height, foot position and bob.
                cases = [('right', 50, 0, 'side', False), ('left', -50, 0, 'side', True),
                         ('front', 0, 50, 'front', False), ('back', 0, -50, 'back', False),
                         ('front-left', -10, 50, 'front', False), ('back-left', -10, -50, 'back', False)]
                for kind in KINDS:
                    for label, vx, vy, direction, flip in cases:
                        for step in (0, math.pi / 2):
                            r = page.evaluate('''([kind,vx,vy,step]) => {
                              const q=__walkQA,c=q.ctx, original=c.drawImage; const calls=[];
                              c.save(); c.setTransform(1,0,0,1,0,0); c.clearRect(0,0,c.canvas.width,c.canvas.height);
                              c.drawImage=function(im,...a){calls.push({src:im.src, a, flip:this.getTransform().a<0}); return original.call(this,im,...a);};
                              q.drawWalker(kind,150,150,vx,vy,step,1);
                              c.drawImage=original;
                              const data=c.getImageData(0,0,300,180).data;let bottom=-1,top=180;
                              for(let y=0;y<180;y++)for(let x=0;x<300;x++)if(data[(y*300+x)*4+3]>12){bottom=Math.max(bottom,y);top=Math.min(top,y);}
                              c.restore(); return {pick:XMAS.walkPick(kind,vx,vy),calls,bottom,top};
                            }''', [kind, vx, vy, step])
                            key = f'npc_{kind}_walk_{direction}'
                            assert r['pick'] == {'key': key, 'flip': flip, 'dir': direction}, r
                            call, = r['calls']
                            assert call['src'].endswith('/v4/'+key+'.png') and call['flip'] == flip, r
                            assert call['a'][:4] == BOUNDS[key], r
                            h = 62 if kind == 'guard' else 66
                            assert call['a'][7] == h, r
                            foot = 150 - abs(math.sin(step)) * 2.2
                            assert abs(call['a'][5] + h - foot) < 1e-6, r
                            assert abs(r['bottom'] - (foot - 1)) <= 1.1, r
                            assert abs(r['top'] - (foot - h)) <= 1.1, r
                            results.append({'viewport': viewport, 'kind': kind, 'direction': label, 'step': step, 'foot': foot, 'height': h})
                # Contact sheet from the actual game drawing function, including mirrored side pose.
                if viewport['width'] > 1000:
                    page.evaluate('''() => {
                      const board=document.createElement('canvas');board.id='walk-review';board.width=1000;board.height=690;
                      board.style='position:fixed;inset:0;z-index:99999;background:#111a28';document.body.appendChild(board);
                      const b=board.getContext('2d');b.fillStyle='#111a28';b.fillRect(0,0,1000,690);
                      b.font='20px sans-serif';b.fillStyle='white';b.fillText('v4 walking sprites | actual game renderer',24,30);
                      const q=__walkQA,c=q.ctx; c.save();c.setTransform(1,0,0,1,0,0);
                      for(let row=0;row<2;row++)for(let col=0;col<4;col++){
                        const kind=row?'couple':'guard', cases=[[50,0,'RIGHT'],[-50,0,'LEFT'],[0,50,'FRONT'],[0,-50,'BACK']];
                        const [vx,vy,label]=cases[col], x=col*250,y=55+row*310;
                        c.clearRect(0,0,c.canvas.width,c.canvas.height);q.drawWalker(kind,80,80,vx,vy,0,1);
                        b.drawImage(c.canvas,25,10,110,72,x+15,y+15,220,144);
                        b.drawImage(c.canvas,25,10,110,72,x+70,y+175,110,72);
                        b.strokeStyle='#71bfa8';b.beginPath();b.moveTo(x+15,y+155);b.lineTo(x+235,y+155);b.stroke();
                        b.fillStyle='white';b.font='16px sans-serif';b.fillText(kind+' '+label,x+45,y+275);
                        b.fillStyle='#9aadc2';b.font='12px sans-serif';b.fillText('2x above / 1x below',x+56,y+295);
                      } c.restore();
                    }''')
                    page.locator('#walk-review').screenshot(path=str(OUT / 'walk-directions.png'))
                    page.evaluate("document.getElementById('walk-review').remove()")
                # Exercise all six source images through normal gameplay render paths.
                page.evaluate('''() => {
                  XMAS.beginPlay(1);const G=XMAS.G;
                  G.cam.y=0;G.cam.zoom=1;G.cam.shake=0;
                  const g=G.guards.find(g=>g.type!=='cam'), c=G.couples[0];
                  G.guards=[];G.couples=[];G.mobs=[];
                  [[50,0],[-50,0],[0,50],[0,-50]].forEach(([vx,vy],i)=>{
                    G.guards.push({...g,x:100+i*110,y:280,vx,vy,step:0,hot:0,bubbleT:0,invLook:null});
                    G.couples.push({...c,x:100+i*110,y:430,vx,vy,step:0,evt:null,mood:null,aura:null,next:99,lineT:0});
                  });
                  G.mobs.push({x:270,y:580,vx:30,step:0,mood:null});
                  G.player.x=270;G.player.y=690;
                  G.events=[];G.auras=[];G.snow=[];G.candidate=null;G.action=null;
                  // Controlled review scene: leave the floor, remove occluding props only in this test.
                  G.targets=[];G.obstacles=[];
                  document.querySelectorAll('.ov').forEach(e=>e.classList.remove('on'));
                  document.getElementById('centerMsg').style.display='none';
                }''')
                page.evaluate('() => new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))')
                page.screenshot(path=str(OUT / f"stage-{viewport['width']}.png"))
                assert not errors, errors
                page.close()
            # Missing sprites must retain the existing fallback path.
            page = browser.new_page()
            page.route('**/assets/v4/npc_*_walk_*.png', lambda route: route.abort())
            page.goto(url)
            page.wait_for_function("() => window.XMAS && XMAS.img('npc_guard_check') && XMAS.img('npc_couple_tunnel')")
            for kind, fallback in [('guard', 'npc_guard_check'), ('couple', 'npc_couple_tunnel')]:
                for vx, vy in [(50, 0), (-50, 0), (0, 50), (0, -50)]:
                    r=page.evaluate('([k,x,y])=>XMAS.walkPick(k,x,y)', [kind,vx,vy])
                    assert r['key'] == fallback and r['flip'] == (vx > 0), r
            print(f'PASS: {len(results)} actual draw checks at desktop/mobile viewports; 8 fallback checks; no JS errors')
            browser.close()
    finally:
        server.shutdown()
    (OUT / 'walk-checks.json').write_text(json.dumps({'bounds': BOUNDS, 'draw_checks': results}, indent=2))
    print('Screenshots:', OUT)


if __name__ == '__main__':
    main()
