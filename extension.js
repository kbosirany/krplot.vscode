// krplot: shows the plots (httpgd device) and HTML widgets (leaflet,
// plotly, DT, ...) of the current R session in a dedicated view (bottom
// panel or secondary sidebar) or in a separate window, never in the editor
// area. The R side (r/init.R, installed in ~/.krplot) writes the httpgd URL
// and device size to ~/.krplot/url and one file per HTML widget in
// ~/.krplot/viewer; this host polls them, serves the widgets and drives
// the webviews.
const vscode = require('vscode');
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');
const {
  DEFAULT_DEVICE, urlFile, readUrl, parseSession, vscodeRTakesPlots
} = require('./session');

const URL_FILE = urlFile();
const DIR = path.dirname(URL_FILE);
const VIEWER_DIR = path.join(DIR, 'viewer');
const ALIVE_FILE = path.join(DIR, 'alive');
const INIT_FILE = path.join(DIR, 'init.R');
const LAYOUT_KEY = 'krplot.layout';
const DEFAULT_LAYOUT = { mode: 'device', w: 16, h: 9 };
const VSCODE_R = 'REditorSupport.r';
const IGNORE_VSCODE_R_KEY = 'krplot.ignoreVscodeR';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.htm': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.map': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.eot': 'application/vnd.ms-fontobject',
  '.wasm': 'application/wasm',
  '.txt': 'text/plain; charset=utf-8',
  '.csv': 'text/csv; charset=utf-8'
};

async function externalUrl(url) {
  // Forwards the port when VS Code runs remotely (devcontainer, SSH)
  const uri = await vscode.env.asExternalUri(vscode.Uri.parse(url));
  return uri.toString(true);
}

// Name shown for an HTML page: widget class (leaflet, plotly, ...), else
// its title
function htmlName(file) {
  let html = '';
  try {
    html = fs.readFileSync(file, 'utf8');
  } catch {
    return path.basename(file);
  }
  const widget = html.match(/class="([\w.-]+) html-widget/);
  if (widget) return widget[1];
  const title = html.match(/<title>([^<]*)<\/title>/i);
  return title && title[1].trim() ? title[1].trim() : 'HTML';
}

// Serves the folders of the HTML pages written by R (index.html and its
// lib/ dependencies) on 127.0.0.1, one URL prefix per page
class FileServer {
  constructor() {
    this.dirs = new Map();
    this.count = 0;
    this.ready = undefined;
    this.server = undefined;
  }

  base() {
    if (!this.ready) {
      this.ready = new Promise((resolve, reject) => {
        this.server = http.createServer((req, res) => this.handle(req, res));
        this.server.on('error', reject);
        this.server.listen(0, '127.0.0.1', () => {
          const port = this.server.address().port;
          resolve(externalUrl(`http://127.0.0.1:${port}`)
            .then(u => u.replace(/\/$/, '')));
        });
      });
    }
    return this.ready;
  }

  async add(file) {
    const id = String(++this.count);
    this.dirs.set(id, path.resolve(path.dirname(file)));
    const name = encodeURIComponent(path.basename(file));
    return `${await this.base()}/w/${id}/${name}`;
  }

  handle(req, res) {
    const send = (code, body, type = 'text/plain; charset=utf-8') => {
      res.writeHead(code, { 'Content-Type': type });
      res.end(body);
    };
    let rel;
    let dir;
    try {
      const u = new URL(req.url, 'http://127.0.0.1');
      const m = u.pathname.match(/^\/w\/(\d+)\/(.*)$/);
      dir = m && this.dirs.get(m[1]);
      rel = m && decodeURIComponent(m[2]);
    } catch {
      return send(400, 'Bad request');
    }
    if (!dir) return send(404, 'Not found');
    let file = path.resolve(dir, rel || 'index.html');
    // Only files of the page folder
    if (file !== dir && !file.startsWith(dir + path.sep)) {
      return send(403, 'Forbidden');
    }
    fs.stat(file, (err, st) => {
      if (!err && st.isDirectory()) file = path.join(file, 'index.html');
      fs.readFile(file, (e, data) => {
        if (e) return send(404, 'Not found');
        const type = MIME[path.extname(file).toLowerCase()] ||
          'application/octet-stream';
        send(200, data, type);
      });
    });
  }

  dispose() {
    if (this.server) this.server.close();
  }
}

class Plots {
  constructor(context) {
    this.context = context;
    this.webviews = new Set();
    this.content = undefined;
    this.session = undefined;
    this.externalBase = undefined;
    this.connected = false;
    this.upid = -1;
    // History: plots and HTML pages, in the order they were shown
    this.items = [];
    this.htmlCount = 0;
    this.timer = undefined;
    this.view = undefined;
    this.window = undefined;
    this.files = new FileServer();
  }

  get layout() {
    return this.context.globalState.get(LAYOUT_KEY, DEFAULT_LAYOUT);
  }

  endpoint(p, params = {}) {
    const q = new URLSearchParams({ ...params, token: this.session.token });
    return `${this.session.base}${p}?${q}`;
  }

  async connect(content) {
    this.content = content;
    this.session = content && parseSession(content);
    this.connected = false;
    this.upid = -1;
    this.externalBase = undefined;
    // Plot ids belong to the previous httpgd session
    this.items = this.items.filter(i => i.kind !== 'plot');
    if (this.session) {
      this.externalBase = (await externalUrl(this.session.base))
        .replace(/\/$/, '');
    }
    this.broadcast();
    this.schedule();
  }

  schedule() {
    clearTimeout(this.timer);
    if (!this.session) return;
    const ms = vscode.workspace
      .getConfiguration('krplot')
      .get('pollInterval', 400);
    this.timer = setTimeout(
      () => this.poll().finally(() => this.schedule()), ms
    );
  }

  async poll() {
    try {
      const st = await (await fetch(this.endpoint('/state'))).json();
      if (st.upid === this.upid && this.connected) return;
      const pl = await (await fetch(this.endpoint('/plots'))).json();
      this.connected = true;
      this.upid = pl.state.upid;
      this.syncPlots(pl.plots.map(p => p.id));
      this.broadcast();
    } catch {
      if (this.connected) {
        this.connected = false;
        this.items = this.items.filter(i => i.kind !== 'plot');
        this.broadcast();
      }
    }
  }

  // Keep the history in line with httpgd: drop removed plots, append new
  syncPlots(ids) {
    const live = new Set(ids);
    this.items = this.items.filter(i => i.kind !== 'plot' || live.has(i.id));
    const known = new Set(
      this.items.filter(i => i.kind === 'plot').map(i => i.id)
    );
    const base = this.session.base;
    for (const id of ids) {
      if (!known.has(id)) {
        this.items.push({ kind: 'plot', id, key: `p:${base}:${id}` });
      }
    }
  }

  // HTML pages sent by R: one file per page, read then deleted
  async pollViewer() {
    let files;
    try {
      files = fs.readdirSync(VIEWER_DIR).filter(f => f.endsWith('.txt'));
    } catch {
      return;
    }
    let added = false;
    for (const f of files.sort()) {
      const p = path.join(VIEWER_DIR, f);
      let url;
      try {
        url = fs.readFileSync(p, 'utf8').trim();
        fs.unlinkSync(p);
      } catch {
        continue;
      }
      if (url) {
        await this.addHtml(url);
        added = true;
      }
    }
    if (added) {
      this.broadcast();
      this.reveal();
    }
  }

  async addHtml(url) {
    let src;
    let name;
    if (/^https?:\/\//i.test(url)) {
      // Web app (Shiny, ...) served by R
      src = await externalUrl(url);
      name = new URL(url).host;
    } else {
      src = await this.files.add(url);
      name = htmlName(url);
    }
    const key = `h:${++this.htmlCount}`;
    this.items.push({ kind: 'html', key, src, name });
  }

  reveal() {
    const reveal = vscode.workspace
      .getConfiguration('krplot')
      .get('revealOnNewSession');
    if (!reveal || this.window) return;
    if (this.view) {
      this.view.show(true);
    } else {
      vscode.commands.executeCommand('krplot.plots.focus');
    }
  }

  message() {
    return {
      type: 'state',
      hasSession: Boolean(this.session),
      connected: this.connected,
      base: this.externalBase,
      token: this.session ? this.session.token : '',
      upid: this.upid,
      device: this.session ? this.session.device : DEFAULT_DEVICE,
      layout: this.layout,
      items: this.items
    };
  }

  broadcast() {
    const msg = this.message();
    for (const w of this.webviews) w.postMessage(msg);
  }

  attach(webview, disposables) {
    webview.options = {
      enableScripts: true,
      localResourceRoots: [
        vscode.Uri.joinPath(this.context.extensionUri, 'media')
      ]
    };
    webview.html = this.html(webview);
    this.webviews.add(webview);
    disposables.push(
      webview.onDidReceiveMessage(m => this.onMessage(webview, m))
    );
  }

  detach(webview) {
    this.webviews.delete(webview);
  }

  item(key) {
    return this.items.find(i => i.key === key);
  }

  async onMessage(webview, m) {
    switch (m.type) {
      case 'ready':
        webview.postMessage(this.message());
        break;
      case 'layout':
        await this.context.globalState.update(LAYOUT_KEY, m.layout);
        this.broadcast();
        break;
      case 'remove':
        await this.remove(m.key);
        break;
      case 'clear':
        this.items = this.items.filter(i => i.kind === 'plot');
        await this.request('/clear');
        this.broadcast();
        break;
      case 'save':
        await this.save(webview, m);
        break;
      case 'savePng':
        await this.writePng(m);
        break;
      case 'openItem':
        await this.openItem(m.key);
        break;
    }
  }

  async remove(key) {
    const it = this.item(key);
    if (!it) return;
    if (it.kind === 'plot') {
      await this.request('/remove', { id: it.id });
    } else {
      this.items = this.items.filter(i => i !== it);
      this.broadcast();
    }
  }

  async request(p, params) {
    if (!this.session) return;
    try {
      await fetch(this.endpoint(p, params));
    } catch {
      // Session gone: the next poll reports it
    }
    await this.poll();
  }

  async save(webview, m) {
    const it = this.item(m.key);
    if (!this.session || !it || it.kind !== 'plot') return;
    let svg;
    try {
      const res = await fetch(this.endpoint('/plot', {
        id: it.id, width: m.width, height: m.height, renderer: 'svgp'
      }));
      svg = await res.text();
    } catch (e) {
      vscode.window.showErrorMessage(`krplot: cannot fetch plot (${e})`);
      return;
    }
    if (m.format === 'svg') {
      const uri = await this.askFile('svg');
      if (uri) await vscode.workspace.fs.writeFile(uri, Buffer.from(svg));
    } else {
      // httpgd has no raster renderer: the webview rasterizes the SVG
      webview.postMessage({ ...m, type: 'rasterize', svg });
    }
  }

  async writePng(m) {
    const uri = await this.askFile('png');
    if (!uri) return;
    const data = m.dataUrl.replace(/^data:image\/png;base64,/, '');
    await vscode.workspace.fs.writeFile(uri, Buffer.from(data, 'base64'));
  }

  async askFile(ext) {
    const folder = vscode.workspace.workspaceFolders?.[0]?.uri;
    return vscode.window.showSaveDialog({
      defaultUri: folder && vscode.Uri.joinPath(folder, `plot.${ext}`),
      filters: { [ext.toUpperCase()]: [ext] }
    });
  }

  async openItem(key) {
    const it = this.item(key);
    if (it && it.kind === 'html') {
      vscode.env.openExternal(vscode.Uri.parse(it.src, true));
    } else {
      await this.openBrowser();
    }
  }

  async openWindow() {
    if (this.window) {
      this.window.reveal();
      return;
    }
    const panel = vscode.window.createWebviewPanel(
      'krplot.window', 'R Plots', vscode.ViewColumn.Active,
      { retainContextWhenHidden: true }
    );
    panel.iconPath = vscode.Uri.joinPath(
      this.context.extensionUri, 'media', 'plot.svg'
    );
    const disposables = [];
    this.attach(panel.webview, disposables);
    panel.onDidDispose(() => {
      this.detach(panel.webview);
      disposables.forEach(d => d.dispose());
      this.window = undefined;
    });
    this.window = panel;
    // The new panel is the active editor: move it to its own window
    await vscode.commands.executeCommand(
      'workbench.action.moveEditorToNewWindow'
    );
  }

  async openBrowser() {
    if (!this.session) return;
    vscode.env.openExternal(
      vscode.Uri.parse(await externalUrl(this.session.url), true)
    );
  }

  html(webview) {
    const media = f => webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, 'media', f)
    );
    const csp = [
      "default-src 'none'",
      `style-src ${webview.cspSource}`,
      `script-src ${webview.cspSource}`,
      'img-src http: https: blob: data:',
      'frame-src http: https:'
    ].join('; ');
    return `<!DOCTYPE html>
<html><head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="${csp}">
<link rel="stylesheet" href="${media('view.css')}">
</head><body>
<div id="toolbar">
  <button id="prev" title="Previous (Left)">&#9664;</button>
  <span id="count">0 / 0</span>
  <button id="next" title="Next (Right)">&#9654;</button>
  <span class="sep"></span>
  <select id="layout" title="Size">
    <option value="device" id="device">Device</option>
    <option value="fill">Fill</option>
    <optgroup label="Keep ratio">
      <option value="ratio:16:9">16:9</option>
      <option value="ratio:4:3">4:3</option>
      <option value="ratio:3:2">3:2</option>
      <option value="ratio:1:1">1:1</option>
      <option value="ratio:3:4">3:4</option>
      <option value="ratio:1000:1414">A4 portrait</option>
      <option value="ratio:1414:1000">A4 landscape</option>
      <option value="ratio:custom">Custom ratio&#8230;</option>
    </optgroup>
    <option value="fixed">Fixed size (px)&#8230;</option>
  </select>
  <span id="dims" hidden>
    <input id="w" type="number" min="1" title="Width">
    &#215;
    <input id="h" type="number" min="1" title="Height">
  </span>
  <span class="sep"></span>
  <button id="svg" title="Save as SVG">SVG</button>
  <button id="png" title="Save as PNG">PNG</button>
  <button id="open" title="Open in browser">&#8599;</button>
  <button id="remove" title="Remove">&#128465;</button>
  <button id="clear" title="Remove all">&#10005;</button>
  <span id="info"></span>
</div>
<div id="stage">
  <img id="plot" alt="" hidden>
  <div id="frames"></div>
  <p id="empty"></p>
</div>
<script src="${media('view.js')}"></script>
</body></html>`;
  }
}

class PlotsViewProvider {
  constructor(plots) {
    this.plots = plots;
  }

  resolveWebviewView(view) {
    const disposables = [];
    this.plots.view = view;
    this.plots.attach(view.webview, disposables);
    view.onDidDispose(() => {
      this.plots.detach(view.webview);
      disposables.forEach(d => d.dispose());
      this.plots.view = undefined;
    });
  }
}

// vscode-R would show the plots in its own viewer, in the editor area
async function checkVscodeR(context) {
  if (!vscode.extensions.getExtension(VSCODE_R)) return;
  if (context.globalState.get(IGNORE_VSCODE_R_KEY)) return;
  const config = vscode.workspace.getConfiguration('r');
  if (!vscodeRTakesPlots((key, def) => config.get(key, def))) return;
  const fix = 'Set r.plot.backend to native';
  const ignore = "Don't ask again";
  const choice = await vscode.window.showWarningMessage(
    'krplot: the R extension (vscode-R) shows the plots in its own viewer. ' +
      'Set "r.plot.backend" to "native" to show them in the R Plots ' +
      'pane, then open a new R terminal.',
    fix, ignore
  );
  if (choice === ignore) {
    await context.globalState.update(IGNORE_VSCODE_R_KEY, true);
  } else if (choice === fix) {
    const { Global, Workspace } = vscode.ConfigurationTarget;
    const values = config.inspect('plot.backend') || {};
    await config.update('plot.backend', 'native', Global);
    // A workspace value would override the user one
    if (values.workspaceValue !== undefined) {
      await config.update('plot.backend', 'native', Workspace);
    }
  }
}

// Copies the R side to ~/.krplot/init.R when it changed
function installInit(context) {
  const src = path.join(context.extensionPath, 'r', 'init.R');
  try {
    const code = fs.readFileSync(src, 'utf8');
    let current;
    try {
      current = fs.readFileSync(INIT_FILE, 'utf8');
    } catch {
      current = undefined;
    }
    if (current !== code) {
      fs.mkdirSync(DIR, { recursive: true });
      fs.writeFileSync(INIT_FILE, code);
    }
  } catch (e) {
    vscode.window.showErrorMessage(
      `krplot: cannot install ${INIT_FILE} (${e})`
    );
  }
}

// Tells R the extension runs, so that HTML pages are not sent to a view
// nobody displays (R falls back to the browser)
function heartbeat() {
  try {
    fs.mkdirSync(DIR, { recursive: true });
    const now = new Date();
    try {
      fs.utimesSync(ALIVE_FILE, now, now);
    } catch {
      fs.writeFileSync(ALIVE_FILE, '');
    }
  } catch {
    // Read-only home: HTML pages go to the browser
  }
}

function activate(context) {
  installInit(context);
  heartbeat();
  const plots = new Plots(context);
  checkVscodeR(context);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      'krplot.plots', new PlotsViewProvider(plots),
      { webviewOptions: { retainContextWhenHidden: true } }
    ),
    vscode.commands.registerCommand(
      'krplot.openWindow', () => plots.openWindow()
    ),
    vscode.commands.registerCommand(
      'krplot.openBrowser', () => plots.openBrowser()
    ),
    vscode.commands.registerCommand(
      'krplot.reload', () => plots.connect(readUrl())
    )
  );
  plots.connect(readUrl());
  // Polling is portable (Linux, Windows, macOS) and works before the
  // files exist
  fs.watchFile(URL_FILE, { interval: 500 }, () => {
    const content = readUrl();
    if (!content || content === plots.content) return;
    plots.connect(content);
    plots.reveal();
  });
  let viewerBusy = false;
  const viewerTimer = setInterval(() => {
    if (viewerBusy) return;
    viewerBusy = true;
    plots.pollViewer().finally(() => { viewerBusy = false; });
  }, 300);
  const aliveTimer = setInterval(heartbeat, 3000);
  context.subscriptions.push({
    dispose: () => {
      fs.unwatchFile(URL_FILE);
      clearTimeout(plots.timer);
      clearInterval(viewerTimer);
      clearInterval(aliveTimer);
      plots.files.dispose();
    }
  });
}

function deactivate() {}

module.exports = { activate, deactivate };
