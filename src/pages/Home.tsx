import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import Navbar from "@/components/marketing/Navbar";
import Footer from "@/components/marketing/Footer";
import { Mic, Clock, Users, TrendingUp } from "lucide-react";

const Home = () => {
  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      
      {/* Hero Section */}
      <section className="pt-32 pb-20 md:pt-40 md:pb-28">
        <div className="section-container">
          <div className="max-w-4xl mx-auto text-center">
            <h1 className="text-5xl md:text-6xl font-bold tracking-tight text-foreground mb-6 animate-fade-in-up">
              Pick Routes <span className="text-primary">40% Faster</span> with Voice
            </h1>
            <p className="text-xl text-muted-foreground mb-10 max-w-2xl mx-auto animate-fade-in-up animation-delay-100">
              Stocker AI guides your warehouse team through every pick with voice commands. 
              No training required. Works on any phone.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center animate-fade-in-up animation-delay-200">
              <Link to="/login">
                <Button className="btn-primary">
                  Start Free Trial
                </Button>
              </Link>
              <a href="#demo">
                <Button variant="outline" className="btn-secondary">
                  Watch Demo
                </Button>
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* Stats Section */}
      <section className="bg-alt section-padding">
        <div className="section-container">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
            {[
              { number: "40%", label: "Faster Picking" },
              { number: "90%", label: "Less Training Time" },
              { number: "500+", label: "Operators Trust Us" },
              { number: "2M+", label: "Items Picked" },
            ].map((stat, index) => (
              <div key={index} className="text-center">
                <div className="text-4xl md:text-5xl font-bold text-primary mb-2">
                  {stat.number}
                </div>
                <div className="text-muted-foreground font-medium">
                  {stat.label}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="section-padding">
        <div className="section-container">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-4">
              Built for Real Warehouse Work
            </h2>
            <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
              No apps to learn. No buttons to press. Just talk and pick.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            {[
              {
                icon: Mic,
                title: "Voice-First Design",
                description: "Hands-free operation means faster picking and fewer errors.",
              },
              {
                icon: Clock,
                title: "No Training Needed",
                description: "New drivers can start in minutes, not days.",
              },
              {
                icon: Users,
                title: "Team Dashboard",
                description: "Track productivity across your entire team in real-time.",
              },
              {
                icon: TrendingUp,
                title: "Route Optimization",
                description: "Smart sequencing reduces travel time in the warehouse.",
              },
            ].map((feature, index) => (
              <div key={index} className="card-base hover:shadow-md transition-shadow">
                <feature.icon className="h-10 w-10 text-primary mb-4" />
                <h3 className="text-lg font-semibold text-foreground mb-2">
                  {feature.title}
                </h3>
                <p className="text-muted-foreground">
                  {feature.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Demo Section Placeholder */}
      <section id="demo" className="bg-alt section-padding">
        <div className="section-container">
          <div className="text-center">
            <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-4">
              See It In Action
            </h2>
            <p className="text-xl text-muted-foreground mb-10 max-w-2xl mx-auto">
              Watch how Stocker AI transforms warehouse picking
            </p>
            <div className="max-w-4xl mx-auto aspect-video bg-muted rounded-xl flex items-center justify-center">
              <p className="text-muted-foreground">Demo Video Coming Soon</p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="section-padding">
        <div className="section-container">
          <div className="max-w-3xl mx-auto text-center">
            <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-4">
              Ready to Pick Faster?
            </h2>
            <p className="text-xl text-muted-foreground mb-8">
              Start your 14-day free trial. No credit card required.
            </p>
            <Link to="/login">
              <Button className="btn-primary">
                Start Free Trial
              </Button>
            </Link>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
};

export default Home;