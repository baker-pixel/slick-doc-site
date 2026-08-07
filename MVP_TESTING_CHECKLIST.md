# Orange Door MVP Testing Checklist

For Baker & Jim — test using the 4 clean clients (Innermetrix, Orange Door, Vouch, Strata Media). Goal: confirm existing functionality works end-to-end, not evaluate marketing results (those take ~3 months). Report anything that doesn't match "expected."

## 1. Onboarding
- [ ] Self-serve signup at `/signup` (now the primary path — Header "Sign Up" and all Pricing/Tier page CTAs route here) → valid submission creates a "pending" row and lands in admin **Pending Signups** queue
- [ ] Signup validation: missing/invalid website URL is rejected (required — the platform needs a site to scan); a duplicate business name gets a clear "already taken" message, not a raw error
- [ ] Admin approves a Pending Signup → it moves into "Clients" (pending rows no longer show in both tabs at once) and portal access is granted
- [ ] Admin-created client (manual path) → onboarding checklist appears and steps can be completed
- [ ] Admin "Clients" view shows correct phase per client. Real phase order is: **Onboarding → Lead Nurturing → CRM Setup → Ads & Retargeting → Content → SEO** (there is no separate "Social" phase — social work is tracked under "Content"; there is no final "Complete" phase, just all six at 100%)
- [ ] Client portal login works; new client sees onboarding-appropriate content (not a blank/broken dashboard)
- [ ] "Your Agents" tab populates automatically once the onboarding checklist completes (auto-seeded server-side) — don't expect a manual setup step here

## 2. SEO Engine
- [ ] Run an SEO audit for a connected site → completes, produces a score + findings with evidence (not blank/stuck)
- [ ] Client portal "SEO Health" tab shows the audit score, findings, and trend vs. previous audit
- [ ] Admin SEO dashboard shows same data as client sees (no mismatch)
- [ ] For a client with WordPress connected: "Apply Fix" on an eligible finding actually changes the live page, and a re-audit reflects the fix
- [ ] Re-audit (manual or scheduled) shows score/finding changes, not a stale duplicate of the last audit

## 3. Lead Outreach / Prospect Engine
- [ ] Trigger lead discovery ("Find leads now" in the client portal, or admin discovery) → new prospects appear with a fit score (not all zero — flag if every lead scores 0)
- [ ] Client portal "Lead Outreach" tab shows discovered leads, with stats (Discovered / In Outreach / Converted / Queued)
- [ ] Cold email drip actually sends (check Resend logs / inbox) for at least one real prospect — **retest carefully**: the drip was recently fixed after sending zero real emails ever, so confirm sends are really landing, not just marked "sent"
- [ ] Cold outreach emails read as plain, personal email (no branded header/card/CTA button) — the branded-template look was deliberately stripped since it hurt replies; flag if a branded template reappears
- [ ] Clicking a lead in the client portal table opens its detail — shows fit score/reason, personalization hook, **and now also "Outreach sent" (emails actually sent, with subject/step/date/status) and "Next scheduled" (subject + send time)**
- [ ] Marking a prospect "Replied" / "Paused" / "Resumed" in admin updates status correctly
- [ ] Unsubscribe link in an outreach email works and suppresses future sends to that address
- **Known gap, not a bug:** the per-lead view above covers sent + next-scheduled emails, but there's still no reply-thread view (actual email replies aren't pulled into the UI) and no separate "shortlisted" stage — don't file either as a bug.

## 4. Social / Content Engine
- [ ] Scheduled content generates automatically (blog/social/email) on the expected cadence for the client's tier
- [ ] Client portal "Content Calendar" shows upcoming/drafted posts
- [ ] Client can approve / decline / request changes on a post in "Approvals" — same button now handles both: leave feedback blank + submit → "Content Declined"; add feedback + submit → "Request Changes". Feedback is optional either way (no longer forced). Status updates correctly on both client and admin side
- [ ] Approved post actually publishes to the connected platform at its scheduled time (check the real Facebook/Instagram/LinkedIn/Google Business Profile account)
- [ ] Image generates and attaches to image-eligible posts (not left blank)
- [ ] Client with no social accounts connected doesn't get social slots scheduled (only gets platforms they've actually connected)

## 5. Reporting
- [ ] Weekly/monthly report generates for each client on schedule
- [ ] Report reflects real activity (SEO score trend, posts published, leads contacted) — not placeholder/fabricated numbers
- [ ] Client portal "Analytics" tab renders the report without errors

## 6. Client Portal — general
- [ ] Sidebar shows, grouped as: **My Portal** (Home, Your Agents, Messages, Approvals, Deliverables, Content Calendar), **Brand & Tools** (Brand Assets, Social Media, Lead Outreach, SEO Health, Analytics), **Support** (Updates, Meetings, Documents, Invoices, Learning Hub, Help, Settings)
- [ ] "Your Agents" tab (renamed from Projects) shows active engine/project progress correctly
- [ ] Messages send/receive between client and admin
- [ ] Document upload/download works
- [ ] Invoices tab: no live payment processor is wired up (by design) — "Request Payment Instructions" opens a pre-filled email to billing instead of a fake checkout. Confirm it does that and doesn't imply real online payment.
- **Known gap, not a bug:** Invoices tab has no live Stripe billing yet — Stripe integration is planned, not built (the email fallback above is the intentional interim behavior).

## 7. Admin Panel — general
- [ ] Admin sidebar loads without errors, grouped as: **Agents** (SEO, Content, Social, Email, Reports), **Growth** (Leads, Sales), **Operations** (Clients, Client Projects, Alerts, Brand Assets, Team, Settings) — plus Home above and Help/Logout in the footer
- [ ] "Team" (Team directory, recently made reachable from the sidebar) opens correctly — note it's a global directory, not per-client, so it's expected to be empty/shared across clients
- [ ] "Alerts" is live and functional, not a stub: severity badges (error/warning/info), realtime toast on new alerts, sidebar badge count of unacknowledged alerts, Acknowledge / Dismiss actions all work. Confirm it's actually surfacing real background-job failures, not just that the UI renders.
- [ ] Admin can see and act on client requests/messages from the admin side
- [ ] "Pending Signups" (self-serve /signup submissions) is reachable and distinct from "Clients" — approving/rejecting here is now part of the primary onboarding path (see Section 1)

## Out of scope for this round (don't file as bugs)
- Lead outreach reply-thread view (actual email replies surfaced in-UI) — planned, not built
- Stripe invoicing — planned, not built; the "Request Payment Instructions" email flow is the intentional stand-in
- Any AI-SEO / third-party distribution features (Reddit/Quora/backlinks/schema authoring) — not built, separate future scope
- Actual marketing *results* (rankings, traffic, conversions) — needs ~3 months, this round is functional only
