import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';

export interface AgentConfiguration {
  exposeProject: boolean;
  maxIterations: number;
}

interface AgentConfigurationModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  config: AgentConfiguration;
  onConfigChange: (config: AgentConfiguration) => void;
}

export function AgentConfigurationModal({
  open,
  onOpenChange,
  config,
  onConfigChange,
}: AgentConfigurationModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Agent Configuration</DialogTitle>
          <DialogDescription>
            Configure agent behavior and capabilities for this session.
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-6 py-4">
          {/* Expose Project Toggle */}
          <div className="space-y-3">
            <div className="flex items-start gap-3">
              <Checkbox 
                id="expose-project" 
                checked={config.exposeProject}
                onCheckedChange={(checked) => 
                  onConfigChange({ ...config, exposeProject: checked as boolean })
                }
              />
              <div className="space-y-1">
                <Label htmlFor="expose-project" className="text-sm font-medium cursor-pointer">
                  Expose Project to Agent
                </Label>
                <p className="text-xs text-muted-foreground">
                  When enabled, the agent gains read-only access to explore all project elements: 
                  requirements, canvas, artifacts, chats, standards, tech stacks, and more.
                  This allows the agent to understand the full project context and make better decisions.
                </p>
              </div>
            </div>
            
            {config.exposeProject && (
              <div className="ml-6 p-3 rounded-md bg-muted/50 text-xs text-muted-foreground space-y-1">
                <p className="font-medium text-foreground">Agent will have access to:</p>
                <ul className="list-disc list-inside space-y-0.5">
                  <li>Project metadata, requirements, and standards</li>
                  <li>Canvas nodes, edges, and layers</li>
                  <li>Artifacts and chat sessions</li>
                  <li>Repository files and commits</li>
                  <li>Tech stack selections</li>
                </ul>
              </div>
            )}
          </div>

          {/* Max Iterations */}
          <div className="space-y-2">
            <Label htmlFor="max-iterations" className="text-sm font-medium">
              Maximum Iterations
            </Label>
            <Input
              id="max-iterations"
              type="number"
              min="1"
              max="500"
              value={config.maxIterations}
              onChange={(e) =>
                onConfigChange({
                  ...config,
                  maxIterations: Math.max(1, Math.min(500, parseInt(e.target.value) || 30))
                })
              }
              className="w-32"
            />
            <p className="text-xs text-muted-foreground">
              Maximum number of agent iterations before stopping (1-500). Default is 100.
              Higher values allow for more complex multi-step tasks.
            </p>
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-4 border-t">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={() => onOpenChange(false)}>
            Save Configuration
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
