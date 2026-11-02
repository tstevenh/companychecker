// Which deadline reminders are due today. Pure logic; the daily job in
// src/lib/server/reminders.ts feeds it live Companies House dates.

import { daysUntil } from '../company-lookup.ts';

export type DeadlineKind = 'confirmation-statement' | 'accounts';

export interface Deadline {
  kind: DeadlineKind;
  dueOn: string;
}

export interface DueReminder extends Deadline {
  // Days before the deadline this reminder is for: 30 or 7.
  stage: number;
  daysLeft: number;
}

// A reminder a month ahead and another a week ahead. A run that is missed (or
// a sign-up made inside the window) still sends the stage it falls in, and only
// the nearest stage goes out, so nobody gets two emails for one deadline at once.
export const STAGES = [7, 30] as const;

export function sentKey(kind: string, dueOn: string, stage: number): string {
  return `${kind}|${dueOn}|${stage}`;
}

export function stageFor(daysLeft: number): number | null {
  if (daysLeft < 0) return null;
  return STAGES.find((stage) => daysLeft <= stage) ?? null;
}

export function remindersDue(deadlines: Deadline[], alreadySent: Set<string>, today = new Date()): DueReminder[] {
  const due: DueReminder[] = [];
  for (const deadline of deadlines) {
    const daysLeft = daysUntil(deadline.dueOn, today);
    if (daysLeft === null) continue;
    const stage = stageFor(daysLeft);
    if (stage === null || alreadySent.has(sentKey(deadline.kind, deadline.dueOn, stage))) continue;
    due.push({ ...deadline, stage, daysLeft });
  }
  return due;
}
