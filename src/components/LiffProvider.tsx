"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";

const LIFF_ID = process.env.NEXT_PUBLIC_LIFF_ID;
const DEV_LINE_USER_ID = process.env.NEXT_PUBLIC_DEV_LINE_USER_ID;

export interface LineProfile {
  userId: string;
  displayName: string;
  pictureUrl?: string;
}

type Status = "loading" | "ready" | "error" | "unconfigured" | "pending";

interface AuthContextValue {
  status: Status;
  error: string | null;
  profile: LineProfile | null;
  ocrEnabled: boolean;
  /** ผู้ดูแลระบบ — เห็นเมนู "สมาชิก" และเข้าหน้า /admin ได้ */
  isAdmin: boolean;
  /** เห็นรายการและสรุปยอดของทุกคน (อ่านอย่างเดียว) */
  canViewAll: boolean;
  api: <T>(path: string, init?: RequestInit) => Promise<T>;
}

/** Error ที่พก code จาก API มาด้วย เพื่อแยกกรณี "รออนุมัติ" ออกจาก error ทั่วไป */
export class ApiError extends Error {
  constructor(message: string, readonly code?: string) {
    super(message);
    this.name = "ApiError";
  }
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth ต้องอยู่ภายใน LiffProvider");
  return context;
}

interface LiffLike {
  init(config: { liffId: string }): Promise<void>;
  isLoggedIn(): boolean;
  login(config?: { redirectUri?: string }): void;
  getIDToken(): string | null;
  getProfile(): Promise<LineProfile>;
}

export function LiffProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<Status>("loading");
  const [error, setError] = useState<string | null>(null);
  const [profile, setProfile] = useState<LineProfile | null>(null);
  const [ocrEnabled, setOcrEnabled] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [canViewAll, setCanViewAll] = useState(false);
  const tokenRef = useRef<string | null>(null);
  const liffRef = useRef<LiffLike | null>(null);

  /** เรียก API พร้อมแนบ LINE ID token ให้อัตโนมัติ */
  const api = useCallback(async <T,>(path: string, init: RequestInit = {}): Promise<T> => {
    const headers = new Headers(init.headers);
    if (DEV_LINE_USER_ID) headers.set("x-dev-line-user-id", DEV_LINE_USER_ID);
    else if (tokenRef.current) headers.set("Authorization", `Bearer ${tokenRef.current}`);
    if (typeof init.body === "string" && !headers.has("Content-Type")) {
      headers.set("Content-Type", "application/json");
    }

    const response = await fetch(path, { ...init, headers });
    const text = await response.text();
    const data = text ? (JSON.parse(text) as Record<string, unknown>) : {};

    if (!response.ok) {
      // token หมดอายุ → ให้ล็อกอินใหม่
      if (response.status === 401 && liffRef.current) {
        liffRef.current.login({ redirectUri: window.location.href });
      }
      throw new ApiError(
        (data.error as string) ?? `เกิดข้อผิดพลาด (${response.status})`,
        data.code as string | undefined,
      );
    }
    return data as T;
  }, []);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        if (!DEV_LINE_USER_ID) {
          if (!LIFF_ID) {
            setStatus("unconfigured");
            return;
          }
          const liff = (await import("@line/liff")).default as unknown as LiffLike;
          liffRef.current = liff;
          await liff.init({ liffId: LIFF_ID });

          if (!liff.isLoggedIn()) {
            liff.login({ redirectUri: window.location.href });
            return;
          }

          const idToken = liff.getIDToken();
          if (!idToken) {
            throw new Error("ไม่ได้รับ ID token — ตรวจว่า LIFF เปิด scope openid ไว้แล้วหรือยัง");
          }
          tokenRef.current = idToken;

          const lineProfile = await liff.getProfile().catch(() => null);
          if (lineProfile && !cancelled) setProfile(lineProfile);
        }

        const me = await api<{
          user: { id: string; displayName: string | null; pictureUrl: string | null };
          ocrEnabled: boolean;
          isAdmin: boolean;
          canViewAll: boolean;
        }>("/api/me");

        if (cancelled) return;
        setOcrEnabled(me.ocrEnabled);
        setIsAdmin(me.isAdmin);
        setCanViewAll(me.canViewAll);
        setProfile((current) =>
          current ?? {
            userId: me.user.id,
            displayName: me.user.displayName ?? "ผู้ใช้",
            pictureUrl: me.user.pictureUrl ?? undefined,
          },
        );
        setStatus("ready");
      } catch (caught) {
        if (cancelled) return;
        const code = caught instanceof ApiError ? caught.code : undefined;
        setError(caught instanceof Error ? caught.message : "เชื่อมต่อไม่สำเร็จ");
        setStatus(code === "pending_approval" || code === "not_allowed" ? "pending" : "error");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [api]);

  if (status === "loading") {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-3 px-6">
        <span
          className="size-[22px] animate-spin rounded-full border-[2.5px]"
          style={{ borderColor: "var(--color-brand-200)", borderTopColor: "var(--color-brand-600)" }}
          aria-hidden
        />
        <p className="muted text-sm">กำลังเข้าสู่ระบบด้วย LINE…</p>
      </div>
    );
  }

  if (status === "unconfigured") {
    return (
      <div className="mx-auto flex min-h-dvh max-w-md items-center px-5">
        <div className="card w-full px-5 py-6" style={{ borderRadius: "1.125rem" }}>
          <h1 className="text-[18px] font-bold">ยังตั้งค่าไม่ครบ</h1>
          <p className="muted mt-2.5 text-[13.5px] leading-relaxed">
            ยังไม่ได้ตั้ง <code>NEXT_PUBLIC_LIFF_ID</code> จึงเข้าสู่ระบบด้วย LINE ไม่ได้
          </p>
          <ol className="muted mt-3.5 list-decimal space-y-1.5 pl-5 text-[13.5px] leading-relaxed">
            <li>สร้าง LINE Login channel ที่ LINE Developers</li>
            <li>เพิ่ม LIFF app ชี้มาที่ URL ของเว็บนี้ เปิด scope openid + profile</li>
            <li>ใส่ LIFF ID ลงใน .env.local แล้ว build ใหม่</li>
          </ol>
        </div>
      </div>
    );
  }

  if (status === "pending") {
    return (
      <div className="mx-auto flex min-h-dvh max-w-md items-center px-5">
        <div className="card w-full px-5 py-6 text-center" style={{ borderRadius: "1.125rem" }}>
          <p className="text-[38px] leading-none">🕒</p>
          <h1 className="mt-3 text-[18px] font-bold">รอผู้ดูแลอนุมัติ</h1>
          <p className="muted mt-2 text-[13.5px] leading-relaxed">
            {profile?.displayName ? `สวัสดีคุณ ${profile.displayName} — ` : ""}
            บัญชี LINE นี้เข้าระบบแล้ว แต่ยังใช้งานไม่ได้จนกว่าผู้ดูแลจะกดอนุมัติ
          </p>
          <p className="muted mt-3 text-[13.5px]">แจ้งผู้ดูแลแล้วกดปุ่มด้านล่างเพื่อเช็คอีกครั้ง</p>
          <button className="btn btn-primary mt-4 w-full" onClick={() => window.location.reload()}>
            เช็คสถานะอีกครั้ง
          </button>
        </div>
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="mx-auto flex min-h-dvh max-w-md items-center px-5">
        <div className="card w-full px-5 py-6" style={{ borderRadius: "1.125rem" }}>
          <h1 className="text-[18px] font-bold">เข้าสู่ระบบไม่สำเร็จ</h1>
          <p className="mt-2.5 text-[13.5px] leading-relaxed" style={{ color: "var(--color-money-in)" }}>
            {error}
          </p>
          <button className="btn btn-primary mt-4 w-full" onClick={() => window.location.reload()}>
            ลองใหม่
          </button>
        </div>
      </div>
    );
  }

  return (
    <AuthContext.Provider value={{ status, error, profile, ocrEnabled, isAdmin, canViewAll, api }}>
      {children}
    </AuthContext.Provider>
  );
}
