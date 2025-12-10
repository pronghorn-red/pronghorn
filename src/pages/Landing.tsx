import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PronghornLogo } from "@/components/layout/PronghornLogo";
import { useNavigate, Link } from "react-router-dom";
import {
  FileText,
  Library,
  Layout,
  Bot,
  Code,
  Users,
  ArrowRight,
  Check,
  ShieldCheck,
  GitBranch,
  CheckCircle,
  Rocket,
  Shield,
  Award,
  Settings,
  Archive,
  MessageSquare,
  ListTree,
  Hammer,
  Sparkles,
  Github,
  Heart,
  Zap,
  X,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export default function Landing() {
  const navigate = useNavigate();

  const [selectedStep, setSelectedStep] = useState<typeof workflowSteps[0] | null>(null);

  const workflowSteps = [
    { 
      icon: Settings, 
      label: "Settings", 
      description: "Configure project, link standards & tech stacks", 
      phase: "setup",
      hasAgent: true,
      aiDetails: {
        title: "AI Model Configuration",
        capabilities: [
          "Select from Gemini, Claude, or Grok AI models",
          "Configure max tokens and response length limits",
          "Enable thinking mode for complex reasoning tasks",
          "Set model preferences per project for optimal results"
        ]
      }
    },
    { 
      icon: Archive, 
      label: "Artifacts", 
      description: "Upload documents, images, reference files", 
      phase: "setup",
      hasAgent: true,
      aiDetails: {
        title: "AI-Powered Document Processing",
        capabilities: [
          "Automatic summarization of uploaded documents",
          "Smart indexing and content extraction",
          "Parse PDFs, DOCX, Excel files into structured data",
          "Generate AI titles and descriptions for quick reference"
        ]
      }
    },
    { 
      icon: MessageSquare, 
      label: "Chat", 
      description: "AI-powered conversations about your project", 
      phase: "design", 
      hasAgent: true,
      aiDetails: {
        title: "Project-Aware AI Conversations",
        capabilities: [
          "AI agents with full project context awareness",
          "Can read requirements, standards, canvas, and files",
          "Multi-model support (Gemini, Claude, Grok)",
          "Attach any project element as conversation context"
        ]
      }
    },
    { 
      icon: ListTree, 
      label: "Requirements", 
      description: "AI decomposes ideas into Epics → Stories", 
      phase: "design", 
      hasAgent: true,
      aiDetails: {
        title: "AI Requirements Decomposition",
        capabilities: [
          "Transform unstructured text into structured requirements",
          "Generate Epics → Features → User Stories → Acceptance Criteria",
          "Automatic deduplication against existing requirements",
          "Support for edit/create actions on existing items"
        ]
      }
    },
    { 
      icon: ShieldCheck, 
      label: "Standards", 
      description: "Link organizational compliance standards", 
      phase: "design", 
      hasAgent: true,
      aiDetails: {
        title: "AI Standards Expansion",
        capabilities: [
          "Expand source documents into structured standards",
          "Auto-link standards to project requirements",
          "Intelligent categorization and hierarchy building",
          "Generate compliance criteria from policy documents"
        ]
      }
    },
    { 
      icon: Layout, 
      label: "Canvas", 
      description: "Visual architecture with 10+ AI agents", 
      phase: "design", 
      hasAgent: true, 
      featured: true,
      aiDetails: {
        title: "AI Architecture Team (10 Agents)",
        capabilities: [
          "Architect, Developer, DBA agents for core design",
          "QA, UAT, Compliance agents for quality assurance",
          "Cyber Security agent for threat analysis",
          "Agents iterate on shared blackboard until design stabilizes"
        ]
      }
    },
    { 
      icon: FileText, 
      label: "Specifications", 
      description: "Generate 13+ document types", 
      phase: "design", 
      hasAgent: true,
      aiDetails: {
        title: "AI Document Generation",
        capabilities: [
          "13+ specification templates for any audience",
          "Technical specs, executive summaries, procurement docs",
          "Cloud architecture guides (AWS, Azure, GCP)",
          "Security review and compliance documentation"
        ]
      }
    },
    { 
      icon: GitBranch, 
      label: "Repository", 
      description: "GitHub-synced code repository", 
      phase: "ship",
      aiDetails: {
        title: "GitHub Integration",
        capabilities: [
          "Bi-directional sync with GitHub repositories",
          "Branch management and commit history",
          "File browser with Monaco code editor",
          "Personal Access Token support for private repos"
        ]
      }
    },
    { 
      icon: Hammer, 
      label: "Build", 
      description: "Autonomous AI coding agent", 
      phase: "ship", 
      hasAgent: true, 
      featured: true,
      aiDetails: {
        title: "Autonomous Coding Agent",
        capabilities: [
          "Read files, search codebase, understand project structure",
          "Create, edit, rename, delete files with full audit trail",
          "Stage changes with diff review before committing",
          "Iterative orchestration with configurable max iterations"
        ]
      }
    },
    { 
      icon: Rocket, 
      label: "Deploy", 
      description: "Push to cloud or local environments", 
      phase: "ship",
      aiDetails: {
        title: "Deployment Options",
        capabilities: [
          "Deploy to Render.com cloud hosting",
          "Local development runner with hot reload",
          "Environment-based deployments (dev/uat/prod)",
          "Bug telemetry integration for automated fixes"
        ]
      }
    },
  ];

  const canvasAgents = [
    { name: "Architect", color: "bg-blue-500", description: "System architecture" },
    { name: "Developer", color: "bg-orange-500", description: "Components & APIs" },
    { name: "DBA", color: "bg-indigo-500", description: "Database schemas" },
    { name: "Cloud Ops", color: "bg-teal-500", description: "Infrastructure" },
    { name: "QA", color: "bg-green-500", description: "Testing & quality" },
    { name: "UAT", color: "bg-yellow-500", description: "User validation" },
    { name: "Compliance", color: "bg-purple-500", description: "Standards adherence" },
    { name: "Cyber Security", color: "bg-red-500", description: "Security analysis", featured: true },
    { name: "Integrator", color: "bg-pink-500", description: "System connections" },
    { name: "Simplifier", color: "bg-gray-500", description: "Reduces complexity" },
  ];

  const features = [
    {
      icon: FileText,
      title: "AI-Powered Requirements",
      description:
        "Transform unstructured ideas into structured Epics, Features, and Stories. AI decomposes and expands requirements while linking them to organizational standards for complete traceability.",
      color: "bg-blue-100 text-blue-600",
    },
    {
      icon: Library,
      title: "Global Standards Library",
      description:
        "Build your organization's compliance foundation once, use everywhere. Create reusable standards categories and tech stack templates that automatically link to all your projects.",
      color: "bg-violet-100 text-violet-600",
    },
    {
      icon: Layout,
      title: "Visual Architecture Design",
      description:
        "Design complex architectures with an interactive canvas. Drag-and-drop nodes for pages, APIs, databases, and security layers. Real-time sync keeps your whole team aligned.",
      color: "bg-emerald-100 text-emerald-600",
    },
    {
      icon: Bot,
      title: "Multi-Agent AI Teams",
      description:
        "Orchestrate teams of AI agents—Architects, Developers, DBAs, Security, QA—that iteratively refine your architecture. Watch agents collaborate on a shared blackboard until designs stabilize.",
      color: "bg-rose-100 text-rose-600",
    },
    {
      icon: Code,
      title: "AI Coding Agent",
      description:
        "An autonomous coding agent that reads your requirements, searches your codebase, and makes changes—all with full audit trail. Stage changes, review diffs, and push to GitHub when ready.",
      color: "bg-amber-100 text-amber-600",
    },
    {
      icon: Users,
      title: "Instant Collaboration",
      description:
        "Share any project with a link—no login required. Real-time sync means everyone sees changes instantly. Start anonymous, claim your projects when ready.",
      color: "bg-cyan-100 text-cyan-600",
    },
  ];

  const benefits = [
    "Complete traceability from standards to code",
    "AI teams that iterate until architecture stabilizes",
    "No account required to start—instant collaboration",
    "Built-in code editor with GitHub sync",
    "Multi-model AI support (Gemini, Claude, Grok)",
    "13+ specification templates for any audience",
  ];

  return (
    <div className="min-h-screen bg-[hsl(38,60%,97%)] text-[hsl(240,30%,15%)] antialiased overflow-x-hidden">
      {/* Navbar */}
      <nav className="fixed w-full top-0 z-50 bg-[hsl(38,60%,97%)]/90 backdrop-blur-md border-b border-[hsl(30,20%,88%)]/50 transition-all duration-300">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <PronghornLogo className="h-8 w-8 rounded-lg" />
            <span className="text-xl font-semibold tracking-tight">
              Pronghorn{" "}
              <Link to="/terms" className="text-[hsl(350,80%,60%)] hover:underline">(Alpha)</Link>
            </span>
          </div>

          <Button
            onClick={() => navigate("/dashboard")}
            className="bg-[hsl(240,30%,15%)] text-white px-5 py-2.5 rounded-lg font-medium text-sm hover:bg-[hsl(240,30%,20%)] hover:scale-105 active:scale-95 transition-all shadow-lg shadow-[hsl(240,30%,15%)]/20"
          >
            Get Started
          </Button>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative pt-32 pb-20 lg:pt-32 lg:pb-32 px-6 overflow-hidden">
        {/* Background decorations */}
        <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none z-0">
          <svg
            className="absolute top-20 left-10 w-[800px] h-[800px] opacity-20 text-muted-foreground/30"
            viewBox="0 0 100 100"
          >
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
                <svg
                  className="absolute w-full h-3 -bottom-1 left-0 text-rose-200 -z-10"
                  viewBox="0 0 100 10"
                  preserveAspectRatio="none"
                >
                  <path d="M0,5 Q50,10 100,5" stroke="currentColor" strokeWidth="8" fill="none" />
                </svg>
              </span>{" "}
              Precision
            </h1>
            <p className="text-lg md:text-xl text-muted-foreground max-w-lg leading-relaxed mx-auto lg:mx-0">
              Transform requirements into production code with AI agents that understand your standards, design your
              architecture, and write compliant code—all with complete traceability.
            </p>
            <div className="flex justify-center lg:justify-start">
              <Button
                size="lg"
                onClick={() => navigate("/dashboard")}
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
            <h2 className="text-4xl font-medium tracking-tight mb-4 text-[hsl(240,30%,15%)]">
              Everything You Need to Build Better Software
            </h2>
            <p className="text-xl text-gray-600 max-w-3xl mx-auto">
              From requirements to production code, Pronghorn provides the complete toolkit for standards-driven
              development with AI assistance at every step.
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

      {/* 10-Step Journey Section */}
      <section className="py-24 px-6">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-medium tracking-tight mb-4 text-[hsl(240,30%,15%)]">
              Your 10-Step Journey
            </h2>
            <p className="text-xl text-gray-600 max-w-3xl mx-auto">
              From initial idea to deployed application—a complete workflow powered by AI at every step
            </p>
          </div>

          {/* Phase Headers */}
          <div className="grid grid-cols-3 gap-4 mb-8 max-w-4xl mx-auto">
            <div className="text-center">
              <div className="inline-flex items-center gap-2 px-4 py-2 bg-blue-100 text-blue-700 rounded-full text-sm font-medium">
                <Settings className="w-4 h-4" />
                Setup
              </div>
            </div>
            <div className="text-center">
              <div className="inline-flex items-center gap-2 px-4 py-2 bg-rose-100 text-rose-700 rounded-full text-sm font-medium">
                <Sparkles className="w-4 h-4" />
                Design
              </div>
            </div>
            <div className="text-center">
              <div className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-100 text-emerald-700 rounded-full text-sm font-medium">
                <Rocket className="w-4 h-4" />
                Ship
              </div>
            </div>
          </div>

          {/* Steps Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 lg:grid-cols-10 gap-3">
            {workflowSteps.map((step, index) => {
              const phaseColors = {
                setup: "border-blue-200 hover:border-blue-400 hover:bg-blue-50/50",
                design: "border-rose-200 hover:border-rose-400 hover:bg-rose-50/50",
                ship: "border-emerald-200 hover:border-emerald-400 hover:bg-emerald-50/50",
              };
              const iconColors = {
                setup: "text-blue-600 bg-blue-100",
                design: "text-rose-600 bg-rose-100",
                ship: "text-emerald-600 bg-emerald-100",
              };
              return (
                <div
                  key={index}
                  onClick={() => setSelectedStep(step)}
                  className={`relative bg-white rounded-xl p-4 border-2 transition-all duration-300 hover:-translate-y-1 hover:shadow-lg cursor-pointer min-w-0 ${phaseColors[step.phase as keyof typeof phaseColors]} ${step.featured ? "ring-2 ring-offset-2 ring-[hsl(350,80%,60%)]" : ""}`}
                >
                  {/* Step Number */}
                  <div className="absolute -top-2 -left-2 w-6 h-6 bg-[hsl(240,30%,15%)] text-white text-xs font-bold rounded-full flex items-center justify-center">
                    {index + 1}
                  </div>
                  
                  {/* AI Badge */}
                  {step.hasAgent && (
                    <div className="absolute -top-2 -right-2 w-6 h-6 bg-gradient-to-br from-amber-400 to-orange-500 text-white rounded-full flex items-center justify-center">
                      <Bot className="w-3 h-3" />
                    </div>
                  )}

                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center mb-3 ${iconColors[step.phase as keyof typeof iconColors]}`}>
                    <step.icon className="w-5 h-5" />
                  </div>
                  <h4 className="font-medium text-sm text-[hsl(240,30%,15%)] mb-1 truncate">{step.label}</h4>
                  <p className="text-xs text-gray-500 leading-tight hidden lg:block line-clamp-2">{step.description}</p>
                </div>
              );
            })}
          </div>

          {/* Step Details Dialog */}
          <Dialog open={!!selectedStep} onOpenChange={(open) => !open && setSelectedStep(null)}>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-3">
                  {selectedStep && (
                    <>
                      <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                        selectedStep.phase === "setup" ? "bg-blue-100 text-blue-600" :
                        selectedStep.phase === "design" ? "bg-rose-100 text-rose-600" :
                        "bg-emerald-100 text-emerald-600"
                      }`}>
                        <selectedStep.icon className="w-5 h-5" />
                      </div>
                      <div>
                        <span className="text-lg">{selectedStep.label}</span>
                        <div className="flex items-center gap-2 mt-1">
                          <span className={`text-xs px-2 py-0.5 rounded-full ${
                            selectedStep.phase === "setup" ? "bg-blue-100 text-blue-700" :
                            selectedStep.phase === "design" ? "bg-rose-100 text-rose-700" :
                            "bg-emerald-100 text-emerald-700"
                          }`}>
                            {selectedStep.phase.charAt(0).toUpperCase() + selectedStep.phase.slice(1)} Phase
                          </span>
                          {selectedStep.hasAgent && (
                            <span className="text-xs px-2 py-0.5 rounded-full bg-gradient-to-r from-amber-100 to-orange-100 text-amber-700 flex items-center gap-1">
                              <Bot className="w-3 h-3" />
                              AI-Powered
                            </span>
                          )}
                        </div>
                      </div>
                    </>
                  )}
                </DialogTitle>
              </DialogHeader>
              {selectedStep?.aiDetails && (
                <div className="mt-4">
                  <h4 className="font-medium text-sm text-muted-foreground mb-3">
                    {selectedStep.aiDetails.title}
                  </h4>
                  <ul className="space-y-2">
                    {selectedStep.aiDetails.capabilities.map((capability, idx) => (
                      <li key={idx} className="flex items-start gap-2 text-sm">
                        <Check className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" />
                        <span>{capability}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </DialogContent>
          </Dialog>

          {/* Legend */}
          <div className="flex justify-center gap-8 mt-8 text-sm text-gray-600">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 bg-gradient-to-br from-amber-400 to-orange-500 rounded-full flex items-center justify-center">
                <Bot className="w-3 h-3 text-white" />
              </div>
              <span>AI-Powered Step</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 ring-2 ring-[hsl(350,80%,60%)] ring-offset-2 rounded-lg"></div>
              <span>Featured</span>
            </div>
          </div>
        </div>
      </section>

      {/* Meet the AI Teams Section */}
      <section className="py-24 px-6 bg-gradient-to-b from-white to-gray-50">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-medium tracking-tight mb-4 text-[hsl(240,30%,15%)]">
              Meet the AI Teams
            </h2>
            <p className="text-xl text-gray-600 max-w-3xl mx-auto">
              Specialized agents that collaborate, iterate, and refine your architecture until it stabilizes
            </p>
          </div>

          <div className="grid lg:grid-cols-3 gap-8">
            {/* Canvas Orchestration Agents */}
            <Card className="bg-white p-8 rounded-2xl border border-border hover:shadow-xl transition-all duration-300">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl flex items-center justify-center">
                  <Layout className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h3 className="text-xl font-medium text-[hsl(240,30%,15%)]">Architecture Team</h3>
                  <p className="text-sm text-gray-500">10 specialized canvas agents</p>
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-2 mb-6">
                {canvasAgents.map((agent, i) => (
                  <div
                    key={i}
                    className={`flex items-center gap-2 p-2 rounded-lg bg-gray-50 ${agent.featured ? "ring-1 ring-red-300 bg-red-50" : ""}`}
                  >
                    <div className={`w-2 h-2 rounded-full ${agent.color}`}></div>
                    <span className={`text-xs font-medium ${agent.featured ? "text-red-700" : "text-gray-700"}`}>
                      {agent.name}
                    </span>
                  </div>
                ))}
              </div>
              
              <p className="text-sm text-gray-600">
                Agents iterate on a shared <span className="font-medium text-[hsl(240,30%,15%)]">blackboard</span> until your architecture stabilizes—each bringing their expertise to refine the design.
              </p>
            </Card>

            {/* Coding Agent */}
            <Card className="bg-white p-8 rounded-2xl border border-border hover:shadow-xl transition-all duration-300">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-12 h-12 bg-gradient-to-br from-amber-500 to-orange-600 rounded-xl flex items-center justify-center">
                  <Code className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h3 className="text-xl font-medium text-[hsl(240,30%,15%)]">Autonomous Coder</h3>
                  <p className="text-sm text-gray-500">AI that writes code with audit trail</p>
                </div>
              </div>
              
              <ul className="space-y-3 mb-6">
                {[
                  "Reads requirements & searches codebase",
                  "Creates, edits, renames, deletes files",
                  "Stages changes with diff review",
                  "Commits and pushes to GitHub",
                ].map((capability, i) => (
                  <li key={i} className="flex items-center gap-3">
                    <div className="w-5 h-5 bg-amber-100 rounded-full flex items-center justify-center flex-shrink-0">
                      <Check className="w-3 h-3 text-amber-600" />
                    </div>
                    <span className="text-sm text-gray-700">{capability}</span>
                  </li>
                ))}
              </ul>
              
              <div className="bg-gray-900 rounded-lg p-4 font-mono text-xs text-green-400">
                <div className="opacity-60">// Agent executing...</div>
                <div>staged: <span className="text-amber-400">3 files</span></div>
                <div>commit: <span className="text-cyan-400">"Add user auth"</span></div>
              </div>
            </Card>

            {/* Specification Agents */}
            <Card className="bg-white p-8 rounded-2xl border border-border hover:shadow-xl transition-all duration-300">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-12 h-12 bg-gradient-to-br from-violet-500 to-purple-600 rounded-xl flex items-center justify-center">
                  <FileText className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h3 className="text-xl font-medium text-[hsl(240,30%,15%)]">Document Generators</h3>
                  <p className="text-sm text-gray-500">13+ specification templates</p>
                </div>
              </div>
              
              <div className="space-y-3 mb-6">
                <div>
                  <div className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Business</div>
                  <div className="flex flex-wrap gap-1">
                    {["Overview", "Executive Summary", "Procurement"].map((t) => (
                      <span key={t} className="px-2 py-1 bg-blue-50 text-blue-700 text-xs rounded-full">{t}</span>
                    ))}
                  </div>
                </div>
                <div>
                  <div className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Technical</div>
                  <div className="flex flex-wrap gap-1">
                    {["Tech Spec", "Solution Arch", "Agent Instructions"].map((t) => (
                      <span key={t} className="px-2 py-1 bg-emerald-50 text-emerald-700 text-xs rounded-full">{t}</span>
                    ))}
                  </div>
                </div>
                <div>
                  <div className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Cloud & Security</div>
                  <div className="flex flex-wrap gap-1">
                    {["AWS", "Azure", "GCP", "Cyber Specialist"].map((t) => (
                      <span key={t} className={`px-2 py-1 text-xs rounded-full ${t === "Cyber Specialist" ? "bg-red-50 text-red-700 font-medium" : "bg-violet-50 text-violet-700"}`}>{t}</span>
                    ))}
                  </div>
                </div>
              </div>
            </Card>
          </div>
        </div>
      </section>

      {/* Open Source & Evolving Section */}
      <section className="py-16 px-6">
        <div className="max-w-5xl mx-auto">
          <div className="bg-gradient-to-br from-[hsl(240,30%,15%)] to-[hsl(240,30%,20%)] rounded-3xl p-10 md:p-16 relative overflow-hidden">
            {/* Background decorations */}
            <div className="absolute top-0 right-0 w-64 h-64 bg-[hsl(350,80%,60%)]/20 rounded-full blur-3xl" />
            <div className="absolute bottom-0 left-0 w-48 h-48 bg-emerald-500/20 rounded-full blur-3xl" />
            
            <div className="relative z-10">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-12 h-12 bg-white/10 rounded-xl flex items-center justify-center">
                  <Github className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h2 className="text-2xl md:text-3xl font-medium text-white">Open Source & Community-Driven</h2>
                </div>
              </div>
              
              <p className="text-white/80 text-lg leading-relaxed mb-8 max-w-3xl">
                All AI agents are <span className="text-white font-medium">open source under MIT License</span> and continuously evolving based on community feedback. Agent configurations are stored as JSON files, making them easy to customize, extend, or contribute to.
              </p>
              
              {/* Cyber Security Highlight */}
              <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-6 mb-8 border border-white/10">
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 bg-red-500/20 rounded-xl flex items-center justify-center flex-shrink-0">
                    <Shield className="w-6 h-6 text-red-400" />
                  </div>
                  <div>
                    <h3 className="text-lg font-medium text-white mb-2">Evolving Cyber Security Agents</h3>
                    <p className="text-white/70 text-sm leading-relaxed">
                      Our Cyber Security agents are actively evolving to address emerging threats, compliance frameworks (SOC2, ISO 27001, NIST), and security best practices. Built to be extensible—add your organization's specific security requirements.
                    </p>
                  </div>
                </div>
              </div>
              
              {/* Key Points */}
              <div className="grid md:grid-cols-3 gap-6 mb-8">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-white/10 rounded-lg flex items-center justify-center">
                    <Zap className="w-5 h-5 text-amber-400" />
                  </div>
                  <div>
                    <div className="text-white font-medium">JSON Configs</div>
                    <div className="text-white/60 text-sm">Easy to customize</div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-white/10 rounded-lg flex items-center justify-center">
                    <Heart className="w-5 h-5 text-rose-400" />
                  </div>
                  <div>
                    <div className="text-white font-medium">Community-Driven</div>
                    <div className="text-white/60 text-sm">Shaped by feedback</div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-white/10 rounded-lg flex items-center justify-center">
                    <CheckCircle className="w-5 h-5 text-emerald-400" />
                  </div>
                  <div>
                    <div className="text-white font-medium">MIT License</div>
                    <div className="text-white/60 text-sm">Use anywhere</div>
                  </div>
                </div>
              </div>
              
              <div className="flex flex-wrap gap-4">
                <Button
                  variant="outline"
                  className="bg-white/10 border-white/20 text-white hover:bg-white/20"
                  onClick={() => window.open("https://github.com", "_blank")}
                >
                  <Github className="w-4 h-4 mr-2" />
                  View on GitHub
                </Button>
                <Button
                  variant="outline"
                  className="bg-white/10 border-white/20 text-white hover:bg-white/20"
                  onClick={() => window.location.href = "mailto:ti.deputyminister@gov.ab.ca?subject=Agent Suggestion for Pronghorn"}
                >
                  <Heart className="w-4 h-4 mr-2" />
                  Suggest an Agent
                </Button>
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
              Built for teams who refuse to compromise on quality. Every feature designed to maintain traceability from
              concept to deployment.
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
              <h2 className="text-3xl md:text-4xl lg:text-5xl font-medium tracking-tight mb-6 text-[hsl(240,30%,15%)]">
                Ready to Build with AI Precision?
              </h2>
              <p className="text-lg md:text-xl text-gray-600 mb-8 md:mb-10 max-w-2xl mx-auto">
                Join teams who are shipping better software, faster, with complete traceability from requirements to
                code.
              </p>
              <Button
                size="lg"
                onClick={() => navigate("/dashboard")}
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
          <div className="flex flex-col md:flex-row items-center gap-4 md:gap-8">
            <div className="flex gap-6 text-sm">
              <Link to="/terms" className="text-gray-600 hover:text-[hsl(350,80%,60%)] transition-colors">
                Terms of Use
              </Link>
              <Link to="/privacy" className="text-gray-600 hover:text-[hsl(350,80%,60%)] transition-colors">
                Privacy Policy
              </Link>
              <Link to="/license" className="text-gray-600 hover:text-[hsl(350,80%,60%)] transition-colors">
                License
              </Link>
            </div>
            <div className="text-sm text-gray-500 text-center md:text-right">
              <p>© 2025 Pronghorn. <Link to="/license" className="text-[hsl(350,80%,60%)] hover:underline">MIT License</Link> Open Source by the Government of Alberta.</p>
              <a
                href="https://pronghorn.red"
                target="_blank"
                rel="noopener noreferrer"
                className="text-[hsl(350,80%,60%)] hover:underline"
              >
                pronghorn.red
              </a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
