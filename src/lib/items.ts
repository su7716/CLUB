import { z } from "zod";
import type { TabName } from "./store/schema";
import type { Row } from "./store/types";

// 행사의 일정, 준비 목록, 비용. 한 쌍의 API 파일(items/[kind])로 모두 처리한다.
export type ItemKind = "schedule" | "prep" | "costs";

type Def = {
  tab: TabName;
  perm: string[]; // 읽기·쓰기에 필요한 관리자 권한(하나라도 있으면 된다)
  schema: z.ZodType<Record<string, string>, z.ZodTypeDef, unknown>;
  sort: (a: Row, b: Row) => number;
  view: (r: Row) => Record<string, unknown>;
};

const money = z.number().int().min(0).max(10_000_000_000);
const str = (max: number) => z.string().trim().max(max);

export const ITEMS: Record<ItemKind, Def> = {
  schedule: {
    tab: "EventSchedule",
    perm: ["events"],
    schema: z
      .object({ at: str(40).min(1), title: str(100).min(1) })
      .transform((v) => ({ at: v.at, title: v.title })),
    sort: (a, b) => a.at.localeCompare(b.at),
    view: (r) => ({ id: r.id, at: r.at, title: r.title }),
  },
  prep: {
    tab: "EventPrep",
    perm: ["events"],
    schema: z
      .object({ item: str(100).min(1), owner: str(40).default(""), done: z.boolean().default(false) })
      .transform((v) => ({ item: v.item, owner: v.owner, done: String(v.done) })),
    sort: (a, b) => Number(a.done === "true") - Number(b.done === "true") || a.item.localeCompare(b.item, "ko"),
    view: (r) => ({ id: r.id, item: r.item, owner: r.owner, done: r.done === "true" }),
  },
  costs: {
    tab: "EventCosts",
    perm: ["fees"],
    schema: z
      .object({ item: str(100).min(1), budget: money.default(0), spent: money.default(0), status: str(20).default("예정"), owner: str(40).default("") })
      .transform((v) => ({ item: v.item, budget: String(v.budget), spent: String(v.spent), status: v.status, owner: v.owner })),
    sort: (a, b) => a.item.localeCompare(b.item, "ko"),
    view: (r) => ({ id: r.id, item: r.item, budget: Number(r.budget) || 0, spent: Number(r.spent) || 0, status: r.status, owner: r.owner }),
  },
};

export function isKind(k: string): k is ItemKind {
  return k in ITEMS;
}
