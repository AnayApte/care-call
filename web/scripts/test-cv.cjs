// Compile the gesture layer into a temporary folder, then run Node's built-in tests.
const { spawnSync } = require('node:child_process');
const { mkdtempSync, readdirSync, rmSync, writeFileSync } = require('node:fs');
const { tmpdir } = require('node:os');
const path = require('node:path');
const web = path.resolve(__dirname, '..');
const repo = path.dirname(web);
const output = mkdtempSync(path.join(tmpdir(), 'care-call-tests-'));
try {
  const files = readdirSync(path.join(web, 'src/cv')).filter(f => f.endsWith('.ts')).map(f => path.join(web, 'src/cv', f));
  files.push(path.join(web, 'src/lib/adaptation.ts'), path.join(web, 'src/lib/reports.ts'));
  const compiled = spawnSync(process.execPath, [require.resolve('typescript/bin/tsc'), '--target', 'ES2022',
    '--module', 'CommonJS', '--moduleResolution', 'Node', '--lib', 'ES2022,DOM', '--strict',
    '--esModuleInterop', '--resolveJsonModule', '--skipLibCheck', '--rootDir', repo, '--outDir', output, ...files], { cwd: web, stdio: 'inherit' });
  if (compiled.status !== 0) process.exitCode = compiled.status || 1;
  else {
    writeFileSync(path.join(output, 'package.json'), '{"type":"commonjs"}');
    const tests = readdirSync(path.join(web, 'src/cv')).filter(f => f.endsWith('.test.cjs')).map(f => path.join(web, 'src/cv', f));
    const run = spawnSync(process.execPath, ['--test', ...tests], { cwd: web, stdio: 'inherit',
      env: { ...process.env, CV_TEST_BUILD: path.join(output, 'web/src/cv') } });
    process.exitCode = run.status ?? 1;
  }
} finally { rmSync(output, { recursive: true, force: true }); }
