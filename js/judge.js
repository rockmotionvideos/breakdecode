// FILE NAME: judge.js
// The flare judge, ported from analyze_flares.py. Works on pose data (joint positions per frame) and returns
// the coach feedback. It runs in the phone's browser, no server.
// Input:  { times:[sec...], found:[0/1...], joints:{ head:{x:[],y:[],c:[]}, left_shoulder:{...}, ... } }  (NaN = not seen)
// Output: { ok:true, ... } with everything the screens need, or { ok:false, reason:"noflare" }.
(function () {
  "use strict";

  // ---------------- SETTINGS YOU CAN CHANGE ----------------
  const MIN_CONF = 0.5;
  const REFUSE_IF_FOUND_BELOW = 0.5;
  const REFUSE_IF_LOST_LONGER = 1.5;
  const REFUSE_IF_CLEAR_BELOW = 0.4;
  const CAUTION_IF_CLEAR_BELOW = 0.85;
  const CAUTION_IF_LOST_LONGER = 0.4;
  const DISPLAY_CONF = 0.3;
  const BONE_STRETCH = 1.25;
  const DISPLAY_FILL_SECONDS = 0.5;
  const DISPLAY_MIN_FRAME_QUALITY = 0.3;
  const MIN_INVERTED_SECONDS = 0.25;
  const MIN_HIP_HEIGHT = 1.65;
  const MAX_KICK_DISTANCE = 0.5;
  const MIN_LEG_OPENING = 80;
  const MIN_START_OPENING = 60;
  const DROP_KNEE_HEIGHT = 0.2;
  const FR_MIN_HIPS_OFF_FLOOR = 0.6;
  const FR_MIN_FOOT_HEIGHT = 1.5;
  const FR_MIN_LEG_OPENING = 80;
  const DROP_SHARE = 0.10;
  const MORE_THAN_ROUNDS = 2;
  const SKEL_TRUST = 0.08;
  const SKEL_ACCEL = 50.0;
  // ----------------------------------------------------------

  const FILM_TIPS = [
    "Film in good light. Dark clothes in a dark room are the hardest for me to see.",
    "Make sure nobody is behind you, and your whole body stays in the frame.",
    "Prop your phone up so it doesn't move, and film from the front or at a 45 degree angle.",
    "Wear fitted clothes that stand out from the floor and the wall.",
    "If your phone has slow motion (120 fps or more), use it. Fast moves are much easier to read.",
  ];
  const SHORT = {
    start: "You start with your legs too closed.",
    legs: "Your legs aren't open wide enough.",
    kick: "Your legs aren't kicking all the way toward your head.",
    lift: "Your hips don't get high enough.",
    flip: "Your body doesn't get upside down, so the flare doesn't come around.",
    drop: "Your knees almost touch the ground after the first flare, on the way into the second one.",
    onward: "You stop after part of one round.",
  };
  const FIX = {
    onward: "Don't stop. Keep going, first with your knees tucked, sliding through the second and third round. As it feels comfortable, your legs will rise higher behind you, like a planche from the back, until you don't need to slide at all.",
    start: "Open your legs wider before the first round.",
    legs: "Open your legs wider, and a bit toward the front, before you start, and keep them open through the flare.",
    kick: "Kick your legs out to the sides. Kick each leg toward your head as you swing, and the other leg comes up with it, so your hips stay up.",
    lift: "Bring your hands closer together so they can hold your hips up. Send your legs a bit more to the front, not straight up, or you lose momentum.",
    flip: "Push forward AND up, not just up, and kick toward your head on each side so the flare can come around.",
    drop: "Push more momentum at the start and kick with your legs. Aim to go back like a planche, and don't let your hips down.",
  };
  const PRACTICE = {
    onward: ["Do two or three rounds with your knees tucked, even if it's messy.",
      "Practise planche alongside it. It raises your legs higher with every session."],
    start: ["Practise the start on its own: legs wide, then swing into the first round, 10 times in a row.",
      "Look at your legs in the mirror or a video before every first round."],
    legs: ["Practise holding your legs wide in a straddle, then swing them while staying wide.",
      "Do a few slow flares and think about keeping the legs open the whole time.",
      "Think wide legs, a bit toward the front, on every round. Film a slow one from the front and check how wide they get."],
    kick: ["Do slow flare swings and focus only on kicking each leg toward your head on each side.",
      "Practise more planche, it keeps your body up while the legs swing."],
    lift: ["Focus on keeping your hips up. Practise more planche and handstand holds.",
      "Keep your hands closer together and push the floor away."],
    flip: ["Practise the swing on its own first, then add the full round.",
      "Applejacks help you learn to push forward and up."],
    drop: ["Practise more planche. It's the position you want to hold when you go back into the second flare.",
      "Push harder at the beginning to build more momentum, and kick with your legs as you go.",
      "Practise the part between the first and the second flare on its own: hips up, knees off the floor."],
  };
  const WHY = {
    onward: "Each round carries momentum into the next one, so stopping after one means the next round starts from zero.",
    start: "If your legs are a bit closed at the start there is no momentum, so open them before the first round.",
    legs: "With your legs closed there is no momentum, so your hips have to do all the work to get you around. Wide legs give you the swing that carries you through the flare.",
    kick: "That swing is what carries you around the flare.",
    lift: "Your hands hold your hips up. When your hands are far apart your hips drop, and sending your legs straight up loses momentum.",
    flip: "If your body doesn't get upside down, the flare can't come around.",
    drop: "When your hips come down to the floor, the momentum is gone and the next flare has to start from zero.",
  };
  const GENERAL = [
    ["START WITH MOMENTUM", "Every attempt you do, make sure you start with momentum. Don't start from a dead stop."],
    ["FILM IT AGAIN", "Film yourself again after practising and compare. Small changes show up on video before you feel them."],
  ];
  const WINDMILL_CONNECT = ["CONNECT IT WITH WINDMILLS", "Connect your flares with windmills. Going from a flare into a windmill teaches you to move your hips and makes both moves better. Once the flare works, try to do a windmill straight after it.", "!"];
  const WINDMILL_ASK = ["DO YOU DO WINDMILLS?", "If you haven't done windmills yet, I'd recommend learning windmills before you start doing flares. It makes flares easier because you learn how to move your hips, and connecting windmills to flares makes your flares better. And if you don't know any move to do after a flare, it's even harder, so windmills are a good one to know.", "?"];
  const WINDMILL_ONE = ["DO YOU DO WINDMILLS?", "If you do, try one round of flare and connect it into a windmill. It keeps you moving instead of stopping. If you haven't learned windmills yet, start there: they teach you how to move your hips, which makes flares easier.", "?"];
  const HEADLINE = {
    onward: "YOU STOPPED AFTER ONE ROUND",
    start: "YOUR LEGS START CLOSED",
    legs: "YOUR LEGS CLOSE IN THE FLARE",
    kick: "YOUR LEGS DON'T KICK TO THE SIDES",
    lift: "YOUR HIPS STAY LOW",
    flip: "YOU DON'T GET ALL THE WAY AROUND",
    drop: "YOUR KNEES DROP BETWEEN FLARES",
  };
  const OBSERVE = {
    onward: "At about {t} seconds you put your leg down and stop. Your hips are good and your legs are open, so your body is ready for another round.",
    start: "Before your first round your legs are still closed, so there is no momentum going in.",
    legs: "During the flare your legs close in instead of staying wide.",
    kick: "Your legs swing, but your feet never come up close to your head on the sides.",
    lift: "Your hips stay low through the flare.",
    flip: "Your head never goes under your hips, so the flare doesn't come all the way around.",
    drop: "After your first flare your knees almost touch the ground before you go into the second one.",
  };
  const CHECK_NAME = { onward: "Second round", start: "Start", legs: "Legs open", kick: "Kick", lift: "Hip height", flip: "Upside down", drop: "Hips between flares" };
  const CHECK_DESC = {
    onward: "You keep going into the next round",
    start: "Legs open before the first round",
    legs: "Legs wide during the flare",
    kick: "Legs kick toward your head",
    lift: "Hips stay high",
    flip: "Head goes below your hips, so the flare comes around",
    drop: "Knees and hips stay off the floor between flares",
  };
  const PRIORITY = ["onward", "start", "legs", "kick", "drop", "lift", "flip"];

  const JOINTS = ["head", "left_shoulder", "right_shoulder", "left_hip", "right_hip",
    "left_knee", "right_knee", "left_ankle", "right_ankle",
    "left_wrist", "right_wrist", "left_heel", "right_heel",
    "left_elbow", "right_elbow"];
  const CORE = new Set(["head", "left_shoulder", "right_shoulder", "left_hip", "right_hip"]);
  const MAIN_JOINTS = ["left_shoulder", "right_shoulder", "left_wrist", "right_wrist", "left_hip", "right_hip",
    "left_knee", "right_knee", "left_ankle", "right_ankle"];
  const REPLAY_JOINTS = ["head", "left_shoulder", "right_shoulder", "left_elbow", "right_elbow", "left_wrist", "right_wrist",
    "left_hip", "right_hip", "left_knee", "right_knee", "left_ankle", "right_ankle", "left_heel", "right_heel"];
  const BONE_LIST = [["left_shoulder", "left_elbow"], ["left_elbow", "left_wrist"], ["right_shoulder", "right_elbow"],
    ["right_elbow", "right_wrist"], ["left_hip", "left_knee"], ["left_knee", "left_ankle"],
    ["left_ankle", "left_heel"], ["right_hip", "right_knee"], ["right_knee", "right_ankle"],
    ["right_ankle", "right_heel"], ["left_shoulder", "left_hip"], ["right_shoulder", "right_hip"]];

  // ---------- small number helpers (what numpy did for us) ----------
  const isn = Number.isNaN;
  function pct(arr, q) {            // numpy percentile (linear), ignoring NaN
    const v = [];
    for (let i = 0; i < arr.length; i++) if (!isn(arr[i])) v.push(arr[i]);
    if (!v.length) return NaN;
    v.sort((a, b) => a - b);
    const pos = (v.length - 1) * q / 100, lo = Math.floor(pos), hi = Math.ceil(pos);
    return v[lo] + (v[hi] - v[lo]) * (pos - lo);
  }
  function median(v) {
    const w = v.filter(x => !isn(x));
    if (!w.length) return NaN;
    w.sort((a, b) => a - b);
    const m = w.length >> 1;
    return w.length % 2 ? w[m] : (w[m - 1] + w[m]) / 2;
  }
  function nanmax(arr, lo, hi) {
    let m = NaN;
    for (let i = lo; i <= hi; i++) { const v = arr[i]; if (!isn(v) && (isn(m) || v > m)) m = v; }
    return m;
  }
  function nanmin(arr, lo, hi) {
    let m = NaN;
    for (let i = lo; i <= hi; i++) { const v = arr[i]; if (!isn(v) && (isn(m) || v < m)) m = v; }
    return m;
  }
  function anyFinite(arr, lo, hi) {
    for (let i = lo; i <= hi; i++) if (Number.isFinite(arr[i])) return true;
    return false;
  }
  const nan = n => new Float64Array(n).fill(NaN);
  function fmax(a, b) { return isn(a) ? b : (isn(b) ? a : Math.max(a, b)); }
  function fmin(a, b) { return isn(a) ? b : (isn(b) ? a : Math.min(a, b)); }
  function nanmean2(a, b) { return isn(a) ? b : (isn(b) ? a : (a + b) / 2); }
  function pyRound(x) { const f = Math.floor(x), d = x - f; if (d < 0.5) return f; if (d > 0.5) return f + 1; return f % 2 === 0 ? f : f + 1; }
  const f1 = x => (Math.round(x * 10) / 10).toFixed(1);

  function fillSmooth(a, maxGap, win) {
    maxGap = maxGap === undefined ? 6 : maxGap; win = win || 5;
    const n = a.length;
    let first = -1, last = -1, cnt = 0;
    for (let i = 0; i < n; i++) if (!isn(a[i])) { if (first < 0) first = i; last = i; cnt++; }
    if (cnt < 2) return Float64Array.from(a);
    const filled = new Float64Array(n);
    let prev = first;
    for (let i = 0; i < n; i++) {
      if (i <= first) { filled[i] = a[first]; continue; }
      if (i >= last) { filled[i] = a[last]; continue; }
      if (isn(a[i])) {
        let nx = i + 1; while (isn(a[nx])) nx++;
        filled[i] = a[prev] + (a[nx] - a[prev]) * (i - prev) / (nx - prev);
      } else { filled[i] = a[i]; prev = i; }
    }
    let gap = 0;
    for (let i = 0; i < n; i++) {
      if (isn(a[i])) gap++;
      else { if (gap > maxGap) for (let k = i - gap; k < i; k++) filled[k] = NaN; gap = 0; }
    }
    if (gap > maxGap) for (let k = n - gap; k < n; k++) filled[k] = NaN;
    const out = Float64Array.from(filled), h = win >> 1;
    for (let i = 0; i < n; i++) {
      if (!isn(filled[i])) {
        const w = [];
        for (let k = Math.max(0, i - h); k <= Math.min(n - 1, i + h); k++) w.push(filled[k]);
        out[i] = median(w);
      }
    }
    return out;
  }

  // "predict the movement" smoother (Kalman filter + backwards pass), only used for the drawing
  function predictSmooth(z, conf, TORSO, fps) {
    const m = z.length;
    const sigAcc = SKEL_ACCEL * TORSO / (fps * fps), q2 = sigAcc * sigAcc;
    const Q = [0.25 * q2, 0.5 * q2, 0.5 * q2, 1.0 * q2];
    let first = -1, cnt = 0;
    for (let i = 0; i < m; i++) if (Number.isFinite(z[i])) { if (first < 0) first = i; cnt++; }
    if (cnt < 2) return nan(m);
    const xf = new Array(m), Pf = new Array(m), xp = new Array(m), Pp = new Array(m);
    let x0 = z[first], x1 = 0;
    let P = [(SKEL_TRUST * TORSO) ** 2, 0, 0, (0.5 * TORSO) ** 2];
    for (let i = 0; i < m; i++) {
      if (i > 0) {
        x0 = x0 + x1;                               // F x
        P = [P[0] + P[2] + P[1] + P[3] + Q[0], P[1] + P[3] + Q[1], P[2] + P[3] + Q[2], P[3] + Q[3]];
      }
      xp[i] = [x0, x1]; Pp[i] = P.slice();
      if (Number.isFinite(z[i])) {
        const rr = (SKEL_TRUST * TORSO / Math.max(conf[i], 0.08)) ** 2;
        const S = P[0] + rr, K0 = P[0] / S, K1 = P[2] / S, r = z[i] - x0;
        x0 += K0 * r; x1 += K1 * r;
        P = [P[0] - K0 * P[0], P[1] - K0 * P[1], P[2] - K1 * P[0], P[3] - K1 * P[1]];
      }
      xf[i] = [x0, x1]; Pf[i] = P.slice();
    }
    const xs = xf.map(v => v.slice());
    for (let i = m - 2; i >= 0; i--) {
      const p = Pf[i], q = Pp[i + 1];
      const A = [p[0] + p[1], p[1], p[2] + p[3], p[3]];            // Pf F^T
      const det = q[0] * q[3] - q[1] * q[2] || 1e-12;
      const inv = [q[3] / det, -q[1] / det, -q[2] / det, q[0] / det];
      const C = [A[0] * inv[0] + A[1] * inv[2], A[0] * inv[1] + A[1] * inv[3],
        A[2] * inv[0] + A[3] * inv[2], A[2] * inv[1] + A[3] * inv[3]];
      const d0 = xs[i + 1][0] - xp[i + 1][0], d1 = xs[i + 1][1] - xp[i + 1][1];
      xs[i] = [xf[i][0] + C[0] * d0 + C[1] * d1, xf[i][1] + C[2] * d0 + C[3] * d1];
    }
    const out = new Float64Array(m);
    for (let i = 0; i < m; i++) out[i] = xs[i][0];
    return out;
  }

  function maskLongGaps(out, hasMeas, maxGap) {
    const m = out.length; let i = 0;
    while (i < m) {
      if (!hasMeas[i]) {
        let j = i; while (j < m && !hasMeas[j]) j++;
        if (j - i > maxGap || i === 0 || j === m) for (let k = i; k < j; k++) out[k] = NaN;
        i = j;
      } else i++;
    }
    return out;
  }

  function analyze(data) {
    const times = Float64Array.from(data.times);
    const n = times.length;
    if (n < 2) return { ok: false, reason: "noflare" };
    const fps = (n - 1) / (times[n - 1] - times[0]);
    const foundArr = data.found || new Array(n).fill(1);

    const RAW = {};   // untouched copy (positions + confidence), for tracking quality and the drawing
    const X = {}, Y = {};
    for (const j of JOINTS) {
      const d = data.joints[j];
      const x = Float64Array.from(d.x), y = Float64Array.from(d.y), c = Float64Array.from(d.c);
      RAW[j] = { x: Float64Array.from(x), y: Float64Array.from(y), c: Float64Array.from(c) };
      for (let i = 0; i < n; i++) if (isn(x[i]) || isn(y[i]) || isn(c[i]) || c[i] < MIN_CONF) { x[i] = NaN; y[i] = NaN; }
      X[j] = x; Y[j] = y;
    }

    const torso = nan(n);
    for (let i = 0; i < n; i++) {
      const sx = nanmean2(X.left_shoulder[i], X.right_shoulder[i]), sy = nanmean2(Y.left_shoulder[i], Y.right_shoulder[i]);
      const hx = nanmean2(X.left_hip[i], X.right_hip[i]), hy = nanmean2(Y.left_hip[i], Y.right_hip[i]);
      torso[i] = Math.hypot(sx - hx, sy - hy);
    }
    const TORSO = pct(torso, 90);

    // throw away impossible jumps
    for (const j of JOINTS) {
      const limit = (CORE.has(j) ? 0.8 : 2.2) * TORSO;
      let last = null;
      for (let i = 0; i < n; i++) {
        if (isn(X[j][i])) continue;
        if (last !== null && i - last[0] <= 3) {
          if (Math.hypot(X[j][i] - last[1], Y[j][i] - last[2]) > limit * (i - last[0])) { X[j][i] = NaN; Y[j][i] = NaN; continue; }
        }
        last = [i, X[j][i], Y[j][i]];
      }
    }
    for (const j of JOINTS) { X[j] = fillSmooth(X[j]); Y[j] = fillSmooth(Y[j]); }

    const hpy = nan(n), headx = X.head, heady = Y.head;
    for (let i = 0; i < n; i++) hpy[i] = nanmean2(Y.left_hip[i], Y.right_hip[i]);

    const low = nan(n), wristLow = nan(n);
    for (let i = 0; i < n; i++) {
      let m = NaN;
      for (const k of ["left_wrist", "right_wrist", "left_ankle", "right_ankle", "left_heel", "right_heel"]) m = fmax(m, Y[k][i]);
      low[i] = m;
      wristLow[i] = fmax(Y.left_wrist[i], Y.right_wrist[i]);
    }
    const FLOOR = pct(low, 95);
    const handsDown = [];
    for (let i = 0; i < n; i++) if (wristLow[i] > FLOOR - 0.3 * TORSO) handsDown.push(i);
    if (handsDown.length < Math.trunc(0.3 * fps)) return { ok: false, reason: "noflare" };
    const a = handsDown[0], b = handsDown[handsDown.length - 1];

    const spread = nan(n);
    for (let i = 0; i < n; i++) {
      const lx = X.left_ankle[i] - X.left_hip[i], ly = Y.left_ankle[i] - Y.left_hip[i];
      const rx = X.right_ankle[i] - X.right_hip[i], ry = Y.right_ankle[i] - Y.right_hip[i];
      if (isn(lx) || isn(ly) || isn(rx) || isn(ry)) continue;
      const d = (lx * rx + ly * ry) / (Math.hypot(lx, ly) * Math.hypot(rx, ry) + 1e-9);
      spread[i] = Math.acos(Math.max(-1, Math.min(1, d))) * 180 / Math.PI;
    }
    const inverted = new Array(n);
    for (let i = 0; i < n; i++) inverted[i] = heady[i] > hpy[i] + 0.15 * TORSO;

    function stretches(lo, hi) {
      const st = []; let s0 = null;
      for (let i = lo; i <= hi; i++) {
        if (inverted[i] && s0 === null) s0 = i;
        if (!inverted[i] && s0 !== null) { st.push([s0, i - 1]); s0 = null; }
      }
      if (s0 !== null) st.push([s0, hi]);
      const out = [];
      for (const s of st) {
        if (out.length && (s[0] - out[out.length - 1][1]) / fps <= 0.3) out[out.length - 1][1] = s[1];
        else out.push(s);
      }
      return out;
    }

    function judge(a, b, startAt) {
      let hipHeight = NaN;
      for (let i = a; i <= b; i++) { const v = (FLOOR - hpy[i]) / TORSO; if (!isn(v) && (isn(hipHeight) || v > hipHeight)) hipHeight = v; }
      let invCount = 0; for (let i = a; i <= b; i++) if (inverted[i]) invCount++;
      const invertedSeconds = invCount / fps;
      let kick = NaN;
      for (let i = a; i <= b; i++) {
        kick = fmin(kick, Math.hypot(X.left_ankle[i] - headx[i], Y.left_ankle[i] - heady[i]) / TORSO);
        kick = fmin(kick, Math.hypot(X.right_ankle[i] - headx[i], Y.right_ankle[i] - heady[i]) / TORSO);
      }
      let startSpread = null;
      if (startAt !== null && times[startAt] - times[0] >= 0.5) {
        const s0 = Math.max(0, startAt - Math.trunc(1.0 * fps));
        if (anyFinite(spread, s0, startAt)) startSpread = nanmax(spread, s0, startAt);
      }
      let flareSpread = null;
      for (const [s0, s1] of stretches(a, b)) {
        if ((s1 - s0 + 1) / fps >= MIN_INVERTED_SECONDS) {
          const end = Math.min(n - 1, s1 + Math.trunc(0.5 * fps));
          if (anyFinite(spread, a, end)) flareSpread = nanmax(spread, a, end);
          break;
        }
      }
      let dropShare = null;
      const kneeLow = new Float64Array(n), hipH = new Float64Array(n);
      for (let i = 0; i < n; i++) {
        kneeLow[i] = (FLOOR - fmax(Y.left_knee[i], Y.right_knee[i])) / TORSO;
        hipH[i] = (FLOOR - hpy[i]) / TORSO;
      }
      if (anyFinite(hipH, a, b)) {
        let peak = a, best = NaN;
        for (let i = a; i <= b; i++) if (!isn(hipH[i]) && (isn(best) || hipH[i] > best)) { best = hipH[i]; peak = i; }
        let okN = 0, below = 0;
        for (let i = peak; i <= b; i++) if (Number.isFinite(kneeLow[i])) { okN++; if (kneeLow[i] < DROP_KNEE_HEIGHT) below++; }
        if ((b - peak) / fps >= 0.5 && okN >= 0.5 * fps) dropShare = below / okN;
      }
      let problems = [];
      if (startSpread !== null && startSpread < MIN_START_OPENING) problems.push("start");
      if (flareSpread !== null && flareSpread < MIN_LEG_OPENING) problems.push("legs");
      if (kick > MAX_KICK_DISTANCE) problems.push("kick");
      if (dropShare !== null && dropShare > DROP_SHARE) problems.push("drop");
      if (hipHeight < MIN_HIP_HEIGHT) problems.push("lift");
      if (invertedSeconds < MIN_INVERTED_SECONDS) problems.push("flip");
      if (problems.includes("kick")) problems = problems.filter(p => p !== "lift" && p !== "flip");
      if (["start", "legs", "lift"].some(p => problems.includes(p))) problems = problems.filter(p => p !== "drop");
      problems.sort((p, q) => PRIORITY.indexOf(p) - PRIORITY.indexOf(q));
      return { hipHeight, invertedSeconds, kick, startSpread, flareSpread, dropShare, problems };
    }

    const rounds = stretches(0, n - 1).filter(r => (r[1] - r[0] + 1) / fps >= 0.2);
    const windmillTip = rounds.length > MORE_THAN_ROUNDS ? WINDMILL_CONNECT : WINDMILL_ASK;
    const TIPS_ALL = [GENERAL[0].concat("1"), windmillTip, GENERAL[1].concat("3")];
    const res = judge(a, b, a);

    // the "first round" case: part of one round with open legs, hips that don't collapse, then a leg goes down
    function firstRoundCase() {
      if (rounds.length) return false;
      if ((b - a) / fps < 0.5) return false;
      const hh = [], foot = [];
      for (let i = a; i <= b; i++) {
        hh.push((FLOOR - hpy[i]) / TORSO);
        foot.push((FLOOR - fmin(Y.left_ankle[i], Y.right_ankle[i])) / TORSO);
      }
      if (!hh.some(Number.isFinite) || !foot.some(Number.isFinite) || !anyFinite(spread, a, b)) return false;
      const fm = Math.max.apply(null, foot.filter(Number.isFinite));
      return pct(hh, 5) >= FR_MIN_HIPS_OFF_FLOOR && fm >= FR_MIN_FOOT_HEIGHT && nanmax(spread, a, b) >= FR_MIN_LEG_OPENING;
    }
    const FIRST_ROUND = firstRoundCase();
    const observe = Object.assign({}, OBSERVE);
    if (FIRST_ROUND) {
      res.problems = ["onward"];
      res.flareSpread = nanmax(spread, a, b);
      TIPS_ALL[1] = WINDMILL_ONE;
      let stop = b;
      for (let i = a; i <= b; i++) {
        const hi = (FLOOR - fmin(Y.left_ankle[i], Y.right_ankle[i])) / TORSO;
        if (Number.isFinite(hi) && hi >= FR_MIN_FOOT_HEIGHT) stop = i;
      }
      observe.onward = OBSERVE.onward.replace("{t}", f1(times[stop] - times[0]));
    }
    const problems = res.problems;

    // can we trust what we saw?
    let run = 0, bestRun = 0, foundN = 0, clearN = 0, tot = b - a + 1;
    for (let i = a; i <= b; i++) {
      let s = 0;
      for (const j of MAIN_JOINTS) { const c = RAW[j].c[i]; s += isn(c) ? 0 : c; }
      const q = s / MAIN_JOINTS.length;
      if (q < 0.3) { run++; if (run > bestRun) bestRun = run; } else run = 0;
      if (q >= 0.45) clearN++;
      if (foundArr[i]) foundN++;
    }
    const tq = { found: foundN / tot, clear: clearN / tot, lostSeconds: bestRun / fps };
    const refuseReasons = [];
    if (tq.found < REFUSE_IF_FOUND_BELOW) refuseReasons.push("I could only find you in " + Math.round(tq.found * 100) + "% of the video.");
    if (tq.lostSeconds > REFUSE_IF_LOST_LONGER) refuseReasons.push("I lost you for " + f1(tq.lostSeconds) + " seconds in a row.");
    if (tq.clear < REFUSE_IF_CLEAR_BELOW) refuseReasons.push("I only saw your whole body clearly in " + Math.round(tq.clear * 100) + "% of the video.");
    let track = "ok";
    if (refuseReasons.length) track = "refuse";
    else if (tq.clear < CAUTION_IF_CLEAR_BELOW || tq.lostSeconds > CAUTION_IF_LOST_LONGER) track = "caution";
    const cautionText = "I lost track of you for a moment (" + f1(tq.lostSeconds) + "s) and only saw you clearly " +
      Math.round(tq.clear * 100) + "% of the time, so part of this feedback is based on the moments I could see.";

    // status of every check: true = fine, false = needs work, null = couldn't be judged in this video
    const status = {
      onward: FIRST_ROUND ? false : null,
      start: res.startSpread === null ? null : res.startSpread >= MIN_START_OPENING,
      legs: res.flareSpread === null ? null : res.flareSpread >= MIN_LEG_OPENING,
      kick: res.kick <= MAX_KICK_DISTANCE,
      lift: res.hipHeight >= MIN_HIP_HEIGHT,
      flip: res.invertedSeconds >= MIN_INVERTED_SECONDS,
      drop: res.dropShare === null ? null : res.dropShare <= DROP_SHARE,
    };
    let HIDE;
    if (FIRST_ROUND) { status.lift = true; HIDE = new Set(["start", "kick", "flip", "drop"]); }
    else HIDE = new Set(["onward"]);
    const SHOWN = PRIORITY.filter(k => !HIDE.has(k));
    const areas = {};
    for (const k of PRIORITY) areas[k] = (HIDE.has(k) || status[k] === null) ? "na" : (status[k] ? "ok" : (problems.includes(k) ? "issue" : "na"));
    const order = SHOWN.filter(k => status[k] === false).concat(SHOWN.filter(k => status[k] !== false));
    const rest = order.filter(k => status[k] !== false);
    const tiles = [];
    for (const k of order) {
      const st = status[k];
      if (HIDE.has(k)) continue;
      if (st === false && !problems.includes(k)) continue;
      const wide = st !== false && k === rest[rest.length - 1] && rest.length % 2 === 1;
      tiles.push({ key: k, name: CHECK_NAME[k], desc: CHECK_DESC[k], short: SHORT[k], state: st === false ? "bad" : (st === true ? "ok" : "na"), wide });
    }
    const drills = [], seenT = new Set();
    for (const p of problems.slice(0, 2)) for (const t of PRACTICE[p]) {
      if (seenT.has(t)) continue; seenT.add(t); drills.push({ for: CHECK_NAME[p], text: t });
    }

    // ---- the replay (drawing only): more forgiving than the judging ----
    const R = {};
    for (const j of REPLAY_JOINTS) {
      const x = Float64Array.from(RAW[j].x), y = Float64Array.from(RAW[j].y), c = RAW[j].c;
      for (let i = 0; i < n; i++) if (isn(x[i]) || isn(y[i]) || isn(c[i]) || c[i] < DISPLAY_CONF) { x[i] = NaN; y[i] = NaN; }
      R[j] = { x, y, c };
    }
    const quality = new Float64Array(n);
    for (let i = 0; i < n; i++) { let s = 0; for (const j of MAIN_JOINTS) { const c = RAW[j].c[i]; s += isn(c) ? 0 : c; } quality[i] = s / MAIN_JOINTS.length; }
    for (const j of REPLAY_JOINTS) for (let i = 0; i < n; i++) if (quality[i] < DISPLAY_MIN_FRAME_QUALITY) { R[j].x[i] = NaN; R[j].y[i] = NaN; }
    const maxLen = {};
    for (const [p, q] of BONE_LIST) {
      const ln = [];
      for (let i = 0; i < n; i++) {
        if (R[p].c[i] >= MIN_CONF && R[q].c[i] >= MIN_CONF && Number.isFinite(R[p].x[i]) && Number.isFinite(R[q].x[i]))
          ln.push(Math.hypot(R[p].x[i] - R[q].x[i], R[p].y[i] - R[q].y[i]));
      }
      if (ln.length >= 5) maxLen[p + "|" + q] = BONE_STRETCH * pct(ln, 95);
    }
    for (const key of Object.keys(maxLen)) {
      const [p, q] = key.split("|"), mx = maxLen[key];
      for (let i = 0; i < n; i++) if (Math.hypot(R[p].x[i] - R[q].x[i], R[p].y[i] - R[q].y[i]) > mx) { R[q].x[i] = NaN; R[q].y[i] = NaN; }
    }
    {
      const hl = new Float64Array(n), okh = [];
      for (let i = 0; i < n; i++) {
        const nx = (R.left_shoulder.x[i] + R.right_shoulder.x[i]) / 2, ny = (R.left_shoulder.y[i] + R.right_shoulder.y[i]) / 2;
        hl[i] = Math.hypot(R.head.x[i] - nx, R.head.y[i] - ny);
        if (R.head.c[i] >= MIN_CONF && Number.isFinite(hl[i])) okh.push(hl[i]);
      }
      if (okh.length >= 5) {
        const lim = BONE_STRETCH * pct(okh, 95);
        for (let i = 0; i < n; i++) if (hl[i] > lim) { R.head.x[i] = NaN; R.head.y[i] = NaN; }
      }
    }
    const DX = {}, DY = {}, gapFrames = Math.max(6, Math.trunc(DISPLAY_FILL_SECONDS * fps));
    for (const j of REPLAY_JOINTS) {
      const x = R[j].x, y = R[j].y, limit = (CORE.has(j) ? 0.8 : 2.2) * TORSO;
      let last = null;
      for (let i = 0; i < n; i++) {
        if (isn(x[i])) continue;
        if (last !== null && i - last[0] <= 3) {
          if (Math.hypot(x[i] - last[1], y[i] - last[2]) > limit * (i - last[0])) { x[i] = NaN; y[i] = NaN; continue; }
        }
        last = [i, x[i], y[i]];
      }
      const has = new Array(n);
      for (let i = 0; i < n; i++) has[i] = Number.isFinite(x[i]) && Number.isFinite(y[i]);
      DX[j] = maskLongGaps(predictSmooth(x, R[j].c, TORSO, fps), has, gapFrames);
      DY[j] = maskLongGaps(predictSmooth(y, R[j].c, TORSO, fps), has, gapFrames);
    }
    for (const key of Object.keys(maxLen)) {
      const [p, q] = key.split("|"), mx = maxLen[key];
      for (let i = 0; i < n; i++) {
        const dx = DX[q][i] - DX[p][i], dy = DY[q][i] - DY[p][i], ln = Math.hypot(dx, dy);
        if (Number.isFinite(ln) && ln > mx) { DX[q][i] = DX[p][i] + dx / ln * mx; DY[q][i] = DY[p][i] + dy / ln * mx; }
      }
    }
    const rf0 = Math.max(0, a - Math.trunc(0.6 * fps)), rf1 = Math.min(n - 1, b + Math.trunc(0.6 * fps));
    const step = Math.max(1, pyRound(fps / 20));
    const idxs = []; for (let i = rf0; i <= rf1; i += step) idxs.push(i);
    let bx0 = Infinity, by0 = Infinity, bx1 = -Infinity, by1 = -Infinity, cntOk = 0;
    for (const j of REPLAY_JOINTS) for (let i = rf0; i <= rf1; i++) {
      if (Number.isFinite(DX[j][i]) && Number.isFinite(DY[j][i])) {
        cntOk++; bx0 = Math.min(bx0, DX[j][i]); bx1 = Math.max(bx1, DX[j][i]); by0 = Math.min(by0, DY[j][i]); by1 = Math.max(by1, DY[j][i]);
      }
    }
    const box = cntOk > 10 ? [bx0, by0, bx1, Math.max(by1, FLOOR)] : [0, 0, 1, 1];
    const frames = idxs.map(i => REPLAY_JOINTS.map(j =>
      (Number.isFinite(DX[j][i]) && Number.isFinite(DY[j][i])) ? [Math.round(DX[j][i] * 10) / 10, Math.round(DY[j][i] * 10) / 10] : null));
    const replay = { joints: REPLAY_JOINTS, box, floor: FLOOR, dt: step / fps, t0: times[rf0] - times[0], frames, lost: frames.map(fr => fr.every(p => p === null)) };

    const findings = {
      areas, main: problems.length ? problems[0] : null,
      headline: problems.length ? HEADLINE[problems[0]] : "NICE FLARES",
      first_round: FIRST_ROUND, rounds: FIRST_ROUND ? 1 : rounds.length, track,
    };
    return {
      ok: true, findings, replay, track, refuseReasons, cautionText, filmTips: FILM_TIPS,
      problems, observe, fix: FIX, why: WHY, headline: HEADLINE, short: SHORT, checkName: CHECK_NAME,
      tiles, drills, tips: TIPS_ALL.map(t => ({ title: t[0], text: t[1], badge: t[2] })),
      seen: f1(times[a] - times[0]) + "s to " + f1(times[b] - times[0]) + "s",
      roundsSeen: FIRST_ROUND ? "1 (PART)" : String(rounds.length),
      numbers: { hipHeight: res.hipHeight, invertedSeconds: res.invertedSeconds, kick: res.kick, startSpread: res.startSpread, flareSpread: res.flareSpread, dropShare: res.dropShare },
    };
  }

  const API = { analyze, FILM_TIPS, JOINTS, REPLAY_JOINTS, PRIORITY, CHECK_NAME, HEADLINE, SHORT, FIX };
  if (typeof module !== "undefined" && module.exports) module.exports = API; else window.BDJudge = API;
})();
