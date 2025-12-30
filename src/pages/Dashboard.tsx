import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { AudioWaveform, LogOut } from "lucide-react";

const Dashboard = () => {
  return (
    <div className="min-h-screen bg-background">
      {/* Dashboard Header */}
      <header className="border-b border-border bg-card">
        <div className="section-container">
          <div className="flex items-center justify-between h-16">
            <Link to="/" className="flex items-center gap-2">
              <AudioWaveform className="h-7 w-7 text-primary" />
              <span className="text-xl font-bold text-foreground">Stocker</span>
            </Link>

            <div className="flex items-center gap-4">
              <span className="text-sm text-muted-foreground">
                demo@example.com
              </span>
              <Button variant="ghost" size="sm" className="text-muted-foreground">
                <LogOut className="h-4 w-4 mr-2" />
                Sign Out
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Dashboard Content Placeholder */}
      <main className="section-container py-12">
        <div className="max-w-4xl mx-auto">
          <h1 className="text-3xl font-bold text-foreground mb-2">Dashboard</h1>
          <p className="text-muted-foreground mb-8">
            Welcome to your Stocker AI dashboard
          </p>

          <div className="grid md:grid-cols-3 gap-6 mb-8">
            {[
              { label: "Active Routes", value: "3" },
              { label: "Items Picked Today", value: "247" },
              { label: "Team Members", value: "8" },
            ].map((stat, index) => (
              <div key={index} className="card-base border border-border">
                <p className="text-sm text-muted-foreground mb-1">{stat.label}</p>
                <p className="text-3xl font-bold text-foreground">{stat.value}</p>
              </div>
            ))}
          </div>

          <div className="card-base border border-border">
            <h2 className="text-lg font-semibold text-foreground mb-4">
              Quick Actions
            </h2>
            <div className="flex flex-wrap gap-3">
              <Button className="btn-primary">Start New Route</Button>
              <Button variant="outline" className="btn-secondary">
                View Reports
              </Button>
              <Button variant="outline" className="btn-secondary">
                Manage Team
              </Button>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default Dashboard;