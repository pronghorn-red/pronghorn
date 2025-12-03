import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PronghornLogo } from "@/components/layout/PronghornLogo";
import { useNavigate } from "react-router-dom";
import { 
  FileText, Library, Layout, Bot, Code, Users, 
  ArrowRight, Check, ShieldCheck, GitBranch, CheckCircle,
  Rocket, Shield, Award
} from "lucide-react";

export default function Landing() {
  const navigate = useNavigate();
  
  const features = [
    {
      icon: FileText,
      title: "AI-Powered Requirements",
      description: "Transform unstructured ideas into structured Epics, Features, and Stories. AI decomposes and expands requirements while linking them to organizational standards for complete traceability.",
      color: "bg-blue-100 text-blue-600"
    },
    {
      icon: Library,
      title: "Global Standards Library",
      description: "Build your organization's compliance foundation once, use everywhere. Create reusable standards categories and tech stack templates that automatically link to all your projects.",
      color: "bg-violet-100 text-violet-600"
    },
    {
      icon: Layout,
      title: "Visual Architecture Design",
      description: "Design complex architectures with an interactive canvas. Drag-and-drop nodes for pages, APIs, databases, and security layers. Real-time sync keeps your whole team aligned.",
      color: "bg-emerald-100 text-emerald-600"
    },
    {
      icon: Bot,
      title: "Multi-Agent AI Teams",
      description: "Orchestrate teams of AI agents—Architects, Developers, DBAs, Security, QA—that iteratively refine your architecture. Watch agents collaborate on a shared blackboard until designs stabilize.",
      color: "bg-rose-100 text-rose-600"
    },
    {
      icon: Code,
      title: "AI Coding Agent",
      description: "An autonomous coding agent that reads your requirements, searches your codebase, and makes changes—all with full audit trail. Stage changes, review diffs, and push to GitHub when ready.",
      color: "bg-amber-100 text-amber-600"
    },
    {
      icon: Users,
      title: "Instant Collaboration",
      description: "Share any project with a link—no login required. Real-time sync means everyone sees changes instantly. Start anonymous, claim your projects when ready.",
      color: "bg-cyan-100 text-cyan-600"
    }
  ];

  const benefits = [
    "Complete traceability from standards to code",
    "AI teams that iterate until architecture stabilizes",
    "No account required to start—instant collaboration",
    "Built-in code editor with GitHub sync",
    "Multi-model AI support (Gemini, Claude, Grok)",
    "13+ specification templates for any audience"
  ];

  return (
    <div className="min-h-screen bg-[hsl(38,60%,97%)] text-[hsl(240,30%,15%)] antialiased overflow-x-hidden">
      {/* Navbar */}
      <nav className="fixed w-full top-0 z-50 bg-[hsl(38,60%,97%)]/90 backdrop-blur-md border-b border-[hsl(30,20%,88%)]/50 transition-all duration-300">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <PronghornLogo className="h-8 w-8 rounded-lg" />
            <span className="text-xl font-semibold tracking-tight">Pronghorn</span>
          </div>
          
          <Button 
            onClick={() => navigate('/dashboard')}
            className="bg-[hsl(240,30%,15%)] text-white px-5 py-2.5 rounded-lg font-medium text-sm hover:bg-[hsl(240,30%,20%)] hover:scale-105 active:scale-95 transition-all shadow-lg shadow-[hsl(240,30%,15%)]/20"
          >
            Get Started
          </Button>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative pt-32 pb-20 lg:pt-40 lg:pb-32 px-6 overflow-hidden">
        {/* Background decorations */}
        <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none z-0">
          <svg className="absolute top-20 left-10 w-[800px] h-[800px] opacity-20 text-muted-foreground/30" viewBox="0 0 100 100">
            <path d="M0,50 Q25,25 50,50 T100,50" fill="none" stroke="currentColor" strokeWidth="0.5" />
            <path d="M0,60 Q25,35 50,60 T100,60" fill="none" stroke="currentColor" strokeWidth="0.5" />
          </svg>
          <div className="absolute right-0 top-0 w-1/2 h-full bg-gradient-to-l from-rose-100/30 to-transparent blur-3xl" />
        </div>

        <div className="max-w-7xl mx-auto grid lg:grid-cols-2 gap-8 lg:gap-16 items-center relative z-10">
          <div className="space-y-8 text-center lg:text-left">
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-medium tracking-tight leading-[1.1] text-[hsl(240,30%,15%)]">
              Build Software with <br />
              <span className="text-[hsl(350,80%,60%)] relative inline-block">
                AI-Powered
                <svg className="absolute w-full h-3 -bottom-1 left-0 text-rose-200 -z-10" viewBox="0 0 100 10" preserveAspectRatio="none">
                  <path d="M0,5 Q50,10 100,5" stroke="currentColor" strokeWidth="8" fill="none" />
                </svg>
              </span> Precision
            </h1>
            <p className="text-lg md:text-xl text-muted-foreground max-w-lg leading-relaxed mx-auto lg:mx-0">
              Transform requirements into production code with AI agents that understand your standards, design your architecture, and write compliant code—all with complete traceability.
            </p>
            <div className="flex justify-center lg:justify-start">
              <Button 
                size="lg"
                onClick={() => navigate('/dashboard')}
                className="group bg-[hsl(240,30%,15%)] text-white px-8 py-4 rounded-xl font-medium text-lg hover:bg-[hsl(240,30%,20%)] hover:shadow-xl hover:shadow-[hsl(240,30%,15%)]/20 hover:-translate-y-1 transition-all duration-300 flex items-center gap-2"
              >
                Start Building
                <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
              </Button>
            </div>
          </div>

          {/* Hero Floating Elements - Desktop only */}
          <div className="relative h-[500px] w-full hidden lg:flex items-center justify-center">
            <div className="relative w-full max-w-md aspect-square">
              {/* Glow background */}
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[120%] h-[120%] bg-rose-100/50 rounded-full blur-3xl" />
              
              {/* Floating shield icon */}
              <div className="absolute top-0 right-10 z-20 animate-float">
                <div className="bg-[hsl(350,80%,60%)] p-4 rounded-2xl shadow-xl transform rotate-12">
                  <ShieldCheck className="w-12 h-12 text-white" />
                </div>
              </div>
              
              {/* Floating git branch icon */}
              <div className="absolute bottom-20 left-0 z-20 animate-float-delayed">
                <div className="bg-emerald-500 p-4 rounded-2xl shadow-xl transform -rotate-12">
                  <GitBranch className="w-12 h-12 text-white" />
                </div>
              </div>

              {/* Floating check icon */}
              <div className="absolute top-1/2 right-0 z-20 animate-float">
                <div className="bg-amber-500 p-3 rounded-full shadow-xl">
                  <CheckCircle className="w-8 h-8 text-white" />
                </div>
              </div>

              {/* Main card */}
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-80 bg-white rounded-2xl shadow-2xl border border-rose-100 overflow-hidden transform hover:scale-105 transition-transform duration-500">
                <div className="w-full bg-gradient-to-br from-rose-50 to-white p-6 flex flex-col gap-4">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-red-400" />
                    <div className="w-3 h-3 rounded-full bg-yellow-400" />
                    <div className="w-3 h-3 rounded-full bg-green-400" />
                  </div>
                  <div className="space-y-3">
                    <div className="flex items-center gap-3 p-3 bg-emerald-50 rounded-lg">
                      <div className="w-2 h-2 rounded-full bg-emerald-400" />
                      <span className="text-sm font-medium text-gray-700">Requirements validated</span>
                    </div>
                    <div className="flex items-center gap-3 p-3 bg-blue-50 rounded-lg">
                      <div className="w-2 h-2 rounded-full bg-blue-400" />
                      <span className="text-sm font-medium text-gray-700">Architecture designed</span>
                    </div>
                    <div className="flex items-center gap-3 p-3 bg-violet-50 rounded-lg">
                      <div className="w-2 h-2 rounded-full bg-violet-400" />
                      <span className="text-sm font-medium text-gray-700">Standards linked</span>
                    </div>
                    <div className="flex items-center gap-3 p-3 bg-rose-50 rounded-lg border border-rose-200">
                      <div className="w-2 h-2 rounded-full bg-[hsl(350,80%,55%)] animate-pulse" />
                      <span className="text-sm font-medium text-[hsl(350,80%,45%)]">AI agents building...</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-24 px-6 bg-white/50">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-medium tracking-tight mb-4 text-[hsl(240,30%,15%)]">Everything You Need to Build Better Software</h2>
            <p className="text-xl text-gray-600 max-w-3xl mx-auto">
              From requirements to production code, Pronghorn provides the complete toolkit for standards-driven development with AI assistance at every step.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map((feature, index) => (
              <Card 
                key={index} 
                className="bg-white p-8 rounded-2xl border border-border hover:shadow-xl hover:-translate-y-2 transition-all duration-300"
              >
                <div className={`w-12 h-12 ${feature.color} rounded-xl flex items-center justify-center mb-6`}>
                  <feature.icon className="w-6 h-6" />
                </div>
                <h3 className="text-xl font-medium mb-3 text-[hsl(240,30%,15%)]">{feature.title}</h3>
                <p className="text-gray-600">{feature.description}</p>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* How It Works Section */}
      <section className="py-24 px-6">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-medium tracking-tight mb-4 text-[hsl(240,30%,15%)]">How Pronghorn Works</h2>
            <p className="text-xl text-gray-600">Three phases to transform ideas into production-ready software</p>
          </div>

          <div className="grid lg:grid-cols-3 gap-8">
            <div className="relative bg-gradient-to-br from-blue-50 to-white p-10 rounded-3xl border border-blue-100">
              <div className="absolute -top-4 -left-4 w-12 h-12 bg-blue-500 rounded-full flex items-center justify-center text-white font-semibold text-xl shadow-lg">1</div>
              <div className="pt-4">
                <h3 className="text-2xl font-medium tracking-tight mb-4 text-[hsl(240,30%,15%)]">Design</h3>
                <p className="text-gray-600 leading-relaxed">
                  Define standards, requirements, and architecture on an interactive canvas. AI helps decompose ideas into structured specifications.
                </p>
              </div>
            </div>

            <div className="relative bg-gradient-to-br from-rose-50 to-white p-10 rounded-3xl border border-rose-100">
              <div className="absolute -top-4 -left-4 w-12 h-12 bg-[hsl(350,80%,55%)] rounded-full flex items-center justify-center text-white font-semibold text-xl shadow-lg">2</div>
              <div className="pt-4">
                <h3 className="text-2xl font-medium tracking-tight mb-4 text-[hsl(240,30%,15%)]">Build</h3>
                <p className="text-gray-600 leading-relaxed">
                  AI agents generate code, audit compliance, and fix gaps autonomously. Review changes in a built-in editor with Git integration.
                </p>
              </div>
            </div>

            <div className="relative bg-gradient-to-br from-emerald-50 to-white p-10 rounded-3xl border border-emerald-100">
              <div className="absolute -top-4 -left-4 w-12 h-12 bg-emerald-500 rounded-full flex items-center justify-center text-white font-semibold text-xl shadow-lg">3</div>
              <div className="pt-4">
                <h3 className="text-2xl font-medium tracking-tight mb-4 text-[hsl(240,30%,15%)]">Ship</h3>
                <p className="text-gray-600 leading-relaxed">
                  Generate comprehensive specs for any audience—technical docs, executive summaries, RFPs, or cloud architecture guides. Export and share with confidence.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Why Choose Section */}
      <section className="py-24 px-6 bg-white">
        <div className="max-w-7xl mx-auto grid lg:grid-cols-2 gap-16 items-center">
          <div>
            <h2 className="text-4xl font-medium tracking-tight mb-6 text-[hsl(240,30%,15%)]">Why Choose Pronghorn?</h2>
            <p className="text-xl text-gray-600 leading-relaxed mb-10">
              Built for teams who refuse to compromise on quality. Every feature designed to maintain traceability from concept to deployment.
            </p>
            <ul className="space-y-4">
              {benefits.map((benefit, index) => (
                <li key={index} className="flex items-center gap-4">
                  <div className="w-6 h-6 bg-emerald-100 rounded-full flex items-center justify-center flex-shrink-0">
                    <Check className="w-4 h-4 text-emerald-600" />
                  </div>
                  <span className="text-gray-700">{benefit}</span>
                </li>
              ))}
            </ul>
          </div>
          
          {/* Stats Card */}
          <div className="relative h-[450px] w-full rounded-3xl overflow-hidden shadow-2xl bg-gradient-to-br from-[hsl(240,30%,15%)] to-[hsl(240,30%,20%)] p-10 flex flex-col justify-center">
            <div className="absolute top-0 right-0 w-64 h-64 bg-[hsl(350,80%,60%)]/20 rounded-full blur-3xl" />
            <div className="absolute bottom-0 left-0 w-48 h-48 bg-emerald-500/20 rounded-full blur-3xl" />
            <div className="relative z-10 space-y-6">
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 bg-white/10 rounded-2xl flex items-center justify-center">
                  <Bot className="w-8 h-8 text-white" />
                </div>
                <div>
                  <div className="text-3xl font-semibold text-white tracking-tight">10+</div>
                  <div className="text-white/70">AI Agents</div>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 bg-white/10 rounded-2xl flex items-center justify-center">
                  <Shield className="w-8 h-8 text-white" />
                </div>
                <div>
                  <div className="text-3xl font-semibold text-white tracking-tight">100%</div>
                  <div className="text-white/70">Traceable</div>
                </div>
              </div>
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 bg-white/10 rounded-2xl flex items-center justify-center">
                  <Award className="w-8 h-8 text-white" />
                </div>
                <div>
                  <div className="text-3xl font-semibold text-white tracking-tight">13+</div>
                  <div className="text-white/70">Spec Templates</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-16 md:py-24 px-4 md:px-6">
        <div className="max-w-4xl mx-auto text-center">
          <div className="bg-gradient-to-br from-rose-100/50 to-rose-50 rounded-3xl p-8 md:p-12 lg:p-16 relative overflow-hidden">
            <div className="absolute -top-20 -right-20 w-64 h-64 bg-[hsl(350,80%,60%)]/10 rounded-full blur-3xl" />
            <div className="absolute -bottom-20 -left-20 w-64 h-64 bg-amber-400/10 rounded-full blur-3xl" />
            <div className="relative z-10">
              <h2 className="text-3xl md:text-4xl lg:text-5xl font-medium tracking-tight mb-6 text-[hsl(240,30%,15%)]">Ready to Build with AI Precision?</h2>
              <p className="text-lg md:text-xl text-gray-600 mb-8 md:mb-10 max-w-2xl mx-auto">
                Join teams who are shipping better software, faster, with complete traceability from requirements to code.
              </p>
              <Button 
                size="lg"
                onClick={() => navigate('/dashboard')}
                className="group bg-[hsl(240,30%,15%)] text-white px-6 md:px-10 py-4 rounded-xl font-medium text-base md:text-lg hover:bg-[hsl(240,30%,20%)] hover:shadow-xl hover:shadow-[hsl(240,30%,15%)]/20 hover:-translate-y-1 transition-all duration-300 inline-flex items-center gap-2"
              >
                <span>Create Your First Project</span>
                <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-12 px-6 border-t border-gray-100">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-6">
          <div className="flex items-center gap-3">
            <PronghornLogo className="h-8 w-8 rounded-lg" />
            <span className="text-lg font-semibold tracking-tight text-[hsl(240,30%,15%)]">Pronghorn</span>
          </div>
          <div className="text-sm text-gray-500 text-center md:text-right">
            <p>© 2025 Pronghorn. MIT License Open Source by the Government of Alberta.</p>
            <a href="https://pronghorn.red" target="_blank" rel="noopener noreferrer" className="text-[hsl(350,80%,60%)] hover:underline">
              pronghorn.red
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
