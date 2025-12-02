import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Menu, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link, useLocation } from "react-router-dom";
import logo from "@/assets/logo.png";

const navLinks = [
  { href: "/about", label: "About", isRoute: true },
  { href: "/system", label: "The SYSTEM", isRoute: true },
  { href: "/pricing", label: "Pricing", isRoute: true },
  { href: "/schedule", label: "Schedule Call", isRoute: true },
];

export function Header() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const location = useLocation();
  const isHomePage = location.pathname === "/";

  const handleNavClick = (href: string) => {
    if (!isHomePage && href.startsWith("#")) {
      window.location.href = "/" + href;
    }
  };

  return (
    <header className="fixed top-0 left-0 right-0 z-50 glass-effect border-b border-border/50">
      <nav className="container-wide mx-auto px-4 md:px-8 py-3">
        <div className="flex items-center justify-between gap-8">
          {/* Logo */}
          <Link to="/" className="flex items-center gap-3">
            <img 
              src={logo} 
              alt="Orange Door Consultants" 
              className="h-20 w-[280px] object-contain drop-shadow-md brightness-105 contrast-105" 
            />
          </Link>

          {/* Desktop Navigation */}
          <div className="hidden md:flex items-center gap-8">
            {navLinks.map((link) =>
              link.isRoute ? (
                <Link
                  key={link.href}
                  to={link.href}
                  className="text-muted-foreground hover:text-foreground transition-colors font-medium"
                >
                  {link.label}
                </Link>
              ) : (
                <a
                  key={link.href}
                  href={isHomePage ? link.href : "/" + link.href}
                  onClick={() => handleNavClick(link.href)}
                  className="text-muted-foreground hover:text-foreground transition-colors font-medium"
                >
                  {link.label}
                </a>
              )
            )}
            <Link to="/gap-analysis">
              <Button className="bg-primary hover:bg-orange-dark text-primary-foreground">
                Get Your Gap Analysis
              </Button>
            </Link>
          </div>

          {/* Mobile Menu Button */}
          <button
            className="md:hidden p-2"
            onClick={() => setIsMenuOpen(!isMenuOpen)}
            aria-label="Toggle menu"
          >
            {isMenuOpen ? <X size={24} /> : <Menu size={24} />}
          </button>
        </div>

        {/* Mobile Navigation */}
        <AnimatePresence>
          {isMenuOpen && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="md:hidden overflow-hidden"
            >
              <div className="flex flex-col gap-4 pt-6 pb-2">
                {navLinks.map((link) =>
                  link.isRoute ? (
                    <Link
                      key={link.href}
                      to={link.href}
                      className="text-muted-foreground hover:text-foreground transition-colors font-medium py-2"
                      onClick={() => setIsMenuOpen(false)}
                    >
                      {link.label}
                    </Link>
                  ) : (
                    <a
                      key={link.href}
                      href={isHomePage ? link.href : "/" + link.href}
                      className="text-muted-foreground hover:text-foreground transition-colors font-medium py-2"
                      onClick={() => setIsMenuOpen(false)}
                    >
                      {link.label}
                    </a>
                  )
                )}
                <Link to="/gap-analysis" onClick={() => setIsMenuOpen(false)}>
                  <Button className="bg-primary hover:bg-orange-dark text-primary-foreground w-full mt-2">
                    Get Your Gap Analysis
                  </Button>
                </Link>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </nav>
    </header>
  );
}
