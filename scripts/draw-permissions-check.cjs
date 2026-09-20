// Exercise POST authorization without database writes or LINE sends.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
class HttpError extends Error {
  constructor(status, message, code) { super(message); this.status = status; this.code = code; }
}
const reachedData = new Error('authorized: reached portfolio read');
let user, authError, reads = 0;
const mocks = {
  '@/lib/auth': { requireLotteryViewer: async () => { if (authError) throw authError; return user; } },
  '@/lib/http': { HttpError, route: fn => fn },
  '@/lib/ingest-auth': { readJsonBody: request => request.json() },
  '@/lib/supabase': { supabaseAdmin: () => { reads++; throw reachedData; } },
};
for (const name of ['env', 'line', 'lottery/dataset-read', 'lottery/day-result', 'lottery/line-card', 'lottery/portfolio-engine', 'lottery/sequence-merge']) mocks[`@/lib/${name}`] = {};
const code = ts.transpileModule(fs.readFileSync('src/app/api/lottery/draws/route.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const loaded = { exports: {} };
vm.runInNewContext(code, { module: loaded, exports: loaded.exports, Date, Request, Response,
  require(name) { assert.ok(name in mocks, name); return mocks[name]; },
});
const request = body => new Request('https://test/api/lottery/draws', { method: 'POST', body: JSON.stringify({ date: '2026-09-20', ...body }) });
(async () => {
  for (const isAdmin of [false, true]) {
    user = { isAdmin, canViewLottery: true }; authError = null;
    await assert.rejects(loaded.exports.POST(request({})), e => e === reachedData);
    await assert.rejects(loaded.exports.POST(request({ overwrite: true })), e => e === reachedData);
  }
  user = { isAdmin: false, canViewLottery: true };
  let before = reads;
  await assert.rejects(loaded.exports.POST(request({ test: true })), e => e.status === 403 && e.code === 'not_admin');
  assert.equal(reads, before);
  user = { isAdmin: true, canViewLottery: true };
  await assert.rejects(loaded.exports.POST(request({ test: true })), e => e === reachedData);
  for (const [status, code] of [[401, 'no_token'], [403, 'not_lottery_viewer'], [403, 'pending_approval']]) {
    authError = new HttpError(status, code, code); before = reads;
    await assert.rejects(loaded.exports.POST(request({})), e => e === authError);
    assert.equal(reads, before);
  }
  console.log('PASS: member/admin entry and corrections; admin-only test send; unauthorized requests blocked before data access (9 cases).');
})().catch(e => { console.error(e); process.exitCode = 1; });
