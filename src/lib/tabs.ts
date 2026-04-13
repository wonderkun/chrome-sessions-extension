import { applySessionCookies } from "./cookies";
import type { Session } from "./types";
import { normalizeUrl } from "./url";

/**
 * `boundTabId` 缺省表示不修改存储；`null` 表示清除绑定。
 */
export type OpenSessionBindingPatch = {
  boundTabId?: number | null;
};

async function focusAndActivateTab(tabId: number, windowId: number): Promise<void> {
  await chrome.windows.update(windowId, { focused: true });
  await chrome.tabs.update(tabId, { active: true });
}

/**
 * 手动打开会话：先写 Cookie，再按 绑定标签 → 规范化 URL → 新建 选标签并维护 boundTabId。
 */
export async function openOrRefreshSession(
  session: Session,
): Promise<OpenSessionBindingPatch> {
  await applySessionCookies(session);

  // 5.1 绑定标签优先
  if (session.boundTabId != null) {
    try {
      const t = await chrome.tabs.get(session.boundTabId);
      if (t.id != null && t.windowId != null) {
        const tabUrl = t.url ?? "";
        if (
          tabUrl.startsWith("http") &&
          normalizeUrl(tabUrl) === normalizeUrl(session.url)
        ) {
          await focusAndActivateTab(t.id, t.windowId);
          if (t.url === session.url) {
            await chrome.tabs.reload(t.id);
          } else {
            await chrome.tabs.update(t.id, { url: session.url });
          }
          return {};
        }
        if (tabUrl.startsWith("http")) {
          const created = await chrome.tabs.create({ url: session.url });
          if (created.id != null) {
            return { boundTabId: created.id };
          }
          return { boundTabId: null };
        }
        // 绑定标签无可用 http(s) URL，回退并清除失效绑定
      }
    } catch {
      /* tabs.get 失败：标签已关闭 */
    }
  }

  // 5.2 规范化 URL 匹配
  const targetNorm = normalizeUrl(session.url);
  const all = await chrome.tabs.query({});
  const match = all.find(
    (tab) =>
      tab.id != null &&
      tab.url &&
      tab.url.startsWith("http") &&
      normalizeUrl(tab.url) === targetNorm,
  );

  if (match?.id != null && match.windowId != null) {
    await focusAndActivateTab(match.id, match.windowId);
    if (match.url !== session.url) {
      await chrome.tabs.update(match.id, { url: session.url });
    } else {
      await chrome.tabs.reload(match.id);
    }
    return { boundTabId: match.id };
  }

  // 5.3 新建
  try {
    const created = await chrome.tabs.create({ url: session.url });
    if (created.id != null) {
      return { boundTabId: created.id };
    }
  } catch (e) {
    console.warn("tabs.create failed", e);
  }

  if (session.boundTabId != null) {
    return { boundTabId: null };
  }
  return {};
}

export async function getActiveTab(): Promise<chrome.tabs.Tab | undefined> {
  const [tab] = await chrome.tabs.query({
    active: true,
    lastFocusedWindow: true,
  });
  return tab;
}
