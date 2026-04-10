import type { Group, Session } from "./types";
import { UNGROUPED_ID } from "./types";

/** 当前标签是否为 aliyun.com 体系页面（含各 console 子域） */
export function isAliyunPageUrl(urlStr: string): boolean {
  try {
    const h = new URL(urlStr).hostname.toLowerCase();
    return h === "aliyun.com" || h.endsWith(".aliyun.com");
  } catch {
    return false;
  }
}

/** 去掉标题末尾「- 阿里云控制台」等重复后缀，便于侧栏列表展示 */
export function shortenAliyunConsoleTitle(title: string): string {
  let t = title.trim();
  const original = t;
  if (!t) return t;
  for (let i = 0; i < 6; i++) {
    const n = t
      .replace(/[–—\-|｜·]\s*阿里云控制台\s*$/i, "")
      .replace(/\s*[-–—]\s*阿里云控制台\s*$/i, "")
      .replace(/\s*阿里云控制台\s*$/i, "")
      .replace(/[–—\-|｜·]\s*Alibaba\s+Cloud\s+Console\s*$/i, "")
      .replace(/\s*Alibaba\s+Cloud\s+Console\s*$/i, "")
      .trim();
    if (n === t) break;
    t = n;
  }
  return t || original;
}

/** 阿里云站点用缩短后的标题，其它站点用原标题 */
export function sessionDisplayTitle(session: Session): string {
  const raw = (session.title || "未命名页面").trim();
  if (!isAliyunPageUrl(session.url)) return raw;
  const short = shortenAliyunConsoleTitle(raw);
  return short || raw;
}

/**
 * 采集时的默认标题：
 * - SLS：`.../logsearch/{Logstore}`，否则 `.../project/{project}`
 * - OSS：`/bucket/{region}/{bucket}/...` → `对象存储: {region}/{bucket}`
 * - 其它：标签标题
 */
export function inferCapturedTitle(pageUrl: string, tabTitle: string): string {
  try {
    const u = new URL(pageUrl);
    const host = u.hostname.toLowerCase();
    if (host === "sls.console.aliyun.com") {
      const logsearch = /\/lognext\/project\/[^/]+\/logsearch\/([^/?#]+)/.exec(
        u.pathname,
      );
      if (logsearch?.[1]) {
        const store = decodeURIComponent(logsearch[1]).trim();
        if (store) return `日志服务: ${store}`;
      }
      const projectOnly = /\/lognext\/project\/([^/?#]+)/.exec(u.pathname);
      if (projectOnly?.[1]) {
        const project = decodeURIComponent(projectOnly[1]).trim();
        if (project) return `日志服务: ${project}`;
      }
    }
    if (host === "oss.console.aliyun.com") {
      const ossm = /^\/bucket\/([^/]+)\/([^/]+)(?:\/|$)/.exec(u.pathname);
      if (ossm?.[1] && ossm?.[2]) {
        const region = decodeURIComponent(ossm[1]).trim();
        const bucket = decodeURIComponent(ossm[2]).trim();
        if (region && bucket) return `对象存储: ${region}/${bucket}`;
      }
    }
  } catch {
    /* ignore */
  }
  const t = (tabTitle || "").trim();
  return t || "未命名页面";
}

/** 识别 *.console.aliyun.com 的一级子域 */
export function parseAliyunConsoleSegment(hostname: string): string | null {
  const h = hostname.toLowerCase();
  const m = /^([^.]+)\.console\.aliyun\.com$/.exec(h);
  return m ? m[1] : null;
}

const KNOWN: Record<string, { label: string; color: string }> = {
  bailian: { label: "百炼", color: "#7c3aed" },
  ecs: { label: "ECS", color: "#ea580c" },
  sls: { label: "日志服务 SLS", color: "#0284c7" },
  oss: { label: "OSS", color: "#16a34a" },
  rds: { label: "RDS", color: "#db2777" },
  vpc: { label: "专有网络 VPC", color: "#0891b2" },
  ram: { label: "RAM 访问控制", color: "#ca8a04" },
  acr: { label: "容器镜像服务 ACR", color: "#4f46e5" },
  ack: { label: "容器服务 ACK", color: "#0d9488" },
  fc: { label: "函数计算 FC", color: "#9333ea" },
  home: { label: "控制台首页", color: "#1677ff" },
  dns: { label: "云解析 DNS", color: "#2563eb" },
  cdn: { label: "CDN", color: "#dc2626" },
  ots: { label: "表格存储", color: "#059669" },
  mq: { label: "消息队列", color: "#d97706" },
};

export type AliyunAutoGroup = {
  id: string;
  name: string;
  color: string;
  segment: string;
};

/** 若当前 URL 为阿里云控制台子产品，则返回用于自动创建分组的描述 */
export function detectAliyunAutoGroup(pageUrl: string): AliyunAutoGroup | null {
  try {
    const host = new URL(pageUrl).hostname;
    const seg = parseAliyunConsoleSegment(host);
    if (!seg) return null;
    const meta = KNOWN[seg];
    const label = meta?.label ?? seg.toUpperCase();
    const color = meta?.color ?? "#1677ff";
    return {
      id: `auto-aliyun-${seg}`,
      name: `阿里云 · ${label}`,
      color,
      segment: seg,
    };
  } catch {
    return null;
  }
}

/**
 * 确保存在对应自动分组，并返回应使用的 groupId。
 * 自动分组 id 以 `auto-aliyun-` 开头，与用户手建分组区分。
 */
export function ensureAliyunAutoGroup(
  groups: Group[],
  auto: AliyunAutoGroup,
): { groups: Group[]; groupId: string } {
  if (groups.some((g) => g.id === auto.id)) {
    return { groups, groupId: auto.id };
  }
  const g: Group = {
    id: auto.id,
    name: auto.name,
    color: auto.color,
  };
  return { groups: [...groups, g], groupId: auto.id };
}

/** 无阿里云规则时返回未分组 */
export function resolveCaptureGroupId(
  pageUrl: string,
  groups: Group[],
): { groups: Group[]; groupId: string; autoHint: string | null } {
  const auto = detectAliyunAutoGroup(pageUrl);
  if (!auto) {
    return { groups, groupId: UNGROUPED_ID, autoHint: null };
  }
  const { groups: next, groupId } = ensureAliyunAutoGroup(groups, auto);
  return { groups: next, groupId, autoHint: auto.name };
}
