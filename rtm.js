// FILE NAME: rtm.js
// The "Pro" body finder: RTMPose, the same kind of model the desktop app uses, running on the phone itself
// (ONNX Runtime Web). It looks at one dancer at a time, zoomed in, and finds 26 body points including a real top-of-head.
// The model files are not part of the app code. You put them in the "models" folder (see README) and the app finds them.
(function () {
  "use strict";
  const ORT_VER = "1.18.0";
  const ORT_BASE = "https://cdn.jsdelivr.net/npm/onnxruntime-web@" + ORT_VER + "/dist/";
  const MEAN = [123.675, 116.28, 103.53], STD = [58.395, 57.12, 57.375];

  let manP = {}, loadP = {}, st = null;

  function manifest(file) {
    file = file || "manifest.json";
    if (manP[file]) return manP[file];
    manP[file] = fetch("models/" + file, { cache: "no-cache" }).then(r => { if (!r.ok) throw new Error("The Pro models are not installed."); return r.json(); });
    manP[file].catch(() => { delete manP[file]; });
    return manP[file];
  }
  // is the Pro engine installed? resolves to the manifest, or null
  async function probe() { try { return await manifest(); } catch (e) { return null; } }

  function loadScript(src) {
    return new Promise((ok, no) => {
      const s = document.createElement("script"); s.src = src; s.onload = ok; s.onerror = () => no(new Error("Could not load the Pro engine."));
      document.head.appendChild(s);
    });
  }

  async function fetchModel(m, progress) {
    const parts = m.parts || [m.file], bufs = []; let got = 0;
    for (let i = 0; i < parts.length; i++) {
      const r = await fetch("models/" + parts[i], { cache: "force-cache" });
      if (!r.ok) throw new Error("A Pro model file is missing: " + parts[i]);
      const b = new Uint8Array(await r.arrayBuffer()); bufs.push(b); got += b.length;
      if (progress) progress((i + 1) / parts.length);
    }
    const all = new Uint8Array(got); let o = 0; for (const b of bufs) { all.set(b, o); o += b.length; }
    return all;
  }

  // Build a working session from one model (tries the graphics chip first, then the processor).
  async function makeState(m, progress) {
    if (typeof ort === "undefined") await loadScript(ORT_BASE + "ort.all.min.js");
    ort.env.wasm.wasmPaths = ORT_BASE;
    ort.env.wasm.simd = true;
    ort.env.wasm.numThreads = (self.crossOriginIsolated ? Math.min(4, navigator.hardwareConcurrency || 2) : 1);
    const bytes = await fetchModel(m, progress);
    const IW = m.inputW || 192, IH = m.inputH || 256, K = m.keypoints || 26;
    const tc = document.createElement("canvas"); tc.width = IW; tc.height = IH;
    const tx = tc.getContext("2d", { willReadFrequently: true });
    const dummy = () => new ort.Tensor("float32", new Float32Array(3 * IH * IW), [1, 3, IH, IW]);
    for (const eps of [["webgpu"], ["wasm"]]) {
      try {
        const s = await ort.InferenceSession.create(bytes, { executionProviders: eps, graphOptimizationLevel: "all" });
        await s.run({ [s.inputNames[0]]: dummy() });   // a test run, so a broken graphics path is caught now and not in the middle of a scan
        return { sess: s, IW, IH, K, tc, tx, provider: eps[0], name: m.name || "rtmpose", inName: s.inputNames[0], ox: s.outputNames[0], oy: s.outputNames[1], dummy };
      } catch (e) { /* try the next way */ }
    }
    throw new Error("The Pro engine could not start on this phone.");
  }
  // how many milliseconds one look takes on this phone
  async function bench(s) {
    const t = [];
    for (let i = 0; i < 4; i++) { const a = performance.now(); await s.sess.run({ [s.inName]: s.dummy() }); t.push(performance.now() - a); }
    t.sort((a, b) => a - b); return t[1];
  }
  function release(s) { try { if (s && s.sess && s.sess.release) s.sess.release(); } catch (e) { } }
  const lsg = k => { try { return localStorage.getItem(k); } catch (e) { return null; } };
  const lss = (k, v) => { try { localStorage.setItem(k, v); } catch (e) { } };

  // Loads the engine once. pref: "auto" (the best model this phone can run quickly) or "small" (always the small one).
  // The big model (if installed) is only downloaded on a phone that is fast enough, and the choice is remembered.
  function load(onProgress, pref) {
    pref = pref || "auto";
    if (loadP[pref]) return loadP[pref];
    loadP[pref] = (async () => {
      const mS = await manifest();
      let mL = null;
      const net = navigator.connection, metered = !!(net && (net.saveData || net.type === "cellular" || /(^|-)(2g|3g)$/.test(net.effectiveType || "")));
      if (pref === "auto" && !metered) { try { mL = await manifest("manifest-l.json"); } catch (e) { mL = null; } }   // no big download on mobile data
      const choice = lsg("bd_rtm_choice");
      if (mL && choice === "l") {
        try { st = await makeState(mL, onProgress); return st; } catch (e) { lss("bd_rtm_choice", "m"); }
      }
      const small = await makeState(mS, onProgress);
      if (mL && choice !== "m") {
        let pick = "m";
        try {
          const ms = await bench(small);
          if (ms <= 70) {                       // a fast phone: try the big model, and keep it only if it is quick enough too
            const big = await makeState(mL, p => onProgress && onProgress(p));
            const mb = await bench(big);
            if (mb <= 170) { pick = "l"; release(small); st = big; }
            else release(big);
          }
        } catch (e) { pick = "m"; }
        lss("bd_rtm_choice", pick);
        if (pick === "l") return st;
      }
      st = small; return st;
    })();
    loadP[pref].catch(() => { delete loadP[pref]; });
    return loadP[pref];
  }

  // Turn the crop into the numbers the model wants. box = {x0,y0,x1,y1} in pixels of `src`.
  // mode: "n" = as is, "flip" = mirrored, "rot" = turned upside down (a second opinion for hard frames)
  function prepare(src, box, mode) {
    const { IW, IH, tx } = st;
    const cxm = (box.x0 + box.x1) / 2, cym = (box.y0 + box.y1) / 2;
    let w = (box.x1 - box.x0) * 1.25, h = (box.y1 - box.y0) * 1.25;
    const asp = IW / IH; if (w > h * asp) h = w / asp; else w = h * asp;
    tx.setTransform(1, 0, 0, 1, 0, 0); tx.clearRect(0, 0, IW, IH);
    const s = IW / w;
    tx.imageSmoothingEnabled = true; tx.imageSmoothingQuality = "high";
    const x0 = cxm - w / 2, y0 = cym - h / 2;
    if (mode === "rot") tx.setTransform(-s, 0, 0, -s, IW + x0 * s, IH + y0 * s);
    else if (mode === "flip") tx.setTransform(-s, 0, 0, s, IW + x0 * s, -y0 * s);
    else tx.setTransform(s, 0, 0, s, -x0 * s, -y0 * s);
    tx.drawImage(src, 0, 0);
    tx.setTransform(1, 0, 0, 1, 0, 0);
    const d = tx.getImageData(0, 0, IW, IH).data, n = IW * IH, t = new Float32Array(3 * n);
    for (let i = 0, p = 0; i < n; i++, p += 4) {
      t[i] = (d[p] - MEAN[0]) / STD[0]; t[n + i] = (d[p + 1] - MEAN[1]) / STD[1]; t[2 * n + i] = (d[p + 2] - MEAN[2]) / STD[2];
    }
    return { t, cxm, cym, w, h, mode };
  }

  // Find the body points in the box. Returns [{x, y, s}] (pixels of `src`, score 0..1) for the model's points, in order.
  const FLIP = [0, 2, 1, 4, 3, 6, 5, 8, 7, 10, 9, 12, 11, 14, 13, 16, 15, 17, 18, 19, 21, 20, 23, 22, 25, 24];   // left <-> right for the model's 26 points
  async function estimate(src, box, mode) {
    mode = mode || "n";
    const { sess, IW, IH, K } = st, p = prepare(src, box, mode);
    const out = await sess.run({ [st.inName]: new ort.Tensor("float32", p.t, [1, 3, IH, IW]) });
    const X = out[st.ox].data, Y = out[st.oy].data, WB = X.length / K, HB = Y.length / K, pts = [];
    for (let k = 0; k < K; k++) {
      let ix = 0, mx = -1e9, iy = 0, my = -1e9;
      for (let i = 0, o = k * WB; i < WB; i++) { const v = X[o + i]; if (v > mx) { mx = v; ix = i; } }
      for (let i = 0, o = k * HB; i < HB; i++) { const v = Y[o + i]; if (v > my) { my = v; iy = i; } }
      const lx = ix / (WB / IW), ly = iy / (HB / IH);       // back to the model's own picture (the model works at 2x detail)
      const ux = mode === "n" ? lx : IW - lx, uy = mode === "rot" ? IH - ly : ly;
      pts.push({ x: ux / IW * p.w + p.cxm - p.w / 2, y: uy / IH * p.h + p.cym - p.h / 2, s: Math.max(0, Math.min(1, Math.min(mx, my))) });
    }
    if (mode === "flip" && K === 26) return FLIP.map(i => pts[i]);   // the mirror image has left and right swapped, so swap them back
    return pts;
  }

  window.BDRtm = { probe, load, estimate, info: () => st, _prepare: (s, b) => { return prepare(s, b); }, _setState: s => { st = s; } };
})();
