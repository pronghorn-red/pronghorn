import { useState, useEffect, useMemo } from "react";
import { useParams, useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Download, FileText, Code, Globe, ExternalLink } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import Editor from "@monaco-editor/react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface PublishedArtifact {
  id: string;
  project_id: string;
  content: string;
  ai_title: string | null;
  ai_summary: string | null;
  source_type: string | null;
  image_url: string | null;
  is_folder: boolean;
  created_at: string;
  updated_at: string;
}

export default function Viewer() {
  const { artifactId } = useParams<{ artifactId: string }>();
  const location = useLocation();
  const [artifact, setArtifact] = useState<PublishedArtifact | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"preview" | "source" | "html">("preview");

  // Determine which view mode based on URL path
  const isRawMode = location.pathname.endsWith("/raw");
  const isBinaryMode = location.pathname.endsWith("/binary");

  // Detect if content is HTML
  const isHtmlContent = useMemo(() => {
    if (!artifact?.content) return false;
    const trimmed = artifact.content.trim().toLowerCase();
    return (
      trimmed.startsWith("<!doctype html") ||
      trimmed.startsWith("<html") ||
      (trimmed.includes("<head") && trimmed.includes("<body"))
    );
  }, [artifact?.content]);

  // Fetch the published artifact
  const fetchArtifact = async () => {
    if (!artifactId) return;

    try {
      setIsLoading(true);
      setError(null);

      const { data, error: fetchError } = await supabase.rpc("get_published_artifact", {
        p_artifact_id: artifactId,
      });

      if (fetchError) throw fetchError;

      if (!data || data.length === 0) {
        setError("Artifact not found or not published");
        return;
      }

      const fetchedArtifact = data[0];
      setArtifact(fetchedArtifact);
      
      // Set initial view mode based on content - detect HTML inline
      const content = fetchedArtifact.content?.trim().toLowerCase() || "";
      const hasHtmlContent = 
        content.startsWith("<!doctype html") ||
        content.startsWith("<html") ||
        (content.includes("<head") && content.includes("<body"));
      
      if (hasHtmlContent) {
        setViewMode("html");
      }
    } catch (err: any) {
      console.error("Error fetching published artifact:", err);
      setError(err.message || "Failed to load artifact");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchArtifact();
  }, [artifactId]);

  // Set up real-time subscription for updates
  useEffect(() => {
    if (!artifactId) return;

    const channel = supabase
      .channel(`published-artifact-${artifactId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "artifacts",
          filter: `id=eq.${artifactId}`,
        },
        (payload) => {
          console.log("Artifact updated:", payload);
          // Check if still published
          if (payload.new && (payload.new as any).is_published) {
            setArtifact((prev) =>
              prev
                ? {
                    ...prev,
                    content: (payload.new as any).content ?? prev.content,
                    ai_title: (payload.new as any).ai_title ?? prev.ai_title,
                    ai_summary: (payload.new as any).ai_summary ?? prev.ai_summary,
                    updated_at: (payload.new as any).updated_at ?? prev.updated_at,
                  }
                : null
            );
            toast.info("Content updated", { duration: 2000 });
          } else {
            // Artifact was unpublished
            setError("This artifact is no longer published");
            setArtifact(null);
          }
        }
      )
      .on(
        "postgres_changes",
        {
          event: "DELETE",
          schema: "public",
          table: "artifacts",
          filter: `id=eq.${artifactId}`,
        },
        () => {
          setError("This artifact has been deleted");
          setArtifact(null);
        }
      )
      .subscribe((status) => {
        console.log("Viewer realtime status:", status);
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [artifactId]);

  // Handle download
  const handleDownload = () => {
    if (!artifact) return;
    
    const blob = new Blob([artifact.content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${artifact.ai_title || "artifact"}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Raw mode - just return plain text
  if (isRawMode) {
    if (isLoading) {
      return <pre className="p-4 font-mono text-sm">Loading...</pre>;
    }
    if (error || !artifact) {
      return <pre className="p-4 font-mono text-sm text-destructive">{error || "Not found"}</pre>;
    }
    return (
      <pre className="p-4 font-mono text-sm whitespace-pre-wrap break-words">
        {artifact.content}
      </pre>
    );
  }

  // Binary mode - redirect to image or show error
  if (isBinaryMode) {
    if (isLoading) {
      return (
        <div className="flex items-center justify-center min-h-screen bg-background">
          <p className="text-muted-foreground">Loading...</p>
        </div>
      );
    }
    if (error || !artifact) {
      return (
        <div className="flex items-center justify-center min-h-screen bg-background">
          <p className="text-destructive">{error || "Not found"}</p>
        </div>
      );
    }
    if (artifact.image_url) {
      // Redirect to the image URL
      window.location.href = artifact.image_url;
      return null;
    }
    return (
      <div className="flex items-center justify-center min-h-screen bg-background">
        <p className="text-muted-foreground">No binary content available for this artifact</p>
      </div>
    );
  }

  // Full viewer mode
  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="border-b bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="container max-w-6xl mx-auto px-4 py-3">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3 min-w-0">
              <a 
                href="https://pronghorn.red" 
                target="_blank" 
                rel="noopener noreferrer"
                className="flex items-center gap-2 text-primary hover:opacity-80 transition-opacity shrink-0"
              >
                <div className="w-8 h-8 rounded bg-primary/10 flex items-center justify-center">
                  <FileText className="h-4 w-4 text-primary" />
                </div>
                <span className="font-semibold hidden sm:inline">Pronghorn</span>
              </a>
              {!isLoading && artifact && (
                <div className="h-6 w-px bg-border shrink-0" />
              )}
              <h1 className="text-lg font-medium truncate">
                {isLoading ? (
                  <Skeleton className="h-6 w-48" />
                ) : artifact?.ai_title || "Untitled Artifact"}
              </h1>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Button 
                variant="outline" 
                size="sm"
                onClick={handleDownload}
                disabled={!artifact}
              >
                <Download className="h-4 w-4 mr-2" />
                <span className="hidden sm:inline">Download</span>
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="flex-1 container max-w-6xl mx-auto px-4 py-6">
        {isLoading ? (
          <Card>
            <CardContent className="p-6">
              <div className="space-y-4">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-64 w-full" />
              </div>
            </CardContent>
          </Card>
        ) : error ? (
          <Card>
            <CardContent className="p-12 text-center">
              <div className="text-destructive mb-2">
                <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
              </div>
              <h2 className="text-xl font-semibold mb-2">Artifact Unavailable</h2>
              <p className="text-muted-foreground">{error}</p>
            </CardContent>
          </Card>
        ) : artifact ? (
          <div className="space-y-4">
            {/* View mode tabs */}
            <Card>
              <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as typeof viewMode)}>
                <div className="border-b px-4 py-2">
                  <TabsList className="h-8">
                    <TabsTrigger value="preview" className="text-xs h-7 px-3">
                      <FileText className="h-3 w-3 mr-1.5" />
                      Preview
                    </TabsTrigger>
                    <TabsTrigger value="source" className="text-xs h-7 px-3">
                      <Code className="h-3 w-3 mr-1.5" />
                      Source
                    </TabsTrigger>
                    {isHtmlContent && (
                      <TabsTrigger value="html" className="text-xs h-7 px-3">
                        <Globe className="h-3 w-3 mr-1.5" />
                        HTML
                      </TabsTrigger>
                    )}
                  </TabsList>
                </div>

                <CardContent className="p-0">
                  <TabsContent value="preview" className="m-0">
                    <ScrollArea className="h-[calc(100vh-280px)]">
                      <div className="p-6">
                        {artifact.ai_summary && (
                          <div className="mb-6 p-4 bg-muted/50 rounded-lg border">
                            <h3 className="text-sm font-medium mb-2 text-muted-foreground">Summary</h3>
                            <div className="prose prose-sm dark:prose-invert max-w-none">
                              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                {artifact.ai_summary}
                              </ReactMarkdown>
                            </div>
                          </div>
                        )}
                        {artifact.image_url && (
                          <div className="mb-6">
                            <img 
                              src={artifact.image_url} 
                              alt={artifact.ai_title || "Artifact image"}
                              className="max-w-full rounded-lg border"
                            />
                          </div>
                        )}
                        <div className="prose prose-sm dark:prose-invert max-w-none">
                          <ReactMarkdown remarkPlugins={[remarkGfm]}>
                            {artifact.content}
                          </ReactMarkdown>
                        </div>
                      </div>
                    </ScrollArea>
                  </TabsContent>

                  <TabsContent value="source" className="m-0">
                    <div className="h-[calc(100vh-280px)]">
                      <Editor
                        height="100%"
                        language="markdown"
                        value={artifact.content}
                        theme="vs-dark"
                        options={{
                          readOnly: true,
                          minimap: { enabled: false },
                          lineNumbers: "on",
                          wordWrap: "on",
                          scrollBeyondLastLine: false,
                          fontSize: 13,
                        }}
                      />
                    </div>
                  </TabsContent>

                  {isHtmlContent && (
                    <TabsContent value="html" className="m-0">
                      <div className="h-[calc(100vh-280px)] bg-white">
                        <iframe
                          srcDoc={artifact.content}
                          title="HTML Preview"
                          className="w-full h-full border-0"
                          sandbox="allow-scripts allow-same-origin"
                        />
                      </div>
                    </TabsContent>
                  )}
                </CardContent>
              </Tabs>
            </Card>

            {/* Footer info */}
            <div className="text-center text-xs text-muted-foreground">
              <p>
                Published from{" "}
                <a 
                  href="https://pronghorn.red" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="text-primary hover:underline inline-flex items-center gap-1"
                >
                  Pronghorn.RED
                  <ExternalLink className="h-3 w-3" />
                </a>
              </p>
            </div>
          </div>
        ) : null}
      </main>
    </div>
  );
}
