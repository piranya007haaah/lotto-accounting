import ExcelJS from "exceljs";
import type { GroupStatistics } from "./statistics";

const ACCENT = "FF193D57";
const yearLabel = (years: readonly string[]) => years.map((year) => `25${year}`).join(", ");

/** Server-only XLSX writer; number codes are text so Excel preserves 00 and 01. */
export async function statisticsWorkbook(
  groups: readonly GroupStatistics[],
  createdAt = new Date(),
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Lotto Accounting";
  workbook.created = createdAt;
  workbook.modified = createdAt;
  const stamp = createdAt.toLocaleString("th-TH", { timeZone: "Asia/Bangkok" });

  function sheet(name: string, title: string, headers: string[], widths: number[]) {
    const ws = workbook.addWorksheet(name, {
      views: [{ state: "frozen", ySplit: 5, xSplit: 2 }],
      pageSetup: { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
    });
    ws.columns = widths.map((width) => ({ width }));
    ws.mergeCells(1, 1, 1, headers.length);
    ws.getCell("A1").value = title;
    ws.getCell("A1").font = { name: "Tahoma", size: 16, bold: true, color: { argb: ACCENT } };
    ws.getRow(1).height = 30;
    ws.mergeCells(2, 1, 2, headers.length);
    ws.getCell("A2").value = `Lotto Accounting · สถิติ 2 ตัว · ${groups.length} กลุ่ม · สร้าง ${stamp}`;
    ws.mergeCells(3, 1, 3, headers.length);
    ws.getCell("A3").value = "นับเฉพาะงวดที่มีผลจริงในปีที่เลือก · สัดส่วน = จำนวนครั้ง ÷ งวดจริงของหวยและตำแหน่งนั้น";
    ws.getCell("A3").alignment = { wrapText: true, vertical: "middle" };
    ws.getRow(3).height = 30;
    const header = ws.getRow(5);
    header.values = headers;
    header.height = 25;
    header.eachCell((cell) => {
      cell.font = { name: "Tahoma", bold: true, color: { argb: "FFFFFFFF" } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: ACCENT } };
      cell.alignment = { vertical: "middle", wrapText: true };
    });
    ws.pageSetup.printTitlesRow = "1:5";
    return ws;
  }

  const summary = sheet("สรุป", "สรุปสถิติหวยที่เลือก", [
    "หวย", "ตำแหน่ง", "ปีที่เลือก (พ.ศ.)", "ปีที่มีข้อมูล (พ.ศ.)", "งวดจริง", "สถานะ",
  ], [32, 14, 36, 36, 14, 28]);
  const numbers = sheet("ความถี่เลข", "ความถี่เลข 00–99", [
    "หวย", "ตำแหน่ง", "ปีที่มีข้อมูล (พ.ศ.)", "ลำดับ", "เลข", "จำนวนครั้ง", "สัดส่วน", "งวดจริง",
  ], [32, 14, 36, 12, 12, 15, 15, 14]);
  const digits = sheet("ความถี่รายหลัก", "ความถี่หลักสิบและหลักหน่วย", [
    "หวย", "ตำแหน่ง", "ปีที่มีข้อมูล (พ.ศ.)", "หลัก", "เลข", "จำนวนครั้ง", "สัดส่วน", "งวดจริง",
  ], [32, 14, 36, 16, 12, 15, 15, 14]);
  for (const group of groups) {
    const years = yearLabel(group.availableYears);
    summary.addRow([
      group.lottery, group.position, yearLabel(group.selectedYears), years || null,
      group.availableYears.length ? group.draws : null, group.status,
    ]);
    group.numbers.forEach((item, index) => numbers.addRow([
      group.lottery, group.position, years, index + 1, item.number,
      item.count, item.share, group.draws,
    ]));
    for (const digit of group.digits) {
      for (const item of digit.frequencies) digits.addRow([
        group.lottery, group.position, years, digit.place, item.number,
        item.count, item.share, group.draws,
      ]);
    }
  }

  for (const ws of [summary, numbers, digits]) {
    ws.autoFilter = { from: { row: 5, column: 1 }, to: { row: ws.rowCount, column: ws.columnCount } };
    ws.eachRow((row, rowNumber) => {
      if (rowNumber <= 5) return;
      row.height = 22;
      row.eachCell((cell) => {
        cell.font = { name: "Tahoma", size: 11 };
        cell.alignment = { vertical: "middle", horizontal: typeof cell.value === "number" ? "right" : "left" };
        if (rowNumber % 2 === 0) cell.fill = {
          type: "pattern", pattern: "solid", fgColor: { argb: "FFF2F6F8" },
        };
      });
    });
  }
  summary.getColumn(5).numFmt = "#,##0";
  for (const ws of [numbers, digits]) {
    ws.getColumn(5).numFmt = "@";
    ws.getColumn(6).numFmt = "#,##0";
    ws.getColumn(7).numFmt = "0.00%";
    ws.getColumn(8).numFmt = "#,##0";
  }
  return Buffer.from(await workbook.xlsx.writeBuffer());
}
