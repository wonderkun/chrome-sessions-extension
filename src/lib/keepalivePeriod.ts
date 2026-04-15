/**
 * 后台 `chrome.alarms` 定时保活周期（分钟）。
 * Chrome 为分钟粒度，实际触发可能略晚于整点间隔。
 */
export const DEFAULT_KEEPALIVE_ALARM_PERIOD_MINUTES = 120;

export const MIN_KEEPALIVE_ALARM_PERIOD_MINUTES = 1;

/** 上限一周，避免误填极大值 */
export const MAX_KEEPALIVE_ALARM_PERIOD_MINUTES = 7 * 24 * 60;

export function clampKeepaliveAlarmPeriodMinutes(n: number): number {
  if (!Number.isFinite(n)) return DEFAULT_KEEPALIVE_ALARM_PERIOD_MINUTES;
  const r = Math.round(n);
  return Math.min(
    MAX_KEEPALIVE_ALARM_PERIOD_MINUTES,
    Math.max(MIN_KEEPALIVE_ALARM_PERIOD_MINUTES, r),
  );
}

/** 会话详情里与定时任务说明配套展示 */
export function formatKeepalivePeriodForUi(minutes: number): string {
  const m = clampKeepaliveAlarmPeriodMinutes(minutes);
  if (m >= 1440 && m % 1440 === 0) {
    const d = m / 1440;
    return d === 1 ? "约每 1 天" : `约每 ${d} 天`;
  }
  if (m >= 60 && m % 60 === 0) {
    const h = m / 60;
    return h === 1 ? "约每 1 小时" : `约每 ${h} 小时`;
  }
  return `约每 ${m} 分钟`;
}
