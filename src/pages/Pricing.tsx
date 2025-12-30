import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import Navbar from "@/components/marketing/Navbar";
import Footer from "@/components/marketing/Footer";
import FAQSection from "@/components/marketing/FAQSection";
import { Check } from "lucide-react";

const Pricing = () => {
  const plans = [
    {
      name: "Starter",
      drivers: "1-5 drivers",
      price: "$20",
      period: "/driver/month",
      description: "Perfect for small operations",
      features: [
        "Voice-guided picking",
        "PDF upload",
        "Auto-save & resume",
        "Email support",
      ],
      cta: "Start Free Trial",
      popular: false,
    },
    {
      name: "Growth",
      drivers: "6-20 drivers",
      price: "$18",
      period: "/driver/month",
      description: "For growing vending operations",
      features: [
        "Everything in Starter",
        "Team management",
        "Route assignment",
        "Usage analytics",
      ],
      cta: "Start Free Trial",
      popular: true,
    },
    {
      name: "Scale",
      drivers: "21-50 drivers",
      price: "$15",
      period: "/driver/month",
      description: "For established operations",
      features: [
        "Everything in Growth",
        "Phone support",
        "Priority onboarding",
      ],
      cta: "Start Free Trial",
      popular: false,
    },
    {
      name: "Enterprise",
      drivers: "51+ drivers",
      price: "Contact Us",
      period: "",
      description: "For large-scale operations",
      features: [
        "Custom pricing",
        "Dedicated support",
        "Custom integrations",
      ],
      cta: "Contact Sales",
      popular: false,
    },
  ];

  const pricingFAQs = [
    {
      question: "Can I change my plan?",
      answer:
        "Yes, adjust your driver count anytime. Changes apply next billing cycle. If you exceed 10 machines per driver per day, you'll need to add another driver.",
    },
    {
      question: "What happens after the trial?",
      answer:
        "Your card is charged based on your driver count. Cancel anytime before the trial ends - no charge.",
    },
    {
      question: "Do you offer annual billing?",
      answer:
        "Not yet. Monthly billing lets you scale up or down with seasonal demand.",
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
              Scale up or down monthly. No contracts. No surprises.
            </p>
          </div>
        </div>
      </section>

      {/* Pricing Cards */}
      <section className="pb-16">
        <div className="section-container">
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6 max-w-6xl mx-auto">
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

                <Link
                  to={plan.cta === "Contact Sales" ? "mailto:sales@my-stocker-ai.com" : "/login"}
                  className="block mt-auto"
                >
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
              All plans include 14-day free trial
            </p>
            <p className="text-muted-foreground">2 driver minimum*</p>
            <p className="text-sm text-muted-foreground mt-4">
              *Each driver can service up to 10 machines per day
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