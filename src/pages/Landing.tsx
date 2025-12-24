import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PronghornLogo } from "@/components/layout/PronghornLogo";
import { ThemeToggle } from "@/components/ThemeToggle";
import { useNavigate, Link } from "react-router-dom";
import { FileText, Library, Layout, Bot, Code, Users, ArrowRight, Check, ShieldCheck, GitBranch, CheckCircle, Rocket, Shield, Award, Settings, Archive, MessageSquare, ListTree, Hammer, Sparkles, Github, Heart, Zap, X, ChevronLeft, ChevronRight, Database, BookOpen, Download, Layers, Cpu } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export default function Landing() {
  const navigate = useNavigate();
  const [selectedStepIndex, setSelectedStepIndex] = useState<number | null>(null);
  
  const workflowSteps = [{
    icon: Settings,
    label: "Settings",
    description: "Configure project, link standards & tech stacks",
    phase: "plan",
    hasAgent: true,
    aiDetails: {
      title: "AI Model Configuration",
      capabilities: ["Select from Gemini, Claude, or Grok AI models", "Configure max tokens and response length limits", "Enable thinking mode for complex reasoning tasks", "Set model preferences per project for optimal results"]
    }
  }, {
    icon: Archive,
    label: "Artifacts",
    description: "Upload documents, images, reference files",
    phase: "plan",
    hasAgent: true,
    aiDetails: {
      title: "AI-Powered Document Processing",
      capabilities: ["Automatic summarization of uploaded documents", "Smart indexing and content extraction", "Parse PDFs, DOCX, Excel files into structured data", "Generate AI titles and descriptions for quick reference"]
    }
  }, {
    icon: Users,
    label: "Collaboration",
    description: "AI-assisted document co-authoring with version control",
    phase: "plan",
    hasAgent: true,
    aiDetails: {
      title: "AI Collaboration Agent",
      capabilities: ["Real-time AI co-authoring of project artifacts", "Line-by-line diff tracking with full version history", "Shared blackboard for human-AI collaboration context", "Merge changes back to source artifacts when ready"]
    }
  }, {
    icon: MessageSquare,
    label: "Chat",
    description: "AI-powered conversations about your project",
    phase: "plan",
    hasAgent: true,
    aiDetails: {
      title: "Project-Aware AI Conversations",
      capabilities: ["AI agents with full project context awareness", "Can read requirements, standards, canvas, and files", "Multi-model support (Gemini, Claude, Grok)", "Attach any project element as conversation context"]
    }
  }, {
    icon: ListTree,
    label: "Requirements",
    description: "AI decomposes ideas into Epics → Stories",
    phase: "design",
    hasAgent: true,
    aiDetails: {
      title: "AI Requirements Decomposition",
      capabilities: ["Transform unstructured text into structured requirements", "Generate Epics → Features → User Stories → Acceptance Criteria", "Automatic deduplication against existing requirements", "Support for edit/create actions on existing items"]
    }
  }, {
    icon: ShieldCheck,
    label: "Standards",
    description: "Link organizational compliance standards",
    phase: "design",
    hasAgent: true,
    aiDetails: {
      title: "AI Standards Expansion",
      capabilities: ["Expand source documents into structured standards", "Auto-link standards to project requirements", "Intelligent categorization and hierarchy building", "Generate compliance criteria from policy documents"]
    }
  }, {
    icon: Layout,
    label: "Canvas",
    description: "Visual architecture with 10+ AI agents",
    phase: "design",
    hasAgent: true,
    aiDetails: {
      title: "AI Architecture Team (10 Agents)",
      capabilities: ["Architect, Developer, DBA agents for core design", "QA, UAT, Compliance agents for quality assurance", "Cyber Security agent for threat analysis", "Agents iterate on shared blackboard until design stabilizes"]
    }
  }, {
    icon: FileText,
    label: "Specifications",
    description: "Generate 13+ document types",
    phase: "design",
    hasAgent: true,
    aiDetails: {
      title: "AI Document Generation",
      capabilities: ["13+ specification templates for any audience", "Technical specs, executive summaries, procurement docs", "Cloud architecture guides (AWS, Azure, GCP)", "Security review and compliance documentation"]
    }
  }, {
    icon: GitBranch,
    label: "Repository",
    description: "GitHub-synced code repository",
    phase: "ship",
    aiDetails: {
      title: "GitHub Integration",
      capabilities: ["Bi-directional sync with GitHub repositories", "Branch management and commit history", "File browser with Monaco code editor", "Personal Access Token support for private repos"]
    }
  }, {
    icon: Hammer,
    label: "Build",
    description: "Autonomous AI coding agent",
    phase: "ship",
    hasAgent: true,
    aiDetails: {
      title: "Autonomous Coding Agent",
      capabilities: ["Read files, search codebase, understand project structure", "Create, edit, rename, delete files with full audit trail", "Stage changes with diff review before committing", "Iterative orchestration with configurable max iterations"]
    }
  }, {
    icon: Database,
    label: "Database",
    description: "Manage, explore & import data",
    phase: "ship",
    hasAgent: true,
    aiDetails: {
      title: "AI-Powered Database Management",
      capabilities: ["Provision PostgreSQL databases with one click", "Connect to external PostgreSQL instances", "Import Excel, CSV, JSON with AI schema inference", "SQL query editor with Monaco and saved queries"]
    }
  }, {
    icon: Rocket,
    label: "Deploy",
    description: "Push to cloud or local environments",
    phase: "ship",
    aiDetails: {
      title: "Deployment Options",
      capabilities: ["Deploy to Render.com cloud hosting", "Local development runner with hot reload", "Environment-based deployments (dev/uat/prod)", "Bug telemetry integration for automated fixes"]
    }
  }];
  
  const canvasAgents = [{
    name: "Architect",
    color: "bg-blue-500",
    description: "System architecture"
  }, {
    name: "Developer",
    color: "bg-orange-500",
    description: "Components & APIs"
  }, {
    name: "DBA",
    color: "bg-indigo-500",
    description: "Database schemas"
  }, {
    name: "Cloud Ops",
    color: "bg-teal-500",
    description: "Infrastructure"
  }, {
    name: "QA",
    color: "bg-green-500",
    description: "Testing & quality"
  }, {
    name: "UAT",
    color: "bg-yellow-500",
    description: "User validation"
  }, {
    name: "Compliance",
    color: "bg-purple-500",
    description: "Standards adherence"
  }, {
    name: "Cyber Security",
    color: "bg-red-500",
    description: "Security analysis",
    featured: true
  }, {
    name: "Integrator",
    color: "bg-pink-500",
    description: "System connections"
  }, {
    name: "Simplifier",
    color: "bg-gray-500",
    description: "Reduces complexity"
  }];
  
  const features = [{
    icon: FileText,
    title: "AI-Powered Requirements",
    description: "Transform unstructured ideas into structured Epics, Features, and Stories. AI decomposes and expands requirements while linking them to organizational standards for complete traceability.",
    color: "public-chip-blue"
  }, {
    icon: Library,
    title: "Global Standards Library",
    description: "Build your organization's compliance foundation once, use everywhere. Create reusable standards categories and tech stack templates that automatically link to all your projects.",
    color: "public-chip-violet"
  }, {
    icon: Layout,
    title: "Visual Architecture Design",
    description: "Design complex architectures with an interactive canvas. Drag-and-drop nodes for pages, APIs, databases, and security layers. Real-time sync keeps your whole team aligned.",
    color: "public-chip-emerald"
  }, {
    icon: Bot,
    title: "Multi-Agent AI Teams",
    description: "Orchestrate teams of AI agents—Architects, Developers, DBAs, Security, QA—that iteratively refine your architecture. Watch agents collaborate on a shared blackboard until designs stabilize.",
    color: "public-chip-rose"
  }, {
    icon: Code,
    title: "AI Coding Agent",
    description: "An autonomous coding agent that reads your requirements, searches your codebase, and makes changes—all with full audit trail. Stage changes, review diffs, and push to GitHub when ready.",
    color: "public-chip-amber"
  }, {
    icon: Users,
    title: "Instant Collaboration",
    description: "Share any project with a link—no login required. Real-time sync means everyone sees changes instantly. Start anonymous, claim your projects when ready.",
    color: "public-chip-cyan"
  }, {
    icon: Database,
    title: "Database Explorer & Import",
    description: "Provision or connect PostgreSQL databases, browse schemas, execute SQL queries, and import data from Excel, CSV, or JSON with AI-powered schema inference.",
    color: "public-chip-indigo"
  }];
  
  const benefits = ["Complete traceability from standards to code", "AI teams that iterate until architecture stabilizes", "No account required to start—instant collaboration", "Built-in code editor with GitHub sync", "Multi-model AI support (Gemini, Claude, Grok)", "13+ specification templates for any audience", "Database provisioning with AI-powered data import"];
  
  return (
    <div className="public-page overflow-x-hidden">
      {/* Skip Navigation Link */}
      <a 
        href="#main-content" 
        className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-[100] focus:px-4 focus:py-2 public-btn-primary focus:rounded-lg focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[var(--public-brand)]"
      >
        Skip to main content
      </a>

      {/* Header with Navigation */}
      <header>
        <nav role="navigation" aria-label="Main navigation" className="fixed w-full top-0 z-50 public-nav transition-all duration-300">
          <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <PronghornLogo className="h-8 w-8 rounded-lg" />
              <span className="text-xl font-semibold tracking-tight public-heading">
                Pronghorn{" "}
                <Link to="/terms" className="public-brand underline decoration-1 underline-offset-2 hover:no-underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--public-brand)]">(Alpha)</Link>
              </span>
            </div>

            <div className="flex items-center gap-3">
              <ThemeToggle />
              <Button onClick={() => navigate("/auth")} className="public-btn-primary px-5 py-2.5 rounded-lg font-medium text-sm hover:scale-105 active:scale-95 transition-all shadow-lg">
                Login
              </Button>
            </div>
          </div>
        </nav>
      </header>

      {/* Main Content */}
      <main role="main" id="main-content">

      {/* Hero Section */}
      <section className="relative pt-32 pb-20 lg:pt-32 lg:pb-32 px-6 overflow-hidden">
        {/* Background decorations */}
        <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none z-0">
          <svg className="absolute top-20 left-10 w-[800px] h-[800px] opacity-20 public-text-subtle" viewBox="0 0 100 100">
            <path d="M0,50 Q25,25 50,50 T100,50" fill="none" stroke="currentColor" strokeWidth="0.5" />
            <path d="M0,60 Q25,35 50,60 T100,60" fill="none" stroke="currentColor" strokeWidth="0.5" />
          </svg>
          <div className="absolute right-0 top-0 w-1/2 h-full bg-gradient-to-l from-rose-100/30 dark:from-rose-900/20 to-transparent blur-3xl" />
        </div>

        <div className="max-w-7xl mx-auto grid lg:grid-cols-2 gap-8 lg:gap-16 items-center relative z-10">
          <div className="space-y-8 text-center lg:text-left">
            <div className="flex justify-center lg:justify-start">
              <Link to="/terms" className="text-sm font-medium public-brand underline decoration-1 underline-offset-2 hover:no-underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--public-brand)]">
                Currently Alpha Testing
              </Link>
            </div>
            <h1 className="text-4xl md:text-5xl lg:text-6xl font-medium tracking-tight leading-[1.1] public-heading">
              Build Software with <br />
              <span className="public-brand relative inline-block">
                AI-Powered
                <svg className="absolute w-full h-3 -bottom-1 left-0 text-rose-200 dark:text-rose-800 -z-10" viewBox="0 0 100 10" preserveAspectRatio="none">
                  <path d="M0,5 Q50,10 100,5" stroke="currentColor" strokeWidth="8" fill="none" />
                </svg>
              </span>{" "}
              Precision
            </h1>
            <p className="text-lg md:text-xl public-text-muted max-w-lg leading-relaxed mx-auto lg:mx-0">
              Transform requirements into production code with AI agents that understand your standards, design your
              architecture, and write compliant code—all with complete traceability.
            </p>
            <div className="flex justify-center lg:justify-start">
              <Button size="lg" onClick={() => navigate("/dashboard")} className="group public-btn-primary px-8 py-4 rounded-xl font-medium text-lg hover:shadow-xl hover:-translate-y-1 transition-all duration-300 flex items-center gap-2">
                Start Building
                <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
              </Button>
            </div>
          </div>

          {/* Hero Floating Elements - Desktop only */}
          <div className="relative h-[500px] w-full hidden lg:flex items-center justify-center">
            <div className="relative w-full max-w-md aspect-square">
              {/* Glow background */}
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[120%] h-[120%] bg-rose-100/50 dark:bg-rose-900/30 rounded-full blur-3xl" />

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
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-80 public-card rounded-2xl shadow-2xl border-rose-100 dark:border-rose-900/50 overflow-hidden transform hover:scale-105 transition-transform duration-500">
                <div className="w-full bg-gradient-to-br from-rose-50 dark:from-rose-900/20 to-[var(--public-card)] p-6 flex flex-col gap-4">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full bg-red-400" />
                    <div className="w-3 h-3 rounded-full bg-yellow-400" />
                    <div className="w-3 h-3 rounded-full bg-green-400" />
                  </div>
                  <div className="space-y-3">
                    <div className="flex items-center gap-3 p-3 public-chip-emerald rounded-lg">
                      <div className="w-2 h-2 rounded-full bg-emerald-400" />
                      <span className="text-sm font-medium">Requirements validated</span>
                    </div>
                    <div className="flex items-center gap-3 p-3 public-chip-blue rounded-lg">
                      <div className="w-2 h-2 rounded-full bg-blue-400" />
                      <span className="text-sm font-medium">Architecture designed</span>
                    </div>
                    <div className="flex items-center gap-3 p-3 public-chip-violet rounded-lg">
                      <div className="w-2 h-2 rounded-full bg-violet-400" />
                      <span className="text-sm font-medium">Standards linked</span>
                    </div>
                    <div className="flex items-center gap-3 p-3 public-chip-rose rounded-lg border border-rose-200 dark:border-rose-700">
                      <div className="w-2 h-2 rounded-full bg-[hsl(350,80%,55%)] animate-pulse" />
                      <span className="text-sm font-medium">AI agents building...</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-24 px-6 public-bg-secondary-50">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-medium tracking-tight mb-4 public-heading">
              Everything You Need to Build Better Software
            </h2>
            <p className="text-xl public-text-muted max-w-3xl mx-auto">
              From requirements to production code, Pronghorn provides the complete toolkit for standards-driven
              development with AI assistance at every step.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map((feature, index) => (
              <Card key={index} className="public-card p-8 rounded-2xl hover:shadow-xl hover:-translate-y-2 transition-all duration-300">
                <div className={`w-12 h-12 ${feature.color} rounded-xl flex items-center justify-center mb-6`}>
                  <feature.icon className="w-6 h-6" />
                </div>
                <h3 className="text-xl font-medium mb-3 public-heading">{feature.title}</h3>
                <p className="public-text-muted">{feature.description}</p>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* 10-Step Journey Section */}
      <section className="py-24 px-6">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-medium tracking-tight mb-4 public-heading">Your 12-Step Journey</h2>
            <p className="text-xl public-text-muted max-w-3xl mx-auto">
              From initial idea to deployed application—a complete workflow powered by AI at every step
            </p>
          </div>

          {/* Phase Headers */}
          <div className="flex justify-center gap-4 mb-8">
            <div className="inline-flex items-center gap-2 px-4 py-2 public-chip-blue rounded-full text-sm font-medium">
              <Settings className="w-4 h-4" />
              Plan
            </div>
            <div className="inline-flex items-center gap-2 px-4 py-2 public-chip-rose rounded-full text-sm font-medium">
              <Sparkles className="w-4 h-4" />
              Design
            </div>
            <div className="inline-flex items-center gap-2 px-4 py-2 public-chip-emerald rounded-full text-sm font-medium">
              <Rocket className="w-4 h-4" />
              Build
            </div>
          </div>

          {/* Steps Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4 max-w-5xl mx-auto">
            {workflowSteps.map((step, index) => {
              const phaseColors = {
                plan: "border-blue-200 dark:border-blue-800 hover:border-blue-400 dark:hover:border-blue-600 hover:bg-blue-50/50 dark:hover:bg-blue-900/20",
                design: "border-rose-200 dark:border-rose-800 hover:border-rose-400 dark:hover:border-rose-600 hover:bg-rose-50/50 dark:hover:bg-rose-900/20",
                ship: "border-emerald-200 dark:border-emerald-800 hover:border-emerald-400 dark:hover:border-emerald-600 hover:bg-emerald-50/50 dark:hover:bg-emerald-900/20"
              };
              const iconColors = {
                plan: "public-chip-blue",
                design: "public-chip-rose",
                ship: "public-chip-emerald"
              };
              return (
                <div 
                  key={index} 
                  onClick={() => setSelectedStepIndex(index)} 
                  className={`relative public-card rounded-xl p-4 border-2 transition-all duration-300 hover:-translate-y-1 hover:shadow-lg cursor-pointer min-w-0 ${phaseColors[step.phase as keyof typeof phaseColors]}`}
                >
                  {/* Step Number */}
                  <div className="absolute -top-2 -left-2 w-6 h-6 public-btn-primary text-xs font-bold rounded-full flex items-center justify-center">
                    {index + 1}
                  </div>

                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center mb-3 ${iconColors[step.phase as keyof typeof iconColors]}`}>
                    <step.icon className="w-5 h-5" />
                  </div>
                  <h3 className="font-medium text-sm public-heading mb-1 truncate">{step.label}</h3>
                  <p className="text-xs public-text-subtle leading-tight hidden lg:block line-clamp-2">{step.description}</p>
                </div>
              );
            })}
          </div>

          {/* Step Details Dialog */}
          <Dialog open={selectedStepIndex !== null} onOpenChange={open => !open && setSelectedStepIndex(null)}>
            <DialogContent className="sm:max-w-md" onKeyDown={e => {
              if (selectedStepIndex === null) return;
              if (e.key === "ArrowLeft") {
                e.preventDefault();
                setSelectedStepIndex(selectedStepIndex > 0 ? selectedStepIndex - 1 : workflowSteps.length - 1);
              } else if (e.key === "ArrowRight") {
                e.preventDefault();
                setSelectedStepIndex(selectedStepIndex < workflowSteps.length - 1 ? selectedStepIndex + 1 : 0);
              }
            }}>
              {selectedStepIndex !== null && (() => {
                const selectedStep = workflowSteps[selectedStepIndex];
                return (
                  <>
                    <DialogHeader>
                      <DialogTitle className="flex items-center gap-3">
                        <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${selectedStep.phase === "plan" ? "public-chip-blue" : selectedStep.phase === "design" ? "public-chip-rose" : "public-chip-emerald"}`}>
                          <selectedStep.icon className="w-5 h-5" />
                        </div>
                        <div>
                          <span className="text-lg">{selectedStep.label}</span>
                          <div className="flex items-center gap-2 mt-1">
                            <span className={`text-xs px-2 py-0.5 rounded-full ${selectedStep.phase === "plan" ? "public-chip-blue" : selectedStep.phase === "design" ? "public-chip-rose" : "public-chip-emerald"}`}>
                              {selectedStep.phase.charAt(0).toUpperCase() + selectedStep.phase.slice(1)} Phase
                            </span>
                          </div>
                        </div>
                      </DialogTitle>
                    </DialogHeader>
                    {selectedStep.aiDetails && (
                      <div className="mt-4">
                        <p className="font-medium text-sm text-muted-foreground mb-3">
                          {selectedStep.aiDetails.title}
                        </p>
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
                    
                    {/* Navigation Arrows */}
                    <div className="flex items-center justify-between mt-6 pt-4 border-t">
                      <Button variant="outline" size="sm" onClick={() => setSelectedStepIndex(selectedStepIndex > 0 ? selectedStepIndex - 1 : workflowSteps.length - 1)} className="flex items-center gap-1">
                        <ChevronLeft className="w-4 h-4" />
                        Previous
                      </Button>
                      <span className="text-sm text-muted-foreground">
                        {selectedStepIndex + 1} / {workflowSteps.length}
                      </span>
                      <Button variant="outline" size="sm" onClick={() => setSelectedStepIndex(selectedStepIndex < workflowSteps.length - 1 ? selectedStepIndex + 1 : 0)} className="flex items-center gap-1">
                        Next
                        <ChevronRight className="w-4 h-4" />
                      </Button>
                    </div>
                  </>
                );
              })()}
            </DialogContent>
          </Dialog>

        </div>
      </section>

      {/* Meet the AI Teams Section */}
      <section className="py-24 px-6 public-section-gradient">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-medium tracking-tight mb-4 public-heading">
              Meet the AI Teams
            </h2>
            <p className="text-xl public-text-muted max-w-3xl mx-auto">
              Specialized agents that collaborate, iterate, and refine your architecture until it stabilizes
            </p>
          </div>

          <div className="grid lg:grid-cols-3 gap-8">
            {/* Canvas Orchestration Agents */}
            <Card className="public-card p-8 rounded-2xl hover:shadow-xl transition-all duration-300">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl flex items-center justify-center">
                  <Layout className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h3 className="text-xl font-medium public-heading">Architecture Team</h3>
                  <p className="text-sm public-text-subtle">10 specialized canvas agents</p>
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-2 mb-6">
                {canvasAgents.map((agent, i) => (
                  <div key={i} className={`flex items-center gap-2 p-2 rounded-lg ${agent.featured ? "ring-1 ring-red-300 dark:ring-red-700 public-chip-rose" : "public-bg-tertiary"}`}>
                    <div className={`w-2 h-2 rounded-full ${agent.color}`}></div>
                    <span className={`text-xs font-medium ${agent.featured ? "" : "public-text-muted"}`}>
                      {agent.name}
                    </span>
                  </div>
                ))}
              </div>
              
              <p className="text-sm public-text-muted">
                Agents iterate on a shared <span className="font-medium public-heading">blackboard</span> until your architecture stabilizes—each bringing their expertise to refine the design.
              </p>
            </Card>

            {/* Coding Agent */}
            <Card className="public-card p-8 rounded-2xl hover:shadow-xl transition-all duration-300">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-12 h-12 bg-gradient-to-br from-amber-500 to-orange-600 rounded-xl flex items-center justify-center">
                  <Code className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h3 className="text-xl font-medium public-heading">Autonomous Coder</h3>
                  <p className="text-sm public-text-subtle">AI that writes code with audit trail</p>
                </div>
              </div>
              
              <ul className="space-y-3 mb-6">
                {["Reads requirements & searches codebase", "Creates, edits, renames, deletes files", "Stages changes with diff review", "Commits and pushes to GitHub"].map((capability, i) => (
                  <li key={i} className="flex items-center gap-3">
                    <div className="w-5 h-5 public-chip-amber rounded-full flex items-center justify-center flex-shrink-0">
                      <Check className="w-3 h-3" />
                    </div>
                    <span className="text-sm public-text-muted">{capability}</span>
                  </li>
                ))}
              </ul>
              
              <div className="public-code rounded-lg p-4 font-mono text-xs">
                <div className="opacity-60">// Agent executing...</div>
                <div>staged: <span className="text-amber-400">3 files</span></div>
                <div>commit: <span className="text-cyan-400">"Add user auth"</span></div>
              </div>
            </Card>

            {/* Specification Agents */}
            <Card className="public-card p-8 rounded-2xl hover:shadow-xl transition-all duration-300">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-12 h-12 bg-gradient-to-br from-violet-500 to-purple-600 rounded-xl flex items-center justify-center">
                  <FileText className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h3 className="text-xl font-medium public-heading">Document Generators</h3>
                  <p className="text-sm public-text-subtle">13+ specification templates</p>
                </div>
              </div>
              
              <div className="space-y-3 mb-6">
                <div>
                  <div className="text-xs font-medium public-text-subtle uppercase tracking-wide mb-2">Business</div>
                  <div className="flex flex-wrap gap-1">
                    {["Overview", "Executive Summary", "Procurement"].map(t => (
                      <span key={t} className="px-2 py-1 public-chip-blue text-xs rounded-full">{t}</span>
                    ))}
                  </div>
                </div>
                <div>
                  <div className="text-xs font-medium public-text-subtle uppercase tracking-wide mb-2">Technical</div>
                  <div className="flex flex-wrap gap-1">
                    {["Tech Spec", "Solution Arch", "Agent Instructions"].map(t => (
                      <span key={t} className="px-2 py-1 public-chip-emerald text-xs rounded-full">{t}</span>
                    ))}
                  </div>
                </div>
                <div>
                  <div className="text-xs font-medium public-text-subtle uppercase tracking-wide mb-2">Cloud & Security</div>
                  <div className="flex flex-wrap gap-1">
                    {["AWS", "Azure", "GCP", "Cyber Specialist"].map(t => (
                      <span key={t} className={`px-2 py-1 text-xs rounded-full ${t === "Cyber Specialist" ? "public-chip-rose font-medium" : "public-chip-violet"}`}>{t}</span>
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
          <div className="public-gradient-dark rounded-3xl p-10 md:p-16 relative overflow-hidden">
            {/* Background decorations */}
            <div className="absolute top-0 right-0 w-64 h-64 bg-[hsl(350,80%,40%)]/20 rounded-full blur-3xl" />
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
              
            </div>
          </div>
        </div>
      </section>

      {/* Context Engineering Section */}
      <section className="py-24 px-6 public-section-gradient">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <div className="inline-flex items-center gap-2 px-4 py-2 public-chip-violet rounded-full text-sm font-medium mb-6">
              <Cpu className="w-4 h-4" />
              Powered by Context Engineering
            </div>
            <h2 className="text-4xl font-medium tracking-tight mb-4 public-heading">
              AI That Understands Your Whole Project
            </h2>
            <p className="text-xl public-text-muted max-w-3xl mx-auto">
              Pronghorn is built on <span className="font-semibold public-heading">Context Engineering</span>—the practice of curating rich, structured context that makes AI dramatically more effective. Every artifact, standard, and decision becomes context for better AI output.
            </p>
          </div>

          {/* Open Source Resources Grid */}
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 mb-12">
            {/* Tech Stacks */}
            <Card className="public-card p-6 rounded-2xl hover:shadow-xl transition-all duration-300 hover:-translate-y-1">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-12 h-12 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl flex items-center justify-center">
                  <Layers className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h3 className="text-lg font-medium public-heading">Tech Stacks</h3>
                  <p className="text-sm public-text-subtle">Open-source templates</p>
                </div>
              </div>
              <p className="text-sm public-text-muted mb-4">
                Curated technology stack templates covering frameworks, languages, databases, and infrastructure. Use them as-is or customize for your organization.
              </p>
              <Button variant="outline" size="sm" onClick={() => navigate("/tech-stacks")} className="w-full">
                Browse Tech Stacks
              </Button>
            </Card>

            {/* Standards */}
            <Card className="public-card p-6 rounded-2xl hover:shadow-xl transition-all duration-300 hover:-translate-y-1">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-12 h-12 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-xl flex items-center justify-center">
                  <ShieldCheck className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h3 className="text-lg font-medium public-heading">Standards</h3>
                  <p className="text-sm public-text-subtle">Compliance & best practices</p>
                </div>
              </div>
              <p className="text-sm public-text-muted mb-4">
                Organizational standards, compliance requirements, and best practices. Link standards to projects for automatic traceability and validation.
              </p>
              <Button variant="outline" size="sm" onClick={() => navigate("/standards")} className="w-full">
                Explore Standards
              </Button>
            </Card>

            {/* Build Books */}
            <Card className="public-card p-6 rounded-2xl hover:shadow-xl transition-all duration-300 hover:-translate-y-1 lg:col-span-1 md:col-span-2 lg:row-span-1">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-12 h-12 bg-gradient-to-br from-rose-500 to-orange-600 rounded-xl flex items-center justify-center">
                  <BookOpen className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h3 className="text-lg font-medium public-heading">Build Books</h3>
                  <p className="text-sm public-text-subtle">Complete project blueprints</p>
                </div>
              </div>
              <p className="text-sm public-text-muted mb-4">
                Comprehensive project templates bundling standards, tech stacks, resources, and documentation. Chat with AI about any Build Book, then download everything for local development.
              </p>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => navigate("/build-books")} className="flex-1">
                  View Build Books
                </Button>
              </div>
            </Card>
          </div>

          {/* Take Away Feature Highlight */}
          <div className="bg-gradient-to-br from-amber-50 dark:from-amber-900/20 to-orange-50 dark:to-orange-900/10 rounded-3xl p-8 md:p-10 border border-amber-200/50 dark:border-amber-800/30">
            <div className="grid md:grid-cols-2 gap-8 items-center">
              <div>
                <div className="flex items-center gap-2 mb-4">
                  <Download className="w-5 h-5 text-amber-600 dark:text-amber-400" />
                  <span className="text-sm font-medium text-amber-700 dark:text-amber-400 uppercase tracking-wide">Take Away Resource</span>
                </div>
                <h3 className="text-2xl font-medium public-heading mb-4">
                  Download Complete Build Books for Any AI Tool
                </h3>
                <p className="public-text-muted mb-6">
                  Each Build Book can be downloaded as a complete package—standards, tech stacks, documentation, and AI prompts—ready to use with <span className="font-medium">Cursor, Claude, ChatGPT, Copilot</span>, or any other AI development tool.
                </p>
                <ul className="space-y-3">
                  {[
                    "Chat with AI about standards before downloading",
                    "Export as markdown, JSON, or structured docs",
                    "Use as context for any AI coding assistant",
                    "Perfect for local development workflows"
                  ].map((item, i) => (
                    <li key={i} className="flex items-center gap-3">
                      <div className="w-5 h-5 public-chip-amber rounded-full flex items-center justify-center flex-shrink-0">
                        <Check className="w-3 h-3" />
                      </div>
                      <span className="text-sm public-text-muted">{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="public-card rounded-2xl p-6 shadow-lg border border-amber-100 dark:border-amber-800/30">
                <div className="flex items-center gap-2 mb-4">
                  <div className="w-3 h-3 rounded-full bg-red-400" />
                  <div className="w-3 h-3 rounded-full bg-yellow-400" />
                  <div className="w-3 h-3 rounded-full bg-green-400" />
                  <span className="text-xs public-text-subtle ml-2">build-book-export.md</span>
                </div>
                <div className="font-mono text-xs space-y-2 public-text-muted">
                  <div className="text-violet-600 dark:text-violet-400"># Enterprise React Application</div>
                  <div className="public-text-subtle">---</div>
                  <div><span className="text-emerald-600 dark:text-emerald-400">## Tech Stack</span></div>
                  <div className="pl-4 public-text-subtle">- React 18 + TypeScript</div>
                  <div className="pl-4 public-text-subtle">- Tailwind CSS + shadcn/ui</div>
                  <div className="pl-4 public-text-subtle">- Supabase Backend</div>
                  <div className="mt-2"><span className="text-emerald-600 dark:text-emerald-400">## Standards</span></div>
                  <div className="pl-4 public-text-subtle">- WCAG 2.1 AA Compliance</div>
                  <div className="pl-4 public-text-subtle">- SOC2 Security Controls</div>
                  <div className="mt-2"><span className="text-emerald-600 dark:text-emerald-400">## AI Instructions</span></div>
                  <div className="pl-4 public-text-subtle">- Follow component patterns...</div>
                  <div className="pl-4 text-amber-500 animate-pulse">|</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Why Choose Section */}
      <section className="py-24 px-6 public-bg-secondary">
        <div className="max-w-7xl mx-auto grid lg:grid-cols-2 gap-16 items-center">
          <div>
            <h2 className="text-4xl font-medium tracking-tight mb-6 public-heading">Why Choose Pronghorn?</h2>
            <p className="text-xl public-text-muted leading-relaxed mb-10">
              Built for teams who refuse to compromise on quality. Every feature designed to maintain traceability from
              concept to deployment.
            </p>
            <ul className="space-y-4">
              {benefits.map((benefit, index) => (
                <li key={index} className="flex items-center gap-4">
                  <div className="w-6 h-6 public-chip-emerald rounded-full flex items-center justify-center flex-shrink-0">
                    <Check className="w-4 h-4" />
                  </div>
                  <span className="public-text-muted">{benefit}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Stats Card */}
          <div className="relative h-[450px] w-full rounded-3xl overflow-hidden shadow-2xl public-gradient-dark p-10 flex flex-col justify-center">
            <div className="absolute top-0 right-0 w-64 h-64 bg-[hsl(350,80%,40%)]/20 rounded-full blur-3xl" />
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
          <div className="bg-gradient-to-br from-rose-100/50 dark:from-rose-900/20 to-rose-50 dark:to-rose-950/10 rounded-3xl p-8 md:p-12 lg:p-16 relative overflow-hidden">
            <div className="absolute -top-20 -right-20 w-64 h-64 bg-[hsl(350,80%,40%)]/10 rounded-full blur-3xl" />
            <div className="absolute -bottom-20 -left-20 w-64 h-64 bg-amber-400/10 rounded-full blur-3xl" />
            <div className="relative z-10">
              <h2 className="text-3xl md:text-4xl lg:text-5xl font-medium tracking-tight mb-6 public-heading">
                Ready to Build with AI Precision?
              </h2>
              <p className="text-lg md:text-xl public-text-muted mb-8 md:mb-10 max-w-2xl mx-auto">
                Join teams who are shipping better software, faster, with complete traceability from requirements to
                code.
              </p>
              <Button size="lg" onClick={() => navigate("/dashboard")} className="group public-btn-primary px-6 md:px-10 py-4 rounded-xl font-medium text-base md:text-lg hover:shadow-xl hover:-translate-y-1 transition-all duration-300 inline-flex items-center gap-2">
                <span>Create Your First Project</span>
                <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
              </Button>
            </div>
          </div>
        </div>
      </section>

      </main>

      {/* Footer */}
      <footer role="contentinfo" className="py-12 px-6 public-footer">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-6">
          <div className="flex items-center gap-3">
            <PronghornLogo className="h-8 w-8 rounded-lg" />
            <span className="text-lg font-semibold tracking-tight public-heading">Pronghorn</span>
          </div>
          <div className="flex flex-col md:flex-row items-center gap-4 md:gap-8">
            <nav aria-label="Footer navigation" className="flex gap-6 text-sm">
              <Link to="/terms" className="public-text-muted hover:public-brand underline decoration-1 underline-offset-2 hover:no-underline transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--public-brand)]">
                Terms of Use
              </Link>
              <Link to="/privacy" className="public-text-muted hover:public-brand underline decoration-1 underline-offset-2 hover:no-underline transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--public-brand)]">
                Privacy Policy
              </Link>
              <Link to="/license" className="public-text-muted hover:public-brand underline decoration-1 underline-offset-2 hover:no-underline transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--public-brand)]">
                License
              </Link>
            </nav>
            <div className="text-sm public-text-muted text-center md:text-right">
              <p>© 2025 Pronghorn. <Link to="/license" className="public-brand underline decoration-1 underline-offset-2 hover:no-underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--public-brand)]">MIT License</Link> Open Source by the Government of Alberta.</p>
              <a href="https://pronghorn.red" target="_blank" rel="noopener noreferrer" className="public-brand underline decoration-1 underline-offset-2 hover:no-underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--public-brand)]">
                pronghorn.red
              </a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
