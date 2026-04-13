/**
 * 标签变为前台（activated）时：若 boundTabId 命中且与会话 url 同源，则写入该会话 Cookie。
 * 不在每次 URL 加载（onUpdated loading）时注入，避免同标签内导航重复写 Cookie。
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
  boundTabId?: number;
};

let autoApplyEnabled = true;
let prefsReady = false;

function sameOrigin(a: string, b: string): boolean {
  try {
    return new URL(a).origin === new URL(b).origin;
  } catch {
    return false;
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

function sessionForBoundTab(
  sessions: SessionRow[],
  tabId: number,
  tabUrl: string,
): SessionRow | null {
  if (!tabUrl.startsWith("http")) return null;
  const hits = sessions.filter(
    (s) =>
      s.boundTabId === tabId &&
      typeof s.url === "string" &&
      sameOrigin(tabUrl, s.url),
  );
  if (hits.length === 0) return null;
  if (hits.length > 1) {
    hits.sort((a, b) => a.id.localeCompare(b.id));
    console.warn(
      "[autoApply] multiple sessions bound to tab",
      tabId,
      "using",
      hits[0]!.id,
    );
  }
  return hits[0]!;
}

async function tryAutoApplyForTab(
  tabId: number,
  tabUrl: string,
): Promise<void> {
  if (!(await loadPrefsFlag())) return;
  const sessions = await loadSessions();
  const session = sessionForBoundTab(sessions, tabId, tabUrl);
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

  chrome.tabs.onActivated.addListener((activeInfo) => {
    void chrome.tabs.get(activeInfo.tabId).then((t) => {
      const url = t.url;
      if (!url?.startsWith("http")) return;
      void tryAutoApplyForTab(activeInfo.tabId, url);
    });
  });
}
