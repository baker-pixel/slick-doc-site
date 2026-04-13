

## Plan: Prospect Capture & Drip Campaign System

### Summary
Fix the n8n-callback build error, create a `prospects` table, build a gated Quick Analysis flow (URL → email gate → report), and wire up a 5-email drip campaign with a daily cron job.

---

### Step 1 — Fix build error in n8n-callback
The `const supabase = createClient(` line is misplaced before `try {`. Move it inside the `try` block after auth validation (lines 14-15 are swapped).

### Step 2 — Database migration
Create the `prospects` table:
```sql
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
  drip_step INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  converted_at TIMESTAMPTZ
);
ALTER TABLE public.prospects ENABLE ROW LEVEL SECURITY;
-- Public insert (anon users submit the form)
CREATE POLICY "Anyone can insert prospects" ON public.prospects FOR INSERT WITH CHECK (true);
-- Service role reads/updates via edge functions
```

Enable realtime for live status updates (optional).

### Step 3 — Refactor QuickAnalysis page (3-step gated flow)
Modify `src/pages/QuickAnalysis.tsx`:

1. **Step 1 — URL input**: Single field, validates URL, stores in state, advances to Step 2. No analysis yet.
2. **Step 2 — Email gate**: Modal/inline form for name, email, business type (Restaurant, Retail, Professional Services, Healthcare, Other). On submit: POST prospect to DB via Supabase insert, then invoke `analyze-website` in background. Show loading spinner.
3. **Step 3 — Report**: Display score, top 3 weaknesses in plain English, recommended tier (0-39 Transformation, 40-64 Growth, 65-100 Optimization), CTA buttons. Simultaneously trigger email via edge function.

### Step 4 — Edge function: `send-prospect-report`
New edge function that:
- Receives `{ prospectId }` 
- Reads prospect from DB
- Sends Email 1 via Resend (score, weaknesses, PDF link, book-a-call CTA)
- Updates prospect record with `gap_score`, `top_weaknesses`, `recommended_tier`

### Step 5 — Edge function: `run-prospect-drip`
New edge function (called by cron) that:
- Finds prospects where `status = 'pending'` AND `created_at <= NOW() - 48h` → sets `status = 'nurture'`, `drip_step = 1`
- Finds prospects where `status = 'nurture'` and sends the next email based on `drip_step` and timing:
  - Step 1 (Day 2): Email about top weakness
  - Step 2 (Day 4): Social proof email
  - Step 3 (Day 7): Pricing/services email
  - Step 4 (Day 10): Conversational close email
- Increments `drip_step` after each send
- Skips prospects where `status = 'converted'`

### Step 6 — Cron job
Schedule `run-prospect-drip` to run daily at 9 AM UTC via `pg_cron` + `pg_net`.

### Step 7 — Conversion tracking
Add a function in the QuickAnalysis report view and schedule page that, when a prospect books a call or signs up, updates their record to `status = 'converted'`, `converted_at = NOW()`. This stops drip emails.

### Step 8 — Config updates
- Add `run-prospect-drip` and `send-prospect-report` to `supabase/config.toml` with `verify_jwt = false`

---

### Technical details

**Tier mapping logic** (shared between frontend and edge function):
- Score 0-39 → `transformation`
- Score 40-64 → `growth`  
- Score 65-100 → `optimization`

**Email content**: All 5 emails use plain English, personalized with prospect data (`website_url`, `business_type`, `top_weaknesses`). Sent from `hello@orangedoormarketing.com` via Resend gateway.

**Files created/modified**:
- `supabase/migrations/[new].sql` — prospects table
- `src/pages/QuickAnalysis.tsx` — 3-step gated flow
- `supabase/functions/send-prospect-report/index.ts` — Email 1 + DB update
- `supabase/functions/run-prospect-drip/index.ts` — Daily drip processor
- `supabase/functions/n8n-callback/index.ts` — Fix build error
- `supabase/config.toml` — Add new function entries

