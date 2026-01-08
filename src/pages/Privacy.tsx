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
          <p className="text-gray-400 mb-8">Last Updated: January 7, 2025</p>

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
                Our application uses voice commands for hands-free picking operations. <strong>Voice audio is
                processed in real-time and immediately discarded after transcription.</strong> We do not store,
                record, or retain voice audio data. Audio processing is handled by Deepgram's secure transcription
                service and is used solely for converting speech to commands.
              </p>

              <h3 className="text-xl font-semibold text-white mb-3 mt-6">Cookies and Tracking Technologies</h3>
              <p>
                We use cookies and similar tracking technologies to enhance user experience and analyze site traffic:
              </p>
              <ul className="list-disc pl-6 space-y-2 mt-3">
                <li><strong>Essential Cookies:</strong> Required for authentication and core functionality</li>
                <li><strong>Analytics Cookies:</strong> Google Analytics for visitor behavior and site performance</li>
                <li><strong>Marketing Cookies:</strong> Only with your consent, for retargeting and conversion tracking</li>
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
                  <p><strong>Google Analytics</strong> - Website analytics and visitor behavior tracking</p>
                  <p className="text-sm text-gray-400 mt-1">Privacy Policy: <a href="https://policies.google.com/privacy" className="text-teal-400 hover:underline" target="_blank" rel="noopener noreferrer">https://policies.google.com/privacy</a></p>
                </div>

                <div className="border-l-4 border-teal-500 pl-4">
                  <p><strong>Stripe</strong> - Payment processing and subscription management</p>
                  <p className="text-sm text-gray-400 mt-1">Privacy Policy: <a href="https://stripe.com/privacy" className="text-teal-400 hover:underline" target="_blank" rel="noopener noreferrer">https://stripe.com/privacy</a></p>
                </div>

                <div className="border-l-4 border-teal-500 pl-4">
                  <p><strong>OpenAI</strong> - AI-powered route optimization and natural language processing</p>
                  <p className="text-sm text-gray-400 mt-1">Privacy Policy: <a href="https://openai.com/privacy" className="text-teal-400 hover:underline" target="_blank" rel="noopener noreferrer">https://openai.com/privacy</a></p>
                </div>

                <div className="border-l-4 border-teal-500 pl-4">
                  <p><strong>Deepgram</strong> - Voice transcription (real-time processing, no data storage)</p>
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
              <ul className="list-disc pl-6 space-y-2">
                <li><strong>Account Information:</strong> Retained while your account is active, plus 90 days after cancellation</li>
                <li><strong>Route Data:</strong> Retained for 1 year or until you delete it</li>
                <li><strong>Usage Analytics:</strong> Aggregated data retained for 2 years</li>
                <li><strong>Voice Audio:</strong> Not stored - processed in real-time and immediately discarded</li>
                <li><strong>Payment Records:</strong> Retained for 7 years for tax compliance</li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-white mb-4">Your Privacy Rights</h2>

              <h3 className="text-xl font-semibold text-white mb-3 mt-6">All Users</h3>
              <ul className="list-disc pl-6 space-y-2">
                <li>Access and download your personal data</li>
                <li>Correct inaccurate information</li>
                <li>Delete your account and associated data</li>
                <li>Opt-out of marketing communications</li>
                <li>Manage cookie preferences</li>
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
                We implement industry-standard security measures to protect your information:
              </p>
              <ul className="list-disc pl-6 space-y-2 mt-3">
                <li>End-to-end encryption for data transmission (SSL/TLS)</li>
                <li>Encrypted storage for sensitive data at rest</li>
                <li>Regular security audits and penetration testing</li>
                <li>Multi-factor authentication support</li>
                <li>Role-based access controls</li>
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
