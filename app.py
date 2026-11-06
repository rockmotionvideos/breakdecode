# FILE NAME: app.py
# The web app: Home -> choose a move -> upload -> processing -> result.
# Put this file in the same folder as Skeleton.py and analyze_flares.py.
#   pip install flask
#   python app.py
# Then open http://127.0.0.1:5000 in your browser.
# To open it on your phone (same Wi-Fi): run   python app.py share
# and open  http://<your computer's IP>:5000  on the phone (find the IP with: ipconfig).
import os, json
import re
import sys
import uuid
import time
import shutil
import threading
import subprocess
from flask import Flask, request, jsonify, send_file, abort, redirect

HERE = os.path.dirname(os.path.abspath(__file__))
JOBS_DIR = os.path.join(HERE, "app_jobs")
os.makedirs(JOBS_DIR, exist_ok=True)
SKELETON = os.environ.get("SKELETON_SCRIPT", os.path.join(HERE, "Skeleton.py"))
ANALYZER = os.environ.get("ANALYZER_SCRIPT", os.path.join(HERE, "analyze_flares.py"))
ALLOWED = {".mp4", ".mov", ".m4v", ".avi", ".mkv", ".webm"}
MAX_MB = 300

app = Flask(__name__)
app.config["MAX_CONTENT_LENGTH"] = MAX_MB * 1024 * 1024
JOBS = {}          # job id -> {"state","step","error","started"}
LOCK = threading.Lock()
RUN_ONE = threading.Lock()     # one scan at a time (the GPU/CPU is busy during a scan)

MOVES = [
    {"key": "flare", "name": "Flare", "ready": True, "blurb": "Hips, legs, kick and rounds, checked with a coach's eye.", "tag": "AVAILABLE"},
    {"key": "windmill", "name": "Windmill", "ready": False, "blurb": "Not ready yet. I don't have a judge for this move, so I won't pretend to.", "tag": "COMING SOON"},
    {"key": "airflare", "name": "Airflare", "ready": False, "blurb": "Not ready yet. I don't have a judge for this move, so I won't pretend to.", "tag": "COMING SOON"},
]

MAX_SECONDS = 40
# (icon, title, explanation). Used by the pop-up and by the "film it again" page.
RULES = [
    ("&#128161;", "Good lighting", "Film in a well-lit space, with the lights on or near a window. Wear fitted clothing that contrasts with the wall behind you. Dark clothing in a dark room is difficult for me to detect."),
    ("&#128101;", "Clear background", "Make sure no one is behind you, otherwise the analysis may follow the wrong person. A plain wall gives the best results."),
    ("&#129489;", "Full body in frame", "Stand 2 to 3 metres from the camera, facing it or at a 45 degree angle, so your hands and feet stay in frame throughout the move."),
    ("&#128247;", "Stable camera", "Place your phone on a stable surface instead of holding it. Turn off filters and digital zoom. Slow motion (120 fps or higher) is recommended if your phone supports it."),
    ("&#9201;", "40 seconds maximum", "Videos must be 40 seconds or shorter. Include a few flares rather than a full session."),
]
FILM_TIPS = [f"{t}: {d}" for _, t, d in RULES]

CSS = """
:root{--bg:#070b0d;--card:rgba(255,255,255,.05);--line:rgba(255,255,255,.1);--txt:#e8f3f0;--dim:#8ea6a0;
--mint:#5cffc4;--cyan:#4fd8ff;--violet:#9d7bff;--coral:#ff6b6b;--arg:92,255,196;--vrg:157,123,255;--bgr:7,11,13}
*{box-sizing:border-box;margin:0}
html{-webkit-text-size-adjust:100%}
body{background:radial-gradient(900px 500px at 15% -10%,rgba(var(--arg),.14),transparent),
radial-gradient(800px 500px at 100% 0,rgba(var(--vrg),.14),transparent),var(--bg);
color:var(--txt);font-family:'Space Grotesk',system-ui,sans-serif;min-height:100vh;
padding:max(20px,env(safe-area-inset-top)) max(18px,env(safe-area-inset-right)) max(28px,env(safe-area-inset-bottom)) max(18px,env(safe-area-inset-left))}
.wrap{max-width:560px;margin:0 auto}
.mono{font-family:'Space Mono',monospace;letter-spacing:.12em;font-size:11px;color:var(--mint)}
h1{font-size:clamp(34px,9vw,48px);line-height:1.05;margin:10px 0 12px}
h1 em{font-style:normal;background:linear-gradient(90deg,var(--mint),var(--cyan),var(--violet));-webkit-background-clip:text;background-clip:text;color:transparent}
p.lead{color:var(--dim);line-height:1.55;margin-bottom:22px}
a{color:inherit;text-decoration:none}
.card{display:block;background:var(--card);border:1px solid var(--line);border-radius:20px;padding:18px;margin-bottom:12px;backdrop-filter:blur(10px)}
a.card.ready{border-color:rgba(var(--arg),.45);box-shadow:0 0 30px rgba(var(--arg),.08)}
.card.soon{opacity:.6}
.card h2{font-size:22px;margin:6px 0}
.card p{color:var(--dim);font-size:14px;line-height:1.5}
.pill{display:inline-block;font-family:'Space Mono',monospace;font-size:10px;letter-spacing:.12em;padding:4px 9px;border-radius:99px;border:1px solid var(--line);color:var(--dim)}
.ready .pill{color:var(--mint);border-color:rgba(var(--arg),.5)}
ul.tips{list-style:none;padding:0}
ul.tips li{padding:10px 0 10px 26px;position:relative;color:var(--dim);font-size:14px;line-height:1.5;border-top:1px solid var(--line)}
ul.tips li:first-child{border-top:0}
ul.tips li:before{content:"";position:absolute;left:4px;top:17px;width:8px;height:8px;border-radius:50%;background:var(--mint);box-shadow:0 0 10px var(--mint)}
.btn{display:block;width:100%;text-align:center;border:0;cursor:pointer;font:600 17px 'Space Grotesk',sans-serif;color:#04110d;
padding:16px;border-radius:16px;background:linear-gradient(90deg,var(--mint),var(--cyan));margin-top:14px}
.btn.ghost{background:var(--card);color:var(--txt);border:1px solid var(--line)}
.btn[disabled]{opacity:.4}
input[type=file]{width:100%;padding:18px;border:1.5px dashed rgba(var(--arg),.45);border-radius:16px;background:rgba(var(--arg),.04);color:var(--dim);font:14px 'Space Grotesk',sans-serif}
.req{display:flex;gap:12px;align-items:flex-start;padding:12px 0;border-top:1px solid var(--line);color:var(--txt);font-size:14px;line-height:1.5;cursor:pointer}
.req:first-child{border-top:0}
.req input{appearance:none;-webkit-appearance:none;flex:none;width:24px;height:24px;margin-top:1px;border-radius:8px;border:1.5px solid rgba(var(--arg),.5);background:transparent;display:grid;place-content:center}
.req input:checked{background:linear-gradient(135deg,var(--mint),var(--cyan));border-color:transparent}
.req input:checked:after{content:"\\2713";color:#04110d;font-weight:700;font-size:15px}
form.locked input[type=file]{opacity:.4}
 .gate{position:fixed;inset:0;z-index:1000;display:none;align-items:center;justify-content:center;padding:18px;background:rgba(4,8,10,.92);backdrop-filter:blur(12px)}
.gate.on{display:flex;animation:gfade .35s ease}
.gate.on .gbox{animation:gpop .5s cubic-bezier(.2,1.2,.3,1)}
.gstep.in{animation:gslide .45s cubic-bezier(.2,.9,.3,1)}
.gstep.in .gicon{animation:gbounce .7s cubic-bezier(.2,1.6,.4,1)}
@keyframes gfade{from{opacity:0}to{opacity:1}}
@keyframes gpop{from{opacity:0;transform:translateY(40px) scale(.92)}to{opacity:1;transform:none}}
@keyframes gslide{from{opacity:0;transform:translateX(36px)}to{opacity:1;transform:none}}
@keyframes gbounce{0%{transform:scale(.3) rotate(-15deg)}100%{transform:none}}
.gdots i{transition:background .4s}
@media (prefers-reduced-motion:reduce){.gate.on,.gate.on .gbox,.gstep.in,.gstep.in .gicon{animation:none}}
.gclose{position:absolute;top:14px;right:14px;width:34px;height:34px;border-radius:50%;border:1px solid var(--line);background:var(--card);color:var(--txt);font-size:22px;line-height:1;cursor:pointer}
.gbox{position:relative;width:100%;max-width:440px;background:#0d1417;border:1px solid rgba(var(--arg),.35);border-radius:24px;padding:22px;box-shadow:0 0 60px rgba(var(--arg),.12)}
.gdots{display:flex;gap:6px;margin:20px 0 16px}.gdots i{flex:1;height:4px;border-radius:9px;background:var(--line)}.gdots i.on{background:linear-gradient(90deg,var(--mint),var(--cyan))}
.gicon{font-size:44px;line-height:1}.gbox h2{font-size:26px;margin:10px 0 8px}.gbox p{color:var(--dim);line-height:1.55;font-size:15px}
.gack{display:flex;gap:12px;align-items:flex-start;margin-top:16px;color:var(--txt);font-size:14px;line-height:1.5;cursor:pointer}
.gack input{appearance:none;-webkit-appearance:none;flex:none;width:24px;height:24px;border-radius:8px;border:1.5px solid rgba(var(--arg),.5);display:grid;place-content:center}
.gack input:checked{background:linear-gradient(135deg,var(--mint),var(--cyan));border-color:transparent}
.gack input:checked:after{content:"\\2713";color:#04110d;font-weight:700;font-size:15px}
.tipsbox summary{cursor:pointer;font-weight:600;margin-bottom:6px}.tipsbox[open] summary{margin-bottom:12px}
.back{display:inline-block;color:var(--dim);font-size:14px;margin-bottom:10px}
.track{height:8px;border-radius:9px;background:var(--line);overflow:hidden;margin-top:12px}.track i{display:block;height:100%;width:0;border-radius:9px;background:linear-gradient(90deg,var(--mint),var(--violet));transition:width .8s ease}
.bar{height:6px;border-radius:9px;background:var(--line);overflow:hidden;margin:18px 0}
.bar i{display:block;height:100%;width:40%;border-radius:9px;background:linear-gradient(90deg,var(--mint),var(--violet));animation:go 1.4s ease-in-out infinite}
@keyframes go{0%{margin-left:-40%}100%{margin-left:100%}}
.err{color:var(--coral)}
.small{color:var(--dim);font-size:12px;margin-top:14px;line-height:1.5}
/* ---- v2 look: glass, glow, motion (applies to every page) ---- */
.wrap>*{opacity:0;animation:rise2 .5s ease forwards}
.wrap>*:nth-child(2){animation-delay:.04s}.wrap>*:nth-child(3){animation-delay:.08s}.wrap>*:nth-child(4){animation-delay:.12s}
.wrap>*:nth-child(n+5){animation-delay:.16s}
@keyframes rise2{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:none}}
@media (prefers-reduced-motion:reduce){.wrap>*{animation:none;opacity:1}}
.back{padding:8px 14px 8px 12px;border-radius:99px;border:1px solid rgba(255,255,255,.1);background:rgba(255,255,255,.05);backdrop-filter:blur(10px);font-size:13px;margin-bottom:14px}
.mono{display:inline-block;padding:5px 11px;border-radius:99px;background:rgba(var(--arg),.1);border:1px solid rgba(var(--arg),.25);font-size:10.5px}
h1{letter-spacing:-.02em}
.card{position:relative;overflow:hidden;border-radius:26px;border:1px solid rgba(255,255,255,.09);
 background:linear-gradient(160deg,rgba(255,255,255,.09),rgba(255,255,255,.02) 60%);box-shadow:0 10px 30px rgba(0,0,0,.35),inset 0 1px 0 rgba(255,255,255,.12)}
.card::before{content:'';position:absolute;width:150px;height:150px;right:-55px;top:-55px;border-radius:50%;background:radial-gradient(circle,rgba(var(--arg),.22),transparent 70%);pointer-events:none}
.card>*{position:relative}
.sel{background:linear-gradient(150deg,var(--mint),var(--cyan))!important;color:#04110d!important;border-color:transparent!important;box-shadow:0 14px 40px rgba(var(--arg),.32)!important}
a.card.ready{border-color:rgba(255,255,255,.14)}
a.card.ready:active{background:linear-gradient(150deg,var(--mint),var(--cyan));color:#04110d;border-color:transparent;box-shadow:0 14px 40px rgba(var(--arg),.32)}
a.card.ready:active p{color:rgba(4,17,13,.72)}
a.card.ready:active .pill{color:#04110d;border-color:rgba(4,17,13,.3)}
@media (hover:hover){a.card.ready:hover{border-color:rgba(var(--arg),.55);box-shadow:0 0 30px rgba(var(--arg),.15)}}
a.card{transition:transform .15s ease}a.card:active{transform:scale(.98)}
.btn{border-radius:18px;box-shadow:0 10px 28px rgba(var(--arg),.28);transition:transform .15s ease}
.btn:active{transform:scale(.97)}
.btn.ghost{background:linear-gradient(160deg,rgba(255,255,255,.09),rgba(255,255,255,.02));border:1px solid rgba(255,255,255,.1);box-shadow:inset 0 1px 0 rgba(255,255,255,.12)}
input[type=file]{border-radius:22px;padding:26px 18px;background:linear-gradient(160deg,rgba(var(--arg),.08),rgba(var(--arg),.02))}
input[type=file]::file-selector-button{margin-right:12px;border:0;border-radius:12px;padding:10px 14px;font:600 14px 'Space Grotesk',sans-serif;color:#04110d;background:linear-gradient(90deg,var(--mint),var(--cyan));cursor:pointer}
.track{height:10px}.track i{box-shadow:0 0 16px rgba(var(--arg),.6)}
.gbox{border-radius:30px;background:linear-gradient(160deg,#141d21,#0b1114);box-shadow:0 30px 80px rgba(0,0,0,.6),0 0 70px rgba(var(--arg),.14)}
.gicon{display:grid;place-items:center;width:72px;height:72px;border-radius:22px;font-size:36px;background:linear-gradient(135deg,rgba(var(--arg),.22),rgba(var(--vrg),.22));border:1px solid rgba(255,255,255,.12)}
ul.tips li{border-top-color:rgba(255,255,255,.07)}
.sw button{box-shadow:0 6px 18px rgba(0,0,0,.4)}
"""

FONTS = '<link rel="preconnect" href="https://fonts.googleapis.com"><link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;600;700&family=Space+Mono&display=swap" rel="stylesheet">'


def gate_html():
    steps = "".join(f"<div class='gstep' hidden><div class='gicon'>{i}</div><h2>{t}</h2><p>{d}</p></div>" for i, t, d in RULES)
    dots = "<i></i>" * len(RULES)
    return ("<div class='gate' id='gate' role='dialog' aria-modal='true'><div class='gbox'>"
            "<button class='gclose' id='gclose' hidden aria-label='Close'>&times;</button><div class='mono'>BEFORE YOU START</div><div class='gdots'>" + dots + "</div>" + steps +
            "<button class='btn' id='gnext' disabled>Next</button></div></div>")


GATE_JS = """
(function(){
 var KEY='breaking_ai_rules_v4',g=document.getElementById('gate');
 var st=[].slice.call(g.querySelectorAll('.gstep')),dots=[].slice.call(g.querySelectorAll('.gdots i')),
  nx=document.getElementById('gnext'),cl=document.getElementById('gclose'),i=0,t,replay=false;
 function show(){st.forEach(function(x,k){x.hidden=k!==i;x.className='gstep';if(k===i){void x.offsetWidth;x.className='gstep in'}});
  dots.forEach(function(d,k){d.className=k<=i?'on':''});
  var last=i===st.length-1,label=last?(replay?'Done':'Start using the app'):'Next',s=2;
  clearInterval(t);
  if(replay){nx.disabled=false;nx.textContent=label;return}
  nx.disabled=true;nx.textContent=label+' ('+s+')';
  t=setInterval(function(){s--;if(s<=0){clearInterval(t);nx.disabled=false;nx.textContent=label}else nx.textContent=label+' ('+s+')'},1000)}
 function close(){clearInterval(t);g.className='gate';document.body.style.overflow=''}
 window.openRules=function(r){replay=!!r;i=0;cl.hidden=!replay;document.body.style.overflow='hidden';g.className='gate on';show()};
 nx.addEventListener('click',function(){if(i<st.length-1){i++;show()}else{if(!replay){try{localStorage.setItem(KEY,'yes')}catch(e){}}close()}});
 cl.addEventListener('click',close);
 var seen=false;try{seen=localStorage.getItem(KEY)==='yes'}catch(e){}
 if(!seen&&!window.BD_NOAUTO)window.openRules(false);
})();
"""


THEME_JS = """
(function(){
 var T={
  mint:{n:'Mint',mint:'#5cffc4',cyan:'#4fd8ff',violet:'#9d7bff',coral:'#ff6b6b',bg:'#070b0d',arg:'92,255,196',vrg:'157,123,255',bgr:'7,11,13'},
  sunset:{n:'Sunset',mint:'#ffb454',cyan:'#ff7a45',violet:'#ff3d81',coral:'#ff5c5c',bg:'#0e0809',arg:'255,180,84',vrg:'255,61,129',bgr:'14,8,9'},
  acid:{n:'Acid',mint:'#d4ff3a',cyan:'#a8ff5c',violet:'#ffffff',coral:'#ff5c8a',bg:'#0a0b08',arg:'212,255,58',vrg:'255,255,255',bgr:'10,11,8'},
  ice:{n:'Ice',mint:'#8ad7ff',cyan:'#4d7cff',violet:'#c8a2ff',coral:'#ff7b9c',bg:'#060912',arg:'138,215,255',vrg:'200,162,255',bgr:'6,9,18'},
  fire:{n:'Fire',mint:'#ffc233',cyan:'#ff8a2b',violet:'#ff3b3b',coral:'#ff3b3b',bg:'#0b0707',arg:'255,194,51',vrg:'255,59,59',bgr:'11,7,7'}
 };
 window.BD_THEMES=T;
 window.setTheme=function(k,save){var t=T[k]||T.mint,r=document.documentElement.style;
  r.setProperty('--mint',t.mint);r.setProperty('--cyan',t.cyan);r.setProperty('--violet',t.violet);r.setProperty('--coral',t.coral);
  r.setProperty('--bg',t.bg);r.setProperty('--arg',t.arg);r.setProperty('--vrg',t.vrg);r.setProperty('--bgr',t.bgr);
  if(save){try{localStorage.setItem('bd_theme',k)}catch(e){}}};
 var k='mint';try{k=localStorage.getItem('bd_theme')||'mint'}catch(e){}
 window.setTheme(k,false);
})();
"""


def page(title, body, script="", gate=False):
    return ("<!doctype html><html lang='en'><head><meta charset='utf-8'>"
            "<meta name='viewport' content='width=device-width,initial-scale=1,viewport-fit=cover'>"
            "<meta name='theme-color' content='#070b0d'><meta name='apple-mobile-web-app-capable' content='yes'>"
            f"<title>{title}</title>{FONTS}<style>{CSS}</style><script>{THEME_JS}</script></head><body><div class='wrap'>{body}</div>"
            f"{gate_html() if gate else ''}<script>{('window.BD_NOAUTO=true;' if gate == 'manual' else '') + (GATE_JS if gate else '')}</script><script>{script}</script></body></html>")



LANDING_CSS_BASE = """
.wrap.land{min-height:calc(100svh - 48px);display:flex;flex-direction:column;position:relative;z-index:1}
.top{display:flex;justify-content:space-between;align-items:center}
.logo{display:flex;align-items:center;gap:9px;font:700 16px 'Space Grotesk',sans-serif;letter-spacing:.02em}
.logo i{width:28px;height:28px;border-radius:10px;background:linear-gradient(135deg,var(--mint),var(--violet));box-shadow:0 0 18px rgba(var(--arg),.5)}
.gear{width:42px;height:42px;border-radius:50%;display:grid;place-items:center;background:var(--card);border:1px solid var(--line);color:var(--txt);backdrop-filter:blur(10px)}
.palwrap{display:flex;align-items:center;gap:8px;font:10px 'Space Mono',monospace;letter-spacing:.1em;color:var(--dim)}
#pal{display:flex;gap:7px}
#pal button{width:22px;height:22px;border-radius:50%;border:2px solid transparent;cursor:pointer;padding:0}
#pal button.on{border-color:#fff;box-shadow:0 0 0 2px rgba(255,255,255,.15)}
.mid{flex:1;display:flex;flex-direction:column;justify-content:center;padding:20px 0}
.hl{font-size:clamp(46px,14vw,68px);line-height:1;margin:0 0 14px;letter-spacing:-.025em}
.hl em{font-style:normal;background:linear-gradient(90deg,var(--mint),var(--cyan),var(--violet));-webkit-background-clip:text;background-clip:text;color:transparent}
.sub{color:var(--dim);line-height:1.5;font-size:17px;max-width:360px;margin-bottom:0}
.orb{position:fixed;border-radius:50%;filter:blur(70px);opacity:.38;z-index:0;pointer-events:none;animation:drift 14s ease-in-out infinite alternate}
.o1{width:300px;height:300px;background:var(--mint);left:-90px;top:12%}
.o2{width:280px;height:280px;background:var(--violet);right:-100px;top:42%;animation-delay:-5s}
.o3{width:220px;height:220px;background:var(--cyan);left:30%;bottom:-80px;animation-delay:-9s}
@keyframes drift{to{transform:translate(40px,-50px) scale(1.15)}}
@media (prefers-reduced-motion:reduce){.orb{animation:none}}
"""

LANDING_JS = ""


@app.route("/")
def home():
    css = (LANDING_CSS_BASE)
    body = ("<style>" + css + "</style>"
            "<div class='orb o1'></div><div class='orb o2'></div><div class='orb o3'></div>"
            "<div class='top'><div class='logo'><i></i>BreakDecode</div>"
            "<a class='gear' href='/settings' aria-label='Settings'><svg viewBox='0 0 24 24' width='22' height='22' fill='none' stroke='currentColor' stroke-width='1.8' stroke-linecap='round' stroke-linejoin='round'><circle cx='12' cy='12' r='3.2'/><path d='M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z'/></svg></a></div>"
            "<div class='mid'><h1 class='hl'>Your breaking,<br><em>decoded.</em></h1>"
            "<p class='sub'>Coach-style feedback on your moves, in plain words.</p></div>"
            "<a class='btn' href='/start' style='margin-top:0'>Start your journey</a>")
    return page("BreakDecode", body, LANDING_JS).replace("<div class='wrap'>", "<div class='wrap land'>", 1)


SETTINGS_CSS = """
.sw{display:flex;gap:12px;flex-wrap:wrap;margin-top:12px}
.sw button{width:46px;height:46px;border-radius:50%;border:2px solid transparent;cursor:pointer;padding:0}
.sw button.on{border-color:#fff;box-shadow:0 0 0 3px rgba(255,255,255,.15)}
.sw span{display:block;font:10px 'Space Mono',monospace;letter-spacing:.08em;color:var(--dim);text-align:center;margin-top:6px}
.sw div{display:flex;flex-direction:column;align-items:center}
.card h2{margin-top:0}
.danger{color:var(--coral);border-color:rgba(255,107,107,.45)}
"""

SETTINGS_JS = """
(function(){
 var T=window.BD_THEMES,box=document.getElementById('sw'),cur='mint';
 try{cur=localStorage.getItem('bd_theme')||'mint'}catch(e){}
 Object.keys(T).forEach(function(k){var w=document.createElement('div'),b=document.createElement('button'),l=document.createElement('span');
  b.type='button';b.setAttribute('aria-label',T[k].n+' colors');b.style.background='linear-gradient(135deg,'+T[k].mint+','+T[k].violet+')';if(k===cur)b.className='on';l.textContent=T[k].n;
  b.onclick=function(){window.setTheme(k,true);[].slice.call(box.querySelectorAll('button')).forEach(function(x){x.className=''});b.className='on'};
  w.appendChild(b);w.appendChild(l);box.appendChild(w)});
 document.getElementById('rules').onclick=function(){window.openRules(true)};
 var del=document.getElementById('del'),msg=document.getElementById('delmsg'),armed=false,t;
 del.onclick=function(){
  if(!armed){armed=true;del.textContent='Tap again to confirm';clearTimeout(t);t=setTimeout(function(){armed=false;del.textContent='Delete all my videos and results'},4000);return}
  armed=false;del.disabled=true;
  fetch('/settings/clear',{method:'POST'}).then(function(r){return r.json()}).then(function(j){
   msg.textContent=j.deleted===0?'Nothing to delete.':'Deleted '+j.deleted+' scan'+(j.deleted===1?'':'s')+'.';del.textContent='Delete all my videos and results';del.disabled=false})
  .catch(function(){msg.textContent='Could not delete. Is the app still running?';del.disabled=false;del.textContent='Delete all my videos and results'})};
})();
"""


@app.route("/settings")
def settings():
    body = ("<style>" + SETTINGS_CSS + "</style>"
            "<a class='back' href='/start'>&larr; Menu</a><div class='mono'>SETTINGS</div><h1>Settings.</h1>"
            "<div class='card'><h2>Colors</h2><p>Pick the look you like. It's remembered on this device.</p><div class='sw' id='sw'></div></div>"
            "<div class='card'><h2>Filming guidelines</h2><p>The five rules for a clean scan.</p>"
            "<button type='button' class='btn ghost' id='rules'>View guidelines</button></div>"
            "<div class='card'><h2>Your videos</h2><p>Your uploads and results are stored on this computer while the app is running. You can delete them any time.</p>"
            "<button type='button' class='btn ghost danger' id='del'>Delete all my videos and results</button><p class='small' id='delmsg'></p></div>"
            "<div class='card'><h2>About</h2><p>BreakDecode, early version. Flare is the only move I can judge so far. Windmill and Airflare are coming later.</p></div>")
    return page("Settings", body, SETTINGS_JS, gate="manual")


@app.route("/settings/clear", methods=["POST"])
def settings_clear():
    deleted = 0
    for name in os.listdir(JOBS_DIR):
        folder = os.path.join(JOBS_DIR, name)
        if not os.path.isdir(folder):
            continue
        with LOCK:
            busy = JOBS.get(name, {}).get("state") in ("queued", "running")
        if busy:
            continue
        shutil.rmtree(folder, ignore_errors=True)
        with LOCK:
            JOBS.pop(name, None)
        deleted += 1
    return jsonify(deleted=deleted)


HUB_CSS = """
.hub{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-top:8px}
.hub a.card{position:relative;overflow:hidden;display:flex;flex-direction:column;justify-content:space-between;aspect-ratio:1/1;margin:0;padding:12px;text-decoration:none;color:inherit;
 border-radius:22px;border:1px solid rgba(255,255,255,.09);background:linear-gradient(160deg,rgba(255,255,255,.09),rgba(255,255,255,.02) 60%);
 box-shadow:0 10px 30px rgba(0,0,0,.35),inset 0 1px 0 rgba(255,255,255,.12);transition:transform .15s ease;opacity:0;animation:rise .5s ease forwards}
.hub a.card:nth-child(2){animation-delay:.08s}.hub a.card:nth-child(3){animation-delay:.16s}.hub a.card:nth-child(4){animation-delay:.24s}
.hub a.card:active{transform:scale(.96);background:linear-gradient(150deg,var(--mint),var(--cyan));color:#04110d;border-color:transparent}
.hub a.card:active p{color:rgba(4,17,13,.7)}
.hub a.card:active .ic,.hub a.card:active .arr{background:rgba(4,17,13,.14);color:#04110d}
@media (hover:hover){.hub a.card:hover{border-color:rgba(var(--arg),.5);box-shadow:0 14px 40px rgba(var(--arg),.18)}}
.hub a.card::before{content:'';position:absolute;width:150px;height:150px;right:-50px;top:-50px;border-radius:50%;
 background:radial-gradient(circle,rgba(var(--arg),.2),transparent 70%);pointer-events:none}
.hub a.card.hero{background:linear-gradient(150deg,var(--mint),var(--cyan));color:#04110d;border-color:transparent;box-shadow:0 14px 40px rgba(var(--arg),.35)}
.hub a.card.hero::before{background:radial-gradient(circle,rgba(255,255,255,.45),transparent 70%)}
.hub a.card.hero p{color:rgba(4,17,13,.7)}
.hub .ic{position:relative;width:38px;height:38px;border-radius:12px;flex:none;display:grid;place-items:center;
 background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.12);color:var(--mint);backdrop-filter:blur(8px)}
.hub .hero .ic{background:rgba(4,17,13,.14);border-color:rgba(4,17,13,.12);color:#04110d}
.hub .ic svg{width:20px;height:20px}
.hub .arr{display:none;position:absolute;right:14px;top:14px;width:30px;height:30px;border-radius:50%;place-items:center;
 background:rgba(255,255,255,.08);font-size:15px;color:var(--txt)}
.hub .hero .arr{background:rgba(4,17,13,.16);color:#04110d}
.hub h2{margin:0;font-size:14.5px;line-height:1.2;letter-spacing:-.01em}.hub p{display:none}
@keyframes rise{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:none}}
.res{display:flex;align-items:center;gap:12px}
.res a{flex:1;color:inherit;text-decoration:none}
.res h2{margin:0;font-size:19px}.res p{margin:2px 0 0;font-size:13px}
.res button{background:none;border:1px solid var(--line);color:var(--dim);border-radius:12px;padding:8px 12px;font:13px 'Space Grotesk',sans-serif;cursor:pointer}
.res button.arm{color:var(--coral);border-color:rgba(255,107,107,.45)}
"""


RES_CSS = """
.focus h2{font-size:23px;line-height:1.2;margin:8px 0 6px}.focus p{margin:0}
.focus{border-color:rgba(255,107,107,.3)}.focus::before{background:radial-gradient(circle,rgba(255,107,107,.3),transparent 70%)!important}
.focus.good{border-color:rgba(var(--arg),.35)}.focus.good::before{background:radial-gradient(circle,rgba(var(--arg),.3),transparent 70%)!important}
.focus .mono{margin-bottom:2px}
.prog .legend{display:flex;gap:16px;margin:12px 0 4px;font-size:12px;color:var(--dim)}.prog .legend span{display:flex;align-items:center;gap:6px}
.prow{padding:12px 0;border-top:1px solid rgba(255,255,255,.07)}.prow:first-of-type{border-top:0}
.pname{font-weight:600;font-size:15px}
.dots{display:flex;gap:8px;margin:9px 0 7px;flex-wrap:wrap}
i.d{display:inline-block;width:16px;height:16px;border-radius:50%;background:rgba(255,255,255,.12)}
i.d.issue{background:var(--coral);box-shadow:0 0 12px rgba(255,107,107,.5)}
i.d.ok{background:var(--mint);box-shadow:0 0 12px rgba(var(--arg),.5)}
.legend i.d{width:10px;height:10px}
.pv{font-size:13px;color:var(--dim)}.pv.good{color:var(--mint);font-weight:600}.pv.bad{color:var(--coral)}
.crow{display:flex;align-items:center;gap:12px;padding:13px 0;border-top:1px solid rgba(255,255,255,.07)}.crow:first-child{border-top:0;padding-top:2px}.crow:last-child{padding-bottom:2px}
.ck{width:28px;height:28px;border-radius:50%;display:grid;place-items:center;font-weight:700;font-size:15px;flex:none}
.ck.ok{background:var(--mint);color:#04110d}.ck.mid{background:rgba(var(--arg),.2);color:var(--mint)}.ck.bad{background:rgba(255,107,107,.2);color:var(--coral)}
.cn{font-weight:600;font-size:16px;flex:1}.ct{font-size:13px;color:var(--dim)}.ct.good{color:var(--mint)}.ct.bad{color:var(--coral)}
.lh{font:600 12px 'Space Mono',monospace;letter-spacing:.12em;color:var(--dim);margin:22px 0 10px;text-transform:uppercase}
.res .th{width:62px;height:62px;border-radius:16px;object-fit:cover;flex:none;border:1px solid rgba(255,255,255,.1)}
.res .th.ph{background:rgba(255,255,255,.06)}
.res .tg{display:inline-block;margin-top:7px;font-size:11px;padding:3px 9px;border-radius:99px;border:1px solid var(--line);color:var(--dim)}
.res .tg.bad{color:var(--coral);border-color:rgba(255,107,107,.4)}.res .tg.ok{color:var(--mint);border-color:rgba(var(--arg),.4)}
.res h2{font-size:16px!important;line-height:1.25}
"""



def _icon(path):
    return ("<span class='ic'><svg viewBox='0 0 24 24' width='24' height='24' fill='none' stroke='currentColor' stroke-width='1.8' "
            "stroke-linecap='round' stroke-linejoin='round'>" + path + "</svg></span>")


REMIND = {
    "onward": "Don't stop after one round. Keep going into the next one, even if it's messy.",
    "start": "Open your legs before the first round, so you have momentum going in.",
    "legs": "Keep your legs wide through the whole flare. Don't let them close in.",
    "kick": "Kick your legs out to the sides, up toward your head.",
    "drop": "Keep your knees up between flares. Don't let them touch down.",
    "lift": "Get your hips high. Push the floor away.",
    "flip": "Get your body all the way around, with your head under your hips.",
    None: "Keep repeating your flare today. Clean reps make it solid.",
}
REMIND_FIRST = "Film in good light, with your whole body in frame, then scan your first move."


def _newest_scan():
    """the most recent finished scan (reads its saved results; an older scan gets read once, only this one)"""
    best = None
    for name in os.listdir(JOBS_DIR):
        folder = os.path.join(JOBS_DIR, name)
        if not (re.fullmatch(r"[0-9a-f]{10}", name) and os.path.isdir(folder)):
            continue
        fs = os.listdir(folder)
        if not any(x.endswith("_feedback.html") for x in fs):
            continue
        ref = [x for x in fs if x.endswith("_rtm_data.csv")] or [x for x in fs if x.endswith("_feedback.html")]
        t = os.path.getmtime(os.path.join(folder, ref[0]))
        if best is None or t > best[0]:
            best = (t, name)
    return _scan_info(best[1]) if best else None


def _reminder_text(sc=None):
    """a short 'remember this in training today' line, from the dancer's latest scan"""
    if sc is None or not sc.get("info"):
        return REMIND_FIRST if sc is None else REMIND[None]
    return REMIND.get(sc["info"].get("main"), REMIND[None])


REMIND_CSS = """
.tip{display:flex;gap:14px;align-items:flex-start;margin:0 0 16px;padding:16px;border-radius:24px;position:relative;
 background:linear-gradient(135deg,rgba(var(--arg),.16),rgba(var(--vrg),.12));border:1px solid rgba(var(--arg),.22)}
.tip .ti{flex:none;width:44px;height:44px;border-radius:15px;display:grid;place-items:center;background:rgba(255,255,255,.1);color:var(--mint)}
.tip .tl{font:700 10.5px 'Space Mono',monospace;letter-spacing:.14em;color:var(--mint);margin-bottom:4px}
.tip .tm{font-size:13px;color:var(--dim);margin:0 0 5px}
.tip p{margin:0;font-size:15px;line-height:1.45;color:var(--txt);padding-right:22px}
.tip .x{position:absolute;top:10px;right:12px;width:26px;height:26px;border:0;border-radius:50%;background:rgba(255,255,255,.08);color:var(--dim);font-size:16px;line-height:1;cursor:pointer}
"""

REMIND_JS = """
document.querySelectorAll('.when').forEach(function(e){if(!e.dataset.t)return;var d=new Date(+e.dataset.t*1000);e.textContent=d.toLocaleDateString(undefined,{weekday:'short',day:'numeric',month:'short'})+', '+d.toLocaleTimeString(undefined,{hour:'numeric',minute:'2-digit'})});
(function(){var d=new Date(),k='bd_rem_'+d.getFullYear()+'-'+(d.getMonth()+1)+'-'+d.getDate(),el=document.getElementById('tip');
 try{if(sessionStorage.getItem(k)&&location.search.indexOf('reminder')<0){el.style.display='none';return}}catch(e){}
 document.getElementById('tipx').onclick=function(){el.style.display='none';try{sessionStorage.setItem(k,'1')}catch(e){}}})();
"""


def _scan_times():
    out = []
    for name in os.listdir(JOBS_DIR):
        folder = os.path.join(JOBS_DIR, name)
        if not (re.fullmatch(r"[0-9a-f]{10}", name) and os.path.isdir(folder)):
            continue
        fs = os.listdir(folder)
        if not any(x.endswith("_feedback.html") for x in fs):
            continue
        ref = [x for x in fs if x.endswith("_rtm_data.csv")] or [x for x in fs if x.endswith("_feedback.html")]
        out.append({"t": int(os.path.getmtime(os.path.join(folder, ref[0]))), "j": name})
    return out


HUB2_CSS = """
.hub2{padding-bottom:128px}
.hub2 .topbar{display:flex;align-items:center;justify-content:space-between;margin-bottom:20px}
.hub2 .lg{display:flex;align-items:center;gap:9px;font:700 16px 'Space Grotesk',sans-serif;letter-spacing:-.01em}
.hub2 .lg i{width:26px;height:26px;border-radius:9px;background:linear-gradient(135deg,var(--mint),var(--violet));box-shadow:0 0 18px rgba(var(--arg),.45)}
.hub2 .dt{font-size:14px;font-weight:600;color:var(--dim)}
.hub2 h1{font-size:clamp(38px,11vw,48px);line-height:1;letter-spacing:-.045em;margin:0 0 18px;font-weight:700}
.dash{display:grid;grid-template-columns:1.55fr 1fr;gap:12px}
.dash>*{margin:0!important}
.gl{position:relative;overflow:hidden;border-radius:28px;color:inherit;background:linear-gradient(160deg,rgba(255,255,255,.14),rgba(255,255,255,.04));border:1px solid rgba(255,255,255,.14);box-shadow:0 14px 40px rgba(0,0,0,.35);transition:transform .12s,background .15s}
.dash .wide{grid-column:1/-1}
.tipc{padding:18px}
.tipc .tl{display:flex;align-items:center;gap:8px;color:var(--mint);font-size:13px;font-weight:600}
.tipc .tl svg{width:18px;height:18px}
.tipc p{margin:9px 0 0;font-size:19px;line-height:1.35;font-weight:600;letter-spacing:-.01em;padding-right:26px}
.tipc .x{position:absolute;top:12px;right:12px;width:28px;height:28px;border:0;border-radius:50%;background:rgba(255,255,255,.08);color:var(--dim);font-size:17px;cursor:pointer}
.wkc{padding:16px 18px}
.wkc .wt{display:flex;justify-content:space-between;align-items:baseline;margin-bottom:12px}
.wkc .wt b{font-size:16px}.wkc .wt span{font-size:13px;color:var(--dim)}
.week{display:flex;justify-content:space-between}
.week .dy{display:flex;flex-direction:column;align-items:center;gap:7px;font-size:12px;color:var(--dim);font-weight:600}
.week .dc{width:34px;height:34px;border-radius:50%;background:rgba(255,255,255,.07);display:grid;place-items:center;color:#04110d;font-size:15px;font-weight:700}
.week .dc.on{background:linear-gradient(135deg,var(--mint),var(--cyan));box-shadow:0 0 20px rgba(var(--arg),.45)}
.week .dc.today{box-shadow:0 0 0 2px var(--bg),0 0 0 4px rgba(255,255,255,.55)}
.week .dc.on.today{box-shadow:0 0 0 2px var(--bg),0 0 0 4px rgba(255,255,255,.55),0 0 20px rgba(var(--arg),.45)}
.week .dy.t{color:var(--txt)}
.week a.dy{cursor:pointer;transition:transform .12s}.week a.dy:active{transform:scale(.92)}
.shot{grid-row:span 2;min-height:236px;display:flex;flex-direction:column;justify-content:flex-end;padding:16px;
 background:radial-gradient(120% 90% at 85% 10%,rgba(var(--vrg),.5),transparent 60%),radial-gradient(110% 90% at 0% 100%,rgba(var(--arg),.45),transparent 60%),#0c1215}
.shot .pi{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
.shot::after{content:'';position:absolute;inset:0;background:linear-gradient(180deg,rgba(5,8,10,.08) 30%,rgba(5,8,10,.88));pointer-events:none}
.shot>*:not(.pi){position:relative;z-index:1}
.shot .sl{font-size:12.5px;color:rgba(255,255,255,.75);margin-bottom:2px}
.shot h2{margin:0;font-size:30px;line-height:1.05;letter-spacing:-.035em;color:#fff}
.shot .tg{align-self:flex-start;margin-top:8px;display:inline-block;padding:4px 11px;border-radius:99px;background:rgba(0,0,0,.4);backdrop-filter:blur(10px);border:1px solid rgba(255,255,255,.18);font-size:12px;font-weight:600;color:#fff}
.shot .tg.bad{color:#ff9a9a;border-color:rgba(255,107,107,.55)}.shot .tg.ok{color:var(--mint);border-color:rgba(var(--arg),.5)}
.mini{padding:16px;min-height:112px;display:flex;flex-direction:column;justify-content:space-between}
.mini svg{width:28px;height:28px;color:var(--mint);filter:drop-shadow(0 0 10px rgba(var(--arg),.4))}
.mini b{font-size:17px;letter-spacing:-.01em}
a.gl:active{transform:scale(.97);background:linear-gradient(135deg,var(--mint),var(--cyan));color:#04110d}
a.gl:active svg{color:#04110d;filter:none}
.scanbtn{position:fixed;left:50%;transform:translateX(-50%);bottom:calc(18px + env(safe-area-inset-bottom));z-index:50;width:min(520px,calc(100% - 36px));height:68px;border-radius:34px;display:flex;align-items:center;justify-content:center;gap:10px;
 font:700 18px 'Space Grotesk',sans-serif;color:#04110d;background:linear-gradient(90deg,var(--mint),var(--cyan));box-shadow:0 14px 40px rgba(var(--arg),.38);transition:transform .12s}
.scanbtn:active{transform:translateX(-50%) scale(.97)}
.scanbtn svg{width:24px;height:24px}
.wrap>.scanbtn{animation:none;opacity:1}
"""

HUB2_JS = """
(function(){var h=new Date().getHours(),g=h<5?'Late night.':h<12?'Good morning.':h<18?'Good afternoon.':'Good evening.';document.getElementById('greet').textContent=g;document.getElementById('today').textContent=new Date().toLocaleDateString('en',{weekday:'short',day:'numeric',month:'short'})})();
(function(){var S=window.SCANS||[],T=S.map(function(s){var d=new Date(s.t*1000);return d.getFullYear()+'-'+d.getMonth()+'-'+d.getDate()});
 var now=new Date(),dow=(now.getDay()+6)%7,mon=new Date(now.getFullYear(),now.getMonth(),now.getDate()-dow),L=['M','T','W','T','F','S','S'],box=document.getElementById('week'),n=0;
 for(var i=0;i<7;i++){var d=new Date(mon.getFullYear(),mon.getMonth(),mon.getDate()+i),k=d.getFullYear()+'-'+d.getMonth()+'-'+d.getDate(),on=T.indexOf(k)>=0,td=i===dow;if(on)n++;
  var w=document.createElement(on?'a':'div');w.className='dy'+(td?' t':'');
  if(on){w.href='/results?day='+k;w.setAttribute('aria-label','Scans from this day')}
  w.innerHTML='<div class="dc'+(on?' on':'')+(td?' today':'')+'">'+(on?'\u2713':'')+'</div>'+L[i];box.appendChild(w)}
 document.getElementById('wk').textContent=n?n+(n===1?' day':' days')+' trained':'Nothing yet'})();
"""


@app.route("/start")
def hub():
    items = [
        ("/moves", "Scan a move",
         _icon("<path d='M15 8l6-3v14l-6-3'/><rect x='2' y='6' width='13' height='12' rx='2'/>")),
        ("/results", "My results",
         _icon("<path d='M4 20V10M10 20V4M16 20v-8M22 20H2'/>")),
        ("/settings", "Settings",
         _icon("<circle cx='12' cy='12' r='3'/><path d='M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1'/>")),
    ]
    last = _newest_scan()
    ico = lambda p, w=24: ("<svg width='%d' height='%d' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='1.8' stroke-linecap='round' stroke-linejoin='round'>" % (w, w) + p + "</svg>")
    P_SCAN = "<path d='M15 8l6-3v14l-6-3'/><rect x='2' y='6' width='13' height='12' rx='2'/>"
    P_RES = "<path d='M4 20V10M10 20V4M16 20v-8M22 20H2'/>"
    P_SET = "<circle cx='12' cy='12' r='3'/><path d='M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1'/>"
    P_BULB = "<path d='M9 18h6M10 21h4M12 3a6 6 0 0 0-4 10.5c.8.8 1 1.5 1 2.5h6c0-1 .2-1.7 1-2.5A6 6 0 0 0 12 3z'/>"
    if last:
        tl, tx = "Today, for your " + last["move"], _reminder_text(last)
        inf = last["info"]
        tag = ("<span class='tg bad'>" + AREA_NAME[inf["main"]] + "</span>") if inf and inf.get("main") else ("<span class='tg ok'>Looked good</span>" if inf else "")
        img = f"<img class='pi' src='/thumb/{last['job']}' alt=''>" if last["thumb"] else ""
        shot = (f"<a class='gl shot' href='/result/{last['job']}'>{img}<div class='sl'>Last scan</div><h2>{last['move']}</h2>{tag}</a>")
    else:
        tl, tx = "To get started", REMIND_FIRST
        shot = ("<a class='gl shot' href='/moves'><div class='sl'>No scans yet</div><h2>Film your first move</h2></a>")
    tip = ("<div class='gl tipc wide' id='tip'><div class='tl'>" + ico(P_BULB, 18) + tl + "</div><p>" + tx +
           "</p><button type='button' class='x' id='tipx' aria-label='Hide'>&times;</button></div>")
    week = ("<div class='gl wkc wide'><div class='wt'><b id='wk'></b><span>Your week</span></div><div class='week' id='week'></div></div>")
    mini = (f"<a class='gl mini' href='/results'>{ico(P_RES, 28)}<b>Results</b></a><a class='gl mini' href='/settings'>{ico(P_SET, 28)}<b>Settings</b></a>")
    orbs = "<div class='orb o1'></div><div class='orb o2'></div><div class='orb o3'></div>"
    orb_css = ".wrap>.orb{animation:none;opacity:.17}.orb{position:fixed;border-radius:50%;filter:blur(80px);z-index:0;pointer-events:none}.o1{width:300px;height:300px;background:var(--mint);left:-110px;top:8%}.o2{width:280px;height:280px;background:var(--violet);right:-120px;top:48%}.o3{width:220px;height:220px;background:var(--cyan);left:30%;bottom:-90px}.hub2{position:relative;z-index:1}"
    body = ("<style>" + RES_CSS + HUB2_CSS + orb_css + "</style>" + orbs +
            "<div class='hub2'><div class='topbar'><a class='lg' href='/'><i></i>BreakDecode</a><span class='dt' id='today'></span></div>"
            "<h1 id='greet'>Hello.</h1><div class='dash'>" + tip + week + shot + mini + "</div></div>"
            "<a class='scanbtn' href='/moves'>" + ico(P_SCAN, 24) + "Scan a move</a>")
    script = "window.SCANS=" + json.dumps(_scan_times()) + ";" + HUB2_JS + REMIND_JS
    return page("Menu", body, script)


AREA_NAME = {"onward": "Keep going", "start": "The start", "legs": "Legs open", "kick": "Kick to the sides",
             "drop": "Knees between flares", "lift": "Hip height", "flip": "Getting around"}
AREA_ORDER = ["onward", "start", "legs", "kick", "drop", "lift", "flip"]


def make_thumb(folder, filename):
    """a small picture from the middle of the clip, for the results list"""
    try:
        import cv2
        cap = cv2.VideoCapture(os.path.join(folder, filename))
        n = int(cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0)
        if n > 1:
            cap.set(cv2.CAP_PROP_POS_FRAMES, int(n * 0.4))
        ok, fr = cap.read()
        cap.release()
        if ok:
            h, w = fr.shape[:2]
            sc = 720.0 / max(h, w)
            fr = cv2.resize(fr, (max(1, int(w * sc)), max(1, int(h * sc))))
            cv2.imwrite(os.path.join(folder, "thumb.jpg"), fr, [cv2.IMWRITE_JPEG_QUALITY, 82])
    except Exception:
        pass


def _scan_info(name):
    """everything the results page needs about one finished scan (None if it isn't a finished scan)"""
    folder = os.path.join(JOBS_DIR, name)
    if not (re.fullmatch(r"[0-9a-f]{10}", name) and os.path.isdir(folder)):
        return None
    files = os.listdir(folder)
    fb = [x for x in files if x.endswith("_feedback.html")]
    if not fb:
        return None
    csvs = [x for x in files if x.endswith("_rtm_data.csv")]
    when = os.path.getmtime(os.path.join(folder, csvs[0] if csvs else fb[0]))
    fnd = [x for x in files if x.endswith("_findings.json")]
    need = not fnd
    if fnd:
        try:
            need = "rounds" not in json.load(open(os.path.join(folder, fnd[0])))
        except Exception:
            need = True
    if need and csvs and os.path.exists(ANALYZER):
        # an older scan, from before progress existed: read its saved skeleton again (quick, no video needed)
        try:
            env = dict(os.environ, FLARE_NO_OPEN="1", PYTHONIOENCODING="utf-8")
            subprocess.run([sys.executable, ANALYZER, os.path.join(folder, csvs[0])], cwd=folder, capture_output=True,
                           text=True, env=env, timeout=90)
            fnd = [x for x in os.listdir(folder) if x.endswith("_findings.json")]
        except Exception:
            pass
    info = None
    if fnd:
        try:
            info = json.load(open(os.path.join(folder, fnd[0])))
        except Exception:
            info = None
    if "thumb.jpg" not in files:
        clip = [x for x in files if x.startswith("clip.") and os.path.splitext(x)[1].lower() in ALLOWED]
        if clip:
            make_thumb(folder, clip[0])
            files = os.listdir(folder)
    key = "flare"
    try:
        key = json.load(open(os.path.join(folder, "meta.json"))).get("move", "flare")
    except Exception:
        pass
    mname = next((m["name"] for m in MOVES if m["key"] == key), "Flare")
    return {"job": name, "time": when, "info": info, "thumb": "thumb.jpg" in files, "move": mname, "key": key}


def _sentence(t):
    t = (t or "").strip()
    return t[:1].upper() + t[1:].lower() if t else ""


def _progress(scans):
    """scans = oldest first, only those with findings. Returns the focus text and one row per area that ever needed work."""
    hist = {k: [sc["info"]["areas"].get(k, "na") for sc in scans] for k in AREA_ORDER}
    rows = []
    for k in AREA_ORDER:
        states = [x for x in hist[k] if x != "na"]
        if "issue" not in states:
            continue
        last2 = states[-2:]
        if states[-1] == "ok" and len(states) >= 2 and last2 == ["ok", "ok"]:
            verdict, tone = "Fixed", "good"
        elif states[-1] == "ok":
            verdict, tone = "Looking better. Scan again to confirm.", "mid"
        else:
            run = 0
            for x in reversed(states):
                if x == "issue":
                    run += 1
                else:
                    break
            verdict, tone = ("Still showing up" if run >= 2 else "Needs work"), "bad"
        rows.append({"key": k, "dots": hist[k][-8:], "verdict": verdict, "tone": tone})
    return rows


@app.route("/results")
def results():
    scans = [x for x in (_scan_info(n) for n in os.listdir(JOBS_DIR)) if x]
    scans.sort(key=lambda x: x["time"])                          # oldest first
    with_info = [x for x in scans if x["info"]]
    rows = _progress(with_info) if with_info else []

    # ---- 1) the one thing to work on ----
    top = ""
    if with_info:
        latest = with_info[-1]["info"]
        if latest.get("main"):
            m = latest["main"]
            top = (f"<div class='card focus'><span class='mono'>WORK ON THIS</span><h2>{AREA_NAME[m]}</h2>"
                   f"<p>{_sentence(latest.get('headline'))}.</p></div>")
        else:
            top = ("<div class='card focus good'><span class='mono'>LOOKING GOOD</span><h2>Nothing to fix</h2>"
                   "<p>Your last scan looked clean. Repeat it to make it solid.</p></div>")

    share_btn = ""
    if with_info and _share_cards(with_info):
        share_btn = "<a class='btn' href='/share' style='margin:0 0 4px'>Share my progress</a>"

    # ---- 2) simple checklist: only the things that ever needed work ----
    prog = ""
    if rows:
        lines = ""
        for r in rows:
            if r["tone"] == "good":
                ic, txt = "<span class='ck ok'>&#10003;</span>", "Fixed"
            elif r["tone"] == "mid":
                ic, txt = "<span class='ck mid'>&#10003;</span>", "Looking better"
            else:
                ic, txt = "<span class='ck bad'>!</span>", "Still needs work"
            lines += f"<div class='crow'>{ic}<div class='cn'>{AREA_NAME[r['key']]}</div><div class='ct {r['tone']}'>{txt}</div></div>"
        note = "" if len(with_info) > 1 else "<p class='small' style='margin:10px 0 0'>Scan again after practising to see what changes.</p>"
        prog = "<h3 class='lh'>Your checklist</h3><div class='card'>" + lines + note + "</div>"

    # ---- the list of scans, newest first ----
    if scans:
        cards = ""
        for sc in reversed(scans):
            j = sc["job"]
            inf = sc["info"]
            tag = ""
            if inf:
                tag = ("<span class='tg bad'>" + AREA_NAME[inf["main"]] + "</span>") if inf.get("main") else "<span class='tg ok'>Looked good</span>"
            th = f"<img class='th' src='/thumb/{j}' alt=''>" if sc["thumb"] else ""
            cards += (f"<div class='card res'>{th}<a href='/result/{j}'><h2 class='when' data-t='{int(sc['time'])}'></h2>{tag}</a>"
                      f"<button type='button' class='del' data-j='{j}'>Delete</button></div>")
        lst = "<h3 class='lh'>Your scans</h3>" + cards
    else:
        lst = ("<div class='card'><h2>Nothing here yet</h2><p>Your scans will show up here after you film your first flare.</p></div>"
               "<a class='btn' href='/move/flare'>Scan a flare</a>")
    body = ("<style>" + HUB_CSS + RES_CSS + "</style><a class='back' href='/start'>&larr; Menu</a><div class='mono'>MY RESULTS</div>"
            "<h1>Your <em>progress.</em></h1>" + top + share_btn + prog + "<div id='list'>" + lst + "</div>"
            "<p class='small'>Saved on this computer. Delete any scan you don't want to keep.</p>")
    script = """
(function(){var m=location.search.match(/day=([0-9-]+)/);if(!m)return;var k=m[1];
 document.querySelectorAll('.res').forEach(function(c){var w=c.querySelector('.when');if(!w)return;var d=new Date(+w.dataset.t*1000);
  if((d.getFullYear()+'-'+d.getMonth()+'-'+d.getDate())!==k)c.style.display='none'});
 var p=k.split('-'),dd=new Date(+p[0],+p[1],+p[2]),b=document.createElement('div');b.className='card';b.style.padding='14px 16px';
 b.innerHTML='<b>'+dd.toLocaleDateString(undefined,{weekday:'long',day:'numeric',month:'short'})+'</b> <a href="/results" style="float:right;color:var(--mint);font-weight:600">Show all</a>';
 var l=document.getElementById('list');l.parentNode.insertBefore(b,l)})();
document.querySelectorAll('.when').forEach(function(e){var d=new Date(+e.dataset.t*1000);
 e.textContent=d.toLocaleDateString(undefined,{weekday:'short',day:'numeric',month:'short'})+', '+d.toLocaleTimeString(undefined,{hour:'numeric',minute:'2-digit'})});
document.querySelectorAll('.del').forEach(function(b){var armed=false,t;b.onclick=function(){
 if(!armed){armed=true;b.textContent='Sure?';b.className='del arm';clearTimeout(t);t=setTimeout(function(){armed=false;b.textContent='Delete';b.className='del'},3000);return}
 fetch('/results/delete/'+b.dataset.j,{method:'POST'}).then(function(){location.reload()})}});
"""
    return page("My results", body, script)


@app.route("/thumb/<job>")
def thumb(job):
    if not re.fullmatch(r"[0-9a-f]{10}", job):
        abort(404)
    p = os.path.join(JOBS_DIR, job, "thumb.jpg")
    if not os.path.exists(p):
        abort(404)
    return send_file(p)


@app.route("/results/delete/<job>", methods=["POST"])
def results_delete(job):
    if not re.fullmatch(r"[0-9a-f]{10}", job):
        abort(404)
    with LOCK:
        busy = JOBS.get(job, {}).get("state") in ("queued", "running")
    if not busy:
        shutil.rmtree(os.path.join(JOBS_DIR, job), ignore_errors=True)
        with LOCK:
            JOBS.pop(job, None)
    return jsonify(ok=True)


SHARE_JS = r"""
const CARDS=window.CARDS||[];
const root=document.getElementById('cards');
function css(v){return getComputedStyle(document.documentElement).getPropertyValue(v).trim()}
function hex2rgb(h){h=h.replace('#','');if(h.length===3)h=h.split('').map(c=>c+c).join('');const n=parseInt(h,16);return[(n>>16)&255,(n>>8)&255,n&255]}
function draw(c,card){
 const W=1080,H=1920,x=c.getContext('2d');c.width=W;c.height=H;
 const mint=css('--mint')||'#5cffc4',cyan=css('--cyan')||'#4fd8ff',vio=css('--violet')||'#9d7bff';
 const F="'Space Grotesk',system-ui,sans-serif",M="'Space Mono',monospace";
 const rgba=(h,a)=>{const r=hex2rgb(h);return'rgba('+r[0]+','+r[1]+','+r[2]+','+a+')'};
 function ls(v){try{x.letterSpacing=v}catch(e){}}
 // base + mesh gradient
 x.fillStyle='#07090c';x.fillRect(0,0,W,H);
 function blob(cx,cy,r,col,a){const g=x.createRadialGradient(cx,cy,0,cx,cy,r);g.addColorStop(0,rgba(col,a));g.addColorStop(1,rgba(col,0));x.fillStyle=g;x.fillRect(0,0,W,H)}
 blob(120,300,900,mint,.55);blob(1000,760,820,vio,.6);blob(260,1500,820,cyan,.4);blob(1000,1800,640,mint,.3);
 // grain
 const n=document.createElement('canvas');n.width=n.height=220;const nx=n.getContext('2d'),id=nx.createImageData(220,220);
 for(let i=0;i<id.data.length;i+=4){const v=Math.random()*255;id.data[i]=id.data[i+1]=id.data[i+2]=v;id.data[i+3]=22}
 nx.putImageData(id,0,0);x.fillStyle=x.createPattern(n,'repeat');x.fillRect(0,0,W,H);
 function glass(px,py,w,h,r,hot){x.save();x.shadowColor='rgba(0,0,0,.45)';x.shadowBlur=50;x.shadowOffsetY=20;
  const g=x.createLinearGradient(px,py,px+w,py+h);
  if(hot){g.addColorStop(0,mint);g.addColorStop(1,cyan)}else{g.addColorStop(0,'rgba(255,255,255,.20)');g.addColorStop(1,'rgba(255,255,255,.05)')}
  x.fillStyle=g;x.beginPath();x.roundRect(px,py,w,h,r);x.fill();x.restore();
  x.strokeStyle=hot?'rgba(255,255,255,.5)':'rgba(255,255,255,.22)';x.lineWidth=2.5;x.beginPath();x.roundRect(px,py,w,h,r);x.stroke()}
 function chip(txt,px,py,hot,rot){x.save();x.translate(px,py);if(rot)x.rotate(rot);x.font='700 34px '+M;ls('3px');
  const w=x.measureText(txt).width+64,h=68;glass(0,0,w,h,34,hot);x.fillStyle=hot?'#05110d':'#fff';x.textAlign='left';x.textBaseline='middle';x.fillText(txt,32,h/2+2);x.restore();ls('0px');return w}
 // top bar
 x.textBaseline='alphabetic';
 x.save();x.font='700 34px '+F;ls('1px');const lw=x.measureText('BreakDecode').width+110;glass(70,90,lw,84,42,false);
 x.fillStyle=mint;x.beginPath();x.arc(120,132,14,0,7);x.shadowColor=mint;x.shadowBlur=24;x.fill();x.shadowBlur=0;
 x.fillStyle='#fff';x.textAlign='left';x.textBaseline='middle';x.fillText('BreakDecode',150,134);x.restore();ls('0px');
 const d=new Date();const ds=d.toLocaleDateString('en',{day:'numeric',month:'short'}).toUpperCase();
 x.save();x.font='700 30px '+M;ls('3px');const dw=x.measureText(ds).width+56;glass(W-70-dw,90,dw,84,42,false);x.fillStyle='rgba(255,255,255,.85)';x.textAlign='center';x.textBaseline='middle';x.fillText(ds,W-70-dw/2,134);x.restore();ls('0px');
 x.textBaseline='alphabetic';x.textAlign='center';
 // hero number with glow
 const oy=card.kind==='progress'?0:90;const big=card.big,hs=big.length>3?300:(big.length>2?380:470);
 x.save();x.font='700 '+hs+'px '+F;ls(big.length>1?'-14px':'0px');
 const tg=x.createLinearGradient(260,380,820,900);tg.addColorStop(0,'#ffffff');tg.addColorStop(.45,mint);tg.addColorStop(1,cyan);
 x.shadowColor=rgba(mint,.55);x.shadowBlur=90;x.fillStyle=tg;x.fillText(big,540,820+oy);x.shadowBlur=0;x.fillText(big,540,820+oy);x.restore();ls('0px');
 // sticker
 chip(card.chip||card.label,90,330+oy,true,-.07);
 // title
 x.fillStyle='#fff';x.font='700 '+(card.title.length>9?100:150)+'px '+F;ls('-3px');x.fillText(card.title,540,990+oy);ls('0px');
 x.fillStyle='rgba(255,255,255,.7)';x.font='500 46px '+F;(card.lines||[]).forEach((t,i)=>x.fillText(t,540,1090+oy+i*62));
 // bento tiles for progress
 function rings(px,py,count,col){const m=Math.min(count,10);for(let i=0;i<m;i++){const cx=px+i*46,cy=py;x.strokeStyle=col;x.lineWidth=7;x.beginPath();x.arc(cx,cy,15,0,7);x.stroke()}}
 if(card.kind==='progress'){
  const ty=1260,th=330;
  glass(70,ty,440,th,56,false);glass(570,ty,440,th,56,true);
  x.textAlign='left';
  x.fillStyle='rgba(255,255,255,.6)';x.font='700 28px '+M;ls('3px');x.fillText('FIRST SCAN',110,ty+70);
  x.fillStyle='rgba(5,17,13,.65)';x.fillText('NOW',610,ty+70);ls('0px');
  x.fillStyle='#fff';x.font='700 150px '+F;x.fillText(card.then,110,ty+215);
  x.fillStyle='#05110d';x.fillText(card.now,610,ty+215);
  x.font='700 150px '+F;const w1=x.measureText(card.then).width,w2=x.measureText(card.now).width;x.font='500 34px '+F;
  x.fillStyle='rgba(255,255,255,.6)';x.fillText(card.then==='1'?'round':'rounds',110+w1+16,ty+215);
  x.fillStyle='rgba(5,17,13,.7)';x.fillText(card.now==='1'?'round':'rounds',610+w2+16,ty+215);
  rings(122,ty+275,+card.then,'rgba(255,255,255,.55)');rings(622,ty+275,+card.now,'#05110d');
  // arrow bubble
  x.fillStyle='#05090b';x.beginPath();x.arc(540,ty+th/2,46,0,7);x.fill();x.strokeStyle='rgba(255,255,255,.3)';x.lineWidth=2.5;x.stroke();
  x.fillStyle=mint;x.font='700 54px '+F;x.textAlign='center';x.fillText('→',540,ty+th/2+19);
 }
 if(card.kind!=='progress'){
  glass(70,1330,940,250,56,false);x.textAlign='left';x.fillStyle='rgba(255,255,255,.6)';x.font='700 28px '+M;ls('3px');
  x.fillText(card.kind==='fixed'?'LAST 2 SCANS':'SCANS SO FAR',120,1405);ls('0px');
  const k=card.kind==='fixed'?2:Math.min(+card.big||1,10);
  for(let i=0;i<k;i++){const cx=140+i*(k>5?84:110),cy=1500;x.fillStyle=mint;x.beginPath();x.arc(cx,cy,card.kind==='fixed'?38:30,0,7);x.shadowColor=mint;x.shadowBlur=24;x.fill();x.shadowBlur=0;
   if(card.kind==='fixed'){x.strokeStyle='#05110d';x.lineWidth=8;x.lineCap='round';x.beginPath();x.moveTo(cx-14,cy+2);x.lineTo(cx-4,cy+13);x.lineTo(cx+16,cy-11);x.stroke()}}
  x.textAlign='center'}
 // bottom bar
 x.textAlign='center';
 glass(70,1700,940,120,60,false);
 x.fillStyle='rgba(255,255,255,.9)';x.font='600 36px '+F;ls('0.5px');x.fillText('Scan your breaking at BreakDecode',540,1772);ls('0px');
}
function save(c,name,share){
 c.toBlob(async b=>{const f=new File([b],name+'.png',{type:'image/png'});
  if(share&&navigator.canShare&&navigator.canShare({files:[f]})){try{await navigator.share({files:[f],title:'My progress on BreakDecode'});return}catch(e){if(e&&e.name==='AbortError')return}}
  const a=document.createElement('a');a.href=URL.createObjectURL(b);a.download=name+'.png';a.click()},'image/png')}
async function go(){
 try{await Promise.all([document.fonts.load("700 100px 'Space Grotesk'"),document.fonts.load("500 30px 'Space Grotesk'"),document.fonts.load("700 30px 'Space Mono'")])}catch(e){}
 CARDS.forEach((card,i)=>{
  const w=document.createElement('div');w.className='card sc';
  const c=document.createElement('canvas');c.className='cv';draw(c,card);
  const b=document.createElement('button');b.className='btn';b.type='button';b.textContent='Share to story';b.onclick=()=>save(c,'breakdecode-'+(i+1),true);
  const d=document.createElement('button');d.className='btn ghost';d.type='button';d.textContent='Save picture';d.onclick=()=>save(c,'breakdecode-'+(i+1),false);
  w.appendChild(c);w.appendChild(b);w.appendChild(d);root.appendChild(w)})}
go();
"""

SHARE_CSS = """
.sc canvas{display:block;width:62%;max-width:280px;height:auto;margin:4px auto 4px;border-radius:22px;border:1px solid rgba(255,255,255,.12);box-shadow:0 14px 40px rgba(0,0,0,.5)}
.sc .btn{margin-top:10px}
"""


def _share_cards(with_info):
    cards = []
    ok = [x for x in with_info if x["info"].get("track", "ok") == "ok" and x["info"].get("rounds")]
    if ok:
        first, last = ok[0]["info"]["rounds"], ok[-1]["info"]["rounds"]
        if len(ok) > 1 and last > first:
            word = lambda n: f"{n} round" + ("" if n == 1 else "s")
            cards.append({"kind": "progress", "chip": "LEVEL UP", "label": "MY FLARE PROGRESS", "big": f"+{last - first}", "title": "ROUNDS" if last - first > 1 else "ROUND",
                          "lines": [f"From {word(first)} to {word(last)}", "Keep going."], "then": str(first), "now": str(last)})
    for r in _progress(with_info):
        if r["tone"] == "good":
            cards.append({"kind": "fixed", "chip": "FIXED", "label": "FIXED", "big": "✓", "title": AREA_NAME[r["key"]].upper(),
                          "lines": ["Fixed. It stayed good", "in my last 2 scans."]})
    n = len(with_info)
    if n >= 3:
        cards.append({"kind": "milestone", "chip": "MILESTONE", "label": "MILESTONE", "big": str(n), "title": "SCANS DONE", "lines": ["Showing up and", "working on my flares."]})
    if not cards and with_info:
        cards.append({"kind": "first", "chip": "DAY ONE", "label": "FIRST STEP", "big": "1", "title": "FLARE SCANNED", "lines": ["Day one of my", "flare journey."]} if n == 1
                     else {"kind": "milestone", "chip": "KEEP GOING", "label": "KEEP GOING", "big": str(n), "title": "SCANS DONE", "lines": ["Working on my flares."]})
    return cards


@app.route("/share")
def share():
    scans = [x for x in (_scan_info(n) for n in os.listdir(JOBS_DIR)) if x]
    scans.sort(key=lambda x: x["time"])
    with_info = [x for x in scans if x["info"]]
    cards = _share_cards(with_info)
    if cards:
        inner = ("<p class='lead'>Pick a card and post it to your story.</p><div id='cards'></div>"
                 "<p class='small'>On your phone, tap Share to story and choose Instagram. On a computer, the picture downloads.</p>")
    else:
        inner = ("<div class='card'><h2>Nothing to share yet</h2><p>Scan a flare and your first card shows up here. Scan again after practising and you can share your progress.</p></div>"
                 "<a class='btn' href='/move/flare'>Scan a flare</a>")
    body = ("<style>" + SHARE_CSS + "</style><a class='back' href='/results'>&larr; My results</a><div class='mono'>SHARE</div>"
            "<h1>Share your <em>progress.</em></h1>" + inner)
    script = "window.CARDS=" + json.dumps(cards).replace("</", "<\\/") + ";" + SHARE_JS
    return page("Share", body, script)


@app.route("/moves")
def moves():
    cards = ""
    for m in MOVES:
        if m["ready"]:
            cards += (f"<a class='card ready' href='/move/{m['key']}'><span class='pill'>{m['tag']}</span>"
                      f"<h2>{m['name']}</h2><p>{m['blurb']}</p></a>")
        else:
            cards += (f"<div class='card soon'><span class='pill'>{m['tag']}</span>"
                      f"<h2>{m['name']}</h2><p>{m['blurb']}</p></div>")
    body = ("<a class='back' href='/start'>&larr; Menu</a><div class='mono'>CHOOSE A MOVE</div><h1>Scan your <em>move.</em></h1>"
            "<p class='lead'>Film yourself, and get coach-style feedback with the fixes in plain words. Pick a move to start.</p>"
            + cards +
            "<p class='small'>Your video is only used to make your feedback. This is an early version, so treat it as a second pair of eyes, not the final word.</p>")
    return page("Choose a move", body)


@app.route("/move/<key>")
def move(key):
    m = next((x for x in MOVES if x["key"] == key), None)
    if m is None:
        abort(404)
    if not m["ready"]:
        return page(m["name"], "<a class='back' href='/moves'>&larr; Moves</a><div class='mono'>COMING SOON</div>"
                    f"<h1>{m['name']} <em>soon.</em></h1><p class='lead'>I don't have a judge for this move yet, so I won't fake one. Flare is ready now.</p>"
                    "<a class='btn' href='/move/flare'>Scan a flare instead</a>")
    body = ("<a class='back' href='/moves'>&larr; Moves</a><div class='mono'>FLARE SCAN</div><h1>Upload your <em>flare.</em></h1>"
            f"<p class='lead'>A clip of {MAX_SECONDS} seconds or shorter with one or more flares.</p>"
            "<form id='f'><input id='file' type='file' name='video' accept='video/*' required>"
            "<input type='hidden' name='agreed' value='1'><input type='hidden' name='move' value='flare'>"
            "<button class='btn' id='go' type='submit'>Scan my flare</button></form>"
            "<p class='small' id='msg'></p>"
            "<button type='button' class='btn ghost' id='again'>View filming guidelines</button>")
    script = "const MAXS=%d;" % MAX_SECONDS + """
const f=document.getElementById('f'),msg=document.getElementById('msg'),go=document.getElementById('go'),file=document.getElementById('file');
document.getElementById('again').addEventListener('click',()=>window.openRules(true));
file.addEventListener('change',()=>{const fl=file.files[0];if(!fl)return;const v=document.createElement('video');v.preload='metadata';
 v.onloadedmetadata=()=>{URL.revokeObjectURL(v.src);if(v.duration>MAXS+0.5){msg.textContent='That video is '+Math.round(v.duration)+' seconds. The limit is '+MAXS+' seconds. Please trim it and choose it again.';msg.className='small err';file.value='';go.disabled=false}else{msg.textContent='';msg.className='small';go.disabled=false}};
 v.src=URL.createObjectURL(fl)});
f.addEventListener('submit',async e=>{e.preventDefault();go.disabled=true;msg.textContent='Uploading...';
try{const r=await fetch('/upload',{method:'POST',body:new FormData(f)});const j=await r.json();
if(!r.ok){msg.textContent=j.error||'Upload failed.';msg.className='small err';go.disabled=false;return}
location.href='/processing/'+j.job}catch(x){msg.textContent='Upload failed. Is the app still running?';msg.className='small err';go.disabled=false}});
"""
    return page("Flare scan", body, script, gate=True)


def video_seconds(path):
    try:
        import cv2
        cap = cv2.VideoCapture(path)
        fps = cap.get(cv2.CAP_PROP_FPS) or 0
        n = cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0
        cap.release()
        return n / fps if fps > 0 and n > 0 else None
    except Exception:
        return None


@app.route("/upload", methods=["POST"])
def upload():
    f = request.files.get("video")
    if f is None or not f.filename:
        return jsonify(error="Please choose a video first."), 400
    ext = os.path.splitext(f.filename)[1].lower()
    if ext not in ALLOWED:
        return jsonify(error="I can read mp4, mov, m4v, avi, mkv or webm videos."), 400
    job = uuid.uuid4().hex[:10]
    folder = os.path.join(JOBS_DIR, job)
    os.makedirs(folder)
    mv = request.form.get("move", "flare")
    if mv not in {m["key"] for m in MOVES if m["ready"]}:
        mv = "flare"
    json.dump({"move": mv}, open(os.path.join(folder, "meta.json"), "w"))
    f.save(os.path.join(folder, "clip" + ext))
    secs = video_seconds(os.path.join(folder, "clip" + ext))
    if secs is not None and secs > MAX_SECONDS + 0.5:
        shutil.rmtree(folder, ignore_errors=True)
        return jsonify(error=f"That video is {secs:.0f} seconds. The limit is {MAX_SECONDS} seconds. Please trim it and try again."), 400
    with LOCK:
        JOBS[job] = {"state": "queued", "step": "Waiting for my turn...", "error": "", "percent": 0.0, "started": time.time()}
    threading.Thread(target=run_job, args=(job, "clip" + ext), daemon=True).start()
    return jsonify(job=job)


def run_job(job, filename):
    folder = os.path.join(JOBS_DIR, job)

    def setj(**kw):
        with LOCK:
            JOBS[job].update(kw)

    with RUN_ONE:
        try:
            base = os.path.splitext(filename)[0]
            setj(state="running", step="Finding you in the video...", percent=0.0)
            log = []
            proc = subprocess.Popen([sys.executable, "-u", SKELETON, filename], cwd=folder, stdout=subprocess.PIPE,
                                    stderr=subprocess.STDOUT, text=True, errors="replace")
            for line in proc.stdout:
                log.append(line)
                if line.startswith("PROGRESS "):
                    try:
                        setj(percent=min(94.0, float(line.split()[1]) * 0.94))
                    except ValueError:
                        pass
            proc.wait()
            open(os.path.join(folder, "skeleton_log.txt"), "w", encoding="utf-8").write("".join(log))

            class R:  # same shape as before so the check below still works
                returncode = proc.returncode
            r = R()
            csv_path = os.path.join(folder, base + "_rtm_data.csv")
            if r.returncode != 0 or not os.path.exists(csv_path):
                setj(state="error", error="I couldn't read that video. Try filming again with the whole body in frame.")
                return
            setj(step="Judging your flare...", percent=95.0)
            env = dict(os.environ, FLARE_NO_OPEN="1", PYTHONIOENCODING="utf-8")
            r = subprocess.run([sys.executable, ANALYZER, csv_path], cwd=folder, capture_output=True, text=True, env=env)
            open(os.path.join(folder, "analyze_log.txt"), "w", encoding="utf-8").write(r.stdout + "\n" + r.stderr)
            if os.path.exists(os.path.join(folder, base + "_feedback.html")):
                make_thumb(folder, filename)
                setj(state="done", step="Done", percent=100.0)
            else:
                # No page = no flare found (or the judge crashed). Keep the judge's own words if there are any.
                msg = ""
                for line in r.stdout.splitlines():
                    if line.strip():
                        msg = line.strip() if not msg else msg
                setj(state="noflare", error=msg)
        except Exception as e:
            setj(state="error", error="Something went wrong on my side: " + str(e))


@app.route("/status/<job>")
def status(job):
    j = JOBS.get(job)
    if j is None:
        return jsonify(state="missing"), 404
    return jsonify(state=j["state"], step=j["step"], error=j["error"], percent=j["percent"], seconds=int(time.time() - j["started"]))


@app.route("/processing/<job>")
def processing(job):
    if not re.fullmatch(r"[0-9a-f]{10}", job) or job not in JOBS:
        return redirect("/")
    body = ("<div class='mono'>SCANNING</div><h1>Reading your <em>flare.</em></h1>"
            "<div class='card' style='text-align:center'><div id='pct' style='font:700 64px Space Grotesk,sans-serif;"
            "background:linear-gradient(90deg,var(--mint),var(--cyan),var(--violet));-webkit-background-clip:text;background-clip:text;color:transparent'>0%</div>"
            "<div class='track'><i id='fill'></i></div>"
            "<p id='step' style='margin-top:14px'>Starting...</p><p class='small' id='eta'></p></div>"
            "<p class='small'>Keep this page open. A clip can take a few minutes, longer on a computer without a graphics card.</p>")
    script = f"""
const job='{job}';let shown=0;
function fmt(s){{s=Math.max(0,Math.round(s));return s>=60?Math.floor(s/60)+' min '+(s%60)+' s':s+' s'}}
async function tick(){{
 try{{const r=await fetch('/status/'+job);const j=await r.json();
  if(j.state==='done'){{document.getElementById('pct').textContent='100%';document.getElementById('fill').style.width='100%';setTimeout(()=>location.href='/result/'+job,500);return}}
  if(j.state==='noflare'||j.state==='error'){{location.href='/problem/'+job;return}}
  shown=Math.max(shown,j.percent);const p=Math.floor(shown);
  document.getElementById('pct').textContent=p+'%';document.getElementById('fill').style.width=shown+'%';
  document.getElementById('step').textContent=j.step;
  document.getElementById('eta').textContent=(p>=5&&p<95)?'About '+fmt(j.seconds*(100-shown)/shown)+' left':(p<5?'Working out how long this will take...':'Nearly there...');
 }}catch(e){{}}
 setTimeout(tick,1000)}}
tick();
"""
    return page("Scanning...", body, script)


@app.route("/problem/<job>")
def problem(job):
    j = JOBS.get(job, {})
    if j.get("state") == "noflare":
        why = ("I couldn't find a flare in that clip. Make sure the clip has at least one flare, "
               "with your whole body in the frame, then try again.")
        extra = ""
    else:
        why = j.get("error") or "Something went wrong."
        extra = ""
    tips = "".join(f"<li><b>{t}.</b> {d}</li>" for _, t, d in RULES)
    body = ("<div class='mono' style='color:var(--coral)'>COULDN'T SCAN IT</div><h1>Let's <em>film it again.</em></h1>"
            f"<p class='lead'>{why}</p><div class='card'><ul class='tips'>{tips}</ul></div>{extra}"
            "<a class='btn' href='/move/flare'>Try another video</a><a class='btn ghost' href='/'>Home</a>")
    return page("Couldn't scan", body)


NAVBAR = ("<div style=\"position:fixed;left:14px;right:14px;bottom:calc(12px + env(safe-area-inset-bottom));z-index:99;display:flex;gap:10px;"
          "padding:8px;border-radius:24px;background:rgba(var(--bgr),.72);backdrop-filter:blur(18px);-webkit-backdrop-filter:blur(18px);"
          "border:1px solid rgba(255,255,255,.12);box-shadow:0 14px 40px rgba(0,0,0,.5);font-family:system-ui,sans-serif\">"
          "<a href='/start' style='flex:1;text-align:center;padding:13px;border-radius:17px;background:rgba(255,255,255,.07);color:#e8f3f0;text-decoration:none;font-weight:600'>Menu</a>"
          "<a href='/move/flare' style='flex:2;text-align:center;padding:13px;border-radius:17px;background:linear-gradient(90deg,var(--mint),var(--cyan));color:#04110d;text-decoration:none;font-weight:700'>Scan another flare</a></div>"
          "<div style='height:96px'></div>")


@app.route("/video/<job>")
def video(job):
    if not re.fullmatch(r"[0-9a-f]{10}", job):
        abort(404)
    folder = os.path.join(JOBS_DIR, job)
    if not os.path.isdir(folder):
        abort(404)
    for f in os.listdir(folder):
        if f.startswith("clip.") and os.path.splitext(f)[1].lower() in ALLOWED:
            return send_file(os.path.join(folder, f), conditional=True)     # conditional = supports seeking, which phones need
    abort(404)


@app.route("/result/<job>")
def result(job):
    if not re.fullmatch(r"[0-9a-f]{10}", job):
        abort(404)
    folder = os.path.join(JOBS_DIR, job)
    p = os.path.join(folder, "clip_feedback.html")
    if not os.path.exists(p):
        # the clip may have another extension, so look for any feedback page
        found = [x for x in os.listdir(folder) if x.endswith("_feedback.html")] if os.path.isdir(folder) else []
        if not found:
            abort(404)
        p = os.path.join(folder, found[0])
    html_text = open(p, encoding="utf-8").read()
    # the replay shows the real video, so point it at the video route
    for ext in (".mp4", ".mov", ".m4v", ".webm", ".mkv", ".avi"):
        html_text = html_text.replace('"video":"clip' + ext + '"', '"video":"/video/' + job + '"')
    if "</body>" in html_text:
        html_text = html_text.replace("</body>", NAVBAR + "</body>")
    else:
        html_text += NAVBAR
    return html_text


if __name__ == "__main__":
    share = any(a.lower() == "share" for a in sys.argv[1:])
    print("Open this in your browser:  http://127.0.0.1:5000")
    if share:
        print("Phone on the same Wi-Fi: http://<your computer's IP>:5000  (find the IP with: ipconfig)")
    app.run(host="0.0.0.0" if share else "127.0.0.1", port=5000, debug=False, threaded=True)
