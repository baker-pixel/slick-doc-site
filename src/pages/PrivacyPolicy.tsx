import { Helmet } from "react-helmet-async";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";

const PrivacyPolicy = () => {
  const lastUpdated = "April 28, 2026";

  return (
    <div className="min-h-screen bg-background">
      <Helmet>
        <title>Privacy Policy | Orange Door Marketing</title>
        <meta
          name="description"
          content="Orange Door Marketing privacy policy explaining how we collect, use, store, and protect data — including data accessed via LinkedIn integrations."
        />
        <link rel="canonical" href="https://orangedoormarketing.com/privacy-policy" />
      </Helmet>

      <Header />

      <main className="container mx-auto max-w-3xl px-6 py-16 md:py-24">
        <header className="mb-12">
          <h1 className="font-serif text-4xl md:text-5xl text-foreground mb-4">
            Privacy Policy
          </h1>
          <p className="text-sm text-muted-foreground">
            Last updated: {lastUpdated}
          </p>
        </header>

        <article className="prose prose-neutral max-w-none space-y-8 text-foreground/90 leading-relaxed">
          <section>
            <p>
              Orange Door Marketing ("Orange Door," "we," "our," or "us") respects
              your privacy. This Privacy Policy explains what information we
              collect, how we use it, who we share it with, and the choices you
              have. It applies to our website at{" "}
              <a
                href="https://orangedoormarketing.com"
                className="text-primary underline"
              >
                orangedoormarketing.com
              </a>
              , our client portal, and any services that integrate with
              third-party platforms such as LinkedIn, Facebook, Instagram, and
              X (Twitter).
            </p>
          </section>

          <section>
            <h2 className="font-serif text-2xl text-foreground">1. Who we are</h2>
            <p>
              Orange Door Marketing is a marketing services company that helps
              local businesses grow through done-for-you marketing systems. You
              can reach us at{" "}
              <a href="mailto:hello@orangedoormarketing.com" className="text-primary underline">
                hello@orangedoormarketing.com
              </a>
              .
            </p>
          </section>

          <section>
            <h2 className="font-serif text-2xl text-foreground">
              2. Information we collect
            </h2>
            <ul className="list-disc pl-6 space-y-2">
              <li>
                <strong>Information you give us:</strong> name, email, phone
                number, business name, website URL, and answers you submit
                through forms (e.g., the Gap Analysis).
              </li>
              <li>
                <strong>Account information:</strong> login credentials and
                portal preferences for clients of Orange Door.
              </li>
              <li>
                <strong>Usage data:</strong> pages visited, links clicked, and
                approximate location derived from IP address.
              </li>
              <li>
                <strong>Cookies and similar technologies:</strong> used to keep
                you signed in, remember preferences, and measure performance.
              </li>
              <li>
                <strong>Information from third-party platforms:</strong> when
                you connect a social account (LinkedIn, Facebook, Instagram,
                X), we receive only the data you authorize during the
                permission ("OAuth") flow.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="font-serif text-2xl text-foreground">
              3. LinkedIn integration
            </h2>
            <p>
              If you choose to connect your LinkedIn account to Orange Door, we
              use LinkedIn's official APIs under the permissions you grant.
              Specifically:
            </p>
            <ul className="list-disc pl-6 space-y-2">
              <li>
                <strong>What we access:</strong> your basic LinkedIn profile
                (name, profile picture, LinkedIn member ID), your email address
                (if you grant <code>r_emailaddress</code>), and the ability to
                publish posts on your behalf to your personal profile or
                company pages you manage (if you grant <code>w_member_social</code>{" "}
                or organization posting scopes).
              </li>
              <li>
                <strong>What we do with it:</strong> authenticate you,
                schedule and publish marketing content you have approved, and
                display the connection status inside your client portal.
              </li>
              <li>
                <strong>What we do NOT do:</strong> we do not read your private
                messages, scrape your connections, sell your LinkedIn data, or
                use it to train AI models.
              </li>
              <li>
                <strong>Token storage:</strong> LinkedIn access tokens are
                stored encrypted in our backend and are only used by our
                server-side publishing function. They are never exposed to the
                browser or to other clients.
              </li>
              <li>
                <strong>Disconnecting:</strong> you can revoke our access at
                any time from inside your client portal (Integrations tab) or
                from your LinkedIn account at{" "}
                <a
                  href="https://www.linkedin.com/psettings/permitted-services"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary underline"
                >
                  linkedin.com/psettings/permitted-services
                </a>
                . When you disconnect, we delete the stored tokens within 30
                days.
              </li>
            </ul>
            <p>
              Our use of information received from LinkedIn complies with the{" "}
              <a
                href="https://legal.linkedin.com/api-terms-of-use"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary underline"
              >
                LinkedIn API Terms of Use
              </a>
              .
            </p>
          </section>

          <section>
            <h2 className="font-serif text-2xl text-foreground">
              4. How we use information
            </h2>
            <ul className="list-disc pl-6 space-y-2">
              <li>To provide, operate, and improve our services.</li>
              <li>To publish and schedule social content you have approved.</li>
              <li>To send service updates, reports, and marketing emails (you can unsubscribe at any time).</li>
              <li>To prevent fraud, abuse, and security incidents.</li>
              <li>To comply with legal obligations.</li>
            </ul>
          </section>

          <section>
            <h2 className="font-serif text-2xl text-foreground">
              5. How we share information
            </h2>
            <p>We share data only with:</p>
            <ul className="list-disc pl-6 space-y-2">
              <li>
                <strong>Service providers</strong> that host our infrastructure,
                send email (Resend), run AI tasks, and publish to social
                platforms — under contracts that require them to protect your
                data.
              </li>
              <li>
                <strong>Social platforms</strong> (LinkedIn, Meta, X) when you
                ask us to publish content on your behalf.
              </li>
              <li>
                <strong>Authorities</strong> when required by law.
              </li>
            </ul>
            <p>We do not sell your personal information.</p>
          </section>

          <section>
            <h2 className="font-serif text-2xl text-foreground">
              6. Data retention
            </h2>
            <p>
              We keep personal data only as long as needed to provide the
              service and meet legal requirements. Social platform tokens are
              deleted within 30 days of disconnection. You can request earlier
              deletion at any time (see Section 8).
            </p>
          </section>

          <section>
            <h2 className="font-serif text-2xl text-foreground">
              7. Security
            </h2>
            <p>
              We use industry-standard safeguards including TLS encryption in
              transit, encryption at rest for sensitive credentials, role-based
              access controls, and regular security reviews. No system is 100%
              secure, but we work hard to protect your information.
            </p>
          </section>

          <section>
            <h2 className="font-serif text-2xl text-foreground">
              8. Your rights
            </h2>
            <p>
              Depending on where you live, you may have the right to access,
              correct, export, or delete your personal data, and to object to
              or restrict certain uses. To exercise these rights, email us at{" "}
              <a href="mailto:privacy@orangedoormarketing.com" className="text-primary underline">
                privacy@orangedoormarketing.com
              </a>
              . We respond within 30 days.
            </p>
          </section>

          <section>
            <h2 className="font-serif text-2xl text-foreground">
              9. Children
            </h2>
            <p>
              Our services are not directed to children under 16, and we do not
              knowingly collect their data.
            </p>
          </section>

          <section>
            <h2 className="font-serif text-2xl text-foreground">
              10. International users
            </h2>
            <p>
              We are based in the United States. If you use our services from
              outside the US, you understand that your information will be
              processed in the US under US law.
            </p>
          </section>

          <section>
            <h2 className="font-serif text-2xl text-foreground">
              11. Changes to this policy
            </h2>
            <p>
              We may update this Privacy Policy from time to time. Material
              changes will be announced on this page with a new "Last updated"
              date.
            </p>
          </section>

          <section>
            <h2 className="font-serif text-2xl text-foreground">
              12. Contact us
            </h2>
            <p>
              Orange Door Marketing<br />
              Email:{" "}
              <a href="mailto:privacy@orangedoormarketing.com" className="text-primary underline">
                privacy@orangedoormarketing.com
              </a>
              <br />
              Web:{" "}
              <a href="https://orangedoormarketing.com" className="text-primary underline">
                orangedoormarketing.com
              </a>
            </p>
          </section>
        </article>
      </main>

      <Footer />
    </div>
  );
};

export default PrivacyPolicy;