// FILE NAME: share.js
// Draws the progress cards (1080x1920, made for Instagram stories) and shares or saves them.
(function () {
  "use strict";
  function css(v) { return getComputedStyle(document.documentElement).getPropertyValue(v).trim(); }
  function hex2rgb(h) { h = h.replace("#", ""); if (h.length === 3) h = h.split("").map(c => c + c).join(""); const n = parseInt(h, 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }

  function draw(c, card) {
    const W = 1080, H = 1920, x = c.getContext("2d"); c.width = W; c.height = H;
    const mint = css("--mint") || "#5cffc4", cyan = css("--cyan") || "#4fd8ff", vio = css("--violet") || "#9d7bff";
    const F = "'Space Grotesk',system-ui,sans-serif", M = "'Space Mono',monospace";
    const rgba = (h, a) => { const r = hex2rgb(h); return "rgba(" + r[0] + "," + r[1] + "," + r[2] + "," + a + ")"; };
    function ls(v) { try { x.letterSpacing = v; } catch (e) { } }
    function rr(px, py, w, h, r) { if (x.roundRect) x.roundRect(px, py, w, h, r); else x.rect(px, py, w, h); }
    x.fillStyle = "#07090c"; x.fillRect(0, 0, W, H);
    function blob(cx, cy, r, col, a) { const g = x.createRadialGradient(cx, cy, 0, cx, cy, r); g.addColorStop(0, rgba(col, a)); g.addColorStop(1, rgba(col, 0)); x.fillStyle = g; x.fillRect(0, 0, W, H); }
    blob(120, 300, 900, mint, .55); blob(1000, 760, 820, vio, .6); blob(260, 1500, 820, cyan, .4); blob(1000, 1800, 640, mint, .3);
    const n = document.createElement("canvas"); n.width = n.height = 220; const nx = n.getContext("2d"), id = nx.createImageData(220, 220);
    for (let i = 0; i < id.data.length; i += 4) { const v = Math.random() * 255; id.data[i] = id.data[i + 1] = id.data[i + 2] = v; id.data[i + 3] = 22; }
    nx.putImageData(id, 0, 0); x.fillStyle = x.createPattern(n, "repeat"); x.fillRect(0, 0, W, H);
    function glass(px, py, w, h, r, hot) {
      x.save(); x.shadowColor = "rgba(0,0,0,.45)"; x.shadowBlur = 50; x.shadowOffsetY = 20;
      const g = x.createLinearGradient(px, py, px + w, py + h);
      if (hot) { g.addColorStop(0, mint); g.addColorStop(1, cyan); } else { g.addColorStop(0, "rgba(255,255,255,.20)"); g.addColorStop(1, "rgba(255,255,255,.05)"); }
      x.fillStyle = g; x.beginPath(); rr(px, py, w, h, r); x.fill(); x.restore();
      x.strokeStyle = hot ? "rgba(255,255,255,.5)" : "rgba(255,255,255,.22)"; x.lineWidth = 2.5; x.beginPath(); rr(px, py, w, h, r); x.stroke();
    }
    function chip(txt, px, py, hot, rot) {
      x.save(); x.translate(px, py); if (rot) x.rotate(rot); x.font = "700 34px " + M; ls("3px");
      const w = x.measureText(txt).width + 64, h = 68; glass(0, 0, w, h, 34, hot); x.fillStyle = hot ? "#05110d" : "#fff"; x.textAlign = "left"; x.textBaseline = "middle"; x.fillText(txt, 32, h / 2 + 2); x.restore(); ls("0px"); return w;
    }
    x.textBaseline = "alphabetic";
    x.save(); x.font = "700 34px " + F; ls("1px"); const lw = x.measureText("BreakDecode").width + 110; glass(70, 90, lw, 84, 42, false);
    x.fillStyle = mint; x.beginPath(); x.arc(120, 132, 14, 0, 7); x.shadowColor = mint; x.shadowBlur = 24; x.fill(); x.shadowBlur = 0;
    x.fillStyle = "#fff"; x.textAlign = "left"; x.textBaseline = "middle"; x.fillText("BreakDecode", 150, 134); x.restore(); ls("0px");
    const d = new Date(); const ds = d.toLocaleDateString("en", { day: "numeric", month: "short" }).toUpperCase();
    x.save(); x.font = "700 30px " + M; ls("3px"); const dw = x.measureText(ds).width + 56; glass(W - 70 - dw, 90, dw, 84, 42, false); x.fillStyle = "rgba(255,255,255,.85)"; x.textAlign = "center"; x.textBaseline = "middle"; x.fillText(ds, W - 70 - dw / 2, 134); x.restore(); ls("0px");
    x.textBaseline = "alphabetic"; x.textAlign = "center";
    const oy = card.kind === "progress" ? 0 : 90; const big = card.big, hs = big.length > 3 ? 300 : (big.length > 2 ? 380 : 470);
    x.save(); x.font = "700 " + hs + "px " + F; ls(big.length > 1 ? "-14px" : "0px");
    const tg = x.createLinearGradient(260, 380, 820, 900); tg.addColorStop(0, "#ffffff"); tg.addColorStop(.45, mint); tg.addColorStop(1, cyan);
    x.shadowColor = rgba(mint, .55); x.shadowBlur = 90; x.fillStyle = tg; x.fillText(big, 540, 820 + oy); x.shadowBlur = 0; x.fillText(big, 540, 820 + oy); x.restore(); ls("0px");
    chip(card.chip || card.label, 90, 330 + oy, true, -.07);
    x.fillStyle = "#fff"; x.font = "700 " + (card.title.length > 9 ? 100 : 150) + "px " + F; ls("-3px"); x.fillText(card.title, 540, 990 + oy); ls("0px");
    x.fillStyle = "rgba(255,255,255,.7)"; x.font = "500 46px " + F; (card.lines || []).forEach((t, i) => x.fillText(t, 540, 1090 + oy + i * 62));
    function rings(px, py, count, col) { const m = Math.min(count, 10); for (let i = 0; i < m; i++) { const cx = px + i * 46, cy = py; x.strokeStyle = col; x.lineWidth = 7; x.beginPath(); x.arc(cx, cy, 15, 0, 7); x.stroke(); } }
    if (card.kind === "progress") {
      const ty = 1260, th = 330;
      glass(70, ty, 440, th, 56, false); glass(570, ty, 440, th, 56, true);
      x.textAlign = "left";
      x.fillStyle = "rgba(255,255,255,.6)"; x.font = "700 28px " + M; ls("3px"); x.fillText("FIRST SCAN", 110, ty + 70);
      x.fillStyle = "rgba(5,17,13,.65)"; x.fillText("NOW", 610, ty + 70); ls("0px");
      x.fillStyle = "#fff"; x.font = "700 150px " + F; x.fillText(card.then, 110, ty + 215);
      x.fillStyle = "#05110d"; x.fillText(card.now, 610, ty + 215);
      x.font = "700 150px " + F; const w1 = x.measureText(card.then).width, w2 = x.measureText(card.now).width; x.font = "500 34px " + F;
      x.fillStyle = "rgba(255,255,255,.6)"; x.fillText(card.then === "1" ? "round" : "rounds", 110 + w1 + 16, ty + 215);
      x.fillStyle = "rgba(5,17,13,.7)"; x.fillText(card.now === "1" ? "round" : "rounds", 610 + w2 + 16, ty + 215);
      rings(122, ty + 275, +card.then, "rgba(255,255,255,.55)"); rings(622, ty + 275, +card.now, "#05110d");
      x.fillStyle = "#05090b"; x.beginPath(); x.arc(540, ty + th / 2, 46, 0, 7); x.fill(); x.strokeStyle = "rgba(255,255,255,.3)"; x.lineWidth = 2.5; x.stroke();
      x.fillStyle = mint; x.font = "700 54px " + F; x.textAlign = "center"; x.fillText("→", 540, ty + th / 2 + 19);
    }
    if (card.kind !== "progress") {
      glass(70, 1330, 940, 250, 56, false); x.textAlign = "left"; x.fillStyle = "rgba(255,255,255,.6)"; x.font = "700 28px " + M; ls("3px");
      x.fillText(card.kind === "fixed" ? "LAST 2 SCANS" : "SCANS SO FAR", 120, 1405); ls("0px");
      const k = card.kind === "fixed" ? 2 : Math.min(+card.big || 1, 10);
      for (let i = 0; i < k; i++) {
        const cx = 140 + i * (k > 5 ? 84 : 110), cy = 1500; x.fillStyle = mint; x.beginPath(); x.arc(cx, cy, card.kind === "fixed" ? 38 : 30, 0, 7); x.shadowColor = mint; x.shadowBlur = 24; x.fill(); x.shadowBlur = 0;
        if (card.kind === "fixed") { x.strokeStyle = "#05110d"; x.lineWidth = 8; x.lineCap = "round"; x.beginPath(); x.moveTo(cx - 14, cy + 2); x.lineTo(cx - 4, cy + 13); x.lineTo(cx + 16, cy - 11); x.stroke(); }
      }
      x.textAlign = "center";
    }
    x.textAlign = "center";
    glass(70, 1700, 940, 120, 60, false);
    x.fillStyle = "rgba(255,255,255,.9)"; x.font = "600 36px " + F; ls("0.5px"); x.fillText("Scan your breaking at BreakDecode", 540, 1772); ls("0px");
  }

  function save(c, name, share) {
    c.toBlob(async b => {
      const f = new File([b], name + ".png", { type: "image/png" });
      if (share && navigator.canShare && navigator.canShare({ files: [f] })) {
        try { await navigator.share({ files: [f], title: "My progress on BreakDecode" }); return; } catch (e) { if (e && e.name === "AbortError") return; }
      }
      const a = document.createElement("a"); a.href = URL.createObjectURL(b); a.download = name + ".png"; a.click();
    }, "image/png");
  }

  async function render(cards, root) {
    try { await Promise.all([document.fonts.load("700 100px 'Space Grotesk'"), document.fonts.load("500 30px 'Space Grotesk'"), document.fonts.load("700 30px 'Space Mono'")]); } catch (e) { }
    cards.forEach((card, i) => {
      const w = document.createElement("div"); w.className = "card sc";
      const c = document.createElement("canvas"); c.className = "cv"; draw(c, card);
      const b = document.createElement("button"); b.className = "btn"; b.type = "button"; b.textContent = "Share to story"; b.onclick = () => save(c, "breakdecode-" + (i + 1), true);
      const d = document.createElement("button"); d.className = "btn ghost"; d.type = "button"; d.textContent = "Save picture"; d.onclick = () => save(c, "breakdecode-" + (i + 1), false);
      w.appendChild(c); w.appendChild(b); w.appendChild(d); root.appendChild(w);
    });
  }
  window.BDShare = { render };
})();
