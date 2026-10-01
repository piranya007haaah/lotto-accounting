/** Regression checks for numeric accuracy, XLSX types, pagination and export authorization. */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const ts = require("typescript");
const ExcelJS = require("exceljs");

function loadTs(filename, mocks = {}) {
  const resolved = path.resolve(filename);
  const loaded = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(resolved, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText;
  // Run in the same realm as ExcelJS: its row API uses instanceof Array.
  new Function("module", "exports", "require", code)(loaded, loaded.exports,
    (name) => {
      if (name in mocks) return mocks[name];
      if (name.startsWith(".")) return loadTs(path.resolve(path.dirname(resolved), `${name}.ts`), mocks);
      return require(name);
    },
  );
  return loaded.exports;
}

const statistics = loadTs("src/lib/lottery/statistics.ts");
const writer = loadTs("src/lib/lottery/statistics-xlsx.ts");
const entry = (lottery, position, year, sequence, digits = 2) => ({ lottery, position, year, sequence, digits });
const entries = [
  entry("ฮานอย", "สองบน", "68", "00--010099x"),
  entry("ฮานอย", "สองบน", "69", "0102xx00"),
  entry("ฮานอย", "สองล่าง", "69", "9900"),
  entry("ลาว", "สองบน", "69", "020299"),
  entry("วันหยุด", "สองบน", "69", "----"),
  entry("ไม่ครบ", "สองบน", "68", "9"),
  entry("ไม่ครบ", "สองบน", "69", "8"),
  entry("ฮานอย", "สองบน", "69", "111222", 3),
];
const groups = [
  { lottery: "ฮานอย", position: "สองบน" },
  { lottery: "ฮานอย", position: "สองล่าง" },
  { lottery: "ลาว", position: "สองบน" },
  { lottery: "วันหยุด", position: "สองบน" },
  { lottery: "ไม่มีข้อมูล", position: "สองบน" },
  { lottery: "ไม่ครบ", position: "สองบน" },
];

async function main() {
  const result = statistics.buildStatistics(entries, { groups: [...groups, groups[0]], years: ["69", "68", "69"] });
  assert.equal(result.length, 6, "duplicate selections must not double count");
  const top = result[0];
  assert.equal(top.draws, 7);
  assert.equal(top.numbers.length, 100, "export includes numbers never drawn");
  assert.equal(top.numbers[0].number, "00");
  assert.equal(top.numbers[0].count, 3);
  assert.equal(top.numbers[0].share, 3 / 7);
  assert.equal(top.numbers[1].number, "01");
  assert.equal(top.numbers[1].count, 2);
  assert.equal(result[1].draws, 2, "positions remain separate");
  assert.equal(result[2].draws, 3, "lotteries remain separate");
  assert.equal(result[3].status, "ไม่มีงวดจริง");
  assert.equal(result[3].numbers[0].count, 0);
  assert.equal(result[3].numbers[0].share, null, "zero draws have no percentage denominator");
  assert.equal(result[4].status, "ไม่มีข้อมูลในปีที่เลือก");
  assert.equal(result[4].numbers.length, 0, "missing data must not become a zero distribution");
  assert.equal(result[5].draws, 0, "partial slots must not combine across years");
  for (const group of result) {
    if (!group.numbers.length) continue;
    assert.equal(group.numbers.reduce((sum, row) => sum + row.count, 0), group.draws);
    for (const place of group.digits) {
      assert.equal(place.frequencies.length, 10);
      assert.equal(place.frequencies.reduce((sum, row) => sum + row.count, 0), group.draws);
    }
  }
  const latest = statistics.buildStatistics(entries, { groups: [groups[0]], years: ["69"] });
  assert.equal(latest[0].draws, 3, "year filter excludes 68 and all three-digit rows");

  const bytes = await writer.statisticsWorkbook(result, new Date("2026-10-01T00:00:00Z"));
  assert.equal(bytes.subarray(0, 2).toString(), "PK", "real XLSX ZIP, not renamed CSV");
  const reopened = new ExcelJS.Workbook();
  await reopened.xlsx.load(bytes);
  assert.deepEqual(reopened.worksheets.map((sheet) => sheet.name), ["สรุป", "ความถี่เลข", "ความถี่รายหลัก"]);
  const summary = reopened.getWorksheet("สรุป");
  assert.equal(summary.getCell("E6").value, 7);
  assert.equal(summary.getCell("D6").value, "2568, 2569");
  assert.equal(summary.getCell("E10").value, null, "missing dataset stays blank");
  assert.equal(summary.getCell("F10").value, "ไม่มีข้อมูลในปีที่เลือก");
  const frequency = reopened.getWorksheet("ความถี่เลข");
  assert.equal(frequency.rowCount, 505);
  assert.equal(frequency.getCell("E6").value, "00");
  assert.equal(frequency.getCell("E7").value, "01");
  assert.equal(frequency.getCell("E6").type, ExcelJS.ValueType.String);
  assert.equal(frequency.getCell("F6").value, 3);
  assert.equal(frequency.getCell("G6").value, 3 / 7);
  assert.equal(frequency.getCell("G6").numFmt, "0.00%");
  assert.equal(frequency.views[0].ySplit, 5);
  assert.ok(frequency.autoFilter);
  if (process.argv[2]) fs.writeFileSync(process.argv[2], bytes);

  // The reader must paginate past 1,000 source rows, preserving the digits filter on every page.
  const pages = [];
  const manyRows = Array.from({ length: 2005 }, (_, i) => ({ ...entries[0], lottery: `หวย ${i}` }));
  const reader = loadTs("src/lib/lottery/dataset-read.ts", {
    "@/lib/http": loadTs("src/lib/http.ts"),
    "@/lib/supabase": { supabaseAdmin: () => ({ from() {
      const query = {
        select() { return this; }, order() { return this; },
        range(start, end) { pages.push([start, end]); this.start = start; this.end = end; return this; },
        eq(column, value) { assert.equal(column, "digits"); assert.equal(value, 2); return this; },
        then(resolve) { resolve({ data: manyRows.slice(this.start, this.end + 1), error: null }); },
      };
      return query;
    } }) },
  });
  assert.equal((await reader.readAllDatasetRows({ digits: 2 })).length, 2005);
  assert.deepEqual(pages, [[0, 999], [1000, 1999], [2000, 2999]]);

  const http = loadTs("src/lib/http.ts");
  let authError = null;
  let reads = 0;
  const route = loadTs("src/app/api/lottery/statistics-export/route.ts", {
    "@/lib/auth": { requireLotteryViewer: async () => { if (authError) throw authError; return { isAdmin: false, canViewLottery: true }; } },
    "@/lib/http": http,
    "@/lib/ingest-auth": { readJsonBody: async (request) => { try { return JSON.parse(await request.text()); } catch { throw new http.HttpError(400, "bad JSON"); } } },
    "@/lib/lottery/dataset-read": { readAllDatasetRows: async (options) => { assert.equal(options.digits, 2); reads++; return entries; } },
    "@/lib/lottery/statistics": statistics,
    "@/lib/lottery/statistics-xlsx": writer,
  });
  const request = (payload) => new Request("https://test/api/lottery/statistics-export", { method: "POST", body: JSON.stringify(payload) });
  const selection = { groups: [groups[0], groups[1]], years: ["69"] };
  for (const [status, code] of [[401, "no_token"], [403, "not_lottery_viewer"], [403, "pending_approval"]]) {
    authError = new http.HttpError(status, code, code);
    const before = reads;
    const response = await route.POST(request(selection));
    assert.equal(response.status, status);
    assert.equal(reads, before, "unauthorized request must not read data");
  }
  authError = null;
  for (const invalid of [{ groups: [], years: ["69"] }, { groups: [groups[0]], years: [] }, { groups: [groups[0]], years: ["2026"] }, { groups: [{ lottery: "ฮานอย", position: "สามบน" }], years: ["69"] }]) {
    const before = reads;
    assert.equal((await route.POST(request(invalid))).status, 400);
    assert.equal(reads, before);
  }
  assert.equal((await route.POST(new Request("https://test/api", { method: "POST", body: "{" }))).status, 400);
  assert.equal((await route.POST(request({ groups: [groups[3]], years: ["69"] }))).status, 404);
  const response = await route.POST(request(selection));
  assert.equal(response.status, 200, "approved non-admin viewers can export");
  assert.equal(response.headers.get("cache-control"), "no-store");
  const payload = await response.json();
  assert.match(payload.filename, /^lottery-statistics-\d{4}-\d{2}-\d{2}\.xlsx$/);
  assert.equal(payload.groups, 2);
  assert.equal(payload.draws, 5);
  const downloaded = new ExcelJS.Workbook();
  await downloaded.xlsx.load(Buffer.from(payload.base64, "base64"));
  assert.equal(downloaded.getWorksheet("สรุป").getCell("E6").value, 3);
  assert.equal(downloaded.getWorksheet("สรุป").getCell("E7").value, 2);
  console.log("PASS: multi-lottery/position/year counts, holidays, leading zeros, missing data, real XLSX roundtrip, 2,005-row pagination, viewer authorization and export response.");
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
