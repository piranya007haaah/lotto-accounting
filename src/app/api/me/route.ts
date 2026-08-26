import { requireUser } from "@/lib/auth";
import { APP_TIMEZONE, isOcrConfigured } from "@/lib/env";
import { ok, route } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = route(async (request) => {
  const user = await requireUser(request);
  return ok({
    user: {
      id: user.id,
      displayName: user.displayName,
      pictureUrl: user.pictureUrl,
    },
    isAdmin: user.isAdmin,
    canViewAll: user.canViewAll,
    ocrEnabled: isOcrConfigured(),
    timeZone: APP_TIMEZONE,
  });
});
