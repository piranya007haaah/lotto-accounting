import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // รูปสลิปถูกส่งผ่าน API route (multipart) — ขยาย limit ให้พอกับรูปจากมือถือ
  experimental: {
    serverActions: { bodySizeLimit: "8mb" },
  },
};

export default nextConfig;
