import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { PrimaryNav } from "@/components/layout/PrimaryNav";
import { ProjectSidebar } from "@/components/layout/ProjectSidebar";
import { ProjectPageHeader } from "@/components/layout/ProjectPageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, Sparkles, CheckCircle2, AlertCircle, Clock, RefreshCw, Download, Trash2 } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useShareToken } from "@/hooks/useShareToken";
import { DownloadOptions } from "@/components/specifications/DownloadOptions";
import { ProjectSelector, ProjectSelectionResult } from "@/components/project/ProjectSelector";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import JSZip from "jszip";
import { Document, Packer, Paragraph, TextRun, HeadingLevel } from "docx";

interface Agent {
  id: string;
  title: string;
  description: string;
  systemPrompt: string;
}

interface AgentResult {
  agentId: string;
  agentTitle: string;
  status: 'pending' | 'streaming' | 'completed' | 'error';
  content: string;
  contentLength: number;
  error?: string;
}

export default function Specifications() {
  const { projectId } = useParams();
  const { token: shareToken, isTokenSet } = useShareToken(projectId);
  const [projectName, setProjectName] = useState<string>("project");
  const [hasGeneratedSpec, setHasGeneratedSpec] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isSelectorOpen, setIsSelectorOpen] = useState(false);
  const [projectSettings, setProjectSettings] = useState<any>(null);
  const [selectedContent, setSelectedContent] = useState<ProjectSelectionResult | null>(null);
  
  // Multi-agent state
  const [agents, setAgents] = useState<Agent[]>([]);
  const [selectedAgents, setSelectedAgents] = useState<string[]>([]);
  const [agentResults, setAgentResults] = useState<AgentResult[]>([]);
  const [activeAgentView, setActiveAgentView] = useState<string | null>(null);
  const [customizedAgents, setCustomizedAgents] = useState<Record<string, string>>({});

  // Load agents from JSON
  useEffect(() => {
    const loadAgents = async () => {
      try {
        const response = await fetch('/data/agents.json');
        const data = await response.json();
        setAgents(data);
        // Select Technical Specification by default
        setSelectedAgents(['technical-specification']);
      } catch (error) {
        console.error('Error loading agents:', error);
        toast.error('Failed to load agent configurations');
      }
    };
    loadAgents();
  }, []);

  // Load project settings
  useEffect(() => {
    const loadData = async () => {
      if (!projectId || !isTokenSet) return;

      const { data: project } = await supabase.rpc('get_project_with_token', {
        p_project_id: projectId,
        p_token: shareToken || null
      });
      
      if (project) {
        setProjectName(project.name);
        setProjectSettings({
          selected_model: project.selected_model || 'google/gemini-2.5-flash',
          max_tokens: project.max_tokens || 32768,
          thinking_enabled: project.thinking_enabled || false,
          thinking_budget: project.thinking_budget || -1
        });
      }
    };

    loadData();
  }, [projectId, shareToken, isTokenSet]);

  if (shareToken && !isTokenSet) {
    return (
      <div className="min-h-screen bg-background">
        <PrimaryNav />
        <div className="flex relative">
          <ProjectSidebar projectId={projectId!} isOpen={isSidebarOpen} onOpenChange={setIsSidebarOpen} />
          <main className="flex-1 w-full flex items-center justify-center">
            <p>Loading...</p>
          </main>
        </div>
      </div>
    );
  }

  const handleProjectSelection = (selection: ProjectSelectionResult) => {
    setSelectedContent(selection);
    toast.success(`Selected ${getTotalSelectedCount(selection)} items`);
  };

  const getTotalSelectedCount = (selection: ProjectSelectionResult) => {
    return (
      (selection.projectMetadata ? 1 : 0) +
      selection.artifacts.length +
      selection.chatSessions.length +
      selection.requirements.length +
      selection.standards.length +
      selection.techStacks.length +
      selection.canvasNodes.length +
      selection.canvasEdges.length +
      selection.canvasLayers.length +
      (selection.files?.length || 0) +
      (selection.databases?.length || 0)
    );
  };

  const hasSelectedContent = () => {
    if (!selectedContent) return false;
    return getTotalSelectedCount(selectedContent) > 0;
  };

  const isAnyAgentProcessing = () => {
    return agentResults.some(r => r.status === 'pending' || r.status === 'streaming');
  };

  const toggleAgent = (agentId: string) => {
    setSelectedAgents(prev => 
      prev.includes(agentId) 
        ? prev.filter(id => id !== agentId)
        : [...prev, agentId]
    );
  };

  const updateAgentPrompt = (agentId: string, newPrompt: string) => {
    setCustomizedAgents(prev => ({
      ...prev,
      [agentId]: newPrompt
    }));
  };

  const getAgentPrompt = (agent: Agent) => {
    // Use custom prompt if it exists (even if empty string), otherwise use default
    const customPrompt = customizedAgents[agent.id];
    const finalPrompt = customPrompt !== undefined ? customPrompt : agent.systemPrompt;
    console.log(`[Agent ${agent.id}] Using ${customPrompt !== undefined ? 'CUSTOM' : 'DEFAULT'} prompt`);
    return finalPrompt;
  };

  const buildContextFromSelection = () => {
    if (!selectedContent) return "";
    
    const contextParts = [];
    
    if (selectedContent.projectMetadata) {
      contextParts.push(`# Project Metadata\n${JSON.stringify(selectedContent.projectMetadata, null, 2)}`);
    }
    if (selectedContent.requirements.length > 0) {
      contextParts.push(`# Requirements\n${JSON.stringify(selectedContent.requirements, null, 2)}`);
    }
    if (selectedContent.artifacts.length > 0) {
      contextParts.push(`# Artifacts\n${JSON.stringify(selectedContent.artifacts, null, 2)}`);
    }
    if (selectedContent.chatSessions.length > 0) {
      contextParts.push(`# Chat Sessions\n${JSON.stringify(selectedContent.chatSessions, null, 2)}`);
    }
    if (selectedContent.standards.length > 0) {
      contextParts.push(`# Standards\n${JSON.stringify(selectedContent.standards, null, 2)}`);
    }
    if (selectedContent.techStacks.length > 0) {
      contextParts.push(`# Tech Stacks\n${JSON.stringify(selectedContent.techStacks, null, 2)}`);
    }
    if (selectedContent.canvasNodes.length > 0) {
      contextParts.push(`# Canvas Nodes\n${JSON.stringify(selectedContent.canvasNodes, null, 2)}`);
    }
    if (selectedContent.canvasEdges.length > 0) {
      contextParts.push(`# Canvas Edges\n${JSON.stringify(selectedContent.canvasEdges, null, 2)}`);
    }
    if (selectedContent.canvasLayers.length > 0) {
      contextParts.push(`# Canvas Layers\n${JSON.stringify(selectedContent.canvasLayers, null, 2)}`);
    }
    if (selectedContent.files && selectedContent.files.length > 0) {
      contextParts.push(`# Repository Files\n${JSON.stringify(selectedContent.files, null, 2)}`);
    }
    if (selectedContent.databases && selectedContent.databases.length > 0) {
      contextParts.push(`# Database Schemas\n${JSON.stringify(selectedContent.databases, null, 2)}`);
    }

    return contextParts.join('\n\n');
  };

  const generateForAgent = async (agent: Agent, userPrompt: string) => {
    let edgeFunctionName = 'chat-stream-gemini';
    if (projectSettings.selected_model.includes('anthropic') || projectSettings.selected_model.includes('claude')) {
      edgeFunctionName = 'chat-stream-anthropic';
    } else if (projectSettings.selected_model.includes('xai') || projectSettings.selected_model.includes('grok')) {
      edgeFunctionName = 'chat-stream-xai';
    }

    const agentPrompt = getAgentPrompt(agent);

    const response = await fetch(
      `https://obkzdksfayygnrzdqoam.supabase.co/functions/v1/${edgeFunctionName}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9ia3pka3NmYXl5Z25yemRxb2FtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjM0MTA4MzcsImV4cCI6MjA3ODk4NjgzN30.xOKphCiEilzPTo9EGHNJqAJfruM_bijI9PN3BQBF-z8`
        },
        body: JSON.stringify({
          systemPrompt: agentPrompt,
          messages: [],
          userPrompt,
          model: projectSettings.selected_model,
          maxOutputTokens: projectSettings.max_tokens,
          thinkingEnabled: projectSettings.thinking_enabled,
          thinkingBudget: projectSettings.thinking_budget
        })
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to generate: ${errorText}`);
    }

    return response;
  };

  const streamAgentResponse = async (agentId: string, response: Response) => {
    const reader = response.body?.getReader();
    const decoder = new TextDecoder();
    let accumulated = '';

    if (reader) {
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        buffer += chunk;

        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;

          const data = line.slice(6).trim();
          if (!data) continue;

          try {
            const parsed = JSON.parse(data);

            if (parsed.type === 'delta' && typeof parsed.text === 'string') {
              accumulated += parsed.text;
              setAgentResults(prev => prev.map(r => 
                r.agentId === agentId 
                  ? { ...r, status: 'streaming', content: accumulated, contentLength: accumulated.length }
                  : r
              ));
              continue;
            }

            if (parsed.type === 'done') continue;

            const content = parsed.choices?.[0]?.delta?.content || '';
            if (content) {
              accumulated += content;
              setAgentResults(prev => prev.map(r => 
                r.agentId === agentId 
                  ? { ...r, status: 'streaming', content: accumulated, contentLength: accumulated.length }
                  : r
              ));
            }
          } catch (e) {
            console.error('Error parsing stream line:', e);
          }
        }
      }

      if (buffer.trim().startsWith('data: ')) {
        const data = buffer.trim().slice(6).trim();
        if (data) {
          try {
            const parsed = JSON.parse(data);
            if (parsed.type === 'delta' && typeof parsed.text === 'string') {
              accumulated += parsed.text;
            } else if (!parsed.type && parsed.choices?.[0]?.delta?.content) {
              accumulated += parsed.choices[0].delta.content;
            }
          } catch (e) {
            console.error('Error parsing final buffer:', e);
          }
        }
      }
    }

    setAgentResults(prev => prev.map(r => 
      r.agentId === agentId 
        ? { ...r, status: 'completed', content: accumulated, contentLength: accumulated.length }
        : r
    ));

    return accumulated;
  };

  const generateSpecifications = async () => {
    if (!projectId || !projectSettings || !hasSelectedContent()) {
      toast.error("Please select project content first");
      return;
    }

    if (selectedAgents.length === 0) {
      toast.error("Please select at least one agent");
      return;
    }

    const userPrompt = buildContextFromSelection();

    const initialResults: AgentResult[] = selectedAgents.map(agentId => {
      const agent = agents.find(a => a.id === agentId);
      return {
        agentId,
        agentTitle: agent?.title || agentId,
        status: 'pending' as const,
        content: '',
        contentLength: 0
      };
    });
    
    // Preserve existing results and add new ones
    setAgentResults(prev => {
      const existingMap = new Map(prev.map(r => [r.agentId, r]));
      initialResults.forEach(newResult => {
        existingMap.set(newResult.agentId, newResult);
      });
      return Array.from(existingMap.values());
    });
    setActiveAgentView(selectedAgents[0]);

    const promises = selectedAgents.map(async (agentId) => {
      const agent = agents.find(a => a.id === agentId);
      if (!agent) return;

      try {
        const response = await generateForAgent(agent, userPrompt);
        await streamAgentResponse(agentId, response);
      } catch (error) {
        console.error(`Error generating for ${agentId}:`, error);
        setAgentResults(prev => prev.map(r => 
          r.agentId === agentId 
            ? { ...r, status: 'error', error: error instanceof Error ? error.message : 'Unknown error' }
            : r
        ));
      }
    });

    await Promise.all(promises);
    setHasGeneratedSpec(true);
    toast.success("All specifications generated!");
  };

  const retryAgent = async (agentId: string) => {
    const agent = agents.find(a => a.id === agentId);
    if (!agent || !projectSettings || !hasSelectedContent()) return;

    const userPrompt = buildContextFromSelection();

    setAgentResults(prev => prev.map(r => 
      r.agentId === agentId 
        ? { ...r, status: 'pending', content: '', contentLength: 0, error: undefined }
        : r
    ));

    try {
      const response = await generateForAgent(agent, userPrompt);
      await streamAgentResponse(agentId, response);
    } catch (error) {
      console.error(`Error retrying ${agentId}:`, error);
      setAgentResults(prev => prev.map(r => 
        r.agentId === agentId 
          ? { ...r, status: 'error', error: error instanceof Error ? error.message : 'Unknown error' }
          : r
      ));
    }
  };

  const downloadSingleAgent = (result: AgentResult) => {
    const blob = new Blob([result.content], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${projectName}-${result.agentTitle.replace(/[^a-z0-9]/gi, '_')}.md`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`Downloaded ${result.agentTitle}`);
  };

  const downloadAllAgents = async () => {
    const completedResults = agentResults.filter(r => r.status === 'completed');
    if (completedResults.length === 0) {
      toast.error("No completed specifications to download");
      return;
    }

    // Create combined markdown
    const combined = completedResults.map((result, index) => {
      return `${'='.repeat(80)}\n# ${result.agentTitle}\n${'='.repeat(80)}\n\n${result.content}\n\n`;
    }).join('\n');

    const blob = new Blob([combined], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${projectName}-all-specifications.md`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`Downloaded all ${completedResults.length} specifications`);
  };

  const downloadAllAgentsAsWord = async () => {
    const completedResults = agentResults.filter(r => r.status === 'completed');
    if (completedResults.length === 0) {
      toast.error("No completed specifications to download");
      return;
    }

    try {
      const children: Paragraph[] = [];

      const parseMarkdownToParagraphs = (content: string): Paragraph[] => {
        const paragraphs: Paragraph[] = [];
        const lines = content.split('\n');
        let currentParagraphLines: string[] = [];
        let inCodeBlock = false;
        let codeBlockLines: string[] = [];

        const flushParagraph = () => {
          if (currentParagraphLines.length > 0) {
            const text = currentParagraphLines.join(' ').trim();
            if (text) {
              // Parse inline markdown (bold, italic, code)
              const runs = parseInlineMarkdown(text);
              paragraphs.push(
                new Paragraph({
                  children: runs,
                  spacing: { after: 200 }
                })
              );
            }
            currentParagraphLines = [];
          }
        };

        const parseInlineMarkdown = (text: string): TextRun[] => {
          const runs: TextRun[] = [];
          // Simple inline markdown parser - handles **bold**, *italic*, `code`
          const segments = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g);
          
          segments.forEach(segment => {
            if (segment.startsWith('**') && segment.endsWith('**')) {
              runs.push(new TextRun({ text: segment.slice(2, -2), bold: true }));
            } else if (segment.startsWith('*') && segment.endsWith('*')) {
              runs.push(new TextRun({ text: segment.slice(1, -1), italics: true }));
            } else if (segment.startsWith('`') && segment.endsWith('`')) {
              runs.push(new TextRun({ text: segment.slice(1, -1), font: 'Courier New' }));
            } else if (segment) {
              runs.push(new TextRun(segment));
            }
          });
          
          return runs.length > 0 ? runs : [new TextRun(text)];
        };

        lines.forEach(line => {
          // Handle code blocks
          if (line.trim().startsWith('```')) {
            if (inCodeBlock) {
              // End code block
              if (codeBlockLines.length > 0) {
                paragraphs.push(
                  new Paragraph({
                    children: [new TextRun({ text: codeBlockLines.join('\n'), font: 'Courier New' })],
                    spacing: { before: 200, after: 200 }
                  })
                );
              }
              codeBlockLines = [];
              inCodeBlock = false;
            } else {
              // Start code block
              flushParagraph();
              inCodeBlock = true;
            }
            return;
          }

          if (inCodeBlock) {
            codeBlockLines.push(line);
            return;
          }

          // Handle headers
          if (line.startsWith('#### ')) {
            flushParagraph();
            paragraphs.push(
              new Paragraph({
                text: line.substring(5).trim(),
                heading: HeadingLevel.HEADING_4,
                spacing: { before: 160, after: 100 }
              })
            );
          } else if (line.startsWith('### ')) {
            flushParagraph();
            paragraphs.push(
              new Paragraph({
                text: line.substring(4).trim(),
                heading: HeadingLevel.HEADING_3,
                spacing: { before: 200, after: 120 }
              })
            );
          } else if (line.startsWith('## ')) {
            flushParagraph();
            paragraphs.push(
              new Paragraph({
                text: line.substring(3).trim(),
                heading: HeadingLevel.HEADING_2,
                spacing: { before: 240, after: 160 }
              })
            );
          } else if (line.startsWith('# ')) {
            flushParagraph();
            paragraphs.push(
              new Paragraph({
                text: line.substring(2).trim(),
                heading: HeadingLevel.HEADING_1,
                spacing: { before: 280, after: 200 }
              })
            );
          } else if (line.trim() === '') {
            flushParagraph();
          } else if (line.trim().match(/^[-*+]\s/)) {
            // Handle bullet points
            flushParagraph();
            const bulletText = line.trim().substring(2);
            const runs = parseInlineMarkdown(bulletText);
            paragraphs.push(
              new Paragraph({
                children: runs,
                bullet: { level: 0 },
                spacing: { after: 100 }
              })
            );
          } else if (line.trim().match(/^\d+\.\s/)) {
            // Handle numbered lists
            flushParagraph();
            const numberText = line.trim().replace(/^\d+\.\s/, '');
            const runs = parseInlineMarkdown(numberText);
            paragraphs.push(
              new Paragraph({
                children: runs,
                numbering: { reference: 'default-numbering', level: 0 },
                spacing: { after: 100 }
              })
            );
          } else {
            currentParagraphLines.push(line.trim());
          }
        });

        flushParagraph();
        return paragraphs;
      };

      completedResults.forEach((result, index) => {
        // Add agent title as heading
        children.push(
          new Paragraph({
            text: result.agentTitle,
            heading: HeadingLevel.HEADING_1,
            spacing: { before: index === 0 ? 0 : 400, after: 200 }
          })
        );

        // Parse markdown content recursively
        const contentParagraphs = parseMarkdownToParagraphs(result.content);
        children.push(...contentParagraphs);
      });

      const doc = new Document({
        sections: [{
          children
        }]
      });

      const blob = await Packer.toBlob(doc);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${projectName}-all-specifications.docx`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(`Downloaded Word document with ${completedResults.length} specifications`);
    } catch (error) {
      console.error('Error generating Word document:', error);
      toast.error('Failed to generate Word document');
    }
  };

  const deleteAgentResult = (agentId: string) => {
    setAgentResults(prev => prev.filter(r => r.agentId !== agentId));
    if (activeAgentView === agentId) {
      setActiveAgentView(agentResults.find(r => r.agentId !== agentId)?.agentId || null);
    }
    toast.success('Analysis deleted');
  };

  const getStatusIcon = (status: AgentResult['status']) => {
    switch (status) {
      case 'completed':
        return <CheckCircle2 className="h-5 w-5 text-green-500" />;
      case 'error':
        return <AlertCircle className="h-5 w-5 text-red-500" />;
      case 'streaming':
        return <Loader2 className="h-5 w-5 text-yellow-500 animate-spin" />;
      case 'pending':
        return <Clock className="h-5 w-5 text-gray-400" />;
    }
  };

  const getStatusColor = (status: AgentResult['status']) => {
    switch (status) {
      case 'completed':
        return 'border-green-500 bg-green-50';
      case 'error':
        return 'border-red-500 bg-red-50';
      case 'streaming':
        return 'border-yellow-500 bg-yellow-50';
      case 'pending':
        return 'border-gray-300 bg-gray-50';
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <PrimaryNav />
      <div className="flex relative">
        <ProjectSidebar projectId={projectId!} isOpen={isSidebarOpen} onOpenChange={setIsSidebarOpen} />
        <main className="flex-1 w-full overflow-auto">
          <div className="container px-4 md:px-6 py-6 md:py-8 max-w-6xl">
            <ProjectPageHeader 
              title="Project Specifications" 
              subtitle="Generate comprehensive documentation and analysis for your project"
              onMenuClick={() => setIsSidebarOpen(true)} 
            />
            
            <div className="space-y-6">
            {/* Select Project Content */}
            <Card>
              <CardHeader>
                <CardTitle>Select Project Content</CardTitle>
                <CardDescription>
                  Choose the project data to include in your specification
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button 
                  onClick={() => setIsSelectorOpen(true)}
                  variant="outline"
                  className="mb-4"
                >
                  <Sparkles className="mr-2 h-4 w-4" />
                  {selectedContent ? 'Change Selection' : 'Select Content'}
                </Button>

                {selectedContent && (
                  <div className="space-y-2 text-sm">
                    {selectedContent.projectMetadata && (
                      <div>• <strong>Project Metadata:</strong> Included</div>
                    )}
                    {selectedContent.requirements.length > 0 && (
                      <div>• <strong>Requirements:</strong> {selectedContent.requirements.length} items</div>
                    )}
                    {selectedContent.artifacts.length > 0 && (
                      <div>• <strong>Artifacts:</strong> {selectedContent.artifacts.length} items</div>
                    )}
                    {selectedContent.chatSessions.length > 0 && (
                      <div>• <strong>Chat Sessions:</strong> {selectedContent.chatSessions.length} items</div>
                    )}
                    {selectedContent.standards.length > 0 && (
                      <div>• <strong>Standards:</strong> {selectedContent.standards.length} items</div>
                    )}
                    {selectedContent.techStacks.length > 0 && (
                      <div>• <strong>Tech Stacks:</strong> {selectedContent.techStacks.length} items</div>
                    )}
                    {selectedContent.canvasNodes.length > 0 && (
                      <div>• <strong>Canvas Nodes:</strong> {selectedContent.canvasNodes.length} items</div>
                    )}
                    {selectedContent.canvasEdges.length > 0 && (
                      <div>• <strong>Canvas Edges:</strong> {selectedContent.canvasEdges.length} items</div>
                    )}
                    {selectedContent.canvasLayers.length > 0 && (
                      <div>• <strong>Canvas Layers:</strong> {selectedContent.canvasLayers.length} items</div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Agent Selection */}
            <Card>
              <CardHeader>
                <CardTitle>Select Agents</CardTitle>
                <CardDescription>
                  Choose one or more agents to generate different perspectives of your project
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-80">
                  <div className="space-y-2 pr-4">
                    <Accordion type="multiple" className="w-full">
                      {agents.map(agent => (
                        <AccordionItem key={agent.id} value={agent.id}>
                          <AccordionTrigger className="hover:no-underline">
                            <div className="flex items-center space-x-3 flex-1">
                              <Checkbox
                                id={agent.id}
                                checked={selectedAgents.includes(agent.id)}
                                onCheckedChange={() => toggleAgent(agent.id)}
                                onClick={(e) => e.stopPropagation()}
                              />
                              <div className="flex-1 text-left">
                                <Label htmlFor={agent.id} className="text-base font-semibold cursor-pointer">
                                  {agent.title}
                                </Label>
                                <p className="text-sm text-muted-foreground mt-1">{agent.description}</p>
                              </div>
                            </div>
                          </AccordionTrigger>
                          <AccordionContent>
                            <div className="pt-2 pl-9 space-y-2">
                              <Label className="text-sm font-medium">System Prompt:</Label>
                              <Textarea
                                value={customizedAgents[agent.id] || agent.systemPrompt}
                                onChange={(e) => updateAgentPrompt(agent.id, e.target.value)}
                                className="min-h-[150px] font-mono text-xs"
                                placeholder="Enter custom system prompt..."
                              />
                              <p className="text-xs text-muted-foreground">
                                Changes won't be saved to agents.json but will be used for this session
                              </p>
                            </div>
                          </AccordionContent>
                        </AccordionItem>
                      ))}
                    </Accordion>
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>

            {/* AI Analysis */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Sparkles className="h-5 w-5" />
                  AI Analysis
                </CardTitle>
                <CardDescription>
                  Generate comprehensive analysis from selected agents
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <Button
                    onClick={generateSpecifications}
                    disabled={!hasSelectedContent() || selectedAgents.length === 0 || isAnyAgentProcessing()}
                    size="lg"
                    className="w-full"
                  >
                    {isAnyAgentProcessing() ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Generating...
                      </>
                    ) : (
                      <>
                        <Sparkles className="mr-2 h-4 w-4" />
                        Generate Analysis
                      </>
                    )}
                  </Button>

                  {agentResults.length > 0 && (
                    <div className="space-y-4 mt-6">
                      {/* Status Dashboard */}
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {agentResults.map(result => (
                          <Card 
                            key={result.agentId} 
                            className={`cursor-pointer transition-all ${getStatusColor(result.status)} ${activeAgentView === result.agentId ? 'ring-2 ring-primary' : ''}`}
                            onClick={() => setActiveAgentView(result.agentId)}
                          >
                            <CardHeader className="pb-3">
                              <div className="flex items-start justify-between">
                                <div className="flex-1">
                                  <CardTitle className="text-base">{result.agentTitle}</CardTitle>
                                </div>
                                {getStatusIcon(result.status)}
                              </div>
                            </CardHeader>
                            <CardContent>
                              <div className="text-sm space-y-1">
                                <div>Status: <span className="font-medium capitalize">{result.status}</span></div>
                                <div>Length: <span className="font-medium">{result.contentLength.toLocaleString()} chars</span></div>
                                {result.error && (
                                  <div className="text-red-600 text-xs mt-2">{result.error}</div>
                                )}
                                {result.status === 'error' && (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      retryAgent(result.agentId);
                                    }}
                                    className="mt-2 w-full"
                                  >
                                    <RefreshCw className="h-3 w-3 mr-1" />
                                    Retry
                                  </Button>
                                )}
                                {result.status === 'completed' && (
                                  <div className="space-y-1 mt-2">
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        downloadSingleAgent(result);
                                      }}
                                      className="w-full"
                                    >
                                      <Download className="h-3 w-3 mr-1" />
                                      Download
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="destructive"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        deleteAgentResult(result.agentId);
                                      }}
                                      className="w-full"
                                    >
                                      <Trash2 className="h-3 w-3 mr-1" />
                                      Delete
                                    </Button>
                                  </div>
                                )}
                              </div>
                            </CardContent>
                          </Card>
                        ))}
                      </div>

                      {/* Download All Button */}
                      {agentResults.some(r => r.status === 'completed') && (
                        <div className="flex gap-2">
                          <Button onClick={downloadAllAgents} variant="outline" className="flex-1">
                            <Download className="mr-2 h-4 w-4" />
                            Download All (Markdown)
                          </Button>
                          <Button onClick={downloadAllAgentsAsWord} variant="outline" className="flex-1">
                            <Download className="mr-2 h-4 w-4" />
                            Download All (Word)
                          </Button>
                        </div>
                      )}

                      {/* Active Agent View */}
                      {activeAgentView && (
                        <Card>
                          <CardHeader>
                            <CardTitle>
                              {agentResults.find(r => r.agentId === activeAgentView)?.agentTitle}
                            </CardTitle>
                          </CardHeader>
                           <CardContent>
                            <ScrollArea className="h-[600px] w-full rounded-md border p-4">
                              {agentResults.find(r => r.agentId === activeAgentView)?.content ? (
                                <div className="prose prose-sm dark:prose-invert max-w-none break-words whitespace-normal [&_p]:mb-4 [&_p]:break-words [&_ul]:my-4 [&_ol]:my-4 [&_li]:mb-2 [&_li]:break-words [&_h1]:mb-4 [&_h1]:break-words [&_h2]:mb-4 [&_h2]:break-words [&_h3]:mb-3 [&_h3]:break-words [&_h4]:mb-3 [&_h4]:break-words [&_table]:border [&_table]:border-border [&_table]:w-full [&_table]:table-auto [&_th]:border [&_th]:border-border [&_th]:bg-muted [&_th]:p-2 [&_th]:break-words [&_td]:border [&_td]:border-border [&_td]:p-2 [&_td]:break-words [&_pre]:overflow-x-auto [&_pre]:whitespace-pre-wrap [&_code]:break-words [&_a]:break-words">
                                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                    {agentResults.find(r => r.agentId === activeAgentView)?.content || ''}
                                  </ReactMarkdown>
                                </div>
                              ) : (
                                <div className="flex items-center justify-center h-full text-muted-foreground">
                                  Generating...
                                </div>
                              )}
                            </ScrollArea>
                          </CardContent>
                        </Card>
                      )}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Download Specifications */}
            <Card>
              <CardHeader>
                <CardTitle>Download Specifications</CardTitle>
                <CardDescription>
                  Download your project data in various formats
                </CardDescription>
              </CardHeader>
              <CardContent>
                <DownloadOptions
                  projectId={projectId!}
                  projectName={projectName}
                  shareToken={shareToken}
                  hasGeneratedSpec={hasGeneratedSpec}
                  selectedContent={selectedContent}
                  agentResults={agentResults
                    .filter(r => r.status === 'completed')
                    .map(r => ({
                      agentId: r.agentId,
                      agentTitle: r.agentTitle,
                      content: r.content,
                      contentLength: r.contentLength
                    }))}
                />
              </CardContent>
            </Card>
            </div>
          </div>
        </main>
      </div>

      {/* Project Selector Dialog */}
      <ProjectSelector
        projectId={projectId!}
        shareToken={shareToken}
        open={isSelectorOpen}
        onClose={() => setIsSelectorOpen(false)}
        onConfirm={(selection) => {
          handleProjectSelection(selection);
          setIsSelectorOpen(false);
        }}
      />
    </div>
  );
}
