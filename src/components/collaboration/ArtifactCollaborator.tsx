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
  Users,
  Paperclip,
  AlertTriangle,
  RefreshCw,
  Save,
  Square
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
import { ProjectSelector, ProjectSelectionResult } from '@/components/project/ProjectSelector';

// Add line numbers to content for agent readability
function addLineNumbers(content: string): string {
  const lines = content.split("\n");
  return lines.map((line, i) => `<<${i + 1}>> ${line}`).join("\n");
}

// Format tool execution message for display in chat
function formatToolMessage(op: any, result: any): string {
  const opType = op.type || 'unknown';
  
  switch (opType) {
    case 'read_artifact': {
      const lineCount = result.content?.split('\n').length || 0;
      return `Read artifact content (${lineCount} lines)`;
    }
    case 'edit_lines': {
      const startLine = op.params?.start_line || '?';
      const endLine = op.params?.end_line || '?';
      const narrative = op.params?.narrative || 'Applied edit';
      // Truncate narrative if too long
      const truncatedNarrative = narrative.length > 60 
        ? narrative.slice(0, 57) + '...' 
        : narrative;
      return `edit_lines [${startLine}-${endLine}]: ${truncatedNarrative}`;
    }
    default:
      return `${opType}: ${result.success ? 'completed' : 'failed'}`;
  }
}

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
  
  // Conflict detection state
  const [baseVersionWhenEditing, setBaseVersionWhenEditing] = useState<number | null>(null);
  const [hasConflict, setHasConflict] = useState(false);
  
  // Streaming state for AI responses
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingContent, setStreamingContent] = useState('');
  
  // Client-driven iteration state
  const [streamProgress, setStreamProgress] = useState<{
    iteration: number;
    charsReceived: number;
    status: 'idle' | 'streaming' | 'processing' | 'complete';
  }>({ iteration: 0, charsReceived: 0, status: 'idle' });
  
  // Conversation history lives in client memory during task
  const conversationHistoryRef = useRef<Array<{ role: string; content: string }>>([]);
  
  // Pending operation results to send back on next iteration
  // Batch content tracking - ensures read_artifact sees latest content after edit_lines in same iteration
  const batchContentRef = useRef<string | null>(null);
  const pendingOperationResultsRef = useRef<any[]>([]);
  
  // AbortController for cancel
  const abortControllerRef = useRef<AbortController | null>(null);
  
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
  
  // Track when we're programmatically syncing content to prevent feedback loop
  // (Monaco onChange fires even for programmatic changes, which would set hasUnsavedChanges=true)
  const isSyncingContentRef = useRef<boolean>(false);
  
  // ProjectSelector state for attaching context
  const [isProjectSelectorOpen, setIsProjectSelectorOpen] = useState(false);
  const [attachedContext, setAttachedContext] = useState<ProjectSelectionResult | null>(null);
  
  // Persistent chat input state - survives tab switches and navigation
  const [chatInputValue, setChatInputValue] = useState('');

  const {
    collaboration,
    messages,
    history,
    blackboard,
    isLoading,
    latestVersion: latestVersionFromHook,
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

  // Calculate total attached items count
  const totalAttachments = useMemo(() => {
    if (!attachedContext) return 0;
    return (
      (attachedContext.projectMetadata ? 1 : 0) +
      attachedContext.artifacts.length +
      attachedContext.chatSessions.length +
      attachedContext.requirements.length +
      attachedContext.standards.length +
      attachedContext.techStacks.length +
      attachedContext.canvasNodes.length +
      attachedContext.canvasEdges.length +
      attachedContext.canvasLayers.length +
      (attachedContext.files?.length || 0) +
      (attachedContext.databases?.length || 0)
    );
  }, [attachedContext]);

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
        isSyncingContentRef.current = true;
        setLocalContent(collaboration.current_content);
        Promise.resolve().then(() => {
          isSyncingContentRef.current = false;
        });
      }
    }
  }, [collaboration?.current_content, hasUnsavedChanges, isSaving, viewingVersion]);

  // Handle content changes
  const handleContentChange = useCallback((content: string) => {
    setLocalContent(content);
    // Only mark as unsaved if this is a real user edit, not a programmatic sync
    if (!isSyncingContentRef.current) {
      setHasUnsavedChanges(true);
      // Record the version we started editing from (if not already set)
      if (baseVersionWhenEditing === null) {
        // Use the hook's latest version or calculate from history
        const currentLatest = latestVersionFromHook || (
          history.length > 0 ? Math.max(...history.map(h => h.version_number)) : 0
        );
        setBaseVersionWhenEditing(currentLatest);
      }
    }
  }, [baseVersionWhenEditing, latestVersionFromHook, history]);

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
        setBaseVersionWhenEditing(null);  // Clear base version
        setHasConflict(false);             // Clear conflict
        // Reset viewing version to null so slider follows latest
        setViewingVersion(null);
        // Refresh history to show new version
        await refreshHistory();
        toast.success(hasConflict ? 'Changes saved (overwritten remote)' : 'Changes saved');
        
        // Clear justSavedRef after a short delay as a fallback
        // This ensures we can receive updates even if another user saves first
        setTimeout(() => {
          justSavedRef.current = false;
          justSavedContentRef.current = '';
        }, 2000);
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
      isSyncingContentRef.current = true;
      setLocalContent(content);
      setViewingVersion(version);
      Promise.resolve().then(() => {
        isSyncingContentRef.current = false;
      });
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
        
        // Clear justSavedRef after a short delay as a fallback
        setTimeout(() => {
          justSavedRef.current = false;
          justSavedContentRef.current = '';
        }, 2000);
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

  // Execute operations locally (client-side)
  // Uses batchContentRef to track content changes within a single iteration
  const executeOperationLocally = useCallback(async (op: any): Promise<any> => {
    // Use batch content if we're in the middle of processing operations, else use localContent
    const currentContent = batchContentRef.current ?? localContent;
    
    if (op.type === 'read_artifact') {
      // Return current content with line numbers
      return {
        type: 'read_artifact',
        success: true,
        content: addLineNumbers(currentContent),
      };
    }
    
    if (op.type === 'edit_lines') {
      const { start_line, end_line, new_content, narrative } = op.params;
      
      // Validate new_content
      if (new_content === undefined || new_content === null) {
        return {
          type: 'edit_lines',
          success: false,
          error: 'Missing new_content in edit operation',
        };
      }
      
      const contentToInsert = typeof new_content === 'string' ? new_content : String(new_content);
      
      // Perform the edit locally using current batch content
      const lines = currentContent.split('\n');
      const before = lines.slice(0, start_line - 1);
      const after = lines.slice(end_line);
      const newLines = contentToInsert.split('\n');
      const newContentStr = [...before, ...newLines, ...after].join('\n');
      
      // Update batch ref for subsequent operations in same iteration
      batchContentRef.current = newContentStr;
      
      // Update local content state
      setLocalContent(newContentStr);
      
      // Save to database
      await insertEdit(
        'edit',
        start_line,
        end_line,
        lines.slice(start_line - 1, end_line).join('\n'),
        contentToInsert,
        newContentStr,
        narrative || 'Agent edit',
        'agent',
        'AI Agent'
      );
      
      // Refresh history slider
      await refreshHistory();
      
      toast.success(`Edit applied: ${narrative}`);
      
      return {
        type: 'edit_lines',
        success: true,
        lines_affected: `${start_line}-${end_line}`,
        narrative,
      };
    }
    
    return { type: op.type, success: false, error: 'Unknown operation' };
  }, [localContent, insertEdit, refreshHistory]);

  // Handle stop button - simple cancel
  const handleStop = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      setIsStreaming(false);
      setStreamProgress(p => ({ ...p, status: 'complete' }));
      toast.info('Stopping agent...');
    }
  }, []);

  // Handle chat message send with client-driven iteration loop
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
      await refreshHistory();
    }
    
    setIsStreaming(true);
    setStreamingContent('');
    setStreamProgress({ iteration: 0, charsReceived: 0, status: 'streaming' });
    isAgentEditingRef.current = true;
    
    // Initialize conversation with user message and document
    conversationHistoryRef.current = [{
      role: "user",
      content: `Document to collaborate on:\n${addLineNumbers(localContent)}\n\nUser request: ${content}`
    }];
    pendingOperationResultsRef.current = [];
    batchContentRef.current = null;  // Reset only at task start, not between iterations
    
    let currentIteration = 1;
    let status = 'in_progress';
    const maxIterations = 100;
    
    abortControllerRef.current = new AbortController();
    
    const orchestratorUrl = `${import.meta.env.VITE_SUPABASE_URL || 'https://obkzdksfayygnrzdqoam.supabase.co'}/functions/v1/collaboration-agent-orchestrator`;
    
    try {
      // Client-driven iteration loop
      while (status === 'in_progress' && currentIteration <= maxIterations) {
        // Check if cancelled
        if (abortControllerRef.current?.signal.aborted) {
          break;
        }
        
        setStreamProgress({ iteration: currentIteration, charsReceived: 0, status: 'streaming' });
        
        const requestBody: any = {
          collaborationId,
          projectId,
          shareToken: shareToken || null,
          iteration: currentIteration,
          maxIterations,
          conversationHistory: conversationHistoryRef.current,
          pendingOperationResults: pendingOperationResultsRef.current,
        };
        
        // Only include full context on first iteration
        if (currentIteration === 1) {
          requestBody.userMessage = content;
          requestBody.currentContent = localContent;
          requestBody.attachedContext = attachedContext ? {
            projectMetadata: attachedContext.projectMetadata || null,
            artifacts: attachedContext.artifacts.length > 0 ? attachedContext.artifacts : undefined,
            chatSessions: attachedContext.chatSessions.length > 0 ? attachedContext.chatSessions : undefined,
            requirements: attachedContext.requirements.length > 0 ? attachedContext.requirements : undefined,
            standards: attachedContext.standards.length > 0 ? attachedContext.standards : undefined,
            techStacks: attachedContext.techStacks.length > 0 ? attachedContext.techStacks : undefined,
            canvasNodes: attachedContext.canvasNodes.length > 0 ? attachedContext.canvasNodes : undefined,
            canvasEdges: attachedContext.canvasEdges.length > 0 ? attachedContext.canvasEdges : undefined,
            canvasLayers: attachedContext.canvasLayers.length > 0 ? attachedContext.canvasLayers : undefined,
            files: attachedContext.files?.length ? attachedContext.files : undefined,
            databases: attachedContext.databases?.length ? attachedContext.databases : undefined,
          } : undefined;
        }
        
        const response = await fetch(orchestratorUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9ia3pka3NmYXl5Z25yemRxb2FtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjM0MTA4MzcsImV4cCI6MjA3ODk4NjgzN30.xOKphCiEilzPTo9EGHNJqAJfruM_bijI9PN3BQBF-z8'}`,
          },
          body: JSON.stringify(requestBody),
          signal: abortControllerRef.current.signal,
        });
        
        if (!response.ok) {
          throw new Error(`Agent error: ${response.status}`);
        }
        
        // Parse SSE stream
        const reader = response.body?.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let iterationResult: any = null;
        
        if (reader) {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';
            
            for (const line of lines) {
              if (!line.startsWith('data: ')) continue;
              const dataStr = line.slice(6).trim();
              if (!dataStr) continue;
              
              try {
                const data = JSON.parse(dataStr);
                
                switch (data.type) {
                  case 'heartbeat':
                    // Keep-alive received, no action needed
                    break;
                  case 'llm_streaming':
                    // Update character count for visual feedback
                    setStreamProgress(p => ({ ...p, charsReceived: data.charsReceived }));
                    setStreamingContent(prev => (prev || '') + (data.delta || ''));
                    break;
                  case 'reasoning':
                    setStreamingContent(data.reasoning);
                    break;
                  case 'iteration_complete':
                    iterationResult = data;
                    status = data.status;
                    break;
                  case 'error':
                    throw new Error(data.message);
                }
              } catch (e) {
                if (e instanceof Error && e.message.startsWith('Agent error')) throw e;
                console.error('Error parsing SSE event:', e);
              }
            }
          }
        }
        
        if (!iterationResult) {
          throw new Error('No iteration result received');
        }
        
        // Execute operations locally and log each tool execution
        setStreamProgress(p => ({ ...p, status: 'processing' }));
        pendingOperationResultsRef.current = [];
        // NOTE: Do NOT reset batchContentRef here - it must persist across iterations
        // so that read_artifact sees the latest edited content
        
        for (const op of iterationResult.operations || []) {
          const result = await executeOperationLocally(op);
          pendingOperationResultsRef.current.push(result);
          
          // Log tool execution as a yellow message in chat
          const toolMessage = formatToolMessage(op, result);
          await sendMessage('tool', toolMessage, {
            operation_type: op.type,
            params: op.params,
            success: result.success,
            iteration: currentIteration,
          });
        }
        
        // Handle blackboard entry
        if (iterationResult.blackboardEntry) {
          await addBlackboardEntry(
            iterationResult.blackboardEntry.type || 'progress',
            iterationResult.blackboardEntry.content
          );
        }
        
        // Refresh messages after each iteration so reasoning appears in chat immediately
        await refreshMessages();
        
        // Update conversation history for next iteration
        conversationHistoryRef.current = iterationResult.conversationHistory || [];
        
        currentIteration++;
      }
      
      // Task complete
      await refreshMessages();
      await refreshHistory();
      setViewingVersion(null);
      setHasUnsavedChanges(false);
      toast.success('AI changes complete');
      
    } catch (error) {
      if ((error as Error).name === 'AbortError') {
        toast.info('Task cancelled');
      } else {
        console.error('Error with collaboration agent:', error);
        toast.error('Failed to get AI response');
        await sendMessage('assistant', 'Sorry, I encountered an error processing your request. Please try again.');
      }
    } finally {
      setIsStreaming(false);
      setStreamingContent('');
      setStreamProgress(p => ({ ...p, status: 'complete' }));
      setOptimisticMessages([]);
      isAgentEditingRef.current = false;
      abortControllerRef.current = null;
    }
  }, [collaborationId, projectId, shareToken, sendMessage, hasUnsavedChanges, localContent, collaboration?.current_content, artifact.content, insertEdit, refreshMessages, refreshHistory, attachedContext, executeOperationLocally, addBlackboardEntry]);

  // Use hook's latestVersion for real-time sync - fallback to local calculation for safety
  const latestVersion = latestVersionFromHook || (
    history.length > 0 ? Math.max(...history.map(h => h.version_number)) : 0
  );

  // Track previous latest version to detect external updates
  const prevLatestVersionRef = useRef<number>(latestVersion);
  
  // Auto-follow latest version when another user pushes a new version
  // Only auto-advance if we're already following latest (viewingVersion === null)
  // or if we're viewing what was previously the latest
  useEffect(() => {
    if (latestVersion > prevLatestVersionRef.current) {
      // A new version arrived (from another user or agent)
      
      if (justSavedRef.current) {
        // We just saved - check if this is our content being confirmed
        if (collaboration?.current_content === justSavedContentRef.current) {
          // This is our save being confirmed - clear justSavedRef
          justSavedRef.current = false;
          justSavedContentRef.current = '';
          console.log('Our save confirmed by DB');
        } else {
          // Another user saved while we were waiting for our save to confirm
          // DON'T update our content, DON'T clear justSavedRef (timeout will handle it)
          // Our content is correct - we just saved it
          console.log('Another version arrived while waiting for our save to confirm - keeping our content');
        }
        // Either way, update the version ref but don't sync content
        prevLatestVersionRef.current = latestVersion;
        return;
      }
      
      if (hasUnsavedChanges) {
        // We have unsaved changes AND another version arrived = CONFLICT
        setHasConflict(true);
        console.log('Conflict detected: new version arrived while user has unsaved changes');
        // DON'T sync content - user's work is more important
      } else if (!isAgentEditingRef.current) {
        const wasFollowingLatest = viewingVersion === null || 
          viewingVersion === prevLatestVersionRef.current;
        
        if (wasFollowingLatest) {
          // Auto-follow: keep viewing the latest
          setViewingVersion(null);
          
          // Sync content from DB - safe because we're not editing
          if (collaboration?.current_content) {
            isSyncingContentRef.current = true;
            setLocalContent(collaboration.current_content);
            Promise.resolve().then(() => {
              isSyncingContentRef.current = false;
            });
          }
        }
      }
      
      prevLatestVersionRef.current = latestVersion;
    }
  }, [latestVersion, viewingVersion, hasUnsavedChanges, collaboration?.current_content]);

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
                {hasConflict && (
                  <Badge variant="destructive" className="text-xs flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3" />
                    Conflict
                  </Badge>
                )}
                {hasUnsavedChanges && !hasConflict && (
                  <Badge variant="secondary" className="text-xs">Unsaved</Badge>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {hasConflict && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setHasUnsavedChanges(false);
                  setHasConflict(false);
                  setBaseVersionWhenEditing(null);
                  if (collaboration?.current_content) {
                    isSyncingContentRef.current = true;
                    setLocalContent(collaboration.current_content);
                    Promise.resolve().then(() => {
                      isSyncingContentRef.current = false;
                    });
                  }
                  toast.info('Synced to latest version');
                }}
                className="text-xs"
              >
                <RefreshCw className="h-3 w-3 mr-1" />
                Discard & Sync
              </Button>
            )}
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
                hasConflict={hasConflict}
                readOnly={viewingVersion !== null && viewingVersion < latestVersion}
                currentVersion={latestVersion}
                onAskAI={(message) => {
                  setChatInputValue(message);
                  handleSendMessage(message);
                  setMobileTab('chat');
                }}
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
              attachedCount={totalAttachments}
              onAttach={() => setIsProjectSelectorOpen(true)}
              onClearContext={() => setAttachedContext(null)}
              inputValue={chatInputValue}
              onInputChange={setChatInputValue}
              streamProgress={streamProgress}
              onStop={handleStop}
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

        <ProjectSelector
          projectId={projectId}
          shareToken={shareToken}
          open={isProjectSelectorOpen}
          onClose={() => setIsProjectSelectorOpen(false)}
          onConfirm={(selection) => {
            setAttachedContext(selection);
            setIsProjectSelectorOpen(false);
            toast.success("Project elements attached to collaboration context");
          }}
          initialSelection={attachedContext || undefined}
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
              {hasConflict && (
                <Badge variant="destructive" className="text-xs flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3" />
                  Conflict
                </Badge>
              )}
              {hasUnsavedChanges && !hasConflict && (
                <Badge variant="destructive" className="text-xs">Unsaved</Badge>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {hasConflict && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setHasUnsavedChanges(false);
                setHasConflict(false);
                setBaseVersionWhenEditing(null);
                if (collaboration?.current_content) {
                  isSyncingContentRef.current = true;
                  setLocalContent(collaboration.current_content);
                  Promise.resolve().then(() => {
                    isSyncingContentRef.current = false;
                  });
                }
                toast.info('Synced to latest version');
              }}
              className="text-xs"
            >
              <RefreshCw className="h-3 w-3 mr-1" />
              Discard & Sync
            </Button>
          )}
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
              hasConflict={hasConflict}
              readOnly={viewingVersion !== null && viewingVersion < latestVersion}
              currentVersion={latestVersion}
              onAskAI={(message) => {
                setChatInputValue(message);
                handleSendMessage(message);
              }}
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
              attachedCount={totalAttachments}
              onAttach={() => setIsProjectSelectorOpen(true)}
              onClearContext={() => setAttachedContext(null)}
              inputValue={chatInputValue}
              onInputChange={setChatInputValue}
              streamProgress={streamProgress}
              onStop={handleStop}
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

      <ProjectSelector
        projectId={projectId}
        shareToken={shareToken}
        open={isProjectSelectorOpen}
        onClose={() => setIsProjectSelectorOpen(false)}
        onConfirm={(selection) => {
          setAttachedContext(selection);
          setIsProjectSelectorOpen(false);
          toast.success("Project elements attached to collaboration context");
        }}
        initialSelection={attachedContext || undefined}
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
