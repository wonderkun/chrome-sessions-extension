/**
 * 在阿里云相关页面注入浮标；响应侧栏采集时的主账号名查询。
 * aliyun-account 与入口打包在同一 content chunk。
 */
import { extractAliyunMainAccountName } from "./aliyun-account";

const HOST_ID = "account-sessions-ext-float-root";

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === "GET_ALIYUN_ACCOUNT_NAME") {
    const name = extractAliyunMainAccountName();
    sendResponse({ name: name ?? "" });
    return false;
  }
  return false;
});

function mount(): void {
  if (document.getElementById(HOST_ID)) return;

  const host = document.createElement("div");
  host.id = HOST_ID;
  host.setAttribute("data-ext", "account-sessions");

  const shadow = host.attachShadow({ mode: "open" });
  const wrap = document.createElement("div");
  wrap.innerHTML = `
    <style>
      :host { all: initial; }
      button {
        all: unset;
        cursor: pointer;
        position: fixed;
        right: 18px;
        bottom: 88px;
        z-index: 2147483646;
        width: 40px;
        height: 40px;
        border-radius: 12px;
        color: #fff;
        background: linear-gradient(145deg, #1677ff 0%, #0958d9 100%);
        box-shadow: 0 4px 14px rgba(22, 119, 255, 0.45), 0 0 0 1px rgba(255,255,255,0.12) inset;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: transform 0.15s ease, box-shadow 0.15s ease, background 0.2s ease, color 0.2s ease;
      }
      button:hover {
        transform: scale(1.06);
        box-shadow: 0 6px 18px rgba(22, 119, 255, 0.55), 0 0 0 1px rgba(255,255,255,0.18) inset;
      }
      button:active { transform: scale(0.96); }
      svg { display: block; }
      svg path { stroke: currentColor; }
      @media (prefers-color-scheme: light) {
        button {
          color: #0369a1;
          background: linear-gradient(145deg, #f0f9ff 0%, #e0f2fe 100%);
          box-shadow: 0 4px 14px rgba(14, 165, 233, 0.22), 0 0 0 1px rgba(14, 165, 233, 0.35) inset;
        }
        button:hover {
          box-shadow: 0 6px 18px rgba(14, 165, 233, 0.3), 0 0 0 1px rgba(14, 165, 233, 0.45) inset;
        }
      }
    </style>
    <button type="button" title="账号会话：采集 / 切换 / 保活" aria-label="打开账号会话侧栏">
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <path d="M12 4a5 5 0 0 0-4.9 4H7a4 4 0 1 0 0 8h10a4 4 0 0 0 .9-7.9A5 5 0 0 0 12 4Z" stroke-width="1.6" stroke-linejoin="round"/>
        <path d="M9 15h6" stroke-width="1.4" stroke-linecap="round"/>
      </svg>
    </button>
  `;

  const btn = wrap.querySelector("button");
  btn?.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    chrome.runtime.sendMessage({ type: "OPEN_SIDE_PANEL" }, () => {
      void chrome.runtime.lastError;
    });
  });

  shadow.appendChild(wrap);
  (document.documentElement || document.body).appendChild(host);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", mount, { once: true });
} else {
  mount();
}
