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
