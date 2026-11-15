// FILE NAME: windmill.js
// The windmill, first version (BETA). It reads the body points from the scan, checks that a windmill really is in the video,
// and builds the replay. It does NOT give a pass or fail on the technique yet. It gives the coaching points to watch for.
(function () {
  "use strict";
  const J = window.BDJudge;
  const isn = v => !Number.isFinite(v);

  const POINTS = [
    ["YOUR STAB", "If you start from a stab, keep the stabbed hand in your stomach and slide it down your body while you roll. It must not leave the floor suddenly. That is how you keep the momentum and stay safe."],
    ["YOUR ANGLE", "Your body should be on an oblique angle, like a slope. Not perpendicular to the floor, straight up and down."],
    ["YOUR LANDING", "Land on your upper back, not your lower back. A windmill on the lower back is not the right technique."],
    ["BETWEEN THE HALVES", "After the first half, roll to your shoulder first, and only then go into the stab. If your hips or lower back touch the floor in between, the second half drops."],
    ["YOUR LEGS", "Keep your legs in a V shape while you roll. An L shape, with your legs flat out parallel to the floor, doesn't help the momentum."],
  ];
  const DRILLS = [
    ["SHOULDER FREEZE", "Roll to your shoulder, hold a freeze there, stay up on your upper back, and only then go into the stab."],
    ["KEEP THE STAB", "Do slow half rounds where the stabbed hand stays on the floor and slides down your body the whole way. Don't let it lift."],
    ["STACK ROUNDS", "Stab windmill first. When you can do 7 or 8 rounds in a row, start training for headmills."],
  ];
  const TIPS = [
    ["STAB WINDMILL", "This is the first stage of the windmill. Get your stab windmills clean. When you can do 7 or 8 rounds of them, start training for headmills.", "1"],
    ["HEADMILL", "In a headmill you go onto your head before going back to your back, almost like a headstand. It is a different style, not a mistake, and it is the next step after strong stab windmills.", "2"],
    ["KEEP A V, NOT AN L", "Aim to keep your legs in a V and your hips in control. An L shape kills the momentum, so slow down, go through the shoulder, and keep working on your hips.", "3"],
  ];

  function analyze(data) {
    const times = data.times, n = times.length;
    if (n < 10) return { ok: false };
    const fps = (n - 1) / Math.max(0.001, times[n - 1] - times[0]);
    const names = J.REPLAY_JOINTS, X = {}, Y = {}, C = {};
    for (const nm of names) {
      const s = data.joints[nm];
      if (!s) return { ok: false };
      const x = new Float64Array(n), y = new Float64Array(n);
      for (let i = 0; i < n; i++) {
        const c = s.c[i], ok = !isn(s.x[i]) && !isn(s.y[i]) && !isn(c) && c >= 0.25;
        x[i] = ok ? s.x[i] : NaN; y[i] = ok ? s.y[i] : NaN;
      }
      // fill short gaps, then smooth a little
      for (const arr of [x, y]) {
        let last = -1;
        for (let i = 0; i < n; i++) {
          if (isn(arr[i])) continue;
          if (last >= 0 && i - last > 1 && i - last <= 9) for (let k = last + 1; k < i; k++) arr[k] = arr[last] + (arr[i] - arr[last]) * (k - last) / (i - last);
          last = i;
        }
        const o = Float64Array.from(arr);
        for (let i = 0; i < n; i++) {
          let sum = 0, cnt = 0;
          for (let k = -2; k <= 2; k++) { const v = arr[i + k]; if (i + k >= 0 && i + k < n && !isn(v)) { sum += v; cnt++; } }
          o[i] = cnt >= 3 ? sum / cnt : NaN;
        }
        arr.set(o);
      }
      X[nm] = x; Y[nm] = y;
    }
    const mid = (a, b, i) => (isn(X[a][i]) || isn(X[b][i])) ? NaN : (Y[a][i] + Y[b][i]) / 2;
    const T = [], ext = [];
    for (let i = 0; i < n; i++) {
      const sy = mid("left_shoulder", "right_shoulder", i), hy = mid("left_hip", "right_hip", i);
      const sx = (X.left_shoulder[i] + X.right_shoulder[i]) / 2, hx = (X.left_hip[i] + X.right_hip[i]) / 2;
      if (!isn(sy) && !isn(hy)) T.push(Math.hypot(sx - hx, sy - hy));
      const m = Math.max(Y.left_wrist[i], Y.right_wrist[i], Y.left_ankle[i], Y.right_ankle[i], Y.head ? Y.head[i] : NaN);
      if (!isn(m)) ext.push(m);
    }
    const pct = (a, p) => { const s = a.slice().sort((u, v) => u - v); return s[Math.min(s.length - 1, Math.max(0, Math.round(p * (s.length - 1))))]; };
    if (T.length < 10 || ext.length < 10) return { ok: false };
    const TORSO = pct(T, 0.9), FLOOR = pct(ext, 0.95);
    // is there a windmill in the video? the legs go high while the shoulders are low, for a good part of a second
    let hit = 0, first = -1, last = -1;
    for (let i = 0; i < n; i++) {
      const sy = mid("left_shoulder", "right_shoulder", i), ay = Math.min(Y.left_ankle[i], Y.right_ankle[i]);
      if (isn(sy) || isn(ay)) continue;
      if ((FLOOR - sy) / TORSO < 0.9 && (FLOOR - ay) / TORSO > 1.0) { hit++; }
      if (data.found && data.found[i]) { if (first < 0) first = i; last = i; }
    }
    if (hit / fps < 0.4 || first < 0) return { ok: false };
    const a = Math.max(0, first - Math.trunc(0.3 * fps)), b = Math.min(n - 1, last + Math.trunc(0.3 * fps));
    const step = Math.max(1, Math.round(fps / 20)), idxs = [];
    for (let i = a; i <= b; i += step) idxs.push(i);
    let bx0 = Infinity, by0 = Infinity, bx1 = -Infinity, by1 = -Infinity, cnt = 0;
    for (const nm of names) for (let i = a; i <= b; i++) if (!isn(X[nm][i]) && !isn(Y[nm][i])) { cnt++; bx0 = Math.min(bx0, X[nm][i]); bx1 = Math.max(bx1, X[nm][i]); by0 = Math.min(by0, Y[nm][i]); by1 = Math.max(by1, Y[nm][i]); }
    const box = cnt > 10 ? [bx0, by0, bx1, Math.max(by1, FLOOR)] : [0, 0, 1, 1];
    const frames = idxs.map(i => names.map(nm => (!isn(X[nm][i]) && !isn(Y[nm][i])) ? [Math.round(X[nm][i] * 10) / 10, Math.round(Y[nm][i] * 10) / 10] : null));
    const replay = { joints: names, box, floor: FLOOR, dt: step / fps, t0: times[a] - times[0], frames, lost: frames.map(fr => fr.every(p => p === null)) };
    const f1 = v => (Math.round(v * 10) / 10).toFixed(1);
    return {
      ok: true, kind: "windmill", moveKey: "windmill", moveName: "Windmill", replay, track: "ok", refuseReasons: [], cautionText: "", filmTips: J.FILM_TIPS,
      findings: { move: "windmill", areas: {}, main: null, headline: "WINDMILL SCANNED", rounds: 0, track: "ok" },
      problems: [], tiles: [], drills: [], points: POINTS, practice: DRILLS, tips: TIPS.map(t => ({ title: t[0], text: t[1], badge: t[2] })),
      seen: f1(times[a] - times[0]) + "s to " + f1(times[b] - times[0]) + "s",
    };
  }
  window.BDWindmill = { analyze };
})();
