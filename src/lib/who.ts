import { NextResponse } from "next/server";
import { guessStatus, isWhoAmI, preStatus, readConfig, type PreStatus } from "./activities";
import { getSetting, getStore, DEFAULT_GUIDELINES, DEFAULT_QUESTIONS } from "./store";
import type { Row } from "./store/types";
import type { TemplateConfig } from "./template-schema";
import { parseJson } from "./api";

export type Scope = "intro" | "truthlie" | "none";
export type ChatMsg = { role: "ai" | "me"; text: string; scope?: Scope };

export type WhoCtx = { ev: Row; act: Row; cfg: TemplateConfig };

// 활동 id 로 행사와 설정을 찾는다. '내가 누굴까요?' 방식의 활동이 아니면 오류.
export async function loadWho(aid: string): Promise<WhoCtx | NextResponse> {
  const s = await getStore();
  const act = (await s.list("EventActivities")).find((a) => a.id === aid);
  const cfg = act ? readConfig(act.config) : null;
  const ev = act ? (await s.list("Events")).find((e) => e.id === act.eventId && e.published === "true") : undefined;
  if (!act || !cfg || !ev) return NextResponse.json({ error: "활동을 찾을 수 없어요." }, { status: 404 });
  if (!isWhoAmI(cfg)) return NextResponse.json({ error: "소개 작성이 있는 활동이 아니에요." }, { status: 400 });
  return { ev, act, cfg };
}

const WHY: Record<string, string> = {
  none: "이 활동에는 사전 작성이 없어요.",
  unknown: "행사 날짜가 정해지면 작성 기간이 열려요.",
  before: "아직 작성 기간이 아니에요.",
  closed: "작성 기간이 끝났어요.",
};

// 사전 작성 기간(작성)이 열려 있어야 쓸 수 있다.
export function writeClosed(ctx: WhoCtx): NextResponse | null {
  const p = preStatus(ctx.cfg, ctx.ev.startsAt);
  if (p.status === "open") return null;
  return NextResponse.json({ error: `${WHY[p.status]}${p.opensAt ? ` (${p.opensAt} ~ ${p.closesAt})` : ""}` }, { status: 403 });
}

// 사전 추측 기간
export function guessClosed(ctx: WhoCtx): NextResponse | null {
  const p = guessStatus(ctx.cfg, ctx.ev.startsAt);
  if (p.status === "open") return null;
  return NextResponse.json({ error: `${WHY[p.status]}${p.opensAt ? ` (${p.opensAt} ~ ${p.closesAt})` : ""}` }, { status: 403 });
}

export function windows(ctx: WhoCtx): { pre: PreStatus; guess: PreStatus } {
  return { pre: preStatus(ctx.cfg, ctx.ev.startsAt), guess: guessStatus(ctx.cfg, ctx.ev.startsAt) };
}

export async function questions(): Promise<string[]> {
  const q = await getSetting<string[]>("interviewQuestions", DEFAULT_QUESTIONS);
  return q.length ? q : DEFAULT_QUESTIONS;
}
export const guidelines = () => getSetting<string>("aiGuidelines", DEFAULT_GUIDELINES);
export const followUpMax = () => getSetting<number>("followUpMax", 6);

export async function myProfile(memberId: string): Promise<Row | undefined> {
  return (await (await getStore()).list("Profiles")).find((p) => p.memberId === memberId);
}

export async function myInterview(memberId: string, aid: string): Promise<{ row?: Row; messages: ChatMsg[] }> {
  const row = (await (await getStore()).list("Interviews")).find((i) => i.memberId === memberId && i.eventActivityId === aid);
  return { row, messages: parseJson<ChatMsg[]>(row?.messages, []) };
}

export async function myTruthLies(memberId: string, aid: string): Promise<Row | undefined> {
  return (await (await getStore()).list("TruthLies")).find((t) => t.memberId === memberId && t.eventActivityId === aid);
}

export const normAlias = (s: string) => s.replace(/\s+/g, "").toLowerCase();

export function interviewView(messages: ChatMsg[], status: string, required: number) {
  return { messages, status: status || "active", answered: messages.filter((m) => m.role === "me").length, required };
}
