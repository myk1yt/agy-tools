const fs = require('fs');
const http = require('http');
const config = require('../src/config');
const serve = require('../src/serve');
const htmlReport = require('../src/html-report');
const { spawnSync } = require('child_process');

async function run() {
  console.log('=== Step 1: Statusline Hook with Default Locale (ko-KR) ===');
  const hookRes = spawnSync(process.execPath, ['bin/agy-tokens.js', '--hook', '--raw', '--write-dashboard'], {
    encoding: 'utf8',
    env: { ...process.env, AGY_LANG: '' }
  });
  console.log('Hook output:', hookRes.stdout.trim());

  const html = fs.readFileSync(config.DASHBOARD_HTML_FILE, 'utf8');
  const langMatch = html.match(/<html lang="([^"]+)"/);
  const titleMatch = html.match(/<title>([^<]+)<\/title>/);
  console.log('HTML lang:', langMatch ? langMatch[1] : null);
  console.log('HTML title:', titleMatch ? titleMatch[1] : null);

  const dataJson = JSON.parse(fs.readFileSync(config.DASHBOARD_DATA_JSON, 'utf8'));
  console.log('data.json lang:', dataJson.lang);
  console.log('data.json modelsTitle:', dataJson.i18n ? dataJson.i18n.modelsTitle : null);
  console.log('data.json dashboardTitle:', dataJson.i18n ? dataJson.i18n.dashboardTitle : null);

  console.log('\n=== Step 2: Live Server /data.json Endpoint ===');
  const serverInfo = await serve.startDashboardServer({ port: 0, lang: 'ko' });
  const serverPort = serverInfo.port;
  console.log('Started ephemeral server on port:', serverPort);

  await new Promise((resolve, reject) => {
    http.get(`http://127.0.0.1:${serverPort}/data.json`, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        const payload = JSON.parse(data);
        console.log('Live /data.json status:', res.statusCode);
        console.log('Live /data.json lang:', payload.lang);
        console.log('Live /data.json modelsTitle:', payload.i18n ? payload.i18n.modelsTitle : null);
        console.log('Live /data.json dashboardTitle:', payload.i18n ? payload.i18n.dashboardTitle : null);
        resolve();
      });
    }).on('error', reject);
  });

  await serve.stopDashboardServer(serverInfo.server);

  console.log('\n=== Step 3: Changing Locale to Japanese (AGY_LANG=ja) ===');
  const jaRes = spawnSync(process.execPath, ['bin/agy-tokens.js', '--hook', '--raw', '--write-dashboard'], {
    encoding: 'utf8',
    env: { ...process.env, AGY_LANG: 'ja' }
  });
  console.log('JA Hook output:', jaRes.stdout.trim());

  const jaHtml = fs.readFileSync(config.DASHBOARD_HTML_FILE, 'utf8');
  const jaLangMatch = jaHtml.match(/<html lang="([^"]+)"/);
  const jaTitleMatch = jaHtml.match(/<title>([^<]+)<\/title>/);
  console.log('JA HTML lang:', jaLangMatch ? jaLangMatch[1] : null);
  console.log('JA HTML title:', jaTitleMatch ? jaTitleMatch[1] : null);

  const jaJson = JSON.parse(fs.readFileSync(config.DASHBOARD_DATA_JSON, 'utf8'));
  console.log('JA data.json lang:', jaJson.lang);
  console.log('JA data.json modelsTitle:', jaJson.i18n ? jaJson.i18n.modelsTitle : null);

  console.log('\n=== Step 4: Restoring Default Locale (ko-KR) ===');
  const restoreRes = spawnSync(process.execPath, ['bin/agy-tokens.js', '--hook', '--raw', '--write-dashboard'], {
    encoding: 'utf8',
    env: { ...process.env, AGY_LANG: '' }
  });
  const restoredHtml = fs.readFileSync(config.DASHBOARD_HTML_FILE, 'utf8');
  const restoredJson = JSON.parse(fs.readFileSync(config.DASHBOARD_DATA_JSON, 'utf8'));
  console.log('Restored HTML lang:', restoredHtml.match(/<html lang="([^"]+)"/)?.[1]);
  console.log('Restored JSON lang:', restoredJson.lang);
  console.log('Restored modelsTitle:', restoredJson.i18n?.modelsTitle);
  console.log('\nAll verification steps completed successfully.');
}

run().catch(err => {
  console.error('Verification failed:', err);
  process.exit(1);
});
