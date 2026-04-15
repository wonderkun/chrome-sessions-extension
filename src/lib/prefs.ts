import {
  clampKeepaliveAlarmPeriodMinutes,
  DEFAULT_KEEPALIVE_ALARM_PERIOD_MINUTES,
} from "./keepalivePeriod";

/** 与 background/autoApplyCookies.ts 中 PREFS_KEY 保持一致 */
export const EXTENSION_PREFS_STORAGE_KEY = "extension_prefs_v1";

export type ExtensionPrefs = {
  /** 默认 true：标签进入已保存的地址时自动写入该会话 Cookie */
  autoApplyCookies?: boolean;
  /**
   * 后台定时保活 `chrome.alarms` 周期（分钟）。
   * 未设置时使用 {@link DEFAULT_KEEPALIVE_ALARM_PERIOD_MINUTES}。
   */
  keepaliveAlarmPeriodMinutes?: number;
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

export function getKeepaliveAlarmPeriodMinutes(p: ExtensionPrefs): number {
  if (
    typeof p.keepaliveAlarmPeriodMinutes !== "number" ||
    !Number.isFinite(p.keepaliveAlarmPeriodMinutes)
  ) {
    return DEFAULT_KEEPALIVE_ALARM_PERIOD_MINUTES;
  }
  return clampKeepaliveAlarmPeriodMinutes(p.keepaliveAlarmPeriodMinutes);
}
