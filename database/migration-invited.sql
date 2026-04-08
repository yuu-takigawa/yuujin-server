-- Add invited flag to users table
-- Users who register with a valid invite code get invited=1
-- Only invited users can upgrade to Pro for free during beta
ALTER TABLE users ADD COLUMN invited TINYINT(1) NOT NULL DEFAULT 0 AFTER membership;
