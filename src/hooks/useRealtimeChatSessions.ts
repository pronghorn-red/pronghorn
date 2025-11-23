import { useEffect, useState } from "react";
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

    return () => {
      supabase.removeChannel(channel);
    };
  }, [projectId, enabled, shareToken]);

  const createSession = async (title: string = "New Chat") => {
    if (!projectId) return;

    try {
      const { data, error } = await supabase.rpc("insert_chat_session_with_token", {
        p_project_id: projectId,
        p_token: shareToken || null,
        p_title: title,
      });

      if (error) throw error;
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
    try {
      const { data, error } = await supabase.rpc("update_chat_session_with_token", {
        p_id: id,
        p_token: shareToken || null,
        p_title: title || null,
        p_ai_title: aiTitle || null,
        p_ai_summary: aiSummary || null,
      });

      if (error) throw error;
      toast.success("Chat session updated");
      return data;
    } catch (error) {
      console.error("Error updating chat session:", error);
      toast.error("Failed to update chat session");
      throw error;
    }
  };

  const deleteSession = async (id: string) => {
    try {
      const { error } = await supabase.rpc("delete_chat_session_with_token", {
        p_id: id,
        p_token: shareToken || null,
      });

      if (error) throw error;
      toast.success("Chat session deleted");
    } catch (error) {
      console.error("Error deleting chat session:", error);
      toast.error("Failed to delete chat session");
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
  enabled: boolean = true
) => {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(true);

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

    return () => {
      supabase.removeChannel(channel);
    };
  }, [chatSessionId, enabled, shareToken]);

  const addMessage = async (role: string, content: string) => {
    if (!chatSessionId) return;

    try {
      const { data, error } = await supabase.rpc("insert_chat_message_with_token", {
        p_chat_session_id: chatSessionId,
        p_token: shareToken || null,
        p_role: role,
        p_content: content,
      });

      if (error) throw error;
      return data;
    } catch (error) {
      console.error("Error adding message:", error);
      toast.error("Failed to send message");
      throw error;
    }
  };

  return {
    messages,
    isLoading,
    addMessage,
    refresh: loadMessages,
  };
};
