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

/** 与 Chrome 文档一致：构造可覆盖该 cookie 的 URL */
function cookieSetUrl(c: StoredCookie): string {
  const proto = c.secure ? "https" : "http";
  const host = c.domain.replace(/^\./, "");
  const path = c.path?.startsWith("/") ? c.path : `/${c.path || "/"}`;
  return `${proto}://${host}${path}`;
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
