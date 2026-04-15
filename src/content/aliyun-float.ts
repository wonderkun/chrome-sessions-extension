/**
 * 在阿里云相关页面注入浮标；响应侧栏采集时的主账号名查询。
 * aliyun-account 与入口打包在同一 content chunk。
 *
 * 位置用视口内归一化坐标 (nx, ny) 持久化，避免侧栏开关改变 innerWidth 后
 * 绝对 left/top 卡在偏左无法恢复的问题。
 */
import { extractAliyunMainAccountName } from "./aliyun-account";

const HOST_ID = "account-sessions-ext-float-root";
const FLOAT_STORAGE_KEY = "aliyunFloatPos";
const BUTTON_PX = 30;
const DRAG_THRESHOLD_PX = 8;

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === "GET_ALIYUN_ACCOUNT_NAME") {
    const name = extractAliyunMainAccountName();
    sendResponse({ name: name ?? "" });
    return false;
  }
  return false;
});

function clamp01(x: number): number {
  return Math.min(1, Math.max(0, x));
}

function clampFloatPos(
  left: number,
  top: number,
  size: number,
): { left: number; top: number } {
  const m = 6;
  const maxL = Math.max(m, window.innerWidth - size - m);
  const maxT = Math.max(m, window.innerHeight - size - m);
  return {
    left: Math.min(maxL, Math.max(m, left)),
    top: Math.min(maxT, Math.max(m, top)),
  };
}

function defaultFloatPos(size: number): { left: number; top: number } {
  return clampFloatPos(
    window.innerWidth - 18 - size,
    window.innerHeight - 88 - size,
    size,
  );
}

/** 当前视口下，把像素位置换成可拖区域内的归一化坐标（持久化用） */
function normFromPixels(
  left: number,
  top: number,
  size: number,
): { nx: number; ny: number } {
  const m = 6;
  const c = clampFloatPos(left, top, size);
  const maxL = Math.max(m, window.innerWidth - size - m);
  const maxT = Math.max(m, window.innerHeight - size - m);
  const spanX = Math.max(1e-6, maxL - m);
  const spanY = Math.max(1e-6, maxT - m);
  return {
    nx: clamp01((c.left - m) / spanX),
    ny: clamp01((c.top - m) / spanY),
  };
}

/** 按归一化坐标换算为当前视口下的像素位置 */
function pixelsFromNorm(
  nx: number,
  ny: number,
  size: number,
): { left: number; top: number } {
  const m = 6;
  const nxc = clamp01(nx);
  const nyc = clamp01(ny);
  const maxL = Math.max(m, window.innerWidth - size - m);
  const maxT = Math.max(m, window.innerHeight - size - m);
  const spanX = Math.max(0, maxL - m);
  const spanY = Math.max(0, maxT - m);
  const left = m + nxc * spanX;
  const top = m + nyc * spanY;
  return clampFloatPos(left, top, size);
}

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
        cursor: grab;
        touch-action: none;
        position: fixed;
        z-index: 2147483646;
        width: ${BUTTON_PX}px;
        height: ${BUTTON_PX}px;
        border-radius: 9px;
        color: #fff;
        background: linear-gradient(145deg, #1677ff 0%, #0958d9 100%);
        box-shadow: 0 3px 10px rgba(22, 119, 255, 0.4), 0 0 0 1px rgba(255,255,255,0.12) inset;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: transform 0.15s ease, box-shadow 0.15s ease, background 0.2s ease, color 0.2s ease;
      }
      button:hover {
        transform: scale(1.06);
        box-shadow: 0 5px 14px rgba(22, 119, 255, 0.5), 0 0 0 1px rgba(255,255,255,0.18) inset;
      }
      button:active { transform: scale(0.96); }
      button.dragging {
        cursor: grabbing;
        transition: none;
        transform: none;
        box-shadow: 0 3px 10px rgba(22, 119, 255, 0.4), 0 0 0 1px rgba(255,255,255,0.12) inset;
      }
      svg { display: block; }
      svg path { stroke: currentColor; }
      @media (prefers-color-scheme: light) {
        button {
          color: #0369a1;
          background: linear-gradient(145deg, #f0f9ff 0%, #e0f2fe 100%);
          box-shadow: 0 3px 10px rgba(14, 165, 233, 0.2), 0 0 0 1px rgba(14, 165, 233, 0.35) inset;
        }
        button:hover {
          box-shadow: 0 5px 14px rgba(14, 165, 233, 0.28), 0 0 0 1px rgba(14, 165, 233, 0.45) inset;
        }
        button.dragging {
          box-shadow: 0 3px 10px rgba(14, 165, 233, 0.2), 0 0 0 1px rgba(14, 165, 233, 0.35) inset;
        }
      }
    </style>
    <button type="button" title="账号会话：拖动移动 · 点击打开侧栏，已打开时再点可关闭" aria-label="打开或关闭账号会话侧栏">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <path d="M12 4a5 5 0 0 0-4.9 4H7a4 4 0 1 0 0 8h10a4 4 0 0 0 .9-7.9A5 5 0 0 0 12 4Z" stroke-width="1.5" stroke-linejoin="round"/>
        <path d="M9 15h6" stroke-width="1.25" stroke-linecap="round"/>
      </svg>
    </button>
  `;

  const btn = wrap.querySelector("button") as HTMLButtonElement | null;
  if (!btn) {
    shadow.appendChild(wrap);
    (document.documentElement || document.body).appendChild(host);
    return;
  }

  const floatState = { nx: 0, ny: 0 };

  const applyPixels = (left: number, top: number) => {
    const c = clampFloatPos(left, top, BUTTON_PX);
    btn.style.left = `${c.left}px`;
    btn.style.top = `${c.top}px`;
    btn.style.right = "auto";
    btn.style.bottom = "auto";
    return c;
  };

  const applyFromNorm = () => {
    const c = pixelsFromNorm(floatState.nx, floatState.ny, BUTTON_PX);
    btn.style.left = `${c.left}px`;
    btn.style.top = `${c.top}px`;
    btn.style.right = "auto";
    btn.style.bottom = "auto";
    return c;
  };

  const d0 = defaultFloatPos(BUTTON_PX);
  const c0 = applyPixels(d0.left, d0.top);
  const n0 = normFromPixels(c0.left, c0.top, BUTTON_PX);
  floatState.nx = n0.nx;
  floatState.ny = n0.ny;

  shadow.appendChild(wrap);
  (document.documentElement || document.body).appendChild(host);

  const onViewportChange = () => {
    applyFromNorm();
  };
  window.addEventListener("resize", onViewportChange);
  window.visualViewport?.addEventListener("resize", onViewportChange);

  chrome.storage.local.get([FLOAT_STORAGE_KEY], (r) => {
    const raw = r[FLOAT_STORAGE_KEY] as unknown;
    const norm =
      raw &&
      typeof raw === "object" &&
      (raw as { v?: unknown }).v === 2 &&
      typeof (raw as { nx?: unknown }).nx === "number" &&
      typeof (raw as { ny?: unknown }).ny === "number"
        ? (raw as { nx: number; ny: number })
        : null;
    if (norm) {
      floatState.nx = clamp01(norm.nx);
      floatState.ny = clamp01(norm.ny);
      applyFromNorm();
    } else if (
      raw &&
      typeof raw === "object" &&
      typeof (raw as { left?: unknown }).left === "number" &&
      typeof (raw as { top?: unknown }).top === "number" &&
      Number.isFinite((raw as { left: number }).left) &&
      Number.isFinite((raw as { top: number }).top)
    ) {
      const legacy = raw as { left: number; top: number };
      const c = clampFloatPos(legacy.left, legacy.top, BUTTON_PX);
      const n = normFromPixels(c.left, c.top, BUTTON_PX);
      floatState.nx = n.nx;
      floatState.ny = n.ny;
      applyFromNorm();
      chrome.storage.local.set({
        [FLOAT_STORAGE_KEY]: { v: 2, nx: floatState.nx, ny: floatState.ny },
      });
    }

    let active = false;
    let startX = 0;
    let startY = 0;
    let originL = 0;
    let originT = 0;
    let maxMove = 0;

    const finish = (e: PointerEvent, allowOpen: boolean) => {
      if (!active) return;
      active = false;
      try {
        btn.releasePointerCapture(e.pointerId);
      } catch {
        /* released */
      }
      btn.classList.remove("dragging");
      const left = parseFloat(btn.style.left);
      const top = parseFloat(btn.style.top);
      const c = applyPixels(left, top);
      if (maxMove >= DRAG_THRESHOLD_PX) {
        const n = normFromPixels(c.left, c.top, BUTTON_PX);
        floatState.nx = n.nx;
        floatState.ny = n.ny;
        chrome.storage.local.set({
          [FLOAT_STORAGE_KEY]: { v: 2, nx: floatState.nx, ny: floatState.ny },
        });
      } else if (allowOpen) {
        chrome.runtime.sendMessage({ type: "OPEN_SIDE_PANEL" }, () => {
          void chrome.runtime.lastError;
        });
      }
    };

    btn.addEventListener("pointerdown", (e) => {
      if (e.button !== 0) return;
      const rect = btn.getBoundingClientRect();
      startX = e.clientX;
      startY = e.clientY;
      originL = rect.left;
      originT = rect.top;
      maxMove = 0;
      active = true;
      btn.setPointerCapture(e.pointerId);
      btn.classList.add("dragging");
    });

    btn.addEventListener("pointermove", (e) => {
      if (!active) return;
      maxMove = Math.max(
        maxMove,
        Math.hypot(e.clientX - startX, e.clientY - startY),
      );
      applyPixels(originL + (e.clientX - startX), originT + (e.clientY - startY));
    });

    btn.addEventListener("pointerup", (e) => {
      finish(e, true);
    });

    btn.addEventListener("pointercancel", (e) => {
      finish(e, false);
    });
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", mount, { once: true });
} else {
  mount();
}
