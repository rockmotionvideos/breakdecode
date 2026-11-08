// FILE NAME: rtm.js
// The "Pro" body finder: RTMPose, the same kind of model the desktop app uses, running on the phone itself
// (ONNX Runtime Web). It looks at one dancer at a time, zoomed in, and finds 26 body points including a real top-of-head.
// The model files are not part of the app code. You put them in the "models" folder (see README) and the app finds them.
(function () {
  "use strict";
  const ORT_VER = "1.18.0";
  const ORT_BASE = "https://cdn.jsdelivr.net/npm/onnxruntime-web@" + ORT_VER + "/dist/";
  const MEAN = [123.675, 116.28, 103.53], STD = [58.395, 57.12, 57.375];

  let manP = null, loadP = null, st = null;

  function manifest() {
    if (manP) return manP;
    manP = fetch("models/manifest.json", { cache: "no-cache" }).then(r => { if (!r.ok) throw new Error("The Pro models are not installed."); return r.json(); });
    manP.catch(() => { manP = null; });
    return manP;
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

  // Loads the engine once. onProgress(0..1) while the model downloads (only slow the very first time).
  function load(onProgress) {
    if (loadP) return loadP;
    loadP = (async () => {
      const m = await manifest();
      if (typeof ort === "undefined") await loadScript(ORT_BASE + "ort.all.min.js");
      ort.env.wasm.wasmPaths = ORT_BASE;
      ort.env.wasm.simd = true;
      ort.env.wasm.numThreads = (self.crossOriginIsolated ? Math.min(4, navigator.hardwareConcurrency || 2) : 1);
      const bytes = await fetchModel(m, onProgress);
      const IW = m.inputW || 192, IH = m.inputH || 256, K = m.keypoints || 26;
      const tc = document.createElement("canvas"); tc.width = IW; tc.height = IH;
      const tx = tc.getContext("2d", { willReadFrequently: true });
      let sess = null, provider = "wasm";
      const tryMake = async eps => ort.InferenceSession.create(bytes, { executionProviders: eps, graphOptimizationLevel: "all" });
      const dummy = () => new ort.Tensor("float32", new Float32Array(3 * IH * IW), [1, 3, IH, IW]);
      for (const eps of [["webgpu"], ["wasm"]]) {
        try {
          const s = await tryMake(eps);
          await s.run({ [s.inputNames[0]]: dummy() });   // a test run, so a broken graphics path is caught now and not in the middle of a scan
          sess = s; provider = eps[0]; break;
        } catch (e) { sess = null; }
      }
      if (!sess) throw new Error("The Pro engine could not start on this phone.");
      st = { sess, IW, IH, K, tc, tx, provider, name: m.name || "rtmpose", inName: sess.inputNames[0], ox: sess.outputNames[0], oy: sess.outputNames[1] };
      return st;
    })();
    loadP.catch(() => { loadP = null; });
    return loadP;
  }

  // Turn the crop into the numbers the model wants. box = {x0,y0,x1,y1} in pixels of `src`.
  function prepare(src, box) {
    const { IW, IH, tx } = st;
    const cxm = (box.x0 + box.x1) / 2, cym = (box.y0 + box.y1) / 2;
    let w = (box.x1 - box.x0) * 1.25, h = (box.y1 - box.y0) * 1.25;
    const asp = IW / IH; if (w > h * asp) h = w / asp; else w = h * asp;
    tx.setTransform(1, 0, 0, 1, 0, 0); tx.clearRect(0, 0, IW, IH);
    const s = IW / w;
    tx.imageSmoothingEnabled = true; tx.imageSmoothingQuality = "high";
    tx.setTransform(s, 0, 0, s, -(cxm - w / 2) * s, -(cym - h / 2) * s);
    tx.drawImage(src, 0, 0);
    tx.setTransform(1, 0, 0, 1, 0, 0);
    const d = tx.getImageData(0, 0, IW, IH).data, n = IW * IH, t = new Float32Array(3 * n);
    for (let i = 0, p = 0; i < n; i++, p += 4) {
      t[i] = (d[p] - MEAN[0]) / STD[0]; t[n + i] = (d[p + 1] - MEAN[1]) / STD[1]; t[2 * n + i] = (d[p + 2] - MEAN[2]) / STD[2];
    }
    return { t, cxm, cym, w, h };
  }

  // Find the body points in the box. Returns [{x, y, s}] (pixels of `src`, score 0..1) for the model's points, in order.
  async function estimate(src, box) {
    const { sess, IW, IH, K } = st, p = prepare(src, box);
    const out = await sess.run({ [st.inName]: new ort.Tensor("float32", p.t, [1, 3, IH, IW]) });
    const X = out[st.ox].data, Y = out[st.oy].data, WB = X.length / K, HB = Y.length / K, pts = [];
    for (let k = 0; k < K; k++) {
      let ix = 0, mx = -1e9, iy = 0, my = -1e9;
      for (let i = 0, o = k * WB; i < WB; i++) { const v = X[o + i]; if (v > mx) { mx = v; ix = i; } }
      for (let i = 0, o = k * HB; i < HB; i++) { const v = Y[o + i]; if (v > my) { my = v; iy = i; } }
      const lx = ix / (WB / IW), ly = iy / (HB / IH);       // back to the model's own picture (the model works at 2x detail)
      pts.push({ x: lx / IW * p.w + p.cxm - p.w / 2, y: ly / IH * p.h + p.cym - p.h / 2, s: Math.max(0, Math.min(1, Math.min(mx, my))) });
    }
    return pts;
  }

  window.BDRtm = { probe, load, estimate, info: () => st, _prepare: (s, b) => { return prepare(s, b); }, _setState: s => { st = s; } };
})();
