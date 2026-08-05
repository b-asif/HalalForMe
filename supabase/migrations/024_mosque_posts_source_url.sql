-- Add source URL to mosque_posts so event detail pages can be fetched/linked
ALTER TABLE public.mosque_posts
  ADD COLUMN IF NOT EXISTS source_url text;
