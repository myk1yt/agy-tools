/**
 * Independent review probe for agy-tokens v3.4 (commit f4ae9da).
 * READ-ONLY w.r.t. src/. Verifies, with runtime evidence:
 *  P1: per-turn pricing uses each turn's own model rates (Flash vs Opus), not session model.
 *  P2: edge case - no turn.modelName + no session.modelName + no opts.modelName => 'unknown'.
 *  P3: legacy fixture (turns WITHOUT modelName) falls back to session.modelName chain.
 *  P4: legacy fixture with NO modelName at any level falls back to opts.modelName, then 'unknown'.
 *  P5: session.models ordering + backward-compat modelName from a real multi-switch transcript parse.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const config = require(path.join(ROOT, 'src', 'config.js'));
const logParser = require(path.join(ROOT, 'src', 'log-parser.js'));
const htmlReport = require(path.join(ROOT, 'src', 'html-report.js'));

let failures = 0;
function check(name, cond, detail) {
  const tag = cond ? 'PASS' : 'FAIL';
  if (!cond) failures++;
  console.log(`[${tag}] ${name}${detail ? ' :: ' + detail : ''}`);
}

(async () => {
  // ---------- P1: per-turn pricing correctness ----------
  // Build a real transcript that switches Flash -> Opus mid-session, then
  // compare each turn's costUsd against calculateCostUsd with (a) the turn's
  // own model and (b) the session-level final model. If the parser priced
  // turns with the session model, (a) would mismatch and (b) would match.
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'agy-review-'));
  const transcript = path.join(tmp, 'transcript.jsonl');
  const lines = [
    { step_index: 0, source: 'USER_EXPLICIT', type: 'USER_INPUT', created_at: '2026-08-27T08:00:00Z',
      content: '<USER_SETTINGS_CHANGE>\nchanged setting `Model Selection` from None to Gemini 3.7 Flash (Low)\n</USER_SETTINGS_CHANGE>' },
    { step_index: 1, source: 'MODEL', type: 'PLANNER_RESPONSE', created_at: '2026-08-27T08:00:05Z',
      content: 'Phase 1 done with flash.' },
    { step_index: 2, source: 'USER_EXPLICIT', type: 'USER_INPUT', created_at: '2026-08-27T08:01:00Z',
      content: '<USER_SETTINGS_CHANGE>\nchanged setting `Model Selection` from Gemini 3.7 Flash (Low) to Claude Opus 4.6 (Thinking)\n</USER_SETTINGS_CHANGE>' },
    { step_index: 3, source: 'MODEL', type: 'PLANNER_RESPONSE', created_at: '2026-08-27T08:01:05Z',
      content: 'Phase 2 done with opus.' }
  ];
  fs.writeFileSync(transcript, lines.map(JSON.stringify).join('\n'), 'utf8');
  const session = await logParser.parseTranscriptFile(transcript, 'probe-pricing', { title: 'probe' }, null);

  const sessionModel = session.modelName; // 'Claude Opus 4.6 (Thinking)' (LAST active)
  check('P1.session.modelName is LAST active (Opus)', sessionModel === 'Claude Opus 4.6 (Thinking)', sessionModel);
  check('P1.session.models order [Flash, Opus]',
    JSON.stringify(session.models) === JSON.stringify(['Gemini 3.7 Flash (Low)', 'Claude Opus 4.6 (Thinking)']),
    JSON.stringify(session.models));

  let p1ok = true;
  for (const t of session.turns) {
    const ownRate = config.calculateCostUsd(t.inputTokens, t.cachedTokens, t.outputTokens, t.modelName);
    const sessionRate = config.calculateCostUsd(t.inputTokens, t.cachedTokens, t.outputTokens, sessionModel);
    const matchesOwn = Math.abs(t.costUsd - ownRate) < 1e-12;
    // For Flash turns, the session-level (Opus) rate differs; ensure the turn
    // was NOT priced with the session model.
    const wouldMatchSession = Math.abs(t.costUsd - sessionRate) < 1e-12;
    if (!matchesOwn) p1ok = false;
    console.log(`    turn[${t.stepIndex}] model=${t.modelName} cost=${t.costUsd} own=${ownRate} sessionModelRate=${sessionRate} matchesOwn=${matchesOwn} equalsSessionRate=${wouldMatchSession}`);
    if (t.modelName !== sessionModel && wouldMatchSession) p1ok = false; // smoking gun: priced with session model
  }
  check('P1.every turn priced with its OWN model rates', p1ok);

  // Sum consistency
  const sumTurns = session.turns.reduce((a, t) => a + t.costUsd, 0);
  check('P1.session.costUsd == sum(turn.costUsd)', Math.abs(session.costUsd - sumTurns) < 1e-9,
    `session=${session.costUsd} sum=${sumTurns}`);

  // ---------- P2: 'unknown' edge case ----------
  // No turn.modelName, no session.modelName, no opts.modelName.
  const payloadUnknown = htmlReport.buildDashboardPayload([
    { sessionId: 'edge-1', turns: [ { createdAt: new Date().toISOString(), inputTokens: 10, cachedTokens: 0, outputTokens: 5 } ] }
  ], { currency: 'usd', lang: 'en' /* no modelName */ });
  const unknownRow = payloadUnknown.models.find(m => m.model === 'unknown');
  check('P2.models[] contains exactly one row keyed "unknown"', payloadUnknown.models.length === 1 && !!unknownRow,
    JSON.stringify(payloadUnknown.models.map(m => m.model)));
  check('P2.unknown row has sane aggregates (turns=1, cost is number)',
    !!unknownRow && unknownRow.turns === 1 && typeof unknownRow.costUsd === 'number' && !Number.isNaN(unknownRow.costUsd),
    unknownRow ? `turns=${unknownRow.turns} cost=${unknownRow.costUsd}` : 'no row');
  check('P2.no crash / payload version intact', payloadUnknown.version === 3);

  // ---------- P3: legacy fixture fallback to session.modelName ----------
  const legacy = htmlReport.buildDashboardPayload([
    { sessionId: 'legacy-1', modelName: 'Gemini 3.7 Flash (High)',
      turns: [
        { createdAt: new Date().toISOString(), inputTokens: 100, cachedTokens: 50, outputTokens: 20 },
        { createdAt: new Date().toISOString(), inputTokens: 200, cachedTokens: 100, outputTokens: 40 }
      ] }
  ], { currency: 'usd', lang: 'en' });
  const legacyRow = legacy.models.find(m => m.model === 'Gemini 3.7 Flash (High)');
  check('P3.turns without modelName attribute to session.modelName',
    legacy.models.length === 1 && !!legacyRow && legacyRow.turns === 2 && legacyRow.sessions === 1,
    JSON.stringify(legacy.models.map(m => ({ model: m.model, turns: m.turns, sessions: m.sessions }))));

  // ---------- P4: fallback to opts.modelName ----------
  const viaOpts = htmlReport.buildDashboardPayload([
    { sessionId: 'legacy-2', turns: [ { createdAt: new Date().toISOString(), inputTokens: 5, cachedTokens: 0, outputTokens: 5 } ] }
  ], { currency: 'usd', lang: 'en', modelName: 'Gemini 2.5 Pro (Low)' });
  check('P4.no session.modelName + no turn.modelName falls back to opts.modelName',
    viaOpts.models.length === 1 && viaOpts.models[0].model === 'Gemini 2.5 Pro (Low)',
    JSON.stringify(viaOpts.models.map(m => m.model)));

  // ---------- P5: mixed-model session-count semantics ----------
  // One session, turns across two models => both models get sessions===1,
  // cacheStats.totalSessions stays 1.
  const mixed = htmlReport.buildDashboardPayload([
    { sessionId: 'mix-1', modelName: 'Claude Opus 4.6 (Thinking)',
      turns: [
        { createdAt: new Date().toISOString(), modelName: 'Gemini 3.7 Flash (High)', inputTokens: 1, cachedTokens: 0, outputTokens: 1, costUsd: 0.000001 },
        { createdAt: new Date().toISOString(), modelName: 'Claude Opus 4.6 (Thinking)', inputTokens: 1, cachedTokens: 0, outputTokens: 1, costUsd: 0.000002 }
      ] }
  ], { currency: 'usd', lang: 'en' });
  const g = mixed.models.find(m => m.model === 'Gemini 3.7 Flash (High)');
  const c = mixed.models.find(m => m.model === 'Claude Opus 4.6 (Thinking)');
  check('P5.mixed session => 2 model rows, each sessions===1, totalSessions===1',
    mixed.models.length === 2 && g.sessions === 1 && c.sessions === 1 && mixed.cacheStats.totalSessions === 1,
    `rows=${mixed.models.length} g.sessions=${g && g.sessions} c.sessions=${c && c.sessions} total=${mixed.cacheStats.totalSessions}`);

  // cleanup
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (_e) {}

  console.log(failures === 0 ? '\nALL PROBES PASS' : `\n${failures} PROBE(S) FAILED`);
  process.exit(failures === 0 ? 0 : 1);
})().catch(e => { console.error('PROBE ERROR', e); process.exit(2); });
