// FILE NAME: app.js
// BreakDecode, the whole app in the phone's browser: screens, saved scans, scanning, results, sharing, settings.
// No server. Everything is saved on this phone.
(function () {
  "use strict";
  const CSS = window.BD_CSS, J = window.BDJudge, POSE = window.BDPose;
  const app = document.getElementById("app");
  const routeStyle = document.getElementById("route-css");
  const E = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));

  // ---------------------------------------------------------------- words
  const MOVES = [
    { key: "flare", name: "Flare", ready: true, blurb: "Hips, legs, kick and rounds, checked with a coach's eye.", tag: "AVAILABLE" },
    { key: "windmill", name: "Windmill", ready: false, blurb: "Not ready yet. I don't have a judge for this move, so I won't pretend to.", tag: "COMING SOON" },
    { key: "airflare", name: "Airflare", ready: false, blurb: "Not ready yet. I don't have a judge for this move, so I won't pretend to.", tag: "COMING SOON" },
  ];
  const MAX_SECONDS = POSE.MAX_SECONDS;
  const RULES = [
    ["&#128161;", "Good lighting", "Film in a well-lit space, with the lights on or near a window. Wear fitted clothing that contrasts with the wall behind you. Dark clothing in a dark room is difficult for me to detect."],
    ["&#128101;", "Clear background", "Make sure no one is behind you, otherwise the analysis may follow the wrong person. A plain wall gives the best results."],
    ["&#129489;", "Full body in frame", "Stand 2 to 3 metres from the camera, facing it or at a 45 degree angle, so your hands and feet stay in frame throughout the move."],
    ["&#128247;", "Stable camera", "Place your phone on a stable surface instead of holding it. Turn off filters and digital zoom. Slow motion (120 fps or higher) is recommended if your phone supports it."],
    ["&#9201;", "40 seconds maximum", "Videos must be 40 seconds or shorter. Include a few flares rather than a full session."],
  ];
  const AREA_NAME = { onward: "Keep going", start: "The start", legs: "Legs open", kick: "Kick to the sides", drop: "Knees between flares", lift: "Hip height", flip: "Getting around" };
  const AREA_ORDER = ["onward", "start", "legs", "kick", "drop", "lift", "flip"];
  const REMIND = {
    onward: "Don't stop after one round. Keep going into the next one, even if it's messy.",
    start: "Open your legs before the first round, so you have momentum going in.",
    legs: "Keep your legs wide through the whole flare. Don't let them close in.",
    kick: "Kick your legs out to the sides, up toward your head.",
    drop: "Keep your knees up between flares. Don't let them touch down.",
    lift: "Get your hips high. Push the floor away.",
    flip: "Get your body all the way around, with your head under your hips.",
    none: "Keep repeating your flare today. Clean reps make it solid.",
  };
  const REMIND_FIRST = "Film in good light, with your whole body in frame, then scan your first move.";

  // ---------------------------------------------------------------- small helpers
  const ico = (p, w) => { w = w || 24; return "<svg width='" + w + "' height='" + w + "' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='1.8' stroke-linecap='round' stroke-linejoin='round'>" + p + "</svg>"; };
  const P_SCAN = "<path d='M15 8l6-3v14l-6-3'/><rect x='2' y='6' width='13' height='12' rx='2'/>";
  const P_RES = "<path d='M4 20V10M10 20V4M16 20v-8M22 20H2'/>";
  const P_SET = "<circle cx='12' cy='12' r='3'/><path d='M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1'/>";
  const P_BULB = "<path d='M9 18h6M10 21h4M12 3a6 6 0 0 0-4 10.5c.8.8 1 1.5 1 2.5h6c0-1 .2-1.7 1-2.5A6 6 0 0 0 12 3z'/>";
  const P_GEAR = "<circle cx='12' cy='12' r='3.2'/><path d='M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z'/>";
  const sentence = t => { t = (t || "").trim(); return t ? t.charAt(0).toUpperCase() + t.slice(1).toLowerCase() : ""; };
  const dayKey = ms => { const d = new Date(ms); return d.getFullYear() + "-" + d.getMonth() + "-" + d.getDate(); };
  const whenText = ms => { const d = new Date(ms); return d.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" }) + ", " + d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" }); };
  const moveName = key => (MOVES.find(m => m.key === key) || MOVES[0]).name;
  const lsGet = (k, d) => { try { const v = localStorage.getItem(k); return v == null ? d : v; } catch (e) { return d; } };
  const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch (e) { } };

  // ---------------------------------------------------------------- colors (the palette is remembered on the phone)
  const T = {
    mint: { n: "Mint", mint: "#5cffc4", cyan: "#4fd8ff", violet: "#9d7bff", coral: "#ff6b6b", bg: "#070b0d", arg: "92,255,196", vrg: "157,123,255", bgr: "7,11,13" },
    sunset: { n: "Sunset", mint: "#ffb454", cyan: "#ff7a45", violet: "#ff3d81", coral: "#ff5c5c", bg: "#0e0809", arg: "255,180,84", vrg: "255,61,129", bgr: "14,8,9" },
    acid: { n: "Acid", mint: "#d4ff3a", cyan: "#a8ff5c", violet: "#ffffff", coral: "#ff5c8a", bg: "#0a0b08", arg: "212,255,58", vrg: "255,255,255", bgr: "10,11,8" },
    ice: { n: "Ice", mint: "#8ad7ff", cyan: "#4d7cff", violet: "#c8a2ff", coral: "#ff7b9c", bg: "#060912", arg: "138,215,255", vrg: "200,162,255", bgr: "6,9,18" },
    fire: { n: "Fire", mint: "#ffc233", cyan: "#ff8a2b", violet: "#ff3b3b", coral: "#ff3b3b", bg: "#0b0707", arg: "255,194,51", vrg: "255,59,59", bgr: "11,7,7" },
  };
  function setTheme(k, save) {
    const t = T[k] || T.mint, r = document.documentElement.style;
    r.setProperty("--mint", t.mint); r.setProperty("--cyan", t.cyan); r.setProperty("--violet", t.violet); r.setProperty("--coral", t.coral);
    r.setProperty("--bg", t.bg); r.setProperty("--arg", t.arg); r.setProperty("--vrg", t.vrg); r.setProperty("--bgr", t.bgr);
    const m = document.querySelector("meta[name=theme-color]"); if (m) m.setAttribute("content", t.bg);
    if (save) lsSet("bd_theme", k);
  }

  // ---------------------------------------------------------------- saved scans (on this phone only)
  const Store = (() => {
    let dbp = null, broken = false, mem = [];
    function open() {
      if (dbp) return dbp;
      dbp = new Promise((res, rej) => {
        try {
          const r = indexedDB.open("breakdecode", 1);
          r.onupgradeneeded = () => r.result.createObjectStore("scans", { keyPath: "id" });
          r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
        } catch (e) { rej(e); }
      });
      return dbp;
    }
    function run(mode, fn) {
      return open().then(db => new Promise((res, rej) => {
        const t = db.transaction("scans", mode), r = fn(t.objectStore("scans"));
        t.oncomplete = () => res(r && r.result); t.onerror = () => rej(t.error); t.onabort = () => rej(t.error);
      }));
    }
    return {
      async all() { if (broken) return mem.slice(); try { return (await run("readonly", s => s.getAll())) || []; } catch (e) { broken = true; return mem.slice(); } },
      async get(id) { return (await this.all()).find(x => x.id === id) || null; },
      async put(rec) { if (!broken) { try { await run("readwrite", s => s.put(rec)); return; } catch (e) { broken = true; } } mem.push(rec); },
      async del(id) { if (broken) { mem = mem.filter(x => x.id !== id); return; } try { await run("readwrite", s => s.delete(id)); } catch (e) { broken = true; mem = mem.filter(x => x.id !== id); } },
      async clear() { const n = (await this.all()).length; if (broken) mem = []; else { try { await run("readwrite", s => s.clear()); } catch (e) { broken = true; mem = []; } } return n; },
    };
  })();
  const sortOld = scans => scans.slice().sort((a, b) => a.t - b.t);
  const withInfo = scans => scans.filter(x => x.findings);

  // ---------------------------------------------------------------- progress logic (what got fixed, what keeps showing up)
  function progressRows(scans) {
    const hist = {};
    for (const k of AREA_ORDER) hist[k] = scans.map(sc => (sc.findings.areas || {})[k] || "na");
    const rows = [];
    for (const k of AREA_ORDER) {
      const states = hist[k].filter(x => x !== "na");
      if (!states.includes("issue")) continue;
      const last2 = states.slice(-2);
      let verdict, tone;
      if (states[states.length - 1] === "ok" && states.length >= 2 && last2[0] === "ok" && last2[1] === "ok") { verdict = "Fixed"; tone = "good"; }
      else if (states[states.length - 1] === "ok") { verdict = "Looking better. Scan again to confirm."; tone = "mid"; }
      else {
        let run = 0;
        for (let i = states.length - 1; i >= 0 && states[i] === "issue"; i--) run++;
        verdict = run >= 2 ? "Still showing up" : "Needs work"; tone = "bad";
      }
      rows.push({ key: k, verdict, tone });
    }
    return rows;
  }
  function shareCards(scans) {
    const cards = [];
    const ok = scans.filter(x => (x.findings.track || "ok") === "ok" && x.findings.rounds);
    if (ok.length) {
      const first = ok[0].findings.rounds, last = ok[ok.length - 1].findings.rounds;
      if (ok.length > 1 && last > first) {
        const word = n => n + " round" + (n === 1 ? "" : "s");
        cards.push({ kind: "progress", chip: "LEVEL UP", label: "MY FLARE PROGRESS", big: "+" + (last - first), title: last - first > 1 ? "ROUNDS" : "ROUND", lines: ["From " + word(first) + " to " + word(last), "Keep going."], then: String(first), now: String(last) });
      }
    }
    for (const r of progressRows(scans)) {
      if (r.tone === "good") cards.push({ kind: "fixed", chip: "FIXED", label: "FIXED", big: "✓", title: AREA_NAME[r.key].toUpperCase(), lines: ["Fixed. It stayed good", "in my last 2 scans."] });
    }
    const n = scans.length;
    if (n >= 3) cards.push({ kind: "milestone", chip: "MILESTONE", label: "MILESTONE", big: String(n), title: "SCANS DONE", lines: ["Showing up and", "working on my flares."] });
    if (!cards.length && n) {
      cards.push(n === 1 ? { kind: "first", chip: "DAY ONE", label: "FIRST STEP", big: "1", title: "FLARE SCANNED", lines: ["Day one of my", "flare journey."] }
        : { kind: "milestone", chip: "KEEP GOING", label: "KEEP GOING", big: String(n), title: "SCANS DONE", lines: ["Working on my flares."] });
    }
    return cards;
  }
  function reminderText(last) {
    if (!last) return REMIND_FIRST;
    if (!last.findings) return REMIND.none;
    return REMIND[last.findings.main] || REMIND.none;
  }

  // ---------------------------------------------------------------- the filming rules pop-up (first time, and from settings)
  const Gate = (() => {
    const KEY = "breaking_ai_rules_v4";
    let el, st, dots, nx, cl, i = 0, t, replay = false;
    function build() {
      el = document.createElement("div"); el.className = "gate"; el.id = "gate"; el.setAttribute("role", "dialog"); el.setAttribute("aria-modal", "true");
      el.innerHTML = "<div class='gbox'><button class='gclose' id='gclose' hidden aria-label='Close'>&times;</button><div class='mono'>BEFORE YOU START</div><div class='gdots'>" + RULES.map(() => "<i></i>").join("") + "</div>" +
        RULES.map(r => "<div class='gstep' hidden><div class='gicon'>" + r[0] + "</div><h2>" + r[1] + "</h2><p>" + r[2] + "</p></div>").join("") +
        "<button class='btn' id='gnext' disabled>Next</button></div>";
      document.body.appendChild(el);
      st = $$(".gstep", el); dots = $$(".gdots i", el); nx = $("#gnext", el); cl = $("#gclose", el);
      nx.addEventListener("click", () => { if (i < st.length - 1) { i++; show(); } else { if (!replay) lsSet(KEY, "yes"); close(); } });
      cl.addEventListener("click", close);
    }
    function show() {
      st.forEach((x, k) => { x.hidden = k !== i; x.className = "gstep"; if (k === i) { void x.offsetWidth; x.className = "gstep in"; } });
      dots.forEach((d, k) => { d.className = k <= i ? "on" : ""; });
      const last = i === st.length - 1, label = last ? (replay ? "Done" : "Start using the app") : "Next"; let s = 2;
      clearInterval(t);
      if (replay) { nx.disabled = false; nx.textContent = label; return; }
      nx.disabled = true; nx.textContent = label + " (" + s + ")";
      t = setInterval(() => { s--; if (s <= 0) { clearInterval(t); nx.disabled = false; nx.textContent = label; } else nx.textContent = label + " (" + s + ")"; }, 1000);
    }
    function close() { clearInterval(t); el.className = "gate"; document.body.style.overflow = ""; }
    function open(r) { if (!el) build(); replay = !!r; i = 0; cl.hidden = !replay; document.body.style.overflow = "hidden"; el.className = "gate on"; show(); }
    return { open, seen: () => lsGet(KEY, "") === "yes" };
  })();

  // ---------------------------------------------------------------- screens
  // each screen returns { css, html, cls?, init? }
  const BACK_MENU = "<a class='back' href='#/start'>&larr; Menu</a>";

  function home() {
    return {
      css: CSS.land, cls: " land",
      html: "<div class='orb o1'></div><div class='orb o2'></div><div class='orb o3'></div>" +
        "<div class='top'><div class='logo'><i></i>BreakDecode</div><a class='gear' href='#/settings' aria-label='Settings'>" + ico(P_GEAR, 22) + "</a></div>" +
        "<div class='mid'><h1 class='hl'>Your breaking,<br><em>decoded.</em></h1><p class='sub'>Coach-style feedback on your moves, in plain words.</p></div>" +
        "<a class='btn' href='#/start' style='margin-top:0'>Start your journey</a>" +
        (isStandalone() ? "" : "<button type='button' class='btn ghost' id='addhome' style='margin-top:10px'>Add to Home Screen</button>"),
      init() { const b = $("#addhome"); if (b) b.onclick = addToHome; },
    };
  }

  async function hub() {
    const scans = sortOld(await Store.all());
    const last = scans[scans.length - 1] || null;
    let tl, tx, shot;
    if (last) {
      tl = "Today, for your " + moveName(last.move); tx = reminderText(last);
      const inf = last.findings;
      const tag = inf ? (inf.main ? "<span class='tg bad'>" + AREA_NAME[inf.main] + "</span>" : "<span class='tg ok'>Looked good</span>") : "";
      const img = last.thumb ? "<img class='pi' src='" + last.thumb + "' alt=''>" : "";
      shot = "<a class='gl shot' href='#/result/" + last.id + "'>" + img + "<div class='sl'>Last scan</div><h2>" + moveName(last.move) + "</h2>" + tag + "</a>";
    } else {
      tl = "To get started"; tx = REMIND_FIRST;
      shot = "<a class='gl shot' href='#/moves'><div class='sl'>No scans yet</div><h2>Film your first move</h2></a>";
    }
    const tip = "<div class='gl tipc wide' id='tip'><div class='tl'>" + ico(P_BULB, 18) + E(tl) + "</div><p>" + E(tx) + "</p><button type='button' class='x' id='tipx' aria-label='Hide'>&times;</button></div>";
    const week = "<div class='gl wkc wide'><div class='wt'><b id='wk'></b><span>Your week</span></div><div class='week' id='week'></div></div>";
    const mini = "<a class='gl mini' href='#/results'>" + ico(P_RES, 28) + "<b>Results</b></a><a class='gl mini' href='#/settings'>" + ico(P_SET, 28) + "<b>Settings</b></a>";
    return {
      css: CSS.res + CSS.hub2 + CSS.orb,
      html: "<div class='orb o1'></div><div class='orb o2'></div><div class='orb o3'></div>" +
        "<div class='hub2'><div class='topbar'><a class='lg' href='#/'><i></i>BreakDecode</a><span class='dt' id='today'></span></div><h1 id='greet'>Hello.</h1><div class='dash'>" + tip + week + shot + mini + "</div></div>" +
        "<a class='scanbtn' href='#/moves'>" + ico(P_SCAN, 24) + "Scan a move</a>",
      init() {
        const h = new Date().getHours();
        $("#greet").textContent = h < 5 ? "Late night." : h < 12 ? "Good morning." : h < 18 ? "Good afternoon." : "Good evening.";
        $("#today").textContent = new Date().toLocaleDateString("en", { weekday: "short", day: "numeric", month: "short" });
        const days = scans.map(s => dayKey(s.t)), now = new Date(), dow = (now.getDay() + 6) % 7;
        const mon = new Date(now.getFullYear(), now.getMonth(), now.getDate() - dow), L = ["M", "T", "W", "T", "F", "S", "S"], box = $("#week"); let n = 0;
        for (let i = 0; i < 7; i++) {
          const d = new Date(mon.getFullYear(), mon.getMonth(), mon.getDate() + i), k = d.getFullYear() + "-" + d.getMonth() + "-" + d.getDate(), on = days.indexOf(k) >= 0, td = i === dow;
          if (on) n++;
          const w = document.createElement(on ? "a" : "div"); w.className = "dy" + (td ? " t" : "");
          if (on) { w.href = "#/results?day=" + k; w.setAttribute("aria-label", "Scans from this day"); }
          w.innerHTML = "<div class='dc" + (on ? " on" : "") + (td ? " today" : "") + "'>" + (on ? "✓" : "") + "</div>" + L[i];
          box.appendChild(w);
        }
        $("#wk").textContent = n ? n + (n === 1 ? " day" : " days") + " trained" : "Nothing yet";
        const d = new Date(), key = "bd_rem_" + d.getFullYear() + "-" + (d.getMonth() + 1) + "-" + d.getDate(), el = $("#tip");
        let hidden = false; try { hidden = !!sessionStorage.getItem(key); } catch (e) { }
        if (hidden && location.hash.indexOf("reminder") < 0) { el.style.display = "none"; return; }
        $("#tipx").onclick = () => { el.style.display = "none"; try { sessionStorage.setItem(key, "1"); } catch (e) { } };
      },
    };
  }

  function moves() {
    const cards = MOVES.map(m => m.ready
      ? "<a class='card ready' href='#/move/" + m.key + "'><span class='pill'>" + m.tag + "</span><h2>" + m.name + "</h2><p>" + m.blurb + "</p></a>"
      : "<div class='card soon'><span class='pill'>" + m.tag + "</span><h2>" + m.name + "</h2><p>" + m.blurb + "</p></div>").join("");
    return {
      css: "",
      html: BACK_MENU + "<div class='mono'>CHOOSE A MOVE</div><h1>Scan your <em>move.</em></h1>" +
        "<p class='lead'>Film yourself, and get coach-style feedback with the fixes in plain words. Pick a move to start.</p>" + cards +
        "<p class='small'>Your video never leaves your phone. This is an early version, so treat it as a second pair of eyes, not the final word.</p>",
    };
  }

  let pending = null;       // the video chosen on the "upload" screen, waiting to be scanned
  let lastProblem = null;   // why the last scan failed

  function moveScreen(key) {
    const m = MOVES.find(x => x.key === key);
    if (!m) return { redirect: "#/moves" };
    if (!m.ready) {
      return { css: "", html: "<a class='back' href='#/moves'>&larr; Moves</a><div class='mono'>COMING SOON</div><h1>" + m.name + " <em>soon.</em></h1><p class='lead'>I don't have a judge for this move yet, so I won't fake one. Flare is ready now.</p><a class='btn' href='#/move/flare'>Scan a flare instead</a>" };
    }
    return {
      css: "",
      html: "<a class='back' href='#/moves'>&larr; Moves</a><div class='mono'>FLARE SCAN</div><h1>Upload your <em>flare.</em></h1>" +
        "<p class='lead'>A clip of " + MAX_SECONDS + " seconds or shorter with one or more flares.</p>" +
        "<form id='f'><input id='file' type='file' name='video' accept='video/*' required>" +
        "<div class='seg' id='slow'><button type='button' data-f='1' class='on'>Normal speed</button><button type='button' data-f='4'>Slow-mo 120 fps</button><button type='button' data-f='8'>Slow-mo 240 fps</button></div>" +
        "<p class='small' id='slowhelp'>Filmed in slow motion? Pick it so I read the timing right. iPhone slow-mo is usually 240 fps.</p>" +
        "<button class='btn' id='go' type='submit'>Scan my flare</button></form>" +
        "<p class='small' id='msg'></p><button type='button' class='btn ghost' id='again'>View filming guidelines</button>",
      init() {
        if (!Gate.seen()) Gate.open(false);
        const f = $("#f"), msg = $("#msg"), go = $("#go"), file = $("#file");
        $("#again").addEventListener("click", () => Gate.open(true));
        let slowF = 1, vdur = 0;
        const check = () => {
          if (!vdur) return;
          const real = vdur / slowF;
          if (real > MAX_SECONDS + 0.5) {
            msg.textContent = "That video is about " + Math.round(real) + " seconds" + (slowF > 1 ? " in real time" : "") + ". The limit is " + MAX_SECONDS + " seconds." +
              (slowF === 1 ? " If it's a slow-motion video, choose the slow-motion option above, otherwise please trim it." : " Please trim it and choose it again.");
            msg.className = "small err"; go.disabled = true;
          } else { msg.textContent = ""; msg.className = "small"; go.disabled = false; }
        };
        $$("#slow button").forEach(b => { b.onclick = () => { slowF = +b.dataset.f; $$("#slow button").forEach(x => { x.className = x === b ? "on" : ""; }); check(); }; });
        file.addEventListener("change", () => {
          const fl = file.files[0]; if (!fl) return; const v = document.createElement("video"); v.preload = "metadata";
          v.onloadedmetadata = () => { URL.revokeObjectURL(v.src); vdur = v.duration; check(); };
          v.src = URL.createObjectURL(fl);
        });
        f.addEventListener("submit", e => {
          e.preventDefault(); const fl = file.files[0];
          if (!fl) { msg.textContent = "Please choose a video first."; msg.className = "small err"; return; }
          if (go.disabled) return;
          pending = { file: fl, move: m.key, slow: slowF }; go.disabled = true; location.hash = "#/scan";
        });
      },
    };
  }

  function scanScreen() {
    const job = pending; pending = null;
    if (!job) return { redirect: "#/start" };
    let cancelled = false;
    return {
      css: ".pv{display:block;width:100%;max-height:46vh;object-fit:contain;border-radius:18px;margin-top:16px;background:#0a0f12;border:1px solid rgba(255,255,255,.08)}",
      html: "<div class='mono'>SCANNING</div><h1>Reading your <em>flare.</em></h1>" +
        "<div class='card' style='text-align:center'><div id='pct' style=\"font:700 64px 'Space Grotesk',sans-serif;background:linear-gradient(90deg,var(--mint),var(--cyan),var(--violet));-webkit-background-clip:text;background-clip:text;color:transparent\">0%</div>" +
        "<div class='track'><i id='fill'></i></div><p id='look' style='margin:14px 0 0;font-weight:600;color:var(--mint)'></p><p id='step' class='small' style='margin-top:8px'>Starting...</p><p class='small' id='eta'></p><canvas class='pv' id='pv' width='320' height='180'></canvas></div>" +
        "<p class='small'>Keep this screen open. Your video stays on your phone.</p><button type='button' class='btn ghost' id='cancel'>Cancel</button>",
      async init() {
        $("#cancel").onclick = () => { cancelled = true; location.hash = "#/start"; };
        const LOOKS = ["Scanning your legs...", "Finding your hands...", "Watching your hips...", "Checking your balance..."];
        let li = 0; const lk = $("#look"); lk.textContent = LOOKS[0];
        const lt = setInterval(() => { const el = document.getElementById("look"); if (!el) { clearInterval(lt); return; } li = (li + 1) % LOOKS.length; el.textContent = LOOKS[li]; }, 5200);
        const setP = (p, step, eta) => {
          if (cancelled) return; p = Math.min(100, p);
          $("#pct").textContent = Math.floor(p) + "%"; $("#fill").style.width = p + "%"; if (step) $("#step").textContent = step;
          const fmt = s => { s = Math.max(0, Math.round(s)); return s >= 60 ? Math.floor(s / 60) + " min " + (s % 60) + " s" : s + " s"; };
          $("#eta").textContent = eta != null ? "About " + fmt(eta) + " left" : (p < 5 ? "Working out how long this will take..." : "");
        };
        try {
          const o0 = { model: lsGet("bd_model2", "full"), slow: job.slow || 1, preview: $("#pv"), cancelled: () => cancelled, onProgress: (f, text, eta) => setP(f * 100, text, eta) };
          o0.engine = lsGet("bd_engine", "auto");
          let data;
          try { data = await POSE.scanVideo(job.file, o0); }
          catch (e) {   // if the Pro engine fails part-way, carry on with the standard one
            if (cancelled || (e && e.message === "cancelled") || o0.engine === "mp") throw e;
            data = await POSE.scanVideo(job.file, Object.assign({}, o0, { engine: "mp" }));
          }
          if (cancelled) return;
          setP(95, "Judging your flare...", null);
          await new Promise(r => setTimeout(r, 30));
          let res = J.analyze(data), dbg = "Read " + data.read + " pictures, body found in " + Math.round(data.foundRate * 100) + "% (" + data.model + ", " + data.delegate + ").";
          if (!res.ok || data.foundRate < 0.5) {   // not happy with that: look again the plain, proven way and keep the better answer
            setP(4, "Taking a closer look...", null);
            const d2 = await POSE.scanVideo(job.file, Object.assign({}, o0, { simple: true }));
            if (cancelled) return;
            const r2 = J.analyze(d2);
            dbg += " Second look: " + Math.round(d2.foundRate * 100) + "% (" + d2.model + ", " + d2.delegate + ").";
            if (r2.ok || (!res.ok && d2.foundRate > data.foundRate)) { data = d2; res = r2; }
          }
          if (!res.ok) { lastProblem = { kind: "noflare", debug: dbg }; location.hash = "#/problem"; return; }
          const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
          delete res.filmTips;
          await Store.put({ id, t: Date.now(), move: job.move, video: job.file, raw: data, thumb: data.thumb, findings: res.findings, res, stats: { slow: job.slow || 1, seconds: data.seconds, msPerFrame: data.msPerFrame, read: data.read, delegate: data.delegate, model: data.model, w: data.w, h: data.h, duration: data.duration } });
          try {   // keep the video of the last 2 scans only, so the phone's storage doesn't fill up
            const old = sortOld(await Store.all()).filter(x => x.raw && x.id !== id);
            for (const o of old) await Store.put(Object.assign({}, o, { raw: null, video: null }));
          } catch (e) { }
          setP(100, "Done", null);
          setTimeout(() => { location.hash = "#/result/" + id; }, 400);
        } catch (e) {
          if (cancelled || (e && e.message === "cancelled")) return;
          console.error(e);
          lastProblem = { kind: "error", msg: (e && e.message) || "Something went wrong." };
          location.hash = "#/problem";
        }
      },
    };
  }

  function problemScreen() {
    const p = lastProblem || { kind: "error", msg: "Something went wrong." };
    const why = p.kind === "noflare"
      ? "I couldn't find a flare in that clip. Make sure the clip has at least one flare, with your whole body in the frame, then try again."
      : p.msg;
    const tips = RULES.map(r => "<li><b>" + r[1] + ".</b> " + r[2] + "</li>").join("");
    return {
      css: "",
      html: "<div class='mono' style='color:var(--coral)'>COULDN'T SCAN IT</div><h1>Let's <em>film it again.</em></h1><p class='lead'>" + E(why) + "</p>" +
        "<div class='card'><ul class='tips'>" + tips + "</ul></div>" + (p.debug ? "<p class='small mono' style='opacity:.6'>" + E(p.debug) + "</p>" : "") + "<a class='btn' href='#/move/flare'>Try another video</a><a class='btn ghost' href='#/'>Home</a>",
    };
  }

  async function resultScreen(id) {
    const sc = await Store.get(id);
    if (!sc) return { redirect: "#/results" };
    let videoURL = null; try { if (sc.video) videoURL = URL.createObjectURL(sc.video); } catch (e) { }
    const doc = window.BDResult.build(Object.assign({ filmTips: J.FILM_TIPS, videoURL, vw: sc.stats && sc.stats.w, vh: sc.stats && sc.stats.h, slow: (sc.stats && sc.stats.slow) || 1 }, sc.res));
    return {
      css: ".resframe{position:fixed;inset:0;width:100%;height:100%;border:0;background:#07090a;z-index:5}",
      cls: " fullframe",
      html: "<iframe class='resframe' id='rf' title='Your flare feedback'></iframe>",
      init() { $("#rf").srcdoc = doc; },
    };
  }

  async function resultsScreen(q) {
    const scans = sortOld(await Store.all()), wi = withInfo(scans), rows = wi.length ? progressRows(wi) : [];
    let top = "";
    if (wi.length) {
      const latest = wi[wi.length - 1].findings;
      top = latest.main
        ? "<div class='card focus'><span class='mono'>WORK ON THIS</span><h2>" + AREA_NAME[latest.main] + "</h2><p>" + E(sentence(latest.headline)) + ".</p></div>"
        : "<div class='card focus good'><span class='mono'>LOOKING GOOD</span><h2>Nothing to fix</h2><p>Your last scan looked clean. Repeat it to make it solid.</p></div>";
    }
    const shareBtn = wi.length && shareCards(wi).length ? "<a class='btn' href='#/share' style='margin:0 0 4px'>Share my progress</a>" : "";
    let prog = "";
    if (rows.length) {
      const lines = rows.map(r => {
        const [ic, txt] = r.tone === "good" ? ["<span class='ck ok'>&#10003;</span>", "Fixed"] : r.tone === "mid" ? ["<span class='ck mid'>&#10003;</span>", "Looking better"] : ["<span class='ck bad'>!</span>", "Still needs work"];
        return "<div class='crow'>" + ic + "<div class='cn'>" + AREA_NAME[r.key] + "</div><div class='ct " + r.tone + "'>" + txt + "</div></div>";
      }).join("");
      prog = "<h3 class='lh'>Your checklist</h3><div class='card'>" + lines + (wi.length > 1 ? "" : "<p class='small' style='margin:10px 0 0'>Scan again after practising to see what changes.</p>") + "</div>";
    }
    const day = q.day || null;
    let shown = scans.slice().reverse();
    if (day) shown = shown.filter(s => dayKey(s.t) === day);
    let lst;
    if (scans.length) {
      const cards = shown.map(sc => {
        const inf = sc.findings;
        const tag = inf ? (inf.main ? "<span class='tg bad'>" + AREA_NAME[inf.main] + "</span>" : "<span class='tg ok'>Looked good</span>") : "";
        const th = sc.thumb ? "<img class='th' src='" + sc.thumb + "' alt=''>" : "<div class='th ph'></div>";
        return "<div class='card res'>" + th + "<a href='#/result/" + sc.id + "'><h2 class='when'>" + E(whenText(sc.t)) + "</h2>" + tag + "</a><button type='button' class='del' data-j='" + sc.id + "'>Delete</button></div>";
      }).join("");
      let banner = "";
      if (day) {
        const p = day.split("-"), dd = new Date(+p[0], +p[1], +p[2]);
        banner = "<div class='card' style='padding:14px 16px'><b>" + E(dd.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "short" })) + "</b> <a href='#/results' style='float:right;color:var(--mint);font-weight:600'>Show all</a></div>";
      }
      lst = "<h3 class='lh'>Your scans</h3>" + banner + cards;
    } else {
      lst = "<div class='card'><h2>Nothing here yet</h2><p>Your scans will show up here after you film your first flare.</p></div><a class='btn' href='#/move/flare'>Scan a flare</a>";
    }
    return {
      css: CSS.hub + CSS.res,
      html: BACK_MENU + "<div class='mono'>MY RESULTS</div><h1>Your <em>progress.</em></h1>" + top + shareBtn + prog + "<div id='list'>" + lst + "</div>" +
        "<p class='small'>Saved on this phone. Delete any scan you don't want to keep.</p>",
      init() {
        $$(".del").forEach(b => {
          let armed = false, t;
          b.onclick = async () => {
            if (!armed) { armed = true; b.textContent = "Sure?"; b.className = "del arm"; clearTimeout(t); t = setTimeout(() => { armed = false; b.textContent = "Delete"; b.className = "del"; }, 3000); return; }
            await Store.del(b.dataset.j); render();
          };
        });
      },
    };
  }

  async function shareScreen() {
    const wi = withInfo(sortOld(await Store.all())), cards = shareCards(wi);
    const inner = cards.length
      ? "<p class='lead'>Pick a card and post it to your story.</p><div id='cards'></div><p class='small'>On your phone, tap Share to story and choose Instagram. On a computer, the picture downloads.</p>"
      : "<div class='card'><h2>Nothing to share yet</h2><p>Scan a flare and your first card shows up here. Scan again after practising and you can share your progress.</p></div><a class='btn' href='#/move/flare'>Scan a flare</a>";
    return {
      css: CSS.share,
      html: "<a class='back' href='#/results'>&larr; My results</a><div class='mono'>SHARE</div><h1>Share your <em>progress.</em></h1>" + inner,
      init() { if (cards.length) window.BDShare.render(cards, $("#cards")); },
    };
  }

  let installEvt = null;
  window.addEventListener("beforeinstallprompt", e => { e.preventDefault(); installEvt = e; });
  const isStandalone = () => (window.matchMedia && window.matchMedia("(display-mode: standalone)").matches) || navigator.standalone;
  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
  // "Add to Home Screen": one tap on Android, a short how-to on iPhone (Apple doesn't allow a one-tap button)
  function addToHome() {
    if (installEvt) { installEvt.prompt(); return; }
    const steps = isIOS
      ? ["Open this page in <b>Safari</b> if it isn't already.", "Tap the <b>Share</b> button (the square with an arrow).", "Scroll down and tap <b>Add to Home Screen</b>, then <b>Add</b>."]
      : ["Tap the <b>menu</b> in your browser (the three dots).", "Tap <b>Install app</b> or <b>Add to Home screen</b>.", "Tap <b>Install</b>."];
    const el = document.createElement("div"); el.className = "gate on";
    el.innerHTML = "<div class='gbox'><div class='mono'>ADD TO HOME SCREEN</div><h2 style='margin:14px 0 12px'>Put it on your phone</h2>" +
      "<ol style='margin:0 0 4px 20px;color:var(--dim);line-height:1.55;font-size:15.5px'>" + steps.map(x => "<li style='margin-bottom:10px'>" + x + "</li>").join("") + "</ol>" +
      "<p class='small' style='margin-top:6px'>Then BreakDecode opens like a normal app, full screen.</p><button type='button' class='btn' id='hdone'>Got it</button></div>";
    document.body.appendChild(el);
    $("#hdone", el).onclick = () => el.remove();
  }

  function exercisesScreen(focus) {
    const X = window.BD_EXERCISES || {}, NAMES = window.BD_EXERCISE_NAMES || {};
    const card = ex => {
      let media = "";
      if (ex.video) media = /^https?:/.test(ex.video) ? "<a class='btn' style='margin:12px 0 0' target='_blank' rel='noopener' href='" + E(ex.video) + "'>Watch the video</a>" : "<video controls playsinline preload='metadata' style='width:100%;border-radius:14px;margin-top:12px' src='" + E(ex.video) + "'></video>";
      return "<div class='card'><h2>" + E(ex.title || "") + "</h2><p>" + E(ex.text || "") + "</p>" + media + "</div>";
    };
    const sec = key => {
      const list = X[key] || [];
      return "<h3 class='lh'>" + E(NAMES[key] || key) + "</h3>" + (list.length ? list.map(card).join("") : "<div class='card'><p class='small' style='margin:0'>Exercises for this are coming soon.</p></div>");
    };
    const keys = Object.keys(NAMES), one = focus && NAMES[focus];
    return {
      html: "<a class='back' href='javascript:history.back()'>&larr; Back</a><div class='mono'>EXERCISES</div><h1>" + (one ? E(NAMES[focus]) + " <em>fix.</em>" : "Train <em>it.</em>") + "</h1>" +
        (one ? sec(focus) + "<a class='btn ghost' href='#/exercises'>All exercises</a>" : keys.map(sec).join(""))
    };
  }

  function settingsScreen() {
    const installCard = isStandalone() ? "" :
      "<div class='card'><h2>Put it on your phone</h2><p>Add BreakDecode to your home screen so it opens like a normal app.</p><button type='button' class='btn ghost' id='inst'>Add to Home Screen</button></div>";
    const model = lsGet("bd_model2", "full");
    return {
      css: CSS.settings + ".seg{display:flex;gap:10px;margin-top:12px}.seg button{flex:1;padding:13px 10px;border-radius:16px;border:1px solid var(--line);background:var(--card);color:var(--txt);font:600 15px 'Space Grotesk',sans-serif;cursor:pointer}.seg button.on{background:linear-gradient(90deg,var(--mint),var(--cyan));color:#04110d;border-color:transparent}",
      html: BACK_MENU + "<div class='mono'>SETTINGS</div><h1>Settings.</h1>" +
        "<div class='card'><h2>Colors</h2><p>Pick the look you like. It's remembered on this phone.</p><div class='sw' id='sw'></div></div>" +
        "<div class='card'><h2>Scan engine</h2><p id='eng'>Checking...</p><div class='seg' id='engseg'><button type='button' data-e='auto'>Auto</button><button type='button' data-e='small'>Faster</button><button type='button' data-e='mp'>Standard</button></div></div><div class='card'><h2>Help me fix it</h2><p>If a replay looks wrong, save the last scan's raw data and send it to Ralph. It has no video, only body-point numbers.</p><button type='button' class='btn ghost' id='dump'>Save last scan data</button><p class='small' id='dumpmsg'></p></div><div class='card'><h2>Scan quality</h2><p>Sharper is the default. Best is the most detailed but a big download and slower. Fast is quickest but can get legs wrong.</p><div class='seg' id='seg'><button type='button' data-m='lite'>Fast</button><button type='button' data-m='full'>Sharper</button><button type='button' data-m='heavy'>Best</button></div></div>" +
        "<div class='card'><h2>Filming guidelines</h2><p>The five rules for a clean scan.</p><button type='button' class='btn ghost' id='rules'>View guidelines</button></div>" +
        installCard +
        "<div class='card'><h2>Your videos</h2><p>Your videos never leave your phone, and they aren't saved. Only your results and a small picture are, on this phone. You can delete them any time.</p>" +
        "<button type='button' class='btn ghost danger' id='del'>Delete all my results</button><p class='small' id='delmsg'></p></div>" +
        "<div class='card'><h2>About</h2><p>BreakDecode, early version. Flare is the only move I can judge so far. Windmill and Airflare are coming later.</p><p class='small' id='spd'></p></div>",
      init() {
        const box = $("#sw"); let cur = lsGet("bd_theme", "mint");
        Object.keys(T).forEach(k => {
          const w = document.createElement("div"), b = document.createElement("button"), l = document.createElement("span");
          b.type = "button"; b.setAttribute("aria-label", T[k].n + " colors"); b.style.background = "linear-gradient(135deg," + T[k].mint + "," + T[k].violet + ")"; if (k === cur) b.className = "on"; l.textContent = T[k].n;
          b.onclick = () => { setTheme(k, true); $$("button", box).forEach(x => { x.className = ""; }); b.className = "on"; };
          w.appendChild(b); w.appendChild(l); box.appendChild(w);
        });
        const eg = lsGet("bd_engine", "auto");
        $$("#engseg button").forEach(b => { if (b.dataset.e === eg) b.className = "on"; b.onclick = () => { lsSet("bd_engine", b.dataset.e); $$("#engseg button").forEach(x => { x.className = x.dataset.e === b.dataset.e ? "on" : ""; }); }; });
        (window.BDRtm ? BDRtm.probe() : Promise.resolve(null)).then(m => {
          $("#eng").textContent = m ? "Pro engine installed. Auto uses the most accurate model your phone can run quickly. Faster always uses the smaller one. The first scan downloads the model once." : "Pro engine is not installed yet, so scans use the Standard engine.";
        });
        $("#dump").onclick = async () => {
          const m = $("#dumpmsg"), all = sortOld(await Store.all()).filter(x => x.raw), sc = all[all.length - 1];
          if (!sc) { m.textContent = "No scan data yet. Scan a video first."; return; }
          const r = sc.raw, rd = (v, k) => Array.from(v, q => Number.isFinite(q) ? Math.round(q * k) / k : null), J2 = {}, P2 = {};
          for (const n of Object.keys(r.joints)) { J2[n] = { x: rd(r.joints[n].x, 10), y: rd(r.joints[n].y, 10), c: rd(r.joints[n].c, 100) }; if (r.pre) P2[n] = { x: rd(r.pre[n].x, 10), y: rd(r.pre[n].y, 10) }; }
          const out = { app: "breakdecode", sw: "v10", when: new Date(sc.t).toISOString(), w: r.w, h: r.h, duration: r.duration, slow: r.slow, model: r.model, delegate: r.delegate, simple: r.simple, foundRate: r.foundRate, swapsFixed: r.swapsFixed, seconds: r.seconds, read: r.read, times: rd(r.times, 1000), found: r.found, joints: J2, before_fix: P2, findings: sc.findings };
          const f = new File([JSON.stringify(out)], "breakdecode-scan-data.json", { type: "application/json" });
          try { if (navigator.canShare && navigator.canShare({ files: [f] })) { await navigator.share({ files: [f], title: "BreakDecode scan data" }); m.textContent = "Shared."; return; } } catch (e) { if (e && e.name === "AbortError") return; }
          const u = URL.createObjectURL(f), l = document.createElement("a"); l.href = u; l.download = f.name; l.click(); m.textContent = "Saved to your downloads as breakdecode-scan-data.json";
        };
        $$("#seg button").forEach(b => { if (b.dataset.m === model) b.className = "on"; b.onclick = () => { lsSet("bd_model2", b.dataset.m); $$("#seg button").forEach(x => { x.className = x.dataset.m === b.dataset.m ? "on" : ""; }); }; });
        Store.all().then(all => {
          const l = sortOld(all).filter(x => x.stats && x.stats.seconds).pop(), el = $("#spd");
          if (l && el) el.textContent = "Last scan: " + Math.round(l.stats.seconds) + " s to read a " + Math.round(l.stats.duration || 0) + " s video (" + (l.stats.delegate === "GPU" ? "graphics chip" : l.stats.delegate === "CPU" ? "processor only" : l.stats.delegate) + ", " + (l.stats.msPerFrame || "?") + " ms per picture).";
        });
        $("#rules").onclick = () => Gate.open(true);
        const inst = $("#inst"); if (inst) inst.onclick = addToHome;
        const del = $("#del"), msg = $("#delmsg"); let armed = false, t;
        del.onclick = async () => {
          if (!armed) { armed = true; del.textContent = "Tap again to confirm"; clearTimeout(t); t = setTimeout(() => { armed = false; del.textContent = "Delete all my results"; }, 4000); return; }
          armed = false; del.disabled = true; const n = await Store.clear();
          msg.textContent = n === 0 ? "Nothing to delete." : "Deleted " + n + " scan" + (n === 1 ? "" : "s") + "."; del.textContent = "Delete all my results"; del.disabled = false;
        };
      },
    };
  }

  // ---------------------------------------------------------------- router
  function parseHash() {
    const h = location.hash.replace(/^#/, "") || "/", i = h.indexOf("?");
    const path = i < 0 ? h : h.slice(0, i), q = {};
    if (i >= 0) new URLSearchParams(h.slice(i + 1)).forEach((v, k) => { q[k] = v; });
    return { path, q };
  }
  let renderId = 0;
  async function render() {
    const my = ++renderId, { path, q } = parseHash();
    let s;
    const seg = path.split("/").filter(Boolean);
    try {
      if (!seg.length) s = home();
      else if (seg[0] === "start") s = await hub();
      else if (seg[0] === "moves") s = moves();
      else if (seg[0] === "move") s = moveScreen(seg[1]);
      else if (seg[0] === "scan") s = scanScreen();
      else if (seg[0] === "problem") s = problemScreen();
      else if (seg[0] === "result") s = await resultScreen(seg[1]);
      else if (seg[0] === "results") s = await resultsScreen(q);
      else if (seg[0] === "share") s = await shareScreen();
      else if (seg[0] === "settings") s = settingsScreen();
      else if (seg[0] === "exercises") s = exercisesScreen(seg[1]);
      else s = { redirect: "#/" };
    } catch (e) {
      console.error(e);
      s = { css: "", html: "<div class='mono' style='color:var(--coral)'>OOPS</div><h1>Something <em>broke.</em></h1><p class='lead'>" + E(e && e.message) + "</p><a class='btn' href='#/start'>Back to the menu</a>" };
    }
    if (my !== renderId) return;
    if (s.redirect) { location.hash = s.redirect; return; }
    routeStyle.textContent = s.css || "";
    app.className = "wrap" + (s.cls || "");
    document.body.classList.toggle("noscroll", (s.cls || "").indexOf("fullframe") >= 0);
    app.innerHTML = s.html;
    window.scrollTo(0, 0);
    if (s.init) s.init();
  }

  // ---------------------------------------------------------------- start
  document.getElementById("base-css").textContent = CSS.base + ".seg{display:flex;gap:8px;margin:14px 0 6px}.seg button{flex:1;padding:12px 6px;border-radius:15px;border:1px solid var(--line);background:var(--card);color:var(--txt);font:600 13.5px 'Space Grotesk',sans-serif;cursor:pointer}.seg button.on{background:linear-gradient(90deg,var(--mint),var(--cyan));color:#04110d;border-color:transparent}[hidden]{display:none!important}.noscroll{overflow:hidden}.noscroll .wrap{padding:0;max-width:none}.sc canvas{display:block}";
  setTheme(lsGet("bd_theme", "mint"), false);
  window.addEventListener("hashchange", render);
  window.BD = { Store, render, setTheme, progressRows, shareCards, Gate };   // handy for testing
  render();
  setTimeout(() => { try { POSE.warmup(lsGet("bd_model2", "full")); } catch (e) { } }, 2500);
  if ("serviceWorker" in navigator && /^https?:$/.test(location.protocol)) {
    navigator.serviceWorker.register("sw.js").catch(() => { });
  }
})();
