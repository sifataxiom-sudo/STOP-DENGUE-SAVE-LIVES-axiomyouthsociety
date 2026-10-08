import { spawn } from 'node:child_process';

const children = [];
let shuttingDown = false;

function stop(exitCode) {
  if (shuttingDown) return;
  shuttingDown = true;
  process.exitCode = exitCode;
  for (const child of children) {
    child.kill();
  }
}

function start(args) {
  const child = spawn(process.execPath, args, { stdio: 'inherit' });
  children.push(child);
  child.on('error', (error) => {
    console.error('Failed to start development service:', error);
    stop(1);
  });
  child.on('exit', (code) => {
    if (!shuttingDown) stop(code ?? 1);
  });
}

process.on('SIGINT', () => stop(0));
process.on('SIGTERM', () => stop(0));

start(['server.js']);
start(['node_modules/vite/bin/vite.js', '--port=3000', '--host=0.0.0.0']);
