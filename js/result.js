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
const MINT = '46,242,192', CYAN = '39,200,255';
const col = (n) => n.startsWith('right') ? CYAN : MINT;
// a tapered limb: wide near the body, narrow at the far end, like a scanned body segment
function limb(A, B, w1, w2, rgb) {
  const dx = B[0] - A[0], dy = B[1] - A[1], L = Math.hypot(dx, dy); if (L < 2) return;
  const nx = -dy / L, ny = dx / L, a = Math.atan2(dy, dx);
  cx.beginPath();
  cx.moveTo(A[0] + nx * w1, A[1] + ny * w1);
  cx.lineTo(B[0] + nx * w2, B[1] + ny * w2);
  cx.arc(B[0], B[1], w2, a + Math.PI / 2, a - Math.PI / 2, true);
  cx.lineTo(A[0] - nx * w1, A[1] - ny * w1);
  cx.arc(A[0], A[1], w1, a - Math.PI / 2, a + Math.PI / 2, true);
  cx.closePath();
  const g = cx.createLinearGradient(A[0], A[1], B[0], B[1]);
  g.addColorStop(0, 'rgba(' + rgb + ',.34)'); g.addColorStop(1, 'rgba(' + rgb + ',.07)');
  cx.fillStyle = g; cx.fill();
  cx.lineWidth = 1.6; cx.strokeStyle = 'rgba(' + rgb + ',.85)'; cx.stroke();
  cx.beginPath(); cx.moveTo(A[0], A[1]); cx.lineTo(B[0], B[1]);
  cx.lineWidth = 1; cx.strokeStyle = 'rgba(235,255,250,.55)'; cx.setLineDash([2, 5]); cx.stroke(); cx.setLineDash([]);
}
function node(p, r, rgb, big) {
  cx.beginPath(); cx.arc(p[0], p[1], r + 6, 0, 7); cx.fillStyle = 'rgba(' + rgb + ',.12)'; cx.fill();
  cx.beginPath(); cx.arc(p[0], p[1], r, 0, 7); cx.lineWidth = 1.8; cx.strokeStyle = 'rgba(' + rgb + ',1)'; cx.fillStyle = 'rgba(8,12,13,.85)'; cx.fill(); cx.stroke();
  cx.beginPath(); cx.arc(p[0], p[1], 2.2, 0, 7); cx.fillStyle = '#fff'; cx.fill();
  if (big) {
    cx.strokeStyle = 'rgba(' + rgb + ',.7)'; cx.lineWidth = 1; cx.beginPath();
    cx.moveTo(p[0] - r - 7, p[1]); cx.lineTo(p[0] - r - 2, p[1]); cx.moveTo(p[0] + r + 2, p[1]); cx.lineTo(p[0] + r + 7, p[1]);
    cx.moveTo(p[0], p[1] - r - 7); cx.lineTo(p[0], p[1] - r - 2); cx.moveTo(p[0], p[1] + r + 2); cx.lineTo(p[0], p[1] + r + 7); cx.stroke();
  }
}
const WID = { shoulder: [14, 10], elbow: [10, 7], hip: [17, 12], knee: [12, 8] };
function trail(fi, name, rgb) {
  const idx = J[name]; const K = 6; let prev = null;
  for (let k = K; k >= 0; k--) {
    const f = R.frames[fi - k]; const p = f && f[idx]; if (!p) { prev = null; continue; }
    const q = P(p);
    if (prev && Math.hypot(prev[0] - q[0], prev[1] - q[1]) < 90) { cx.beginPath(); cx.moveTo(prev[0], prev[1]); cx.lineTo(q[0], q[1]); cx.lineWidth = 1 + (K - k) * 0.35; cx.strokeStyle = 'rgba(' + rgb + ',' + (0.4 * (1 - k / K)).toFixed(2) + ')'; cx.stroke(); }
    prev = q;
  }
}
function draw(fi, u = 0, clk = 0) {
  cx.clearRect(0, 0, W, H);
  // floor: a faint perspective grid under the dancer
  const fy = R.floor * sc + oy;
  cx.lineWidth = 1;
  for (let k = -8; k <= 8; k++) {
    cx.beginPath(); cx.moveTo(W / 2 + k * 30, fy); cx.lineTo(W / 2 + k * 95, fy + 120);
    cx.strokeStyle = 'rgba(' + MINT + ',' + (0.16 - Math.abs(k) * 0.012).toFixed(3) + ')'; cx.stroke();
  }
  for (let k = 0; k < 4; k++) {
    const yy = fy + 8 + k * k * 8 + k * 14;
    cx.beginPath(); cx.moveTo(0, yy); cx.lineTo(W, yy); cx.strokeStyle = 'rgba(' + MINT + ',' + (0.14 - k * 0.03).toFixed(3) + ')'; cx.stroke();
  }
  const g = cx.createLinearGradient(0, fy, W, fy);
  g.addColorStop(0, 'rgba(46,242,192,0)'); g.addColorStop(.5, 'rgba(46,242,192,.8)'); g.addColorStop(1, 'rgba(46,242,192,0)');
  cx.fillStyle = g; cx.fillRect(0, fy, W, 2);

  const fr = pose(fi, u); const pt = (n) => fr[J[n]] ? P(fr[J[n]]) : null;
  cx.lineCap = 'round'; cx.lineJoin = 'round';
  for (const n of ['left_wrist', 'right_wrist', 'left_ankle', 'right_ankle']) trail(fi, n, col(n));

  // torso: a filled panel with a spine and scan lines
  const ls = pt('left_shoulder'), rs = pt('right_shoulder'), lh = pt('left_hip'), rh = pt('right_hip');
  if (ls && rs && lh && rh) {
    cx.beginPath(); cx.moveTo(ls[0], ls[1]); cx.lineTo(rs[0], rs[1]); cx.lineTo(rh[0], rh[1]); cx.lineTo(lh[0], lh[1]); cx.closePath();
    const tg = cx.createLinearGradient((ls[0] + rs[0]) / 2, (ls[1] + rs[1]) / 2, (lh[0] + rh[0]) / 2, (lh[1] + rh[1]) / 2);
    tg.addColorStop(0, 'rgba(' + CYAN + ',.30)'); tg.addColorStop(1, 'rgba(' + MINT + ',.10)');
    cx.fillStyle = tg; cx.fill(); cx.lineWidth = 1.6; cx.strokeStyle = 'rgba(' + MINT + ',.85)'; cx.stroke();
    for (let k = 1; k <= 3; k++) {
      const a = k / 4, x1 = ls[0] + (lh[0] - ls[0]) * a, y1 = ls[1] + (lh[1] - ls[1]) * a, x2 = rs[0] + (rh[0] - rs[0]) * a, y2 = rs[1] + (rh[1] - rs[1]) * a;
      cx.beginPath(); cx.moveTo(x1, y1); cx.lineTo(x2, y2); cx.lineWidth = 1; cx.strokeStyle = 'rgba(' + MINT + ',.28)'; cx.stroke();
    }
    const m1 = [(ls[0] + rs[0]) / 2, (ls[1] + rs[1]) / 2], m2 = [(lh[0] + rh[0]) / 2, (lh[1] + rh[1]) / 2];
    cx.beginPath(); cx.moveTo(m1[0], m1[1]); cx.lineTo(m2[0], m2[1]); cx.lineWidth = 1.4; cx.strokeStyle = 'rgba(235,255,250,.7)'; cx.setLineDash([3, 5]); cx.stroke(); cx.setLineDash([]);
  }
  // limbs (left side mint, right side blue, so a swapped leg is easy to spot)
  for (const side of ['left', 'right']) {
    const rgb = col(side);
    for (const [a, b, k] of [['shoulder', 'elbow', 'shoulder'], ['elbow', 'wrist', 'elbow'], ['hip', 'knee', 'hip'], ['knee', 'ankle', 'knee']]) {
      const A = pt(side + '_' + a), B = pt(side + '_' + b); if (!A || !B) continue;
      limb(A, B, WID[k][0], WID[k][1], rgb);
    }
    const an = pt(side + '_ankle'), he = pt(side + '_heel');
    if (an && he) { cx.beginPath(); cx.moveTo(an[0], an[1]); cx.lineTo(he[0], he[1]); cx.lineWidth = 3; cx.strokeStyle = 'rgba(' + rgb + ',.9)'; cx.stroke(); }
  }
  // head: a targeting ring
  const hdp = pt('head');
  if (hdp) {
    const mid = (ls && rs) ? [(ls[0] + rs[0]) / 2, (ls[1] + rs[1]) / 2] : null;
    if (mid) { cx.beginPath(); cx.moveTo(mid[0], mid[1]); cx.lineTo(hdp[0], hdp[1]); cx.lineWidth = 1.6; cx.strokeStyle = 'rgba(' + CYAN + ',.8)'; cx.stroke(); }
    cx.beginPath(); cx.arc(hdp[0], hdp[1], 19, 0, 7); cx.fillStyle = 'rgba(' + CYAN + ',.12)'; cx.fill(); cx.lineWidth = 1.8; cx.strokeStyle = 'rgba(' + CYAN + ',1)'; cx.stroke();
    cx.beginPath(); cx.arc(hdp[0], hdp[1], 29, clk * 2, clk * 2 + 4.2); cx.lineWidth = 1.4; cx.strokeStyle = 'rgba(' + CYAN + ',.6)'; cx.stroke();
    cx.beginPath(); cx.arc(hdp[0], hdp[1], 29, clk * 2 + Math.PI, clk * 2 + Math.PI + 1.4); cx.stroke();
    cx.beginPath(); cx.moveTo(hdp[0] - 9, hdp[1]); cx.lineTo(hdp[0] + 9, hdp[1]); cx.moveTo(hdp[0], hdp[1] - 9); cx.lineTo(hdp[0], hdp[1] + 9); cx.lineWidth = 1; cx.strokeStyle = 'rgba(235,255,250,.8)'; cx.stroke();
  }
  // joints
  for (const side of ['left', 'right']) {
    const rgb = col(side);
    for (const k of ['shoulder', 'hip']) { const p = pt(side + '_' + k); if (p) node(p, 6.5, rgb, false); }
    for (const k of ['elbow', 'knee']) { const p = pt(side + '_' + k); if (p) node(p, 7, rgb, true); }
    for (const k of ['wrist', 'ankle']) { const p = pt(side + '_' + k); if (p) node(p, 5.5, rgb, false); }
  }
  // a slow scan line moving over the body
  const sy = by0 * sc + oy + ((clk * 0.5) % 1) * (by1 - by0) * sc;
  const sg = cx.createLinearGradient(0, sy - 10, 0, sy + 2);
  sg.addColorStop(0, 'rgba(' + MINT + ',0)'); sg.addColorStop(1, 'rgba(' + MINT + ',.10)');
  cx.fillStyle = sg; cx.fillRect(PAD / 2, sy - 10, W - PAD, 12);
  cx.fillStyle = 'rgba(' + MINT + ',.35)'; cx.fillRect(PAD / 2, sy + 1, W - PAD, 1);
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
  draw(fi, f - fi, t);
  const tt = R.t0 + Math.min(t, total);
  clock.textContent = String(Math.floor(tt / 60)).padStart(2, '0') + ':' + (tt % 60).toFixed(1).padStart(4, '0');
  prog.style.width = (Math.min(t, total) / total * 100) + '%';
  requestAnimationFrame(tick);
}
function startSkel() { if (N > 1) requestAnimationFrame(tick); }

// ---- mesh replay: the real video, with a biometric scan laid over it ----
const VID = __VID__, SLOW = __SLOW__;
function startMesh() {
  let dead = false, ready = false, fell = false;
  const v = document.createElement('video');
  v.muted = true; v.defaultMuted = true; v.playsInline = true; v.preload = 'auto';
  v.setAttribute('playsinline', ''); v.setAttribute('muted', '');
  v.style.cssText = 'position:fixed;left:0;top:0;width:2px;height:2px;opacity:0;pointer-events:none';
  document.body.appendChild(v);
  const fallback = () => { if (fell) return; fell = true; dead = true; try { v.pause(); v.remove(); } catch (e) {} startSkel(); };
  v.onerror = fallback;
  const guard = setTimeout(() => { if (!ready) fallback(); }, 7000);
  const start = R.t0 * SLOW, end = (R.t0 + total) * SLOW, rate = Math.min(Math.max(SLOW, 1), 8);
  v.addEventListener('loadedmetadata', () => {
    try {
      const vw0 = v.videoWidth, vh0 = v.videoHeight; if (!vw0 || !vh0) return fallback();
      const CW = 760, CH = Math.max(520, Math.min(1000, Math.round(CW * vh0 / vw0)));
      cv.width = CW; cv.height = CH; cv.style.aspectRatio = CW + '/' + CH;
      const k0 = Math.min(CW / vw0, CH / vh0), dw = vw0 * k0, dh = vh0 * k0, dx = (CW - dw) / 2, dy = (CH - dh) / 2;
      const PW = 150, PH = Math.max(40, Math.round(PW * vh0 / vw0));
      const sm = document.createElement('canvas'); sm.width = PW; sm.height = PH; const sx = sm.getContext('2d', { willReadFrequently: true });
      const ec = document.createElement('canvas'); ec.width = PW; ec.height = PH; const ex = ec.getContext('2d');
      const mc = document.createElement('canvas'); mc.width = PW; mc.height = PH; const mx = mc.getContext('2d');
      const tc = document.createElement('canvas'); tc.width = PW; tc.height = PH; const tx = tc.getContext('2d');
      const eimg = ex.createImageData(PW, PH), mimg = mx.createImageData(PW, PH);
      const lum = new Float32Array(PW * PH), prev = new Float32Array(PW * PH);
      const G = 4, GW = Math.ceil(PW / G), GH = Math.ceil(PH / G), act = new Float32Array(GW * GH);
      const kx = dw / PW, ky = dh / PH;
      let lastT = -1, first = true;
      ready = true; clearTimeout(guard);
      v.currentTime = start; v.playbackRate = rate;
      const play = () => v.play().catch(() => {});
      play();
      function frame(ts) {
        if (dead) return; requestAnimationFrame(frame);
        if (v.currentTime >= end - 0.03 || v.ended) { v.currentTime = start; first = true; tx.clearRect(0, 0, PW, PH); play(); return; }
        if (v.readyState < 2 || v.currentTime === lastT) return;
        lastT = v.currentTime; const T = ts / 1000;
        sx.drawImage(v, 0, 0, PW, PH);
        const d = sx.getImageData(0, 0, PW, PH).data, ed = eimg.data, md = mimg.data;
        for (let i = 0, p = 0; i < lum.length; i++, p += 4) lum[i] = d[p] * 0.3 + d[p + 1] * 0.59 + d[p + 2] * 0.11;
        act.fill(0);
        for (let y = 0; y < PH; y++) for (let x = 0; x < PW; x++) {
          const i = y * PW + x, p = i * 4; let e = 0, m = 0;
          if (x > 0 && y > 0 && x < PW - 1 && y < PH - 1) e = Math.min(255, (Math.abs(lum[i + 1] - lum[i - 1]) + Math.abs(lum[i + PW] - lum[i - PW])) * 1.5);
          if (!first) { const dm = Math.abs(lum[i] - prev[i]); m = dm > 12 ? Math.min(255, (dm - 12) * 6) : 0; }
          ed[p] = 46; ed[p + 1] = 242; ed[p + 2] = 192; ed[p + 3] = e * 0.85;
          md[p] = 39; md[p + 1] = 200; md[p + 2] = 255; md[p + 3] = m;
          act[((y / G) | 0) * GW + ((x / G) | 0)] += (e * 0.5 + m) / (G * G);
        }
        prev.set(lum); first = false;
        ex.putImageData(eimg, 0, 0); mx.putImageData(mimg, 0, 0);
        tx.globalCompositeOperation = 'destination-out'; tx.fillStyle = 'rgba(0,0,0,.16)'; tx.fillRect(0, 0, PW, PH);
        tx.globalCompositeOperation = 'source-over'; tx.drawImage(mc, 0, 0);

        cx.globalCompositeOperation = 'source-over'; cx.fillStyle = '#05090a'; cx.fillRect(0, 0, CW, CH);
        cx.imageSmoothingEnabled = true;
        cx.drawImage(v, dx, dy, dw, dh);
        cx.fillStyle = 'rgba(3,14,16,.62)'; cx.fillRect(dx, dy, dw, dh);
        cx.globalCompositeOperation = 'color'; cx.fillStyle = 'rgba(46,242,192,.5)'; cx.fillRect(dx, dy, dw, dh);
        cx.globalCompositeOperation = 'lighter';
        cx.globalAlpha = 0.85; cx.drawImage(ec, dx, dy, dw, dh);
        cx.globalAlpha = 0.9; cx.drawImage(tc, dx, dy, dw, dh);
        cx.globalAlpha = 1;
        // the mesh: points and lines that appear where the body is moving
        const TH = 26, buckets = [[], [], []];
        const px = (i, j) => dx + (i * G + 2) * kx + Math.sin(i * 7.1 + j * 3.3 + T * 2.2) * 1.6;
        const py = (i, j) => dy + (j * G + 2) * ky + Math.cos(i * 4.7 + j * 5.9 + T * 1.9) * 1.6;
        cx.lineWidth = 1;
        for (let j = 0; j < GH; j++) for (let i = 0; i < GW; i++) {
          const a = act[j * GW + i]; if (a < TH) continue;
          for (const [di, dj] of [[1, 0], [0, 1], [1, 1], [-1, 1]]) {
            const ni = i + di, nj = j + dj; if (ni < 0 || nj < 0 || ni >= GW || nj >= GH) continue;
            const b = act[nj * GW + ni]; if (b < TH) continue;
            const s = Math.min(2, (((a + b) / 2) - TH) / 30) | 0;
            buckets[s].push(px(i, j), py(i, j), px(ni, nj), py(ni, nj));
          }
        }
        const al = [0.28, 0.45, 0.7];
        for (let s = 0; s < 3; s++) {
          cx.strokeStyle = 'rgba(120,255,225,' + al[s] + ')'; cx.beginPath();
          const q = buckets[s]; for (let n = 0; n < q.length; n += 4) { cx.moveTo(q[n], q[n + 1]); cx.lineTo(q[n + 2], q[n + 3]); }
          cx.stroke();
        }
        cx.fillStyle = 'rgba(235,255,250,.9)';
        for (let j = 0; j < GH; j++) for (let i = 0; i < GW; i++) {
          if (act[j * GW + i] < TH * 1.6) continue; cx.beginPath(); cx.arc(px(i, j), py(i, j), 1.8, 0, 7); cx.fill();
        }
        cx.globalCompositeOperation = 'source-over';
        // a scan line sweeping down the picture
        const sy = dy + ((T * 0.45) % 1) * dh;
        const sg = cx.createLinearGradient(0, sy - 26, 0, sy);
        sg.addColorStop(0, 'rgba(46,242,192,0)'); sg.addColorStop(1, 'rgba(46,242,192,.16)');
        cx.fillStyle = sg; cx.fillRect(dx, sy - 26, dw, 26);
        cx.fillStyle = 'rgba(46,242,192,.55)'; cx.fillRect(dx, sy, dw, 1.5);
        const el = Math.max(0, (v.currentTime - start) / SLOW), tt = R.t0 + el;
        clock.textContent = String(Math.floor(tt / 60)).padStart(2, '0') + ':' + (tt % 60).toFixed(1).padStart(4, '0');
        prog.style.width = Math.min(100, (v.currentTime - start) / (end - start) * 100) + '%';
      }
      requestAnimationFrame(frame);
    } catch (e) { fallback(); }
  });
  v.src = VID;
}
if (VID) startMesh(); else startSkel();
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
    const script = REPLAY_SCRIPT.replace("__REPLAY__", () => replayJSON).replace("__VID__", () => JSON.stringify(res.videoURL || null)).replace("__SLOW__", () => String(res.slow || 1));
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
