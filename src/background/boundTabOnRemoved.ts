/**
 * 关闭标签时清除各会话上指向该标签的 boundTabId。
 * 不引用 ../lib，保证 SW 单文件打包。
 */
const SESSIONS_KEY = "sessions_v1";

type Row = Record<string, unknown> & {
  id: string;
  boundTabId?: number;
};

export function registerBoundTabCleanupOnRemoved(): void {
  chrome.tabs.onRemoved.addListener((tabId) => {
    void (async () => {
      const r = await chrome.storage.local.get(SESSIONS_KEY);
      const raw = r[SESSIONS_KEY];
      if (!Array.isArray(raw)) return;
      let changed = false;
      const next = raw.map((x) => {
        const row = x as Row;
        if (row?.boundTabId === tabId) {
          changed = true;
          const { boundTabId: _b, ...rest } = row;
          return rest;
        }
        return x;
      });
      if (changed) {
        await chrome.storage.local.set({ [SESSIONS_KEY]: next });
      }
    })();
  });
}
