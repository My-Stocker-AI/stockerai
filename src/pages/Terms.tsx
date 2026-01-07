import Navbar from "@/components/marketing/Navbar";
import Footer from "@/components/marketing/Footer";

const Terms = () => {
  return (
    <div className="min-h-screen bg-gradient-to-b from-[#0a0a0f] via-[#1a1a2e] to-[#0a0a0f]">
      <Navbar />

      <main className="container mx-auto px-4 py-16 max-w-4xl">
        <div className="bg-white/5 backdrop-blur-sm rounded-lg border border-white/10 p-8 md:p-12">
          <h1 className="text-4xl md:text-5xl font-bold text-white mb-4">Terms and Conditions</h1>
          <p className="text-gray-400 mb-8">Last Updated: January 7, 2025</p>

          <div className="prose prose-invert prose-lg max-w-none space-y-8 text-gray-300">

            <section>
              <h2 className="text-2xl font-semibold text-white mb-4">1. Agreement to Terms</h2>
              <p>
                These Terms and Conditions ("Terms") constitute a legally binding agreement between you and Stocker AI
                concerning your access to and use of our voice-guided picking application.
              </p>
              <p className="mt-4">
                <strong>Business Address:</strong> 18160 Cottonwood Rd, PMB 263, Sunriver, OR 97707<br />
                <strong>Contact Email:</strong> support@my-stocker-ai.com
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-white mb-4">2. Subscription and Billing</h2>
              <p>Pricing based on number of drivers:</p>
              <ul className="list-disc pl-6 space-y-2 mt-3">
                <li><strong>Starter (1-5 drivers):</strong> $20/driver/month</li>
                <li><strong>Growth (6-20 drivers):</strong> $18/driver/month</li>
                <li><strong>Scale (21-50 drivers):</strong> $15/driver/month</li>
                <li><strong>Enterprise (51+ drivers):</strong> Custom pricing</li>
              </ul>
              <p className="mt-4">
                All subscriptions are billed monthly in advance. Payment processing is handled securely by Stripe.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-white mb-4">3. Acceptable Use</h2>
              <p>You agree NOT to:</p>
              <ul className="list-disc pl-6 space-y-2 mt-3">
                <li>Use the Service for any illegal purpose</li>
                <li>Attempt to gain unauthorized access to any part of the Service</li>
                <li>Reverse engineer or decompile any portion of the Service</li>
                <li>Use automated systems to access the Service without permission</li>
                <li>Share your account access with competitors</li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-white mb-4">4. Limitation of Liability</h2>
              <p className="uppercase font-semibold">
                IN NO EVENT SHALL STOCKER AI'S TOTAL LIABILITY EXCEED THE LESSER OF: (A) THE AMOUNT YOU PAID IN THE
                LAST 12 MONTHS, OR (B) $10,000 USD.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-semibold text-white mb-4">5. Contact Information</h2>
              <div className="bg-white/5 border border-white/10 rounded-lg p-6">
                <p><strong>Email:</strong> <a href="mailto:support@my-stocker-ai.com" className="text-teal-400 hover:underline">support@my-stocker-ai.com</a></p>
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

export default Terms;
