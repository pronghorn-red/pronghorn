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
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';
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
  ChevronUp,
  ChevronDown,
  Wrench,
  FolderSearch,
} from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { useProjectAgent, AgentPromptSection, AgentDefinition } from '@/hooks/useProjectAgent';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface AgentPromptEditorProps {
  projectId: string;
  shareToken: string | null;
}

export function AgentPromptEditor({ projectId, shareToken }: AgentPromptEditorProps) {
  const {
    agentDefinition,
    sections,
    toolsManifest,
    customToolDescriptions,
    loading,
    saving,
    hasCustomConfig,
    saveAgentConfig,
    resetToDefault,
    updateSection,
    toggleSection,
    reorderSection,
    addCustomSection,
    removeSection,
    updateToolDescription,
    getEffectiveToolDescription,
    exportDefinition,
    importDefinition,
  } = useProjectAgent(projectId, 'coding-agent-orchestrator', shareToken);

  // Sort sections by order for display
  const sortedSections = [...sections].sort((a, b) => a.order - b.order);

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

  // Check if there are custom tool descriptions
  const hasCustomToolDescriptions = Object.keys(customToolDescriptions.file_operations || {}).length > 0 ||
    Object.keys(customToolDescriptions.project_exploration_tools || {}).length > 0;

  // Reset a single tool description to default
  const resetToolDescription = (category: 'file_operations' | 'project_exploration_tools', toolName: string) => {
    const defaultDesc = toolsManifest?.[category]?.[toolName]?.description || '';
    updateToolDescription(category, toolName, defaultDesc);
    // Remove from custom descriptions by setting to undefined-like behavior
    // Actually we need to track "reset" state - simplest is to just not include it
  };

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
              <Button variant="outline" size="sm" disabled={!hasCustomConfig && !hasCustomToolDescriptions}>
                <RotateCcw className="h-4 w-4 mr-2" />
                Reset to Default
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Reset to Default Configuration?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will remove all customizations including prompt sections and tool descriptions, restoring the default agent configuration.
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

      {/* Tabs for Sections and Tools */}
      <Tabs defaultValue="sections" className="flex-1 flex flex-col min-h-0 overflow-hidden">
        <div className="px-4 pt-2 border-b flex-shrink-0">
          <TabsList>
            <TabsTrigger value="sections" className="gap-2">
              <FileCode className="h-4 w-4" />
              Prompt Sections
            </TabsTrigger>
            <TabsTrigger value="tools" className="gap-2">
              <Wrench className="h-4 w-4" />
              Tools Manifest
              {hasCustomToolDescriptions && (
                <Badge variant="secondary" className="ml-1 text-xs">Modified</Badge>
              )}
            </TabsTrigger>
          </TabsList>
        </div>

        {/* Sections Tab */}
        <TabsContent value="sections" className="flex-1 m-0 overflow-hidden">
          <ScrollArea className="h-full w-full">
            <div className="p-4">
              <Accordion type="multiple" className="space-y-2">
                {sortedSections.map((section, index) => {
                  const isEnabled = section.enabled ?? true;
                  const isFirst = index === 0;
                  const isLast = index === sortedSections.length - 1;

                  return (
                  <AccordionItem
                    key={section.id}
                    value={section.id}
                    className={cn(
                      "border rounded-lg px-4",
                      !isEnabled && "opacity-50 bg-muted/30"
                    )}
                  >
                    <AccordionTrigger className="hover:no-underline">
                      <div className="flex items-center gap-3 text-left flex-1">
                        {/* Enable/Disable Toggle */}
                        <Switch
                          checked={isEnabled}
                          onCheckedChange={() => toggleSection(section.id)}
                          onClick={(e) => e.stopPropagation()}
                          className="h-4 w-7"
                        />
                        <span className={cn("text-sm font-medium", !isEnabled && "line-through")}>
                          {section.title}
                        </span>
                        {getEditableBadge(section.editable)}
                        {section.isCustom && (
                          <Badge variant="secondary" className="text-xs">Custom</Badge>
                        )}
                        {!isEnabled && (
                          <Badge variant="outline" className="text-xs text-muted-foreground">Disabled</Badge>
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
                        {/* Reorder buttons */}
                        <div className="flex gap-1 ml-auto mr-2" onClick={(e) => e.stopPropagation()}>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6"
                            disabled={isFirst}
                            onClick={() => reorderSection(section.id, 'up')}
                          >
                            <ChevronUp className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6"
                            disabled={isLast}
                            onClick={() => reorderSection(section.id, 'down')}
                          >
                            <ChevronDown className="h-4 w-4" />
                          </Button>
                        </div>
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
                  );
                })}
              </Accordion>
            </div>
          </ScrollArea>
        </TabsContent>

        {/* Tools Tab */}
        <TabsContent value="tools" className="flex-1 m-0 overflow-hidden">
          <ScrollArea className="h-full w-full">
            <div className="p-4 space-y-6">
              {/* File Operations */}
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Wrench className="h-4 w-4 text-muted-foreground" />
                  <h4 className="font-medium">File Operations</h4>
                  <Badge variant="outline" className="text-xs">
                    {Object.keys(toolsManifest?.file_operations || {}).length} tools
                  </Badge>
                </div>
                <div className="space-y-2">
                  {toolsManifest && Object.entries(toolsManifest.file_operations).map(([toolName, tool]) => {
                    const currentDesc = getEffectiveToolDescription('file_operations', toolName);
                    const isModified = customToolDescriptions.file_operations?.[toolName] !== undefined;
                    
                    return (
                      <div key={toolName} className="border rounded-lg p-3 space-y-2">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <code className="text-sm font-mono bg-muted px-2 py-0.5 rounded">{toolName}</code>
                            <Badge variant="secondary" className="text-xs">{tool.category}</Badge>
                            {isModified && (
                              <Badge variant="outline" className="text-xs border-amber-500 text-amber-600">Modified</Badge>
                            )}
                          </div>
                          {isModified && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                // Reset by removing from custom descriptions
                                updateToolDescription('file_operations', toolName, tool.description);
                              }}
                            >
                              <RotateCcw className="h-3 w-3 mr-1" />
                              Reset
                            </Button>
                          )}
                        </div>
                        <Textarea
                          value={currentDesc}
                          onChange={(e) => updateToolDescription('file_operations', toolName, e.target.value)}
                          className="font-mono text-xs min-h-[60px]"
                          placeholder="Tool description..."
                        />
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Project Exploration Tools */}
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <FolderSearch className="h-4 w-4 text-muted-foreground" />
                  <h4 className="font-medium">Project Exploration Tools</h4>
                  <Badge variant="outline" className="text-xs">
                    {Object.keys(toolsManifest?.project_exploration_tools || {}).length} tools
                  </Badge>
                </div>
                <div className="space-y-2">
                  {toolsManifest && Object.entries(toolsManifest.project_exploration_tools).map(([toolName, tool]) => {
                    const currentDesc = getEffectiveToolDescription('project_exploration_tools', toolName);
                    const isModified = customToolDescriptions.project_exploration_tools?.[toolName] !== undefined;
                    
                    return (
                      <div key={toolName} className="border rounded-lg p-3 space-y-2">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <code className="text-sm font-mono bg-muted px-2 py-0.5 rounded">{toolName}</code>
                            <Badge variant="secondary" className="text-xs">{tool.category}</Badge>
                            {isModified && (
                              <Badge variant="outline" className="text-xs border-amber-500 text-amber-600">Modified</Badge>
                            )}
                          </div>
                          {isModified && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                updateToolDescription('project_exploration_tools', toolName, tool.description);
                              }}
                            >
                              <RotateCcw className="h-3 w-3 mr-1" />
                              Reset
                            </Button>
                          )}
                        </div>
                        <Textarea
                          value={currentDesc}
                          onChange={(e) => updateToolDescription('project_exploration_tools', toolName, e.target.value)}
                          className="font-mono text-xs min-h-[60px]"
                          placeholder="Tool description..."
                        />
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </ScrollArea>
        </TabsContent>
      </Tabs>

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
