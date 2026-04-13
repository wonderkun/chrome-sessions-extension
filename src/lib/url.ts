/** 自动注入用：scheme + host + port 一致 */
export function sameOrigin(a: string, b: string): boolean {
  try {
    return new URL(a).origin === new URL(b).origin;
  } catch {
    return false;
  }
}

/** 比对用：去掉 hash，query 保留 */
export function normalizeUrl(urlStr: string): string {
  try {
    const u = new URL(urlStr);
    u.hash = "";
    return u.href;
  } catch {
    const i = urlStr.indexOf("#");
    return i === -1 ? urlStr : urlStr.slice(0, i);
  }
}
