// FILE NAME: pose.js
// Finds your skeleton in a video, on the phone itself (MediaPipe Pose Landmarker, in the browser).
// The video never leaves the phone. Output is the same shape the judge reads.
(function () {
  "use strict";
  const VER = "0.10.14";
  const CDN = [
    "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@" + VER,
    "https://unpkg.com/@mediapipe/tasks-vision@" + VER,
  ];
  const MODEL = n => "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_" + n + "/float16/1/pose_landmarker_" + n + ".task";
  const MAX_SIDE = 640;          // the model looks at a small picture anyway, so we don't feed it more
  const RATE = 30;               // pictures per second we look at
  const MAX_SECONDS = 40;

  // our joint name -> MediaPipe landmark number (the head is worked out separately)
  const LM = {
    left_shoulder: 11, right_shoulder: 12, left_elbow: 13, right_elbow: 14, left_wrist: 15, right_wrist: 16,
    left_hip: 23, right_hip: 24, left_knee: 25, right_knee: 26, left_ankle: 27, right_ankle: 28, left_heel: 29, right_heel: 30,
  };
  const JOINT_NAMES = ["head"].concat(Object.keys(LM));
  // for the drawing while it scans
  const BONES = [[11, 12], [11, 13], [13, 15], [12, 14], [14, 16], [11, 23], [12, 24], [23, 24], [23, 25], [25, 27], [27, 29],
    [24, 26], [26, 28], [28, 30], [0, 11], [0, 12]];

  let visionP = null;
  function loadVision() {
    if (visionP) return visionP;
    visionP = (async () => {
      let lastErr;
      for (const base of CDN) {
        try {
          const mod = await import(base + "/vision_bundle.mjs");
          const fileset = await mod.FilesetResolver.forVisionTasks(base + "/wasm");
          return { mod, fileset };
        } catch (e) { lastErr = e; }
      }
      throw lastErr || new Error("Could not load the pose model.");
    })();
    visionP.catch(() => { visionP = null; });
    return visionP;
  }

  async function makeLandmarker(vis, name, video) {
    // IMAGE mode: every picture is looked at fresh, with no memory of the last one. That matters upside down,
    // because the tracking mode tends to keep believing the dancer is still the right way up.
    const make = (delegate, nm) => vis.mod.PoseLandmarker.createFromOptions(vis.fileset, {
      baseOptions: { modelAssetPath: MODEL(nm), delegate },
      runningMode: video ? "VIDEO" : "IMAGE", numPoses: 1,
      minPoseDetectionConfidence: 0.35, minPosePresenceConfidence: 0.35, minTrackingConfidence: 0.35,
    });
    try { return { lm: await make("GPU", name), delegate: "GPU", model: name }; }
    catch (e) {
      const nm = name === "heavy" ? "full" : name;   // the biggest model is too slow without the graphics chip
      return { lm: await make("CPU", nm), delegate: "CPU", model: nm };
    }
  }

  // ---- crop and rotate helpers ----
  // The dancer is cut out of the picture (zoomed in, so the model sees more detail) and, when upside down, turned the
  // right way up before the model looks. The answers are then mapped back onto the full picture.
  const S = 320;                                   // the square the model is shown
  function cropGeom(r) { const k = S / Math.max(r.w, r.h); return { k, ox: (S - r.w * k) / 2, oy: (S - r.h * k) / 2 }; }
  // a point found in the square (0..1) -> normalised position in the full picture
  function unmap(x, y, r, rot, cw, ch) {
    if (rot) { x = 1 - x; y = 1 - y; }
    const g = cropGeom(r);
    return [(r.x + (x * S - g.ox) / g.k) / cw, (r.y + (y * S - g.oy) / g.k) / ch];
  }
  function mapBack(lms, r, rot, cw, ch) {
    return lms.map(p => { const q = unmap(p.x, p.y, r, rot, cw, ch); return { x: q[0], y: q[1], z: p.z, visibility: p.visibility == null ? 1 : p.visibility }; });
  }
  const CORE = [11, 12, 23, 24, 25, 26, 27, 28];
  function quality(lms) { if (!lms) return 0; let s2 = 0; for (const i of CORE) s2 += lms[i].visibility == null ? 1 : lms[i].visibility; return s2 / CORE.length; }
  // where to cut: around the last place we saw the body, with room for the next move
  function nextRect(lms, cw, ch, old) {
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9, n = 0;
    for (const i of [0, 11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28, 29, 30]) {
      const p = lms[i]; if (!p || (p.visibility == null ? 1 : p.visibility) < 0.3) continue;
      x0 = Math.min(x0, p.x * cw); x1 = Math.max(x1, p.x * cw); y0 = Math.min(y0, p.y * ch); y1 = Math.max(y1, p.y * ch); n++;
    }
    if (n < 5) return null;
    const m = Math.max(x1 - x0, y1 - y0, 0.22 * Math.max(cw, ch));
    let w = (x1 - x0) * 1.35 + m * 0.35, h = (y1 - y0) * 1.35 + m * 0.35;
    let cx0 = (x0 + x1) / 2, cy0 = (y0 + y1) / 2;
    if (old) { cx0 = old.cx + (cx0 - old.cx) * 0.7; cy0 = old.cy + (cy0 - old.cy) * 0.7; w = Math.max(w, old.w0 * 0.9); h = Math.max(h, old.h0 * 0.9); }
    w = Math.min(w, cw); h = Math.min(h, ch);
    const x = Math.max(0, Math.min(cw - w, cx0 - w / 2)), y = Math.max(0, Math.min(ch - h, cy0 - h / 2));
    return { x, y, w, h, cx: cx0, cy: cy0, w0: w, h0: h };
  }

  // MediaPipe has no "top of the head" point. The judge was tuned with one, so we estimate it from the nose and neck.
  function headPoint(lm) {
    const n = lm[0], l = lm[11], r = lm[12];
    if (!n || !l || !r) return null;
    const nx = (l.x + r.x) / 2, ny = (l.y + r.y) / 2;
    return { x: n.x + 0.55 * (n.x - nx), y: n.y + 0.55 * (n.y - ny), v: n.visibility == null ? 1 : n.visibility };
  }

  function draw(cx, cv, src, lm) {
    cx.drawImage(src, 0, 0, cv.width, cv.height);
    if (!lm) return;
    cx.lineWidth = Math.max(2, cv.width / 140); cx.lineCap = "round";
    cx.strokeStyle = "#5cffc4"; cx.shadowColor = "#5cffc4"; cx.shadowBlur = 8;
    for (const [a, b] of BONES) {
      const p = lm[a], q = lm[b];
      if (!p || !q || (p.visibility == null ? 1 : p.visibility) < 0.3 || (q.visibility == null ? 1 : q.visibility) < 0.3) continue;
      cx.beginPath(); cx.moveTo(p.x * cv.width, p.y * cv.height); cx.lineTo(q.x * cv.width, q.y * cv.height); cx.stroke();
    }
    cx.shadowBlur = 0;
  }


  // MediaPipe often mixes up left and right limbs when a dancer is upside down (the left leg suddenly becomes the right).
  // That is what makes legs jump and cross in the replay. Fix it by checking, frame by frame, which way round the pair
  // is closest to where it was a moment ago.
  const PAIRS = { all: ["shoulder", "elbow", "wrist", "hip", "knee", "ankle", "heel"], arms: ["shoulder", "elbow", "wrist"], legs: ["hip", "knee", "ankle", "heel"] };
  function fixLeftRight(data) {
    const J = data.joints, n = data.times.length, ref = {}, age = {};
    let tor = 0;
    const get = (nm, i) => { const d = J[nm]; return Number.isFinite(d.x[i]) ? [d.x[i], d.y[i]] : null; };
    const swapAt = (grp, i) => {
      for (const k of PAIRS[grp]) {
        const a = J["left_" + k], b = J["right_" + k];
        for (const key of ["x", "y", "c"]) { const t = a[key][i]; a[key][i] = b[key][i]; b[key][i] = t; }
      }
    };
    let swaps = 0;
    for (let i = 0; i < n; i++) {
      for (const grp of ["all", "arms", "legs"]) {
        let same = 0, swap = 0, used = 0;
        for (const k of PAIRS[grp]) {
          const L = get("left_" + k, i), R = get("right_" + k, i), rl = ref["left_" + k], rr = ref["right_" + k];
          if (!L || !R || !rl || !rr || age["left_" + k] > 8 || age["right_" + k] > 8) continue;
          same += Math.hypot(L[0] - rl[0], L[1] - rl[1]) + Math.hypot(R[0] - rr[0], R[1] - rr[1]);
          swap += Math.hypot(L[0] - rr[0], L[1] - rr[1]) + Math.hypot(R[0] - rl[0], R[1] - rl[1]);
          used++;
        }
        if (used >= (grp === "all" ? 4 : 2) && tor > 0 && same / (2 * used) > 0.3 * tor && swap < 0.45 * same) { swapAt(grp, i); swaps++; }
      }
      const a1 = get("left_shoulder", i), a2 = get("right_shoulder", i), b1 = get("left_hip", i), b2 = get("right_hip", i);
      if (a1 && a2 && b1 && b2) { const d = Math.hypot((a1[0] + a2[0]) / 2 - (b1[0] + b2[0]) / 2, (a1[1] + a2[1]) / 2 - (b1[1] + b2[1]) / 2); tor = tor ? tor * 0.95 + d * 0.05 : d; }
      for (const nm of Object.keys(J)) {
        const p = get(nm, i);
        if (p) { ref[nm] = p; age[nm] = 0; } else age[nm] = (age[nm] == null ? 99 : age[nm] + 1);
      }
    }
    return swaps;
  }

  // Start downloading the model quietly while the person is still on the menu, so the first scan isn't slow.
  function warmup(model) {
    if (window.BD_STUB) return;
    loadVision().then(() => fetch(MODEL(model || "full")).catch(() => { })).catch(() => { });
  }

  // Scan a video file. opts: { model: "lite"|"full", preview: <canvas>, onProgress(fraction, text, secondsLeft), cancelled() }
  // The video is PLAYED and every picture it shows is read as it goes (much faster than jumping to each frame).
  // If this phone is slower than the video, playback slows down so no moves are skipped.
  async function scanVideo(file, opts) {
    opts = opts || {};
    const say = (f, t, e) => opts.onProgress && opts.onProgress(f, t, e);
    const stub = window.BD_STUB || null;       // a test hook: pose numbers supplied by a test instead of the model
    let lm = null, delegate = "stub", usedModel = opts.model || "full";
    if (!stub) {
      say(0.01, "Getting the model ready (first time takes a moment)...");
      const made = window.BD_FAKELM ? { lm: window.BD_FAKELM, delegate: "fake", model: "fake" }   // a test hook
        : await makeLandmarker(await loadVision(), opts.simple ? (opts.model === "lite" ? "lite" : "full") : (opts.model || "full"), !!opts.simple);
      lm = made.lm; delegate = made.delegate; usedModel = made.model;
    }
    const f = Math.max(1, +opts.slow || 1);   // 1 = normal video. 4 or 8 = slow motion that plays 4x or 8x slower than real life
    const video = document.createElement("video");
    video.muted = true; video.defaultMuted = true; video.playsInline = true; video.preload = "auto";
    video.setAttribute("playsinline", ""); video.setAttribute("webkit-playsinline", ""); video.setAttribute("muted", "");
    video.style.cssText = "position:fixed;left:-9999px;top:0;width:2px;height:2px;opacity:0;pointer-events:none";
    document.body.appendChild(video);
    const url = URL.createObjectURL(file);
    try {
      video.src = url;
      await new Promise((ok, no) => { video.onloadedmetadata = ok; video.onerror = () => no(new Error("This phone couldn't open that video. Try an mp4 or mov.")); });
      const dur = video.duration;
      if (!isFinite(dur) || dur <= 0) throw new Error("I couldn't read how long that video is.");
      const realDur = dur / f;                   // how long the move really took, in real life
      if (realDur > MAX_SECONDS + 0.5) throw new Error("That video is about " + Math.round(realDur) + " seconds" + (f > 1 ? " in real time" : "") + ". The limit is " + MAX_SECONDS + " seconds. Please trim it and try again." + (f === 1 ? " If it's a slow-motion video, choose slow motion before scanning." : ""));
      const w = video.videoWidth, h = video.videoHeight, sc = Math.min(1, MAX_SIDE / Math.max(w, h));
      const cw = Math.max(2, Math.round(w * sc)), ch = Math.max(2, Math.round(h * sc));
      const frame = document.createElement("canvas"); frame.width = cw; frame.height = ch;
      const fx = frame.getContext("2d");
      let pcx = null;
      if (opts.preview) { opts.preview.width = cw; opts.preview.height = ch; pcx = opts.preview.getContext("2d"); }

      const cc = document.createElement("canvas"); cc.width = cc.height = S; const cxx = cc.getContext("2d");
      let rect = null, rot = false, cropOk = true;
      const FULL = { x: 0, y: 0, w: cw, h: ch };
      const look = (r, rt) => {
        const g = cropGeom(r);
        cxx.save(); cxx.fillStyle = "#000"; cxx.fillRect(0, 0, S, S);
        if (rt) { cxx.translate(S, S); cxx.rotate(Math.PI); }
        cxx.drawImage(frame, r.x, r.y, r.w, r.h, g.ox, g.oy, r.w * g.k, r.h * g.k);
        cxx.restore();
        const out = lm.detect(cc);
        const l = out && out.landmarks && out.landmarks[0];
        return l ? mapBack(l, r, rt, cw, ch) : null;
      };
      const findPerson = (mt) => {
        if (opts.simple) { const o = lm.detectForVideo(frame, Math.round(mt * 1000) + 1); return o && o.landmarks && o.landmarks[0] || null; }   // the plain, proven way: whole picture, with tracking
        if (!cropOk) { const o = lm.detect(frame); return o && o.landmarks && o.landmarks[0] || null; }
        try {
          const r = rect || FULL;
          let best = look(r, rot), bq = quality(best), brot = rot;
          if (bq < 0.7) {                         // not sure? look again with the picture turned over
            const alt = look(r, !rot), aq = quality(alt);
            if (aq > bq + 0.05) { best = alt; bq = aq; brot = !rot; }
          }
          if (best && bq >= 0.35) { rot = brot; rect = nextRect(best, cw, ch, rect); }
          else { rect = null; if (!best) return null; }
          return best;
        } catch (e) { cropOk = false; return null; }   // if cropping ever fails, fall back to plain full-picture reading
      };

      const got = [];                       // what we read: { t, pts }
      let thumb = null, thumbDone = false, lastMT = -1, ema = 0, count = 0, lastProc = -1e9;
      const interval = f / RATE;                 // time between the pictures we read, on the video's own clock
      const t0 = performance.now();
      await new Promise((resolve, reject) => {
        let done = false, lastBeat = performance.now();
        const stop = err => { if (done) return; done = true; clearInterval(wd); try { video.pause(); } catch (e) { } err ? reject(err) : resolve(); };
        const wd = setInterval(() => { if (performance.now() - lastBeat > 12000) stop(new Error("The video stopped playing while I was reading it. Please try again.")); }, 1000);
        video.addEventListener("ended", () => stop());
        const handle = mt => {
          if (mt <= lastMT) return; lastMT = mt; lastBeat = performance.now();
          if (mt - lastProc < interval * 0.9) return;   // fast or slow-motion video: we only need about 30 pictures per real second
          lastProc = mt;
          if (opts.cancelled && opts.cancelled()) throw new Error("cancelled");
          const a = performance.now();
          fx.drawImage(video, 0, 0, cw, ch);
          let pts = null;
          if (stub) pts = stub(mt / f);
          else {
            pts = findPerson(mt);
          }
          const ms = performance.now() - a; ema = count ? ema * 0.85 + ms * 0.15 : ms; count++;
          got.push({ t: mt / f, pts });
          if (!thumbDone && mt >= dur * 0.4) {
            thumbDone = true;
            const m = Math.min(1, 720 / Math.max(w, h)), tc = document.createElement("canvas");
            tc.width = Math.max(2, Math.round(w * m)); tc.height = Math.max(2, Math.round(h * m));
            tc.getContext("2d").drawImage(video, 0, 0, tc.width, tc.height);
            try { thumb = tc.toDataURL("image/jpeg", 0.82); } catch (e) { thumb = null; }
          }
          if (pcx && count % 2 === 0) draw(pcx, opts.preview, frame, pts);
          // if this phone is slower than the video, slow the video down so we still see ~30 pictures per second of it
          if (count % 8 === 0 && !stub) video.playbackRate = Math.max(0.1, Math.min(Math.min(f, 8), interval / (Math.max(ema, 1) / 1000)));
          const fr = Math.min(1, mt / dur), el = (performance.now() - t0) / 1000;
          say(fr * 0.94, count < 4 ? "Finding you in the video..." : "Reading your moves...", fr > 0.08 ? el * (1 - fr) / fr : null);
        };
        if ("requestVideoFrameCallback" in video) {
          const cb = (now, meta) => {
            if (done) return;
            try { handle(meta.mediaTime); } catch (e) { stop(e); return; }
            if (!video.ended) video.requestVideoFrameCallback(cb);
          };
          video.requestVideoFrameCallback(cb);
        } else {
          const tick = () => {
            if (done) return;
            try { if (!video.paused) handle(video.currentTime); } catch (e) { stop(e); return; }
            requestAnimationFrame(tick);
          };
          requestAnimationFrame(tick);
        }
        video.playbackRate = Math.min(f, 8);       // slow-motion files are read faster than they play, then timed as real life
        video.play().catch(() => stop(new Error("This phone wouldn't let me play the video to read it. Tap Scan again, and keep this screen open.")));
      });
      if (got.length < 5) throw new Error("I couldn't read enough of that video. Try filming it again.");

      // put what we read onto an even 30-per-second timeline, which is what the judge expects
      const n = Math.max(2, Math.floor(realDur * RATE));
      const data = { times: [], found: [], joints: {}, w: cw, h: ch, duration: realDur, slow: f, delegate, model: usedModel };
      for (const j of JOINT_NAMES) data.joints[j] = { x: [], y: [], c: [] };
      let p = 0;
      for (let i = 0; i < n; i++) {
        const t = i / RATE;
        while (p + 1 < got.length && Math.abs(got[p + 1].t - t) <= Math.abs(got[p].t - t)) p++;
        const g = Math.abs(got[p].t - t) <= 1.5 / RATE ? got[p].pts : null;
        data.times.push(t); data.found.push(g ? 1 : 0);
        const hd = g ? headPoint(g) : null;
        const put = (name, q, v) => {
          const d = data.joints[name];
          if (q) { d.x.push(q.x * cw); d.y.push(q.y * ch); d.c.push(v); } else { d.x.push(NaN); d.y.push(NaN); d.c.push(NaN); }
        };
        put("head", hd, hd ? hd.v : NaN);
        for (const name of Object.keys(LM)) { const q = g && g[LM[name]]; put(name, q || null, q ? (q.visibility == null ? 1 : q.visibility) : NaN); }
      }
      data.swapsFixed = fixLeftRight(data);
      data.foundRate = data.found.reduce((a, b) => a + b, 0) / data.found.length;
      data.simple = !!opts.simple;
      data.thumb = thumb;
      data.seconds = (performance.now() - t0) / 1000;
      data.msPerFrame = Math.round(ema);
      data.read = got.length;
      if (lm) lm.close();
      return data;
    } finally {
      URL.revokeObjectURL(url);
      video.remove();
    }
  }

  window.BDPose = { _t: { unmap, cropGeom, S, nextRect, quality }, scanVideo, warmup, MAX_SECONDS, RATE, JOINT_NAMES };
})();
