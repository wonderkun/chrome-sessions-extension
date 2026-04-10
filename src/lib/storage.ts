import {
  type Group,
  type Session,
  DEFAULT_GROUPS,
  UNGROUPED_ID,
} from "./types";

const SESSIONS_KEY = "sessions_v1";
const GROUPS_KEY = "groups_v1";

function getLocal(): chrome.storage.LocalStorageArea {
  return chrome.storage.local;
}

export async function loadSessions(): Promise<Session[]> {
  const r = await getLocal().get(SESSIONS_KEY);
  const raw = r[SESSIONS_KEY];
  return Array.isArray(raw) ? (raw as Session[]) : [];
}

export async function saveSessions(sessions: Session[]): Promise<void> {
  await getLocal().set({ [SESSIONS_KEY]: sessions });
}

export async function loadGroups(): Promise<Group[]> {
  const r = await getLocal().get(GROUPS_KEY);
  const raw = r[GROUPS_KEY];
  if (Array.isArray(raw) && raw.length > 0) return raw as Group[];
  await saveGroups(DEFAULT_GROUPS);
  return DEFAULT_GROUPS;
}

export async function saveGroups(groups: Group[]): Promise<void> {
  await getLocal().set({ [GROUPS_KEY]: groups });
}

export function newSessionId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function ensureGroupId(groupId: string, groups: Group[]): string {
  if (groups.some((g) => g.id === groupId)) return groupId;
  return UNGROUPED_ID;
}
