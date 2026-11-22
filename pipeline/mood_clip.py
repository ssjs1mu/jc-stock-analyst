#!/usr/bin/env python3
"""Living-photo mood clip for the booklet cover (free, no AI service): the day's realistic mood picture with a slow camera
push + gentle drift, a light sweep, mood particles (bull: rising embers, bear: rain, flat: drifting dust) and trend arrows,
plus the tone badge and one headline. 4-second seamless loop, H.264 MP4 (~0.5 MB), same 1036x600 box as the cover picture,
so the flip-book can play it over the cover and Telegram can post it as an animation.
  make(photo_data_uri, mood, word, headline, out_mp4)  ->  out_mp4 or None"""
import os, shutil, subprocess, tempfile

W, H, FPS, SEC = 864, 500, 15, 4
LOOK = {"bull": dict(chip="#1C820D", part="ember", arrow="&#9650;", ac="#3ddc84", oy=40),
        "bear": dict(chip="#D00000", part="rain", arrow="&#9660;", ac="#ff5a5a", oy=45),
        "neutral": dict(chip="#2a6f97", part="dust", arrow="", ac="#ffffff", oy=45)}

PAGE = """<!doctype html><html><head><meta charset="utf-8"><link href="https://fonts.googleapis.com/css2?family=Inter:wght@800;900&display=swap" rel="stylesheet">
<style>*{margin:0}body{width:%(W)dpx;height:%(H)dpx;overflow:hidden;background:#000;font-family:Inter,Arial,sans-serif}
#ph{position:absolute;inset:0;background:url(%(img)s) center/cover;transform-origin:55%% %(oy)s%%}
#sw{position:absolute;inset:-20%%;background:linear-gradient(105deg,transparent 42%%,rgba(255,236,190,.20) 50%%,transparent 58%%)}
#vg{position:absolute;inset:0;background:radial-gradient(120%% 95%% at 50%% 45%%,transparent 58%%,rgba(0,0,0,.5))}
canvas{position:absolute;inset:0}
.chip{position:absolute;left:18px;top:16px;background:%(chip)s;color:#fff;font:900 20px Inter;letter-spacing:1.5px;padding:8px 16px;border-radius:20px;box-shadow:0 4px 14px #0008}
.hd{position:absolute;right:18px;top:16px;max-width:52%%;background:rgba(0,0,0,.5);border:2px solid #E2B84A;color:#F6DC8A;font:800 19px Inter;padding:7px 14px;border-radius:20px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ar{position:absolute;font:900 32px Inter;color:%(ac)s;text-shadow:0 0 12px %(ac)s}</style></head><body>
<div id="ph"></div><div id="sw"></div><canvas id="cv" width="%(W)d" height="%(H)d"></canvas><div id="vg"></div>
<div class="chip">%(word)s</div>%(hd)s<div id="ars"></div>
<script>
var P='%(part)s',AR='%(arrow)s',R=[],seed=7;function rnd(){seed=(seed*16807)%%2147483647;return seed/2147483647}
for(var i=0;i<140;i++)R.push([rnd(),rnd(),rnd(),rnd()]);
var cv=document.getElementById('cv'),c=cv.getContext('2d'),W=%(W)d,H=%(H)d,T=%(SEC)d;
function frame(t){var u=t/T, PI=Math.PI;
 var s=1.08+0.05*Math.sin(u*2*PI), dx=Math.sin(u*2*PI)*7, dy=Math.cos(u*2*PI)*4;          /* breathing push + drift: loops seamlessly */
 document.getElementById('ph').style.transform='translate('+dx+'px,'+dy+'px) scale('+s+')';
 document.getElementById('sw').style.transform='translateX('+(-70+140*u)+'%%)';
 c.clearRect(0,0,W,H);
 for(var i=0;i<R.length;i++){var r=R[i];
  if(P==='rain'){var x=r[0]*W, y=((r[1]+u*5)%%1)*H; c.strokeStyle='rgba(210,220,255,'+(0.22+r[3]*0.35)+')'; c.lineWidth=1.1+r[2]; c.beginPath(); c.moveTo(x,y); c.lineTo(x-6,y+18+r[3]*14); c.stroke();}
  else if(P==='ember'){var x=r[0]*W+Math.sin(u*2*PI*2+r[3]*6)*12, y=H-((r[1]+u*(1+Math.floor(r[2]*2)))%%1)*H; var a=0.3+0.5*Math.abs(Math.sin(u*2*PI*3+r[3]*9)); c.fillStyle='rgba(255,'+(150+Math.floor(r[2]*90))+',60,'+a+')'; c.beginPath(); c.arc(x,y,1+r[2]*2.6,0,7); c.fill();}
  else {var x=((r[0]-u)%%1+1)%%1*W, y=H*0.5+r[1]*H*0.5-Math.sin(u*2*PI+r[3]*6)*10; c.fillStyle='rgba(235,215,180,'+(0.10+r[3]*0.22)+')'; c.beginPath(); c.arc(x,y,2+r[2]*5,0,7); c.fill();}
 }
 var h='';if(AR){for(var k=0;k<4;k++){var q=(u*2+k/4)%%1, up=AR.indexOf('9650')>0; var y=up?(H*0.85-q*H*0.6):(H*0.18+q*H*0.6); h+='<div class="ar" style="left:'+(W*0.88+(k%%2)*26)+'px;top:'+y+'px;opacity:'+((1-q)*0.9)+'">'+AR+'</div>';}}
 document.getElementById('ars').innerHTML=h;}
</script></body></html>"""


def _ffmpeg():
    try:
        import imageio_ffmpeg
        return imageio_ffmpeg.get_ffmpeg_exe()
    except Exception:
        return shutil.which("ffmpeg")


def make(img, mood, word, headline, out):
    ff = _ffmpeg()
    if not img or not ff:
        print("mood clip skipped:", "no picture" if not img else "no ffmpeg"); return None
    from playwright.sync_api import sync_playwright
    import html
    m = dict(LOOK.get(mood, LOOK["neutral"]))
    m.update(W=W, H=H, SEC=SEC, img=img, word=html.escape(word or ""), hd=('<div class="hd">%s</div>' % html.escape(headline)) if headline else "")
    tmp = tempfile.mkdtemp(prefix="clip")
    try:
        with sync_playwright() as p:
            b = p.chromium.launch(); pg = b.new_page(viewport={"width": W, "height": H}); pg.set_content(PAGE % m, wait_until="load")
            try: pg.wait_for_load_state("networkidle", timeout=6000)
            except Exception: pass
            n = FPS * SEC
            for i in range(n):
                pg.evaluate("frame(%f)" % (i * SEC / n)); pg.screenshot(path=os.path.join(tmp, "%03d.png" % i))
            b.close()
        subprocess.run([ff, "-y", "-loglevel", "error", "-framerate", str(FPS), "-i", os.path.join(tmp, "%03d.png"), "-c:v", "libx264", "-preset", "veryfast",
                        "-pix_fmt", "yuv420p", "-crf", "25", "-movflags", "+faststart", "-an", out], check=True)
        return out
    except Exception as ex:
        print("mood clip failed:", ex); return None
    finally:
        shutil.rmtree(tmp, ignore_errors=True)
