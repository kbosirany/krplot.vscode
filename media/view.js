// krplot webview: displays the current item of the history with the chosen
// layout. Plots are SVG images rendered by httpgd at the requested size;
// HTML widgets are pages in iframes, kept alive to preserve their state
// (zoom, pan, selection) when browsing the history.
(function () {
  const vscode = acquireVsCodeApi();
  const $ = id => document.getElementById(id);
  const stage = $('stage');
  const img = $('plot');
  const frames = $('frames');
  const empty = $('empty');
  const layoutSel = $('layout');
  const dims = $('dims');
  const inW = $('w');
  const inH = $('h');

  let state = {
    hasSession: false, connected: false, items: [], upid: -1,
    device: { w: 720, h: 576 }
  };
  let layout = { mode: 'device', w: 16, h: 9 };
  let index = -1;
  let seq = 0;
  // HTML item key -> iframe
  const iframes = new Map();

  function selectValue() {
    if (layout.mode !== 'ratio') return layout.mode;
    if (layout.custom) return 'ratio:custom';
    const v = `ratio:${layout.w}:${layout.h}`;
    const preset = [...layoutSel.options].some(o => o.value === v);
    return preset ? v : 'ratio:custom';
  }

  function showLayout() {
    const d = state.device;
    $('device').textContent = `Device ratio (${d.w} × ${d.h})`;
    layoutSel.value = selectValue();
    const custom = ['ratio:custom', 'fixed'].includes(layoutSel.value);
    dims.hidden = !custom;
    if (custom && document.activeElement !== inW &&
        document.activeElement !== inH) {
      inW.value = layout.w;
      inH.value = layout.h;
    }
  }

  function setLayout(l) {
    layout = l;
    showLayout();
    render();
    vscode.postMessage({ type: 'layout', layout });
  }

  layoutSel.addEventListener('change', () => {
    const v = layoutSel.value;
    if (v === 'fill' || v === 'device') {
      setLayout({ ...layout, mode: v });
    } else if (v === 'fixed') {
      const fixed = layout.mode === 'fixed';
      setLayout({
        mode: 'fixed',
        w: fixed ? layout.w : 800,
        h: fixed ? layout.h : 600
      });
    } else if (v === 'ratio:custom') {
      setLayout({ mode: 'ratio', w: layout.w, h: layout.h, custom: true });
    } else {
      const [, w, h] = v.split(':').map(Number);
      setLayout({ mode: 'ratio', w, h });
    }
  });

  function onDims() {
    const w = Number(inW.value);
    const h = Number(inH.value);
    if (w > 0 && h > 0) setLayout({ ...layout, w, h });
  }
  inW.addEventListener('change', onDims);
  inH.addEventListener('change', onDims);

  // Rendered size (asked to httpgd, or of the page) and displayed size
  function box() {
    const cw = Math.max(1, stage.clientWidth);
    const ch = Math.max(1, stage.clientHeight);
    let rw = cw, rh = ch, dw = cw, dh = ch;
    if (layout.mode === 'ratio' || layout.mode === 'device') {
      const d = layout.mode === 'device' ? state.device : layout;
      const r = d.w / d.h;
      dw = rw = Math.min(cw, ch * r);
      dh = rh = dw / r;
    } else if (layout.mode === 'fixed') {
      const s = Math.min(1, cw / layout.w, ch / layout.h);
      rw = layout.w;
      rh = layout.h;
      dw = rw * s;
      dh = rh * s;
    }
    const r = Math.round;
    return {
      rw: Math.max(1, r(rw)), rh: Math.max(1, r(rh)),
      dw: Math.max(1, r(dw)), dh: Math.max(1, r(dh))
    };
  }

  function current() {
    return state.items[index];
  }

  function message(text) {
    img.hidden = true;
    frames.hidden = true;
    empty.hidden = false;
    empty.textContent = text;
    $('info').textContent = '';
  }

  // Drops the iframes of removed pages
  function syncFrames() {
    const keys = new Set(state.items.map(i => i.key));
    for (const [key, frame] of iframes) {
      if (!keys.has(key)) {
        frame.remove();
        iframes.delete(key);
      }
    }
  }

  function showFrame(it, b) {
    // Visible and sized before the page loads: widgets measure their
    // container when they render
    img.hidden = true;
    empty.hidden = true;
    frames.hidden = false;
    frames.style.width = `${b.dw}px`;
    frames.style.height = `${b.dh}px`;
    let frame = iframes.get(it.key);
    if (!frame) {
      frame = document.createElement('iframe');
      frames.appendChild(frame);
      iframes.set(it.key, frame);
    }
    for (const f of iframes.values()) f.hidden = f !== frame;
    // Fixed size: the page is laid out at W x H then scaled down
    frame.style.width = `${b.rw}px`;
    frame.style.height = `${b.rh}px`;
    frame.style.transform = `scale(${b.dw / b.rw})`;
    if (!frame.src) frame.src = it.src;
  }

  function showPlot(it, b) {
    const q = new URLSearchParams({
      id: it.id, width: b.rw, height: b.rh, renderer: 'svg',
      token: state.token, upid: state.upid
    });
    const src = `${state.base}/plot?${q}`;
    const mine = ++seq;
    // Preload to swap without flicker; drop outdated loads
    const next = new Image();
    next.onload = () => {
      if (mine !== seq) return;
      img.src = src;
      img.style.width = `${b.dw}px`;
      img.style.height = `${b.dh}px`;
      img.hidden = false;
      frames.hidden = true;
      empty.hidden = true;
    };
    next.src = src;
  }

  function render() {
    // Hidden view: wait for the next resize instead of rendering at 0 px
    if (!stage.clientWidth || !stage.clientHeight) return;
    const n = state.items.length;
    const it = current();
    const isPlot = Boolean(it && it.kind === 'plot');
    $('count').textContent = `${n ? index + 1 : 0} / ${n}`;
    $('prev').disabled = index <= 0;
    $('next').disabled = index >= n - 1;
    $('svg').disabled = !isPlot;
    $('png').disabled = !isPlot;
    $('open').disabled = !it;
    $('remove').disabled = !it;
    $('clear').disabled = !n;
    if (!it) {
      if (!state.hasSession) {
        return message(
          'Nothing to show yet. Draw a plot or print an HTML widget in R.'
        );
      }
      if (!state.connected) {
        return message('R session not reachable (closed?).');
      }
      return message('No plot.');
    }
    const b = box();
    const size = `${b.rw} × ${b.rh} px`;
    $('info').textContent = isPlot ? size : `${it.name} · ${size}`;
    if (isPlot) {
      showPlot(it, b);
    } else {
      // Cancel a pending plot load
      seq++;
      showFrame(it, b);
    }
  }

  function go(i) {
    const n = state.items.length;
    if (!n) return;
    index = Math.min(n - 1, Math.max(0, i));
    render();
  }

  $('prev').addEventListener('click', () => go(index - 1));
  $('next').addEventListener('click', () => go(index + 1));
  document.addEventListener('keydown', e => {
    if (['INPUT', 'SELECT'].includes(document.activeElement.tagName)) return;
    if (e.key === 'ArrowLeft') go(index - 1);
    if (e.key === 'ArrowRight') go(index + 1);
  });

  function save(format) {
    const b = box();
    // Fixed size: exact pixels; otherwise the PNG is twice the screen size
    const scale = format === 'png' && layout.mode !== 'fixed' ? 2 : 1;
    vscode.postMessage({
      type: 'save', format, key: current().key,
      width: b.rw, height: b.rh, scale
    });
  }
  $('svg').addEventListener('click', () => save('svg'));
  $('png').addEventListener('click', () => save('png'));
  $('open').addEventListener('click', () => {
    vscode.postMessage({ type: 'openItem', key: current().key });
  });
  $('remove').addEventListener('click', () => {
    vscode.postMessage({ type: 'remove', key: current().key });
  });
  $('clear').addEventListener('click', () => {
    vscode.postMessage({ type: 'clear' });
  });

  function rasterize(m) {
    const blob = new Blob([m.svg], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const pic = new Image();
    pic.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = m.width * m.scale;
      canvas.height = m.height * m.scale;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = 'white';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(pic, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      vscode.postMessage({
        type: 'savePng', dataUrl: canvas.toDataURL('image/png')
      });
    };
    pic.src = url;
  }

  window.addEventListener('message', e => {
    const m = e.data;
    if (m.type === 'rasterize') return rasterize(m);
    if (m.type !== 'state') return;
    const prev = current();
    const prevKeys = new Set(state.items.map(i => i.key));
    state = m;
    layout = m.layout;
    showLayout();
    syncFrames();
    const n = state.items.length;
    // Follow new items; otherwise stay on the same item if it still exists
    const added = state.items.some(i => !prevKeys.has(i.key));
    const i = prev ? state.items.findIndex(x => x.key === prev.key) : -1;
    if (added) {
      index = n - 1;
    } else {
      index = i >= 0 ? i : Math.min(index, n - 1);
    }
    render();
  });

  let timer;
  new ResizeObserver(() => {
    clearTimeout(timer);
    timer = setTimeout(render, 150);
  }).observe(stage);

  vscode.postMessage({ type: 'ready' });
})();
