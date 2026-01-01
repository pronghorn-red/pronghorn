import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import { ScanEye, CheckCircle2, XCircle, Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";

const DEFAULT_PROMPT = `You are an expert document OCR and analysis system. Analyze this image and extract ALL visible text content.

## Text Extraction Instructions:
1. Extract ALL visible text exactly as it appears
2. Maintain the original reading order (top-to-bottom, left-to-right for Western documents)
3. Preserve paragraph breaks and logical groupings
4. For tables, format as Markdown tables when possible
5. For lists, use appropriate Markdown list formatting (- or 1. 2. 3.)
6. For headings/titles, use Markdown heading levels (# ## ###)

## Non-Text Elements:
For diagrams, charts, images, or other non-text elements, provide brief descriptions:
[IMAGE: Description of what the image shows]
[CHART: Type of chart and what data it represents]
[DIAGRAM: What the diagram illustrates]

## Output Format:
- Return clean, well-formatted Markdown
- Do not add commentary or explanations about the extraction process
- Do not wrap the entire output in code blocks
- Just return the extracted content directly`;

interface Artifact {
  id: string;
  content: string;
  ai_title?: string | null;
  image_url?: string | null;
  provenance_id?: string | null;
  provenance_page?: number | null;
  provenance_total_pages?: number | null;
}

interface VisualRecognitionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  artifacts: Artifact[];
  projectId: string;
  shareToken: string | null;
  onComplete: () => void;
}

type ProcessingStatus = 'idle' | 'processing' | 'complete' | 'error';

interface ProcessingResult {
  id: string;
  success: boolean;
  content?: string;
  error?: string;
}

export function VisualRecognitionDialog({
  open,
  onOpenChange,
  artifacts,
  projectId,
  shareToken,
  onComplete,
}: VisualRecognitionDialogProps) {
  const [selectedModel, setSelectedModel] = useState("gemini-2.5-flash");
  const [selectedArtifacts, setSelectedArtifacts] = useState<Set<string>>(new Set());
  const [status, setStatus] = useState<ProcessingStatus>('idle');
  const [progress, setProgress] = useState(0);
  const [totalToProcess, setTotalToProcess] = useState(0);
  const [results, setResults] = useState<ProcessingResult[]>([]);
  const [currentBatch, setCurrentBatch] = useState<string[]>([]);
  const [mode, setMode] = useState<"replace" | "augment">("replace");
  const [prompt, setPrompt] = useState(DEFAULT_PROMPT);

  // Filter only artifacts with images
  const imageArtifacts = artifacts.filter(a => !!a.image_url);

  // Reset state when dialog opens
  useEffect(() => {
    if (open) {
      setStatus('idle');
      setProgress(0);
      setResults([]);
      setCurrentBatch([]);
      setMode("replace");
      setPrompt(DEFAULT_PROMPT);
      // Pre-select all image artifacts
      setSelectedArtifacts(new Set(imageArtifacts.map(a => a.id)));
    }
  }, [open]);

  const handleSelectAll = () => {
    if (selectedArtifacts.size === imageArtifacts.length) {
      setSelectedArtifacts(new Set());
    } else {
      setSelectedArtifacts(new Set(imageArtifacts.map(a => a.id)));
    }
  };

  const handleToggleArtifact = (id: string) => {
    const newSelected = new Set(selectedArtifacts);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedArtifacts(newSelected);
  };

  const resetPrompt = () => {
    setPrompt(DEFAULT_PROMPT);
  };

  const handleProcess = async () => {
    if (selectedArtifacts.size === 0) {
      toast.error("Please select at least one artifact to process");
      return;
    }

    setStatus('processing');
    setProgress(0);
    setTotalToProcess(selectedArtifacts.size);
    setResults([]);

    try {
      const response = await fetch(
        `https://obkzdksfayygnrzdqoam.supabase.co/functions/v1/visual-recognition`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9ia3pka3NmYXl5Z25yemRxb2FtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjM0MTA4MzcsImV4cCI6MjA3ODk4NjgzN30.xOKphCiEilzPTo9EGHNJqAJfruM_bijI9PN3BQBF-z8`,
          },
          body: JSON.stringify({
            artifactIds: Array.from(selectedArtifacts),
            projectId,
            shareToken,
            model: selectedModel,
            prompt,
            mode,
          }),
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to process artifacts");
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value, { stream: true });
          buffer += chunk;

          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;

            const data = line.slice(6).trim();
            if (!data) continue;

            try {
              const parsed = JSON.parse(data);

              if (parsed.type === 'start') {
                setTotalToProcess(parsed.total);
              } else if (parsed.type === 'progress') {
                setProgress(parsed.processed);
                setCurrentBatch(parsed.currentBatch || []);
              } else if (parsed.type === 'complete') {
                setProgress(parsed.processed);
                setStatus('complete');
                toast.success(`Processed ${parsed.successful} artifacts successfully`);
                if (parsed.failed > 0) {
                  toast.warning(`${parsed.failed} artifacts failed to process`);
                }
              } else if (parsed.type === 'error') {
                throw new Error(parsed.error);
              } else if (parsed.id) {
                // Individual result
                setResults(prev => [...prev, parsed]);
                setProgress(prev => prev + 1);
              }
            } catch (e) {
              console.error("Error parsing stream line:", e);
            }
          }
        }
      }
    } catch (error) {
      console.error("Visual recognition error:", error);
      setStatus('error');
      toast.error(error instanceof Error ? error.message : "Processing failed");
    }
  };

  const handleConfirm = () => {
    onComplete();
    onOpenChange(false);
  };

  const handleReprocess = () => {
    setStatus('idle');
    setProgress(0);
    setResults([]);
    setCurrentBatch([]);
  };

  const getArtifactTitle = (artifact: Artifact) => {
    if (artifact.ai_title) return artifact.ai_title;
    if (artifact.provenance_page && artifact.provenance_total_pages) {
      return `Page ${artifact.provenance_page} of ${artifact.provenance_total_pages}`;
    }
    return "Untitled";
  };

  const getResultIcon = (artifactId: string) => {
    const result = results.find(r => r.id === artifactId);
    if (!result) {
      if (currentBatch.includes(artifactId)) {
        return <Loader2 className="h-4 w-4 animate-spin text-primary" />;
      }
      return null;
    }
    return result.success ? (
      <CheckCircle2 className="h-4 w-4 text-green-500" />
    ) : (
      <XCircle className="h-4 w-4 text-destructive" />
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100%-50px)] h-[calc(100vh-50px)] max-w-none flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ScanEye className="h-5 w-5" />
            Visual Recognition (OCR)
          </DialogTitle>
          <DialogDescription>
            Extract text content from artifact images using Gemini Vision AI
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 grid grid-cols-1 lg:grid-cols-3 gap-6 overflow-hidden">
          {/* Left Column: Configuration */}
          <div className="space-y-4 overflow-y-auto pr-2">
            {/* Model Selection */}
            <div className="space-y-2">
              <Label>AI Model</Label>
              <Select
                value={selectedModel}
                onValueChange={setSelectedModel}
                disabled={status === 'processing'}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="gemini-2.5-flash">
                    Gemini 2.5 Flash (Recommended)
                  </SelectItem>
                  <SelectItem value="gemini-2.5-pro">
                    Gemini 2.5 Pro
                  </SelectItem>
                  <SelectItem value="gemini-3-flash-preview">
                    Gemini 3 Flash Preview
                  </SelectItem>
                  <SelectItem value="gemini-3-pro-preview">
                    Gemini 3 Pro Preview
                  </SelectItem>
                  <SelectItem value="gemini-3-pro-image-preview">
                    Gemini 3 Pro Image Preview
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Content Mode */}
            <div className="space-y-2">
              <Label>Content Mode</Label>
              <RadioGroup
                value={mode}
                onValueChange={(v) => setMode(v as "replace" | "augment")}
                disabled={status === 'processing'}
                className="flex gap-4"
              >
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="replace" id="mode-replace" />
                  <Label htmlFor="mode-replace" className="font-normal cursor-pointer">
                    Replace existing text
                  </Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="augment" id="mode-augment" />
                  <Label htmlFor="mode-augment" className="font-normal cursor-pointer">
                    Augment existing text
                  </Label>
                </div>
              </RadioGroup>
              <p className="text-xs text-muted-foreground">
                {mode === "replace" 
                  ? "The extracted text will replace any existing content in the artifact."
                  : "The extracted text will be appended to the existing content."}
              </p>
            </div>

            {/* OCR Prompt */}
            <div className="space-y-2 flex-1">
              <div className="flex items-center justify-between">
                <Label>OCR Prompt</Label>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={resetPrompt}
                  disabled={status === 'processing' || prompt === DEFAULT_PROMPT}
                  className="h-7 text-xs"
                >
                  <RefreshCw className="h-3 w-3 mr-1" />
                  Reset to Default
                </Button>
              </div>
              <Textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                disabled={status === 'processing'}
                className="h-[200px] text-sm font-mono resize-none"
                placeholder="Enter custom OCR instructions..."
              />
            </div>
          </div>

          {/* Middle Column: Artifact Selection */}
          <div className="space-y-4 overflow-hidden flex flex-col">
            <div className="space-y-2 flex-1 overflow-hidden flex flex-col">
              <div className="flex items-center justify-between">
                <Label>Select Artifacts ({selectedArtifacts.size} of {imageArtifacts.length})</Label>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleSelectAll}
                  disabled={status === 'processing'}
                >
                  {selectedArtifacts.size === imageArtifacts.length ? "Deselect All" : "Select All"}
                </Button>
              </div>
              
              {imageArtifacts.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground border rounded-md">
                  No artifacts with images found
                </div>
              ) : (
                <ScrollArea className="flex-1 border rounded-md p-3">
                  <div className="space-y-2">
                    {imageArtifacts.map((artifact) => (
                      <div
                        key={artifact.id}
                        className="flex items-center gap-3 p-2 rounded-md hover:bg-muted/50"
                      >
                        <Checkbox
                          id={artifact.id}
                          checked={selectedArtifacts.has(artifact.id)}
                          onCheckedChange={() => handleToggleArtifact(artifact.id)}
                          disabled={status === 'processing'}
                        />
                        <img
                          src={artifact.image_url!}
                          alt={getArtifactTitle(artifact)}
                          className="w-12 h-12 object-cover rounded border"
                        />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">
                            {getArtifactTitle(artifact)}
                          </p>
                          {artifact.provenance_page && artifact.provenance_total_pages && (
                            <Badge variant="secondary" className="text-xs">
                              Page {artifact.provenance_page}/{artifact.provenance_total_pages}
                            </Badge>
                          )}
                        </div>
                        <div className="shrink-0">
                          {getResultIcon(artifact.id)}
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              )}
            </div>

            {/* Progress */}
            {status === 'processing' && (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span>Processing...</span>
                  <span>{progress} / {totalToProcess}</span>
                </div>
                <Progress value={(progress / totalToProcess) * 100} />
              </div>
            )}
          </div>

          {/* Right Column: Results Preview */}
          <div className="space-y-4 overflow-hidden flex flex-col">
            <Label>Extracted Text Preview</Label>
            {status === 'idle' && (
              <div className="flex-1 flex items-center justify-center text-muted-foreground border rounded-md p-4">
                <p className="text-sm text-center">
                  Select artifacts and click "Process" to extract text
                </p>
              </div>
            )}
            {status === 'processing' && (
              <div className="flex-1 flex items-center justify-center text-muted-foreground border rounded-md p-4">
                <div className="text-center">
                  <Loader2 className="h-8 w-8 animate-spin mx-auto mb-2" />
                  <p className="text-sm">Processing artifacts...</p>
                </div>
              </div>
            )}
            {(status === 'complete' || status === 'error') && (
              <ScrollArea className="flex-1 border rounded-md">
                <div className="p-3 space-y-4">
                  {results.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-4">
                      No results yet
                    </p>
                  ) : (
                    results.map((result) => {
                      const artifact = imageArtifacts.find(a => a.id === result.id);
                      return (
                        <div key={result.id} className="border rounded-md p-3 space-y-2">
                          <div className="flex items-center gap-2">
                            {result.success ? (
                              <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
                            ) : (
                              <XCircle className="h-4 w-4 text-destructive shrink-0" />
                            )}
                            <span className="text-sm font-medium truncate">
                              {artifact ? getArtifactTitle(artifact) : result.id}
                            </span>
                          </div>
                          {result.success && result.content ? (
                            <pre className="text-xs bg-muted p-2 rounded whitespace-pre-wrap">
                              {result.content}
                            </pre>
                          ) : result.error ? (
                            <p className="text-xs text-destructive">{result.error}</p>
                          ) : null}
                        </div>
                      );
                    })
                  )}
                </div>
              </ScrollArea>
            )}
            
            {/* Results Summary */}
            {status === 'complete' && results.length > 0 && (
              <div className="p-3 bg-muted rounded-md shrink-0">
                <p className="text-sm font-medium">
                  Processing Complete
                </p>
                <p className="text-sm text-muted-foreground">
                  {results.filter(r => r.success).length} successful,{" "}
                  {results.filter(r => !r.success).length} failed
                </p>
              </div>
            )}
          </div>
        </div>

        <DialogFooter className="flex-shrink-0">
          {status === 'complete' ? (
            <>
              <Button
                variant="outline"
                onClick={handleReprocess}
              >
                <RefreshCw className="h-4 w-4 mr-2" />
                Reprocess
              </Button>
              <Button
                variant="outline"
                onClick={() => onOpenChange(false)}
              >
                Close
              </Button>
              <Button onClick={handleConfirm}>
                <CheckCircle2 className="h-4 w-4 mr-2" />
                Confirm
              </Button>
            </>
          ) : (
            <>
              <Button
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={status === 'processing'}
              >
                Cancel
              </Button>
              <Button
                onClick={handleProcess}
                disabled={status === 'processing' || selectedArtifacts.size === 0}
              >
                {status === 'processing' ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Processing...
                  </>
                ) : (
                  <>
                    <ScanEye className="h-4 w-4 mr-2" />
                    Extract Text ({selectedArtifacts.size})
                  </>
                )}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
