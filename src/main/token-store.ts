import { app, safeStorage } from "electron";
import fs from "node:fs";
import path from "node:path";

function getTokenFile(): string {
  if (app && !app.isReady()) {
    return path.join(process.cwd(), "desktop-session.bin");
  }
  return path.join(app.getPath("userData"), "session.bin");
}

export function setToken(token: string): void {
  const tokenFile = getTokenFile();
  const payload = safeStorage.isEncryptionAvailable()
    ? safeStorage.encryptString(token)
    : Buffer.from(token, "utf8");
  fs.writeFileSync(tokenFile, payload);
}

export function getToken(): string | null {
  const tokenFile = getTokenFile();
  if (!fs.existsSync(tokenFile)) return null;
  try {
    const payload = fs.readFileSync(tokenFile);
    if (safeStorage.isEncryptionAvailable()) {
      return safeStorage.decryptString(payload);
    }
    return payload.toString("utf8");
  } catch {
    return null;
  }
}

export function clearToken(): void {
  const tokenFile = getTokenFile();
  if (fs.existsSync(tokenFile)) {
    fs.unlinkSync(tokenFile);
  }
}
