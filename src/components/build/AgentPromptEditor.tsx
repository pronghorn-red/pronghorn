import { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Lock,
  Pencil,
  RotateCcw,
  Download,
  Upload,
  Plus,
  Trash2,
  Save,
  Loader2,
  FileCode,
  AlertTriangle,
} from 'lucide-react';
import { useProjectAgent, AgentPromptSection, AgentDefinition } from '@/hooks/useProjectAgent';
import { toast } from 'sonner';

interface AgentPromptEditorProps {
  projectId: string;
  shareToken: string | null;
}

export function AgentPromptEditor({ projectId, shareToken }: AgentPromptEditorProps) {
  const {
    agentDefinition,
    sections,
    loading,
    saving,
    hasCustomConfig,
    saveAgentConfig,
    resetToDefault,
    updateSection,
    addCustomSection,
    removeSection,
    exportDefinition,
    importDefinition,
  } = useProjectAgent(projectId, 'coding-agent-orchestrator', shareToken);

  const [isAddSectionOpen, setIsAddSectionOpen] = useState(false);
  const [newSection, setNewSection] = useState<Partial<AgentPromptSection>>({
    id: '',
    title: '',
    description: '',
    type: 'static',
    editable: 'editable',
    order: 100,
    content: '',
  });
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleSave = async () => {
    if (!agentDefinition) return;

    const updatedDefinition: AgentDefinition = {
      ...agentDefinition,
      sections,
    };

    await saveAgentConfig(updatedDefinition);
  };

  const handleExport = () => {
    const json = exportDefinition();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `agent-definition-${agentDefinition?.name || 'export'}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success('Agent definition exported');
  };

  const handleImport = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      importDefinition(content);
    };
    reader.readAsText(file);

    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleAddSection = () => {
    if (!newSection.id || !newSection.title || !newSection.content) {
      toast.error('Section ID, title, and content are required');
      return;
    }

    // Check for duplicate ID
    if (sections.some(s => s.id === newSection.id)) {
      toast.error('A section with this ID already exists');
      return;
    }

    addCustomSection({
      id: newSection.id!,
      title: newSection.title!,
      description: newSection.description || '',
      type: newSection.type as 'static' | 'dynamic',
      editable: newSection.editable as 'editable' | 'readonly' | 'substitutable',
      order: newSection.order || 100,
      content: newSection.content!,
      variables: [],
      isCustom: true,
    });

    setNewSection({
      id: '',
      title: '',
      description: '',
      type: 'static',
      editable: 'editable',
      order: 100,
      content: '',
    });
    setIsAddSectionOpen(false);
    toast.success('Custom section added');
  };

  const getEditableIcon = (editable: string) => {
    switch (editable) {
      case 'readonly':
        return <Lock className="h-3 w-3" />;
      case 'substitutable':
        return <FileCode className="h-3 w-3" />;
      default:
        return <Pencil className="h-3 w-3" />;
    }
  };

  const getEditableBadge = (editable: string) => {
    switch (editable) {
      case 'readonly':
        return (
          <Badge variant="secondary" className="text-xs gap-1">
            <Lock className="h-3 w-3" />
            System
          </Badge>
        );
      case 'substitutable':
        return (
          <Badge variant="outline" className="text-xs gap-1 border-amber-500 text-amber-600">
            <FileCode className="h-3 w-3" />
            Dynamic
          </Badge>
        );
      default:
        return (
          <Badge variant="default" className="text-xs gap-1">
            <Pencil className="h-3 w-3" />
            Editable
          </Badge>
        );
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="p-4 border-b space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-semibold">{agentDefinition?.name || 'Agent Prompt Editor'}</h3>
            <p className="text-sm text-muted-foreground">
              {hasCustomConfig ? 'Custom configuration' : 'Using default configuration'}
            </p>
          </div>
          <Badge variant="outline">v{agentDefinition?.version || '1.0.0'}</Badge>
        </div>

        {/* Actions Bar */}
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={handleImport}>
            <Upload className="h-4 w-4 mr-2" />
            Import JSON
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".json"
            className="hidden"
            onChange={handleFileChange}
          />

          <Button variant="outline" size="sm" onClick={handleExport}>
            <Download className="h-4 w-4 mr-2" />
            Export JSON
          </Button>

          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline" size="sm" disabled={!hasCustomConfig}>
                <RotateCcw className="h-4 w-4 mr-2" />
                Reset to Default
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Reset to Default Configuration?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will remove all customizations and restore the default agent prompt.
                  This action cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={resetToDefault}>
                  Reset to Default
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          <Button variant="outline" size="sm" onClick={() => setIsAddSectionOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Add Section
          </Button>

          <div className="flex-1" />

          <Button onClick={handleSave} disabled={saving}>
            {saving ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Save className="h-4 w-4 mr-2" />
            )}
            Save Changes
          </Button>
        </div>
      </div>

      {/* Sections List */}
      <ScrollArea className="flex-1">
        <div className="p-4">
          <Accordion type="multiple" className="space-y-2">
            {sections.map((section) => (
              <AccordionItem
                key={section.id}
                value={section.id}
                className="border rounded-lg px-4"
              >
                <AccordionTrigger className="hover:no-underline">
                  <div className="flex items-center gap-3 text-left flex-1">
                    <span className="text-sm font-medium">{section.title}</span>
                    {getEditableBadge(section.editable)}
                    {section.isCustom && (
                      <Badge variant="secondary" className="text-xs">Custom</Badge>
                    )}
                    {section.variables && section.variables.length > 0 && (
                      <div className="flex gap-1">
                        {section.variables.map((v) => (
                          <Badge key={v} variant="outline" className="text-xs font-mono">
                            {v}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>
                </AccordionTrigger>
                <AccordionContent>
                  <div className="space-y-4 pt-2">
                    {/* Description */}
                    <p className="text-sm text-muted-foreground">{section.description}</p>

                    {/* Section metadata */}
                    <div className="flex gap-4 text-xs text-muted-foreground">
                      <span>ID: <code className="bg-muted px-1 rounded">{section.id}</code></span>
                      <span>Order: {section.order}</span>
                      <span>Type: {section.type}</span>
                    </div>

                    {/* Content Editor */}
                    {section.editable === 'editable' ? (
                      <div className="space-y-2">
                        <Textarea
                          value={section.content}
                          onChange={(e) => updateSection(section.id, { content: e.target.value })}
                          className="font-mono text-xs min-h-[200px]"
                          placeholder="Enter section content..."
                        />
                        {section.variables && section.variables.length > 0 && (
                          <div className="flex items-start gap-2 p-2 rounded-lg bg-amber-500/10 border border-amber-500/20">
                            <AlertTriangle className="h-4 w-4 text-amber-500 mt-0.5 flex-shrink-0" />
                            <p className="text-xs text-amber-600 dark:text-amber-400">
                              <strong>Warning:</strong> This section contains dynamic variables ({section.variables.join(', ')}). 
                              Removing these variables will prevent runtime data from being injected into the prompt.
                            </p>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="relative">
                        <pre className="bg-muted/50 p-4 rounded-lg text-xs font-mono whitespace-pre-wrap overflow-x-auto max-h-[300px] overflow-y-auto">
                          {section.content}
                        </pre>
                        <div className="absolute top-2 right-2">
                          <Badge variant="secondary" className="text-xs gap-1">
                            <Lock className="h-3 w-3" />
                            {section.editable === 'readonly' ? 'System-managed' : 'Dynamic'}
                          </Badge>
                        </div>
                      </div>
                    )}

                    {/* Section Actions */}
                    <div className="flex justify-between items-center pt-2 border-t">
                      {section.editable === 'editable' && !section.isCustom && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={async () => {
                            // Reset this section to default
                            const template = await fetch('/data/codingAgentPromptTemplate.json').then(r => r.json());
                            const defaultSection = template.sections.find((s: AgentPromptSection) => s.id === section.id);
                            if (defaultSection) {
                              updateSection(section.id, { content: defaultSection.content });
                              toast.success('Section reset to default');
                            }
                          }}
                        >
                          <RotateCcw className="h-4 w-4 mr-2" />
                          Reset Section
                        </Button>
                      )}

                      {section.isCustom && (
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="ghost" size="sm" className="text-destructive">
                              <Trash2 className="h-4 w-4 mr-2" />
                              Remove Section
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Remove Custom Section?</AlertDialogTitle>
                              <AlertDialogDescription>
                                This will permanently remove the "{section.title}" section.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction onClick={() => removeSection(section.id)}>
                                Remove
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      )}
                    </div>
                  </div>
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      </ScrollArea>

      {/* Add Section Dialog */}
      <Dialog open={isAddSectionOpen} onOpenChange={setIsAddSectionOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Add Custom Section</DialogTitle>
            <DialogDescription>
              Create a new prompt section with custom content. Custom sections are always editable.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="section-id">Section ID</Label>
                <Input
                  id="section-id"
                  placeholder="my_custom_section"
                  value={newSection.id || ''}
                  onChange={(e) => setNewSection(prev => ({ ...prev, id: e.target.value.toLowerCase().replace(/\s+/g, '_') }))}
                />
                <p className="text-xs text-muted-foreground">Unique identifier (snake_case)</p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="section-order">Order</Label>
                <Input
                  id="section-order"
                  type="number"
                  value={newSection.order || 100}
                  onChange={(e) => setNewSection(prev => ({ ...prev, order: parseInt(e.target.value) || 100 }))}
                />
                <p className="text-xs text-muted-foreground">Position in prompt</p>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="section-title">Title</Label>
              <Input
                id="section-title"
                placeholder="My Custom Rules"
                value={newSection.title || ''}
                onChange={(e) => setNewSection(prev => ({ ...prev, title: e.target.value }))}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="section-description">Description</Label>
              <Input
                id="section-description"
                placeholder="Brief description of this section"
                value={newSection.description || ''}
                onChange={(e) => setNewSection(prev => ({ ...prev, description: e.target.value }))}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="section-content">Content</Label>
              <Textarea
                id="section-content"
                placeholder="Enter the prompt content for this section..."
                value={newSection.content || ''}
                onChange={(e) => setNewSection(prev => ({ ...prev, content: e.target.value }))}
                className="min-h-[150px] font-mono text-sm"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsAddSectionOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleAddSection}>
              <Plus className="h-4 w-4 mr-2" />
              Add Section
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
