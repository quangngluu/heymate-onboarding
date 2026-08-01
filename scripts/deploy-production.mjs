import { execFileSync, spawnSync } from 'node:child_process';

const args = process.argv.slice(2);
const printOnly = args.length === 1 && args[0] === '--print-command';
if (args.length && !printOnly) {
  throw new Error('Usage: npm run deploy:prod [-- --print-command]');
}

function git(...gitArgs) {
  return execFileSync('git', gitArgs, {
    cwd: process.cwd(),
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

const dirty = git('status', '--porcelain=v1', '--untracked-files=all');
if (dirty) {
  throw new Error(
    'Refusing production deploy: commit or remove every tracked/untracked worktree change first.'
  );
}

const sha = git('rev-parse', 'HEAD');
if (!/^[0-9a-f]{40,64}$/u.test(sha)) {
  throw new Error(`Refusing production deploy: invalid Git SHA ${JSON.stringify(sha)}.`);
}

const command = 'npx';
const commandArgs = [
  '--no-install',
  'vercel',
  'deploy',
  '--prod',
  '--yes',
  '--build-env',
  `VITE_BUILD_ID=${sha}`,
];

if (printOnly) {
  process.stdout.write(`${command} ${commandArgs.join(' ')}\n`);
  process.exit(0);
}

const result = spawnSync(command, commandArgs, {
  cwd: process.cwd(),
  stdio: 'inherit',
  shell: false,
});
if (result.error) throw result.error;
process.exit(result.status ?? 1);
