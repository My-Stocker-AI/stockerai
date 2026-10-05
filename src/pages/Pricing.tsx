import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import Navbar from "@/components/marketing/Navbar";
import Footer from "@/components/marketing/Footer";
import FAQSection from "@/components/marketing/FAQSection";
import { Check } from "lucide-react";

const Pricing = () => {
  const plans = [
    {
      name: "Drivers 1–5",
      drivers: "First 5 drivers",
      price: "$24",
      period: "/driver/month",
      description: "Applies to drivers one through five",
      features: [
        "Voice-guided picking",
        "PDF upload",
        "Auto-save & resume",
        "Team and route management",
      ],
      cta: "Start Free Trial",
      popular: false,
    },
    {
      name: "Drivers 6–20",
      drivers: "Drivers 6-20",
      price: "$21",
      period: "/driver/month",
      description: "Applies only to these additional drivers",
      features: [
        "Same complete StockerAI product",
        "Lower rate for these additional drivers",
        "Voice and touch picking",
        "Usage visibility",
      ],
      cta: "Start Free Trial",
      popular: true,
    },
    {
      name: "Drivers 21+",
      drivers: "Drivers 21+",
      price: "$18",
      period: "/driver/month",
      description: "Applies only to additional drivers above 20",
      features: [
        "Same complete StockerAI product",
        "Lowest rate for additional drivers",
        "Voice and touch picking",
        "Usage visibility",
      ],
      cta: "Start Free Trial",
      popular: false,
    },
  ];

  const pricingFAQs = [
    {
      question: "Can I change my plan?",
      answer:
        "Yes. Add drivers when your team grows; Stripe calculates any applicable proration. Reductions apply under your renewal terms and cannot go below the two-driver or usage-based minimum.",
    },
    {
      question: "What happens after the trial?",
      answer:
        "A valid card is required to start. The subscription charge today is $0. After seven days, Stripe charges the billing term you selected unless you cancel first.",
    },
    {
      question: "Do you offer annual billing?",
      answer:
        "Yes. Six-month prepayment saves 5%, and annual prepayment saves 10%. Monthly billing remains available for maximum flexibility.",
    },
    {
      question: "What if we exceed our machine limit?",
      answer:
        "We show when your usage exceeds your current driver capacity so an account administrator can add drivers. We do not automatically increase your paid subscription without an authorized change.",
    },
    {
      question: "Can I reduce my driver count?",
      answer:
        "Yes, but not below your actual usage. Once usage decreases, you can reduce your plan.",
    },
  ];

  return (
    <div className="min-h-screen bg-background">
      <Navbar />

      {/* Hero */}
      <section className="pt-32 pb-12 md:pt-40 md:pb-16">
        <div className="section-container">
          <div className="text-center max-w-3xl mx-auto">
            <h1 className="text-4xl md:text-5xl font-bold tracking-tight text-foreground mb-4">
              Simple, Per-Driver Pricing
            </h1>
            <p className="text-xl text-muted-foreground">
              Graduated pricing rewards growth without pricing cliffs. Choose monthly, six-month, or annual billing.
            </p>
          </div>
        </div>
      </section>

      {/* Pricing Cards */}
      <section className="pb-16">
        <div className="section-container">
          <div className="grid md:grid-cols-3 gap-6 max-w-5xl mx-auto">
            {plans.map((plan, index) => (
              <div
                key={index}
                className={`card-base relative flex flex-col ${
                  plan.popular
                    ? "border-2 border-primary shadow-lg"
                    : "border border-border"
                }`}
              >
                {plan.popular && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-primary text-primary-foreground text-sm font-medium px-3 py-1 rounded-full whitespace-nowrap">
                    Most Popular
                  </div>
                )}
                <div className="text-center mb-6">
                  <h3 className="text-xl font-semibold text-foreground mb-1">
                    {plan.name}
                  </h3>
                  <p className="text-sm text-muted-foreground mb-4">
                    {plan.drivers}
                  </p>
                  <div className="flex items-baseline justify-center gap-1">
                    <span className="text-3xl font-bold text-foreground">
                      {plan.price}
                    </span>
                    {plan.period && (
                      <span className="text-muted-foreground text-sm">
                        {plan.period}
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground mt-2">
                    {plan.description}
                  </p>
                </div>

                <ul className="space-y-3 mb-8 flex-1">
                  {plan.features.map((feature, featureIndex) => (
                    <li key={featureIndex} className="flex items-start gap-3">
                      <Check className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
                      <span className="text-foreground text-sm">{feature}</span>
                    </li>
                  ))}
                </ul>

                <Link to="/signup" className="block mt-auto">
                  <Button
                    className={`w-full ${
                      plan.popular ? "btn-primary" : "btn-secondary"
                    }`}
                  >
                    {plan.cta}
                  </Button>
                </Link>
              </div>
            ))}
          </div>

          {/* Notes below tiers */}
          <div className="text-center mt-10 space-y-2">
            <p className="text-muted-foreground">
              All new subscriptions include one 7-day free trial
            </p>
            <p className="text-muted-foreground">2 driver minimum ($48 monthly value)*</p>
            <p className="text-sm text-muted-foreground mt-4">
              *Each driver can service up to 10 machines per day.
              <br />
              Usage reporting helps you identify when your plan needs to change.
            </p>
            <p className="text-xs text-muted-foreground mt-6 max-w-lg mx-auto">
              A valid card is required before the trial begins. The subscription charge today is $0.
              Cancel before the seven-day trial ends to avoid the first charge. Six-month billing saves 5%; annual billing saves 10%.
            </p>
          </div>
        </div>
      </section>

      {/* FAQ Section */}
      <section className="bg-alt section-padding">
        <div className="section-container">
          <FAQSection items={pricingFAQs} />
        </div>
      </section>

      <Footer />
    </div>
  );
};

export default Pricing;
