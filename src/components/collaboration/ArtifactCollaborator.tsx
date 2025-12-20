import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { 
  ResizableHandle, 
  ResizablePanel, 
  ResizablePanelGroup 
} from '@/components/ui/resizable';
import { 
  ChevronLeft, 
  GitMerge, 
  X, 
  Loader2,
  MessageSquare,
  FileText,
  History,
  Users
} from 'lucide-react';
import { useRealtimeCollaboration } from '@/hooks/useRealtimeCollaboration';
import { CollaborationEditor } from './CollaborationEditor';
import { CollaborationChat, CollaborationMessage } from './CollaborationChat';
import { CollaborationTimeline, HistoryEntry } from './CollaborationTimeline';
import { CollaborationHeatmap } from './CollaborationHeatmap';
import { useIsMobile } from '@/hooks/use-mobile';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

interface ArtifactCollaboratorProps {
  projectId: string;
  artifact: {
    id: string;
    content: string;
    ai_title: string | null;
  };
  shareToken: string | null;
  onBack: () => void;
  onMerged?: () => void;
}

export function ArtifactCollaborator({
  projectId,
  artifact,
  shareToken,
  onBack,
  onMerged,
}: ArtifactCollaboratorProps) {
  const isMobile = useIsMobile();
  const [collaborationId, setCollaborationId] = useState<string | null>(null);
  const [isCreatingCollab, setIsCreatingCollab] = useState(false);
  const [isMerging, setIsMerging] = useState(false);
  const [showMergeDialog, setShowMergeDialog] = useState(false);
  const [mobileTab, setMobileTab] = useState<'editor' | 'chat' | 'history'>('editor');
  
  // Local editor state
  const [localContent, setLocalContent] = useState(artifact.content);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  
  // Streaming state for AI responses
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingContent, setStreamingContent] = useState('');
  
  // View version state
  const [viewingVersion, setViewingVersion] = useState<number | null>(null);

  const {
    collaboration,
    messages,
    history,
    blackboard,
    isLoading,
    sendMessage,
    insertEdit,
    restoreToVersion,
    addBlackboardEntry,
  } = useRealtimeCollaboration(collaborationId || undefined, shareToken, !!collaborationId);

  // Detect if content is markdown
  const isMarkdown = artifact.content.trim().startsWith('#') || 
    artifact.content.includes('\n## ') ||
    artifact.content.includes('\n### ') ||
    artifact.content.includes('```') ||
    artifact.content.includes('- ') ||
    artifact.content.includes('* ');

  // Create or load collaboration session
  useEffect(() => {
    const initCollaboration = async () => {
      if (!projectId || !artifact.id) return;
      
      setIsCreatingCollab(true);
      try {
        // Check for existing active collaboration
        const { data: existing, error: fetchError } = await supabase.rpc(
          'get_artifact_collaborations_with_token',
          {
            p_project_id: projectId,
            p_token: shareToken || null,
          }
        );

        if (fetchError) throw fetchError;

        const activeCollab = existing?.find(
          (c: any) => c.artifact_id === artifact.id && c.status === 'active'
        );

        if (activeCollab) {
          setCollaborationId(activeCollab.id);
          setLocalContent(activeCollab.current_content);
        } else {
          // Create new collaboration
          const { data: newCollab, error: createError } = await supabase.rpc(
            'create_artifact_collaboration_with_token',
            {
              p_project_id: projectId,
              p_artifact_id: artifact.id,
              p_token: shareToken || null,
              p_title: `Collaboration on ${artifact.ai_title || 'Artifact'}`,
              p_base_content: artifact.content,
            }
          );

          if (createError) throw createError;
          setCollaborationId(newCollab.id);
          setLocalContent(artifact.content);
        }
      } catch (error) {
        console.error('Error initializing collaboration:', error);
        toast.error('Failed to initialize collaboration');
      } finally {
        setIsCreatingCollab(false);
      }
    };

    initCollaboration();
  }, [projectId, artifact.id, artifact.content, artifact.ai_title, shareToken]);

  // Update local content when collaboration loads
  useEffect(() => {
    if (collaboration?.current_content && !hasUnsavedChanges) {
      setLocalContent(collaboration.current_content);
    }
  }, [collaboration?.current_content, hasUnsavedChanges]);

  // Handle content changes
  const handleContentChange = useCallback((content: string) => {
    setLocalContent(content);
    setHasUnsavedChanges(true);
  }, []);

  // Save changes as an edit
  const handleSave = useCallback(async () => {
    if (!collaborationId || !hasUnsavedChanges) return;
    
    setIsSaving(true);
    try {
      const currentContent = collaboration?.current_content || artifact.content;
      
      // Simple diff - for now just track as a single edit
      // In a more sophisticated version, we'd compute line-level diffs
      const lines = localContent.split('\n');
      
      await insertEdit(
        'edit',
        1,
        lines.length,
        currentContent,
        localContent,
        localContent,
        'User edit',
        'human',
        'User'
      );
      
      setHasUnsavedChanges(false);
      toast.success('Changes saved');
    } catch (error) {
      console.error('Error saving changes:', error);
      toast.error('Failed to save changes');
    } finally {
      setIsSaving(false);
    }
  }, [collaborationId, hasUnsavedChanges, localContent, collaboration?.current_content, artifact.content, insertEdit]);

  // Handle version navigation
  const handleVersionChange = useCallback((version: number) => {
    const entry = history.find(h => h.version_number === version);
    if (entry?.full_content_snapshot) {
      setLocalContent(entry.full_content_snapshot);
      setViewingVersion(version);
    }
  }, [history]);

  // Handle restore
  const handleRestore = useCallback(async (version: number) => {
    if (!collaborationId) return;
    
    try {
      await restoreToVersion(version);
      setViewingVersion(null);
      setHasUnsavedChanges(false);
      toast.success(`Restored to version ${version}`);
    } catch (error) {
      console.error('Error restoring version:', error);
      toast.error('Failed to restore version');
    }
  }, [collaborationId, restoreToVersion]);

  // Handle merge to artifact
  const handleMerge = useCallback(async () => {
    if (!collaborationId) return;
    
    setIsMerging(true);
    try {
      const { error } = await supabase.rpc('merge_collaboration_to_artifact_with_token', {
        p_collaboration_id: collaborationId,
        p_token: shareToken || null,
      });
      
      if (error) throw error;
      
      toast.success('Collaboration merged to artifact');
      setShowMergeDialog(false);
      onMerged?.();
      onBack();
    } catch (error) {
      console.error('Error merging collaboration:', error);
      toast.error('Failed to merge collaboration');
    } finally {
      setIsMerging(false);
    }
  }, [collaborationId, shareToken, onMerged, onBack]);

  // Handle chat message send with streaming
  const handleSendMessage = useCallback(async (content: string) => {
    if (!collaborationId || !projectId) return;
    
    // Add user message locally first
    await sendMessage('user', content);
    
    setIsStreaming(true);
    setStreamingContent('');
    
    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL || 'https://obkzdksfayygnrzdqoam.supabase.co'}/functions/v1/collaboration-agent-orchestrator`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9ia3pka3NmYXl5Z25yemRxb2FtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjM0MTA4MzcsImV4cCI6MjA3ODk4NjgzN30.xOKphCiEilzPTo9EGHNJqAJfruM_bijI9PN3BQBF-z8'}`,
          },
          body: JSON.stringify({
            collaborationId,
            projectId,
            userMessage: content,
            shareToken: shareToken || null,
            maxIterations: 10,
          }),
        }
      );

      if (!response.ok) {
        throw new Error(`Agent error: ${response.status}`);
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let lastMessage = '';

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            const data = line.slice(6).trim();
            if (!data) continue;

            try {
              const event = JSON.parse(data);
              
              if (event.type === 'reasoning') {
                setStreamingContent(event.reasoning);
              } else if (event.type === 'edit') {
                // Reload content when edit is made
                const { data: updatedCollab } = await supabase.rpc(
                  'get_artifact_collaboration_with_token',
                  { p_collaboration_id: collaborationId, p_token: shareToken }
                );
                if (updatedCollab?.current_content) {
                  setLocalContent(updatedCollab.current_content);
                }
                toast.success(`Edit applied: ${event.narrative}`);
              } else if (event.type === 'done') {
                lastMessage = event.message || 'Changes completed.';
              } else if (event.type === 'error') {
                throw new Error(event.message);
              }
            } catch (e) {
              console.error('Error parsing SSE event:', e);
            }
          }
        }
      }

      // The assistant message is already saved by the edge function
      if (lastMessage) {
        setStreamingContent('');
      }
    } catch (error) {
      console.error('Error with collaboration agent:', error);
      toast.error('Failed to get AI response');
      // Add error message
      await sendMessage('assistant', 'Sorry, I encountered an error processing your request. Please try again.');
    } finally {
      setIsStreaming(false);
      setStreamingContent('');
    }
  }, [collaborationId, projectId, shareToken, sendMessage]);

  const latestVersion = history.length > 0 
    ? Math.max(...history.map(h => h.version_number))
    : 0;

  const currentVersion = viewingVersion || latestVersion;

  if (isCreatingCollab || isLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">
            {isCreatingCollab ? 'Initializing collaboration...' : 'Loading...'}
          </p>
        </div>
      </div>
    );
  }

  // Map messages to the expected format
  const chatMessages: CollaborationMessage[] = messages.map(m => ({
    id: m.id,
    role: m.role as 'user' | 'assistant',
    content: m.content,
    created_at: m.created_at,
    metadata: m.metadata,
  }));

  // Map history to the expected format
  const historyEntries: HistoryEntry[] = history.map(h => ({
    id: h.id,
    version_number: h.version_number,
    actor_type: h.actor_type as 'human' | 'agent',
    actor_identifier: h.actor_identifier,
    operation_type: h.operation_type as 'edit' | 'insert' | 'delete',
    start_line: h.start_line,
    end_line: h.end_line,
    old_content: h.old_content,
    new_content: h.new_content,
    narrative: h.narrative,
    created_at: h.created_at,
  }));

  // Mobile layout
  if (isMobile) {
    return (
      <div className="flex flex-col h-full bg-background">
        {/* Header */}
        <div className="flex items-center justify-between p-3 border-b">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" onClick={onBack}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <div className="min-w-0">
              <h2 className="text-sm font-medium truncate">
                {artifact.ai_title || 'Untitled'}
              </h2>
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-xs">
                  v{currentVersion}
                </Badge>
                {hasUnsavedChanges && (
                  <Badge variant="secondary" className="text-xs">Unsaved</Badge>
                )}
              </div>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowMergeDialog(true)}
            disabled={hasUnsavedChanges}
          >
            <GitMerge className="h-4 w-4 mr-1" />
            Merge
          </Button>
        </div>

        {/* Mobile tabs */}
        <Tabs 
          value={mobileTab} 
          onValueChange={(v) => setMobileTab(v as 'editor' | 'chat' | 'history')}
          className="flex-1 flex flex-col min-h-0"
        >
          <TabsList className="w-full grid grid-cols-3 h-10 rounded-none border-b">
            <TabsTrigger value="editor" className="text-xs">
              <FileText className="h-3 w-3 mr-1" />
              Editor
            </TabsTrigger>
            <TabsTrigger value="chat" className="text-xs">
              <MessageSquare className="h-3 w-3 mr-1" />
              Chat
            </TabsTrigger>
            <TabsTrigger value="history" className="text-xs">
              <History className="h-3 w-3 mr-1" />
              History
            </TabsTrigger>
          </TabsList>

          <TabsContent value="editor" className="flex-1 m-0 min-h-0">
            <div className="flex flex-col h-full">
              <CollaborationEditor
                content={localContent}
                isMarkdown={isMarkdown}
                onChange={handleContentChange}
                onSave={handleSave}
                isSaving={isSaving}
                hasUnsavedChanges={hasUnsavedChanges}
                readOnly={viewingVersion !== null && viewingVersion < latestVersion}
              />
              {history.length > 0 && (
                <CollaborationTimeline
                  history={historyEntries}
                  currentVersion={currentVersion}
                  latestVersion={latestVersion}
                  onVersionChange={handleVersionChange}
                  onRestore={handleRestore}
                  compact
                />
              )}
            </div>
          </TabsContent>

          <TabsContent value="chat" className="flex-1 m-0 min-h-0">
            <CollaborationChat
              messages={chatMessages}
              isStreaming={isStreaming}
              streamingContent={streamingContent}
              onSendMessage={handleSendMessage}
            />
          </TabsContent>

          <TabsContent value="history" className="flex-1 m-0 min-h-0">
            <CollaborationTimeline
              history={historyEntries}
              currentVersion={currentVersion}
              latestVersion={latestVersion}
              onVersionChange={handleVersionChange}
              onRestore={handleRestore}
            />
          </TabsContent>
        </Tabs>

        <MergeDialog 
          open={showMergeDialog}
          onOpenChange={setShowMergeDialog}
          onConfirm={handleMerge}
          isMerging={isMerging}
        />
      </div>
    );
  }

  // Desktop layout
  return (
    <div className="flex flex-col h-full bg-background">
      {/* Header */}
      <div className="flex items-center justify-between p-3 border-b">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={onBack}>
            <ChevronLeft className="h-4 w-4 mr-1" />
            Back to Artifacts
          </Button>
          <div className="h-4 w-px bg-border" />
          <div>
            <h2 className="text-sm font-medium">
              {artifact.ai_title || 'Untitled Artifact'}
            </h2>
            <div className="flex items-center gap-2 mt-0.5">
              <Badge variant="outline" className="text-xs">
                Collaboration
              </Badge>
              <Badge variant="secondary" className="text-xs">
                v{currentVersion} of {latestVersion}
              </Badge>
              {hasUnsavedChanges && (
                <Badge variant="destructive" className="text-xs">Unsaved</Badge>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowMergeDialog(true)}
            disabled={hasUnsavedChanges || isMerging}
          >
            <GitMerge className="h-4 w-4 mr-2" />
            Merge to Artifact
          </Button>
          <Button variant="ghost" size="icon" onClick={onBack}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Activity heatmap */}
      <div className="px-4 py-2 border-b bg-muted/20">
        <CollaborationHeatmap history={historyEntries} />
      </div>

      {/* Main content */}
      <ResizablePanelGroup direction="horizontal" className="flex-1">
        {/* Editor panel */}
        <ResizablePanel defaultSize={60} minSize={40}>
          <div className="flex flex-col h-full">
            <CollaborationEditor
              content={localContent}
              isMarkdown={isMarkdown}
              onChange={handleContentChange}
              onSave={handleSave}
              isSaving={isSaving}
              hasUnsavedChanges={hasUnsavedChanges}
              readOnly={viewingVersion !== null && viewingVersion < latestVersion}
            />
            {history.length > 0 && (
              <CollaborationTimeline
                history={historyEntries}
                currentVersion={currentVersion}
                latestVersion={latestVersion}
                onVersionChange={handleVersionChange}
                onRestore={handleRestore}
                compact
              />
            )}
          </div>
        </ResizablePanel>

        <ResizableHandle withHandle />

        {/* Chat panel */}
        <ResizablePanel defaultSize={40} minSize={25}>
          <CollaborationChat
            messages={chatMessages}
            isStreaming={isStreaming}
            streamingContent={streamingContent}
            onSendMessage={handleSendMessage}
          />
        </ResizablePanel>
      </ResizablePanelGroup>

      <MergeDialog 
        open={showMergeDialog}
        onOpenChange={setShowMergeDialog}
        onConfirm={handleMerge}
        isMerging={isMerging}
      />
    </div>
  );
}

// Merge confirmation dialog
function MergeDialog({
  open,
  onOpenChange,
  onConfirm,
  isMerging,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  isMerging: boolean;
}) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Merge Collaboration?</AlertDialogTitle>
          <AlertDialogDescription>
            This will replace the original artifact content with your collaborated version.
            The collaboration history will be preserved.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isMerging}>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm} disabled={isMerging}>
            {isMerging ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Merging...
              </>
            ) : (
              <>
                <GitMerge className="h-4 w-4 mr-2" />
                Merge
              </>
            )}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
