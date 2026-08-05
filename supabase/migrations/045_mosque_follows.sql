-- Users who follow a mosque for iqama time notifications.
-- The follow relationship is stored client-side (AsyncStorage) for the UI,
-- but also persisted here for signed-in users so the server can query
-- followers when iqama times are updated.

CREATE TABLE IF NOT EXISTS mosque_follows (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  mosque_id  uuid NOT NULL REFERENCES mosques(id)    ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, mosque_id)
);

ALTER TABLE mosque_follows ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'mosque_follows'
      AND policyname = 'users manage own mosque follows'
  ) THEN
    CREATE POLICY "users manage own mosque follows"
      ON mosque_follows FOR ALL
      USING  (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;
