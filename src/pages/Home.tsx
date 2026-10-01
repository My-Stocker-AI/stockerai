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
        "$20/driver/month for 2-5 drivers, $18 for 6-20 drivers, $15 for 21-50 drivers. Adjust your driver count anytime - changes apply next billing cycle.",
    },
    {
      question: "Is there a minimum?",
      answer:
        "2 driver minimum ($40/month). Each driver can service up to 10 machines per day.",
    },
    {
      question: "What do I need to get started?",
      answer:
        "A smartphone, Bluetooth earbuds (optional), and a supported route PDF. Parlevel Prekitting Detail is the currently verified layout; contact us to review another vending-system format.",
    },
    {
      question: "How do I get started?",
      answer:
        "Upload a supported PDF, review the parsed route, assign it to a driver, and start picking from a phone. Review any parser warnings before using the route.",
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
                className="text-xl md:text-2xl font-extrabold tracking-wide mb-4 animate-fade-in-up relative inline-block uppercase"
                style={{
                  color: '#0cb08b',
                  textShadow: '2px 2px 8px rgba(12, 176, 139, 0.4), -1px -1px 6px rgba(12, 176, 139, 0.3)'
                }}
              >
                VOICE PICKING FOR VENDING ROUTE OPERATORS
              </p>
              <h1 className="text-4xl sm:text-5xl md:text-6xl font-bold tracking-tight text-foreground mb-6 animate-fade-in-up">
                Voice Guidance.{" "}
                <br className="hidden sm:block" />
                <span style={{ color: '#0cb08b' }}>No Dedicated Picking Hardware.</span>
              </h1>
              <p className="text-lg sm:text-xl text-muted-foreground mb-8 max-w-2xl animate-fade-in-up animation-delay-100">
                Stocker AI runs in the browser on the phone in your pocket. It turns supported
                vending route reports into spoken pick guidance, saves confirmed progress, and keeps touch controls available. Parlevel Prekitting Detail is supported today.
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
                {/* Subtle shadow for depth */}
                <div className="absolute inset-0 translate-x-3 translate-y-3 bg-black/30 rounded-2xl blur-xl"></div>

                {/* Subtle glow ring */}
                <div className="absolute -inset-0.5 bg-gradient-to-r from-primary/40 to-cyan-400/40 rounded-2xl blur-sm"></div>

                {/* Main image — WebP (~172KB, was a 2.3MB PNG); high priority so it
                    loads with the page instead of scrolling in late. PNG kept as fallback. */}
                <img
                  src="/hero-warehouse-v2.webp"
                  alt="Warehouse worker with earbuds picking items into bins"
                  width={1536}
                  height={1024}
                  fetchPriority="high"
                  decoding="async"
                  className="relative rounded-2xl w-full border border-primary/20"
                  style={{
                    boxShadow: '0 20px 40px -15px rgba(0, 0, 0, 0.4)'
                  }}
                />

                {/* Subtle corner accents */}
                <div className="absolute -bottom-3 -right-3 w-20 h-20 bg-primary/20 rounded-full blur-xl"></div>
                <div className="absolute -top-3 -left-3 w-24 h-24 bg-primary/15 rounded-full blur-2xl"></div>
              </div>
            </div>
          </div>

          {/* Live Demo CTA - Below hero grid */}
          <div id="demo" className="mt-16 max-w-3xl mx-auto animate-fade-in-up animation-delay-300 scroll-mt-24">
            <div className="relative">
              {/* Subtle shadow for depth */}
              <div className="absolute inset-0 translate-x-3 translate-y-3 bg-black/30 rounded-xl blur-xl"></div>

              {/* Subtle glow ring */}
              <div className="absolute -inset-0.5 bg-gradient-to-r from-primary/40 to-cyan-400/40 rounded-xl blur-sm"></div>

              {/* Main CTA box */}
              <div className="relative bg-gradient-to-br from-slate-900 to-[#161b22] rounded-xl border border-slate-700 overflow-hidden shadow-2xl shadow-primary/10 p-8 text-center">
              <div className="w-20 h-20 rounded-full bg-emerald-500/20 flex items-center justify-center mx-auto mb-4 border-2 border-emerald-500/30">
                <Mic className="w-10 h-10 text-emerald-400" />
              </div>
              <h3 className="text-2xl font-bold text-white mb-2">Want to see it in action?</h3>
              <p className="text-gray-400 mb-6 max-w-md mx-auto">
                Experience a guided sample route right now. No signup needed and no customer data is used.
              </p>
              <Link to="/demo">
                <Button className="h-14 px-8 text-lg font-bold bg-emerald-600 hover:bg-emerald-700 rounded-xl shadow-lg shadow-emerald-500/30">
                  <Mic className="mr-2 h-5 w-5" />
                  Try the Live Demo
                </Button>
              </Link>
              <p className="text-xs text-gray-500 mt-4">Works best with earbuds in a quiet space</p>
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
              A Simple Phone-Based Workflow
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
              Why Operators Switch to Stocker AI
            </h2>
          </div>

          <div className="grid md:grid-cols-2 gap-8 max-w-5xl mx-auto">
            {[
              {
                icon: Eye,
                headline: "Stop Squinting at Screens",
                body: "Stocker AI calls out quantity, product, and slot while keeping the same details visible on screen. Drivers can use voice when it works for the moment and touch controls when it does not.",
              },
              {
                icon: UserPlus,
                headline: "Consistent Step-by-Step Guidance",
                body: "Stocker AI walks a driver through the assigned route one pick at a time. The same quantity, product, slot, and progress context is available throughout the workflow.",
              },
              {
                icon: Save,
                headline: "Every Pick Confirmed. Every Item Tracked",
                body: "Confirmed picking transitions are saved on the server. Refresh and reopening recovery restore the verified item window when authoritative evidence is available, and refuse to guess when it is not.",
              },
              {
                icon: Settings,
                headline: "Your Workflow, Your Way",
                body: "Drivers can choose top or bottom direction, one- or two-item callouts, voice commands, or touch controls while keeping progress tied to the active route.",
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
              Estimate the value of time saved using your actual picking hours and labor cost. Adjust the assumptions below to fit your operation.
            </p>
          </div>

          <ROICalculator />
        </div>
      </section>

      {/* 4b. Works With Your System — honest "built for" vendor list */}
      <section className="section-padding">
        <div className="section-container">
          <div className="text-center mb-10">
            <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-4">
              Works With the Reports You Already Pull
            </h2>
            <p className="text-xl text-muted-foreground max-w-3xl mx-auto">
              Upload the stock report from your vending system and Stocker AI reads it aloud, pick by pick.
              We read Parlevel reports today and are adding more. On another system? Tell us at signup and
              we'll set up your format.
            </p>
          </div>
          <div className="flex flex-wrap justify-center gap-3 max-w-4xl mx-auto">
            {[
              "Parlevel", "Nayax", "Cantaloupe / Seed", "Gimme", "VendSoft",
              "VendSys", "Vagabond", "Vend-Trak", "VendMAX", "+ your system",
            ].map((system) => (
              <span
                key={system}
                className="px-4 py-2 rounded-full border border-border bg-alt text-foreground text-sm font-medium"
              >
                {system}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* 5. Social Proof Section - HIDDEN: Ready to populate with testimonials */}
      <section className="section-padding hidden">
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
              { drivers: "2-5 drivers", price: "$20", label: "per driver/mo" },
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
              Join operators who've cut picking time by 25% or more with Stocker AI!
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
