// Contract with the R side, kept free of the VS Code API so it can be
// tested with plain Node: the .Rprofile block writes ~/.krplot/url with the
// httpgd URL, then the device width and height (px).
const fs = require('fs');
const os = require('os');
const path = require('path');

// httpgd defaults, used when R does not give the device size
const DEFAULT_DEVICE = { w: 720, h: 576 };

// Same home as R: HOME on Linux/macOS, USERPROFILE on Windows
function urlFile(home = os.homedir()) {
  return path.join(home, '.krplot', 'url');
}

function readUrl(file = urlFile()) {
  try {
    return fs.readFileSync(file, 'utf8').trim() || undefined;
  } catch {
    return undefined;
  }
}

function parseDevice(content) {
  const [, w, h] = content.split(/\r?\n/).map(Number);
  return w > 0 && h > 0 ? { w, h } : DEFAULT_DEVICE;
}

// httpgd session: local base URL (polled from here) and token
function parseSession(content) {
  try {
    const u = new URL(content.split(/\r?\n/)[0].trim());
    return {
      url: u.toString(),
      base: u.origin,
      token: u.searchParams.get('token') || '',
      device: parseDevice(content)
    };
  } catch {
    return undefined;
  }
}

// vscode-R (sess) replaces options(device) after the .Rprofile has run,
// unless its plot backend is "native". `get` reads a setting of vscode-R.
function vscodeRTakesPlots(get) {
  return get('sessionWatcher', true) !== false &&
    get('plot.backend', 'auto') !== 'native';
}

module.exports = {
  DEFAULT_DEVICE, urlFile, readUrl, parseDevice, parseSession,
  vscodeRTakesPlots
};
