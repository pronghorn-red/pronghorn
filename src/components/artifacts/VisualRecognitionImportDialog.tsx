import { useState } from "react";
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
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { ScanEye, CheckCircle2, XCircle, Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";

// Default OCR extraction prompt
const DEFAULT_PROMPT = `You are an expert document OCR and analysis system. Analyze this image and extract ALL content.

## Instructions:
1. Extract all visible text exactly as it appears, maintaining formatting in Markdown
2. For tables, use Markdown table syntax
3. For lists, use appropriate Markdown list formatting
4. For headings, use Markdown heading levels (# ## ###)

## Non-Text Elements:
For any non-text elements, provide detailed descriptions in this format:

[IMAGE: Description of photograph or illustration]
[CHART: Type of chart, title, key data points, axes labels]
[DIAGRAM: Type of diagram, components, relationships shown]
[GRAPH: Type of graph, what it represents, trends shown]
[MAP: Geographic area, features shown, legend items]
[FLOWCHART: Process name, steps, decision points]
[TABLE: If complex table that can't be represented in Markdown]

## Output:
Return the content in reading order (top-to-bottom, left-to-right for Western documents).
Preserve paragraph breaks and formatting as much as possible.`;

export interface RasterizedImage {
  id: string;
  imageBase64: string;
  imageMimeType: string;
  existingText: string;
  label: string; // e.g., "Slide 1", "Page 3"
}

interface VisualRecognitionImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  images: RasterizedImage[];
  onComplete: (results: Map<string, string>) => void; // Map of id -> new content
}

type ProcessingStatus = 'idle' | 'processing' | 'complete' | 'error';

interface ProcessingResult {
  id: string;
  success: boolean;
  content?: string;
  error?: string;
}

export function VisualRecognitionImportDialog({
  open,
  onOpenChange,
  images,
  onComplete,
}: VisualRecognitionImportDialogProps) {
  const [selectedModel, setSelectedModel] = useState("gemini-2.5-flash");
  const [mode, setMode] = useState<"replace" | "augment">("replace");
  const [prompt, setPrompt] = useState(DEFAULT_PROMPT);
  const [status, setStatus] = useState<ProcessingStatus>('idle');
  const [progress, setProgress] = useState(0);
  const [totalToProcess, setTotalToProcess] = useState(0);
  const [results, setResults] = useState<ProcessingResult[]>([]);
  const [currentBatch, setCurrentBatch] = useState<string[]>([]);

  const handleProcess = async () => {
    if (images.length === 0) {
      toast.error("No images to process");
      return;
    }

    setStatus('processing');
    setProgress(0);
    setTotalToProcess(images.length);
    setResults([]);
    setCurrentBatch([]);

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
            images: images.map(img => ({
              id: img.id,
              base64: img.imageBase64,
              mimeType: img.imageMimeType,
              existingText: img.existingText,
            })),
            model: selectedModel,
            prompt,
            mode,
          }),
        }
      );

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to process images");
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      const allResults: ProcessingResult[] = [];

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
                
                // Build results map and call onComplete
                const resultsMap = new Map<string, string>();
                for (const result of allResults) {
                  if (result.success && result.content) {
                    resultsMap.set(result.id, result.content);
                  }
                }
                
                toast.success(`Processed ${parsed.successful} images successfully`);
                if (parsed.failed > 0) {
                  toast.warning(`${parsed.failed} images failed to process`);
                }
                
                onComplete(resultsMap);
              } else if (parsed.type === 'error') {
                throw new Error(parsed.error);
              } else if (parsed.id) {
                // Individual result
                allResults.push(parsed);
                setResults(prev => [...prev, parsed]);
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

  const resetPrompt = () => {
    setPrompt(DEFAULT_PROMPT);
  };

  const getResultIcon = (imageId: string) => {
    const result = results.find(r => r.id === imageId);
    if (!result) {
      if (currentBatch.includes(imageId)) {
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
      <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ScanEye className="h-5 w-5" />
            Visual Recognition (OCR)
          </DialogTitle>
          <DialogDescription>
            Extract text content from rasterized images using Gemini Vision AI before creating artifacts
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 space-y-4 overflow-hidden min-h-0">
          {/* Configuration Section */}
          <div className="grid grid-cols-2 gap-4">
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
                  <SelectItem value="gemini-2.0-flash">
                    Gemini 2.0 Flash
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Mode Selection */}
            <div className="space-y-2">
              <Label>Content Mode</Label>
              <RadioGroup
                value={mode}
                onValueChange={(v) => setMode(v as "replace" | "augment")}
                className="flex gap-4"
                disabled={status === 'processing'}
              >
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="replace" id="mode-replace" />
                  <Label htmlFor="mode-replace" className="text-sm cursor-pointer">
                    Replace text
                  </Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="augment" id="mode-augment" />
                  <Label htmlFor="mode-augment" className="text-sm cursor-pointer">
                    Augment text
                  </Label>
                </div>
              </RadioGroup>
            </div>
          </div>

          {/* Prompt Editor */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>OCR Prompt</Label>
              <Button
                variant="ghost"
                size="sm"
                onClick={resetPrompt}
                disabled={status === 'processing'}
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
              className="h-32 text-xs font-mono"
              placeholder="Enter custom OCR prompt..."
            />
          </div>

          {/* Images Preview */}
          <div className="space-y-2">
            <Label>Images to Process ({images.length})</Label>
            <ScrollArea className="h-[150px] border rounded-md p-3">
              <div className="grid grid-cols-4 gap-3">
                {images.map((img) => (
                  <div
                    key={img.id}
                    className="relative border rounded-md overflow-hidden bg-muted/30"
                  >
                    <img
                      src={`data:${img.imageMimeType};base64,${img.imageBase64}`}
                      alt={img.label}
                      className="w-full aspect-video object-contain"
                    />
                    <div className="absolute bottom-0 left-0 right-0 bg-background/80 px-1.5 py-0.5 text-xs truncate">
                      {img.label}
                    </div>
                    <div className="absolute top-1 right-1">
                      {getResultIcon(img.id)}
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
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

          {/* Results Summary */}
          {status === 'complete' && results.length > 0 && (
            <div className="p-3 bg-muted rounded-md">
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

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={status === 'processing'}
          >
            {status === 'complete' ? 'Close' : 'Cancel'}
          </Button>
          {status !== 'complete' && (
            <Button
              onClick={handleProcess}
              disabled={status === 'processing' || images.length === 0}
            >
              {status === 'processing' ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Processing...
                </>
              ) : (
                <>
                  <ScanEye className="h-4 w-4 mr-2" />
                  Process {images.length} Image{images.length !== 1 ? 's' : ''}
                </>
              )}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
