-- Deadline reminder sign-ups. One row per email and company. Unsubscribing
-- deletes the row, and unconfirmed sign-ups are deleted after 7 days.
-- `token` goes in the confirm and unsubscribe links, so it is long and random.
CREATE TABLE subscriptions (
  token TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  company_number TEXT NOT NULL,
  company_name TEXT NOT NULL,
  -- 1 when the person ticked "also send me occasional offers".
  offers INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  -- When the confirmation email was last sent, to stop repeat sends.
  confirm_sent_at TEXT,
  confirmed_at TEXT,
  -- The day (YYYY-MM-DD) the reminder job last checked this company's dates.
  checked_on TEXT,
  UNIQUE (email, company_number)
);

CREATE INDEX subscriptions_to_check ON subscriptions (checked_on, company_number)
  WHERE confirmed_at IS NOT NULL;

-- One row per reminder sent, so each stage of each deadline goes out once.
-- `stage` is the number of days before the deadline it is for (30 or 7).
CREATE TABLE reminders_sent (
  token TEXT NOT NULL,
  kind TEXT NOT NULL,
  due_on TEXT NOT NULL,
  stage INTEGER NOT NULL,
  sent_at TEXT NOT NULL,
  PRIMARY KEY (token, kind, due_on, stage)
);
