-- Every confirmation email sent, kept for 24 hours, so the sign-up form can't
-- be used to flood someone's inbox (limits in src/lib/reminders/signup.ts).
-- `ip_hash` is a SHA-256 of the day and the sender's IP address, so entries
-- can't be linked across days.
CREATE TABLE confirmation_sends (
  email TEXT NOT NULL,
  ip_hash TEXT,
  sent_at TEXT NOT NULL
);

CREATE INDEX confirmation_sends_email ON confirmation_sends (email, sent_at);
CREATE INDEX confirmation_sends_ip ON confirmation_sends (ip_hash, sent_at);
