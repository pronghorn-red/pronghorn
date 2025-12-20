import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
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
import { CollaborationChat, CollaborationMessage, BlackboardEntry } from './CollaborationChat';
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
  
  // Optimistic messages for immediate UI feedback
  const [optimisticMessages, setOptimisticMessages] = useState<Array<{
    id: string;
    role: 'user' | 'assistant';
    content: string;
    created_at: string;
  }>>([]);
  
  // View version state
  const [viewingVersion, setViewingVersion] = useState<number | null>(null);
  
  // Track when agent is editing to prevent sync from overwriting content
  const isAgentEditingRef = useRef<boolean>(false);

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
    refresh,
    refreshHistory,
    refreshMessages,
  } = useRealtimeCollaboration(collaborationId, shareToken, !!collaborationId);

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
          // Fetch fresh artifact content from database to ensure we have latest
          const { data: freshArtifacts, error: artifactError } = await supabase.rpc(
            'get_artifacts_with_token',
            {
              p_project_id: projectId,
              p_token: shareToken || null,
            }
          );
          
          const freshArtifact = freshArtifacts?.find((a: any) => a.id === artifact.id);
          const freshContent = freshArtifact?.content || artifact.content;
          
          // Create new collaboration with fresh artifact content
          const { data: newCollab, error: createError } = await supabase.rpc(
            'create_artifact_collaboration_with_token',
            {
              p_project_id: projectId,
              p_artifact_id: artifact.id,
              p_token: shareToken || null,
              p_title: `Collaboration on ${artifact.ai_title || 'Artifact'}`,
            }
          );

          if (createError) throw createError;
          setCollaborationId(newCollab.id);
          setLocalContent(freshContent);
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

  // Update local content when collaboration loads (only if we haven't made changes)
  // Track when we just saved to prevent the sync from overwriting our content
  const justSavedRef = useRef<boolean>(false);
  const justSavedContentRef = useRef<string>('');
  
  useEffect(() => {
    if (collaboration?.current_content && !hasUnsavedChanges) {
      // Skip sync if agent is currently editing - we get content from SSE events
      if (isAgentEditingRef.current) {
        return;
      }
      
      // Skip sync if we just saved - our content is already correct
      if (justSavedRef.current) {
        // Only clear the flag once the DB content matches what we saved
        if (collaboration.current_content === justSavedContentRef.current) {
          justSavedRef.current = false;
          justSavedContentRef.current = '';
        }
        return;
      }
      
      // Only update if we're not in the middle of saving or viewing a specific version
      if (!isSaving && viewingVersion === null) {
        setLocalContent(collaboration.current_content);
      }
    }
  }, [collaboration?.current_content, hasUnsavedChanges, isSaving, viewingVersion]);

  // Handle content changes
  const handleContentChange = useCallback((content: string) => {
    setLocalContent(content);
    setHasUnsavedChanges(true);
  }, []);

  // Save changes as an edit
  const handleSave = useCallback(async () => {
    if (!collaborationId || !hasUnsavedChanges) return;
    
    // Store the content we're about to save to prevent sync from overwriting
    const contentToSave = localContent;
    justSavedRef.current = true;
    justSavedContentRef.current = contentToSave;
    
    setIsSaving(true);
    try {
      const currentContent = collaboration?.current_content || artifact.content;
      
      // Simple diff - for now just track as a single edit
      const lines = contentToSave.split('\n');
      
      const result = await insertEdit(
        'edit',
        1,
        lines.length,
        currentContent,
        contentToSave,
        contentToSave,
        'User edit',
        'human',
        'User'
      );
      
      if (result) {
        setHasUnsavedChanges(false);
        // Reset viewing version to null so slider follows latest
        setViewingVersion(null);
        // Refresh history to show new version
        await refreshHistory();
        toast.success('Changes saved');
      } else {
        justSavedRef.current = false;
        toast.error('Failed to save changes');
      }
    } catch (error) {
      console.error('Error saving changes:', error);
      justSavedRef.current = false;
      toast.error('Failed to save changes');
    } finally {
      setIsSaving(false);
    }
  }, [collaborationId, hasUnsavedChanges, localContent, collaboration?.current_content, artifact.content, insertEdit, refreshHistory]);

  // Helper to get the correct content for a version
  // The full_content_snapshot stores the NEW content after that version's edit
  // So version N's snapshot = content AT version N
  const getContentAtVersion = useCallback((version: number): string | null => {
    const entry = history.find(h => h.version_number === version);
    return entry?.full_content_snapshot || null;
  }, [history]);

  // Handle version navigation
  const handleVersionChange = useCallback((version: number) => {
    const content = getContentAtVersion(version);
    if (content) {
      setLocalContent(content);
      setViewingVersion(version);
    }
  }, [getContentAtVersion]);

  // Handle restore - fetches fresh from DB and creates a NEW version with the content from the selected version
  const handleRestore = useCallback(async (version: number) => {
    if (!collaborationId) return;
    
    try {
      // Fetch history fresh from the database to ensure we have the latest data
      // This is critical for multi-user real-time scenarios
      const { data: historyData, error: historyError } = await supabase.rpc(
        'get_collaboration_history_with_token',
        {
          p_collaboration_id: collaborationId,
          p_token: shareToken || null,
        }
      );
      
      if (historyError) throw historyError;
      
      // Find the entry for the version we want to restore
      const entryToRestore = historyData?.find((h: any) => h.version_number === version);
      if (!entryToRestore?.full_content_snapshot) {
        console.error('Version data:', { version, entryToRestore, allVersions: historyData?.map((h: any) => h.version_number) });
        toast.error(`Cannot restore: content for version ${version} not found`);
        return;
      }
      
      const restoredContent = entryToRestore.full_content_snapshot;
      
      // Fetch current collaboration state fresh from the database
      const { data: collabData, error: collabError } = await supabase.rpc(
        'get_artifact_collaboration_with_token',
        {
          p_collaboration_id: collaborationId,
          p_token: shareToken || null,
        }
      );
      
      if (collabError) throw collabError;
      
      const currentDbContent = collabData?.current_content || artifact.content;
      
      // Don't restore if content is the same as current
      if (restoredContent === currentDbContent) {
        toast.info('Content is already the same as current version');
        return;
      }
      
      // Store the content we're about to save to prevent sync from overwriting
      justSavedRef.current = true;
      justSavedContentRef.current = restoredContent;
      
      const lines = restoredContent.split('\n');
      
      // Insert a new edit with the restored content (this creates a new version)
      const result = await insertEdit(
        'edit',
        1,
        lines.length,
        currentDbContent,
        restoredContent,
        restoredContent,
        `Restored from version ${version}`,
        'human',
        'User'
      );
      
      if (result) {
        setLocalContent(restoredContent);
        setViewingVersion(null); // This will make slider follow latest
        setHasUnsavedChanges(false);
        await refreshHistory(); // Refresh to get the new version
        toast.success(`Created new version from v${version}`);
      } else {
        justSavedRef.current = false;
        toast.error('Failed to restore version');
      }
    } catch (error) {
      console.error('Error restoring version:', error);
      justSavedRef.current = false;
      toast.error('Failed to restore version');
    }
  }, [collaborationId, shareToken, artifact.content, insertEdit, refreshHistory]);

  // Handle merge to artifact - updates the source artifact but keeps collaboration session open
  const handleMerge = useCallback(async () => {
    if (!collaborationId) return;
    
    setIsMerging(true);
    try {
      const { error } = await supabase.rpc('merge_collaboration_to_artifact_with_token', {
        p_collaboration_id: collaborationId,
        p_token: shareToken || null,
        p_close_session: false, // Keep collaboration session active, preserve history
      });
      
      if (error) throw error;
      
      toast.success('Content merged to source artifact - collaboration session remains active');
      setShowMergeDialog(false);
      onMerged?.(); // Refresh artifact list to show updated content
      // Don't call onBack() - keep the collaboration session open
    } catch (error) {
      console.error('Error merging collaboration:', error);
      toast.error('Failed to merge collaboration');
    } finally {
      setIsMerging(false);
    }
  }, [collaborationId, shareToken, onMerged]);

  // Handle chat message send with streaming
  const handleSendMessage = useCallback(async (content: string) => {
    if (!collaborationId || !projectId) return;
    
    // Add optimistic user message immediately for instant feedback
    const optimisticId = `optimistic-${Date.now()}`;
    const optimisticMsg = {
      id: optimisticId,
      role: 'user' as const,
      content,
      created_at: new Date().toISOString(),
    };
    setOptimisticMessages(prev => [...prev, optimisticMsg]);
    
    // If there are unsaved changes, save them first so the agent sees the current content
    if (hasUnsavedChanges && localContent !== collaboration?.current_content) {
      const currentContent = collaboration?.current_content || artifact.content;
      const lines = localContent.split('\n');
      
      await insertEdit(
        'edit',
        1,
        lines.length,
        currentContent,
        localContent,
        localContent,
        'User edit before agent request',
        'human',
        'User'
      );
      setHasUnsavedChanges(false);
      // Refresh history to reflect the saved version
      await refreshHistory();
    }
    
    // DO NOT call sendMessage here - the edge function inserts the user message
    // Just remove optimistic message after streaming completes
    
    setIsStreaming(true);
    setStreamingContent('');
    isAgentEditingRef.current = true; // Block sync during agent streaming
    
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
            maxIterations: 25, // Increased for complex tasks
            currentContent: localContent, // Send the current editor content
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
                // Use content directly from SSE event - no DB fetch needed
                if (event.content) {
                  setLocalContent(event.content);
                  setHasUnsavedChanges(false);
                }
                // Refresh history to update version slider (but not content)
                await refreshHistory();
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

      // Refresh only messages and history after agent completes (not full refresh to avoid flicker)
      // We already have the current content from the SSE stream
      await Promise.all([refreshMessages(), refreshHistory()]);
      
      // Reset viewing version so slider follows latest after agent saves
      setViewingVersion(null);
      
      if (lastMessage) {
        setStreamingContent('');
      }
    } catch (error) {
      console.error('Error with collaboration agent:', error);
      toast.error('Failed to get AI response');
      // Add error message - this is an error case, so we do need to add a message
      await sendMessage('assistant', 'Sorry, I encountered an error processing your request. Please try again.');
    } finally {
      setIsStreaming(false);
      setStreamingContent('');
      setOptimisticMessages([]); // Clear any remaining optimistic messages
      isAgentEditingRef.current = false; // Re-enable sync after agent is done
    }
  }, [collaborationId, projectId, shareToken, sendMessage, hasUnsavedChanges, localContent, collaboration?.current_content, artifact.content, insertEdit, refreshMessages, refreshHistory]);

  const latestVersion = useMemo(() => 
    history.length > 0 ? Math.max(...history.map(h => h.version_number)) : 0,
    [history]
  );

  const currentVersion = viewingVersion || latestVersion;

  // Map messages to the expected format - include optimistic messages
  const chatMessages: CollaborationMessage[] = useMemo(() => {
    const dbMessages = messages.map(m => ({
      id: m.id,
      role: m.role as 'user' | 'assistant',
      content: m.content,
      created_at: m.created_at,
      metadata: m.metadata,
    }));
    
    // Add optimistic messages that aren't yet in the database
    const optimisticToShow = optimisticMessages.filter(
      opt => !dbMessages.some(db => db.content === opt.content && db.role === opt.role)
    );
    
    return [...dbMessages, ...optimisticToShow].sort(
      (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    );
  }, [messages, optimisticMessages]);
  
  // Map blackboard to the expected format
  const blackboardEntries: BlackboardEntry[] = useMemo(() => blackboard.map(b => ({
    id: b.id,
    entry_type: b.entry_type,
    content: b.content,
    created_at: b.created_at,
  })), [blackboard]);

  // Map history to the expected format (includes full_content_snapshot for diff)
  const historyEntries: HistoryEntry[] = useMemo(() => history.map(h => ({
    id: h.id,
    version_number: h.version_number,
    actor_type: h.actor_type as 'human' | 'agent',
    actor_identifier: h.actor_identifier,
    operation_type: h.operation_type as 'edit' | 'insert' | 'delete',
    start_line: h.start_line,
    end_line: h.end_line,
    old_content: h.old_content,
    new_content: h.new_content,
    full_content_snapshot: h.full_content_snapshot,
    narrative: h.narrative,
    created_at: h.created_at,
  })), [history]);
  
  // Get previous version's content for diff view - compare current selected version against the version before it
  const previousVersionContent = useMemo(() => {
    if (historyEntries.length === 0 || currentVersion <= 1) return null;
    
    // Find the snapshot for the version before the currently viewed version
    const previousVersion = currentVersion - 1;
    const previousEntry = historyEntries.find(h => h.version_number === previousVersion);
    
    return previousEntry?.full_content_snapshot || null;
  }, [historyEntries, currentVersion]);

  // Early return for loading state - AFTER all hooks
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
                previousContent={previousVersionContent}
                isMarkdown={isMarkdown}
                onChange={handleContentChange}
                onSave={handleSave}
                isSaving={isSaving}
                hasUnsavedChanges={hasUnsavedChanges}
                readOnly={viewingVersion !== null && viewingVersion < latestVersion}
                currentVersion={latestVersion}
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
              blackboard={blackboardEntries}
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
    <div className="flex flex-col h-full min-h-0 bg-background overflow-hidden">
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
      <ResizablePanelGroup direction="horizontal" className="flex-1 min-h-0 overflow-hidden">
        {/* Editor panel */}
        <ResizablePanel defaultSize={60} minSize={40}>
          <div className="flex flex-col h-full">
            <CollaborationEditor
              content={localContent}
              previousContent={previousVersionContent}
              isMarkdown={isMarkdown}
              onChange={handleContentChange}
              onSave={handleSave}
              isSaving={isSaving}
              hasUnsavedChanges={hasUnsavedChanges}
              readOnly={viewingVersion !== null && viewingVersion < latestVersion}
              currentVersion={latestVersion}
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
        <ResizablePanel defaultSize={40} minSize={20}>
          <div className="h-full min-h-0 overflow-hidden">
            <CollaborationChat
              messages={chatMessages}
              blackboard={blackboardEntries}
              isStreaming={isStreaming}
              streamingContent={streamingContent}
              onSendMessage={handleSendMessage}
            />
          </div>
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
