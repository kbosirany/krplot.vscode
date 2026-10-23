const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  DEFAULT_DEVICE, urlFile, readUrl, parseDevice, parseSession,
  vscodeRTakesPlots
} = require('../session');

const URL = 'http://127.0.0.1:41234/live?token=abc123';

test('parseSession reads the URL, token and device size', () => {
  const s = parseSession(`${URL}\n800\n450\n`);
  assert.strictEqual(s.base, 'http://127.0.0.1:41234');
  assert.strictEqual(s.token, 'abc123');
  assert.strictEqual(s.url, URL);
  assert.deepStrictEqual(s.device, { w: 800, h: 450 });
});

test('parseSession accepts Windows line endings', () => {
  const s = parseSession(`${URL}\r\n800\r\n450\r\n`);
  assert.strictEqual(s.token, 'abc123');
  assert.deepStrictEqual(s.device, { w: 800, h: 450 });
});

test('parseSession rejects content that is not a URL', () => {
  assert.strictEqual(parseSession('not a url'), undefined);
  assert.strictEqual(parseSession(''), undefined);
});

test('parseSession without token gives an empty token', () => {
  assert.strictEqual(parseSession('http://localhost:1/live').token, '');
});

test('parseDevice falls back to the httpgd defaults', () => {
  assert.deepStrictEqual(parseDevice(URL), DEFAULT_DEVICE);
  assert.deepStrictEqual(parseDevice(`${URL}\nNA\n450`), DEFAULT_DEVICE);
  assert.deepStrictEqual(parseDevice(`${URL}\n0\n450`), DEFAULT_DEVICE);
});

test('urlFile is ~/.krplot/url', () => {
  assert.strictEqual(
    urlFile(path.join('h', 'me')), path.join('h', 'me', '.krplot', 'url')
  );
  assert.strictEqual(
    urlFile(), path.join(os.homedir(), '.krplot', 'url')
  );
});

test('readUrl trims the file and ignores a missing or empty one', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'krplot-'));
  const file = path.join(dir, 'url');
  assert.strictEqual(readUrl(file), undefined);
  fs.writeFileSync(file, '  \n');
  assert.strictEqual(readUrl(file), undefined);
  fs.writeFileSync(file, `${URL}\n720\n576\n`);
  assert.strictEqual(readUrl(file), `${URL}\n720\n576`);
  fs.rmSync(dir, { recursive: true });
});

test('vscode-R takes the plots unless its backend is native', () => {
  const settings = values => (key, def) =>
    key in values ? values[key] : def;
  assert.strictEqual(vscodeRTakesPlots(settings({})), true);
  assert.strictEqual(
    vscodeRTakesPlots(settings({ 'plot.backend': 'httpgd' })), true
  );
  assert.strictEqual(
    vscodeRTakesPlots(settings({ 'plot.backend': 'native' })), false
  );
  assert.strictEqual(
    vscodeRTakesPlots(settings({ sessionWatcher: false })), false
  );
});
