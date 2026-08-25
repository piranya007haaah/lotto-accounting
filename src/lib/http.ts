import { NextResponse } from "next/server";

export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly code?: string,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

export function ok<T>(data: T, init?: ResponseInit) {
  return NextResponse.json(data, init);
}

/** แปลง error ทุกชนิดให้เป็น JSON response ที่ฝั่งหน้าเว็บอ่านได้ */
export function fail(error: unknown) {
  if (error instanceof HttpError) {
    return NextResponse.json({ error: error.message, code: error.code }, { status: error.status });
  }
  console.error("[api] unhandled error:", error);
  const message = error instanceof Error ? error.message : "เกิดข้อผิดพลาดที่ไม่รู้จัก";
  return NextResponse.json({ error: message }, { status: 500 });
}

/** ครอบ handler ให้ error กลายเป็น response เสมอ */
export function route<Args extends unknown[]>(
  handler: (request: Request, ...args: Args) => Promise<Response>,
) {
  return async (request: Request, ...args: Args): Promise<Response> => {
    try {
      return await handler(request, ...args);
    } catch (error) {
      return fail(error);
    }
  };
}
