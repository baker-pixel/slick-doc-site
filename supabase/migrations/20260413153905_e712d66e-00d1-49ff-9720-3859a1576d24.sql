CREATE TABLE public.prospects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  business_type TEXT,
  website_url TEXT NOT NULL,
  gap_score INTEGER,
  top_weaknesses JSONB,
  recommended_tier TEXT CHECK (recommended_tier IN ('transformation', 'growth', 'optimization')),
  pdf_report_url TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'nurture', 'converted')),
  drip_step INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  converted_at TIMESTAMPTZ
);

ALTER TABLE public.prospects ENABLE ROW LEVEL SECURITY;

-- Anyone can insert (public form submission)
CREATE POLICY "Anyone can insert prospects"
  ON public.prospects FOR INSERT
  WITH CHECK (true);

-- Index for cron queries
CREATE INDEX idx_prospects_status_created ON public.prospects (status, created_at);
CREATE INDEX idx_prospects_email ON public.prospects (email);