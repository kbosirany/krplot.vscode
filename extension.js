// krplot: shows the plots of the current R session (httpgd device) in a
// dedicated view (bottom panel or secondary sidebar) or in a separate
// window, never in the editor area. The R side writes the httpgd URL to
// ~/.krplot/url; this host polls httpgd and drives the webviews.
const vscode = require('vscode');
const fs = require('fs');
const os = require('os');
const path = require('path');

const URL_FILE = path.join(os.homedir(), '.krplot', 'url');
const LAYOUT_KEY = 'krplot.layout';
const DEFAULT_LAYOUT = { mode: 'fill', w: 16, h: 9 };

function readUrl() {
  try {
    return fs.readFileSync(URL_FILE, 'utf8').trim() || undefined;
  } catch {
    return undefined;
  }
}

// httpgd session: local base URL (polled from here) and token
function parseSession(url) {
  try {
    const u = new URL(url);
    return { base: u.origin, token: u.searchParams.get('token') || '' };
  } catch {
    return undefined;
  }
}

class Plots {
  constructor(context) {
    this.context = context;
    this.webviews = new Set();
    this.url = undefined;
    this.session = undefined;
    this.externalBase = undefined;
    this.state = { connected: false, ids: [], upid: -1 };
    this.timer = undefined;
    this.view = undefined;
    this.window = undefined;
  }

  get layout() {
    return this.context.globalState.get(LAYOUT_KEY, DEFAULT_LAYOUT);
  }

  endpoint(p, params = {}) {
    const q = new URLSearchParams({ ...params, token: this.session.token });
    return `${this.session.base}${p}?${q}`;
  }

  async connect(url) {
    this.url = url;
    this.session = url && parseSession(url);
    this.state = { connected: false, ids: [], upid: -1 };
    this.externalBase = undefined;
    if (this.session) {
      // Forwards the port when VS Code runs remotely (devcontainer, SSH)
      const ext = await vscode.env.asExternalUri(
        vscode.Uri.parse(this.session.base)
      );
      this.externalBase = ext.toString(true).replace(/\/$/, '');
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
      if (st.upid === this.state.upid && this.state.connected) return;
      const pl = await (await fetch(this.endpoint('/plots'))).json();
      this.state = {
        connected: true,
        ids: pl.plots.map(p => p.id),
        upid: pl.state.upid
      };
      this.broadcast();
    } catch {
      if (this.state.connected) {
        this.state = { connected: false, ids: [], upid: -1 };
        this.broadcast();
      }
    }
  }

  message() {
    return {
      type: 'state',
      hasSession: Boolean(this.session),
      base: this.externalBase,
      token: this.session ? this.session.token : '',
      layout: this.layout,
      ...this.state
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
        await this.request('/remove', { id: m.id });
        break;
      case 'clear':
        await this.request('/clear');
        break;
      case 'save':
        await this.save(webview, m);
        break;
      case 'savePng':
        await this.writePng(m);
        break;
      case 'openWindow':
        await this.openWindow();
        break;
      case 'openBrowser':
        await this.openBrowser();
        break;
    }
  }

  async request(p, params) {
    if (!this.session) return;
    try {
      await fetch(this.endpoint(p, params));
    } catch {
      // Session gone: the next poll reports it
    }
    this.poll();
  }

  async save(webview, m) {
    if (!this.session) return;
    let svg;
    try {
      const res = await fetch(this.endpoint('/plot', {
        id: m.id, width: m.width, height: m.height, renderer: 'svgp'
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
    if (!this.url) return;
    const uri = await vscode.env.asExternalUri(vscode.Uri.parse(this.url));
    vscode.env.openExternal(uri);
  }

  html(webview) {
    const media = f => webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, 'media', f)
    );
    const csp = [
      "default-src 'none'",
      `style-src ${webview.cspSource}`,
      `script-src ${webview.cspSource}`,
      'img-src http: https: blob: data:'
    ].join('; ');
    return `<!DOCTYPE html>
<html><head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="${csp}">
<link rel="stylesheet" href="${media('view.css')}">
</head><body>
<div id="toolbar">
  <button id="prev" title="Previous plot (Left)">&#9664;</button>
  <span id="count">0 / 0</span>
  <button id="next" title="Next plot (Right)">&#9654;</button>
  <span class="sep"></span>
  <select id="layout" title="Plot size">
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
  <button id="remove" title="Remove this plot">&#128465;</button>
  <button id="clear" title="Remove all plots">&#10005;</button>
  <span id="info"></span>
</div>
<div id="stage"><img id="plot" alt=""><p id="empty"></p></div>
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

function activate(context) {
  const plots = new Plots(context);
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
  // directory exists
  fs.watchFile(URL_FILE, { interval: 500 }, () => {
    const url = readUrl();
    if (!url || url === plots.url) return;
    plots.connect(url);
    const reveal = vscode.workspace
      .getConfiguration('krplot')
      .get('revealOnNewSession');
    if (!reveal || plots.window) return;
    if (plots.view) {
      plots.view.show(true);
    } else {
      vscode.commands.executeCommand('krplot.plots.focus');
    }
  });
  context.subscriptions.push({
    dispose: () => {
      fs.unwatchFile(URL_FILE);
      clearTimeout(plots.timer);
    }
  });
}

function deactivate() {}

module.exports = { activate, deactivate };
