import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { PrimaryNav } from "@/components/layout/PrimaryNav";
import { ProjectSidebar } from "@/components/layout/ProjectSidebar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, Sparkles, FileText, FileJson } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import ReactMarkdown from "react-markdown";
import { useShareToken } from "@/hooks/useShareToken";
import { DownloadOptions } from "@/components/specifications/DownloadOptions";

export default function Specifications() {
  const { projectId } = useParams();
  const { token: shareToken, isTokenSet } = useShareToken(projectId);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [generatedSpec, setGeneratedSpec] = useState<string>("");
  const [rawData, setRawData] = useState<any>(null);
  const [projectName, setProjectName] = useState<string>("project");
  const [hasGeneratedSpec, setHasGeneratedSpec] = useState(false);

  // Load saved specification and project name
  useEffect(() => {
    const loadData = async () => {
      if (!projectId || !isTokenSet) return;

      // Load project name
      const { data: project } = await supabase
        .from('projects')
        .select('name')
        .eq('id', projectId)
        .single();
      
      if (project) {
        setProjectName(project.name);
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
          <ProjectSidebar projectId={projectId!} />
          <main className="flex-1 w-full flex items-center justify-center">
            <p>Loading...</p>
          </main>
        </div>
      </div>
    );
  }

  const generateSpecification = async () => {
    if (!projectId) return;

    setIsGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke("generate-specification", {
        body: { 
          projectId,
          shareToken 
        }
      });

      if (error) throw error;

      setGeneratedSpec(data.generatedSpecification);
      setRawData(data.rawData);
      setHasGeneratedSpec(true);
      toast.success("Specification generated and saved successfully!");
    } catch (error) {
      console.error("Error generating specification:", error);
      toast.error(error instanceof Error ? error.message : "Failed to generate specification");
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
        <ProjectSidebar projectId={projectId || ""} />
        <main className="flex-1 w-full p-8">
          <div className="max-w-6xl mx-auto space-y-6">
            <div className="flex justify-between items-center">
              <div>
                <h1 className="text-3xl font-bold mb-2">Project Specifications</h1>
                <p className="text-muted-foreground">
                  Generate comprehensive documentation with AI and export in multiple formats
                </p>
              </div>
              <Button
                onClick={generateSpecification}
                disabled={isGenerating}
                size="lg"
              >
                {isGenerating ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Generating...
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4 mr-2" />
                    Generate Specification
                  </>
                )}
              </Button>
            </div>

            {/* Download Options with Checkboxes */}
            <DownloadOptions 
              projectId={projectId || ""}
              projectName={projectName}
              shareToken={shareToken}
              hasGeneratedSpec={hasGeneratedSpec}
            />

            {!generatedSpec && !isGenerating && (
              <Card>
                <CardHeader>
                  <CardTitle>AI-Generated Documentation</CardTitle>
                  <CardDescription>
                    Click "Generate Specification" to create a comprehensive project documentation with AI
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <h3 className="font-semibold mb-2">What will be included:</h3>
                    <ul className="list-disc list-inside space-y-2 text-muted-foreground">
                      <li>AI-generated executive summary and overview</li>
                      <li>Complete requirements hierarchy (Epics, Features, Stories)</li>
                      <li>Architecture canvas with all nodes and connections</li>
                      <li>Technology stack details</li>
                      <li>Linked standards and compliance information</li>
                      <li>Component inventory by type</li>
                      <li>Integration points and recommendations</li>
                    </ul>
                  </div>
                  <div>
                    <h3 className="font-semibold mb-2">Export Formats:</h3>
                    <ul className="list-disc list-inside space-y-2 text-muted-foreground">
                      <li><strong>HTML/Word:</strong> Formatted document (open in Word or convert to PDF)</li>
                      <li><strong>JSON:</strong> AI-processed specification data</li>
                    </ul>
                  </div>
                </CardContent>
              </Card>
            )}

            {(generatedSpec || isGenerating) && (
              <Tabs defaultValue="preview" className="w-full">
                <div className="flex justify-between items-center mb-4">
                  <TabsList>
                    <TabsTrigger value="preview">Preview</TabsTrigger>
                    <TabsTrigger value="markdown">Markdown</TabsTrigger>
                  </TabsList>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      onClick={downloadAsHTML}
                      disabled={!generatedSpec}
                    >
                      <FileText className="h-4 w-4 mr-2" />
                      Download HTML/Word
                    </Button>
                    <Button
                      variant="outline"
                      onClick={downloadAsJSON}
                      disabled={!rawData}
                    >
                      <FileJson className="h-4 w-4 mr-2" />
                      Download JSON
                    </Button>
                  </div>
                </div>

                <TabsContent value="preview">
                  <Card>
                    <CardContent className="p-6">
                      <ScrollArea className="h-[calc(100vh-20rem)]">
                        {isGenerating ? (
                          <div className="flex items-center justify-center py-12">
                            <Loader2 className="h-8 w-8 animate-spin text-primary" />
                          </div>
                        ) : (
                          <div className="prose prose-slate max-w-none">
                            <ReactMarkdown>{generatedSpec}</ReactMarkdown>
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
                        {isGenerating ? (
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
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
