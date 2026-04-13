import type { Session, StoredCookie } from "./types";

function cookieToStored(c: chrome.cookies.Cookie): StoredCookie {
  return {
    name: c.name,
    value: c.value,
    domain: c.domain,
    path: c.path,
    secure: c.secure,
    httpOnly: c.httpOnly,
    expirationDate: c.expirationDate,
    sameSite: c.sameSite,
    storeId: c.storeId,
  };
}

/** 从当前标签页 URL 拉取全部相关 Cookie */
export async function captureCookiesForUrl(
  pageUrl: string,
): Promise<StoredCookie[]> {
  if (!pageUrl.startsWith("http")) return [];
  const list = await chrome.cookies.getAll({ url: pageUrl });
  return list.map(cookieToStored);
}

/** 与 Chrome 文档一致：构造可覆盖 / 删除该 cookie 的 URL */
function cookieSetUrl(c: StoredCookie): string {
  const proto = c.secure ? "https" : "http";
  const host = c.domain.replace(/^\./, "");
  const path = c.path?.startsWith("/") ? c.path : `/${c.path || "/"}`;
  return `${proto}://${host}${path}`;
}

function cookieApiUrl(c: chrome.cookies.Cookie): string {
  const proto = c.secure ? "https" : "http";
  const host = c.domain.replace(/^\./, "");
  const path = c.path?.startsWith("/") ? c.path : `/${c.path || "/"}`;
  return `${proto}://${host}${path}`;
}

export type ClearCookiesForPageResult = { removed: number; failed: number };

/**
 * 删除与 pageUrl 相关的浏览器 Cookie（与 getAll({ url }) 同范围）。
 * 注意：同一用户配置下 Cookie 全局共享，同站其它标签也会受影响。
 */
export async function clearCookiesForPageUrl(
  pageUrl: string,
): Promise<ClearCookiesForPageResult> {
  if (!pageUrl.startsWith("http")) {
    return { removed: 0, failed: 0 };
  }
  const list = await chrome.cookies.getAll({ url: pageUrl });
  let removed = 0;
  let failed = 0;
  for (const c of list) {
    try {
      const d = await chrome.cookies.remove({
        url: cookieApiUrl(c),
        name: c.name,
        storeId: c.storeId,
      });
      if (d) removed += 1;
      else failed += 1;
    } catch (e) {
      console.warn(`cookie remove failed: ${c.name}`, e);
      failed += 1;
    }
  }
  return { removed, failed };
}

export async function applySessionCookies(session: Session): Promise<void> {
  for (const c of session.cookies) {
    try {
      const url = cookieSetUrl(c);
      await chrome.cookies.set({
        url,
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
      console.warn(`cookie set failed: ${c.name}`, e);
    }
  }
}
