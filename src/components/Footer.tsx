import { Link } from "react-router-dom";
import logo from "@/assets/logo-white.png";

export function Footer() {
  return (
    <footer className="bg-navy text-navy-light border-t border-border/10">
      <div className="container-wide mx-auto section-padding py-12">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          {/* Brand */}
          <div className="md:col-span-2">
            <Link to="/" className="flex items-center gap-3 mb-4">
              <img src={logo} alt="Orange Door Consultants" className="h-10 w-auto" />
            </Link>
            <p className="text-cream/60 max-w-sm">
              East Tennessee&apos;s digital marketing consultancy built for small
              businesses. Predictable growth through our proven 6-Step SYSTEM.
            </p>
          </div>

          {/* Quick Links */}
          <div>
            <h4 className="font-semibold text-cream mb-4">Quick Links</h4>
            <ul className="space-y-2">
              <li>
                <a
                  href="#about"
                  className="text-cream/60 hover:text-primary transition-colors"
                >
                  About Us
                </a>
              </li>
              <li>
                <a
                  href="#system"
                  className="text-cream/60 hover:text-primary transition-colors"
                >
                  The SYSTEM
                </a>
              </li>
              <li>
                <a
                  href="#pricing"
                  className="text-cream/60 hover:text-primary transition-colors"
                >
                  Pricing
                </a>
              </li>
              <li>
                <a
                  href="#contact"
                  className="text-cream/60 hover:text-primary transition-colors"
                >
                  Contact
                </a>
              </li>
            </ul>
          </div>

          {/* Services */}
          <div>
            <h4 className="font-semibold text-cream mb-4">Services</h4>
            <ul className="space-y-2">
              <li>
                <span className="text-cream/60">Search & Visibility</span>
              </li>
              <li>
                <span className="text-cream/60">Yield Optimization</span>
              </li>
              <li>
                <span className="text-cream/60">Sequence & Nurture</span>
              </li>
              <li>
                <span className="text-cream/60">Metrics & Improvement</span>
              </li>
            </ul>
          </div>
        </div>

        <div className="border-t border-cream/10 mt-12 pt-8 flex flex-col sm:flex-row justify-between items-center gap-4">
          <p className="text-cream/50 text-sm">
            © {new Date().getFullYear()} Orange Door Consultants. All rights
            reserved.
          </p>
          <p className="text-cream/50 text-sm">
            Proudly serving East Tennessee SMBs
          </p>
        </div>
      </div>
    </footer>
  );
}
