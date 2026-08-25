"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";

const LIFF_ID = process.env.NEXT_PUBLIC_LIFF_ID;
const DEV_LINE_USER_ID = process.env.NEXT_PUBLIC_DEV_LINE_USER_ID;

export interface LineProfile {
  userId: string;
  displayName: string;
  pictureUrl?: string;
}

type Status = "loading" | "ready" | "error" | "unconfigured";

interface AuthContextValue {
  status: Status;
  error: string | null;
  profile: LineProfile | null;
  ocrEnabled: boolean;
  api: <T>(path: string, init?: RequestInit) => Promise<T>;
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
      throw new Error((data.error as string) ?? `เกิดข้อผิดพลาด (${response.status})`);
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
        }>("/api/me");

        if (cancelled) return;
        setOcrEnabled(me.ocrEnabled);
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
        setError(caught instanceof Error ? caught.message : "เชื่อมต่อไม่สำเร็จ");
        setStatus("error");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [api]);

  if (status === "loading") {
    return (
      <div className="flex min-h-dvh items-center justify-center px-6">
        <p className="muted text-sm">กำลังเข้าสู่ระบบด้วย LINE…</p>
      </div>
    );
  }

  if (status === "unconfigured") {
    return (
      <div className="mx-auto flex min-h-dvh max-w-md items-center px-4">
        <div className="card w-full p-5">
          <h1 className="text-lg font-bold">ยังตั้งค่าไม่ครบ</h1>
          <p className="muted mt-2 text-sm">
            ยังไม่ได้ตั้ง <code>NEXT_PUBLIC_LIFF_ID</code> จึงเข้าสู่ระบบด้วย LINE ไม่ได้
          </p>
          <ol className="muted mt-3 list-decimal space-y-1 pl-5 text-sm">
            <li>สร้าง LINE Login channel ที่ LINE Developers</li>
            <li>เพิ่ม LIFF app ชี้มาที่ URL ของเว็บนี้ เปิด scope openid + profile</li>
            <li>ใส่ LIFF ID ลงใน .env.local แล้ว build ใหม่</li>
          </ol>
        </div>
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="mx-auto flex min-h-dvh max-w-md items-center px-4">
        <div className="card w-full p-5">
          <h1 className="text-lg font-bold">เข้าสู่ระบบไม่สำเร็จ</h1>
          <p className="mt-2 text-sm text-red-600">{error}</p>
          <button className="btn btn-primary mt-4 w-full" onClick={() => window.location.reload()}>
            ลองใหม่
          </button>
        </div>
      </div>
    );
  }

  return (
    <AuthContext.Provider value={{ status, error, profile, ocrEnabled, api }}>
      {children}
    </AuthContext.Provider>
  );
}
