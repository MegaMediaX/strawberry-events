-- Pure expand: adds one index, alters nothing. Safe under a health-check
-- rollback, which can leave the previous image running on this schema.

-- Every verification lookup now filters on (email, flowHash) together, so the
-- bare email index no longer covers it. The old index stays: storeAndSendCode's
-- supersede and the expiry sweep still filter on email alone.

-- Correction to the note in 20260906160411_verification_flow_binding, which
-- cannot be edited without changing its checksum: that migration made flowHash
-- nullable so codes issued before it existed would keep working, and
-- checkVerificationCode had a matching branch that accepted a null flowHash from
-- any caller. That branch was a hole — a null row matched whatever token the
-- caller presented — and it protected nobody, because this table had never held
-- a row in production. The branch is gone. The column stays nullable, since
-- narrowing it would not be expand-only, but no code path can write a null.
CREATE INDEX "email_verification_codes_email_flowHash_idx"
  ON "email_verification_codes"("email", "flowHash");
