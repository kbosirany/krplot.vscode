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

// .Rprofile files R may read at startup: R_PROFILE_USER, else .Rprofile in
// the working directory (a workspace folder), else in the R home (on
// Windows, R_USER, HOME or Documents by default)
function rprofileFiles({
  env = process.env, home = os.homedir(), platform = process.platform,
  folders = []
} = {}) {
  const homes = [home];
  if (platform === 'win32') {
    homes.unshift(env.R_USER, env.HOME, path.join(home, 'Documents'));
  }
  const files = [
    env.R_PROFILE_USER,
    ...folders.map(f => path.join(f, '.Rprofile')),
    ...homes.filter(Boolean).map(h => path.join(h, '.Rprofile'))
  ].filter(Boolean);
  return [...new Set(files)];
}

// Block of krplot < 0.5.0: it starts httpgd itself and never loads
// ~/.krplot/init.R, so HTML widgets go to the vscode-R viewer
function isLegacyRprofile(content) {
  return content.includes('.krplot') && !content.includes('init.R');
}

// First .Rprofile with the previous krplot block, if any
function findLegacyRprofile(files) {
  return files.find(f => {
    try {
      return isLegacyRprofile(fs.readFileSync(f, 'utf8'));
    } catch {
      return false;
    }
  });
}

module.exports = {
  DEFAULT_DEVICE, urlFile, readUrl, parseDevice, parseSession,
  vscodeRTakesPlots, rprofileFiles, isLegacyRprofile, findLegacyRprofile
};
