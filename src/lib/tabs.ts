import { applySessionCookies } from "./cookies";
import type { Session } from "./types";
import { normalizeUrl } from "./url";

export async function openOrRefreshSession(session: Session): Promise<void> {
  await applySessionCookies(session);
  const targetNorm = normalizeUrl(session.url);
  const all = await chrome.tabs.query({});
  const match = all.find(
    (t) =>
      t.id != null &&
      t.url &&
      t.url.startsWith("http") &&
      normalizeUrl(t.url) === targetNorm,
  );
  if (match?.id != null) {
    if (match.url !== session.url) {
      await chrome.tabs.update(match.id, { url: session.url });
    } else {
      await chrome.tabs.reload(match.id);
    }
    if (match.windowId != null) {
      await chrome.windows.update(match.windowId, { focused: true });
      await chrome.tabs.update(match.id, { active: true });
    }
  } else {
    await chrome.tabs.create({ url: session.url });
  }
}

export async function getActiveTab(): Promise<chrome.tabs.Tab | undefined> {
  const [tab] = await chrome.tabs.query({
    active: true,
    lastFocusedWindow: true,
  });
  return tab;
}
