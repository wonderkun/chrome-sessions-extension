/**
 * 后台刷登录保活：写入快照 Cookie → fetch 保活地址（带 Cookie）→ 读回浏览器 Cookie 更新快照。
 * 不引用 ../lib，保证 SW 单文件打包。
 */
const SESSIONS_KEY = "sessions_v1";

type StoredCookie = {
  name: string;
  value: string;
  domain: string;
  path: string;
  secure: boolean;
  httpOnly: boolean;
  expirationDate?: number;
  sameSite?: chrome.cookies.SameSiteStatus;
  storeId?: string;
};

type SessionRow = Record<string, unknown> & {
  id: string;
  url: string;
  cookies: StoredCookie[];
  keepaliveEnabled?: boolean;
  keepaliveUrl?: string;
  keepaliveLastAt?: number;
  keepaliveLastError?: string;
};

function normalizeUrl(urlStr: string): string {
  try {
    const u = new URL(urlStr);
    u.hash = "";
    return u.href;
  } catch {
    const i = urlStr.indexOf("#");
    return i === -1 ? urlStr : urlStr.slice(0, i);
  }
}

function cookieSetUrl(c: StoredCookie): string {
  const proto = c.secure ? "https" : "http";
  const host = c.domain.replace(/^\./, "");
  const path = c.path?.startsWith("/") ? c.path : `/${c.path || "/"}`;
  return `${proto}://${host}${path}`;
}

async function applySessionCookies(session: SessionRow): Promise<void> {
  for (const c of session.cookies) {
    try {
      await chrome.cookies.set({
        url: cookieSetUrl(c),
        name: c.name,
        value: c.value,
        domain: c.domain,
        path: c.path || "/",
        secure: c.secure,
        httpOnly: c.httpOnly,
        expirationDate: c.expirationDate,
        sameSite: c.sameSite,
        storeId: c.storeId,
      });
    } catch (e) {
      console.warn("[keepalive] set cookie", c.name, e);
    }
  }
}

async function captureCookiesForUrl(pageUrl: string): Promise<StoredCookie[]> {
  if (!pageUrl.startsWith("http")) return [];
  const list = await chrome.cookies.getAll({ url: pageUrl });
  return list.map((c) => ({
    name: c.name,
    value: c.value,
    domain: c.domain,
    path: c.path,
    secure: c.secure,
    httpOnly: c.httpOnly,
    expirationDate: c.expirationDate,
    sameSite: c.sameSite,
    storeId: c.storeId,
  }));
}

async function loadSessions(): Promise<SessionRow[]> {
  const r = await chrome.storage.local.get(SESSIONS_KEY);
  const raw = r[SESSIONS_KEY];
  return Array.isArray(raw) ? (raw as SessionRow[]) : [];
}

async function saveSessions(sessions: SessionRow[]): Promise<void> {
  await chrome.storage.local.set({ [SESSIONS_KEY]: sessions });
}

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** 对单条会话：刷 Cookie + 请求 + 回写快照 */
export async function runKeepaliveForSession(
  session: SessionRow,
): Promise<SessionRow> {
  if (session.keepaliveEnabled === false) return session;
  const pingUrlRaw =
    (typeof session.keepaliveUrl === "string" && session.keepaliveUrl.trim()) ||
    normalizeUrl(session.url);
  if (!pingUrlRaw.startsWith("http")) {
    return {
      ...session,
      keepaliveLastAt: Date.now(),
      keepaliveLastError: "保活地址无效",
    };
  }
  try {
    await applySessionCookies(session);
    await fetch(pingUrlRaw, {
      method: "GET",
      credentials: "include",
      cache: "no-store",
      redirect: "follow",
      mode: "no-cors",
    });
    const fresh = await captureCookiesForUrl(session.url);
    return {
      ...session,
      cookies: fresh,
      keepaliveLastAt: Date.now(),
      keepaliveLastError: "",
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn("[keepalive]", session.id, e);
    return {
      ...session,
      keepaliveLastAt: Date.now(),
      keepaliveLastError: msg,
    };
  }
}

export async function runKeepaliveForSessionId(
  sessionId: string,
): Promise<boolean> {
  const sessions = await loadSessions();
  const idx = sessions.findIndex((s) => s.id === sessionId);
  if (idx < 0) return false;
  const updated = await runKeepaliveForSession(sessions[idx]);
  sessions[idx] = updated;
  await saveSessions(sessions);
  return true;
}

/** 顺序执行，避免同域多会话互相抢 Cookie 时过于并发 */
export async function runKeepaliveForAllSessions(): Promise<void> {
  const sessions = await loadSessions();
  if (sessions.length === 0) return;
  const next: SessionRow[] = [];
  for (let i = 0; i < sessions.length; i++) {
    const s = sessions[i];
    const updated = await runKeepaliveForSession(s);
    next.push(updated);
    if (i < sessions.length - 1) await delay(2500);
  }
  await saveSessions(next);
}
