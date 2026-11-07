// FILE NAME: result.js
// Builds the feedback page for one scan (the coach's remark, the checks, drills, tips and the skeleton replay).
// It is shown inside the app in its own frame, so its styles never clash with the other screens.
(function () {
  "use strict";
  const E = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const ICON_OK = '<svg viewBox="0 0 24 24" width="16" height="16"><path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  const ICON_BAD = '<svg viewBox="0 0 24 24" width="16" height="16"><path d="M12 6v8M12 18v.01" fill="none" stroke="currentColor" stroke-width="2.8" stroke-linecap="round"/></svg>';
  const ICON_NA = '<svg viewBox="0 0 24 24" width="16" height="16"><path d="M7 12h10" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/></svg>';

  const REPLAY_SCRIPT = String.raw`
const R = __REPLAY__;
const cv = document.getElementById('cv'), cx = cv.getContext('2d');
const clock = document.getElementById('clock'), prog = document.getElementById('prog');
const J = Object.fromEntries(R.joints.map((n, i) => [n, i]));
const BONES = [["left_shoulder","right_shoulder"],["left_hip","right_hip"],["left_shoulder","left_hip"],["right_shoulder","right_hip"],
  ["left_shoulder","left_elbow"],["left_elbow","left_wrist"],["right_shoulder","right_elbow"],["right_elbow","right_wrist"],
  ["left_hip","left_knee"],["left_knee","left_ankle"],["left_ankle","left_heel"],
  ["right_hip","right_knee"],["right_knee","right_ankle"],["right_ankle","right_heel"]];
const W = cv.width, H = cv.height, PAD = 130;
const [bx0, by0, bx1, by1] = R.box;
const sc = Math.min((W - 2*PAD) / Math.max(bx1 - bx0, 1), (H - 2*PAD) / Math.max(by1 - by0, 1));
const ox = (W - sc * (bx1 - bx0)) / 2 - sc * bx0, oy = (H - sc * (by1 - by0)) / 2 - sc * by0 + 10;
const P = (p) => [p[0] * sc + ox, p[1] * sc + oy];
const N = R.frames.length, total = N * R.dt, HOLD = 1.0;
function pose(fi, u) {
  const a = R.frames[fi], b = R.frames[Math.min(N - 1, fi + 1)];
  return a.map((p, i) => {
    const q = b[i];
    if (p && q) return [p[0] + (q[0] - p[0]) * u, p[1] + (q[1] - p[1]) * u];
    return p;
  });
}
function line(A, B, glow, core) {
  cx.beginPath(); cx.moveTo(A[0], A[1]); cx.lineTo(B[0], B[1]);
  cx.strokeStyle = 'rgba(46,242,192,.16)'; cx.lineWidth = glow; cx.stroke();
  cx.strokeStyle = '#2ef2c0'; cx.lineWidth = core; cx.stroke();
  cx.strokeStyle = 'rgba(225,255,248,.85)'; cx.lineWidth = Math.max(1, core / 3); cx.stroke();
}
function draw(fi, u = 0) {
  cx.clearRect(0, 0, W, H);
  const fy = R.floor * sc + oy;
  const g = cx.createLinearGradient(0, fy, W, fy);
  g.addColorStop(0, 'rgba(46,242,192,0)'); g.addColorStop(.5, 'rgba(46,242,192,.7)'); g.addColorStop(1, 'rgba(46,242,192,0)');
  cx.fillStyle = g; cx.fillRect(0, fy, W, 2);
  const fade = cx.createLinearGradient(0, fy, 0, fy + 90);
  fade.addColorStop(0, 'rgba(46,242,192,.10)'); fade.addColorStop(1, 'rgba(46,242,192,0)');
  cx.fillStyle = fade; cx.fillRect(0, fy + 2, W, 90);
  const fr = pose(fi, u);
  cx.lineCap = 'round'; cx.lineJoin = 'round';
  for (const [a, b] of BONES) {
    const pa = fr[J[a]], pb = fr[J[b]]; if (!pa || !pb) continue;
    line(P(pa), P(pb), 18, 6);
  }
  const sh = [fr[J.left_shoulder], fr[J.right_shoulder]].filter(Boolean);
  const hd = fr[J.head];
  if (hd) {
    const Hh = P(hd);
    if (sh.length === 2) line(P([(sh[0][0] + sh[1][0]) / 2, (sh[0][1] + sh[1][1]) / 2]), Hh, 18, 6);
    cx.beginPath(); cx.arc(Hh[0], Hh[1], 24, 0, 7); cx.fillStyle = 'rgba(39,200,255,.14)'; cx.fill();
    cx.beginPath(); cx.arc(Hh[0], Hh[1], 15, 0, 7);
    cx.fillStyle = '#0b0d0e'; cx.fill(); cx.lineWidth = 4; cx.strokeStyle = '#27c8ff'; cx.stroke();
  }
  for (const n of R.joints) {
    if (n === 'head') continue; const p = fr[J[n]]; if (!p) continue;
    const q = P(p);
    cx.beginPath(); cx.arc(q[0], q[1], 13, 0, 7); cx.fillStyle = 'rgba(46,242,192,.18)'; cx.fill();
    cx.beginPath(); cx.arc(q[0], q[1], 6.5, 0, 7); cx.fillStyle = '#fff'; cx.fill();
  }
  if (R.lost[fi]) {
    cx.font = "22px 'Space Mono', monospace"; cx.textAlign = 'center';
    cx.fillStyle = 'rgba(255,122,89,.95)'; cx.fillText('// TRACKING LOST', W / 2, H / 2);
  }
}
let t0 = null;
function tick(ts) {
  if (t0 === null) t0 = ts;
  const t = ((ts - t0) / 1000) % (total + HOLD);
  const tc = Math.min(t, total - 0.0001);
  const f = tc / R.dt, fi = Math.min(N - 1, Math.floor(f));
  draw(fi, f - fi);
  const tt = R.t0 + Math.min(t, total);
  clock.textContent = String(Math.floor(tt / 60)).padStart(2, '0') + ':' + (tt % 60).toFixed(1).padStart(4, '0');
  prog.style.width = (Math.min(t, total) / total * 100) + '%';
  requestAnimationFrame(tick);
}
if (N > 1) requestAnimationFrame(tick);
`;

  function build(res) {
    const problems = res.problems, track = res.track;
    const tiles = res.tiles.map(t => {
      if (t.state === "bad") return `<div class="tile bad"><div class="trow"><span class="ti bad">${ICON_BAD}</span><span class="chip bad">NEEDS WORK</span></div><div class="tname">${E(t.name)}</div><p>${E(t.short)}</p></div>`;
      if (t.state === "ok") return `<div class="tile ok${t.wide ? " wide" : ""}"><div class="trow"><span class="ti ok">${ICON_OK}</span><span class="chip ok">SOLID</span></div><div class="tname">${E(t.name)}</div><div class="td">${E(t.desc)}</div></div>`;
      return `<div class="tile na${t.wide ? " wide" : ""}"><div class="trow"><span class="ti na">${ICON_NA}</span><span class="chip na">NOT IN VIDEO</span></div><div class="tname">${E(t.name)}</div><div class="td">${E(t.desc)}</div></div>`;
    }).join("");

    let focus, drills = "", badge, h1, live, checks = "", tipsSec = "", notice = "";
    const drillCards = res.drills.map((d, i) => `<div class="drill"><div class="num">${String(i + 1).padStart(2, "0")}</div><div><div class="for">FOR: ${E(d.for.toUpperCase())}</div><p>${E(d.text)}</p></div></div>`).join("");
    if (track === "refuse") {
      focus = `
    <div class="head rise" style="--d:.3s"><span class="idx bad">01</span><span class="label">WHAT HAPPENED</span></div>
    <section class="focus bad rise" style="--d:.35s">
      <div class="tag bad"><i></i>RESCAN NEEDED</div>
      <h2>I COULDN'T SEE YOU CLEARLY</h2>
      <p>I won't guess at your flare when I can't see it. Here is what went wrong:</p>
      <ul class="reasons">${res.refuseReasons.map(r => `<li>${E(r)}</li>`).join("")}</ul>
    </section>`;
      drills = `
    <section class="rise" style="--d:.55s">
      <div class="head"><span class="idx">02</span><span class="label">HOW TO FILM IT AGAIN</span></div>
      <div class="drills">${res.filmTips.map((t, i) => `<div class="drill"><div class="num">${String(i + 1).padStart(2, "0")}</div><div><div class="for">FOR: A BETTER VIDEO</div><p>${E(t)}</p></div></div>`).join("")}</div>
    </section>`;
      badge = '<span class="check bad"><svg viewBox="0 0 24 24" width="16" height="16"><path d="M12 6v8M12 18v.01" fill="none" stroke="#1a0904" stroke-width="3" stroke-linecap="round"/></svg></span>SCAN NOT CLEAR';
      h1 = 'Flare<br>scan <em class="bad">unclear</em>';
      live = '<span class="live bad"><i></i>RESCAN NEEDED</span>';
    } else {
      badge = '<span class="check"><svg viewBox="0 0 24 24" width="16" height="16"><path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="#04120e" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg></span>SCAN COMPLETE';
      h1 = "Flare<br>scan <em>success</em>";
      live = '<span class="live"><i></i>ANALYSIS DONE</span>';
      if (track === "caution") notice = `<div class="notice rise" style="--d:.25s"><b>HEADS UP</b>${E(res.cautionText)}</div>`;
      if (problems.length) {
        focus = `
    <div class="head rise" style="--d:.3s"><span class="idx">01</span><span class="label">COACH'S REMARK</span></div>
    <section class="focus rise" style="--d:.35s">
      <div class="rings"></div>
      <div class="tag"><i></i>WHAT I SAW IN YOUR VIDEO</div>
      <h2>${E(res.headline[problems[0]])}</h2>
      <p>${E(res.observe[problems[0]])}</p>
      <div class="why"><div class="wl">// TRY THIS</div><p>${E(res.fix[problems[0]])}</p></div>
      <div class="why"><div class="wl">// WHY IT MATTERS</div><p>${E(res.why[problems[0]])}</p></div>
    </section>`;
        if (problems.length > 1) focus += `
    <section class="focus also rise" style="--d:.4s">
      <div class="tag"><i></i>ALSO IN YOUR VIDEO</div>
      <h2>${E(res.headline[problems[1]])}</h2>
      <p>${E(res.observe[problems[1]])}</p>
      <div class="why"><div class="wl">// TRY THIS</div><p>${E(res.fix[problems[1]])}</p></div>
    </section>`;
        drills = `
    <section class="rise" style="--d:.55s">
      <div class="head"><span class="idx">03</span><span class="label">PRACTISE THIS</span></div>
      <div class="drills">${drillCards}</div>
    </section>`;
      } else {
        focus = `
    <div class="head rise" style="--d:.3s"><span class="idx">01</span><span class="label">COACH'S REMARK</span></div>
    <section class="focus rise" style="--d:.35s">
      <div class="rings"></div>
      <div class="tag"><i></i>LOOKING GOOD</div>
      <h2>CLEAN FLARES</h2>
      <p>Nice flares. I can't see anything clearly wrong here. Keep practising, repetition is the next step.</p>
    </section>`;
      }
      checks = `
  <section class="rise" style="--d:.45s">
    <div class="head"><span class="idx">02</span><span class="label">WHAT I SAW</span></div>
    <div class="grid">${tiles}</div>
  </section>`;
      const nxt = res.tips.map(t => `<div class="next${"?!".includes(t.badge) ? " ask" : ""}"><div class="nn">${E(t.badge)}</div><h4>${E(t.title)}</h4><p>${E(t.text)}</p></div>`).join("");
      tipsSec = `
  <section class="rise" style="--d:.65s">
    <div class="head"><span class="idx">04</span><span class="label">FOR EVERY FLARE</span><span class="swipe">SWIPE →</span></div>
    <div class="nexts">${nxt}</div>
  </section>`;
    }
    const tracking = { ok: "CLEAN", caution: "PARTIAL", refuse: "POOR" }[track];
    const chips = `<span class="pill"><i></i>ROUNDS SEEN <b>${E(res.roundsSeen)}</b></span><span class="pill"><i></i>TRACKING <b>${tracking}</b></span>`;
    const replayJSON = JSON.stringify(res.replay).replace(/<\//g, "<\\/");
    const script = REPLAY_SCRIPT.replace("__REPLAY__", () => replayJSON);
    const nav = `<div style="position:fixed;left:14px;right:14px;bottom:calc(12px + env(safe-area-inset-bottom));z-index:99;display:flex;gap:10px;padding:8px;border-radius:24px;background:rgba(7,9,10,.72);backdrop-filter:blur(18px);-webkit-backdrop-filter:blur(18px);border:1px solid rgba(255,255,255,.12);box-shadow:0 14px 40px rgba(0,0,0,.5);font-family:system-ui,sans-serif">
<a href="#" onclick="parent.location.hash='#/start';return false" style="flex:1;text-align:center;padding:13px;border-radius:17px;background:rgba(255,255,255,.07);color:#e8f3f0;text-decoration:none;font-weight:600">Menu</a>
<a href="#" onclick="parent.location.hash='#/move/flare';return false" style="flex:2;text-align:center;padding:13px;border-radius:17px;background:linear-gradient(90deg,#2ef2c0,#27c8ff);color:#04110d;text-decoration:none;font-weight:700">Scan another flare</a></div><div style="height:96px"></div>`;
    return `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="color-scheme" content="dark">
<title>Flare feedback</title>
<link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;700&family=Space+Mono:wght@400;700&display=swap" rel="stylesheet">
<style>${window.BD_CSS.feedback}</style></head>
<body>
<div class="bg"><i class="blob b1"></i><i class="blob b2"></i><i class="blob b3"></i><div class="grid-bg"></div><div class="grain"></div></div>
<main class="phone">
  <div class="top">
    <div class="brand"><svg width="22" height="22" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" fill="none" stroke="#2ef2c0" stroke-width="2"/><circle cx="12" cy="12" r="3.2" fill="#2ef2c0"/></svg>FLARE<span>//</span>CHECK</div>
    ${live}
  </div>
  <div class="success rise">${badge}</div>
  <h1 class="rise" style="--d:.05s">${h1}</h1>
  <div class="pills rise" style="--d:.1s">${chips}</div>
  <div class="player rise" style="--d:.15s">
    <div class="prings"></div><div class="scan"></div>
    <canvas id="cv" width="760" height="760"></canvas>
    <span class="corner c1"></span><span class="corner c2"></span><span class="corner c3"></span><span class="corner c4"></span>
    <div class="hud-top"><span>// YOUR FLARE, SCANNED</span><span class="rec"><i></i>REPLAY</span></div>
    <div class="hud-bot"><div id="clock">00:00.0</div><div class="track"><i id="prog"></i></div></div>
  </div>
  <p class="sub rise" style="--d:.2s">Looked at <b>${E(res.seen)}</b> · where you are on the floor</p>
  ${notice}
  ${focus}
  ${checks}
  ${drills}
  ${tipsSec}
  <div class="foot">KEEP TRAINING</div>
</main>
${nav}
<script>${script}<\/script>
</body></html>`;
  }

  window.BDResult = { build };
})();
