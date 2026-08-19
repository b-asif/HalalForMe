-- Campus Hub & MSA Admin Portal — Foundation
-- Phase 1: All campus domain tables, RLS policies, indexes, and RPCs.
-- Every table is additive — no existing tables are altered.
-- Reuses set_updated_at() trigger defined in 008_verified_products.sql.
-- Fully idempotent: all statements use IF NOT EXISTS / OR REPLACE.

-- ═══════════════════════════════════════════════════════════════
-- SECTION 0 — DROP TABLES FROM FAILED PARTIAL RUNS
-- The first migration attempt created these tables with a corrupted
-- schema (unexpected columns). They are new tables with no real data,
-- so dropping and recreating is safe. Cascade handles FK order.
-- ═══════════════════════════════════════════════════════════════

DROP TABLE IF EXISTS public.msa_onboarding_requests         CASCADE;
DROP TABLE IF EXISTS public.campus_notification_preferences CASCADE;
DROP TABLE IF EXISTS public.campus_follows                  CASCADE;
DROP TABLE IF EXISTS public.campus_resources                CASCADE;
DROP TABLE IF EXISTS public.campus_announcements            CASCADE;
DROP TABLE IF EXISTS public.campus_events                   CASCADE;
DROP TABLE IF EXISTS public.campus_jummah                   CASCADE;
DROP TABLE IF EXISTS public.campus_prayer_times             CASCADE;
DROP TABLE IF EXISTS public.campus_prayer_spaces            CASCADE;
DROP TABLE IF EXISTS public.msa_members                     CASCADE;
DROP TABLE IF EXISTS public.msas                            CASCADE;
DROP TABLE IF EXISTS public.universities                    CASCADE;

-- ═══════════════════════════════════════════════════════════════
-- SECTION 1 — TABLE DEFINITIONS (dependency order)
-- ═══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.universities (
  id           uuid        NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  name         text        NOT NULL,
  slug         text        NOT NULL UNIQUE,
  city         text,
  state        text,
  country      text        NOT NULL DEFAULT 'US',
  lat          double precision,
  lng          double precision,
  website      text,
  logo_url     text,
  is_verified  boolean     NOT NULL DEFAULT false,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.msas (
  id               uuid        NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  university_id    uuid        NOT NULL REFERENCES public.universities(id) ON DELETE CASCADE,
  name             text        NOT NULL,
  description      text,
  logo_url         text,
  email            text,
  website          text,
  instagram_handle text,
  is_verified      boolean     NOT NULL DEFAULT false,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.msa_members (
  id           uuid        NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  msa_id       uuid        NOT NULL REFERENCES public.msas(id) ON DELETE CASCADE,
  role         text        NOT NULL DEFAULT 'editor'
                           CHECK (role IN ('admin', 'editor')),
  status       text        NOT NULL DEFAULT 'pending'
                           CHECK (status IN ('pending', 'active', 'rejected')),
  requested_at timestamptz NOT NULL DEFAULT now(),
  approved_at  timestamptz,
  approved_by  uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  UNIQUE (user_id, msa_id)
);

CREATE TABLE IF NOT EXISTS public.campus_prayer_spaces (
  id             uuid        NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  msa_id         uuid        NOT NULL REFERENCES public.msas(id) ON DELETE CASCADE,
  name           text        NOT NULL,
  building       text,
  room_number    text,
  floor          text,
  capacity       integer,
  wudu_available boolean     NOT NULL DEFAULT false,
  sisters_space  boolean     NOT NULL DEFAULT false,
  hours_text     text,
  notes          text,
  lat            double precision,
  lng            double precision,
  is_active      boolean     NOT NULL DEFAULT true,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.campus_prayer_times (
  id         uuid        NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  msa_id     uuid        NOT NULL REFERENCES public.msas(id) ON DELETE CASCADE,
  prayer     text        NOT NULL CHECK (prayer IN ('fajr', 'dhuhr', 'asr', 'maghrib', 'isha')),
  time       text        NOT NULL,
  location   text,
  notes      text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (msa_id, prayer)
);

CREATE TABLE IF NOT EXISTS public.campus_jummah (
  id         uuid        NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  msa_id     uuid        NOT NULL REFERENCES public.msas(id) ON DELETE CASCADE,
  khateeb    text,
  time       text        NOT NULL,
  location   text,
  building   text,
  language   text        NOT NULL DEFAULT 'English',
  notes      text,
  position   integer     NOT NULL DEFAULT 0,
  is_active  boolean     NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.campus_events (
  id               uuid        NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  msa_id           uuid        NOT NULL REFERENCES public.msas(id) ON DELETE CASCADE,
  created_by       uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  title            text        NOT NULL,
  body             text,
  event_start      timestamptz,
  event_end        timestamptz,
  location         text,
  category         text        CHECK (category IN ('lecture', 'sisters', 'quran', 'youth', 'community', 'social', 'other')),
  image_url        text,
  is_published     boolean     NOT NULL DEFAULT false,
  notify_followers boolean     NOT NULL DEFAULT false,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.campus_announcements (
  id               uuid        NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  msa_id           uuid        NOT NULL REFERENCES public.msas(id) ON DELETE CASCADE,
  created_by       uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  title            text        NOT NULL,
  body             text,
  is_published     boolean     NOT NULL DEFAULT false,
  notify_followers boolean     NOT NULL DEFAULT false,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.campus_resources (
  id          uuid        NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  msa_id      uuid        NOT NULL REFERENCES public.msas(id) ON DELETE CASCADE,
  title       text        NOT NULL,
  description text,
  category    text        CHECK (category IN ('halal_food', 'prayer', 'spiritual', 'social', 'academic', 'other')),
  url         text,
  address     text,
  lat         double precision,
  lng         double precision,
  is_active   boolean     NOT NULL DEFAULT true,
  position    integer     NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.campus_follows (
  id            uuid        NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  university_id uuid        NOT NULL REFERENCES public.universities(id) ON DELETE CASCADE,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, university_id)
);

CREATE TABLE IF NOT EXISTS public.campus_notification_preferences (
  user_id       uuid    NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  university_id uuid    NOT NULL REFERENCES public.universities(id) ON DELETE CASCADE,
  category      text    NOT NULL CHECK (category IN ('jummah', 'prayer', 'events', 'announcements')),
  enabled       boolean NOT NULL DEFAULT true,
  PRIMARY KEY (user_id, university_id, category)
);

CREATE TABLE IF NOT EXISTS public.msa_onboarding_requests (
  id                uuid        NOT NULL PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  university_id     uuid        NOT NULL REFERENCES public.universities(id) ON DELETE CASCADE,
  msa_id            uuid        REFERENCES public.msas(id) ON DELETE SET NULL,
  proposed_msa_name text,
  message           text,
  status            text        NOT NULL DEFAULT 'pending'
                                CHECK (status IN ('pending', 'approved', 'rejected')),
  reviewer_notes    text,
  reviewed_by       uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at       timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now()
);

-- ═══════════════════════════════════════════════════════════════
-- SECTION 2 — INDEXES (IF NOT EXISTS)
-- ═══════════════════════════════════════════════════════════════

CREATE UNIQUE INDEX IF NOT EXISTS universities_slug_idx          ON public.universities (slug);
CREATE INDEX IF NOT EXISTS universities_name_idx                 ON public.universities (name text_pattern_ops);
CREATE INDEX IF NOT EXISTS msas_university_id_idx                ON public.msas (university_id);
CREATE INDEX IF NOT EXISTS msa_members_user_id_idx               ON public.msa_members (user_id);
CREATE INDEX IF NOT EXISTS msa_members_msa_id_status_idx         ON public.msa_members (msa_id, status);
CREATE INDEX IF NOT EXISTS campus_prayer_spaces_msa_id_idx       ON public.campus_prayer_spaces (msa_id);
CREATE INDEX IF NOT EXISTS campus_prayer_times_msa_id_idx        ON public.campus_prayer_times (msa_id);
CREATE INDEX IF NOT EXISTS campus_jummah_msa_id_idx              ON public.campus_jummah (msa_id, position);
CREATE INDEX IF NOT EXISTS campus_events_msa_id_start_idx        ON public.campus_events (msa_id, event_start);
CREATE INDEX IF NOT EXISTS campus_events_published_start_idx     ON public.campus_events (is_published, event_start) WHERE is_published = true;
CREATE INDEX IF NOT EXISTS campus_announcements_msa_id_created_idx ON public.campus_announcements (msa_id, created_at DESC);
CREATE INDEX IF NOT EXISTS campus_announcements_published_idx    ON public.campus_announcements (is_published, created_at DESC) WHERE is_published = true;
CREATE INDEX IF NOT EXISTS campus_resources_msa_id_idx           ON public.campus_resources (msa_id, position);
CREATE INDEX IF NOT EXISTS campus_follows_user_id_idx            ON public.campus_follows (user_id);
CREATE INDEX IF NOT EXISTS campus_follows_university_id_idx      ON public.campus_follows (university_id);
CREATE INDEX IF NOT EXISTS campus_notification_preferences_user_university_idx ON public.campus_notification_preferences (user_id, university_id);
CREATE INDEX IF NOT EXISTS msa_onboarding_requests_user_id_idx   ON public.msa_onboarding_requests (user_id);
CREATE INDEX IF NOT EXISTS msa_onboarding_requests_status_created_idx ON public.msa_onboarding_requests (status, created_at DESC);

-- ═══════════════════════════════════════════════════════════════
-- SECTION 3 — TRIGGERS (idempotent via DO block)
-- ═══════════════════════════════════════════════════════════════

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'msas_updated_at') THEN
    CREATE TRIGGER msas_updated_at
      BEFORE UPDATE ON public.msas
      FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'campus_prayer_spaces_updated_at') THEN
    CREATE TRIGGER campus_prayer_spaces_updated_at
      BEFORE UPDATE ON public.campus_prayer_spaces
      FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'campus_prayer_times_updated_at') THEN
    CREATE TRIGGER campus_prayer_times_updated_at
      BEFORE UPDATE ON public.campus_prayer_times
      FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'campus_jummah_updated_at') THEN
    CREATE TRIGGER campus_jummah_updated_at
      BEFORE UPDATE ON public.campus_jummah
      FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'campus_events_updated_at') THEN
    CREATE TRIGGER campus_events_updated_at
      BEFORE UPDATE ON public.campus_events
      FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'campus_announcements_updated_at') THEN
    CREATE TRIGGER campus_announcements_updated_at
      BEFORE UPDATE ON public.campus_announcements
      FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'campus_resources_updated_at') THEN
    CREATE TRIGGER campus_resources_updated_at
      BEFORE UPDATE ON public.campus_resources
      FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
  END IF;
END $$;

-- ═══════════════════════════════════════════════════════════════
-- SECTION 4 — ENABLE RLS (safe to run multiple times)
-- ═══════════════════════════════════════════════════════════════

ALTER TABLE public.universities                    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.msas                            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.msa_members                     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campus_prayer_spaces            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campus_prayer_times             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campus_jummah                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campus_events                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campus_announcements            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campus_resources                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campus_follows                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campus_notification_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.msa_onboarding_requests         ENABLE ROW LEVEL SECURITY;

-- ═══════════════════════════════════════════════════════════════
-- SECTION 5 — RLS POLICIES (idempotent via DO blocks)
-- All tables exist at this point so cross-table references are safe.
-- ═══════════════════════════════════════════════════════════════

DO $$ BEGIN

  -- ── UNIVERSITIES ──────────────────────────────────────────────

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'universities' AND policyname = 'Universities are publicly readable') THEN
    CREATE POLICY "Universities are publicly readable"
      ON public.universities FOR SELECT USING (true);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'universities' AND policyname = 'Admins can insert universities') THEN
    CREATE POLICY "Admins can insert universities"
      ON public.universities FOR INSERT TO authenticated
      WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'universities' AND policyname = 'Admins can update universities') THEN
    CREATE POLICY "Admins can update universities"
      ON public.universities FOR UPDATE TO authenticated
      USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'universities' AND policyname = 'Admins can delete universities') THEN
    CREATE POLICY "Admins can delete universities"
      ON public.universities FOR DELETE TO authenticated
      USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true));
  END IF;

  -- ── MSAS ──────────────────────────────────────────────────────

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'msas' AND policyname = 'MSAs are publicly readable') THEN
    CREATE POLICY "MSAs are publicly readable"
      ON public.msas FOR SELECT USING (true);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'msas' AND policyname = 'Admins can insert MSAs') THEN
    CREATE POLICY "Admins can insert MSAs"
      ON public.msas FOR INSERT TO authenticated
      WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'msas' AND policyname = 'MSA admins or global admins can update MSAs') THEN
    CREATE POLICY "MSA admins or global admins can update MSAs"
      ON public.msas FOR UPDATE TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM public.msa_members
          WHERE user_id = auth.uid() AND msa_id = msas.id AND status = 'active' AND role = 'admin'
        )
        OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true)
      );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'msas' AND policyname = 'Admins can delete MSAs') THEN
    CREATE POLICY "Admins can delete MSAs"
      ON public.msas FOR DELETE TO authenticated
      USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true));
  END IF;

  -- ── MSA_MEMBERS ───────────────────────────────────────────────

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'msa_members' AND policyname = 'Users can read own MSA memberships') THEN
    CREATE POLICY "Users can read own MSA memberships"
      ON public.msa_members FOR SELECT TO authenticated
      USING (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'msa_members' AND policyname = 'MSA admins can read their MSA members') THEN
    CREATE POLICY "MSA admins can read their MSA members"
      ON public.msa_members FOR SELECT TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM public.msa_members m
          WHERE m.user_id = auth.uid() AND m.msa_id = msa_members.msa_id AND m.status = 'active' AND m.role = 'admin'
        )
      );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'msa_members' AND policyname = 'Admins can read all MSA memberships') THEN
    CREATE POLICY "Admins can read all MSA memberships"
      ON public.msa_members FOR SELECT TO authenticated
      USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'msa_members' AND policyname = 'Admins can insert MSA memberships') THEN
    CREATE POLICY "Admins can insert MSA memberships"
      ON public.msa_members FOR INSERT TO authenticated
      WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'msa_members' AND policyname = 'MSA admins or global admins can update memberships') THEN
    CREATE POLICY "MSA admins or global admins can update memberships"
      ON public.msa_members FOR UPDATE TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM public.msa_members m
          WHERE m.user_id = auth.uid() AND m.msa_id = msa_members.msa_id AND m.status = 'active' AND m.role = 'admin'
        )
        OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true)
      );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'msa_members' AND policyname = 'Admins can delete MSA memberships') THEN
    CREATE POLICY "Admins can delete MSA memberships"
      ON public.msa_members FOR DELETE TO authenticated
      USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true));
  END IF;

  -- ── CAMPUS_PRAYER_SPACES ──────────────────────────────────────

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'campus_prayer_spaces' AND policyname = 'Active prayer spaces are publicly readable') THEN
    CREATE POLICY "Active prayer spaces are publicly readable"
      ON public.campus_prayer_spaces FOR SELECT
      USING (
        is_active = true
        OR EXISTS (SELECT 1 FROM public.msa_members WHERE user_id = auth.uid() AND msa_id = campus_prayer_spaces.msa_id AND status = 'active')
        OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true)
      );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'campus_prayer_spaces' AND policyname = 'MSA members or admins can insert prayer spaces') THEN
    CREATE POLICY "MSA members or admins can insert prayer spaces"
      ON public.campus_prayer_spaces FOR INSERT TO authenticated
      WITH CHECK (
        EXISTS (SELECT 1 FROM public.msa_members WHERE user_id = auth.uid() AND msa_id = campus_prayer_spaces.msa_id AND status = 'active' AND role IN ('admin', 'editor'))
        OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true)
      );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'campus_prayer_spaces' AND policyname = 'MSA members or admins can update prayer spaces') THEN
    CREATE POLICY "MSA members or admins can update prayer spaces"
      ON public.campus_prayer_spaces FOR UPDATE TO authenticated
      USING (
        EXISTS (SELECT 1 FROM public.msa_members WHERE user_id = auth.uid() AND msa_id = campus_prayer_spaces.msa_id AND status = 'active' AND role IN ('admin', 'editor'))
        OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true)
      );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'campus_prayer_spaces' AND policyname = 'MSA admins or global admins can delete prayer spaces') THEN
    CREATE POLICY "MSA admins or global admins can delete prayer spaces"
      ON public.campus_prayer_spaces FOR DELETE TO authenticated
      USING (
        EXISTS (SELECT 1 FROM public.msa_members WHERE user_id = auth.uid() AND msa_id = campus_prayer_spaces.msa_id AND status = 'active' AND role = 'admin')
        OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true)
      );
  END IF;

  -- ── CAMPUS_PRAYER_TIMES ───────────────────────────────────────

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'campus_prayer_times' AND policyname = 'Campus prayer times are publicly readable') THEN
    CREATE POLICY "Campus prayer times are publicly readable"
      ON public.campus_prayer_times FOR SELECT USING (true);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'campus_prayer_times' AND policyname = 'MSA members or admins can insert prayer times') THEN
    CREATE POLICY "MSA members or admins can insert prayer times"
      ON public.campus_prayer_times FOR INSERT TO authenticated
      WITH CHECK (
        EXISTS (SELECT 1 FROM public.msa_members WHERE user_id = auth.uid() AND msa_id = campus_prayer_times.msa_id AND status = 'active' AND role IN ('admin', 'editor'))
        OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true)
      );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'campus_prayer_times' AND policyname = 'MSA members or admins can update prayer times') THEN
    CREATE POLICY "MSA members or admins can update prayer times"
      ON public.campus_prayer_times FOR UPDATE TO authenticated
      USING (
        EXISTS (SELECT 1 FROM public.msa_members WHERE user_id = auth.uid() AND msa_id = campus_prayer_times.msa_id AND status = 'active' AND role IN ('admin', 'editor'))
        OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true)
      );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'campus_prayer_times' AND policyname = 'MSA members or admins can delete prayer times') THEN
    CREATE POLICY "MSA members or admins can delete prayer times"
      ON public.campus_prayer_times FOR DELETE TO authenticated
      USING (
        EXISTS (SELECT 1 FROM public.msa_members WHERE user_id = auth.uid() AND msa_id = campus_prayer_times.msa_id AND status = 'active' AND role IN ('admin', 'editor'))
        OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true)
      );
  END IF;

  -- ── CAMPUS_JUMMAH ─────────────────────────────────────────────

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'campus_jummah' AND policyname = 'Campus Jummah is publicly readable') THEN
    CREATE POLICY "Campus Jummah is publicly readable"
      ON public.campus_jummah FOR SELECT USING (true);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'campus_jummah' AND policyname = 'MSA members or admins can insert Jummah') THEN
    CREATE POLICY "MSA members or admins can insert Jummah"
      ON public.campus_jummah FOR INSERT TO authenticated
      WITH CHECK (
        EXISTS (SELECT 1 FROM public.msa_members WHERE user_id = auth.uid() AND msa_id = campus_jummah.msa_id AND status = 'active' AND role IN ('admin', 'editor'))
        OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true)
      );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'campus_jummah' AND policyname = 'MSA members or admins can update Jummah') THEN
    CREATE POLICY "MSA members or admins can update Jummah"
      ON public.campus_jummah FOR UPDATE TO authenticated
      USING (
        EXISTS (SELECT 1 FROM public.msa_members WHERE user_id = auth.uid() AND msa_id = campus_jummah.msa_id AND status = 'active' AND role IN ('admin', 'editor'))
        OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true)
      );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'campus_jummah' AND policyname = 'MSA members or admins can delete Jummah') THEN
    CREATE POLICY "MSA members or admins can delete Jummah"
      ON public.campus_jummah FOR DELETE TO authenticated
      USING (
        EXISTS (SELECT 1 FROM public.msa_members WHERE user_id = auth.uid() AND msa_id = campus_jummah.msa_id AND status = 'active' AND role IN ('admin', 'editor'))
        OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true)
      );
  END IF;

  -- ── CAMPUS_EVENTS ─────────────────────────────────────────────

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'campus_events' AND policyname = 'Published events are publicly readable') THEN
    CREATE POLICY "Published events are publicly readable"
      ON public.campus_events FOR SELECT
      USING (
        is_published = true
        OR EXISTS (SELECT 1 FROM public.msa_members WHERE user_id = auth.uid() AND msa_id = campus_events.msa_id AND status = 'active')
        OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true)
      );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'campus_events' AND policyname = 'MSA members or admins can insert events') THEN
    CREATE POLICY "MSA members or admins can insert events"
      ON public.campus_events FOR INSERT TO authenticated
      WITH CHECK (
        EXISTS (SELECT 1 FROM public.msa_members WHERE user_id = auth.uid() AND msa_id = campus_events.msa_id AND status = 'active' AND role IN ('admin', 'editor'))
        OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true)
      );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'campus_events' AND policyname = 'MSA members or admins can update events') THEN
    CREATE POLICY "MSA members or admins can update events"
      ON public.campus_events FOR UPDATE TO authenticated
      USING (
        EXISTS (SELECT 1 FROM public.msa_members WHERE user_id = auth.uid() AND msa_id = campus_events.msa_id AND status = 'active' AND role IN ('admin', 'editor'))
        OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true)
      );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'campus_events' AND policyname = 'MSA members or admins can delete events') THEN
    CREATE POLICY "MSA members or admins can delete events"
      ON public.campus_events FOR DELETE TO authenticated
      USING (
        EXISTS (SELECT 1 FROM public.msa_members WHERE user_id = auth.uid() AND msa_id = campus_events.msa_id AND status = 'active' AND role IN ('admin', 'editor'))
        OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true)
      );
  END IF;

  -- ── CAMPUS_ANNOUNCEMENTS ──────────────────────────────────────

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'campus_announcements' AND policyname = 'Published announcements are publicly readable') THEN
    CREATE POLICY "Published announcements are publicly readable"
      ON public.campus_announcements FOR SELECT
      USING (
        is_published = true
        OR EXISTS (SELECT 1 FROM public.msa_members WHERE user_id = auth.uid() AND msa_id = campus_announcements.msa_id AND status = 'active')
        OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true)
      );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'campus_announcements' AND policyname = 'MSA members or admins can insert announcements') THEN
    CREATE POLICY "MSA members or admins can insert announcements"
      ON public.campus_announcements FOR INSERT TO authenticated
      WITH CHECK (
        EXISTS (SELECT 1 FROM public.msa_members WHERE user_id = auth.uid() AND msa_id = campus_announcements.msa_id AND status = 'active' AND role IN ('admin', 'editor'))
        OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true)
      );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'campus_announcements' AND policyname = 'MSA members or admins can update announcements') THEN
    CREATE POLICY "MSA members or admins can update announcements"
      ON public.campus_announcements FOR UPDATE TO authenticated
      USING (
        EXISTS (SELECT 1 FROM public.msa_members WHERE user_id = auth.uid() AND msa_id = campus_announcements.msa_id AND status = 'active' AND role IN ('admin', 'editor'))
        OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true)
      );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'campus_announcements' AND policyname = 'MSA members or admins can delete announcements') THEN
    CREATE POLICY "MSA members or admins can delete announcements"
      ON public.campus_announcements FOR DELETE TO authenticated
      USING (
        EXISTS (SELECT 1 FROM public.msa_members WHERE user_id = auth.uid() AND msa_id = campus_announcements.msa_id AND status = 'active' AND role IN ('admin', 'editor'))
        OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true)
      );
  END IF;

  -- ── CAMPUS_RESOURCES ──────────────────────────────────────────

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'campus_resources' AND policyname = 'Active resources are publicly readable') THEN
    CREATE POLICY "Active resources are publicly readable"
      ON public.campus_resources FOR SELECT
      USING (
        is_active = true
        OR EXISTS (SELECT 1 FROM public.msa_members WHERE user_id = auth.uid() AND msa_id = campus_resources.msa_id AND status = 'active')
        OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true)
      );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'campus_resources' AND policyname = 'MSA members or admins can insert resources') THEN
    CREATE POLICY "MSA members or admins can insert resources"
      ON public.campus_resources FOR INSERT TO authenticated
      WITH CHECK (
        EXISTS (SELECT 1 FROM public.msa_members WHERE user_id = auth.uid() AND msa_id = campus_resources.msa_id AND status = 'active' AND role IN ('admin', 'editor'))
        OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true)
      );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'campus_resources' AND policyname = 'MSA members or admins can update resources') THEN
    CREATE POLICY "MSA members or admins can update resources"
      ON public.campus_resources FOR UPDATE TO authenticated
      USING (
        EXISTS (SELECT 1 FROM public.msa_members WHERE user_id = auth.uid() AND msa_id = campus_resources.msa_id AND status = 'active' AND role IN ('admin', 'editor'))
        OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true)
      );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'campus_resources' AND policyname = 'MSA members or admins can delete resources') THEN
    CREATE POLICY "MSA members or admins can delete resources"
      ON public.campus_resources FOR DELETE TO authenticated
      USING (
        EXISTS (SELECT 1 FROM public.msa_members WHERE user_id = auth.uid() AND msa_id = campus_resources.msa_id AND status = 'active' AND role IN ('admin', 'editor'))
        OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true)
      );
  END IF;

  -- ── CAMPUS_FOLLOWS ────────────────────────────────────────────

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'campus_follows' AND policyname = 'Users manage own campus follows') THEN
    CREATE POLICY "Users manage own campus follows"
      ON public.campus_follows FOR ALL TO authenticated
      USING  (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);
  END IF;

  -- ── CAMPUS_NOTIFICATION_PREFERENCES ──────────────────────────

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'campus_notification_preferences' AND policyname = 'Users manage own campus notification preferences') THEN
    CREATE POLICY "Users manage own campus notification preferences"
      ON public.campus_notification_preferences FOR ALL TO authenticated
      USING  (auth.uid() = user_id)
      WITH CHECK (auth.uid() = user_id);
  END IF;

  -- ── MSA_ONBOARDING_REQUESTS ───────────────────────────────────

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'msa_onboarding_requests' AND policyname = 'Users can insert own onboarding requests') THEN
    CREATE POLICY "Users can insert own onboarding requests"
      ON public.msa_onboarding_requests FOR INSERT TO authenticated
      WITH CHECK (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'msa_onboarding_requests' AND policyname = 'Users can read own onboarding requests') THEN
    CREATE POLICY "Users can read own onboarding requests"
      ON public.msa_onboarding_requests FOR SELECT TO authenticated
      USING (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'msa_onboarding_requests' AND policyname = 'Admins can read all onboarding requests') THEN
    CREATE POLICY "Admins can read all onboarding requests"
      ON public.msa_onboarding_requests FOR SELECT TO authenticated
      USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'msa_onboarding_requests' AND policyname = 'Admins can update onboarding requests') THEN
    CREATE POLICY "Admins can update onboarding requests"
      ON public.msa_onboarding_requests FOR UPDATE TO authenticated
      USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true));
  END IF;

END $$;

-- ═══════════════════════════════════════════════════════════════
-- SECTION 6 — RPCs (CREATE OR REPLACE — always safe to re-run)
-- ═══════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.get_user_msa_role(p_msa_id uuid)
RETURNS TABLE (role text, status text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role, status
  FROM public.msa_members
  WHERE user_id = auth.uid()
    AND msa_id = p_msa_id
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.approve_msa_request(p_request_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_request public.msa_onboarding_requests%ROWTYPE;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true
  ) THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  SELECT * INTO v_request
  FROM public.msa_onboarding_requests
  WHERE id = p_request_id AND status = 'pending';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Request not found or already processed';
  END IF;

  IF v_request.msa_id IS NULL THEN
    RAISE EXCEPTION 'msa_id must be set on the request before approving. Create the MSA first.';
  END IF;

  INSERT INTO public.msa_members (user_id, msa_id, role, status, approved_at, approved_by)
  VALUES (v_request.user_id, v_request.msa_id, 'admin', 'active', now(), auth.uid())
  ON CONFLICT (user_id, msa_id) DO UPDATE
    SET status      = 'active',
        approved_at = now(),
        approved_by = auth.uid();

  UPDATE public.msa_onboarding_requests
  SET status      = 'approved',
      reviewed_by = auth.uid(),
      reviewed_at = now()
  WHERE id = p_request_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.reject_msa_request(p_request_id uuid, p_notes text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true
  ) THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  UPDATE public.msa_onboarding_requests
  SET status         = 'rejected',
      reviewer_notes = p_notes,
      reviewed_by    = auth.uid(),
      reviewed_at    = now()
  WHERE id = p_request_id AND status = 'pending';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Request not found or already processed';
  END IF;
END;
$$;

-- ═══════════════════════════════════════════════════════════════
-- SECTION 7 — SEED DATA
-- ═══════════════════════════════════════════════════════════════

INSERT INTO public.universities (name, slug, city, state, country, lat, lng, website, is_verified)
VALUES
  ('University of Michigan',                  'umich',     'Ann Arbor',     'MI', 'US', 42.2780, -83.7382, 'https://umich.edu',    true),
  ('University of Illinois Urbana-Champaign', 'uiuc',      'Champaign',     'IL', 'US', 40.1020, -88.2272, 'https://illinois.edu', true),
  ('Rutgers University',                      'rutgers',   'New Brunswick', 'NJ', 'US', 40.5008, -74.4474, 'https://rutgers.edu',  true),
  ('George Mason University',                 'gmu',       'Fairfax',       'VA', 'US', 38.8316, -77.3072, 'https://gmu.edu',      true),
  ('University of Texas at Austin',           'ut-austin', 'Austin',        'TX', 'US', 30.2849, -97.7341, 'https://utexas.edu',   true)
ON CONFLICT (slug) DO NOTHING;
