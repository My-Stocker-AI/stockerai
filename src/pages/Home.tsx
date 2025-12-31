import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import Navbar from "@/components/marketing/Navbar";
import Footer from "@/components/marketing/Footer";
import FAQSection from "@/components/marketing/FAQSection";
import ROICalculator from "@/components/marketing/ROICalculator";
import {
  Upload,
  Headphones,
  Mic,
  Eye,
  UserPlus,
  Save,
  Settings,
  Check,
} from "lucide-react";

const Home = () => {
  const landingFAQs = [
    {
      question: "How does pricing work?",
      answer:
        "$20/driver/month for 1-5 drivers, $18 for 6-20 drivers, $15 for 21-50 drivers. Adjust your driver count anytime - changes apply next billing cycle.",
    },
    {
      question: "Is there a minimum?",
      answer:
        "2 driver minimum ($40/month). Each driver can service up to 10 machines per day.",
    },
    {
      question: "What do I need to get started?",
      answer:
        "A smartphone, Bluetooth earbuds (optional), and your route PDFs from Parlevel, Nayax, or VendSoft. A laptop makes generating and uploading PDFs easier, but it works from a phone too.",
    },
    {
      question: "How long does setup take?",
      answer:
        "5 minutes. Upload your PDF and start picking. New drivers are productive in 15 minutes with zero training.",
    },
    {
      question: "What's the trial?",
      answer:
        "14 days free with credit card signup. Cancel anytime - no questions asked.",
    },
  ];

  return (
    <div className="min-h-screen bg-background">
      <Navbar />

      {/* 1. Hero Section */}
      <section className="min-h-screen flex items-center pt-32 pb-16">
        <div className="section-container w-full">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            {/* Left Column - Text Content */}
            <div className="md:text-left text-center">
              <p
                className="text-xl md:text-2xl font-extrabold tracking-widest mb-4 animate-fade-in-up text-primary relative inline-block uppercase"
                style={{
                  textShadow: '0 0 10px #fff, 0 0 20px #fff, 0 0 30px #4ecca3, 0 0 40px #4ecca3, 0 0 50px #4ecca3, 0 0 60px #4ecca3',
                  letterSpacing: '0.15em'
                }}
              >
                VOICE PICKING FOR VENDING ROUTE OPERATORS
              </p>
              <h1 className="text-4xl sm:text-5xl md:text-6xl font-bold tracking-tight text-foreground mb-6 animate-fade-in-up">
                Enterprise Warehouse Speed.{" "}
                <br className="hidden sm:block" />
                <span className="text-primary">Zero Hardware Cost.</span>
              </h1>
              <p className="text-lg sm:text-xl text-muted-foreground mb-8 max-w-2xl animate-fade-in-up animation-delay-100">
                Hardware automation runs $100k+. Stocker AI runs on the phone in your
                pocket. Same accuracy and speed, no hardware. Works with Parlevel, Nayax, and VendSoft. Starting at $40/month.
              </p>

              <div className="flex flex-col sm:flex-row gap-4 md:justify-start justify-center animate-fade-in-up animation-delay-200">
                <Link to="/signup">
                  <Button className="btn-primary">Start Free Trial</Button>
                </Link>
                <a href="#how-it-works">
                  <Button variant="outline" className="btn-secondary">
                    See How It Works
                  </Button>
                </a>
              </div>
            </div>

            {/* Right Column - Hero Image */}
            <div className="animate-fade-in-up animation-delay-150 lg:order-last order-first">
              <div className="relative">
                {/* Deep shadow layers for 3D effect */}
                <div className="absolute inset-0 translate-x-4 translate-y-4 bg-primary/40 rounded-2xl blur-xl"></div>
                <div className="absolute inset-0 translate-x-6 translate-y-6 bg-primary/20 rounded-2xl blur-2xl"></div>
                <div className="absolute inset-0 translate-x-8 translate-y-8 bg-slate-900/60 rounded-2xl blur-2xl"></div>

                {/* Glow ring behind image */}
                <div className="absolute -inset-1 bg-gradient-to-r from-primary via-cyan-400 to-primary rounded-2xl blur-sm opacity-60"></div>

                {/* Main image */}
                <img
                  src="/hero-warehouse.png"
                  alt="Warehouse worker with earbuds picking items into bins"
                  className="relative rounded-2xl w-full border-2 border-primary/30"
                  style={{
                    boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5), 0 0 40px rgba(78, 204, 163, 0.3)'
                  }}
                />

                {/* Decorative glow elements */}
                <div className="absolute -bottom-6 -right-6 w-32 h-32 bg-primary/50 rounded-full blur-2xl"></div>
                <div className="absolute -top-6 -left-6 w-40 h-40 bg-cyan-400/30 rounded-full blur-3xl"></div>
                <div className="absolute top-1/2 -right-8 w-20 h-40 bg-primary/40 rounded-full blur-2xl"></div>
              </div>
            </div>
          </div>

          {/* Video Placeholder - Below hero grid */}
          <div className="mt-16 max-w-3xl mx-auto animate-fade-in-up animation-delay-300">
            <div className="relative aspect-video bg-slate-900 rounded-xl border border-slate-700 overflow-hidden shadow-2xl shadow-primary/10">
              <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-400">
                <div className="w-16 h-16 rounded-full bg-primary/20 flex items-center justify-center mb-4 cursor-pointer hover:bg-primary/30 transition-colors">
                  <svg className="w-8 h-8 text-primary ml-1" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M8 5v14l11-7z"/>
                  </svg>
                </div>
                <p className="text-sm">30-second demo coming soon</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 2. How It Works Section */}
      <section id="how-it-works" className="bg-alt section-padding">
        <div className="section-container">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-4">
              Up and Running in 5 Minutes
            </h2>
          </div>

          <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
            {[
              {
                step: 1,
                icon: Upload,
                title: "Upload Your Route",
                description:
                  "Export your PDF from Parlevel, Nayax, or VendSoft. Upload it to Stocker AI.",
              },
              {
                step: 2,
                icon: Headphones,
                title: "Put in Your Earbuds",
                description:
                  "Bluetooth earbuds or phone speaker. Whatever you have.",
              },
              {
                step: 3,
                icon: Mic,
                title: "Pick by Voice",
                description:
                  "Stocker AI tells you what to grab. Say 'next' when done. Repeat.",
              },
            ].map((item) => (
              <div key={item.step} className="text-center">
                <div className="relative inline-flex items-center justify-center mb-6">
                  <div className="absolute -top-2 -left-2 w-8 h-8 bg-primary text-primary-foreground rounded-full flex items-center justify-center font-bold text-sm">
                    {item.step}
                  </div>
                  <div className="w-20 h-20 bg-background rounded-2xl shadow-sm flex items-center justify-center">
                    <item.icon className="h-10 w-10 text-primary" />
                  </div>
                </div>
                <h3 className="text-xl font-semibold text-foreground mb-2">
                  {item.title}
                </h3>
                <p className="text-muted-foreground">{item.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 3. Features & Benefits Section */}
      <section id="features" className="section-padding">
        <div className="section-container">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-4">
              Why Operators Switch to Stocker
            </h2>
          </div>

          <div className="grid md:grid-cols-2 gap-8 max-w-5xl mx-auto">
            {[
              {
                icon: Eye,
                headline: "Stop Squinting at Screens",
                body: "Screen-based picking slows drivers down and causes errors. Stocker AI's voice guidance calls out quantity, product, and slot - hands stay full, eyes stay up. Result: 25-30% faster picks with near-zero mistakes.",
              },
              {
                icon: UserPlus,
                headline: "New Driver? Productive in 15 Minutes",
                body: "Training new hires takes weeks of shadowing and costly mistakes. Stocker AI walks them through every pick, step by step, from day one. Result: Onboarding drops from weeks to minutes.",
              },
              {
                icon: Save,
                headline: "Every Pick Confirmed. Every Item Tracked",
                body: "Lost progress means rework - or worse, missed deliveries. Stocker AI auto-saves after every item and resumes exactly where you stopped. Result: Zero rework, 100% route completion.",
              },
              {
                icon: Settings,
                headline: "Your Workflow, Your Way",
                body: "Forcing one picking method slows drivers down and fights muscle memory. Stocker AI adapts to each driver and machine - they choose how to work it. Result: No retraining, no friction, natural flow.",
              },
            ].map((feature, index) => (
              <div key={index} className="card-base border border-border">
                <feature.icon className="h-10 w-10 text-primary mb-4" />
                <h3 className="text-xl font-semibold text-foreground mb-3">
                  {feature.headline}
                </h3>
                <p className="text-muted-foreground leading-relaxed">
                  {feature.body}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 4. ROI Calculator Section */}
      <section className="bg-alt section-padding">
        <div className="section-container">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-4">
              See Your Savings
            </h2>
            <p className="text-xl text-muted-foreground max-w-3xl mx-auto">
              Voice guidance delivers 20-30% faster picking. At $15-20/driver/month,
              that's typically less than 10% of your labor savings.
            </p>
          </div>

          <ROICalculator />
        </div>
      </section>

      {/* 5. Social Proof Section */}
      <section className="section-padding">
        <div className="section-container">
          <div className="max-w-3xl mx-auto text-center">
            <p className="text-lg font-medium text-primary mb-8">
              Built by venders for venders
            </p>

            <blockquote className="text-2xl md:text-3xl text-foreground font-medium mb-6 italic">
              "[PLACEHOLDER - Driver testimonial to be added]"
            </blockquote>
            <p className="text-muted-foreground mb-12">
              - Driver Name, Company Name
            </p>

          </div>
        </div>
      </section>

      {/* 6. Pricing Preview Section */}
      <section className="bg-alt section-padding">
        <div className="section-container">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-4">
              Simple Per-Driver Pricing
            </h2>
            <p className="text-xl text-muted-foreground">
              Starting at $20/driver/month
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-6 max-w-4xl mx-auto mb-10">
            {[
              { drivers: "1-5 drivers", price: "$20", label: "per driver/mo" },
              { drivers: "6-20 drivers", price: "$18", label: "per driver/mo" },
              { drivers: "21-50 drivers", price: "$15", label: "per driver/mo" },
            ].map((tier, index) => (
              <div
                key={index}
                className="card-base border border-border text-center"
              >
                <p className="text-muted-foreground mb-2">{tier.drivers}</p>
                <p className="text-3xl font-bold text-foreground">{tier.price}</p>
                <p className="text-sm text-muted-foreground">{tier.label}</p>
              </div>
            ))}
          </div>

          <div className="text-center">
            <Link to="/pricing">
              <Button className="btn-primary">See Full Pricing</Button>
            </Link>
          </div>
        </div>
      </section>

      {/* 7. FAQ Section */}
      <section className="section-padding">
        <div className="section-container">
          <FAQSection items={landingFAQs} />
        </div>
      </section>

      {/* 8. Final CTA Section */}
      <section className="bg-alt section-padding">
        <div className="section-container">
          <div className="max-w-3xl mx-auto text-center">
            <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-4">
              Ready to Pick Smarter?
            </h2>
            <p className="text-xl text-muted-foreground mb-8">
              Join operators who've cut picking time by 25% or more.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
              <Link to="/signup">
                <Button className="btn-primary">Start Your Free Trial</Button>
              </Link>
              <a
                href="mailto:support@my-stocker-ai.com"
                className="text-muted-foreground hover:text-primary transition-colors"
              >
                Questions? Contact us
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* 9. Footer */}
      <Footer />
    </div>
  );
};

export default Home;
