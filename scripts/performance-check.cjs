// Regression checks for auth reads and bounded gateway retries. No real database or LINE calls.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
let checks = 0;
function load(file, mocks = {}, globals = {}) {
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(code, { module, exports: module.exports,
    require(name) { if (!(name in mocks)) throw Error(`Unexpected import: ${name}`); return mocks[name]; },
    Request, Response, URL, AbortSignal, DOMException, Date, Map, console, ...globals,
  }, { filename: file });
  return module.exports;
}
class HttpError extends Error {
  constructor(status, message, code) { super(message); this.status = status; this.code = code; }
}
const profile = { lineUserId: 'test-user', displayName: 'Tester', pictureUrl: null };
const user = { id: 'user-id', line_user_id: 'test-user', display_name: 'Tester', picture_url: null,
  is_active: true, can_view_all: false, can_view_lottery: true, last_seen_at: new Date().toISOString() };
function authFixture(results, admin = false) {
  const calls = [];
  const auth = load('src/lib/auth.ts', {
    './env': { allowedLineUserIds: () => null, isAdminLineUserId: () => admin, isDevAuthBypassEnabled: () => true },
    './http': { HttpError },
    './supabase': {
      isMissingColumnError: (e, column) => e?.code === '42703' && e.message.includes(column),
      supabaseAdmin: () => ({ from() {
        const call = {}; calls.push(call);
        const query = {
          select(columns) { call.columns = columns; return query; },
          eq() { return query; },
          upsert(payload) { call.write = payload; return query; },
          maybeSingle: finish, single: finish,
        };
        function finish() { assert.ok(results.length, 'Unexpected database request'); return Promise.resolve(results.shift()); }
        return query;
      } }),
    },
  });
  return { auth, calls };
}
(async () => {
  let f = authFixture([{ data: user, error: null }]);
  assert.equal((await f.auth.getOrCreateUser(profile)).canViewLottery, true);
  assert.equal(f.calls.length, 1); assert.ok(!f.calls[0].write); checks++;

  f = authFixture([{ data: { ...user, is_active: false }, error: null }]);
  await assert.rejects(f.auth.getOrCreateUser(profile), e => e.status === 403);
  assert.equal(f.calls.length, 1); checks++;

  f = authFixture([{ data: { ...user, display_name: 'dev:test-user', can_view_lottery: false }, error: null }]);
  await assert.rejects(f.auth.requireLotteryViewer(new Request('https://test/api', { headers: { 'x-dev-line-user-id': 'test-user' } })), e => e.code === 'not_lottery_viewer');
  assert.equal(f.calls.length, 1); checks++;

  f = authFixture([{ data: null, error: null }, { data: { ...user, is_active: false }, error: null }]);
  await assert.rejects(f.auth.getOrCreateUser(profile), e => e.status === 403);
  assert.ok(!('is_active' in f.calls[1].write)); checks++;

  f = authFixture([{ data: { ...user, is_active: false }, error: null }, { data: user, error: null }], true);
  assert.equal((await f.auth.getOrCreateUser(profile)).isAdmin, true);
  assert.equal(f.calls[1].write.is_active, true); checks++;

  f = authFixture([{ data: { ...user, last_seen_at: '2020-01-01' }, error: null }, { data: user, error: null }]);
  await f.auth.getOrCreateUser(profile); assert.ok(f.calls[1].write.last_seen_at); checks++;

  f = authFixture([{ data: null, error: { code: '42703', message: 'column can_view_lottery missing' } }, { data: { ...user, can_view_lottery: undefined }, error: null }]);
  assert.equal((await f.auth.getOrCreateUser(profile)).canViewLottery, false);
  assert.equal(f.calls.length, 2); assert.ok(!f.calls[1].write); checks++;

  // Failed reads must not create users or silently authorize them.
  f = authFixture([{ data: null, error: { message: 'Gateway Timeout' } }]);
  await assert.rejects(f.auth.getOrCreateUser(profile), e => e.status === 500);
  assert.equal(f.calls.length, 1); checks++;

  const endpoint = 'https://database.example/rest/v1/lottery_datasets';
  async function fetchCase(method, statuses, expectedCalls, expectedStatus) {
    let calls = 0;
    const { databaseFetch } = load('src/lib/database-fetch.ts', {}, { fetch: async () => {
      const status = statuses[calls++]; assert.ok(status, 'Unbounded retry');
      return new Response(status === 200 ? '[]' : 'Gateway Timeout', { status });
    } });
    assert.equal((await databaseFetch(endpoint, { method })).status, expectedStatus);
    assert.equal(calls, expectedCalls); checks++;
  }
  await fetchCase('GET', [504, 200], 2, 200);
  await fetchCase('GET', [502, 200], 2, 200);
  await fetchCase('HEAD', [504, 504], 2, 504);
  await fetchCase('GET', [503], 1, 503); // SDK handles its own existing retry statuses.
  await fetchCase('GET', [401], 1, 401);
  for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) await fetchCase(method, [504], 1, 504);

  let calls = 0;
  const controller = new AbortController(); controller.abort();
  const { databaseFetch } = load('src/lib/database-fetch.ts', {}, { fetch: async (_, init) => {
    calls++; init.signal.throwIfAborted();
  } });
  await assert.rejects(databaseFetch(endpoint, { signal: controller.signal }));
  assert.equal(calls, 1); checks++;

  // Fast synthetic deadline proves only two attempts, without sleeping for 16 seconds.
  calls = 0;
  const timed = load('src/lib/database-fetch.ts', {}, {
    AbortSignal: { timeout: () => AbortSignal.abort(), any: AbortSignal.any.bind(AbortSignal) },
    fetch: async (_, init) => { calls++; init.signal.throwIfAborted(); },
  });
  await assert.rejects(timed.databaseFetch(endpoint), e => e.name === 'AbortError');
  assert.equal(calls, 2); checks++;
  console.log(`PASS: ${checks} performance/auth/retry regression scenarios`);
})().catch(e => { console.error(e); process.exitCode = 1; });
