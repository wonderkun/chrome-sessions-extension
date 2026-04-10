/**
 * 标签导航 / 切换时：若当前 URL 仅匹配一条已保存会话，则自动写入该会话 Cookie。
 * 不引用 ../lib，与 keepalive 一样保证 SW 单文件打包。
 */
const SESSIONS_KEY = "sessions_v1";
/** 须与 src/lib/prefs.ts 中 EXTENSION_PREFS_STORAGE_KEY 一致 */
const PREFS_KEY = "extension_prefs_v1";

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

type SessionRow = {
  id: string;
  url: string;
  cookies: StoredCookie[];
};

let autoApplyEnabled = true;
let prefsReady = false;

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
      console.warn("[autoApply] set cookie", c.name, e);
    }
  }
}

async function loadPrefsFlag(): Promise<boolean> {
  if (prefsReady) return autoApplyEnabled;
  const r = await chrome.storage.local.get(PREFS_KEY);
  const p = r[PREFS_KEY] as { autoApplyCookies?: boolean } | undefined;
  autoApplyEnabled = p?.autoApplyCookies !== false;
  prefsReady = true;
  return autoApplyEnabled;
}

async function loadSessions(): Promise<SessionRow[]> {
  const r = await chrome.storage.local.get(SESSIONS_KEY);
  const raw = r[SESSIONS_KEY];
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (x): x is SessionRow =>
      x != null &&
      typeof x === "object" &&
      typeof (x as SessionRow).id === "string" &&
      typeof (x as SessionRow).url === "string" &&
      Array.isArray((x as SessionRow).cookies),
  );
}

function uniqueSessionForUrl(
  sessions: SessionRow[],
  tabUrl: string,
): SessionRow | null {
  if (!tabUrl.startsWith("http")) return null;
  const norm = normalizeUrl(tabUrl);
  const hits = sessions.filter((s) => normalizeUrl(s.url) === norm);
  if (hits.length !== 1) return null;
  return hits[0]!;
}

async function tryAutoApplyForUrl(tabUrl: string): Promise<void> {
  if (!(await loadPrefsFlag())) return;
  const sessions = await loadSessions();
  const session = uniqueSessionForUrl(sessions, tabUrl);
  if (!session) return;
  await applySessionCookies(session);
}

export function registerAutoApplyCookies(): void {
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    if (changes[PREFS_KEY]) {
      const nv = changes[PREFS_KEY].newValue as
        | { autoApplyCookies?: boolean }
        | undefined;
      autoApplyEnabled = nv?.autoApplyCookies !== false;
      prefsReady = true;
    }
  });

  chrome.tabs.onUpdated.addListener((_tabId, changeInfo, tab) => {
    if (changeInfo.status !== "loading") return;
    const url = changeInfo.url ?? tab.url;
    if (!url?.startsWith("http")) return;
    void tryAutoApplyForUrl(url);
  });

  chrome.tabs.onActivated.addListener((activeInfo) => {
    void chrome.tabs.get(activeInfo.tabId).then((t) => {
      const url = t.url;
      if (!url?.startsWith("http")) return;
      void tryAutoApplyForUrl(url);
    });
  });
}
