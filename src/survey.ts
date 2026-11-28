/**
 * Day-3 / day-7 micro-survey (spec: team/specs/beta-feedback.md §1). The server decides who is asked
 * (`surveyStatus`) and keeps answered / snoozed / dismissed state per user (`submitSurvey`), so a second
 * device never asks again. Answers given offline wait in a small queue and are sent when back online.
 *
 * Action contract used here (backend T26):
 *   surveyStatus()  -> { survey: 'd3' | 'd7' | null, snoozedUntil?: string | null }
 *   submitSurvey({ survey, score: 1..5, text?, wantsReply? })      answer
 *   submitSurvey({ survey, skip: 'later' | 'never' })               "לא עכשיו" (snooze 2 days) / "לא להציג שוב"
 *   adminFeedback() -> { surveys: { d3: FeedbackAgg, d7: FeedbackAgg } }   (admin only)
 * A server without these actions answers "unknown action": the card simply stays hidden.
 */
import { call, hasBackend, NetworkError } from './api';
import { kvGet, kvSet } from './db';

export type SurveyId = 'd3' | 'd7';
export const TEXT_MAX = 500;

export interface SurveyAnswer { survey: SurveyId; score: number; text?: string; wantsReply?: boolean }
export interface SurveySkip { survey: SurveyId; skip: 'later' | 'never' }
export type SurveyPayload = SurveyAnswer | SurveySkip;

export interface FeedbackItem { at: string; firstName: string; day?: number; score: number; text: string; wantsReply: boolean; messageId?: string }
export interface FeedbackAgg { count: number; average?: number | null; distribution: number[]; latest: FeedbackItem[] }
export interface FeedbackResponse { surveys: Partial<Record<SurveyId, FeedbackAgg>> }

/** The average is shown only from this many answers (spec §1.4). */
export const MIN_ANSWERS = 5;

export const isUnknownAction = (e: unknown) => /לא מוכרת|Unknown action|UNKNOWN_ACTION/i.test(String((e as Error)?.message ?? e));

/** Clean an answer before sending: score 1..5, text trimmed to 500, "contact me" only with text. Null if invalid. */
export function buildAnswer(survey: SurveyId, score: number | null, text: string, wantsReply: boolean): SurveyAnswer | null {
  if (!score || !Number.isInteger(score) || score < 1 || score > 5) return null;
  const clean = text.trim().slice(0, TEXT_MAX);
  return { survey, score, ...(clean ? { text: clean, wantsReply: !!wantsReply } : {}) };
}

/** Average to show, or null when there are too few answers (the server may also omit it). */
export function shownAverage(a: FeedbackAgg): number | null {
  if (a.count < MIN_ANSWERS) return null;
  if (typeof a.average === 'number') return Math.round(a.average * 10) / 10;
  const n = a.distribution.reduce((s, x) => s + x, 0);
  return n ? Math.round((a.distribution.reduce((s, x, i) => s + x * (i + 1), 0) / n) * 10) / 10 : null;
}

/** Distribution as 5 counts (score 1..5), whatever length the server sends. */
export const dist5 = (d: number[] | undefined) => Array.from({ length: 5 }, (_, i) => Number(d?.[i] ?? 0) || 0);

// ---------------------------------------------------------------- status (once per app start)

let status: { userId: string; survey: SurveyId | null } | null = null;
let asking = '';
let onChange: (() => void) | null = null;
/** Re-render hook (Today), set by the card module. */
export const setSurveyChangeHandler = (fn: () => void) => { onChange = fn; };

/** The survey to show now, or null (unknown yet, none, or the server has no survey actions). */
export function currentSurvey(userId: string): SurveyId | null {
  if (!hasBackend()) return null;
  if (status?.userId === userId) return status.survey;
  if (asking !== userId) {
    asking = userId;
    call<{ survey: SurveyId | null }>('surveyStatus')
      .then((r) => { status = { userId, survey: r.survey === 'd3' || r.survey === 'd7' ? r.survey : null }; if (status.survey) onChange?.(); })
      .catch((e) => { if (isUnknownAction(e)) status = { userId, survey: null }; else asking = ''; }); // offline: ask again later
  }
  return null;
}
/** After an answer or a skip the card is done for this app run (the server keeps the state). */
export const closeSurvey = (userId: string) => { status = { userId, survey: null }; };

// ---------------------------------------------------------------- offline queue

const QKEY = 'outbox-survey';
let flushing = false;

/** Send now, or keep for later when offline. A server refusal is dropped (e.g. already answered). */
export async function sendSurvey(p: SurveyPayload): Promise<'sent' | 'queued' | 'dropped'> {
  try { await call('submitSurvey', { ...p }); return 'sent'; } catch (e) {
    if (!(e instanceof NetworkError)) return 'dropped';
    try {
      const list = (await kvGet<SurveyPayload[]>(QKEY)) ?? [];
      // one entry per survey: the newest wins
      await kvSet(QKEY, [...list.filter((x) => x.survey !== p.survey), p].slice(-4));
    } catch { /* no storage: lost, the server will ask again */ }
    return 'queued';
  }
}

export async function flushSurveyQueue(): Promise<number> {
  if (flushing || !hasBackend() || (typeof navigator !== 'undefined' && navigator.onLine === false)) return 0;
  flushing = true;
  let sent = 0;
  try {
    let list = (await kvGet<SurveyPayload[]>(QKEY)) ?? [];
    for (const p of [...list]) {
      try { await call('submitSurvey', { ...p }); sent++; } catch (e) { if (e instanceof NetworkError) break; }
      list = list.filter((x) => x !== p);
      await kvSet(QKEY, list);
    }
  } catch { /* storage unavailable */ } finally { flushing = false; }
  return sent;
}

export function initSurveyQueue(): void {
  addEventListener('online', () => { void flushSurveyQueue(); });
  setTimeout(() => void flushSurveyQueue(), 5000);
}
