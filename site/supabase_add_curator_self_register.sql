-- Allow new users to insert their own curator record after email verification.
-- The existing policy only allows users already in curators to insert,
-- which makes self-registration impossible. This adds a policy for first-time
-- registration where the user's auth.uid() must match the row's id.

DROP POLICY IF EXISTS "Users can self-register as curator" ON curators;
CREATE POLICY "Users can self-register as curator"
  ON curators FOR INSERT
  WITH CHECK (auth.uid() = id);

-- Allow curators to update their own profile (name, affiliation, etc.)
DROP POLICY IF EXISTS "Curators can update own profile" ON curators;
CREATE POLICY "Curators can update own profile"
  ON curators FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);
