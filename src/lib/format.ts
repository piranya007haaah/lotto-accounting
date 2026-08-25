const bahtFormatter = new Intl.NumberFormat("th-TH", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const compactFormatter = new Intl.NumberFormat("th-TH", {
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

/** 1500 → "1,500.00" */
export function formatBaht(value: number): string {
  return bahtFormatter.format(value ?? 0);
}

/** 1500 → "1,500" (ตัด .00 ทิ้งถ้าเป็นจำนวนเต็ม) */
export function formatBahtShort(value: number): string {
  return compactFormatter.format(value ?? 0);
}

/** ใส่เครื่องหมายให้ยอดสุทธิ */
export function formatSigned(value: number): string {
  const sign = value > 0 ? "+" : value < 0 ? "-" : "";
  return `${sign}${formatBahtShort(Math.abs(value))}`;
}

export function parseAmountInput(input: string): number | null {
  const cleaned = input.replace(/[,\s฿]/g, "").trim();
  if (!cleaned) return null;
  const value = Number(cleaned);
  if (!Number.isFinite(value) || value <= 0) return null;
  return Math.round(value * 100) / 100;
}
