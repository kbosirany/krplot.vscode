// krplot webview: displays the current httpgd plot with the chosen layout.
// The host sends the session state; plots are loaded as SVG images rendered
// by httpgd at the requested size.
(function () {
  const vscode = acquireVsCodeApi();
  const $ = id => document.getElementById(id);
  const stage = $('stage');
  const img = $('plot');
  const empty = $('empty');
  const layoutSel = $('layout');
  const dims = $('dims');
  const inW = $('w');
  const inH = $('h');

  let state = {
    hasSession: false, connected: false, ids: [], upid: -1,
    device: { w: 720, h: 576 }
  };
  let layout = { mode: 'device', w: 16, h: 9 };
  let index = -1;
  let seq = 0;

  function selectValue() {
    if (layout.mode !== 'ratio') return layout.mode;
    if (layout.custom) return 'ratio:custom';
    const v = `ratio:${layout.w}:${layout.h}`;
    const preset = [...layoutSel.options].some(o => o.value === v);
    return preset ? v : 'ratio:custom';
  }

  function showLayout() {
    const d = state.device;
    $('device').textContent = `Device ratio (${d.w} \u00d7 ${d.h})`;
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

  // Rendered size (asked to httpgd) and displayed size of the plot
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

  function currentId() {
    return state.ids[index];
  }

  function message(text) {
    img.hidden = true;
    empty.hidden = false;
    empty.textContent = text;
  }

  function render() {
    // Hidden view: wait for the next resize instead of rendering at 0 px
    if (!stage.clientWidth || !stage.clientHeight) return;
    const n = state.ids.length;
    $('count').textContent = `${n ? index + 1 : 0} / ${n}`;
    $('prev').disabled = index <= 0;
    $('next').disabled = index >= n - 1;
    for (const b of ['svg', 'png', 'remove', 'clear']) $(b).disabled = !n;
    if (!state.hasSession) {
      $('info').textContent = '';
      return message('No R session yet. Draw a plot in an R session.');
    }
    if (!state.connected) {
      $('info').textContent = '';
      return message('R session not reachable (closed?).');
    }
    if (!n) {
      $('info').textContent = '';
      return message('No plot.');
    }
    const b = box();
    $('info').textContent = `${b.rw} × ${b.rh} px`;
    const q = new URLSearchParams({
      id: currentId(), width: b.rw, height: b.rh, renderer: 'svg',
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
      empty.hidden = true;
    };
    next.src = src;
  }

  function go(i) {
    const n = state.ids.length;
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
      type: 'save', format, id: currentId(),
      width: b.rw, height: b.rh, scale
    });
  }
  $('svg').addEventListener('click', () => save('svg'));
  $('png').addEventListener('click', () => save('png'));
  $('remove').addEventListener('click', () => {
    vscode.postMessage({ type: 'remove', id: currentId() });
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
    const prevId = currentId();
    const prevN = state.ids.length;
    state = m;
    layout = m.layout;
    showLayout();
    const n = state.ids.length;
    // Follow new plots; otherwise stay on the same plot if it still exists
    if (n > prevN) {
      index = n - 1;
    } else {
      const i = state.ids.indexOf(prevId);
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
