-- Seed task_templates for foundation, growth, and transformation tiers.
-- These mirror the workflow steps defined in seed-tier-workflow/index.ts.
-- automation_type: FULL = no human input, SEMI = needs human review, MANUAL = fully manual.

INSERT INTO public.task_templates
  (name, description, category, tier, automation_type, frequency, order_index, is_active)
VALUES

-- ── FOUNDATION tier (steps 1–8) ───────────────────────────────────────────
('Analyze current website performance',
 'Run automated website performance scan and collect baseline metrics.',
 'analysis', 'foundation', 'FULL', 'onboarding', 1, true),

('Run basic SEO audit',
 'Automated SEO audit covering title tags, meta descriptions, and backlink basics.',
 'seo', 'foundation', 'FULL', 'onboarding', 2, true),

('Generate marketing gap report',
 'AI-generated gap analysis report based on website and SEO audit data.',
 'report', 'foundation', 'FULL', 'onboarding', 3, true),

('Create Google Business Profile post',
 'Draft GBP post content for client review.',
 'content', 'foundation', 'SEMI', 'monthly', 4, true),

('Publish GBP post',
 'Publish approved GBP post via n8n automation.',
 'publishing', 'foundation', 'FULL', 'monthly', 5, true),

('Write blog article',
 'Draft blog article for client review.',
 'content', 'foundation', 'SEMI', 'monthly', 6, true),

('Publish blog article',
 'Publish approved blog article via n8n automation.',
 'publishing', 'foundation', 'FULL', 'monthly', 7, true),

('Generate quarterly SEO report',
 'Compile and deliver quarterly SEO performance report.',
 'report', 'foundation', 'SEMI', 'quarterly', 8, true),

-- ── GROWTH tier (foundation steps + extras 9–12) ─────────────────────────
('Analyze current website performance',
 'Run automated website performance scan and collect baseline metrics.',
 'analysis', 'growth', 'FULL', 'onboarding', 1, true),

('Run basic SEO audit',
 'Automated SEO audit covering title tags, meta descriptions, and backlink basics.',
 'seo', 'growth', 'FULL', 'onboarding', 2, true),

('Generate marketing gap report',
 'AI-generated gap analysis report based on website and SEO audit data.',
 'report', 'growth', 'FULL', 'onboarding', 3, true),

('Create Google Business Profile post',
 'Draft GBP post content for client review.',
 'content', 'growth', 'SEMI', 'monthly', 4, true),

('Publish GBP post',
 'Publish approved GBP post via n8n automation.',
 'publishing', 'growth', 'FULL', 'monthly', 5, true),

('Write blog article',
 'Draft blog article for client review.',
 'content', 'growth', 'SEMI', 'monthly', 6, true),

('Publish blog article',
 'Publish approved blog article via n8n automation.',
 'publishing', 'growth', 'FULL', 'monthly', 7, true),

('Generate quarterly SEO report',
 'Compile and deliver quarterly SEO performance report.',
 'report', 'growth', 'SEMI', 'quarterly', 8, true),

('Create email nurture sequence',
 'Draft email nurture sequence for lead follow-up.',
 'email', 'growth', 'SEMI', 'monthly', 9, true),

('Generate retargeting ad copy',
 'AI-generated retargeting ad copy for Google/Meta campaigns.',
 'advertising', 'growth', 'SEMI', 'monthly', 10, true),

('Create social media content batch',
 'Generate batch of social media posts for client approval.',
 'content', 'growth', 'SEMI', 'monthly', 11, true),

('Publish social content batch',
 'Publish approved social content via n8n automation.',
 'publishing', 'growth', 'FULL', 'monthly', 12, true),

-- ── TRANSFORMATION tier (foundation + growth + extras 13–17) ─────────────
('Analyze current website performance',
 'Run automated website performance scan and collect baseline metrics.',
 'analysis', 'transformation', 'FULL', 'onboarding', 1, true),

('Run basic SEO audit',
 'Automated SEO audit covering title tags, meta descriptions, and backlink basics.',
 'seo', 'transformation', 'FULL', 'onboarding', 2, true),

('Generate marketing gap report',
 'AI-generated gap analysis report based on website and SEO audit data.',
 'report', 'transformation', 'FULL', 'onboarding', 3, true),

('Create Google Business Profile post',
 'Draft GBP post content for client review.',
 'content', 'transformation', 'SEMI', 'monthly', 4, true),

('Publish GBP post',
 'Publish approved GBP post via n8n automation.',
 'publishing', 'transformation', 'FULL', 'monthly', 5, true),

('Write blog article',
 'Draft first blog article for client review.',
 'content', 'transformation', 'SEMI', 'monthly', 6, true),

('Publish blog article',
 'Publish approved first blog article via n8n automation.',
 'publishing', 'transformation', 'FULL', 'monthly', 7, true),

('Generate quarterly SEO report',
 'Compile and deliver quarterly SEO performance report.',
 'report', 'transformation', 'SEMI', 'quarterly', 8, true),

('Create email nurture sequence',
 'Draft email nurture sequence for lead follow-up.',
 'email', 'transformation', 'SEMI', 'monthly', 9, true),

('Generate retargeting ad copy',
 'AI-generated retargeting ad copy for Google/Meta campaigns.',
 'advertising', 'transformation', 'SEMI', 'monthly', 10, true),

('Create social media content batch',
 'Generate batch of social media posts for client approval.',
 'content', 'transformation', 'SEMI', 'monthly', 11, true),

('Publish social content batch',
 'Publish approved social content via n8n automation.',
 'publishing', 'transformation', 'FULL', 'monthly', 12, true),

('Write second blog article',
 'Draft second monthly blog article for client review.',
 'content', 'transformation', 'SEMI', 'monthly', 13, true),

('Publish second blog article',
 'Publish approved second blog article via n8n automation.',
 'publishing', 'transformation', 'FULL', 'monthly', 14, true),

('Create retention email sequence',
 'Draft retention-focused email sequence for existing customers.',
 'email', 'transformation', 'SEMI', 'monthly', 15, true),

('Scrape and compile analytics report',
 'Automated scrape and compilation of full analytics data.',
 'analytics', 'transformation', 'FULL', 'monthly', 16, true),

('Generate full monthly report',
 'Compile and deliver comprehensive monthly performance report.',
 'report', 'transformation', 'SEMI', 'monthly', 17, true);
