import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { PrimaryNav } from "@/components/layout/PrimaryNav";
import { ProjectSidebar } from "@/components/layout/ProjectSidebar";
import { ProjectPageHeader } from "@/components/layout/ProjectPageHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, Sparkles, FileText, FileJson } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useShareToken } from "@/hooks/useShareToken";
import { DownloadOptions } from "@/components/specifications/DownloadOptions";
import { ProjectSelector, ProjectSelectionResult } from "@/components/project/ProjectSelector";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Textarea } from "@/components/ui/textarea";

const DEFAULT_SYSTEM_PROMPT = `You are a technical specification writer. Generate a comprehensive project specification document based on the provided project data.

The document should include:
1. Executive Summary - Brief overview of the project
2. Project Overview - Detailed description, scope, and objectives
3. Requirements - Complete hierarchy with epics, features, stories, and acceptance criteria
4. Architecture - Description of the canvas nodes, edges, and layers
5. Technology Stack - List and description of all technologies
6. Standards & Compliance - All linked standards and their application
7. Integration Points - Key integrations and data flows
8. Recommendations - Best practices and suggestions

Format the output as a well-structured markdown document with clear headings, bullet points, and tables where appropriate.`;

export default function Specifications() {
  const { projectId } = useParams();
  const { token: shareToken, isTokenSet } = useShareToken(projectId);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedSpec, setGeneratedSpec] = useState<string>("");
  const [rawData, setRawData] = useState<any>(null);
  const [projectName, setProjectName] = useState<string>("project");
  const [hasGeneratedSpec, setHasGeneratedSpec] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isSelectorOpen, setIsSelectorOpen] = useState(false);
  const [systemPrompt, setSystemPrompt] = useState(DEFAULT_SYSTEM_PROMPT);
  const [projectSettings, setProjectSettings] = useState<any>(null);
  const [selectedContent, setSelectedContent] = useState<ProjectSelectionResult | null>(null);

  // Load saved specification, project name, and settings
  useEffect(() => {
    const loadData = async () => {
      if (!projectId || !isTokenSet) return;

      // Load project details and settings via RPC (token-based)
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

      // Load saved specification
      if (shareToken) {
        const { data: spec } = await supabase.rpc('get_project_specification_with_token', {
          p_project_id: projectId,
          p_token: shareToken
        });

        if (spec) {
          setGeneratedSpec(spec.generated_spec);
          setRawData(spec.raw_data);
          setHasGeneratedSpec(true);
        }
      }
    };

    loadData();
  }, [projectId, shareToken, isTokenSet]);

  // Wait for token to be set before allowing generation
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
      selection.canvasLayers.length
    );
  };

  const hasSelectedContent = () => {
    if (!selectedContent) return false;
    return getTotalSelectedCount(selectedContent) > 0;
  };

  const generateSpecification = async () => {
    if (!projectId || !projectSettings || !hasSelectedContent()) {
      toast.error("Please select project content first");
      return;
    }

    setIsGenerating(true);
    setGeneratedSpec(""); // Clear previous results
    try {
      // Build context from selectedContent
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

      const userPrompt = `Please generate a comprehensive technical specification document based on the following project data:\n\n${contextParts.join('\n\n')}`;

      // Determine which edge function to call based on model
      let edgeFunctionName = 'chat-stream-gemini';
      if (projectSettings.selected_model.includes('anthropic') || projectSettings.selected_model.includes('claude')) {
        edgeFunctionName = 'chat-stream-anthropic';
      } else if (projectSettings.selected_model.includes('xai') || projectSettings.selected_model.includes('grok')) {
        edgeFunctionName = 'chat-stream-xai';
      }

      const response = await fetch(
        `https://obkzdksfayygnrzdqoam.supabase.co/functions/v1/${edgeFunctionName}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9ia3pka3NmYXl5Z25yemRxb2FtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjM0MTA4MzcsImV4cCI6MjA3ODk4NjgzN30.xOKphCiEilzPTo9EGHNJqAJfruM_bijI9PN3BQBF-z8`
          },
          body: JSON.stringify({
            systemPrompt,
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
        throw new Error(`Failed to generate specification: ${errorText}`);
      }

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

              // Handle custom delta format
              if (parsed.type === 'delta' && typeof parsed.text === 'string') {
                accumulated += parsed.text;
                setGeneratedSpec(accumulated);
                continue;
              }

              // Handle done event
              if (parsed.type === 'done') {
                continue;
              }

              // Handle standard OpenAI-style format
              const content = parsed.choices?.[0]?.delta?.content || '';
              if (content) {
                accumulated += content;
                setGeneratedSpec(accumulated);
              }
            } catch (e) {
              console.error('Error parsing stream line:', e);
            }
          }
        }

        // Process any remaining data in buffer
        if (buffer.trim().startsWith('data: ')) {
          const data = buffer.trim().slice(6).trim();
          if (data) {
            try {
              const parsed = JSON.parse(data);
              if (parsed.type === 'delta' && typeof parsed.text === 'string') {
                accumulated += parsed.text;
                setGeneratedSpec(accumulated);
              } else if (!parsed.type && parsed.choices?.[0]?.delta?.content) {
                const content = parsed.choices[0].delta.content;
                accumulated += content;
                setGeneratedSpec(accumulated);
              }
            } catch (e) {
              console.error('Error parsing final stream buffer:', e);
            }
          }
        }
      }

      // Save to database
      if (accumulated) {
        const { error: saveError } = await supabase.rpc('save_project_specification_with_token', {
          p_project_id: projectId,
          p_token: shareToken || null,
          p_generated_spec: accumulated,
          p_raw_data: selectedContent as any
        });

        if (saveError) {
          console.error('Error saving specification:', saveError);
          toast.error('Specification generated but failed to save');
        } else {
          setRawData(selectedContent);
          setHasGeneratedSpec(true);
          toast.success("Specification generated and saved successfully!");
        }
      }
    } catch (error) {
      console.error("Error generating specification:", error);
      toast.error(error instanceof Error ? error.message : "Failed to generate specification");
      setGeneratedSpec(""); // Clear on error
    } finally {
      setIsGenerating(false);
    }
  };

  const downloadRawJSON = async () => {
    if (!projectId || !shareToken) {
      toast.error("Project ID and share token required");
      return;
    }

    try {
      // CRITICAL: All project data must use token-based RPC functions
      const { data: project, error: projectError } = await supabase.rpc('get_project_with_token', {
        p_project_id: projectId,
        p_token: shareToken
      });

      if (projectError) throw projectError;

      const { data: requirements } = await supabase.rpc('get_requirements_with_token', {
        p_project_id: projectId,
        p_token: shareToken
      });

      const { data: canvasNodes } = await supabase.rpc('get_canvas_nodes_with_token', {
        p_project_id: projectId,
        p_token: shareToken
      });

      const { data: canvasEdges } = await supabase.rpc('get_canvas_edges_with_token', {
        p_project_id: projectId,
        p_token: shareToken
      });

      const { data: projectTechStacksRaw } = await supabase.rpc('get_project_tech_stacks_with_token', {
        p_project_id: projectId,
        p_token: shareToken
      });

      // Enrich with tech stack details (tech_stacks is not project-scoped)
      const projectTechStacks = await Promise.all(
        (projectTechStacksRaw || []).map(async (pts: any) => {
          const { data: techStack } = await supabase
            .from('tech_stacks')
            .select('id, name, description, metadata')
            .eq('id', pts.tech_stack_id)
            .single();
          return { tech_stack_id: pts.tech_stack_id, tech_stacks: techStack };
        })
      );

      // Fetch requirement standards for each requirement via RPC
      const reqStandards = await Promise.all(
        (requirements || []).map(async (req: any) => {
          const { data } = await supabase.rpc('get_requirement_standards_with_token', {
            p_requirement_id: req.id,
            p_token: shareToken
          });
          
          // Enrich with standard details
          return await Promise.all(
            (data || []).map(async (rs: any) => {
              const { data: standard } = await supabase
                .from('standards')
                .select('id, title, code, description, content')
                .eq('id', rs.standard_id)
                .single();
              return { ...rs, standards: standard };
            })
          );
        })
      );

      // Fetch project-level standards via RPC
      const { data: projectStandardsRaw } = await supabase.rpc('get_project_standards_with_token', {
        p_project_id: projectId,
        p_token: shareToken
      });

      // Enrich with standard details and categories
      const projectStandards = await Promise.all(
        (projectStandardsRaw || []).map(async (ps: any) => {
          const { data: standard } = await supabase
            .from('standards')
            .select(`
              id,
              code,
              title,
              description,
              content,
              parent_id,
              category_id,
              standard_categories (
                id,
                name,
                description
              )
            `)
            .eq('id', ps.standard_id)
            .single();
          return { standard_id: ps.standard_id, standards: standard };
        })
      );

      // Fetch attached files for all requirements
      const requirementFiles: Record<string, any[]> = {};
      
      if (requirements && requirements.length > 0) {
        for (const req of requirements) {
          try {
            const { data: files } = await supabase.storage
              .from('requirement-sources')
              .list(req.id);

            if (files && files.length > 0) {
              const filesWithContent = await Promise.all(
                files.map(async (file) => {
                  try {
                    const { data: fileData } = await supabase.storage
                      .from('requirement-sources')
                      .download(`${req.id}/${file.name}`);

                    if (fileData) {
                      // Try to read as text for text files
                      const text = await fileData.text();
                      return {
                        name: file.name,
                        content: text,
                        size: file.metadata?.size,
                        created_at: file.created_at,
                        updated_at: file.updated_at
                      };
                    }
                  } catch (err) {
                    console.error(`Error reading file ${file.name}:`, err);
                    return {
                      name: file.name,
                      content: "[Binary file - content not included]",
                      size: file.metadata?.size,
                      created_at: file.created_at,
                      updated_at: file.updated_at
                    };
                  }
                })
              );
              requirementFiles[req.id] = filesWithContent;
            }
          } catch (err) {
            console.error(`Error loading files for requirement ${req.id}:`, err);
          }
        }
      }

      const exportData = {
        project,
        requirements: requirements || [],
        requirementFiles,
        canvas: {
          nodes: canvasNodes || [],
          edges: canvasEdges || []
        },
        projectStandards: projectStandards || [],
        techStacks: projectTechStacks?.map((pts: any) => pts.tech_stacks) || [],
        linkedStandards: reqStandards.flat() || []
      };

      const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${project.name.replace(/\s+/g, '-')}-raw-data.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success("Raw JSON data downloaded!");
    } catch (error) {
      console.error("Error downloading raw JSON:", error);
      toast.error(error instanceof Error ? error.message : "Failed to download JSON");
    }
  };

  const downloadAsJSON = () => {
    if (!rawData) {
      toast.error("No data available. Generate specification first.");
      return;
    }

    const blob = new Blob([JSON.stringify(rawData, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${rawData.project.name.replace(/\s+/g, '-')}-specification.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success("JSON specification downloaded!");
  };

  const downloadAsHTML = () => {
    if (!generatedSpec) {
      toast.error("No specification available. Generate specification first.");
      return;
    }

    const htmlContent = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${rawData?.project?.name || 'Project'} Specification</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      line-height: 1.6;
      max-width: 900px;
      margin: 0 auto;
      padding: 40px 20px;
      color: #333;
    }
    h1 { color: #1a1a1a; border-bottom: 3px solid #0066cc; padding-bottom: 10px; }
    h2 { color: #0066cc; margin-top: 30px; border-bottom: 2px solid #e0e0e0; padding-bottom: 8px; }
    h3 { color: #333; margin-top: 20px; }
    code { background: #f4f4f4; padding: 2px 6px; border-radius: 3px; font-family: 'Courier New', monospace; }
    pre { background: #f4f4f4; padding: 15px; border-radius: 5px; overflow-x: auto; }
    ul, ol { margin-left: 20px; }
    li { margin: 8px 0; }
    table { border-collapse: collapse; width: 100%; margin: 20px 0; }
    th, td { border: 1px solid #ddd; padding: 12px; text-align: left; }
    th { background-color: #0066cc; color: white; }
    blockquote { border-left: 4px solid #0066cc; padding-left: 20px; margin: 20px 0; color: #666; }
  </style>
</head>
<body>
  <div class="content">
    ${convertMarkdownToHTML(generatedSpec)}
  </div>
</body>
</html>`;

    const blob = new Blob([htmlContent], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${rawData?.project?.name?.replace(/\s+/g, '-') || 'specification'}.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success("HTML specification downloaded! You can open this in Word or convert to PDF.");
  };

  const convertMarkdownToHTML = (markdown: string): string => {
    // Simple markdown to HTML conversion
    return markdown
      .replace(/^### (.*$)/gim, '<h3>$1</h3>')
      .replace(/^## (.*$)/gim, '<h2>$1</h2>')
      .replace(/^# (.*$)/gim, '<h1>$1</h1>')
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      .replace(/`(.*?)`/g, '<code>$1</code>')
      .replace(/^\- (.*$)/gim, '<li>$1</li>')
      .replace(/(<li>.*<\/li>)/s, '<ul>$1</ul>')
      .replace(/\n\n/g, '</p><p>')
      .replace(/^(.+)$/gim, '<p>$1</p>')
      .replace(/<p><h/g, '<h')
      .replace(/<\/h[1-6]><\/p>/g, (match) => match.replace('<p>', '').replace('</p>', ''))
      .replace(/<p><ul>/g, '<ul>')
      .replace(/<\/ul><\/p>/g, '</ul>');
  };

  return (
    <div className="min-h-screen bg-background">
      <PrimaryNav />
      <div className="flex relative">
        <ProjectSidebar projectId={projectId || ""} isOpen={isSidebarOpen} onOpenChange={setIsSidebarOpen} />
        <main className="flex-1 w-full p-4 md:p-8">
          <div className="max-w-6xl mx-auto space-y-6">
            <ProjectPageHeader
              title="Project Specifications"
              subtitle="Generate comprehensive documentation with AI and export in multiple formats"
              onMenuClick={() => setIsSidebarOpen(true)}
            />

            {/* Step 1: Select Project Content */}
            <Card>
              <CardHeader>
                <CardTitle>Select Project Content</CardTitle>
                <CardDescription>
                  Choose which project elements to include in your specification
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-3">
                  <Button
                    onClick={() => setIsSelectorOpen(true)}
                    size="lg"
                    className="w-full"
                  >
                    <Sparkles className="h-4 w-4 mr-2" />
                    {selectedContent ? "Update Content Selection" : "Select Content to Include"}
                  </Button>
                  
                  {/* Show selected content summary */}
                  {selectedContent && (
                    <div className="p-3 bg-muted/50 rounded-md space-y-1 text-sm">
                      <p className="font-medium">Selected Content:</p>
                      <ul className="list-disc list-inside space-y-0.5 text-muted-foreground">
                        {selectedContent.projectMetadata && <li>Project Settings & Metadata</li>}
                        {selectedContent.requirements.length > 0 && (
                          <li>Requirements ({selectedContent.requirements.length} items)</li>
                        )}
                        {selectedContent.standards.length > 0 && (
                          <li>Standards ({selectedContent.standards.length} items)</li>
                        )}
                        {selectedContent.techStacks.length > 0 && (
                          <li>Tech Stacks ({selectedContent.techStacks.length} items)</li>
                        )}
                        {selectedContent.canvasNodes.length > 0 && (
                          <li>Canvas Nodes ({selectedContent.canvasNodes.length} items)</li>
                        )}
                        {selectedContent.canvasEdges.length > 0 && (
                          <li>Canvas Edges ({selectedContent.canvasEdges.length} items)</li>
                        )}
                        {selectedContent.canvasLayers.length > 0 && (
                          <li>Canvas Layers ({selectedContent.canvasLayers.length} items)</li>
                        )}
                        {selectedContent.artifacts.length > 0 && (
                          <li>Artifacts ({selectedContent.artifacts.length} items)</li>
                        )}
                        {selectedContent.chatSessions.length > 0 && (
                          <li>Chat Sessions ({selectedContent.chatSessions.length} items)</li>
                        )}
                      </ul>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Step 2: Download Project Content */}
            <Card>
              <CardHeader>
                <CardTitle>Download Project Content</CardTitle>
                <CardDescription>
                  Export selected project data in various formats
                </CardDescription>
              </CardHeader>
              <CardContent>
                <DownloadOptions 
                  projectId={projectId || ""}
                  projectName={projectName}
                  shareToken={shareToken}
                  hasGeneratedSpec={hasGeneratedSpec}
                  selectedContent={selectedContent}
                />
              </CardContent>
            </Card>

            {/* Step 3: AI Analysis */}
            <Card>
              <CardHeader>
                <CardTitle>AI Analysis</CardTitle>
                <CardDescription>
                  Generate an AI-powered analysis document from selected content
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <Accordion type="single" collapsible>
                  <AccordionItem value="prompt">
                    <AccordionTrigger>System Prompt</AccordionTrigger>
                    <AccordionContent>
                      <div className="space-y-2">
                        <p className="text-sm text-muted-foreground">
                          Customize how the AI generates your analysis document:
                        </p>
                        <Textarea
                          value={systemPrompt}
                          onChange={(e) => setSystemPrompt(e.target.value)}
                          rows={12}
                          className="font-mono text-sm"
                        />
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setSystemPrompt(DEFAULT_SYSTEM_PROMPT)}
                        >
                          Reset to Default
                        </Button>
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                </Accordion>

                <Button
                  onClick={generateSpecification}
                  disabled={isGenerating || !projectSettings || !hasSelectedContent()}
                  size="lg"
                  className="w-full"
                >
                  {isGenerating ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Generating...
                    </>
                  ) : (
                    <>
                      <Sparkles className="h-4 w-4 mr-2" />
                      Generate Analysis
                    </>
                  )}
                </Button>
              </CardContent>
            </Card>

            {/* Generated Specification Results */}
            {(generatedSpec || isGenerating) && (
              <Card>
                <CardHeader>
                  <div className="flex justify-between items-start">
                    <div>
                      <CardTitle>Generated Specification</CardTitle>
                      <CardDescription>
                        AI-generated documentation ready for download
                      </CardDescription>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        onClick={downloadAsHTML}
                        disabled={!generatedSpec}
                      >
                        <FileText className="h-4 w-4 mr-2" />
                        Word
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => {
                          const blob = new Blob([generatedSpec], { type: "text/markdown" });
                          const url = URL.createObjectURL(blob);
                          const a = document.createElement("a");
                          a.href = url;
                          a.download = `${projectName.replace(/\s+/g, '-')}-specification.md`;
                          document.body.appendChild(a);
                          a.click();
                          document.body.removeChild(a);
                          URL.revokeObjectURL(url);
                          toast.success("Markdown downloaded!");
                        }}
                        disabled={!generatedSpec}
                      >
                        <FileJson className="h-4 w-4 mr-2" />
                        Markdown
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <Tabs defaultValue="preview" className="w-full">
                    <TabsList>
                      <TabsTrigger value="preview">Preview</TabsTrigger>
                      <TabsTrigger value="markdown">Source</TabsTrigger>
                    </TabsList>

                <TabsContent value="preview">
                  <Card>
                    <CardContent className="p-6">
                      <ScrollArea className="h-[calc(100vh-20rem)]">
                        {isGenerating && !generatedSpec ? (
                          <div className="flex items-center justify-center py-12">
                            <Loader2 className="h-8 w-8 animate-spin text-primary" />
                          </div>
                        ) : (
                          <div className="prose prose-slate dark:prose-invert max-w-none">
                            <ReactMarkdown remarkPlugins={[remarkGfm]}>
                              {generatedSpec}
                            </ReactMarkdown>
                          </div>
                        )}
                      </ScrollArea>
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent value="markdown">
                  <Card>
                    <CardContent className="p-6">
                      <ScrollArea className="h-[calc(100vh-20rem)]">
                        {isGenerating && !generatedSpec ? (
                          <div className="flex items-center justify-center py-12">
                            <Loader2 className="h-8 w-8 animate-spin text-primary" />
                          </div>
                        ) : (
                          <pre className="text-sm bg-muted p-4 rounded-lg overflow-x-auto">
                            {generatedSpec}
                          </pre>
                        )}
                      </ScrollArea>
                    </CardContent>
                  </Card>
                </TabsContent>
                  </Tabs>
                </CardContent>
              </Card>
            )}
          </div>
        </main>
      </div>

      <ProjectSelector
        projectId={projectId || ""}
        shareToken={shareToken}
        open={isSelectorOpen}
        onClose={() => setIsSelectorOpen(false)}
        onConfirm={handleProjectSelection}
      />
    </div>
  );
}
