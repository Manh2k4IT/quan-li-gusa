import { spawnSync } from 'node:child_process';

const command = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const buildEnvironment = {
  ...process.env,
  DATABASE_URL: 'file:./build.db',
};

for (const args of [
  ['prisma', 'generate'],
  ['prisma', 'migrate', 'deploy'],
  ['next', 'build'],
]) {
  const result = spawnSync(command, args, {
    env: buildEnvironment,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}
