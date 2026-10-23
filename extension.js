// R Plots panel: shows the httpgd viewer of the current R session in a
// dedicated webview view (bottom panel or secondary sidebar), never in the
// editor area. The R side writes the httpgd URL to ~/.rplot-panel/url.
const vscode = require('vscode');
const fs = require('fs');
const os = require('os');
const path = require('path');

const URL_FILE = path.join(os.homedir(), '.rplot-panel', 'url');

function readUrl() {
  try {
    return fs.readFileSync(URL_FILE, 'utf8').trim() || undefined;
  } catch {
    return undefined;
  }
}

class PlotsViewProvider {
  constructor() {
    this.view = undefined;
    this.url = readUrl();
  }

  resolveWebviewView(view) {
    this.view = view;
    view.webview.options = { enableScripts: true };
    this.render();
  }

  async render() {
    if (!this.view) return;
    if (!this.url) {
      this.view.webview.html = page(
        '<p class="empty">No R plot yet. Draw a plot in an R session.</p>'
      );
      return;
    }
    // Forwards the port when VS Code runs remotely (devcontainer, SSH)
    const uri = await vscode.env.asExternalUri(vscode.Uri.parse(this.url));
    // Changing the query string forces the iframe to reload
    const s = uri.toString(true);
    const src = s + (s.includes('?') ? '&' : '?') + '_=' + Date.now();
    this.view.webview.html = page(`<iframe src="${src}"></iframe>`);
  }

  update() {
    const url = readUrl();
    if (!url || url === this.url) return;
    this.url = url;
    this.render();
    const reveal = vscode.workspace
      .getConfiguration('rplotPanel')
      .get('revealOnNewSession');
    if (!reveal) return;
    if (this.view) {
      this.view.show(true);
    } else {
      vscode.commands.executeCommand('rplotPanel.plots.focus');
    }
  }
}

function page(body) {
  return `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><style>
  html, body { margin: 0; padding: 0; height: 100%; overflow: hidden; }
  iframe { border: 0; width: 100%; height: 100vh; background: white; }
  .empty { padding: 1em; opacity: 0.7; font-family: var(--vscode-font-family); }
</style></head><body>${body}</body></html>`;
}

function activate(context) {
  const provider = new PlotsViewProvider();
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider('rplotPanel.plots', provider, {
      webviewOptions: { retainContextWhenHidden: true }
    }),
    vscode.commands.registerCommand('rplotPanel.reload', () => {
      provider.url = readUrl();
      provider.render();
    }),
    vscode.commands.registerCommand('rplotPanel.openExternal', async () => {
      if (!provider.url) return;
      const uri = await vscode.env.asExternalUri(
        vscode.Uri.parse(provider.url)
      );
      vscode.env.openExternal(uri);
    })
  );
  // Polling is portable (Linux, Windows, macOS) and works before the
  // directory exists
  fs.watchFile(URL_FILE, { interval: 500 }, () => provider.update());
  context.subscriptions.push({ dispose: () => fs.unwatchFile(URL_FILE) });
}

function deactivate() {}

module.exports = { activate, deactivate };
