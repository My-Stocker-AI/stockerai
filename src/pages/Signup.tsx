import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertCircle, Loader2 } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

const Signup = () => {
  const navigate = useNavigate();
  const { signUp } = useAuth();
  
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [driverCount, setDriverCount] = useState("5");
  const [machinesPerDriver, setMachinesPerDriver] = useState("6-10");
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const showMachineWarning = machinesPerDriver === "11-15" ||
                              machinesPerDriver === "16-20" ||
                              machinesPerDriver === "20+";

  // Calculate pricing based on driver count
  const getPricing = (count: number) => {
    if (count <= 5) return { tier: "Starter", price: 20 };
    if (count <= 20) return { tier: "Growth", price: 18 };
    return { tier: "Scale", price: 15 };
  };

  const parsedCount = driverCount === "50+" ? 50 : parseInt(driverCount) || 2;
  const pricing = getPricing(parsedCount);
  const monthlyTotal = parsedCount * pricing.price;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!agreedToTerms) {
      setError("Please agree to the Terms of Service and Privacy Policy");
      return;
    }

    if (password.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }

    setLoading(true);

    // Handle "50+" as 50 drivers - enterprise users can adjust in settings
    const parsedDriverCount = driverCount === "50+" ? 50 : (parseInt(driverCount) || 2);

    const { error: signUpError } = await signUp(
      email,
      password,
      firstName,
      lastName,
      parsedDriverCount
    );

    setLoading(false);

    if (signUpError) {
      if (signUpError.message.includes("already registered")) {
        setError("An account with this email already exists. Please sign in.");
      } else {
        setError(signUpError.message);
      }
      return;
    }

    toast.success("Account created! Check your email to confirm your account.");
    navigate("/dashboard");
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Simple Header */}
      <header className="p-4">
        <Link to="/" className="flex items-center gap-2 w-fit">
          <img src="/stocker-ai-logo.jpg" alt="Stocker AI" className="h-14 w-auto" />
          <span className="text-xl font-bold text-foreground">Stocker AI</span>
        </Link>
      </header>

      {/* Signup Form */}
      <main className="flex-1 flex items-center justify-center px-4 py-8">
        <div className="w-full max-w-md">
          <div className="card-base border border-border">
            <div className="text-center mb-6">
              <h1 className="text-2xl font-bold text-foreground mb-2">
                Create your account
              </h1>
              <p className="text-muted-foreground">
                Start your 14-day free trial
              </p>
            </div>

            {error && (
              <div className="mb-4 p-3 bg-destructive/10 border border-destructive/20 rounded-lg flex items-start gap-2">
                <AlertCircle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
                <p className="text-sm text-destructive">{error}</p>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="firstName">First name</Label>
                  <Input
                    id="firstName"
                    type="text"
                    placeholder="John"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="lastName">Last name</Label>
                  <Input
                    id="lastName"
                    type="text"
                    placeholder="Smith"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    required
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="you@company.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={8}
                />
                <p className="text-xs text-muted-foreground">Minimum 8 characters</p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="driverCount">How many drivers do you have?</Label>
                <Select value={driverCount} onValueChange={setDriverCount}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select driver count" />
                  </SelectTrigger>
                  <SelectContent>
                    {[2, 3, 4, 5, 6, 7, 8, 9, 10, 15, 20, 25, 30, 40, 50].map((num) => (
                      <SelectItem key={num} value={num.toString()}>
                        {num} drivers
                      </SelectItem>
                    ))}
                    <SelectItem value="50+">50+ drivers</SelectItem>
                  </SelectContent>
                </Select>

                {/* Pricing Summary */}
                <div className="mt-3 p-3 bg-primary/10 border border-primary/20 rounded-lg">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">{pricing.tier} Plan</span>
                    <span className="text-sm font-medium text-primary">${pricing.price}/driver/mo</span>
                  </div>
                  <div className="flex justify-between items-center mt-1">
                    <span className="text-sm text-muted-foreground">After 14-day trial</span>
                    <span className="text-lg font-bold text-foreground">${monthlyTotal}/mo</span>
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="machinesPerDriver">How many machines per driver daily?</Label>
                <Select value={machinesPerDriver} onValueChange={setMachinesPerDriver}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select range" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1-5">1-5 machines</SelectItem>
                    <SelectItem value="6-10">6-10 machines</SelectItem>
                    <SelectItem value="11-15">11-15 machines</SelectItem>
                    <SelectItem value="16-20">16-20 machines</SelectItem>
                    <SelectItem value="20+">20+ machines</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {showMachineWarning && (
                <div className="p-3 bg-warning/10 border border-warning/20 rounded-lg">
                  <p className="text-sm text-warning">
                    For more than 10 machines per driver, we'll review your account setup before activation.
                  </p>
                </div>
              )}

              <div className="flex items-start space-x-2">
                <Checkbox 
                  id="terms" 
                  checked={agreedToTerms}
                  onCheckedChange={(checked) => setAgreedToTerms(checked as boolean)}
                />
                <Label htmlFor="terms" className="text-sm leading-tight cursor-pointer">
                  I agree to the{" "}
                  <Link to="/terms" className="text-primary hover:underline">Terms of Service</Link>
                  {" "}and{" "}
                  <Link to="/privacy" className="text-primary hover:underline">Privacy Policy</Link>
                </Label>
              </div>

              <Button type="submit" className="btn-primary w-full" disabled={loading}>
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Creating account...
                  </>
                ) : (
                  "Start Free Trial"
                )}
              </Button>
            </form>

            <div className="mt-6 text-center">
              <p className="text-muted-foreground">
                Already have an account?{" "}
                <Link to="/login" className="text-primary hover:underline font-medium">
                  Login
                </Link>
              </p>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
};

export default Signup;
