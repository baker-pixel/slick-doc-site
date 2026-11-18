import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { Header } from "@/components/Header";
import { Hero } from "@/components/Hero";
import { Stats } from "@/components/Stats";
import { About } from "@/components/About";
import { WhyUs } from "@/components/WhyUs";
import { SystemSection } from "@/components/SystemSection";
import { Pricing } from "@/components/Pricing";
import { Contact } from "@/components/Contact";
import { ClientLoginCTA } from "@/components/ClientLoginCTA";
import { Footer } from "@/components/Footer";

const Index = () => {
  // Arriving from another page via "/#pricing" etc.: the sections mount after the
  // lazy chunk loads, so the browser's own hash scroll misses them.
  const { hash } = useLocation();
  useEffect(() => {
    if (!hash) return;
    const t = setTimeout(() => document.getElementById(hash.slice(1))?.scrollIntoView(), 100);
    return () => clearTimeout(t);
  }, [hash]);

  return (
    <div className="min-h-screen">
      <Header />
      <main>
        <Hero />
        <Stats />
        <About />
        <WhyUs />
        <SystemSection />
        <Pricing />
        <ClientLoginCTA />
        <Contact />
      </main>
      <Footer />
    </div>
  );
};

export default Index;
