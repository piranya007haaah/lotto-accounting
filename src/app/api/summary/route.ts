import { requireUser } from "@/lib/auth";
import { ok, route } from "@/lib/http";
import { resolveRange } from "@/lib/range";
import { getSummary } from "@/lib/summary";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = route(async (request) => {
  const user = await requireUser(request);
  const params = new URL(request.url).searchParams;
  const { from, to, label, kind } = resolveRange(params);

  const summary = await getSummary({
    ownerId: user.id,
    includeAllOwners: user.canViewAll,
    from,
    to,
    siteId: params.get("siteId"),
  });

  return ok({ label, kind, scope: user.canViewAll ? "all" : "own", ...summary });
});
