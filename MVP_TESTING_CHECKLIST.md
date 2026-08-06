# Orange Door MVP Testing Checklist

For Baker & Jim — test using the 4 clean clients (Innermetrix, Orange Door, Vouch, Strata Media). Goal: confirm existing functionality works end-to-end, not evaluate marketing results (those take ~3 months). Report anything that doesn't match "expected."

## 1. Onboarding
- [ ] New client created in admin → onboarding checklist appears and steps can be completed
- [ ] Admin "Clients" view shows correct phase per client (Onboarding → SEO/Social/Prospect engines → CRM → Ads → Complete)
- [ ] Client portal login works; new client sees onboarding-appropriate content (not a blank/broken dashboard)

## 2. SEO Engine
- [ ] Run an SEO audit for a connected site → completes, produces a score + findings with evidence (not blank/stuck)
- [ ] Client portal "SEO Health" tab shows the audit score, findings, and trend vs. previous audit
- [ ] Admin SEO dashboard shows same data as client sees (no mismatch)
- [ ] For a client with WordPress connected: "Apply Fix" on an eligible finding actually changes the live page, and a re-audit reflects the fix
- [ ] Re-audit (manual or scheduled) shows score/finding changes, not a stale duplicate of the last audit

## 3. Lead Outreach / Prospect Engine
- [ ] Trigger lead discovery → new prospects appear with a fit score (not all zero — flag if every lead scores 0)
- [ ] Client portal "Lead Outreach" tab shows discovered leads
- [ ] Cold email drip actually sends (check Resend logs / inbox) for at least one real prospect
- [ ] Marking a prospect "Replied" / "Paused" / "Resumed" in admin updates status correctly
- [ ] Unsubscribe link in an outreach email works and suppresses future sends to that address
- **Known gap, not a bug:** no lead pipeline view yet (shortlisted / threads / replies) — that's planned, not built. Don't file this as a bug.

## 4. Social / Content Engine
- [ ] Scheduled content generates automatically (blog/social/email) on the expected cadence for the client's tier
- [ ] Client portal "Content Calendar" shows upcoming/drafted posts
- [ ] Client can approve / reject / request changes on a post in "Approvals" — status updates correctly on both client and admin side
- [ ] Approved post actually publishes to the connected platform at its scheduled time (check the real Facebook/Instagram/LinkedIn/Google Business Profile account)
- [ ] Image generates and attaches to image-eligible posts (not left blank)
- [ ] Client with no social accounts connected doesn't get social slots scheduled (only gets platforms they've actually connected)

## 5. Reporting
- [ ] Weekly/monthly report generates for each client on schedule
- [ ] Report reflects real activity (SEO score trend, posts published, leads contacted) — not placeholder/fabricated numbers
- [ ] Client portal "Analytics" tab renders the report without errors

## 6. Client Portal — general
- [ ] Sidebar shows: Home, Your Agents, Messages, Approvals, Deliverables, Content Calendar, Brand Assets, Social Media, Lead Outreach, SEO Health, Analytics, Meetings, Documents, Invoices, Learning Hub, Help, Settings
- [ ] "Your Agents" tab (renamed from Projects) shows active engine/project progress correctly
- [ ] Messages send/receive between client and admin
- [ ] Document upload/download works
- **Known gap, not a bug:** Invoices tab has no live Stripe billing yet — Stripe integration is planned, not built.

## 7. Admin Panel — general
- [ ] Admin sidebar sections load without errors: SEO, Content, Social, Email, Reports, Leads, Sales, Clients, Client Projects, Alerts, Brand Assets, Settings
- [ ] "Alerts" section surfaces background job failures — confirm what's actually live here today before treating gaps as bugs (the Info/Warning/Error persistent-alert system discussed in the meeting may still be in progress)
- [ ] Admin can see and act on client requests/messages from the admin side

## Out of scope for this round (don't file as bugs)
- Lead outreach pipeline detail view (threads/replies) — planned, not built
- Stripe invoicing — planned, not built
- Any AI-SEO / third-party distribution features (Reddit/Quora/backlinks/schema authoring) — not built, separate future scope
- Actual marketing *results* (rankings, traffic, conversions) — needs ~3 months, this round is functional only
