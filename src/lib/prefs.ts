/** 与 background/autoApplyCookies.ts 中 PREFS_KEY 保持一致 */
export const EXTENSION_PREFS_STORAGE_KEY = "extension_prefs_v1";

export type ExtensionPrefs = {
  /** 默认 true：标签进入已保存的地址时自动写入该会话 Cookie */
  autoApplyCookies?: boolean;
};

export async function loadExtensionPrefs(): Promise<ExtensionPrefs> {
  const r = await chrome.storage.local.get(EXTENSION_PREFS_STORAGE_KEY);
  return (r[EXTENSION_PREFS_STORAGE_KEY] as ExtensionPrefs) ?? {};
}

export async function saveExtensionPrefs(
  patch: Partial<ExtensionPrefs>,
): Promise<void> {
  const cur = await loadExtensionPrefs();
  await chrome.storage.local.set({
    [EXTENSION_PREFS_STORAGE_KEY]: { ...cur, ...patch },
  });
}

export function isAutoApplyCookiesEnabled(p: ExtensionPrefs): boolean {
  return p.autoApplyCookies !== false;
}
