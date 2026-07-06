-- ================================================================
-- Migration 015: scan_reports table
-- Referenced by 008_verified_products.sql's comment ("Populated by admins
-- reviewing accumulated scan_reports") and inserted into by the Scanner
-- tab's "Report this result" flow (app/(tabs)/scanner.tsx).
--
-- NOTE: scan_reports already exists in the live database — it was created
-- ad-hoc, outside any tracked migration, when the report feature was first
-- built, and turned out to be missing the `status` column this migration
-- needs. Every statement below is written column-by-column with
-- IF NOT EXISTS / DROP ... IF EXISTS so it's safe to run whether the table
-- is missing entirely or already exists with an unknown subset of these
-- columns/constraints/policies.
-- ================================================================

CREATE TABLE IF NOT EXISTS public.scan_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid()
);

ALTER TABLE public.scan_reports ADD COLUMN IF NOT EXISTS barcode       text;
ALTER TABLE public.scan_reports ADD COLUMN IF NOT EXISTS product_name  text;
ALTER TABLE public.scan_reports ADD COLUMN IF NOT EXISTS report_reason text;
ALTER TABLE public.scan_reports ADD COLUMN IF NOT EXISTS verdict_shown text;
ALTER TABLE public.scan_reports ADD COLUMN IF NOT EXISTS status        text        DEFAULT 'pending';
ALTER TABLE public.scan_reports ADD COLUMN IF NOT EXISTS created_at    timestamptz DEFAULT now();

-- Backfill before enforcing NOT NULL, in case either column pre-existed with nulls.
UPDATE public.scan_reports SET status = 'pending' WHERE status IS NULL;
UPDATE public.scan_reports SET created_at = now() WHERE created_at IS NULL;
ALTER TABLE public.scan_reports ALTER COLUMN status     SET NOT NULL;
ALTER TABLE public.scan_reports ALTER COLUMN created_at SET NOT NULL;

-- CHECK constraints — dropped and recreated so this migration is safe to re-run.
ALTER TABLE public.scan_reports DROP CONSTRAINT IF EXISTS scan_reports_report_reason_check;
ALTER TABLE public.scan_reports ADD CONSTRAINT scan_reports_report_reason_check
  CHECK (report_reason IN (
    'Ingredients list is incorrect',
    'Verdict should be Halal',
    'Verdict should be Haram',
    'Wrong product matched to barcode',
    'Missing product information',
    'Other'
  ));

ALTER TABLE public.scan_reports DROP CONSTRAINT IF EXISTS scan_reports_verdict_shown_check;
ALTER TABLE public.scan_reports ADD CONSTRAINT scan_reports_verdict_shown_check
  CHECK (verdict_shown IN ('halal', 'haram', 'unclear', 'no_data'));

ALTER TABLE public.scan_reports DROP CONSTRAINT IF EXISTS scan_reports_status_check;
ALTER TABLE public.scan_reports ADD CONSTRAINT scan_reports_status_check
  CHECK (status IN ('pending', 'reviewed', 'dismissed'));

CREATE INDEX IF NOT EXISTS scan_reports_barcode_idx ON public.scan_reports (barcode);
CREATE INDEX IF NOT EXISTS scan_reports_status_idx  ON public.scan_reports (status);

ALTER TABLE public.scan_reports ENABLE ROW LEVEL SECURITY;

-- Scanning works for guests (no sign-in required), so reports have no
-- reporter_id / auth requirement — anyone can submit one.
DROP POLICY IF EXISTS "Anyone can create scan reports" ON public.scan_reports;
CREATE POLICY "Anyone can create scan reports"
  ON public.scan_reports FOR INSERT
  TO public
  WITH CHECK (true);

DROP POLICY IF EXISTS "Admins can view scan reports" ON public.scan_reports;
CREATE POLICY "Admins can view scan reports"
  ON public.scan_reports FOR SELECT
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true
  ));

DROP POLICY IF EXISTS "Admins can update scan reports" ON public.scan_reports;
CREATE POLICY "Admins can update scan reports"
  ON public.scan_reports FOR UPDATE
  TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true
  ));
