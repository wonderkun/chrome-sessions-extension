/** 可序列化存储的 Cookie（与 chrome.cookies.Cookie 字段对齐） */
export type StoredCookie = {
  name: string;
  value: string;
  domain: string;
  path: string;
  secure: boolean;
  httpOnly: boolean;
  expirationDate?: number;
  sameSite?: chrome.cookies.SameSiteStatus;
  storeId?: string;
};

export type Session = {
  id: string;
  title: string;
  url: string;
  faviconUrl: string;
  cookies: StoredCookie[];
  groupId: string;
  createdAt: number;
  /** 默认 true：后台定时用快照 Cookie 发请求刷登录 */
  keepaliveEnabled?: boolean;
  /** 留空则用会话 URL（去 hash） */
  keepaliveUrl?: string;
  keepaliveLastAt?: number;
  keepaliveLastError?: string;
  /** 阿里云页采集时尽力解析的账号显示名（主账号/登录名等） */
  aliyunAccountName?: string;
  /** 采集/打开时绑定的标签 id；无则不走按标签的自动注入 */
  boundTabId?: number;
};

export type Group = {
  id: string;
  name: string;
  color: string;
};

export const UNGROUPED_ID = "ungrouped";

export const DEFAULT_GROUPS: Group[] = [
  { id: UNGROUPED_ID, name: "未分组", color: "#64748b" },
];
