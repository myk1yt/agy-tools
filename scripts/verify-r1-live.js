const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const { DASHBOARD_SERVER_PORT_FILE } = require('../src/config');
const { probePort, readPortFile } = require('../src/dashboard-link');

async function runLiveVerification() {
  console.log('=== Starting R1 Live Self-Termination Verification ===');
  const targetPort = 8790;

  // 1. Spawn --serve on port 8790
  const serverProc = spawn(process.execPath, ['bin/agy-tokens.js', '--serve', '--port', String(targetPort)], {
    cwd: path.resolve(__dirname, '..'),
    stdio: ['ignore', 'pipe', 'pipe']
  });

  let stdoutLog = '';
  serverProc.stdout.on('data', (d) => {
    const text = d.toString();
    stdoutLog += text;
    process.stdout.write(`[SERVER STDOUT] ${text}`);
  });
  serverProc.stderr.on('data', (d) => {
    process.stderr.write(`[SERVER STDERR] ${d.toString()}`);
  });

  let serverExited = false;
  let serverExitCode = null;
  serverProc.on('exit', (code) => {
    serverExited = true;
    serverExitCode = code;
    console.log(`[SERVER EXIT] Process exited with code ${code}`);
  });

  // 2. Wait for server to bind port
  console.log('Waiting for server port probe...');
  let up = false;
  for (let i = 0; i < 30; i++) {
    await new Promise((r) => setTimeout(r, 200));
    up = await probePort(targetPort);
    if (up) break;
  }
  if (!up) {
    serverProc.kill();
    throw new Error('Server failed to bind port ' + targetPort);
  }
  console.log(`✓ Server is live on 127.0.0.1:${targetPort}`);

  // 3. Verify port file
  const portRecord = readPortFile(DASHBOARD_SERVER_PORT_FILE);
  console.log('Port file content:', JSON.stringify(portRecord));
  if (!portRecord || portRecord.port !== targetPort) {
    serverProc.kill();
    throw new Error('Port file does not record port ' + targetPort);
  }
  console.log(`✓ Port file correctly recorded port ${targetPort}`);

  // 4. Touch a source file mtime
  console.log('Touching mtime of src/serve-staleness.js...');
  const targetFile = path.resolve(__dirname, '../src/serve-staleness.js');
  const future = new Date(Date.now() + 5000);
  fs.utimesSync(targetFile, future, future);

  // 5. Wait for watchdog self-termination (watchdog runs at 30s)
  console.log('Waiting for watchdog self-termination (up to 40s)...');
  const t0 = Date.now();
  for (let i = 0; i < 400; i++) {
    await new Promise((r) => setTimeout(r, 100));
    if (serverExited) break;
  }

  const elapsedSec = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`Server exited in ${elapsedSec}s with code ${serverExitCode}`);

  if (!serverExited) {
    serverProc.kill();
    throw new Error('Server did not self-terminate within 40s');
  }

  if (serverExitCode !== 0) {
    throw new Error(`Expected exit code 0, got ${serverExitCode}`);
  }

  if (!stdoutLog.includes('self-terminating: source file changed on disk')) {
    throw new Error(`Expected self-termination console message in stdout, got:\n${stdoutLog}`);
  }
  console.log('✓ Observed self-termination console log in stdout');

  // 6. Verify port file is removed or no longer points to targetPort
  const postPortRecord = readPortFile(DASHBOARD_SERVER_PORT_FILE);
  console.log('Post-termination port record:', postPortRecord);
  if (postPortRecord && postPortRecord.port === targetPort) {
    throw new Error('Port file was not removed after self-termination');
  }
  console.log('✓ Port file successfully cleaned up (never points to dead port)');

  console.log('=== R1 Live Self-Termination Verification PASSED ===');
}

runLiveVerification().catch((err) => {
  console.error('VERIFICATION FAILED:', err);
  process.exit(1);
});
