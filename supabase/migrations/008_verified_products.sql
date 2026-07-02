-- 008_verified_products.sql
-- Admin-curated table of products with a confirmed halal/haram/unclear verdict.
-- When a barcode exists here, its verdict overrides the ingredient-analysis result
-- in the scanner. Populated by admins reviewing accumulated scan_reports.

CREATE TABLE IF NOT EXISTS public.verified_products (
  id           uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  barcode      text        NOT NULL UNIQUE,
  product_name text        NOT NULL,
  verdict      text        NOT NULL CHECK (verdict IN ('halal', 'haram', 'unclear')),
  -- How the verdict was established
  verified_by  text        NOT NULL DEFAULT 'admin'
                           CHECK (verified_by IN ('admin', 'certification')),
  -- Optional notes for the admin UI (e.g. "ISNA certified as of 2026-01")
  notes        text,
  created_at   timestamptz DEFAULT now() NOT NULL,
  updated_at   timestamptz DEFAULT now() NOT NULL
);

-- Fast barcode lookup on every scan
CREATE INDEX IF NOT EXISTS verified_products_barcode_idx
  ON public.verified_products (barcode);

-- Auto-update updated_at on row changes
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER verified_products_updated_at
  BEFORE UPDATE ON public.verified_products
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Row-Level Security
ALTER TABLE public.verified_products ENABLE ROW LEVEL SECURITY;

-- Anyone (including anonymous/guest) can read verified verdicts
CREATE POLICY "Public read access"
  ON public.verified_products FOR SELECT
  TO public USING (true);

-- Only admins can insert / update / delete
CREATE POLICY "Admin write access"
  ON public.verified_products FOR ALL
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true)
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_admin = true)
  );
