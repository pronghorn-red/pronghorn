import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { MessageSquare } from 'lucide-react';

interface BlackboardViewerProps {
  blackboard: string[];
  currentIteration: number;
  totalIterations: number;
}

export function BlackboardViewer({ blackboard, currentIteration, totalIterations }: BlackboardViewerProps) {
  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MessageSquare className="w-5 h-5" />
          Orchestrator Blackboard
        </CardTitle>
        <CardDescription>
          Iteration {currentIteration} of {totalIterations}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-[400px] w-full">
          {blackboard.length === 0 ? (
            <div className="flex items-center justify-center h-full text-muted-foreground">
              <p className="text-sm">No orchestrator guidance yet. Start iteration to see updates.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {blackboard.map((entry, index) => (
                <div key={index} className="p-3 border rounded-lg bg-muted/30">
                  <p className="text-xs text-muted-foreground mb-1">Entry {index + 1}</p>
                  <p className="text-sm whitespace-pre-wrap">{entry}</p>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
