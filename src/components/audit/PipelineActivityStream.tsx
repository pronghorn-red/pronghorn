// Real-time pipeline activity stream showing step-by-step progress
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Button } from "@/components/ui/button";
import {
  Loader2,
  CheckCircle2,
  XCircle,
  Clock,
  ChevronDown,
  ChevronRight,
  Network,
  Brain,
  GitMerge,
  Grid3X3,
  CircleDot,
  RotateCcw,
} from "lucide-react";
import { useState } from "react";
import type { PipelineStep, PipelinePhase, PipelineStepId } from "@/hooks/useAuditPipeline";

interface PipelineActivityStreamProps {
  steps: PipelineStep[];
  isRunning: boolean;
  onRestartStep?: (stepId: PipelineStepId) => void;
}

const PHASE_ICONS: Record<PipelinePhase, React.ReactNode> = {
  idle: <Clock className="h-4 w-4" />,
  creating_nodes: <Network className="h-4 w-4" />,
  extracting_d1: <Brain className="h-4 w-4" />,
  extracting_d2: <Brain className="h-4 w-4" />,
  merging_concepts: <GitMerge className="h-4 w-4" />,
  building_graph: <Network className="h-4 w-4" />,
  building_tesseract: <Grid3X3 className="h-4 w-4" />,
  generating_venn: <CircleDot className="h-4 w-4" />,
  completed: <CheckCircle2 className="h-4 w-4" />,
  error: <XCircle className="h-4 w-4" />,
};

const STATUS_COLORS: Record<string, string> = {
  pending: "text-muted-foreground",
  running: "text-primary",
  completed: "text-green-500",
  error: "text-destructive",
};

const STATUS_BG: Record<string, string> = {
  pending: "bg-muted/30",
  running: "bg-primary/10 border-l-primary",
  completed: "bg-green-500/10 border-l-green-500",
  error: "bg-destructive/10 border-l-destructive",
};

// Steps that support restart
const RESTARTABLE_STEPS: PipelineStepId[] = ["tesseract", "venn"];

function StepItem({ 
  step, 
  onRestart, 
  isRunning 
}: { 
  step: PipelineStep; 
  onRestart?: (stepId: PipelineStepId) => void;
  isRunning: boolean;
}) {
  const [isOpen, setIsOpen] = useState(step.status === "running");
  const hasDetails = step.details && step.details.length > 0;
  const canRestart = !isRunning && 
    RESTARTABLE_STEPS.includes(step.id as PipelineStepId) && 
    (step.status === "completed" || step.status === "error");

  return (
    <div className={`border-l-4 rounded-r-lg p-3 transition-all ${STATUS_BG[step.status]}`}>
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <div className="flex items-start gap-3">
          {/* Status icon */}
          <div className={`mt-0.5 ${STATUS_COLORS[step.status]}`}>
            {step.status === "running" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : step.status === "completed" ? (
              <CheckCircle2 className="h-4 w-4" />
            ) : step.status === "error" ? (
              <XCircle className="h-4 w-4" />
            ) : (
              <Clock className="h-4 w-4" />
            )}
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className={`font-medium text-sm ${STATUS_COLORS[step.status]}`}>
                {step.title}
              </span>
              {step.status === "running" && step.progress > 0 && (
                <Badge variant="outline" className="text-xs">
                  {step.progress}%
                </Badge>
              )}
              {hasDetails && (
                <CollapsibleTrigger asChild>
                  <Button variant="ghost" size="sm" className="h-5 px-1">
                    {isOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                    <span className="text-xs ml-1">{step.details!.length}</span>
                  </Button>
                </CollapsibleTrigger>
              )}
              {canRestart && onRestart && (
                <Button 
                  variant="outline" 
                  size="sm" 
                  className="h-5 px-2 ml-auto"
                  onClick={() => onRestart(step.id as PipelineStepId)}
                >
                  <RotateCcw className="h-3 w-3 mr-1" />
                  Restart
                </Button>
              )}
            </div>

            <p className="text-xs text-muted-foreground mt-0.5">{step.message}</p>

            {/* Progress bar for running steps */}
            {step.status === "running" && step.progress > 0 && (
              <div className="mt-2 h-1.5 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary transition-all duration-300"
                  style={{ width: `${step.progress}%` }}
                />
              </div>
            )}

            {/* Error message display */}
            {step.errorMessage && (
              <div className="mt-2 p-2 bg-destructive/10 border border-destructive/30 rounded text-xs text-destructive">
                <div className="font-medium mb-1">Error Details:</div>
                <pre className="whitespace-pre-wrap font-mono max-h-[150px] overflow-y-auto">
                  {step.errorMessage}
                </pre>
              </div>
            )}

            {/* Expandable details */}
            <CollapsibleContent>
              {hasDetails && (
                <div className="mt-2 space-y-1 max-h-[200px] overflow-y-auto">
                  {step.details!.map((detail, i) => (
                    <div key={i} className="text-xs text-muted-foreground pl-2 border-l border-border">
                      {detail}
                    </div>
                  ))}
                </div>
              )}
            </CollapsibleContent>
          </div>
        </div>
      </Collapsible>
    </div>
  );
}

export function PipelineActivityStream({ steps, isRunning, onRestartStep }: PipelineActivityStreamProps) {
  const completedCount = steps.filter(s => s.status === "completed").length;
  const errorCount = steps.filter(s => s.status === "error").length;

  return (
    <Card className="h-[600px] flex flex-col">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-lg flex items-center gap-2">
            <Brain className="h-5 w-5" />
            Pipeline Progress
          </CardTitle>
          <div className="flex items-center gap-2">
            {isRunning && (
              <Badge variant="outline" className="bg-primary/10">
                <Loader2 className="h-3 w-3 animate-spin mr-1" />
                Running
              </Badge>
            )}
            <Badge variant="secondary">
              {completedCount}/{steps.length} steps
            </Badge>
            {errorCount > 0 && (
              <Badge variant="destructive">{errorCount} errors</Badge>
            )}
          </div>
        </div>
      </CardHeader>

      <CardContent className="flex-1 overflow-hidden p-0">
        <ScrollArea className="h-full px-6 pb-6">
          <div className="space-y-2">
            {steps.length === 0 ? (
              <div className="text-center text-muted-foreground py-8">
                Pipeline not started. Configure and start an audit to see progress.
              </div>
            ) : (
              steps.map((step) => (
                <StepItem 
                  key={step.id} 
                  step={step} 
                  onRestart={onRestartStep}
                  isRunning={isRunning}
                />
              ))
            )}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
