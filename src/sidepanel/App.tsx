import {
  BookmarkPlus,
  ChevronDown,
  ChevronRight,
  Eraser,
  ExternalLink,
  Folder,
  FolderInput,
  RefreshCw,
  Trash2,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  inferCapturedTitle,
  isAliyunPageUrl,
  resolveCaptureGroupId,
  sessionDisplayTitle,
} from "../lib/aliyun";
import {
  captureCookiesForUrl,
  clearCookiesForPageUrl,
} from "../lib/cookies";
import {
  ensureGroupId,
  loadGroups,
  loadSessions,
  newSessionId,
  saveGroups,
  saveSessions,
} from "../lib/storage";
import type { Group, Session } from "../lib/types";
import { UNGROUPED_ID } from "../lib/types";
import {
  EXTENSION_PREFS_STORAGE_KEY,
  type ExtensionPrefs,
  isAutoApplyCookiesEnabled,
  loadExtensionPrefs,
  saveExtensionPrefs,
} from "../lib/prefs";
import { getActiveTab, openOrRefreshSession } from "../lib/tabs";

export function App() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);
  const [captureBusy, setCaptureBusy] = useState(false);
  const [clearSiteBusy, setClearSiteBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [newGroupOpen, setNewGroupOpen] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");
  const [pingingId, setPingingId] = useState<string | null>(null);
  const [pingingAll, setPingingAll] = useState(false);
  /** 展开的分组 id（文件夹） */
  const [expandedGroupIds, setExpandedGroupIds] = useState<Set<string>>(
    () => new Set(),
  );
  /** 展开详情的会话 id */
  const [expandedSessionIds, setExpandedSessionIds] = useState<Set<string>>(
    () => new Set(),
  );
  const foldersBootstrappedRef = useRef(false);
  const [autoApplyCookies, setAutoApplyCookies] = useState(true);
  /** 双击标题内联编辑 */
  const [editingTitleId, setEditingTitleId] = useState<string | null>(null);
  const [titleDraft, setTitleDraft] = useState("");
  const ignoreNextTitleBlurRef = useRef(false);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2600);
  }, []);

  const refresh = useCallback(async () => {
    const [s, g] = await Promise.all([loadSessions(), loadGroups()]);
    setSessions(s);
    setGroups(g);
  }, []);

  useEffect(() => {
    (async () => {
      await refresh();
      setLoading(false);
    })();
  }, [refresh]);

  useEffect(() => {
    void loadExtensionPrefs().then((p) =>
      setAutoApplyCookies(isAutoApplyCookiesEnabled(p)),
    );
  }, []);

  useEffect(() => {
    const onStorage = (
      changes: Record<string, chrome.storage.StorageChange>,
      area: string,
    ) => {
      if (area !== "local") return;
      if (changes.sessions_v1) void refresh();
      if (changes[EXTENSION_PREFS_STORAGE_KEY]) {
        const nv = changes[EXTENSION_PREFS_STORAGE_KEY]
          .newValue as ExtensionPrefs | undefined;
        if (nv && typeof nv === "object") {
          setAutoApplyCookies(isAutoApplyCookiesEnabled(nv));
        }
      }
    };
    chrome.storage.onChanged.addListener(onStorage);
    return () => chrome.storage.onChanged.removeListener(onStorage);
  }, [refresh]);

  useEffect(() => {
    if (loading) return;
    setExpandedGroupIds((prev) => {
      if (!foldersBootstrappedRef.current) {
        foldersBootstrappedRef.current = true;
        return new Set(
          groups.filter((g) => g.id !== UNGROUPED_ID).map((g) => g.id),
        );
      }
      let changed = false;
      const next = new Set(prev);
      for (const g of groups) {
        if (!next.has(g.id)) {
          next.add(g.id);
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [loading, groups]);

  const sessionsByGroup = useMemo(() => {
    const m = new Map<string, Session[]>();
    for (const g of groups) m.set(g.id, []);
    for (const s of sessions) {
      const gid = ensureGroupId(s.groupId, groups);
      const arr = m.get(gid) ?? m.get(UNGROUPED_ID);
      if (arr) arr.push(s);
    }
    for (const arr of m.values()) {
      arr.sort((a, b) => b.createdAt - a.createdAt);
    }
    return m;
  }, [sessions, groups]);

  const ungroupedList = useMemo(
    () => sessionsByGroup.get(UNGROUPED_ID) ?? [],
    [sessionsByGroup],
  );

  const namedGroups = useMemo(
    () => groups.filter((g) => g.id !== UNGROUPED_ID),
    [groups],
  );

  const toggleGroup = (id: string) => {
    setExpandedGroupIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSessionDetail = (id: string) => {
    setExpandedSessionIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const onCapture = async () => {
    setCaptureBusy(true);
    try {
      const tab = await getActiveTab();
      if (!tab?.url?.startsWith("http")) {
        showToast("请在普通网页标签页中采集（不支持扩展页等）");
        return;
      }
      if (tab.id == null) {
        showToast("无法读取标签页 id，请重试");
        return;
      }
      const tabId = tab.id;
      const cookies = await captureCookiesForUrl(tab.url);
      let aliyunAccountName: string | undefined;
      if (isAliyunPageUrl(tab.url)) {
        try {
          const r = (await chrome.tabs.sendMessage(tabId, {
            type: "GET_ALIYUN_ACCOUNT_NAME",
          })) as { name?: string };
          const n = r?.name?.trim();
          if (n) aliyunAccountName = n.slice(0, 120);
        } catch {
          /* 内容脚本未注入或页面隔离 */
        }
      }
      const { groups: g2, groupId, autoHint } = resolveCaptureGroupId(
        tab.url,
        groups,
      );
      if (g2 !== groups) {
        setGroups(g2);
        await saveGroups(g2);
      }

      const boundIdx = sessions.findIndex((s) => s.boundTabId === tabId);
      const title = inferCapturedTitle(tab.url, tab.title || "");
      const baseFields = {
        url: tab.url,
        faviconUrl: tab.favIconUrl || "",
        cookies,
        groupId,
        keepaliveEnabled: true as const,
        boundTabId: tabId,
        ...(aliyunAccountName ? { aliyunAccountName } : {}),
      };

      let next: Session[];
      if (boundIdx >= 0) {
        const prev = sessions[boundIdx]!;
        const updated: Session = {
          ...prev,
          ...baseFields,
          title,
        };
        next = sessions.map((s, i) => {
          if (i === boundIdx) return updated;
          if (s.boundTabId === tabId) {
            const { boundTabId: _b, ...rest } = s;
            return rest as Session;
          }
          return s;
        });
      } else {
        const session: Session = {
          id: newSessionId(),
          title,
          createdAt: Date.now(),
          ...baseFields,
        };
        next = [
          session,
          ...sessions.map((s) =>
            s.boundTabId === tabId
              ? (() => {
                  const { boundTabId: _b, ...rest } = s;
                  return rest as Session;
                })()
              : s,
          ),
        ];
      }

      setSessions(next);
      await saveSessions(next);
      const base =
        cookies.length > 0
          ? `已采集「${title}」· ${cookies.length} 条 Cookie`
          : `已采集「${title}」（未检测到 Cookie，仍可保存书签）`;
      const extra: string[] = [];
      if (autoHint) extra.push(`已归入「${autoHint}」`);
      if (aliyunAccountName) extra.push(`主账号：${aliyunAccountName}`);
      if (boundIdx >= 0) extra.push("已更新当前标签绑定的会话");
      showToast(extra.length ? `${base} · ${extra.join(" · ")}` : base);
    } catch (e) {
      console.error(e);
      showToast("采集失败，请检查扩展权限");
    } finally {
      setCaptureBusy(false);
    }
  };

  const onClearSiteLogin = async () => {
    const tab = await getActiveTab();
    if (!tab?.url?.startsWith("http")) {
      showToast("请在普通网页标签页中使用（不支持扩展页等）");
      return;
    }
    if (tab.id == null) {
      showToast("无法读取标签页 id，请重试");
      return;
    }
    const msg =
      "将删除当前标签页 URL 下、浏览器里与此页相关的全部 Cookie（与「采集」相同的匹配范围）。\n\n" +
      "注意：Cookie 在同一 Chrome 用户下是全局共享的，同一站点其它标签也会失去登录态；侧栏里已保存的会话不会丢失，可对原账号会话再点「打开」写回 Cookie。\n\n" +
      "确定继续？";
    if (!confirm(msg)) return;

    setClearSiteBusy(true);
    try {
      const { removed, failed } = await clearCookiesForPageUrl(tab.url);
      await chrome.tabs.reload(tab.id);
      const tail =
        failed > 0 ? `，${failed} 条未能删除（权限或浏览器限制）` : "";
      showToast(`已清除 ${removed} 条 Cookie 并刷新页面${tail}`);
    } catch (e) {
      console.error(e);
      showToast("清除失败，请检查扩展权限");
    } finally {
      setClearSiteBusy(false);
    }
  };

  const onOpen = async (s: Session) => {
    try {
      const patch = await openOrRefreshSession(s);
      if ("boundTabId" in patch) {
        const v = patch.boundTabId;
        const next = sessions.map((x) => {
          if (x.id === s.id) {
            if (v === null) {
              const { boundTabId: _bt, ...rest } = x;
              return rest as Session;
            }
            return { ...x, boundTabId: v };
          }
          if (typeof v === "number" && x.boundTabId === v) {
            const { boundTabId: _bt, ...rest } = x;
            return rest as Session;
          }
          return x;
        });
        setSessions(next);
        await saveSessions(next);
      }
      showToast("已应用会话并打开页面");
    } catch (e) {
      console.error(e);
      showToast("打开失败");
    }
  };

  const onDelete = async (id: string) => {
    if (!confirm("删除此会话？")) return;
    if (editingTitleId === id) {
      setEditingTitleId(null);
      setTitleDraft("");
    }
    const next = sessions.filter((x) => x.id !== id);
    setSessions(next);
    await saveSessions(next);
    showToast("已删除");
  };

  const patchSession = async (id: string, patch: Partial<Session>) => {
    const next = sessions.map((x) =>
      x.id === id ? { ...x, ...patch } : x,
    );
    setSessions(next);
    await saveSessions(next);
  };

  const onKeepaliveOne = async (id: string) => {
    setPingingId(id);
    try {
      const r = (await chrome.runtime.sendMessage({
        type: "KEEPALIVE_ONE",
        sessionId: id,
      })) as { ok?: boolean; error?: string };
      if (r?.ok) showToast("保活已完成");
      else showToast(`保活失败：${r?.error ?? "未知错误"}`);
    } catch (e) {
      showToast(`保活失败：${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setPingingId(null);
      await refresh();
    }
  };

  const onKeepaliveAll = async () => {
    setPingingAll(true);
    try {
      const r = (await chrome.runtime.sendMessage({
        type: "KEEPALIVE_ALL",
      })) as { ok?: boolean; error?: string };
      if (r?.ok) showToast("已全部执行保活（按会话顺序）");
      else showToast(`执行失败：${r?.error ?? "未知错误"}`);
    } catch (e) {
      showToast(`执行失败：${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setPingingAll(false);
      await refresh();
    }
  };

  const onAddGroup = async () => {
    const name = newGroupName.trim();
    if (!name) return;
    const g: Group = {
      id: `g-${Date.now()}`,
      name,
      color: "#38bdf8",
    };
    const next = [...groups, g];
    setGroups(next);
    await saveGroups(next);
    setNewGroupName("");
    setNewGroupOpen(false);
    showToast(`已添加分组「${name}」`);
  };

  const onDeleteGroup = async (g: Group) => {
    if (g.id === UNGROUPED_ID) return;
    if (!confirm(`删除分组「${g.name}」？其中会话将移到「未分组」。`)) return;
    const nextS = sessions.map((s) =>
      s.groupId === g.id ? { ...s, groupId: UNGROUPED_ID } : s,
    );
    const nextG = groups.filter((x) => x.id !== g.id);
    setSessions(nextS);
    setGroups(nextG);
    await saveSessions(nextS);
    await saveGroups(nextG);
    showToast("分组已删除");
  };

  const finishTitleEdit = (sessionId: string, prevTitle: string) => {
    if (ignoreNextTitleBlurRef.current) {
      ignoreNextTitleBlurRef.current = false;
      return;
    }
    const v = titleDraft.slice(0, 200).trim();
    setEditingTitleId(null);
    setTitleDraft("");
    if (v && v !== prevTitle) void patchSession(sessionId, { title: v });
  };

  const renderSessionCard = (s: Session) => {
    const detailOpen = expandedSessionIds.has(s.id);
    const editingTitle = editingTitleId === s.id;
    const faviconSrc =
      s.faviconUrl ||
      (() => {
        try {
          return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(new URL(s.url).hostname)}&sz=64`;
        } catch {
          return `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" fill="%2364748b"><rect width="32" height="32" rx="6"/></svg>`)}`;
        }
      })();
    const showAccountRow =
      Boolean(s.aliyunAccountName) || isAliyunPageUrl(s.url);

    return (
      <article
        key={s.id}
        className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm dark:border-slate-800/80 dark:bg-slate-950/50 dark:shadow-none"
      >
        <div className="flex items-stretch gap-0">
          <button
            type="button"
            onClick={() => toggleSessionDetail(s.id)}
            className="flex shrink-0 items-center justify-center px-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800/60 dark:hover:text-slate-300"
            title={detailOpen ? "收起详情" : "展开详情"}
            aria-expanded={detailOpen}
          >
            {detailOpen ? (
              <ChevronDown className="size-4" />
            ) : (
              <ChevronRight className="size-4" />
            )}
          </button>
          <div className="flex min-w-0 flex-1 items-start gap-2 py-2 pr-2">
            <img
              src={faviconSrc}
              alt=""
              className="mt-0.5 size-9 shrink-0 rounded-md bg-slate-100 object-contain p-0.5 dark:bg-slate-800"
              onError={(e) => {
                (e.target as HTMLImageElement).src =
                  "data:image/svg+xml," +
                  encodeURIComponent(
                    `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" fill="%2394a3b8"><rect width="32" height="32" rx="6"/></svg>`,
                  );
              }}
            />
            <div className="min-w-0 flex-1 space-y-1">
              {editingTitle ? (
                <input
                  type="text"
                  autoFocus
                  value={titleDraft}
                  onChange={(e) => setTitleDraft(e.target.value.slice(0, 200))}
                  onFocus={(e) => e.target.select()}
                  onBlur={() => finishTitleEdit(s.id, s.title)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      (e.target as HTMLInputElement).blur();
                    }
                    if (e.key === "Escape") {
                      e.preventDefault();
                      ignoreNextTitleBlurRef.current = true;
                      setEditingTitleId(null);
                      setTitleDraft("");
                    }
                  }}
                  className="w-full min-w-0 rounded border border-sky-400 bg-white px-1.5 py-0.5 text-xs font-medium text-slate-900 shadow-sm outline-none focus:ring-1 focus:ring-sky-500 dark:border-sky-500 dark:bg-slate-900 dark:text-white dark:focus:ring-sky-400"
                  onClick={(e) => e.stopPropagation()}
                />
              ) : (
                <p
                  className="cursor-text truncate text-xs font-medium text-slate-900 dark:text-white"
                  title="双击编辑标题"
                  onDoubleClick={(e) => {
                    e.stopPropagation();
                    setEditingTitleId(s.id);
                    setTitleDraft(s.title);
                  }}
                >
                  {sessionDisplayTitle(s)}
                </p>
              )}
              {showAccountRow && (
                <p
                  className={
                    s.aliyunAccountName
                      ? "truncate text-[13px] font-semibold leading-snug text-sky-700 dark:text-sky-300"
                      : "truncate text-[10px] leading-snug text-slate-500"
                  }
                >
                  {s.aliyunAccountName ? (
                    <>账号 · {s.aliyunAccountName}</>
                  ) : (
                    <>主账号未识别</>
                  )}
                </p>
              )}
              <p className="truncate text-[10px] text-slate-600 dark:text-slate-500">
                {shortHost(s.url)} · {s.cookies.length} cookies
              </p>
            </div>
            <button
              type="button"
              onClick={() => void onOpen(s)}
              className="mt-0.5 inline-flex shrink-0 items-center gap-1 rounded-md border border-sky-300 bg-sky-50 px-2 py-1.5 text-[10px] font-medium text-sky-800 hover:bg-sky-100 dark:border-sky-800/50 dark:bg-sky-950/40 dark:text-sky-400 dark:hover:bg-sky-950/60"
            >
              <ExternalLink className="size-3" />
              打开
            </button>
          </div>
        </div>
        {detailOpen && (
          <div className="space-y-2 border-t border-slate-200 px-3 py-2.5 dark:border-slate-800/80">
            <p className="truncate text-[10px] text-slate-500 dark:text-slate-600">
              {s.url}
            </p>
            <p className="text-[10px] text-slate-500 dark:text-slate-600">
              采集于 {new Date(s.createdAt).toLocaleString()}
            </p>
            {s.title.trim() !== sessionDisplayTitle(s) && (
              <p className="text-[10px] text-slate-600 dark:text-slate-500">
                原始标题 · {s.title}
              </p>
            )}
            {s.aliyunAccountName && (
              <p className="text-[11px] font-medium text-sky-700 dark:text-sky-400/90">
                主账号 · {s.aliyunAccountName}
              </p>
            )}
            <label className="flex cursor-pointer items-center gap-2 text-[11px] text-slate-600 dark:text-slate-400">
              <input
                type="checkbox"
                className="rounded border-slate-300 bg-white dark:border-slate-600 dark:bg-slate-900"
                checked={s.keepaliveEnabled !== false}
                onChange={(e) =>
                  patchSession(s.id, {
                    keepaliveEnabled: e.target.checked,
                  })
                }
              />
              定时刷登录（约每 3 小时请求一次，延长登录态）
            </label>
            <input
              type="url"
              value={s.keepaliveUrl ?? ""}
              onChange={(e) =>
                patchSession(s.id, { keepaliveUrl: e.target.value })
              }
              placeholder="保活 URL（留空=会话地址，可填控制台首页等）"
              className="w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-[11px] text-slate-800 placeholder:text-slate-400 focus:border-sky-500 focus:outline-none dark:border-slate-700/80 dark:bg-slate-950/80 dark:text-slate-300 dark:placeholder:text-slate-600 dark:focus:border-sky-600"
            />
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => onKeepaliveOne(s.id)}
                disabled={
                  pingingId === s.id || s.keepaliveEnabled === false
                }
                className="inline-flex items-center gap-1 rounded-md border border-emerald-300 bg-emerald-50 px-2 py-1 text-[11px] text-emerald-800 hover:bg-emerald-100 disabled:opacity-40 dark:border-emerald-800/60 dark:bg-emerald-950/40 dark:text-emerald-400 dark:hover:bg-emerald-950/60"
              >
                <RefreshCw
                  className={`size-3 ${pingingId === s.id ? "animate-spin" : ""}`}
                />
                立即刷登录
              </button>
              <select
                value={ensureGroupId(s.groupId, groups)}
                onChange={(e) =>
                  patchSession(s.id, { groupId: e.target.value })
                }
                className="min-w-[100px] flex-1 rounded-md border border-slate-300 bg-white px-2 py-1 text-[11px] text-slate-800 focus:border-sky-500 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300 dark:focus:border-sky-500"
              >
                {groups.map((gr) => (
                  <option key={gr.id} value={gr.id}>
                    {gr.name}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => onDelete(s.id)}
                className="inline-flex items-center gap-1 rounded-md border border-red-200 bg-red-50 px-2 py-1 text-[11px] text-red-700 hover:bg-red-100 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-400 dark:hover:bg-red-950/50"
              >
                <Trash2 className="size-3" />
                删除
              </button>
            </div>
            {(s.keepaliveLastAt != null || s.keepaliveLastError) && (
              <p className="text-[10px] text-slate-500 dark:text-slate-600">
                {s.keepaliveLastAt != null && (
                  <>
                    上次保活：
                    {new Date(s.keepaliveLastAt).toLocaleString()}
                  </>
                )}
                {s.keepaliveLastError && (
                  <span className="text-amber-700 dark:text-amber-600/90">
                    {" "}
                    · {s.keepaliveLastError}
                  </span>
                )}
              </p>
            )}
          </div>
        )}
      </article>
    );
  };

  if (loading) {
    return (
      <div className="flex min-h-[200px] items-center justify-center bg-slate-50 text-slate-500 text-sm dark:bg-slate-950 dark:text-slate-400">
        加载中…
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <header className="sticky top-0 z-10 border-b border-slate-200 bg-slate-50/95 px-4 py-3 backdrop-blur-sm dark:border-slate-800/80 dark:bg-slate-950/95">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 shrink pt-0.5">
            <h1 className="text-base font-semibold tracking-tight text-slate-900 dark:text-white">
              账号会话
            </h1>
            <p className="mt-0.5 text-[11px] text-slate-600 dark:text-slate-500">
              采集 Cookie · 分组 · 一键切换
            </p>
          </div>
          <div className="flex min-w-0 flex-1 flex-col items-stretch gap-1.5 sm:max-w-[min(100%,17.5rem)]">
            <div className="grid w-full grid-cols-2 gap-1.5">
              <button
                type="button"
                onClick={onCapture}
                disabled={captureBusy || clearSiteBusy}
                className="inline-flex min-w-0 items-center justify-center gap-1 rounded-lg bg-sky-600 px-2 py-2 text-[11px] font-medium leading-tight text-white shadow-md shadow-sky-900/20 hover:bg-sky-500 disabled:opacity-50 sm:gap-1.5 sm:px-2.5 sm:text-xs dark:shadow-sky-900/30"
              >
                <BookmarkPlus className="size-3.5 shrink-0 sm:size-4" />
                <span className="text-center">
                  {captureBusy ? "采集中…" : "采集当前页"}
                </span>
              </button>
              <button
                type="button"
                onClick={onClearSiteLogin}
                disabled={clearSiteBusy || captureBusy}
                title="删除当前页相关 Cookie 并刷新，便于同站重新登录另一账号（不点网站注销）"
                className="inline-flex min-w-0 items-center justify-center gap-1 rounded-lg border border-amber-600/70 bg-white px-2 py-2 text-[11px] font-medium leading-tight text-amber-900 hover:bg-amber-50 disabled:opacity-50 sm:gap-1.5 sm:px-2.5 sm:text-xs dark:border-amber-500/60 dark:bg-slate-900 dark:text-amber-100 dark:hover:bg-amber-950/40"
              >
                <Eraser className="size-3.5 shrink-0 sm:size-4" />
                <span className="text-center">
                  {clearSiteBusy ? "清除中…" : "清除站登录态"}
                </span>
              </button>
            </div>
            <button
              type="button"
              onClick={onKeepaliveAll}
              disabled={pingingAll || sessions.length === 0}
              className="inline-flex items-center justify-center gap-1 self-end rounded-md border border-slate-300 bg-white px-2 py-1 text-[10px] text-slate-700 hover:bg-slate-100 disabled:opacity-40 dark:border-slate-600 dark:bg-slate-800/80 dark:text-slate-300 dark:hover:bg-slate-700"
              title="按顺序对全部启用保活的会话执行一次刷登录（与定时任务无关）"
            >
              <RefreshCw
                className={`size-3 ${pingingAll ? "animate-spin" : ""}`}
              />
              {pingingAll ? "保活中…" : "全部刷登录"}
            </button>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setNewGroupOpen((v) => !v)}
            className="inline-flex min-w-0 flex-1 items-center justify-center gap-1.5 rounded-lg border border-slate-300 bg-white px-2.5 py-2 text-xs text-slate-700 transition-colors hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
          >
            <FolderInput className="size-3.5 shrink-0" />
            新分组
          </button>
        </div>

        <label className="mt-2 flex cursor-pointer items-start gap-2 text-[10px] leading-snug text-slate-600 dark:text-slate-400">
          <input
            type="checkbox"
            className="mt-0.5 rounded border-slate-300 dark:border-slate-600"
            checked={autoApplyCookies}
            onChange={async (e) => {
              const v = e.target.checked;
              setAutoApplyCookies(v);
              await saveExtensionPrefs({ autoApplyCookies: v });
            }}
          />
          <span>
            切换到前台时，若当前标签已与会话绑定且页面同源，则自动写入该会话
            Cookie（同标签内继续浏览不会重复注入）
          </span>
        </label>

        {newGroupOpen && (
          <div className="mt-2 flex gap-2 rounded-lg border border-slate-200 bg-white p-2 dark:border-slate-800 dark:bg-slate-900/80">
            <input
              value={newGroupName}
              onChange={(e) => setNewGroupName(e.target.value)}
              placeholder="分组名称"
              className="flex-1 rounded-md border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-900 placeholder:text-slate-400 focus:border-sky-500 focus:outline-none dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:placeholder:text-slate-500"
              onKeyDown={(e) => e.key === "Enter" && onAddGroup()}
            />
            <button
              type="button"
              onClick={onAddGroup}
              className="rounded-md bg-slate-200 px-2 text-xs text-slate-800 hover:bg-slate-300 dark:bg-slate-700 dark:text-slate-100 dark:hover:bg-slate-600"
            >
              添加
            </button>
          </div>
        )}
      </header>

      <main className="flex-1 space-y-2 overflow-y-auto p-4">
        {sessions.length === 0 && (
          <div className="rounded-lg border border-dashed border-slate-300 bg-slate-100/60 px-4 py-3 text-center dark:border-slate-700/80 dark:bg-slate-900/35">
            <p className="text-xs text-slate-600 dark:text-slate-500">
              暂无会话。在网页中打开侧栏后点击「采集当前页」。
            </p>
          </div>
        )}
        {ungroupedList.length > 0 && (
          <div className="space-y-1.5">
            {ungroupedList.map(renderSessionCard)}
          </div>
        )}
        {namedGroups.map((g) => {
          const list = sessionsByGroup.get(g.id) ?? [];
          const folderOpen = expandedGroupIds.has(g.id);
          return (
            <section
              key={g.id}
              className="overflow-hidden rounded-xl border border-slate-200 bg-white/90 shadow-sm dark:border-slate-800/90 dark:bg-slate-900/40 dark:shadow-none"
            >
              <button
                type="button"
                onClick={() => toggleGroup(g.id)}
                className="flex w-full items-center gap-2 px-3 py-2.5 text-left transition-colors hover:bg-slate-100/90 dark:hover:bg-slate-800/40"
              >
                {folderOpen ? (
                  <ChevronDown className="size-4 shrink-0 text-slate-500" />
                ) : (
                  <ChevronRight className="size-4 shrink-0 text-slate-500" />
                )}
                <Folder className="size-4 shrink-0 text-sky-600 dark:text-sky-500/90" />
                <span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-800 dark:text-slate-200">
                  {g.name}
                </span>
                <span className="shrink-0 rounded-md bg-slate-200 px-1.5 py-0.5 text-[10px] tabular-nums text-slate-600 dark:bg-slate-800 dark:text-slate-400">
                  {list.length}
                </span>
              </button>
              {folderOpen && (
                <div className="space-y-1.5 border-t border-slate-200 px-2 pb-2 pt-1 dark:border-slate-800/80">
                  {list.length === 0 ? (
                    <p className="px-2 py-3 text-center text-[11px] text-slate-500 dark:text-slate-600">
                      该分组下暂无会话
                    </p>
                  ) : (
                    list.map(renderSessionCard)
                  )}
                </div>
              )}
            </section>
          );
        })}

        {groups.filter((g) => g.id !== UNGROUPED_ID).length > 0 && (
          <section className="pt-2">
            <h3 className="mb-2 text-[10px] font-medium uppercase tracking-wider text-slate-500 dark:text-slate-600">
              管理分组
            </h3>
            <ul className="space-y-1">
              {groups
                .filter((g) => g.id !== UNGROUPED_ID)
                .map((g) => (
                  <li
                    key={g.id}
                    className="flex items-center justify-between rounded-lg border border-transparent bg-slate-100/80 px-2 py-1.5 text-xs dark:border-transparent dark:bg-slate-900/40"
                  >
                    <span className="text-slate-600 dark:text-slate-400">
                      {g.name}
                    </span>
                    <button
                      type="button"
                      onClick={() => onDeleteGroup(g)}
                      className="text-[10px] text-red-600 hover:text-red-500 dark:text-red-500/80 dark:hover:text-red-400"
                    >
                      删除
                    </button>
                  </li>
                ))}
            </ul>
          </section>
        )}
      </main>

      {toast && (
        <div className="fixed bottom-4 left-1/2 z-20 -translate-x-1/2 rounded-full border border-slate-200 bg-white px-4 py-2 text-xs text-slate-800 shadow-xl dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">
          {toast}
        </div>
      )}
    </div>
  );
}

function shortHost(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return "—";
  }
}
