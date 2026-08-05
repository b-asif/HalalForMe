-- 017_mosques.sql
-- Claimable mosque pages (concierge onboarding model — see CHANGELOG).
-- Mosque *locations* still come live from OpenStreetMap Overpass
-- (lib/mosques/overpass.ts) and are never bulk-imported here. A row in this
-- table only exists once an admin has personally onboarded that specific
-- mosque, anchored to its stable OSM id ("node/12345" / "way/67890").

CREATE TABLE IF NOT EXISTS public.mosques (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  osm_id         text        NOT NULL UNIQUE,
  name           text        NOT NULL,
  address        text,
  lat            double precision,
  lng            double precision,
  owner_id       uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  -- One-time code the admin hands to the mosque contact out-of-band (in
  -- person / phone / email) so they can claim ownership themselves via
  -- redeem_mosque_invite() below, without the app ever needing to look up
  -- an email against auth.users (not queryable client-side).
  invite_code    text        UNIQUE,
  description    text,
  contact_phone  text,
  contact_email  text,
  website        text,
  iqama_times    jsonb,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS mosques_osm_id_idx ON public.mosques (osm_id);
CREATE INDEX IF NOT EXISTS mosques_owner_id_idx ON public.mosques (owner_id);

-- Reuses the set_updated_at() trigger function first defined in
-- 008_verified_products.sql.
CREATE TRIGGER mosques_updated_at
  BEFORE UPDATE ON public.mosques
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.mosques ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read access on mosques"
  ON public.mosques FOR SELECT
  TO public USING (true);

-- Only admins create mosque pages (concierge model — no public claim flow).
CREATE POLICY "Admins can create mosques"
  ON public.mosques FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true)
  );

-- Owners maintain their own page; admins can maintain any (e.g. reassigning
-- an owner or fixing details). Ownership itself is granted only via the
-- redeem_mosque_invite() RPC below, not through this policy.
CREATE POLICY "Owner or admin can update mosques"
  ON public.mosques FOR UPDATE
  TO authenticated
  USING (
    owner_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true)
  )
  WITH CHECK (
    owner_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true)
  );

-- Events and announcements share one table — both are "title + optional
-- body + optional time window, posted by the verified owner"; a type
-- discriminator avoids two near-duplicate tables and screens.
CREATE TABLE IF NOT EXISTS public.mosque_posts (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  mosque_id    uuid        NOT NULL REFERENCES public.mosques(id) ON DELETE CASCADE,
  created_by   uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  type         text        NOT NULL CHECK (type IN ('event', 'announcement')),
  title        text        NOT NULL,
  body         text,
  event_start  timestamptz,
  event_end    timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS mosque_posts_mosque_id_idx ON public.mosque_posts (mosque_id);
CREATE INDEX IF NOT EXISTS mosque_posts_event_start_idx ON public.mosque_posts (event_start);

CREATE TRIGGER mosque_posts_updated_at
  BEFORE UPDATE ON public.mosque_posts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.mosque_posts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read access on mosque_posts"
  ON public.mosque_posts FOR SELECT
  TO public USING (true);

CREATE POLICY "Mosque owner or admin manages posts"
  ON public.mosque_posts FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.mosques m
      WHERE m.id = mosque_id
        AND (m.owner_id = auth.uid()
             OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true))
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.mosques m
      WHERE m.id = mosque_id
        AND (m.owner_id = auth.uid()
             OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true))
    )
  );

-- Redeem flow: the mosque contact enters the code the admin gave them
-- out-of-band. SECURITY DEFINER so it can grant ownership without a client
-- ever needing broad UPDATE access to unclaimed mosques (which a plain RLS
-- policy couldn't safely express without also checking the code itself).
CREATE OR REPLACE FUNCTION public.redeem_mosque_invite(p_code text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_mosque_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sign in required';
  END IF;

  UPDATE public.mosques
  SET owner_id = auth.uid()
  WHERE invite_code = p_code
    AND owner_id IS NULL
  RETURNING id INTO v_mosque_id;

  IF v_mosque_id IS NULL THEN
    RAISE EXCEPTION 'Invalid or already-used invite code';
  END IF;

  RETURN v_mosque_id;
END;
$$;

REVOKE ALL ON FUNCTION public.redeem_mosque_invite(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.redeem_mosque_invite(text) TO authenticated;
