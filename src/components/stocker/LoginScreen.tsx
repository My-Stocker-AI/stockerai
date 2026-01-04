import { useState } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface LoginScreenProps {
  onLogin: (email: string, password: string) => Promise<void>;
  onSignup: (email: string, password: string, firstName: string, lastName: string, phone: string) => Promise<void>;
  onForgotPassword: (email: string) => Promise<void>;
}

export function LoginScreen({ onLogin, onSignup, onForgotPassword }: LoginScreenProps) {
  const [isSignupMode, setIsSignupMode] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");
    
    if (!email) {
      setError("Please enter your email");
      return;
    }
    
    if (!password || password.length < 6) {
      setError("Password must be at least 6 characters");
      return;
    }
    
    setIsLoading(true);
    
    try {
      if (isSignupMode) {
        if (!firstName) {
          setError("Please enter your first name");
          setIsLoading(false);
          return;
        }
        await onSignup(email, password, firstName, lastName, phone);
        setSuccess("Check your email to confirm your account!");
      } else {
        await onLogin(email, password);
      }
    } catch (err: any) {
      setError(err.message || "Authentication failed. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleForgotPassword = async () => {
    if (!email) {
      setError("Please enter your email first");
      return;
    }
    
    setError("");
    setIsLoading(true);
    
    try {
      await onForgotPassword(email);
      setSuccess("Password reset email sent!");
    } catch (err: any) {
      setError(err.message || "Failed to send reset email");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 flex flex-col items-center justify-start pt-16 px-5 pb-5 overflow-y-auto bg-background">
      {/* Background glow effect */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-96 h-96 bg-primary/10 rounded-full blur-3xl" />
      </div>
      
      <div className="relative w-full max-w-sm glass-strong rounded-2xl p-8 animate-scale-in">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-40 h-40 rounded-2xl bg-gradient-to-br from-primary/30 to-primary/10 flex items-center justify-center mb-4 glow-primary">
            <img src="/stocker-ai-logo.jpg" alt="Stocker AI" className="w-24 h-24 object-contain" />
          </div>
          <h1 className="text-2xl font-bold text-foreground">Stocker AI</h1>
          <p className="text-sm text-muted-foreground mt-1">Voice-Guided Stocking Assistant</p>
        </div>
        
        {/* Auth tabs */}
        <div className="flex rounded-lg bg-muted p-1 mb-6">
          <button
            type="button"
            onClick={() => { setIsSignupMode(false); setError(""); setSuccess(""); }}
            className={cn(
              "flex-1 py-2.5 text-sm font-semibold rounded-md transition-all",
              !isSignupMode 
                ? "bg-primary text-primary-foreground" 
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            Log In
          </button>
          <button
            type="button"
            onClick={() => { setIsSignupMode(true); setError(""); setSuccess(""); }}
            className={cn(
              "flex-1 py-2.5 text-sm font-semibold rounded-md transition-all",
              isSignupMode 
                ? "bg-primary text-primary-foreground" 
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            Sign Up
          </button>
        </div>
        
        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Signup-only fields */}
          {isSignupMode && (
            <>
              <div className="flex gap-3">
                <Input
                  type="text"
                  placeholder="First name"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  autoComplete="given-name"
                  className="flex-1"
                />
                <Input
                  type="text"
                  placeholder="Last name"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  autoComplete="family-name"
                  className="flex-1"
                />
              </div>
              <Input
                type="tel"
                placeholder="Phone (for voice updates)"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                autoComplete="tel"
              />
            </>
          )}
          
          <Input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="username"
          />
          
          <Input
            type="password"
            placeholder={isSignupMode ? "Create password (min 6 chars)" : "Password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={isSignupMode ? "new-password" : "current-password"}
          />
          
          <Button
            type="submit"
            className="w-full"
            size="lg"
            disabled={isLoading}
          >
            {isLoading 
              ? (isSignupMode ? "Creating account..." : "Logging in...")
              : (isSignupMode ? "Sign Up" : "Log In")
            }
          </Button>
        </form>
        
        {/* Forgot password */}
        {!isSignupMode && (
          <button
            type="button"
            onClick={handleForgotPassword}
            className="block w-full text-center text-xs text-muted-foreground hover:text-foreground underline mt-4 transition-colors"
          >
            Forgot password?
          </button>
        )}
        
        {/* Messages */}
        {error && (
          <p className="text-sm text-destructive text-center mt-4 animate-fade-in">
            {error}
          </p>
        )}
        {success && (
          <p className="text-sm text-primary text-center mt-4 animate-fade-in">
            {success}
          </p>
        )}
      </div>
    </div>
  );
}
