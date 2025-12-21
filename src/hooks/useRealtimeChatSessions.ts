import { useEffect, useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface ChatSession {
  id: string;
  project_id: string;
  title: string | null;
  ai_title: string | null;
  ai_summary: string | null;
  created_at: string;
  updated_at: string;
  created_by: string | null;
}

export interface ChatMessage {
  id: string;
  chat_session_id: string;
  role: string;
  content: string;
  created_at: string;
  created_by: string | null;
}

export const useRealtimeChatSessions = (
  projectId: string | undefined,
  shareToken: string | null,
  enabled: boolean = true
) => {
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  const loadSessions = async () => {
    if (!projectId || !enabled) return;

    try {
      const { data, error } = await supabase.rpc("get_chat_sessions_with_token", {
        p_project_id: projectId,
        p_token: shareToken || null,
      });

      if (error) throw error;
      setSessions(data || []);
    } catch (error) {
      console.error("Error loading chat sessions:", error);
      toast.error("Failed to load chat sessions");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadSessions();

    if (!projectId || !enabled) return;

    const channel = supabase
      .channel(`chat-sessions-${projectId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "chat_sessions",
          filter: `project_id=eq.${projectId}`,
        },
        () => {
          loadSessions();
        }
      )
      .on("broadcast", { event: "chat_session_refresh" }, () => {
        loadSessions();
      })
      .subscribe();

    channelRef.current = channel;

    return () => {
      supabase.removeChannel(channel);
      channelRef.current = null;
    };
  }, [projectId, enabled]);

  const createSession = async (title: string = "New Chat") => {
    if (!projectId) return;

    try {
      const { data, error } = await supabase.rpc("insert_chat_session_with_token", {
        p_project_id: projectId,
        p_token: shareToken || null,
        p_title: title,
      });

      if (error) throw error;
      if (data) {
        setSessions((prev) => [data, ...prev]);
      }
      
      // Broadcast using the subscribed channel reference (like Canvas does)
      if (channelRef.current) {
        channelRef.current.send({
          type: 'broadcast',
          event: 'chat_session_refresh',
          payload: {}
        });
      }
      
      toast.success("Chat session created");
      return data;
    } catch (error) {
      console.error("Error creating chat session:", error);
      toast.error("Failed to create chat session");
      throw error;
    }
  };

  const updateSession = async (
    id: string,
    title?: string,
    aiTitle?: string,
    aiSummary?: string
  ) => {
    // Optimistic update
    const originalSessions = sessions;
    setSessions((prev) =>
      prev.map((session) =>
        session.id === id
          ? {
              ...session,
              ...(title !== undefined && { title }),
              ...(aiTitle !== undefined && { ai_title: aiTitle }),
              ...(aiSummary !== undefined && { ai_summary: aiSummary }),
            }
          : session
      )
    );

    try {
      const { data, error } = await supabase.rpc("update_chat_session_with_token", {
        p_id: id,
        p_token: shareToken || null,
        p_title: title || null,
        p_ai_title: aiTitle || null,
        p_ai_summary: aiSummary || null,
      });

      if (error) throw error;
      
      // Broadcast using the subscribed channel reference (like Canvas does)
      if (channelRef.current) {
        channelRef.current.send({
          type: 'broadcast',
          event: 'chat_session_refresh',
          payload: {}
        });
      }
      
      toast.success("Chat session updated");
      return data;
    } catch (error) {
      console.error("Error updating chat session:", error);
      toast.error("Failed to update chat session");
      // Rollback on error
      setSessions(originalSessions);
      throw error;
    }
  };

  const deleteSession = async (id: string) => {
    // Optimistic update
    const originalSessions = sessions;
    setSessions((prev) => prev.filter((session) => session.id !== id));

    try {
      const { error } = await supabase.rpc("delete_chat_session_with_token", {
        p_id: id,
        p_token: shareToken || null,
      });

      if (error) throw error;
      
      // Broadcast using the subscribed channel reference (like Canvas does)
      if (channelRef.current) {
        channelRef.current.send({
          type: 'broadcast',
          event: 'chat_session_refresh',
          payload: {}
        });
      }
      
      toast.success("Chat session deleted");
    } catch (error) {
      console.error("Error deleting chat session:", error);
      toast.error("Failed to delete chat session");
      // Rollback on error
      setSessions(originalSessions);
      throw error;
    }
  };

  return {
    sessions,
    isLoading,
    createSession,
    updateSession,
    deleteSession,
    refresh: loadSessions,
  };
};

export const useRealtimeChatMessages = (
  chatSessionId: string | undefined,
  shareToken: string | null,
  enabled: boolean = true,
  projectId?: string // Optional projectId for broadcasting session-level refresh
) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const sessionChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  const loadMessages = async () => {
    if (!chatSessionId || !enabled) return;

    try {
      const { data, error } = await supabase.rpc("get_chat_messages_with_token", {
        p_chat_session_id: chatSessionId,
        p_token: shareToken || null,
      });

      if (error) throw error;
      setMessages(data || []);
    } catch (error) {
      console.error("Error loading messages:", error);
      toast.error("Failed to load messages");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadMessages();

    if (!chatSessionId || !enabled) return;

    const channel = supabase
      .channel(`chat-messages-${chatSessionId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "chat_messages",
          filter: `chat_session_id=eq.${chatSessionId}`,
        },
        () => {
          loadMessages();
        }
      )
      .on("broadcast", { event: "chat_message_refresh" }, () => {
        loadMessages();
      })
      .subscribe();

    channelRef.current = channel;

    // Also subscribe to project-level channel for local runner sync
    let projectChannel: ReturnType<typeof supabase.channel> | null = null;
    if (projectId) {
      projectChannel = supabase
        .channel(`chat-messages-${projectId}`)
        .on("broadcast", { event: "chat_message_refresh" }, () => {
          loadMessages();
        })
        .subscribe();
      sessionChannelRef.current = projectChannel;
    }

    return () => {
      supabase.removeChannel(channel);
      channelRef.current = null;
      if (projectChannel) {
        supabase.removeChannel(projectChannel);
        sessionChannelRef.current = null;
      }
    };
  }, [chatSessionId, enabled, projectId]);

  const addMessage = async (role: string, content: string) => {
    if (!chatSessionId) return;

    // Optimistically add message to current session
    const tempId = `temp-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const optimisticMessage: ChatMessage = {
      id: tempId,
      chat_session_id: chatSessionId,
      role,
      content,
      created_at: new Date().toISOString(),
      created_by: null,
    };

    setMessages((prev) => [...prev, optimisticMessage]);

    try {
      const { data, error } = await supabase.rpc("insert_chat_message_with_token", {
        p_chat_session_id: chatSessionId,
        p_token: shareToken || null,
        p_role: role,
        p_content: content,
      });

      if (error) throw error;

      // Replace temp message with real one from DB
      if (data) {
        setMessages((prev) =>
          prev.map((m) => (m.id === tempId ? data : m))
        );
      }

      // Broadcast using the subscribed channel reference (like Canvas does)
      if (channelRef.current) {
        channelRef.current.send({
          type: 'broadcast',
          event: 'chat_message_refresh',
          payload: {}
        });
      }

      // Also broadcast to project-level channel for local runner sync
      if (projectId && sessionChannelRef.current) {
        sessionChannelRef.current.send({
          type: 'broadcast',
          event: 'chat_message_refresh',
          payload: { action: 'message_added', sessionId: chatSessionId }
        });
      }

      return data;
    } catch (error) {
      console.error("Error adding message:", error);
      toast.error("Failed to send message");
      // Roll back optimistic message on error
      setMessages((prev) => prev.filter((m) => m.id !== tempId));
      throw error;
    }
  };

  const addTemporaryMessage = (role: string, content: string): string => {
    const tempId = `temp-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const tempMessage: ChatMessage = {
      id: tempId,
      chat_session_id: chatSessionId!,
      role,
      content,
      created_at: new Date().toISOString(),
      created_by: null,
    };
    setMessages((prev) => [...prev, tempMessage]);
    return tempId;
  };

  const updateStreamingMessage = (tempId: string, content: string, realId?: string) => {
    setMessages((prev) =>
      prev.map((m) => 
        m.id === tempId 
          ? { ...m, content, ...(realId && { id: realId }) }
          : m
      )
    );
  };

  return {
    messages,
    isLoading,
    addMessage,
    addTemporaryMessage,
    updateStreamingMessage,
    refresh: loadMessages,
  };
};
