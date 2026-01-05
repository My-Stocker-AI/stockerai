import { Link } from "react-router-dom";

const Footer = () => {
  return (
    <footer className="bg-foreground text-background py-12">
      <div className="section-container">
        <div className="flex flex-col md:flex-row justify-between items-center gap-8">
          {/* Logo */}
          <Link to="/" className="flex items-center gap-2">
            <img src="/icon-192.png" alt="Stocker AI" className="h-12 w-12 rounded-lg" />
            <span className="text-lg font-bold">Stocker AI</span>
          </Link>

          {/* Links */}
          <div className="flex items-center gap-8 text-sm">
            <Link to="/" className="hover:text-primary transition-colors">
              Home
            </Link>
            <Link to="/pricing" className="hover:text-primary transition-colors">
              Pricing
            </Link>
            <Link to="/login" className="hover:text-primary transition-colors">
              Login
            </Link>
            <a
              href="mailto:support@my-stocker-ai.com"
              className="hover:text-primary transition-colors"
            >
              Contact
            </a>
          </div>

          {/* Legal */}
          <div className="flex items-center gap-4 text-sm text-muted-foreground">
            <span>© {new Date().getFullYear()} Stocker AI</span>
            <span>|</span>
            <a href="#" className="hover:text-primary transition-colors">
              Privacy Policy
            </a>
            <span>|</span>
            <a href="#" className="hover:text-primary transition-colors">
              Terms of Service
            </a>
          </div>
        </div>

        {/* Tagline */}
        <div className="text-center mt-8 pt-6 border-t border-muted-foreground/20">
          <p className="text-sm text-muted-foreground italic">
            Pick smarter. Stock faster.
          </p>
        </div>
      </div>
    </footer>
  );
};

export default Footer;