import { Link } from "react-router-dom";
import { AudioWaveform } from "lucide-react";

const Footer = () => {
  return (
    <footer className="bg-foreground text-background py-12">
      <div className="section-container">
        <div className="flex flex-col md:flex-row justify-between items-center gap-6">
          {/* Logo */}
          <Link to="/" className="flex items-center gap-2">
            <AudioWaveform className="h-6 w-6 text-primary" />
            <span className="text-lg font-bold">Stocker</span>
          </Link>

          {/* Links */}
          <div className="flex items-center gap-8 text-sm">
            <Link to="/pricing" className="hover:text-primary transition-colors">
              Pricing
            </Link>
            <a href="#features" className="hover:text-primary transition-colors">
              Features
            </a>
            <Link to="/login" className="hover:text-primary transition-colors">
              Login
            </Link>
          </div>

          {/* Copyright */}
          <p className="text-sm text-muted-foreground">
            © {new Date().getFullYear()} Stocker AI. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
};

export default Footer;