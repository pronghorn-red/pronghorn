import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PronghornLogo } from "@/components/layout/PronghornLogo";
import { useNavigate } from "react-router-dom";
import { FileText, ListChecks, GitBranch, Shield, Zap, Users, ArrowRight, CheckCircle2 } from "lucide-react";
import pronghornHeroPoster from "@/assets/pronghorn-hero.png";
export default function Landing() {
  const navigate = useNavigate();
  const features = [{
    icon: FileText,
    title: "Standards-First Traceability",
    description: "Standards embedded by design—every requirement traces back to organizational standards, ensuring compliance from day one."
  }, {
    icon: ListChecks,
    title: "Validate While Building",
    description: "Continuous validation catches compliance gaps instantly, eliminating costly late-stage rework and technical debt."
  }, {
    icon: GitBranch,
    title: "Visual Architecture",
    description: "Design robust architectures with an interactive canvas that links standards, requirements, and components in real-time."
  }, {
    icon: Shield,
    title: "Proof of Compliance",
    description: "Automated auditing provides traceable evidence that your application meets every standard and requirement."
  }, {
    icon: Zap,
    title: "Autonomous Build-Audit-Fix",
    description: "AI agents work together to build, audit, and automatically remediate gaps—all changes remain fully traceable."
  }, {
    icon: Users,
    title: "Developer Support System",
    description: "Guides your team like an architect, accelerates work like a contractor, ensures quality like an inspector."
  }];
  const benefits = ["Eliminate compliance debt before it starts", "Reduce 12-month projects to weeks", "Proof of compliance built into every line of code", "Complete traceability from standards to code", "Build trust and confidence with stakeholders", "Accelerate delivery without sacrificing quality"];
  return <div className="min-h-screen bg-gradient-to-b from-background via-background to-muted">
      {/* Navigation */}
      <nav className="border-b border-border bg-background/80 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto px-6 py-4 flex justify-between items-center">
          <div className="flex items-center gap-2">
            <div className="text-primary">
              <PronghornLogo className="h-8 w-8" />
            </div>
            <span className="text-xl font-bold">Pronghorn</span>
          </div>
          <Button onClick={() => navigate('/dashboard')}>
            Get Started <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="container mx-auto px-4 md:px-6 py-12 md:py-20">
        <div className="grid md:grid-cols-2 gap-8 md:gap-12 items-center max-w-7xl mx-auto">
          {/* Left Column - Text Content */}
          <div className="text-center md:text-left order-2 md:order-1">
            <h1 className="text-3xl md:text-5xl lg:text-6xl font-bold mb-4 md:mb-6 bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text text-transparent">
              Standards Driven AI Development            
            </h1>
            <p className="text-base md:text-xl text-muted-foreground mb-6 md:mb-8">
              The alternative to unclear "vibe" coding. Build enterprise applications that are provably compliant 
              with standards and fully traceable to requirements—from clear architectural foundations to production-ready code.
            </p>
            <div className="flex flex-col sm:flex-row gap-3 md:gap-4 justify-center md:justify-start">
              <Button size="lg" onClick={() => navigate('/dashboard')} className="gap-2 w-full sm:w-auto">
                Start Building <ArrowRight className="h-4 w-4" />
              </Button>
              <Button size="lg" variant="outline" onClick={() => navigate('/standards')} className="w-full sm:w-auto">
                View Standards
              </Button>
            </div>
          </div>

          {/* Right Column - Video */}
          <div className="order-1 md:order-2">
            <div className="relative rounded-lg overflow-hidden shadow-2xl border border-border">
              <video autoPlay loop muted playsInline poster={pronghornHeroPoster} className="w-full h-auto">
                <source src="/pronghorn-hero.mp4" type="video/mp4" />
                Your browser does not support the video tag.
              </video>
            </div>
          </div>
        </div>
      </section>

      {/* Features Grid */}
      <section className="container mx-auto px-6 py-20">
        <div className="text-center mb-12">
          <h2 className="text-3xl font-bold mb-4">Built for Speed, Quality, Compliance, Traceability & Trust</h2>
          <p className="text-muted-foreground max-w-2xl mx-auto">
            Purpose-built for one mission: generating enterprise applications that are provably compliant 
            with standards and fully traceable to requirements
          </p>
        </div>
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {features.map((feature, index) => <Card key={index} className="p-6 hover:shadow-lg transition-shadow border-border">
              <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center mb-4">
                <feature.icon className="h-6 w-6 text-primary" />
              </div>
              <h3 className="text-xl font-semibold mb-2">{feature.title}</h3>
              <p className="text-muted-foreground">{feature.description}</p>
            </Card>)}
        </div>
      </section>

      {/* How It Works */}
      <section className="container mx-auto px-6 py-20 bg-muted/30 rounded-3xl">
        <div className="text-center mb-12">
          <h2 className="text-3xl font-bold mb-4">How Pronghorn Works</h2>
          <p className="text-muted-foreground">Three operational modes: Design, Audit, and Build</p>
        </div>
        <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
          <div className="text-center">
            <div className="h-16 w-16 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-2xl font-bold mx-auto mb-4">
              1
            </div>
            <h3 className="text-xl font-semibold mb-2">Design Mode</h3>
            <p className="text-muted-foreground">
              Lay down clear architectural, cyber security, and tech stack standards. Build robust architectures 
              as the foundation for compliant enterprise applications
            </p>
          </div>
          <div className="text-center">
            <div className="h-16 w-16 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-2xl font-bold mx-auto mb-4">
              2
            </div>
            <h3 className="text-xl font-semibold mb-2">Audit Mode</h3>
            <p className="text-muted-foreground">
              Continuously validate while building. Automated compliance auditing identifies gaps instantly, 
              providing proof of compliance with traceable evidence
            </p>
          </div>
          <div className="text-center">
            <div className="h-16 w-16 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-2xl font-bold mx-auto mb-4">
              3
            </div>
            <h3 className="text-xl font-semibold mb-2">Build Mode</h3>
            <p className="text-muted-foreground">
              AI agents build, audit, and automatically fix compliance gaps—all remediation remains fully traceable. 
              Real-time monitoring ensures system-wide consistency
            </p>
          </div>
        </div>
      </section>

      {/* Benefits */}
      <section className="container mx-auto px-6 py-20">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold mb-4">Why Choose Pronghorn</h2>
            <p className="text-muted-foreground">
              Support your development teams with standards-first, AI-powered, continuously validated development
            </p>
          </div>
          <div className="grid md:grid-cols-2 gap-4">
            {benefits.map((benefit, index) => <div key={index} className="flex items-start gap-3 p-4 rounded-lg hover:bg-muted/50 transition-colors">
                <CheckCircle2 className="h-6 w-6 text-primary flex-shrink-0 mt-0.5" />
                <span className="text-lg">{benefit}</span>
              </div>)}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="container mx-auto px-6 py-20">
        <Card className="p-12 text-center bg-gradient-to-br from-primary/10 via-primary/5 to-background border-primary/20">
          <h2 className="text-3xl font-bold mb-4">Ready to Build with Confidence?</h2>
          <p className="text-muted-foreground mb-8 max-w-2xl mx-auto">
            Join the new category of Autonomous Compliance-Driven Development. Deliver enterprise applications 
            that are provably compliant, fully traceable, and built in a fraction of the time
          </p>
          <Button size="lg" onClick={() => navigate('/dashboard')} className="gap-2">
            Create Your First Project <ArrowRight className="h-4 w-4" />
          </Button>
        </Card>
      </section>

      {/* Footer */}
      <footer className="border-t border-border bg-muted/30">
        <div className="container mx-auto px-6 py-8 text-center text-muted-foreground">
          <p>© 2025 Pronghorn. MIT License Open Source by the Government of Alberta.</p>
          <p className="text-sm mt-2">
            <a href="https://pronghorn.red" target="_blank" rel="noopener noreferrer" className="hover:text-foreground transition-colors">
              pronghorn.red
            </a>
          </p>
        </div>
      </footer>
    </div>;
}