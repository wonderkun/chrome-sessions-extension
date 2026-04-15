import { registerAutoApplyCookies } from "./autoApplyCookies";
import { registerBoundTabCleanupOnRemoved } from "./boundTabOnRemoved";
import {
  runKeepaliveForAllSessions,
  runKeepaliveForSessionId,
} from "./keepalive";

registerAutoApplyCookies();
registerBoundTabCleanupOnRemoved();

const ALARM_KEEPALIVE = "session-keepalive";

/** 本扩展侧栏在当前窗口是否处于打开（用于浮标点击切换；依赖 onOpened/onClosed，侧栏页也会上报以修复 SW 休眠丢状态） */
const sidePanelOpenWindowIds = new Set<number>();

type SidePanelExtras = typeof chrome.sidePanel & {
  close?: (options: { windowId: number }) => Promise<void>;
  onOpened?: {
    addListener: (cb: (info: { windowId: number }) => void) => void;
  };
  onClosed?: {
    addListener: (cb: (info: { windowId: number }) => void) => void;
  };
};

const sidePanelX = chrome.sidePanel as SidePanelExtras;
if (sidePanelX.onOpened) {
  sidePanelX.onOpened.addListener((info) => {
    sidePanelOpenWindowIds.add(info.windowId);
  });
}
if (sidePanelX.onClosed) {
  sidePanelX.onClosed.addListener((info) => {
    sidePanelOpenWindowIds.delete(info.windowId);
  });
}

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
  if (msg?.type === "SIDE_PANEL_MARK_OPEN" && typeof msg.windowId === "number") {
    sidePanelOpenWindowIds.add(msg.windowId);
    sendResponse({ ok: true });
    return true;
  }
  if (msg?.type === "OPEN_SIDE_PANEL") {
    const wid = sender.tab?.windowId;
    if (wid == null) {
      sendResponse({ ok: false, error: "no_tab_window" });
      return true;
    }
    const closeFn = sidePanelX.close;
    if (sidePanelOpenWindowIds.has(wid) && closeFn) {
      closeFn({ windowId: wid })
        .then(() => sendResponse({ ok: true, action: "closed" as const }))
        .catch((e) => sendResponse({ ok: false, error: String(e) }));
    } else {
      chrome.sidePanel
        .open({ windowId: wid })
        .then(() => sendResponse({ ok: true, action: "opened" as const }))
        .catch((e) => sendResponse({ ok: false, error: String(e) }));
    }
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
