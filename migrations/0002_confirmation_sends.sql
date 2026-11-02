-- Every confirmation email sent, kept for 24 hours, so the sign-up form can't
-- be used to flood someone's inbox (limits in src/lib/reminders/signup.ts).
-- `ip_hash` is a keyed hash of the sender's IP address that changes every day
-- (hashIp in src/lib/reminders/signup.ts).
CREATE TABLE confirmation_sends (
  email TEXT NOT NULL,
  ip_hash TEXT,
  sent_at TEXT NOT NULL
);

CREATE INDEX confirmation_sends_email ON confirmation_sends (email, sent_at);
CREATE INDEX confirmation_sends_ip ON confirmation_sends (ip_hash, sent_at);
