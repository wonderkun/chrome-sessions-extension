import { registerAutoApplyCookies } from "./autoApplyCookies";
import {
  runKeepaliveForAllSessions,
  runKeepaliveForSessionId,
} from "./keepalive";

registerAutoApplyCookies();

const ALARM_KEEPALIVE = "session-keepalive";

chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel
    .setPanelBehavior({ openPanelOnActionClick: true })
    .catch((err) => console.warn("sidePanel behavior:", err));
  chrome.alarms.create(ALARM_KEEPALIVE, { periodInMinutes: 180 });
});

chrome.runtime.onStartup.addListener(() => {
  chrome.alarms.create(ALARM_KEEPALIVE, { periodInMinutes: 180 });
});

chrome.alarms.onAlarm.addListener((a) => {
  if (a.name !== ALARM_KEEPALIVE) return;
  runKeepaliveForAllSessions().catch((e) =>
    console.warn("[keepalive] alarm", e),
  );
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.type === "OPEN_SIDE_PANEL") {
    const wid = sender.tab?.windowId;
    if (wid == null) {
      sendResponse({ ok: false, error: "no_tab_window" });
      return true;
    }
    chrome.sidePanel
      .open({ windowId: wid })
      .then(() => sendResponse({ ok: true }))
      .catch((e) => sendResponse({ ok: false, error: String(e) }));
    return true;
  }
  if (msg?.type === "KEEPALIVE_ONE" && typeof msg.sessionId === "string") {
    runKeepaliveForSessionId(msg.sessionId)
      .then((ok) => sendResponse({ ok }))
      .catch((e) => sendResponse({ ok: false, error: String(e) }));
    return true;
  }
  if (msg?.type === "KEEPALIVE_ALL") {
    runKeepaliveForAllSessions()
      .then(() => sendResponse({ ok: true }))
      .catch((e) => sendResponse({ ok: false, error: String(e) }));
    return true;
  }
  return false;
});
