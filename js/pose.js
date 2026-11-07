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

  async function makeLandmarker(vis, name) {
    const make = delegate => vis.mod.PoseLandmarker.createFromOptions(vis.fileset, {
      baseOptions: { modelAssetPath: MODEL(name), delegate },
      runningMode: "VIDEO", numPoses: 1,
    });
    try { return { lm: await make("GPU"), delegate: "GPU" }; }
    catch (e) { return { lm: await make("CPU"), delegate: "CPU" }; }
  }

  // MediaPipe has no "top of the head" point. The judge was tuned with one, so we estimate it from the nose and neck.
  function headPoint(lm) {
    const n = lm[0], l = lm[11], r = lm[12];
    if (!n || !l || !r) return null;
    const nx = (l.x + r.x) / 2, ny = (l.y + r.y) / 2;
    return { x: n.x + 0.55 * (n.x - nx), y: n.y + 0.55 * (n.y - ny), v: n.visibility == null ? 1 : n.visibility };
  }

  function seekTo(video, t) {
    return new Promise(res => {
      let done = false;
      const fin = () => { if (done) return; done = true; video.removeEventListener("seeked", fin); res(); };
      video.addEventListener("seeked", fin);
      setTimeout(fin, 3000);
      video.currentTime = t;
    });
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

  // Scan a video file. opts: { model: "lite"|"full", preview: <canvas>, onProgress(fraction, text), cancelled() }
  async function scanVideo(file, opts) {
    opts = opts || {};
    const say = (f, t) => opts.onProgress && opts.onProgress(f, t);
    const stub = window.BD_STUB || null;       // a test hook: pose numbers supplied by a test instead of the model
    let lm = null, delegate = "stub";
    if (!stub) {
      say(0.01, "Getting the model ready (first time takes a moment)...");
      const vis = await loadVision();
      const made = await makeLandmarker(vis, opts.model || "lite");
      lm = made.lm; delegate = made.delegate;
    }
    const video = document.createElement("video");
    video.muted = true; video.playsInline = true; video.preload = "auto";
    const url = URL.createObjectURL(file);
    try {
      video.src = url;
      await new Promise((ok, no) => { video.onloadedmetadata = ok; video.onerror = () => no(new Error("This phone couldn't open that video. Try an mp4 or mov.")); });
      const dur = video.duration;
      if (!isFinite(dur) || dur <= 0) throw new Error("I couldn't read how long that video is.");
      if (dur > MAX_SECONDS + 0.5) throw new Error("That video is " + Math.round(dur) + " seconds. The limit is " + MAX_SECONDS + " seconds. Please trim it and try again.");
      const w = video.videoWidth, h = video.videoHeight, sc = Math.min(1, MAX_SIDE / Math.max(w, h));
      const cw = Math.max(2, Math.round(w * sc)), ch = Math.max(2, Math.round(h * sc));
      const frame = document.createElement("canvas"); frame.width = cw; frame.height = ch;
      const fx = frame.getContext("2d", { willReadFrequently: false });
      let pcx = null;
      if (opts.preview) { opts.preview.width = cw; opts.preview.height = ch; pcx = opts.preview.getContext("2d"); }

      const n = Math.max(2, Math.floor(dur * RATE));
      const data = { times: [], found: [], joints: {}, w: cw, h: ch, duration: dur, delegate, model: opts.model || "lite" };
      for (const j of JOINT_NAMES) data.joints[j] = { x: [], y: [], c: [] };
      let thumb = null; const thumbAt = Math.floor(n * 0.4);
      const t0 = performance.now(), baseTs = 1;
      for (let i = 0; i < n; i++) {
        if (opts.cancelled && opts.cancelled()) throw new Error("cancelled");
        const t = i / RATE;
        await seekTo(video, Math.min(t, dur - 0.001));
        fx.drawImage(video, 0, 0, cw, ch);
        let pts = null;
        if (stub) pts = stub(t);
        else {
          const res = lm.detectForVideo(frame, baseTs + Math.round(t * 1000));
          pts = res && res.landmarks && res.landmarks[0] ? res.landmarks[0] : null;
        }
        data.times.push(t); data.found.push(pts ? 1 : 0);
        const hd = pts ? headPoint(pts) : null;
        const put = (name, p, v) => {
          const d = data.joints[name];
          if (p) { d.x.push(p.x * cw); d.y.push(p.y * ch); d.c.push(v); } else { d.x.push(NaN); d.y.push(NaN); d.c.push(NaN); }
        };
        put("head", hd, hd ? hd.v : NaN);
        for (const name of Object.keys(LM)) { const p = pts && pts[LM[name]]; put(name, p || null, p ? (p.visibility == null ? 1 : p.visibility) : NaN); }
        if (i === thumbAt) {
          const m = Math.min(1, 720 / Math.max(w, h)), tc = document.createElement("canvas");
          tc.width = Math.max(2, Math.round(w * m)); tc.height = Math.max(2, Math.round(h * m));
          tc.getContext("2d").drawImage(video, 0, 0, tc.width, tc.height);
          try { thumb = tc.toDataURL("image/jpeg", 0.82); } catch (e) { thumb = null; }
        }
        if (pcx && i % 2 === 0) draw(pcx, opts.preview, frame, pts);
        if (i % 3 === 0) {
          const el = (performance.now() - t0) / 1000, fr = (i + 1) / n;
          say(fr * 0.94, i < 3 ? "Finding you in the video..." : "Reading your moves...", fr > 0.08 ? el * (1 - fr) / fr : null);
          await new Promise(r => setTimeout(r, 0));
        }
      }
      data.thumb = thumb;
      data.seconds = (performance.now() - t0) / 1000;
      if (lm) lm.close();
      return data;
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  window.BDPose = { scanVideo, MAX_SECONDS, RATE, JOINT_NAMES };
})();
