// End to end: the .Rprofile block of the README and r/init.R, run in an
// interactive R session, must start httpgd and write ~/.krplot/url as
// session.js reads it. Skipped when R or httpgd is missing, unless
// KRPLOT_REQUIRE_R is set.
const test = require('node:test');
const assert = require('node:assert');
const { spawn, spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { urlFile, readUrl, parseSession } = require('../session');

const WINDOWS = process.platform === 'win32';
const R = process.env.KRPLOT_R || 'R';
const RSCRIPT = process.env.KRPLOT_RSCRIPT || 'Rscript';
// Rterm only forces an interactive session with --ess
const R_ARGS = [WINDOWS ? '--ess' : '--interactive', '--quiet', '--no-save'];

function rprofileBlock() {
  const readme = fs.readFileSync(
    path.join(__dirname, '..', 'README.md'), 'utf8'
  );
  const setup = readme.slice(readme.indexOf('### 1. Load krplot in R'));
  return setup.match(/```r\r?\n([\s\S]*?)```/)[1];
}

// User library of the real home, lost when HOME is changed below
function rSetup() {
  const r = spawnSync(RSCRIPT, ['-e', [
    'cat(Sys.getenv("R_LIBS_USER"), "\\n")',
    'cat(requireNamespace("httpgd", quietly = TRUE))'
  ].join(';')], { encoding: 'utf8' });
  if (r.status !== 0) return { missing: `R not found (${RSCRIPT})` };
  const [libs, httpgd] = r.stdout.trim().split(/\r?\n/).map(s => s.trim());
  if (httpgd !== 'TRUE') return { missing: 'httpgd is not installed' };
  return { libs };
}

const setup = rSetup();
const skip = !process.env.KRPLOT_REQUIRE_R && setup.missing;
if (process.env.KRPLOT_REQUIRE_R && setup.missing) {
  throw new Error(setup.missing);
}

function sandbox(termProgram) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'krplot-home-'));
  const profile = path.join(home, 'Rprofile');
  fs.writeFileSync(profile, rprofileBlock());
  // What the extension does when it starts
  fs.mkdirSync(path.join(home, '.krplot'));
  fs.copyFileSync(
    path.join(__dirname, '..', 'r', 'init.R'),
    path.join(home, '.krplot', 'init.R')
  );
  const env = {
    ...process.env,
    HOME: home,
    USERPROFILE: home,
    R_LIBS_USER: setup.libs,
    R_PROFILE_USER: profile,
    TERM_PROGRAM: termProgram,
    POSITRON_VERSION: ''
  };
  return { home, env, cleanup: () => fs.rmSync(home, { recursive: true }) };
}

// Runs `code` in an interactive R session and returns its output
function runR(env, code, onOutput) {
  return new Promise((resolve, reject) => {
    const r = spawn(R, R_ARGS, { env });
    let out = '';
    const collect = d => {
      out += d;
      if (onOutput) onOutput(out);
    };
    r.stdout.on('data', collect);
    r.stderr.on('data', collect);
    r.on('error', reject);
    r.on('close', status => resolve({ status, out }));
    r.stdin.end(`${code}\nq("no")\n`);
  });
}

async function getJson(session, p) {
  const q = new URLSearchParams({ token: session.token });
  return (await fetch(`${session.base}${p}?${q}`)).json();
}

test('the README block sends plots to httpgd', { skip, timeout: 120000 },
  async () => {
    const { home, env, cleanup } = sandbox('vscode');
    const done = path.join(home, 'done');
    env.KRPLOT_DONE = done;
    let checked;
    try {
      const run = runR(env, [
        'plot(1:10)',
        'cat("PLOTTED\\n")',
        't0 <- Sys.time()',
        'while (!file.exists(Sys.getenv("KRPLOT_DONE")) &&',
        '  difftime(Sys.time(), t0, units = "secs") < 60) Sys.sleep(0.1)'
      ].join('\n'), out => {
        // R keeps httpgd alive until the checks below are done
        if (!checked && out.includes('PLOTTED')) {
          checked = check(home).finally(() => fs.writeFileSync(done, ''));
        }
      });
      const { status, out } = await run;
      assert.ok(checked, `R did not plot:\n${out}`);
      await checked;
      assert.strictEqual(status, 0, out);
    } finally {
      cleanup();
    }
  });

async function check(home) {
  const file = urlFile(home);
  assert.ok(fs.existsSync(file), 'the .Rprofile block did not write url');
  const session = parseSession(readUrl(file));
  assert.ok(session, `invalid url file: ${readUrl(file)}`);
  assert.ok(session.token, 'no httpgd token');
  assert.deepStrictEqual(session.device, { w: 720, h: 576 });
  const state = await getJson(session, '/state');
  assert.ok(state.upid >= 0, JSON.stringify(state));
  const plots = await getJson(session, '/plots');
  assert.strictEqual(plots.plots.length, 1, JSON.stringify(plots));
  const q = new URLSearchParams({
    id: plots.plots[0].id, width: 400, height: 300, renderer: 'svgp',
    token: session.token
  });
  const svg = await (await fetch(`${session.base}/plot?${q}`)).text();
  assert.match(svg, /<svg/);
}

test('the README block is inactive outside VS Code', { skip, timeout: 60000 },
  async () => {
    const { env, cleanup } = sandbox('');
    try {
      const { out } = await runR(env, [
        'dev <- getOption("device")',
        'cat("KRPLOT", is.function(dev) &&',
        '  any(grepl("hgd", deparse(dev))), "\\n")'
      ].join('\n'));
      assert.match(out, /KRPLOT FALSE/);
    } finally {
      cleanup();
    }
  });
