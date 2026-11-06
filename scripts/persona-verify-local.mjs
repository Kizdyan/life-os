import { spawnSync } from 'node:child_process';

const commands = [
  ['npm', ['ci', '--no-audit', '--no-fund']],
  ['npm', ['run', 'typecheck']],
  ['npm', ['run', 'web:typecheck']],
  ['npm', ['run', 'api:typecheck']],
  ['npm', ['test', '--', '--run']],
  ['npm', ['run', 'web:build']],
];

for (const [command, args] of commands) {
  process.stdout.write('\n> ' + command + ' ' + args.join(' ') + '\n');
  const result = spawnSync(process.platform === 'win32' ? command + '.cmd' : command, args, {
    stdio: 'inherit',
    shell: process.platform === 'win32',
    env: process.env,
  });
  if (result.error) {
    console.error('Cannot run verification:', result.error.message);
    process.exit(1);
  }
  if (result.status !== 0) {
    console.error('Verification failed:', command, args.join(' '), 'exit', result.status);
    process.exit(result.status || 1);
  }
}
console.log('\nPersona verification PASS');
