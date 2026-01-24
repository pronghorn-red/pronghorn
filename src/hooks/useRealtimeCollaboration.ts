import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Database } from "@/integrations/supabase/types";

// Type aliases from generated types
type ArtifactCollaboration = Database["public"]["Tables"]["artifact_collaborations"]["Row"];
type CollaborationMessage = Database["public"]["Tables"]["artifact_collaboration_messages"]["Row"];
type CollaborationHistory = Database["public"]["Tables"]["artifact_collaboration_history"]["Row"];
type CollaborationBlackboard = Database["public"]["Tables"]["artifact_collaboration_blackboard"]["Row"];

export interface CollaborationPresence {
  tokenLabel: string;
  cursorLine: number | null;
  selection?: { start: number; end: number } | null;
  lastSeen: string;
}

export function useRealtimeCollaboration(
  collaborationId: string | null,
  shareToken: string | null,
  isTokenSet: boolean
) {
  // State
  const [collaboration, setCollaboration] = useState<ArtifactCollaboration | null>(null);
  const [messages, setMessages] = useState<CollaborationMessage[]>([]);
  const [history, setHistory] = useState<CollaborationHistory[]>([]);
  const [blackboard, setBlackboard] = useState<CollaborationBlackboard[]>([]);
  const [presence, setPresence] = useState<Map<string, CollaborationPresence>>(new Map());
  const [isLoading, setIsLoading] = useState(true);
  const [currentVersion, setCurrentVersion] = useState<number>(0);
  const [latestVersion, setLatestVersion] = useState<number>(0);

  // Refs
  const channelRef = useRef<any>(null);
  const presenceChannelRef = useRef<any>(null);

  // Load collaboration data
  const loadCollaboration = useCallback(async () => {
    if (!collaborationId || !isTokenSet) return;

    try {
      const { data, error } = await supabase.rpc("get_artifact_collaboration_with_token", {
        p_collaboration_id: collaborationId,
        p_token: shareToken,
      });

      if (error) throw error;
      if (data) {
        setCollaboration(data);
      }
    } catch (error) {
      console.error("Error loading collaboration:", error);
    }
  }, [collaborationId, shareToken, isTokenSet]);

  // Load messages
  const loadMessages = useCallback(async () => {
    if (!collaborationId || !isTokenSet) return;

    try {
      const { data, error } = await supabase.rpc("get_collaboration_messages_with_token", {
        p_collaboration_id: collaborationId,
        p_token: shareToken,
      });

      if (error) throw error;
      setMessages(data || []);
    } catch (error) {
      console.error("Error loading messages:", error);
    }
  }, [collaborationId, shareToken, isTokenSet]);

  // Load history
  const loadHistory = useCallback(async () => {
    if (!collaborationId || !isTokenSet) return;

    try {
      const { data, error } = await supabase.rpc("get_collaboration_history_with_token", {
        p_collaboration_id: collaborationId,
        p_token: shareToken,
      });

      if (error) throw error;
      setHistory(data || []);
      
      // Set latest version
      if (data && data.length > 0) {
        const maxVersion = Math.max(...data.map((h: CollaborationHistory) => h.version_number));
        setLatestVersion(maxVersion);
        setCurrentVersion(maxVersion);
      }
    } catch (error) {
      console.error("Error loading history:", error);
    }
  }, [collaborationId, shareToken, isTokenSet]);

  // Load blackboard
  const loadBlackboard = useCallback(async () => {
    if (!collaborationId || !isTokenSet) return;

    try {
      const { data, error } = await supabase.rpc("get_collaboration_blackboard_with_token", {
        p_collaboration_id: collaborationId,
        p_token: shareToken,
      });

      if (error) throw error;
      setBlackboard(data || []);
    } catch (error) {
      console.error("Error loading blackboard:", error);
    }
  }, [collaborationId, shareToken, isTokenSet]);

  // Load all data
  const loadAll = useCallback(async () => {
    setIsLoading(true);
    await Promise.all([
      loadCollaboration(),
      loadMessages(),
      loadHistory(),
      loadBlackboard(),
    ]);
    setIsLoading(false);
  }, [loadCollaboration, loadMessages, loadHistory, loadBlackboard]);

  // Send a message
  const sendMessage = useCallback(async (
    role: "user" | "assistant" | "tool",
    content: string,
    metadata?: Record<string, unknown>
  ) => {
    if (!collaborationId || !isTokenSet) return null;

    try {
      const { data, error } = await supabase.rpc("insert_collaboration_message_with_token", {
        p_collaboration_id: collaborationId,
        p_token: shareToken || "",
        p_role: role,
        p_content: content,
        p_metadata: (metadata || {}) as unknown as Database["public"]["Tables"]["artifact_collaboration_messages"]["Row"]["metadata"],
      });

      if (error) throw error;

      // Immediately add to local messages state for instant UI update
      if (data) {
        setMessages(prev => {
          // Avoid duplicates
          if (prev.some(m => m.id === data.id)) return prev;
          return [...prev, data];
        });
      }

      // Broadcast message event
      if (channelRef.current) {
        channelRef.current.send({
          type: "broadcast",
          event: "collaboration_message",
          payload: { message: data },
        });
      }

      return data;
    } catch (error) {
      console.error("Error sending message:", error);
      return null;
    }
  }, [collaborationId, shareToken, isTokenSet]);

  // Insert an edit (creates history entry)
  const insertEdit = useCallback(async (
    operationType: "edit" | "insert" | "delete",
    startLine: number,
    endLine: number,
    oldContent: string | null,
    newContent: string | null,
    fullContentSnapshot: string,
    narrative: string,
    actorType: "human" | "agent",
    actorIdentifier: string
  ) => {
    if (!collaborationId || !isTokenSet) return null;

    try {
      const { data, error } = await supabase.rpc("insert_collaboration_edit_with_token", {
        p_collaboration_id: collaborationId,
        p_token: shareToken || "",
        p_operation_type: operationType,
        p_start_line: startLine,
        p_end_line: endLine,
        p_old_content: oldContent || "",
        p_new_content: newContent || "",
        p_new_full_content: fullContentSnapshot,
        p_narrative: narrative,
        p_actor_type: actorType,
        p_actor_identifier: actorIdentifier,
      });

      if (error) throw error;

      // Update collaboration content
      await supabase.rpc("update_artifact_collaboration_with_token", {
        p_collaboration_id: collaborationId,
        p_token: shareToken,
        p_current_content: fullContentSnapshot,
      });

      // Broadcast edit event
      if (channelRef.current) {
        channelRef.current.send({
          type: "broadcast",
          event: "collaboration_edit",
          payload: {
            edit: data,
            version: data?.version_number,
            actor: actorIdentifier,
          },
        });
      }

      return data;
    } catch (error) {
      console.error("Error inserting edit:", error);
      return null;
    }
  }, [collaborationId, shareToken, isTokenSet]);

  // Restore to a specific version
  const restoreToVersion = useCallback(async (versionNumber: number) => {
    if (!collaborationId || !isTokenSet) return null;

    try {
      const { data, error } = await supabase.rpc("restore_collaboration_version_with_token", {
        p_collaboration_id: collaborationId,
        p_token: shareToken,
        p_version_number: versionNumber,
      });

      if (error) throw error;

      // Reload collaboration to get updated content
      await loadCollaboration();
      setCurrentVersion(versionNumber);

      // Broadcast restore event
      if (channelRef.current) {
        channelRef.current.send({
          type: "broadcast",
          event: "collaboration_restore",
          payload: { version: versionNumber },
        });
      }

      return data;
    } catch (error) {
      console.error("Error restoring version:", error);
      return null;
    }
  }, [collaborationId, shareToken, isTokenSet, loadCollaboration]);

  // Add blackboard entry
  const addBlackboardEntry = useCallback(async (
    entryType: "planning" | "progress" | "decision" | "reasoning" | "reflection",
    content: string,
    metadata?: Record<string, unknown>
  ) => {
    if (!collaborationId || !isTokenSet) return null;

    try {
      const { data, error } = await supabase.rpc("insert_collaboration_blackboard_with_token", {
        p_collaboration_id: collaborationId,
        p_token: shareToken || "",
        p_entry_type: entryType,
        p_content: content,
        p_metadata: (metadata || {}) as unknown as Database["public"]["Tables"]["artifact_collaboration_blackboard"]["Row"]["metadata"],
      });

      if (error) throw error;

      // Broadcast blackboard event
      if (channelRef.current) {
        channelRef.current.send({
          type: "broadcast",
          event: "collaboration_blackboard",
          payload: { entry: data },
        });
      }

      return data;
    } catch (error) {
      console.error("Error adding blackboard entry:", error);
      return null;
    }
  }, [collaborationId, shareToken, isTokenSet]);

  // Update presence (cursor position, selection)
  const updatePresence = useCallback((
    tokenLabel: string,
    cursorLine: number | null,
    selection?: { start: number; end: number } | null
  ) => {
    if (presenceChannelRef.current) {
      presenceChannelRef.current.send({
        type: "broadcast",
        event: "collaboration_presence",
        payload: {
          tokenLabel,
          cursorLine,
          selection,
          lastSeen: new Date().toISOString(),
        },
      });
    }
  }, []);

  // Set up real-time subscriptions
  useEffect(() => {
    if (!collaborationId || !isTokenSet) {
      setIsLoading(false);
      return;
    }

    // Initial load
    loadAll();

    // Refresh when tab becomes visible
    const handleVisibilityChange = () => {
      if (!document.hidden) {
        loadAll();
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);

    // Main channel for data changes
    const channel = supabase
      .channel(`collaboration-${collaborationId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "artifact_collaboration_messages",
          filter: `collaboration_id=eq.${collaborationId}`,
        },
        (payload) => {
          console.log("Collaboration message change:", payload);
          if (payload.eventType === "INSERT" && payload.new) {
            setMessages((msgs) => {
              if (msgs.some((m) => m.id === payload.new.id)) return msgs;
              return [...msgs, payload.new as CollaborationMessage];
            });
          }
        }
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "artifact_collaboration_history",
          filter: `collaboration_id=eq.${collaborationId}`,
        },
        (payload) => {
          console.log("Collaboration history change:", payload);
          if (payload.eventType === "INSERT" && payload.new) {
            const newHistory = payload.new as CollaborationHistory;
            setHistory((hist) => {
              if (hist.some((h) => h.id === newHistory.id)) return hist;
              return [...hist, newHistory];
            });
            setLatestVersion(newHistory.version_number);
            setCurrentVersion(newHistory.version_number);
          }
        }
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "artifact_collaboration_blackboard",
          filter: `collaboration_id=eq.${collaborationId}`,
        },
        (payload) => {
          console.log("Collaboration blackboard change:", payload);
          if (payload.eventType === "INSERT" && payload.new) {
            setBlackboard((bb) => {
              if (bb.some((b) => b.id === payload.new.id)) return bb;
              return [...bb, payload.new as CollaborationBlackboard];
            });
          }
        }
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "artifact_collaborations",
          filter: `id=eq.${collaborationId}`,
        },
        (payload) => {
          console.log("Collaboration updated:", payload);
          if (payload.new) {
            setCollaboration(payload.new as ArtifactCollaboration);
          }
        }
      )
      .on(
        "broadcast",
        { event: "collaboration_edit" },
        (payload) => {
          console.log("Received collaboration edit broadcast:", payload);
          // Reload collaboration content AND history for version slider
          loadCollaboration();
          loadHistory();
        }
      )
      .on(
        "broadcast",
        { event: "collaboration_restore" },
        (payload) => {
          console.log("Received collaboration restore broadcast:", payload);
          loadAll();
        }
      )
      .on(
        "broadcast",
        { event: "collaboration_message" },
        (payload) => {
          console.log("Received collaboration message broadcast:", payload);
          // Add the message directly to state for instant display
          const msg = payload.payload?.message;
          if (msg) {
            setMessages(prev => {
              // Time-window deduplication: check content + role within 5 seconds
              // This handles temporary broadcast IDs vs database IDs
              const msgTime = new Date(msg.created_at).getTime();
              const isDuplicate = prev.some(m => 
                m.role === msg.role && 
                m.content === msg.content &&
                Math.abs(new Date(m.created_at).getTime() - msgTime) < 5000
              );
              if (isDuplicate) return prev;
              
              // Add and sort by created_at
              const newMessages = [...prev, msg as CollaborationMessage];
              return newMessages.sort((a, b) => 
                new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
              );
            });
          } else {
            // Fallback: refetch if no message in payload
            loadMessages();
          }
        }
      )
      .on(
        "broadcast",
        { event: "collaboration_blackboard" },
        (payload) => {
          console.log("Received collaboration blackboard broadcast:", payload);
          loadBlackboard();
        }
      )
      .subscribe((status) => {
        console.log("Collaboration channel status:", status);
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          loadAll();
        }
      });

    channelRef.current = channel;

    // Presence channel for cursor/selection sync
    const presenceChannel = supabase
      .channel(`collaboration-presence-${collaborationId}`)
      .on(
        "broadcast",
        { event: "collaboration_presence" },
        (payload) => {
          const presenceData = payload.payload as CollaborationPresence;
          setPresence((prev) => {
            const updated = new Map(prev);
            updated.set(presenceData.tokenLabel, presenceData);
            return updated;
          });
        }
      )
      .subscribe();

    presenceChannelRef.current = presenceChannel;

    // Cleanup stale presence entries periodically
    const presenceCleanup = setInterval(() => {
      setPresence((prev) => {
        const now = new Date();
        const updated = new Map(prev);
        for (const [key, value] of updated.entries()) {
          const lastSeen = new Date(value.lastSeen);
          if (now.getTime() - lastSeen.getTime() > 30000) {
            updated.delete(key);
          }
        }
        return updated;
      });
    }, 10000);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      supabase.removeChannel(channel);
      supabase.removeChannel(presenceChannel);
      clearInterval(presenceCleanup);
      channelRef.current = null;
      presenceChannelRef.current = null;
    };
  }, [collaborationId, isTokenSet, loadAll, loadCollaboration, loadHistory, loadMessages, loadBlackboard]);

  // Get content at a specific version
  const getContentAtVersion = useCallback((versionNumber: number): string | null => {
    const historyEntry = history.find((h) => h.version_number === versionNumber);
    return historyEntry?.full_content_snapshot || null;
  }, [history]);

  // Get history entries grouped by actor
  const getHistoryByActor = useCallback(() => {
    const byActor: Record<string, CollaborationHistory[]> = {};
    for (const entry of history) {
      const actor = entry.actor_identifier || entry.actor_type;
      if (!byActor[actor]) {
        byActor[actor] = [];
      }
      byActor[actor].push(entry);
    }
    return byActor;
  }, [history]);

  return {
    // Data
    collaboration,
    messages,
    history,
    blackboard,
    presence,
    
    // State
    isLoading,
    currentVersion,
    latestVersion,
    
    // Actions
    sendMessage,
    insertEdit,
    restoreToVersion,
    addBlackboardEntry,
    updatePresence,
    
    // Utilities
    getContentAtVersion,
    getHistoryByActor,
    refresh: loadAll,
    refreshHistory: loadHistory,
    refreshMessages: loadMessages,
    refreshBlackboard: loadBlackboard,
  };
}
