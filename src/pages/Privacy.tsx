import { useEffect } from "react";
import Navbar from "@/components/marketing/Navbar";
import Footer from "@/components/marketing/Footer";

const Privacy = () => {
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#0a0a0f] via-[#1a1a2e] to-[#0a0a0f]">
      <Navbar />

      <main className="container mx-auto px-4 py-16 max-w-4xl">
        <div className="bg-white/5 backdrop-blur-sm rounded-lg border border-white/10 p-8 md:p-12">
          <h1 className="text-4xl md:text-5xl font-bold text-white mb-4">Privacy Policy</h1>
          <p className="text-gray-400 mb-8">Last Updated: October 1, 2026</p>

          <div className="prose prose-invert prose-lg max-w-none space-y-8 text-gray-300">

            <section>
              <h2 className="text-2xl font-semibold text-white mb-4">Introduction</h2>
              <p>
                Stocker AI ("we," "our," or "us") is committed to protecting your privacy. This Privacy Policy
                explains how we collect, use, disclose, and safeguard your information when you use our
                voice-guided picking application for vending machine operators.
              </p>
              <p className="mt-4">
                <strong>Business Address:</strong> 18160 Cottonwood Rd, PMB 263, Sunriver, OR 97707<br />
                <strong>Privacy Contact:</strong> usprivacy@my-stocker-ai.com
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-white mb-4">Information We Collect</h2>

              <h3 className="text-xl font-semibold text-white mb-3 mt-6">Personal Information</h3>
              <p>We collect the following categories of personal information:</p>
              <ul className="list-disc pl-6 space-y-2 mt-3">
                <li><strong>Account Information:</strong> Names, email addresses, passwords, and contact details</li>
                <li><strong>Business Information:</strong> Company name, vending route details, team member information</li>
                <li><strong>Payment Information:</strong> Processed securely through Stripe (we do not store credit card numbers)</li>
                <li><strong>Usage Data:</strong> Application usage patterns, route completion times, feature interactions</li>
              </ul>

              <h3 className="text-xl font-semibold text-white mb-3 mt-6">Voice Audio (Sensory Data)</h3>
              <p>
                Our application uses voice commands for hands-free picking operations. Voice audio is streamed to
                Deepgram for real-time transcription. Stocker AI does not intentionally record or store the audio
                stream. We may retain text transcripts and technical diagnostics when needed to operate, support,
                secure, and improve the service. Deepgram processes data under its own terms and privacy policy.
              </p>

              <h3 className="text-xl font-semibold text-white mb-3 mt-6">Cookies and Tracking Technologies</h3>
              <p>
                We use browser storage and similar technologies needed to provide the service:
              </p>
              <ul className="list-disc pl-6 space-y-2 mt-3">
                <li><strong>Essential storage:</strong> Required for authentication, preferences, recovery, and core functionality</li>
                <li><strong>No advertising trackers:</strong> The current application does not install advertising or retargeting cookies</li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-white mb-4">How We Use Your Information</h2>
              <p>We use the information we collect to:</p>
              <ul className="list-disc pl-6 space-y-2 mt-3">
                <li>Provide and maintain our voice-guided picking service</li>
                <li>Process your route uploads and generate picking instructions</li>
                <li>Manage your account, team members, and subscriptions</li>
                <li>Process payments and send billing information</li>
                <li>Respond to customer service inquiries and support requests</li>
                <li>Send administrative notifications about service updates or account changes</li>
                <li>Analyze usage patterns to improve our application</li>
                <li>Fulfill legal obligations and enforce our terms</li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-white mb-4">Third-Party Services</h2>
              <p>We share information with trusted third-party service providers:</p>

              <div className="space-y-4 mt-4">
                <div className="border-l-4 border-teal-500 pl-4">
                  <p><strong>Stripe</strong> - Payment processing and subscription management</p>
                  <p className="text-sm text-gray-400 mt-1">Privacy Policy: <a href="https://stripe.com/privacy" className="text-teal-400 hover:underline" target="_blank" rel="noopener noreferrer">https://stripe.com/privacy</a></p>
                </div>

                <div className="border-l-4 border-teal-500 pl-4">
                  <p><strong>OpenAI</strong> - Natural-language assistance within the application</p>
                  <p className="text-sm text-gray-400 mt-1">Privacy Policy: <a href="https://openai.com/privacy" className="text-teal-400 hover:underline" target="_blank" rel="noopener noreferrer">https://openai.com/privacy</a></p>
                </div>

                <div className="border-l-4 border-teal-500 pl-4">
                  <p><strong>Deepgram</strong> - Real-time voice transcription</p>
                  <p className="text-sm text-gray-400 mt-1">Privacy Policy: <a href="https://deepgram.com/privacy" className="text-teal-400 hover:underline" target="_blank" rel="noopener noreferrer">https://deepgram.com/privacy</a></p>
                </div>

                <div className="border-l-4 border-teal-500 pl-4">
                  <p><strong>Supabase</strong> - Database, authentication, and file storage infrastructure</p>
                  <p className="text-sm text-gray-400 mt-1">Privacy Policy: <a href="https://supabase.com/privacy" className="text-teal-400 hover:underline" target="_blank" rel="noopener noreferrer">https://supabase.com/privacy</a></p>
                </div>
              </div>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-white mb-4">Data Retention</h2>
              <p>
                We retain account, route, usage, support, and diagnostic data for as long as reasonably necessary to
                provide and secure the service, meet legal obligations, resolve disputes, and enforce agreements.
                Retention varies by data type and operational need. Stocker AI does not intentionally retain the live
                voice-audio stream. Stripe maintains payment records under its own retention and legal obligations.
                You may request deletion by contacting us; limited records may remain where required by law, fraud
                prevention, security, backup, or legitimate business needs.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-white mb-4">Your Privacy Rights</h2>

              <h3 className="text-xl font-semibold text-white mb-3 mt-6">All Users</h3>
              <ul className="list-disc pl-6 space-y-2">
                <li>Request access to your personal data</li>
                <li>Correct inaccurate information</li>
                <li>Request deletion of your account and associated data, subject to legal exceptions</li>
                <li>Opt-out of marketing communications</li>
              </ul>

              <h3 className="text-xl font-semibold text-white mb-3 mt-6">California Residents (CCPA/CPRA)</h3>
              <p>Under the California Consumer Privacy Act, you have additional rights:</p>
              <ul className="list-disc pl-6 space-y-2 mt-3">
                <li>Know what personal information we collect, use, and share</li>
                <li>Request deletion of your personal information</li>
                <li>Opt-out of the "sale" of personal information (we do not sell your data)</li>
                <li>Non-discrimination for exercising your privacy rights</li>
              </ul>

              <h3 className="text-xl font-semibold text-white mb-3 mt-6">European Users (GDPR)</h3>
              <p>Under the General Data Protection Regulation, you have the right to:</p>
              <ul className="list-disc pl-6 space-y-2 mt-3">
                <li>Access your personal data</li>
                <li>Rectification of inaccurate data</li>
                <li>Erasure ("right to be forgotten")</li>
                <li>Restrict or object to processing</li>
                <li>Data portability</li>
                <li>Withdraw consent at any time</li>
              </ul>

              <p className="mt-6">
                To exercise any of these rights, contact us at <a href="mailto:usprivacy@my-stocker-ai.com" className="text-teal-400 hover:underline">usprivacy@my-stocker-ai.com</a>
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-white mb-4">Data Security</h2>
              <p>
                We use administrative, technical, and organizational safeguards designed to protect your information:
              </p>
              <ul className="list-disc pl-6 space-y-2 mt-3">
                <li>TLS encryption for data transmitted between supported clients and our services</li>
                <li>Access controls designed to separate customer accounts and user roles</li>
                <li>Authentication and managed infrastructure provided by established service providers</li>
                <li>Secure payment processing via PCI-compliant Stripe</li>
              </ul>
              <p className="mt-4">
                However, no method of transmission over the internet is 100% secure. While we strive to protect
                your data, we cannot guarantee absolute security.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-white mb-4">Contact Us</h2>
              <p>
                If you have questions or concerns about this Privacy Policy or our data practices, please contact us:
              </p>
              <div className="bg-white/5 border border-white/10 rounded-lg p-6 mt-4">
                <p><strong>Email:</strong> <a href="mailto:usprivacy@my-stocker-ai.com" className="text-teal-400 hover:underline">usprivacy@my-stocker-ai.com</a></p>
                <p className="mt-2"><strong>Mail:</strong><br />
                Stocker AI<br />
                18160 Cottonwood Rd, PMB 263<br />
                Sunriver, OR 97707</p>
              </div>
            </section>

          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
};

export default Privacy;
