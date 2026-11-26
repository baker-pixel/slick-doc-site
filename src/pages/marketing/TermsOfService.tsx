import { useEffect } from "react";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";

const TermsOfService = () => {
  const lastUpdated = "November 25, 2026";

  useEffect(() => {
    document.title = "Terms of Service | Orange Door Marketing";
    const desc =
      "Terms of Service for Orange Door Marketing's website, client portal, and integrations with third-party platforms such as Google, LinkedIn, and Meta.";
    let meta = document.querySelector('meta[name="description"]');
    if (!meta) {
      meta = document.createElement("meta");
      meta.setAttribute("name", "description");
      document.head.appendChild(meta);
    }
    meta.setAttribute("content", desc);
  }, []);

  const h2 = "font-serif text-2xl text-foreground";
  const link = "text-primary underline";

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="container mx-auto max-w-3xl px-6 py-16 md:py-24">
        <header className="mb-12">
          <h1 className="font-serif text-4xl md:text-5xl text-foreground mb-4">Terms of Service</h1>
          <p className="text-sm text-muted-foreground">Last updated: {lastUpdated}</p>
        </header>

        <article className="prose prose-neutral max-w-none space-y-8 text-foreground/90 leading-relaxed">
          <section>
            <p>
              These Terms of Service ("Terms") govern your use of the website at{" "}
              <a href="https://orangedoormarketing.com" className={link}>orangedoormarketing.com</a>,
              our client portal, and related services (together, the "Services") provided by Orange
              Door Marketing ("Orange Door," "we," "our," or "us"). By using the Services you agree
              to these Terms. If you do not agree, do not use the Services.
            </p>
          </section>

          <section>
            <h2 className={h2}>1. The Services</h2>
            <p>
              Orange Door provides done-for-you marketing services for businesses, including search
              visibility analysis, content and social media scheduling and publishing, outreach, and
              reporting. Features available to you depend on your plan or agreement with us.
            </p>
          </section>

          <section>
            <h2 className={h2}>2. Accounts and eligibility</h2>
            <p>
              You must be at least 18 and able to form a binding contract, and you must provide
              accurate information. You are responsible for activity under your account and for
              keeping your credentials secure. Tell us promptly at{" "}
              <a href="mailto:hello@orangedoormarketing.com" className={link}>hello@orangedoormarketing.com</a>{" "}
              if you suspect unauthorized access.
            </p>
          </section>

          <section>
            <h2 className="font-serif text-2xl text-foreground">3. Third-party accounts and integrations</h2>
            <p>
              You may connect third-party accounts (for example Google, LinkedIn, Facebook,
              Instagram, X, or a WordPress site). By connecting an account you authorize us to access
              and act on it only as described in the permissions you grant and in our{" "}
              <a href="/privacy-policy" className={link}>Privacy Policy</a>. You confirm you have the
              right to grant that access, and you remain bound by each platform's own terms. You can
              revoke access at any time in the client portal or in the third-party platform's
              settings. Our use of information received from Google APIs adheres to the{" "}
              <a
                href="https://developers.google.com/terms/api-services-user-data-policy"
                target="_blank"
                rel="noopener noreferrer"
                className={link}
              >
                Google API Services User Data Policy
              </a>
              , including the Limited Use requirements.
            </p>
          </section>

          <section>
            <h2 className="font-serif text-2xl text-foreground">4. Your content</h2>
            <p>
              You keep ownership of the content, logos, and materials you provide. You grant us a
              limited license to use, reproduce, and publish them solely to provide the Services to
              you. You are responsible for your content and represent that it does not infringe
              others' rights or violate the law. Content we generate for you is delivered for your
              use; you should review it before it is published, as AI-assisted content may contain
              errors.
            </p>
          </section>

          <section>
            <h2 className={h2}>5. Acceptable use</h2>
            <p>You agree not to:</p>
            <ul className="list-disc pl-6 space-y-2">
              <li>use the Services unlawfully, or to send spam or deceptive or harmful content;</li>
              <li>violate the terms of any connected platform;</li>
              <li>probe, disrupt, or attempt to gain unauthorized access to the Services;</li>
              <li>reverse engineer or resell the Services without our written consent.</li>
            </ul>
          </section>

          <section>
            <h2 className={h2}>6. Fees and billing</h2>
            <p>
              Paid plans are billed as described at checkout or in your agreement, through our
              payment processor. Fees are non-refundable except where required by law or stated in
              your agreement. You may cancel at any time; cancellation takes effect at the end of
              the current billing period.
            </p>
          </section>

          <section>
            <h2 className={h2}>7. No guarantee of results</h2>
            <p>
              Marketing outcomes depend on many factors outside our control. We do not guarantee any
              particular ranking, traffic, leads, or revenue.
            </p>
          </section>

          <section>
            <h2 className={h2}>8. Suspension and termination</h2>
            <p>
              You may stop using the Services at any time. We may suspend or terminate access if you
              breach these Terms or if required to protect the Services or other users. On
              termination we will disconnect integrations and handle your data as described in our
              Privacy Policy.
            </p>
          </section>

          <section>
            <h2 className={h2}>9. Disclaimers</h2>
            <p>
              The Services are provided "as is" and "as available," without warranties of any kind,
              express or implied, including merchantability, fitness for a particular purpose, and
              non-infringement. We do not warrant that the Services will be uninterrupted or
              error-free.
            </p>
          </section>

          <section>
            <h2 className={h2}>10. Limitation of liability</h2>
            <p>
              To the fullest extent permitted by law, Orange Door will not be liable for indirect,
              incidental, special, consequential, or punitive damages, or for lost profits or data.
              Our total liability for any claim relating to the Services is limited to the amount
              you paid us in the 12 months before the claim arose.
            </p>
          </section>

          <section>
            <h2 className={h2}>11. Governing law</h2>
            <p>
              These Terms are governed by the laws of the State of Tennessee, USA, without regard to
              conflict-of-law rules. Disputes will be brought in the state or federal courts located
              in Tennessee.
            </p>
          </section>

          <section>
            <h2 className={h2}>12. Changes to these Terms</h2>
            <p>
              We may update these Terms from time to time. Material changes will be posted on this
              page with a new "Last updated" date. Continued use of the Services after changes means
              you accept them.
            </p>
          </section>

          <section>
            <h2 className={h2}>13. Contact</h2>
            <p>
              Orange Door Marketing<br />
              Email:{" "}
              <a href="mailto:hello@orangedoormarketing.com" className={link}>hello@orangedoormarketing.com</a>
              <br />
              Web: <a href="https://orangedoormarketing.com" className={link}>orangedoormarketing.com</a>
            </p>
          </section>
        </article>
      </main>
      <Footer />
    </div>
  );
};

export default TermsOfService;
