import { z } from "zod";
import { requireLotteryViewer } from "@/lib/auth";
import { HttpError, ok, route } from "@/lib/http";
import { readJsonBody } from "@/lib/ingest-auth";
import { readAllDatasetRows } from "@/lib/lottery/dataset-read";
import { buildStatistics } from "@/lib/lottery/statistics";
import { statisticsWorkbook } from "@/lib/lottery/statistics-xlsx";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const selectionSchema = z.object({
  groups: z.array(z.object({
    lottery: z.string().trim().min(1).max(200),
    position: z.enum(["สองบน", "สองล่าง"]),
  })).min(1).max(500),
  years: z.array(z.string().regex(/^\d{2}$/)).min(1).max(100),
});

/** Read-only export with the same lottery-viewer authorization as the analysis page. */
export const POST = route(async (request) => {
  await requireLotteryViewer(request);
  const parsed = selectionSchema.safeParse(await readJsonBody(request, 128 * 1024));
  if (!parsed.success) throw new HttpError(400, "กรุณาเลือกหวย ตำแหน่ง และปีข้อมูลให้ครบ", "bad_selection");

  // Use the shared paginated reader: Supabase otherwise truncates the dataset at 1,000 rows.
  const entries = await readAllDatasetRows({ digits: 2 });
  const groups = buildStatistics(entries, parsed.data);
  if (!groups.some((group) => group.draws > 0)) {
    throw new HttpError(404, "ไม่มีงวดจริงของหวยและปีที่เลือก กรุณาเปลี่ยนช่วงข้อมูล", "no_draws");
  }
  const createdAt = new Date();
  const buffer = await statisticsWorkbook(groups, createdAt);
  const date = createdAt.toLocaleDateString("sv-SE", { timeZone: "Asia/Bangkok" });
  return ok({
    filename: `lottery-statistics-${date}.xlsx`,
    base64: buffer.toString("base64"),
    groups: groups.length,
    draws: groups.reduce((sum, group) => sum + group.draws, 0),
    emptyGroups: groups.filter((group) => group.draws === 0).length,
  }, { headers: { "Cache-Control": "no-store" } });
});
