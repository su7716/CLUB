import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";

// 타임캡슐 본문 암호화(AES-256-GCM). 키는 서버 환경변수에서만 만든다.
// 시트(DB)가 유출되어도 키 없이는 읽을 수 없다. 키를 잃으면 복구할 수 없으니 CAPSULE_KEY 를 따로 보관한다.
function key(): Buffer {
  const secret = process.env.CAPSULE_KEY || process.env.SESSION_SECRET;
  if (!secret && process.env.NODE_ENV === "production") throw new Error("CAPSULE_KEY 또는 SESSION_SECRET 이 필요합니다.");
  return scryptSync(secret ?? "dev-only-capsule-key-change-before-deploy", "capsule-salt-v1", 32);
}

export function encrypt(text: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key(), iv);
  const ct = Buffer.concat([c.update(text, "utf8"), c.final()]);
  return `v1:${iv.toString("base64")}:${c.getAuthTag().toString("base64")}:${ct.toString("base64")}`;
}

export function decrypt(payload: string): string | null {
  try {
    const [v, iv, tag, ct] = payload.split(":");
    if (v !== "v1") return null;
    const d = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64"));
    d.setAuthTag(Buffer.from(tag, "base64"));
    return Buffer.concat([d.update(Buffer.from(ct, "base64")), d.final()]).toString("utf8");
  } catch {
    return null;
  }
}
