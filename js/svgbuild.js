/* Build pad with background + draggable house pieces + Snap assist
   Updates:
   - Body is a WIDER rectangle
   - Door is smaller; Windows are smaller AND there are TWO windows
   - Door is ALWAYS ABOVE the body (draw order + drag order)
*/
(() => {
  const svg = document.getElementById('houseSvg');
  const pad = document.getElementById('buildPad');
  const resetBtn = document.getElementById('resetPieces');
  const snapToggle = document.getElementById('snapToggle');

  const STORAGE_KEY = 'arcbuild-house-pieces-v3';
  const SNAP_ON_KEY = 'arcbuild-snap-on';

  // --- Helpers
  function el(tag = 'g', attrs = {}) {
    const e = document.createElementNS('http://www.w3.org/2000/svg', tag);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    return e;
  }
  function clientToSvg(svgEl, clientX, clientY) {
    const pt = svgEl.createSVGPoint();
    pt.x = clientX; pt.y = clientY;
    const res = pt.matrixTransform(svgEl.getScreenCTM().inverse());
    return { x: res.x, y: res.y };
  }

  // --- Specs (adjusted sizes)
  const spec = {
    roof:    { w: 240, h: 100 }, // slightly wider roof
    body:    { w: 200, h: 140 }, // wider rectangle (was 140x140)
    window:  { w:  42, h:  38 }, // smaller window
    door:    { w:  42, h:  80 }, // smaller door
  };

  const pieces = [
    { id: 'roof',     ...spec.roof,   el: null, x: 0, y: 0 },
    { id: 'body',     ...spec.body,   el: null, x: 0, y: 0 },
    { id: 'window1',  ...spec.window, el: null, x: 0, y: 0 },
    { id: 'window2',  ...spec.window, el: null, x: 0, y: 0 },
    { id: 'door',     ...spec.door,   el: null, x: 0, y: 0 },
  ];

  // --- Background scene (sky/grass/clouds)
  function buildBackground(w, h) {
    svg.innerHTML = '';

    const defs = el('defs');
    const lg = el('linearGradient', { id: 'skyGrad', x1: '0', y1: '0', x2: '0', y2: '1' });
    lg.appendChild(el('stop', { offset: '0%',  'stop-color': '#eaf6ff' }));
    lg.appendChild(el('stop', { offset: '70%', 'stop-color': '#ffffff' }));
    defs.appendChild(lg);
    svg.appendChild(defs);

    const bg = el('g', { class: 'bg' });
    bg.appendChild(el('rect', { x: 0, y: 0, width: w, height: h, fill: 'url(#skyGrad)' }));

    const grassH = h * 0.28;
    bg.appendChild(el('rect', { x: 0, y: h - grassH, width: w, height: grassH, fill: '#e8f7e8' }));

    function cloud(cx, cy, s) {
      const g = el('g', { opacity: '0.65' });
      g.appendChild(el('circle', { cx: cx - 30*s, cy,            r: 18*s, fill: '#ffffff' }));
      g.appendChild(el('circle', { cx: cx,          cy: cy - 8*s,  r: 22*s, fill: '#ffffff' }));
      g.appendChild(el('circle', { cx: cx + 28*s,  cy,            r: 16*s, fill: '#ffffff' }));
      return g;
    }
    const cloudY = h * 0.22;
    bg.appendChild(cloud(w*0.18, cloudY, 1.0));
    bg.appendChild(cloud(w*0.46, cloudY*0.9, 1.2));
    bg.appendChild(cloud(w*0.78, cloudY*1.05, 0.9));
    svg.appendChild(bg);

    svg.appendChild(el('g', { class: 'pieces' }));
  }

  // --- Build/update pieces into the "pieces" group (ensure DOOR is last)
  function mountPieces() {
    const group = svg.querySelector('g.pieces');

    // ROOF
    const roof = el('g', { class: 'piece', 'data-id': 'roof' });
    roof.appendChild(el('polygon', {
      class: 'fill-roof',
      points: `0,${spec.roof.h} ${spec.roof.w/2},0 ${spec.roof.w},${spec.roof.h}`
    }));

    // BODY (wider rectangle)
    const body = el('g', { class: 'piece', 'data-id': 'body' });
    body.appendChild(el('rect', {
      class: 'fill-house',
      x: 0, y: 0, width: spec.body.w, height: spec.body.h, rx: 4, ry: 4
    }));

    // WINDOW factory
    const makeWindow = (id) => {
      const g = el('g', { class: 'piece', 'data-id': id });
      g.appendChild(el('rect', {
        class: 'fill-window',
        x: 0, y: 0, width: spec.window.w, height: spec.window.h, rx: 3, ry: 3
      }));
      g.appendChild(el('line', {
        class: 'window-line',
        x1: spec.window.w/2, y1: 4, x2: spec.window.w/2, y2: spec.window.h - 4
      }));
      g.appendChild(el('line', {
        class: 'window-line',
        x1: 4, y1: spec.window.h/2, x2: spec.window.w - 4, y2: spec.window.h/2
      }));
      return g;
    };

    const window1 = makeWindow('window1');
    const window2 = makeWindow('window2');

    // DOOR (smaller) — MUST be last to render above body
    const door = el('g', { class: 'piece', 'data-id': 'door' });
    door.appendChild(el('rect', {
      class: 'fill-door',
      x: 0, y: 0, width: spec.door.w, height: spec.door.h, rx: 4, ry: 4
    }));
    door.appendChild(el('circle', {
      class: 'door-knob',
      cx: spec.door.w - 9, cy: spec.door.h / 2, r: 3.2
    }));

    const els = [roof, body, window1, window2, door];
    els.forEach((node, i) => {
      pieces[i].el = node;
      group.appendChild(node);
    });
  }

  // --- ViewBox sizing
  function sizeSvgToPad() {
    const r = pad.getBoundingClientRect();
    const w = r.width, h = r.height;
    svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
    svg.setAttribute('width', w);
    svg.setAttribute('height', h);
    return { w, h };
  }

  // --- Positioning
  const MARGIN = 12;
  function setTransform(p) { p.el.setAttribute('transform', `translate(${p.x}, ${p.y})`); }
  function clampPiece(p, w, h) {
    p.x = Math.max(MARGIN, Math.min(p.x, w - p.w - MARGIN));
    p.y = Math.max(MARGIN, Math.min(p.y, h - p.h - MARGIN));
  }

  // Spaced-out 3×2 grid spawn (five items; leaves one empty cell)
  function placeDefaultsSpaced(w, h) {
    const cols = 3, rows = 2;
    const colW = (w - MARGIN * (cols + 1)) / cols;
    const rowH = (h - MARGIN * (rows + 1)) / rows;

    const centerAt = (c, r, pw, ph) => ({
      x: MARGIN + c * (colW + MARGIN) + (colW - pw) / 2,
      y: MARGIN + r * (rowH + MARGIN) + (rowH - ph) / 2
    });

    const byId = id => pieces.find(p => p.id === id);

    // Top row
    Object.assign(byId('roof'),     centerAt(0, 0, spec.roof.w,   spec.roof.h));
    Object.assign(byId('window1'),  centerAt(1, 0, spec.window.w, spec.window.h));
    Object.assign(byId('window2'),  centerAt(2, 0, spec.window.w, spec.window.h));
    // Bottom row
    Object.assign(byId('door'),     centerAt(0, 1, spec.door.w,   spec.door.h));
    Object.assign(byId('body'),     centerAt(1, 1, spec.body.w,   spec.body.h)); // bottom-center

    pieces.forEach(p => { clampPiece(p, w, h); setTransform(p); });
  }

  // --- LocalStorage
  function savePositions() {
    const data = {};
    pieces.forEach(p => data[p.id] = { x: p.x, y: p.y });
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  }
  function loadPositions() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return false;
      const data = JSON.parse(raw);
      let ok = false;
      pieces.forEach(p => {
        if (data[p.id]) { p.x = data[p.id].x; p.y = data[p.id].y; ok = true; }
      });
      return ok;
    } catch { return false; }
  }
  function clearPositions(){ localStorage.removeItem(STORAGE_KEY); }

  // --- Snap assist
  const SNAP = 16;
  function overlaps(a0, a1, b0, b1) { return a0 < b1 && a1 > b0; }
  function bodyRect() {
    const b = pieces.find(p => p.id === 'body');
    return { x: b.x, y: b.y, w: b.w, h: b.h, cx: b.x + b.w/2, cy: b.y + b.h/2, right: b.x + b.w, bottom: b.y + b.h };
  }

  function applySnapRoof(p) {
    const b = bodyRect();
    const baseY = p.y + p.h;
    const apexX = p.x + p.w/2;
    if (Math.abs(baseY - b.y) <= SNAP && overlaps(p.x, p.x + p.w, b.x, b.x + b.w)) {
      p.y = b.y - p.h;
    }
    if (Math.abs(apexX - b.cx) <= SNAP) {
      p.x = b.x + (b.w - p.w)/2;
    }
  }
  function applySnapDoor(p) {
    const b = bodyRect();
    const bottom = p.y + p.h;
    if (Math.abs(bottom - b.bottom) <= SNAP && overlaps(p.x, p.x + p.w, b.x, b.x + b.w)) {
      p.y = b.bottom - p.h;
    }
    const doorCY = p.y + p.h/2;
    if (overlaps(doorCY, doorCY, b.y, b.y + b.h)) {
      const anchors = [1/6, 1/2, 5/6].map(t => b.x + b.w * t - p.w/2);
      let best = null, bestD = Infinity;
      anchors.forEach(ax => {
        const d = Math.abs(p.x - ax);
        if (d < bestD) { bestD = d; best = ax; }
      });
      if (best !== null && bestD <= SNAP) p.x = best;
      if (p.x < b.x) p.x = b.x;
      if (p.x + p.w > b.right) p.x = b.right - p.w;
    }
  }
  function applySnapWindow(p) {
    const b = bodyRect();
    const cx = p.x + p.w/2, cy = p.y + p.h/2;
    const inside = (cx > b.x && cx < b.right && cy > b.y && cy < b.bottom);
    if (!inside) return;

    const xs = [1/6, 3/6, 5/6].map(t => b.x + b.w * t - p.w/2);
    const ys = [1/6, 3/6, 5/6].map(t => b.y + b.h * t - p.h/2);

    let best = { x: p.x, y: p.y }, bestD = Infinity;
    xs.forEach(ax => {
      ys.forEach(ay => {
        const dx = (ax + p.w/2) - cx;
        const dy = (ay + p.h/2) - cy;
        const d = Math.hypot(dx, dy);
        if (d < bestD) { bestD = d; best = { x: ax, y: ay }; }
      });
    });
    if (bestD <= SNAP * 1.2) { p.x = best.x; p.y = best.y; }
  }
  function applySnap(piece) {
    if (!snapToggle.checked) return;
    if (piece.id === 'roof') applySnapRoof(piece);
    else if (piece.id === 'door') applySnapDoor(piece);
    else if (piece.id.startsWith('window')) applySnapWindow(piece);
  }

  // Keep door always on top (above body and others)
  function ensureDoorOnTop() {
    const group = svg.querySelector('g.pieces');
    const door = pieces.find(p => p.id === 'door');
    if (door?.el && door.el.parentNode === group) {
      group.appendChild(door.el);
    }
  }

  // --- Init
  let padW = 0, padH = 0;
  function init() {
    const { w, h } = sizeSvgToPad();
    padW = w; padH = h;
    buildBackground(padW, padH);
    mountPieces();

    if (!loadPositions()) {
      placeDefaultsSpaced(padW, padH);
    } else {
      pieces.forEach(p => { clampPiece(p, padW, padH); setTransform(p); });
    }
    ensureDoorOnTop();

    const savedSnap = localStorage.getItem(SNAP_ON_KEY);
    if (savedSnap !== null) snapToggle.checked = savedSnap === '1';
  }
  init();

  // --- Dragging (door stays top)
  let dragging = null; // { piece, dx, dy }
  svg.addEventListener('pointerdown', (e) => {
    const target = e.target.closest('.piece');
    if (!target) return;
    const id = target.getAttribute('data-id');
    const piece = pieces.find(p => p.id === id);
    if (!piece) return;

    const group = svg.querySelector('g.pieces');
    const doorEl = pieces.find(p => p.id === 'door').el;

    // Bring to front but keep DOOR last unless we're dragging the door itself
    if (id === 'door') {
      group.appendChild(doorEl); // already last, but safe
    } else {
      group.insertBefore(piece.el, doorEl); // just beneath door
    }

    const pt = clientToSvg(svg, e.clientX, e.clientY);
    dragging = { piece, dx: pt.x - piece.x, dy: pt.y - piece.y };
    target.classList.add('dragging');
    target.setPointerCapture?.(e.pointerId);
  });

  svg.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    const pt = clientToSvg(svg, e.clientX, e.clientY);
    const p = dragging.piece;
    p.x = pt.x - dragging.dx;
    p.y = pt.y - dragging.dy;

    clampPiece(p, padW, padH);
    applySnap(p);
    clampPiece(p, padW, padH);
    setTransform(p);

    ensureDoorOnTop(); // maintain door above even during body/window drags
  });

  function endDrag(e) {
    if (!dragging) return;
    const elNode = dragging.piece.el;
    elNode.classList.remove('dragging');
    try { elNode.releasePointerCapture?.(e.pointerId); } catch {}
    savePositions();
    ensureDoorOnTop();
    dragging = null;
  }
  svg.addEventListener('pointerup', endDrag);
  svg.addEventListener('pointerleave', endDrag);

  // --- Controls
  resetBtn.addEventListener('click', () => {
    clearPositions();
    placeDefaultsSpaced(padW, padH);
    ensureDoorOnTop();
  });
  snapToggle.addEventListener('change', () => {
    localStorage.setItem(SNAP_ON_KEY, snapToggle.checked ? '1' : '0');
  });

  // --- Resize handling
  const ro = new ResizeObserver(entries => {
    const { width, height } = entries[0].contentRect;
    padW = width; padH = height;

    sizeSvgToPad();
    buildBackground(padW, padH);
    mountPieces();               // reattach piece elements
    pieces.forEach(p => { clampPiece(p, padW, padH); setTransform(p); });
    ensureDoorOnTop();
  });
  ro.observe(pad);
})();
