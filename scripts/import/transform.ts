// Turns Basic Company Data CSV records into index rows. Field names follow
// Companies House's file header (some have leading spaces, which are trimmed
// before this runs).

import type { CompanyRow } from '../../src/lib/company-index/format.ts';

export type CompanyRecord = Record<string, string>;

// "dd/mm/yyyy" -> "yyyy-mm-dd"; empty or malformed -> "".
export function toIsoDate(value: string | undefined): string {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec((value ?? '').trim());
  return match ? `${match[3]}-${match[2]}-${match[1]}` : '';
}

export function toCompanyRow(record: CompanyRecord): CompanyRow | null {
  const number = (record['CompanyNumber'] ?? '').trim();
  const name = (record['CompanyName'] ?? '').trim();
  if (!number || !name) return null;
  return {
    number,
    name,
    status: (record['CompanyStatus'] ?? '').trim(),
    incorporatedOn: toIsoDate(record['IncorporationDate']),
    accountsDue: toIsoDate(record['Accounts.NextDueDate']),
    confirmationStatementDue: toIsoDate(record['ConfStmtNextDueDate']),
  };
}
