// Inlines a 21-point hand skeleton into every <svg class="hand">.
(function () {
  const P = [[150,330],[118,292],[92,252],[74,218],[58,190],[128,214],[118,164],[112,126],[108,94],[154,208],[152,150],[150,108],[148,72],[180,212],[186,158],[190,118],[192,86],[206,224],[220,182],[228,150],[234,124]];
  const E = [[0,1],[1,2],[2,3],[3,4],[0,5],[5,6],[6,7],[7,8],[5,9],[9,10],[10,11],[11,12],[9,13],[13,14],[14,15],[15,16],[13,17],[17,18],[18,19],[19,20],[0,17]];
  document.querySelectorAll("svg.hand").forEach(svg => {
    svg.setAttribute("viewBox", "0 0 300 360");
    svg.innerHTML = E.map(([a,b]) => `<line x1="${P[a][0]}" y1="${P[a][1]}" x2="${P[b][0]}" y2="${P[b][1]}"/>`).join("") +
      P.map(([x,y]) => `<circle cx="${x}" cy="${y}" r="5"/>`).join("");
  });
})();
// Review mode: open a page with #frame-3 to show only frame 3 at full 1280x800.
(function () {
  const m = (location.search + location.hash).match(/frame[-=](\d)/);
  if (!m) return;
  const n = Number(m[1]);
  document.querySelectorAll(".frame-wrap").forEach((f, i) => { if (i !== n - 1) f.remove(); });
  document.querySelector(".sheet-title")?.remove();
  const style = document.createElement("style");
  style.textContent = "body{padding:0}.frame-wrap{margin:0}.frames{display:block;max-width:none}.viewport{width:1280px;height:800px;border-radius:0;aspect-ratio:auto}.screen{--s:1}figcaption{display:none}";
  document.head.appendChild(style);
})();
