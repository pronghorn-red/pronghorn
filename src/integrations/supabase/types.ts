export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      activity_logs: {
        Row: {
          created_at: string
          id: string
          message: string
          metadata: Json | null
          project_id: string
          status: string | null
          type: string
        }
        Insert: {
          created_at?: string
          id?: string
          message: string
          metadata?: Json | null
          project_id: string
          status?: string | null
          type: string
        }
        Update: {
          created_at?: string
          id?: string
          message?: string
          metadata?: Json | null
          project_id?: string
          status?: string | null
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "activity_logs_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_blackboard: {
        Row: {
          content: string
          created_at: string
          entry_type: string
          id: string
          metadata: Json | null
          session_id: string
        }
        Insert: {
          content: string
          created_at?: string
          entry_type: string
          id?: string
          metadata?: Json | null
          session_id: string
        }
        Update: {
          content?: string
          created_at?: string
          entry_type?: string
          id?: string
          metadata?: Json | null
          session_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_blackboard_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "agent_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_file_operations: {
        Row: {
          completed_at: string | null
          created_at: string
          details: Json | null
          error_message: string | null
          file_path: string | null
          id: string
          operation_type: string
          session_id: string
          status: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          details?: Json | null
          error_message?: string | null
          file_path?: string | null
          id?: string
          operation_type: string
          session_id: string
          status?: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          details?: Json | null
          error_message?: string | null
          file_path?: string | null
          id?: string
          operation_type?: string
          session_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_file_operations_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "agent_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_messages: {
        Row: {
          content: string
          created_at: string
          id: string
          metadata: Json | null
          role: string
          session_id: string
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          metadata?: Json | null
          role: string
          session_id: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          metadata?: Json | null
          role?: string
          session_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_messages_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "agent_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_session_context: {
        Row: {
          context_data: Json
          context_type: string
          created_at: string
          id: string
          session_id: string
        }
        Insert: {
          context_data: Json
          context_type: string
          created_at?: string
          id?: string
          session_id: string
        }
        Update: {
          context_data?: Json
          context_type?: string
          created_at?: string
          id?: string
          session_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_session_context_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "agent_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_sessions: {
        Row: {
          abort_requested: boolean | null
          completed_at: string | null
          created_at: string
          created_by: string | null
          id: string
          mode: string
          project_id: string
          started_at: string
          status: string
          task_description: string | null
          updated_at: string
        }
        Insert: {
          abort_requested?: boolean | null
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          mode: string
          project_id: string
          started_at?: string
          status?: string
          task_description?: string | null
          updated_at?: string
        }
        Update: {
          abort_requested?: boolean | null
          completed_at?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          mode?: string
          project_id?: string
          started_at?: string
          status?: string
          task_description?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_sessions_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      artifacts: {
        Row: {
          ai_summary: string | null
          ai_title: string | null
          content: string
          created_at: string
          created_by: string | null
          id: string
          image_url: string | null
          project_id: string
          source_id: string | null
          source_type: string | null
          updated_at: string
        }
        Insert: {
          ai_summary?: string | null
          ai_title?: string | null
          content: string
          created_at?: string
          created_by?: string | null
          id?: string
          image_url?: string | null
          project_id: string
          source_id?: string | null
          source_type?: string | null
          updated_at?: string
        }
        Update: {
          ai_summary?: string | null
          ai_title?: string | null
          content?: string
          created_at?: string
          created_by?: string | null
          id?: string
          image_url?: string | null
          project_id?: string
          source_id?: string | null
          source_type?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "artifacts_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_findings: {
        Row: {
          audit_run_id: string
          created_at: string
          file_path: string | null
          id: string
          line_number: number | null
          message: string
          requirement_id: string | null
          severity: Database["public"]["Enums"]["audit_severity"]
        }
        Insert: {
          audit_run_id: string
          created_at?: string
          file_path?: string | null
          id?: string
          line_number?: number | null
          message: string
          requirement_id?: string | null
          severity: Database["public"]["Enums"]["audit_severity"]
        }
        Update: {
          audit_run_id?: string
          created_at?: string
          file_path?: string | null
          id?: string
          line_number?: number | null
          message?: string
          requirement_id?: string | null
          severity?: Database["public"]["Enums"]["audit_severity"]
        }
        Relationships: [
          {
            foreignKeyName: "audit_findings_audit_run_id_fkey"
            columns: ["audit_run_id"]
            isOneToOne: false
            referencedRelation: "audit_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_findings_requirement_id_fkey"
            columns: ["requirement_id"]
            isOneToOne: false
            referencedRelation: "requirements"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_runs: {
        Row: {
          completed_at: string | null
          coverage_percent: number | null
          id: string
          project_id: string
          started_at: string
          status: Database["public"]["Enums"]["build_status"]
        }
        Insert: {
          completed_at?: string | null
          coverage_percent?: number | null
          id?: string
          project_id: string
          started_at?: string
          status?: Database["public"]["Enums"]["build_status"]
        }
        Update: {
          completed_at?: string | null
          coverage_percent?: number | null
          id?: string
          project_id?: string
          started_at?: string
          status?: Database["public"]["Enums"]["build_status"]
        }
        Relationships: [
          {
            foreignKeyName: "audit_runs_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      build_sessions: {
        Row: {
          branch: string
          completed_at: string | null
          current_epoch: number
          id: string
          max_epochs: number
          preview_url: string | null
          project_id: string
          started_at: string
          status: Database["public"]["Enums"]["build_status"]
        }
        Insert: {
          branch: string
          completed_at?: string | null
          current_epoch?: number
          id?: string
          max_epochs?: number
          preview_url?: string | null
          project_id: string
          started_at?: string
          status?: Database["public"]["Enums"]["build_status"]
        }
        Update: {
          branch?: string
          completed_at?: string | null
          current_epoch?: number
          id?: string
          max_epochs?: number
          preview_url?: string | null
          project_id?: string
          started_at?: string
          status?: Database["public"]["Enums"]["build_status"]
        }
        Relationships: [
          {
            foreignKeyName: "build_sessions_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      canvas_edges: {
        Row: {
          created_at: string
          edge_type: string | null
          id: string
          label: string | null
          project_id: string
          source_id: string
          style: Json | null
          target_id: string
        }
        Insert: {
          created_at?: string
          edge_type?: string | null
          id?: string
          label?: string | null
          project_id: string
          source_id: string
          style?: Json | null
          target_id: string
        }
        Update: {
          created_at?: string
          edge_type?: string | null
          id?: string
          label?: string | null
          project_id?: string
          source_id?: string
          style?: Json | null
          target_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "canvas_edges_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "canvas_edges_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "canvas_nodes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "canvas_edges_target_id_fkey"
            columns: ["target_id"]
            isOneToOne: false
            referencedRelation: "canvas_nodes"
            referencedColumns: ["id"]
          },
        ]
      }
      canvas_layers: {
        Row: {
          created_at: string
          id: string
          name: string
          node_ids: string[]
          project_id: string
          updated_at: string
          visible: boolean
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          node_ids?: string[]
          project_id: string
          updated_at?: string
          visible?: boolean
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          node_ids?: string[]
          project_id?: string
          updated_at?: string
          visible?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "canvas_layers_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      canvas_nodes: {
        Row: {
          created_at: string
          data: Json
          id: string
          position: Json
          project_id: string
          type: Database["public"]["Enums"]["node_type"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          data?: Json
          id?: string
          position?: Json
          project_id: string
          type: Database["public"]["Enums"]["node_type"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          data?: Json
          id?: string
          position?: Json
          project_id?: string
          type?: Database["public"]["Enums"]["node_type"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "canvas_nodes_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_messages: {
        Row: {
          chat_session_id: string
          content: string
          created_at: string
          created_by: string | null
          id: string
          role: string
        }
        Insert: {
          chat_session_id: string
          content: string
          created_at?: string
          created_by?: string | null
          id?: string
          role: string
        }
        Update: {
          chat_session_id?: string
          content?: string
          created_at?: string
          created_by?: string | null
          id?: string
          role?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_messages_chat_session_id_fkey"
            columns: ["chat_session_id"]
            isOneToOne: false
            referencedRelation: "chat_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_sessions: {
        Row: {
          ai_summary: string | null
          ai_title: string | null
          created_at: string
          created_by: string | null
          id: string
          project_id: string
          title: string | null
          updated_at: string
        }
        Insert: {
          ai_summary?: string | null
          ai_title?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          project_id: string
          title?: string | null
          updated_at?: string
        }
        Update: {
          ai_summary?: string | null
          ai_title?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          project_id?: string
          title?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_sessions_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          created_at: string
          id: string
          name: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          display_name: string | null
          id: string
          org_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          org_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          org_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      project_repos: {
        Row: {
          auto_commit: boolean | null
          branch: string
          created_at: string
          id: string
          is_default: boolean
          is_prime: boolean | null
          organization: string
          project_id: string
          repo: string
          updated_at: string
        }
        Insert: {
          auto_commit?: boolean | null
          branch?: string
          created_at?: string
          id?: string
          is_default?: boolean
          is_prime?: boolean | null
          organization: string
          project_id: string
          repo: string
          updated_at?: string
        }
        Update: {
          auto_commit?: boolean | null
          branch?: string
          created_at?: string
          id?: string
          is_default?: boolean
          is_prime?: boolean | null
          organization?: string
          project_id?: string
          repo?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_repos_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_specifications: {
        Row: {
          created_at: string
          generated_spec: string
          id: string
          project_id: string
          raw_data: Json | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          generated_spec: string
          id?: string
          project_id: string
          raw_data?: Json | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          generated_spec?: string
          id?: string
          project_id?: string
          raw_data?: Json | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_specifications_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_standards: {
        Row: {
          created_at: string
          id: string
          project_id: string
          standard_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          project_id: string
          standard_id: string
        }
        Update: {
          created_at?: string
          id?: string
          project_id?: string
          standard_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_standards_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_standards_standard_id_fkey"
            columns: ["standard_id"]
            isOneToOne: false
            referencedRelation: "standards"
            referencedColumns: ["id"]
          },
        ]
      }
      project_tech_stacks: {
        Row: {
          created_at: string
          id: string
          project_id: string
          tech_stack_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          project_id: string
          tech_stack_id: string
        }
        Update: {
          created_at?: string
          id?: string
          project_id?: string
          tech_stack_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_tech_stacks_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_tech_stacks_tech_stack_id_fkey"
            columns: ["tech_stack_id"]
            isOneToOne: false
            referencedRelation: "tech_stacks"
            referencedColumns: ["id"]
          },
        ]
      }
      projects: {
        Row: {
          budget: number | null
          created_at: string
          created_by: string | null
          description: string | null
          github_branch: string | null
          github_repo: string | null
          id: string
          max_tokens: number | null
          name: string
          org_id: string
          organization: string | null
          priority: string | null
          scope: string | null
          selected_model: string | null
          share_token: string | null
          status: Database["public"]["Enums"]["project_status"]
          tags: string[] | null
          thinking_budget: number | null
          thinking_enabled: boolean | null
          timeline_end: string | null
          timeline_start: string | null
          updated_at: string
        }
        Insert: {
          budget?: number | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          github_branch?: string | null
          github_repo?: string | null
          id?: string
          max_tokens?: number | null
          name: string
          org_id: string
          organization?: string | null
          priority?: string | null
          scope?: string | null
          selected_model?: string | null
          share_token?: string | null
          status?: Database["public"]["Enums"]["project_status"]
          tags?: string[] | null
          thinking_budget?: number | null
          thinking_enabled?: boolean | null
          timeline_end?: string | null
          timeline_start?: string | null
          updated_at?: string
        }
        Update: {
          budget?: number | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          github_branch?: string | null
          github_repo?: string | null
          id?: string
          max_tokens?: number | null
          name?: string
          org_id?: string
          organization?: string | null
          priority?: string | null
          scope?: string | null
          selected_model?: string | null
          share_token?: string | null
          status?: Database["public"]["Enums"]["project_status"]
          tags?: string[] | null
          thinking_budget?: number | null
          thinking_enabled?: boolean | null
          timeline_end?: string | null
          timeline_start?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "projects_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      repo_commits: {
        Row: {
          branch: string
          commit_message: string
          commit_sha: string
          committed_at: string
          committed_by: string | null
          created_at: string
          files_changed: number
          files_metadata: Json | null
          id: string
          parent_commit_id: string | null
          project_id: string
          repo_id: string
        }
        Insert: {
          branch: string
          commit_message: string
          commit_sha: string
          committed_at?: string
          committed_by?: string | null
          created_at?: string
          files_changed?: number
          files_metadata?: Json | null
          id?: string
          parent_commit_id?: string | null
          project_id: string
          repo_id: string
        }
        Update: {
          branch?: string
          commit_message?: string
          commit_sha?: string
          committed_at?: string
          committed_by?: string | null
          created_at?: string
          files_changed?: number
          files_metadata?: Json | null
          id?: string
          parent_commit_id?: string | null
          project_id?: string
          repo_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "repo_commits_parent_commit_id_fkey"
            columns: ["parent_commit_id"]
            isOneToOne: false
            referencedRelation: "repo_commits"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "repo_commits_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "repo_commits_repo_id_fkey"
            columns: ["repo_id"]
            isOneToOne: false
            referencedRelation: "project_repos"
            referencedColumns: ["id"]
          },
        ]
      }
      repo_files: {
        Row: {
          content: string
          created_at: string
          id: string
          is_binary: boolean
          last_commit_sha: string | null
          path: string
          project_id: string
          repo_id: string
          updated_at: string
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          is_binary?: boolean
          last_commit_sha?: string | null
          path: string
          project_id: string
          repo_id: string
          updated_at?: string
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          is_binary?: boolean
          last_commit_sha?: string | null
          path?: string
          project_id?: string
          repo_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "repo_files_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "repo_files_repo_id_fkey"
            columns: ["repo_id"]
            isOneToOne: false
            referencedRelation: "project_repos"
            referencedColumns: ["id"]
          },
        ]
      }
      repo_pats: {
        Row: {
          created_at: string
          id: string
          pat: string
          repo_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          pat: string
          repo_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          pat?: string
          repo_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "repo_pats_repo_id_fkey"
            columns: ["repo_id"]
            isOneToOne: false
            referencedRelation: "project_repos"
            referencedColumns: ["id"]
          },
        ]
      }
      repo_staging: {
        Row: {
          created_at: string | null
          created_by: string | null
          file_path: string
          id: string
          is_binary: boolean
          new_content: string | null
          old_content: string | null
          old_path: string | null
          operation_type: string
          project_id: string
          repo_id: string
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          file_path: string
          id?: string
          is_binary?: boolean
          new_content?: string | null
          old_content?: string | null
          old_path?: string | null
          operation_type: string
          project_id: string
          repo_id: string
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          file_path?: string
          id?: string
          is_binary?: boolean
          new_content?: string | null
          old_content?: string | null
          old_path?: string | null
          operation_type?: string
          project_id?: string
          repo_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "repo_staging_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "repo_staging_repo_id_fkey"
            columns: ["repo_id"]
            isOneToOne: false
            referencedRelation: "project_repos"
            referencedColumns: ["id"]
          },
        ]
      }
      requirement_standards: {
        Row: {
          created_at: string
          id: string
          notes: string | null
          requirement_id: string
          standard_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          notes?: string | null
          requirement_id: string
          standard_id: string
        }
        Update: {
          created_at?: string
          id?: string
          notes?: string | null
          requirement_id?: string
          standard_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "requirement_standards_requirement_id_fkey"
            columns: ["requirement_id"]
            isOneToOne: false
            referencedRelation: "requirements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "requirement_standards_standard_id_fkey"
            columns: ["standard_id"]
            isOneToOne: false
            referencedRelation: "standards"
            referencedColumns: ["id"]
          },
        ]
      }
      requirements: {
        Row: {
          code: string | null
          content: string | null
          created_at: string
          id: string
          order_index: number
          parent_id: string | null
          project_id: string
          title: string
          type: Database["public"]["Enums"]["requirement_type"]
          updated_at: string
        }
        Insert: {
          code?: string | null
          content?: string | null
          created_at?: string
          id?: string
          order_index?: number
          parent_id?: string | null
          project_id: string
          title: string
          type: Database["public"]["Enums"]["requirement_type"]
          updated_at?: string
        }
        Update: {
          code?: string | null
          content?: string | null
          created_at?: string
          id?: string
          order_index?: number
          parent_id?: string | null
          project_id?: string
          title?: string
          type?: Database["public"]["Enums"]["requirement_type"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "requirements_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "requirements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "requirements_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      standard_attachments: {
        Row: {
          created_at: string
          description: string | null
          id: string
          name: string
          standard_id: string
          type: string
          url: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          name: string
          standard_id: string
          type: string
          url: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          standard_id?: string
          type?: string
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "standard_attachments_standard_id_fkey"
            columns: ["standard_id"]
            isOneToOne: false
            referencedRelation: "standards"
            referencedColumns: ["id"]
          },
        ]
      }
      standard_categories: {
        Row: {
          color: string | null
          created_at: string
          created_by: string | null
          description: string | null
          icon: string | null
          id: string
          is_system: boolean | null
          name: string
          order_index: number
          org_id: string | null
          updated_at: string
        }
        Insert: {
          color?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          icon?: string | null
          id?: string
          is_system?: boolean | null
          name: string
          order_index?: number
          org_id?: string | null
          updated_at?: string
        }
        Update: {
          color?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          icon?: string | null
          id?: string
          is_system?: boolean | null
          name?: string
          order_index?: number
          org_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "standard_categories_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      standards: {
        Row: {
          category_id: string
          code: string
          content: string | null
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          is_system: boolean | null
          order_index: number
          org_id: string | null
          parent_id: string | null
          title: string
          updated_at: string
        }
        Insert: {
          category_id: string
          code: string
          content?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_system?: boolean | null
          order_index?: number
          org_id?: string | null
          parent_id?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          category_id?: string
          code?: string
          content?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_system?: boolean | null
          order_index?: number
          org_id?: string | null
          parent_id?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "standards_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "standard_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "standards_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "standards_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "standards"
            referencedColumns: ["id"]
          },
        ]
      }
      tech_stack_standards: {
        Row: {
          created_at: string
          id: string
          standard_id: string
          tech_stack_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          standard_id: string
          tech_stack_id: string
        }
        Update: {
          created_at?: string
          id?: string
          standard_id?: string
          tech_stack_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tech_stack_standards_standard_id_fkey"
            columns: ["standard_id"]
            isOneToOne: false
            referencedRelation: "standards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tech_stack_standards_tech_stack_id_fkey"
            columns: ["tech_stack_id"]
            isOneToOne: false
            referencedRelation: "tech_stacks"
            referencedColumns: ["id"]
          },
        ]
      }
      tech_stacks: {
        Row: {
          color: string | null
          created_at: string
          created_by: string | null
          description: string | null
          icon: string | null
          id: string
          metadata: Json | null
          name: string
          order_index: number
          org_id: string | null
          parent_id: string | null
          type: string | null
          updated_at: string
        }
        Insert: {
          color?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          icon?: string | null
          id?: string
          metadata?: Json | null
          name: string
          order_index?: number
          org_id?: string | null
          parent_id?: string | null
          type?: string | null
          updated_at?: string
        }
        Update: {
          color?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          icon?: string | null
          id?: string
          metadata?: Json | null
          name?: string
          order_index?: number
          org_id?: string | null
          parent_id?: string | null
          type?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tech_stacks_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tech_stacks_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "tech_stacks"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      add_blackboard_entry_with_token: {
        Args: {
          p_content: string
          p_entry_type: string
          p_metadata?: Json
          p_session_id: string
          p_token: string
        }
        Returns: {
          content: string
          created_at: string
          entry_type: string
          id: string
          metadata: Json | null
          session_id: string
        }
        SetofOptions: {
          from: "*"
          to: "agent_blackboard"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      add_session_context_with_token: {
        Args: {
          p_context_data: Json
          p_context_type: string
          p_session_id: string
          p_token: string
        }
        Returns: {
          context_data: Json
          context_type: string
          created_at: string
          id: string
          session_id: string
        }
        SetofOptions: {
          from: "*"
          to: "agent_session_context"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      agent_get_artifacts_with_token: {
        Args: { p_project_id: string; p_search_term?: string; p_token: string }
        Returns: {
          ai_summary: string
          ai_title: string
          content: string
          created_at: string
          id: string
          source_type: string
        }[]
      }
      agent_get_canvas_summary_with_token: {
        Args: { p_project_id: string; p_token: string }
        Returns: {
          edges: Json
          edges_count: number
          layers_count: number
          node_types: Json
          nodes: Json
          nodes_count: number
        }[]
      }
      agent_get_project_metadata_with_token: {
        Args: { p_project_id: string; p_token: string }
        Returns: {
          budget: number
          description: string
          id: string
          max_tokens: number
          name: string
          organization: string
          priority: string
          scope: string
          selected_model: string
          status: string
          thinking_budget: number
          thinking_enabled: boolean
          timeline_end: string
          timeline_start: string
        }[]
      }
      agent_get_tech_stacks_with_token: {
        Args: { p_project_id: string; p_token: string }
        Returns: {
          description: string
          id: string
          name: string
          parent_id: string
          type: string
        }[]
      }
      agent_list_files_by_path_with_token: {
        Args: { p_path_prefix?: string; p_repo_id: string; p_token: string }
        Returns: {
          id: string
          path: string
          repo_id: string
          updated_at: string
        }[]
      }
      agent_read_file_with_token: {
        Args: { p_file_id: string; p_token: string }
        Returns: {
          content: string
          id: string
          path: string
        }[]
      }
      agent_read_multiple_files_with_token: {
        Args: { p_file_ids: string[]; p_token: string }
        Returns: {
          content: string
          id: string
          path: string
        }[]
      }
      agent_search_files_with_token: {
        Args: { p_keyword: string; p_project_id: string; p_token: string }
        Returns: {
          content: string
          id: string
          match_type: string
          path: string
        }[]
      }
      agent_search_requirements_with_token: {
        Args: { p_project_id: string; p_search_term?: string; p_token: string }
        Returns: {
          code: string
          content: string
          id: string
          order_index: number
          parent_id: string
          title: string
          type: string
        }[]
      }
      agent_search_standards_with_token: {
        Args: { p_project_id: string; p_search_term?: string; p_token: string }
        Returns: {
          category_id: string
          category_name: string
          code: string
          content: string
          description: string
          id: string
          title: string
        }[]
      }
      agent_wildcard_search_with_token: {
        Args: {
          p_project_id: string
          p_search_terms: string[]
          p_token: string
        }
        Returns: {
          content_preview: string
          id: string
          is_staged: boolean
          match_count: number
          matched_terms: string[]
          path: string
        }[]
      }
      commit_staged_with_token: {
        Args: {
          p_branch?: string
          p_commit_message: string
          p_commit_sha?: string
          p_repo_id: string
          p_token: string
        }
        Returns: {
          branch: string
          commit_message: string
          commit_sha: string
          committed_at: string
          committed_by: string | null
          created_at: string
          files_changed: number
          files_metadata: Json | null
          id: string
          parent_commit_id: string | null
          project_id: string
          repo_id: string
        }
        SetofOptions: {
          from: "*"
          to: "repo_commits"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      create_agent_session_with_token: {
        Args: {
          p_mode: string
          p_project_id: string
          p_task_description?: string
          p_token: string
        }
        Returns: {
          abort_requested: boolean | null
          completed_at: string | null
          created_at: string
          created_by: string | null
          id: string
          mode: string
          project_id: string
          started_at: string
          status: string
          task_description: string | null
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "agent_sessions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      create_file_with_token: {
        Args: {
          p_content?: string
          p_path: string
          p_repo_id: string
          p_token?: string
        }
        Returns: {
          content: string
          created_at: string
          id: string
          is_binary: boolean
          last_commit_sha: string | null
          path: string
          project_id: string
          repo_id: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "repo_files"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      create_project_repo_with_token:
        | {
            Args: {
              p_branch?: string
              p_is_default?: boolean
              p_organization: string
              p_project_id: string
              p_repo: string
              p_token: string
            }
            Returns: {
              auto_commit: boolean | null
              branch: string
              created_at: string
              id: string
              is_default: boolean
              is_prime: boolean | null
              organization: string
              project_id: string
              repo: string
              updated_at: string
            }
            SetofOptions: {
              from: "*"
              to: "project_repos"
              isOneToOne: true
              isSetofReturn: false
            }
          }
        | {
            Args: {
              p_branch?: string
              p_is_default?: boolean
              p_is_prime?: boolean
              p_organization: string
              p_project_id: string
              p_repo: string
              p_token: string
            }
            Returns: {
              auto_commit: boolean | null
              branch: string
              created_at: string
              id: string
              is_default: boolean
              is_prime: boolean | null
              organization: string
              project_id: string
              repo: string
              updated_at: string
            }
            SetofOptions: {
              from: "*"
              to: "project_repos"
              isOneToOne: true
              isSetofReturn: false
            }
          }
      delete_artifact_with_token: {
        Args: { p_id: string; p_token: string }
        Returns: undefined
      }
      delete_canvas_edge_with_token: {
        Args: { p_id: string; p_token: string }
        Returns: undefined
      }
      delete_canvas_layer_with_token: {
        Args: { p_id: string; p_token?: string }
        Returns: undefined
      }
      delete_canvas_node_with_token: {
        Args: { p_id: string; p_token: string }
        Returns: undefined
      }
      delete_chat_session_with_token: {
        Args: { p_id: string; p_token: string }
        Returns: undefined
      }
      delete_file_with_token: {
        Args: { p_file_id: string; p_token: string }
        Returns: boolean
      }
      delete_project_repo_with_token: {
        Args: { p_repo_id: string; p_token: string }
        Returns: undefined
      }
      delete_project_standard_with_token: {
        Args: { p_id: string; p_token: string }
        Returns: undefined
      }
      delete_project_tech_stack_with_token: {
        Args: { p_id: string; p_token: string }
        Returns: undefined
      }
      delete_project_with_token: {
        Args: { p_project_id: string; p_token: string }
        Returns: undefined
      }
      delete_repo_pat_with_token: {
        Args: { p_repo_id: string }
        Returns: undefined
      }
      delete_requirement_standard_with_token: {
        Args: { p_id: string; p_token: string }
        Returns: undefined
      }
      delete_requirement_with_token: {
        Args: { p_id: string; p_token: string }
        Returns: undefined
      }
      discard_staged_with_token: {
        Args: { p_repo_id: string; p_token: string }
        Returns: number
      }
      generate_requirement_code: {
        Args: { p_parent_id: string; p_project_id: string; p_type: string }
        Returns: string
      }
      get_agent_messages_by_project_with_token: {
        Args: {
          p_limit?: number
          p_offset?: number
          p_project_id: string
          p_token: string
        }
        Returns: {
          content: string
          created_at: string
          id: string
          metadata: Json
          role: string
          session_id: string
        }[]
      }
      get_agent_messages_for_chat_history_with_token: {
        Args: {
          p_limit?: number
          p_project_id: string
          p_since?: string
          p_token: string
        }
        Returns: {
          content: string
          created_at: string
          id: string
          role: string
          session_id: string
        }[]
      }
      get_agent_messages_with_token: {
        Args: { p_session_id: string; p_token: string }
        Returns: {
          content: string
          created_at: string
          id: string
          metadata: Json | null
          role: string
          session_id: string
        }[]
        SetofOptions: {
          from: "*"
          to: "agent_messages"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_agent_operations_by_project_with_token: {
        Args: {
          p_limit?: number
          p_offset?: number
          p_project_id: string
          p_token: string
        }
        Returns: {
          completed_at: string
          created_at: string
          details: Json
          error_message: string
          file_path: string
          id: string
          operation_type: string
          session_id: string
          status: string
        }[]
      }
      get_agent_operations_with_token: {
        Args: { p_session_id: string; p_token: string }
        Returns: {
          completed_at: string | null
          created_at: string
          details: Json | null
          error_message: string | null
          file_path: string | null
          id: string
          operation_type: string
          session_id: string
          status: string
        }[]
        SetofOptions: {
          from: "*"
          to: "agent_file_operations"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_agent_session_with_token: {
        Args: { p_session_id: string; p_token: string }
        Returns: {
          abort_requested: boolean | null
          completed_at: string | null
          created_at: string
          created_by: string | null
          id: string
          mode: string
          project_id: string
          started_at: string
          status: string
          task_description: string | null
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "agent_sessions"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_agent_sessions_with_token: {
        Args: { p_project_id: string; p_token: string }
        Returns: {
          abort_requested: boolean | null
          completed_at: string | null
          created_at: string
          created_by: string | null
          id: string
          mode: string
          project_id: string
          started_at: string
          status: string
          task_description: string | null
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "agent_sessions"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_artifacts_with_token: {
        Args: { p_project_id: string; p_token: string }
        Returns: {
          ai_summary: string | null
          ai_title: string | null
          content: string
          created_at: string
          created_by: string | null
          id: string
          image_url: string | null
          project_id: string
          source_id: string | null
          source_type: string | null
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "artifacts"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_blackboard_entries_with_token: {
        Args: { p_session_id: string; p_token: string }
        Returns: {
          content: string
          created_at: string
          entry_type: string
          id: string
          metadata: Json | null
          session_id: string
        }[]
        SetofOptions: {
          from: "*"
          to: "agent_blackboard"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_canvas_edges_with_token: {
        Args: { p_project_id: string; p_token: string }
        Returns: {
          created_at: string
          edge_type: string | null
          id: string
          label: string | null
          project_id: string
          source_id: string
          style: Json | null
          target_id: string
        }[]
        SetofOptions: {
          from: "*"
          to: "canvas_edges"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_canvas_layers_with_token: {
        Args: { p_project_id: string; p_token?: string }
        Returns: {
          created_at: string
          id: string
          name: string
          node_ids: string[]
          project_id: string
          updated_at: string
          visible: boolean
        }[]
        SetofOptions: {
          from: "*"
          to: "canvas_layers"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_canvas_nodes_with_token: {
        Args: { p_project_id: string; p_token: string }
        Returns: {
          created_at: string
          data: Json
          id: string
          position: Json
          project_id: string
          type: Database["public"]["Enums"]["node_type"]
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "canvas_nodes"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_chat_messages_with_token: {
        Args: { p_chat_session_id: string; p_token: string }
        Returns: {
          chat_session_id: string
          content: string
          created_at: string
          created_by: string | null
          id: string
          role: string
        }[]
        SetofOptions: {
          from: "*"
          to: "chat_messages"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_chat_sessions_with_token: {
        Args: { p_project_id: string; p_token: string }
        Returns: {
          ai_summary: string | null
          ai_title: string | null
          created_at: string
          created_by: string | null
          id: string
          project_id: string
          title: string | null
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "chat_sessions"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_commit_history_with_token: {
        Args: {
          p_branch?: string
          p_limit?: number
          p_repo_id: string
          p_token: string
        }
        Returns: {
          branch: string
          commit_message: string
          commit_sha: string
          committed_at: string
          committed_by: string | null
          created_at: string
          files_changed: number
          files_metadata: Json | null
          id: string
          parent_commit_id: string | null
          project_id: string
          repo_id: string
        }[]
        SetofOptions: {
          from: "*"
          to: "repo_commits"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_file_content_with_token: {
        Args: { p_file_id: string; p_token: string }
        Returns: {
          content: string
          id: string
          last_commit_sha: string
          path: string
          updated_at: string
        }[]
      }
      get_file_structure_with_token: {
        Args: { p_repo_id: string; p_token: string }
        Returns: Json
      }
      get_prime_repo_with_token: {
        Args: { p_project_id: string; p_token: string }
        Returns: {
          auto_commit: boolean | null
          branch: string
          created_at: string
          id: string
          is_default: boolean
          is_prime: boolean | null
          organization: string
          project_id: string
          repo: string
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "project_repos"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_project_files_with_token: {
        Args: { p_project_id: string; p_token: string }
        Returns: {
          content: string
          id: string
          last_commit_sha: string
          path: string
          repo_id: string
          updated_at: string
        }[]
      }
      get_project_repos_with_token: {
        Args: { p_project_id: string; p_token: string }
        Returns: {
          auto_commit: boolean | null
          branch: string
          created_at: string
          id: string
          is_default: boolean
          is_prime: boolean | null
          organization: string
          project_id: string
          repo: string
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "project_repos"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_project_specification_with_token: {
        Args: { p_project_id: string; p_token: string }
        Returns: {
          created_at: string
          generated_spec: string
          id: string
          project_id: string
          raw_data: Json | null
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "project_specifications"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      get_project_standards_with_token: {
        Args: { p_project_id: string; p_token: string }
        Returns: {
          created_at: string
          id: string
          project_id: string
          standard_id: string
        }[]
        SetofOptions: {
          from: "*"
          to: "project_standards"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_project_tech_stacks_with_token: {
        Args: { p_project_id: string; p_token: string }
        Returns: {
          created_at: string
          id: string
          project_id: string
          tech_stack_id: string
        }[]
        SetofOptions: {
          from: "*"
          to: "project_tech_stacks"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_project_with_token: {
        Args: { p_project_id: string; p_token: string }
        Returns: {
          budget: number | null
          created_at: string
          created_by: string | null
          description: string | null
          github_branch: string | null
          github_repo: string | null
          id: string
          max_tokens: number | null
          name: string
          org_id: string
          organization: string | null
          priority: string | null
          scope: string | null
          selected_model: string | null
          share_token: string | null
          status: Database["public"]["Enums"]["project_status"]
          tags: string[] | null
          thinking_budget: number | null
          thinking_enabled: boolean | null
          timeline_end: string | null
          timeline_start: string | null
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "projects"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      get_repo_by_id_with_token: {
        Args: { p_repo_id: string; p_token: string }
        Returns: {
          auto_commit: boolean | null
          branch: string
          created_at: string
          id: string
          is_default: boolean
          is_prime: boolean | null
          organization: string
          project_id: string
          repo: string
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "project_repos"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_repo_commits_with_token: {
        Args: { p_branch?: string; p_repo_id: string; p_token: string }
        Returns: {
          branch: string
          commit_message: string
          commit_sha: string
          committed_at: string
          committed_by: string | null
          created_at: string
          files_changed: number
          files_metadata: Json | null
          id: string
          parent_commit_id: string | null
          project_id: string
          repo_id: string
        }[]
        SetofOptions: {
          from: "*"
          to: "repo_commits"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_repo_files_with_token: {
        Args: { p_file_paths?: string[]; p_repo_id: string; p_token: string }
        Returns: {
          content: string
          path: string
        }[]
      }
      get_requirement_standards_with_token: {
        Args: { p_requirement_id: string; p_token: string }
        Returns: {
          created_at: string
          id: string
          notes: string | null
          requirement_id: string
          standard_id: string
        }[]
        SetofOptions: {
          from: "*"
          to: "requirement_standards"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_requirements_with_token: {
        Args: { p_project_id: string; p_token: string }
        Returns: {
          code: string | null
          content: string | null
          created_at: string
          id: string
          order_index: number
          parent_id: string | null
          project_id: string
          title: string
          type: Database["public"]["Enums"]["requirement_type"]
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "requirements"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_session_context_with_token: {
        Args: { p_session_id: string; p_token: string }
        Returns: {
          context_data: Json
          context_type: string
          created_at: string
          id: string
          session_id: string
        }[]
        SetofOptions: {
          from: "*"
          to: "agent_session_context"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_staged_changes_with_token: {
        Args: { p_repo_id: string; p_token: string }
        Returns: {
          created_at: string | null
          created_by: string | null
          file_path: string
          id: string
          is_binary: boolean
          new_content: string | null
          old_content: string | null
          old_path: string | null
          operation_type: string
          project_id: string
          repo_id: string
        }[]
        SetofOptions: {
          from: "*"
          to: "repo_staging"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      insert_agent_message_with_token: {
        Args: {
          p_content: string
          p_metadata?: Json
          p_role: string
          p_session_id: string
          p_token: string
        }
        Returns: {
          content: string
          created_at: string
          id: string
          metadata: Json | null
          role: string
          session_id: string
        }
        SetofOptions: {
          from: "*"
          to: "agent_messages"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      insert_artifact_with_token:
        | {
            Args: {
              p_content: string
              p_project_id: string
              p_source_id?: string
              p_source_type?: string
              p_token: string
            }
            Returns: {
              ai_summary: string | null
              ai_title: string | null
              content: string
              created_at: string
              created_by: string | null
              id: string
              image_url: string | null
              project_id: string
              source_id: string | null
              source_type: string | null
              updated_at: string
            }
            SetofOptions: {
              from: "*"
              to: "artifacts"
              isOneToOne: true
              isSetofReturn: false
            }
          }
        | {
            Args: {
              p_content: string
              p_image_url?: string
              p_project_id: string
              p_source_id?: string
              p_source_type?: string
              p_token: string
            }
            Returns: {
              ai_summary: string | null
              ai_title: string | null
              content: string
              created_at: string
              created_by: string | null
              id: string
              image_url: string | null
              project_id: string
              source_id: string | null
              source_type: string | null
              updated_at: string
            }
            SetofOptions: {
              from: "*"
              to: "artifacts"
              isOneToOne: true
              isSetofReturn: false
            }
          }
      insert_chat_message_with_token: {
        Args: {
          p_chat_session_id: string
          p_content: string
          p_role: string
          p_token: string
        }
        Returns: {
          chat_session_id: string
          content: string
          created_at: string
          created_by: string | null
          id: string
          role: string
        }
        SetofOptions: {
          from: "*"
          to: "chat_messages"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      insert_chat_session_with_token: {
        Args: { p_project_id: string; p_title?: string; p_token: string }
        Returns: {
          ai_summary: string | null
          ai_title: string | null
          created_at: string
          created_by: string | null
          id: string
          project_id: string
          title: string | null
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "chat_sessions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      insert_project_standard_with_token: {
        Args: { p_project_id: string; p_standard_id: string; p_token: string }
        Returns: {
          created_at: string
          id: string
          project_id: string
          standard_id: string
        }
        SetofOptions: {
          from: "*"
          to: "project_standards"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      insert_project_tech_stack_with_token: {
        Args: { p_project_id: string; p_tech_stack_id: string; p_token: string }
        Returns: {
          created_at: string
          id: string
          project_id: string
          tech_stack_id: string
        }
        SetofOptions: {
          from: "*"
          to: "project_tech_stacks"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      insert_project_with_token: {
        Args: {
          p_budget?: number
          p_description?: string
          p_name: string
          p_org_id: string
          p_organization?: string
          p_scope?: string
          p_status?: Database["public"]["Enums"]["project_status"]
        }
        Returns: {
          budget: number | null
          created_at: string
          created_by: string | null
          description: string | null
          github_branch: string | null
          github_repo: string | null
          id: string
          max_tokens: number | null
          name: string
          org_id: string
          organization: string | null
          priority: string | null
          scope: string | null
          selected_model: string | null
          share_token: string | null
          status: Database["public"]["Enums"]["project_status"]
          tags: string[] | null
          thinking_budget: number | null
          thinking_enabled: boolean | null
          timeline_end: string | null
          timeline_start: string | null
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "projects"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      insert_repo_pat_with_token: {
        Args: { p_pat: string; p_repo_id: string }
        Returns: {
          created_at: string
          id: string
          pat: string
          repo_id: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "repo_pats"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      insert_requirement_standard_with_token: {
        Args: {
          p_notes?: string
          p_requirement_id: string
          p_standard_id: string
          p_token: string
        }
        Returns: {
          created_at: string
          id: string
          notes: string | null
          requirement_id: string
          standard_id: string
        }
        SetofOptions: {
          from: "*"
          to: "requirement_standards"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      insert_requirement_with_token: {
        Args: {
          p_parent_id: string
          p_project_id: string
          p_title: string
          p_token: string
          p_type: Database["public"]["Enums"]["requirement_type"]
        }
        Returns: {
          code: string | null
          content: string | null
          created_at: string
          id: string
          order_index: number
          parent_id: string | null
          project_id: string
          title: string
          type: Database["public"]["Enums"]["requirement_type"]
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "requirements"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      log_agent_operation_with_token: {
        Args: {
          p_details?: Json
          p_error_message?: string
          p_file_path: string
          p_operation_type: string
          p_session_id: string
          p_status: string
          p_token?: string
        }
        Returns: {
          completed_at: string | null
          created_at: string
          details: Json | null
          error_message: string | null
          file_path: string | null
          id: string
          operation_type: string
          session_id: string
          status: string
        }
        SetofOptions: {
          from: "*"
          to: "agent_file_operations"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      log_repo_commit_with_token: {
        Args: {
          p_branch: string
          p_commit_message: string
          p_commit_sha: string
          p_files_changed: number
          p_repo_id: string
          p_token: string
        }
        Returns: {
          branch: string
          commit_message: string
          commit_sha: string
          committed_at: string
          committed_by: string | null
          created_at: string
          files_changed: number
          files_metadata: Json | null
          id: string
          parent_commit_id: string | null
          project_id: string
          repo_id: string
        }
        SetofOptions: {
          from: "*"
          to: "repo_commits"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      move_file_with_token: {
        Args: { p_file_id: string; p_new_path: string; p_token: string }
        Returns: {
          created_at: string | null
          created_by: string | null
          file_path: string
          id: string
          is_binary: boolean
          new_content: string | null
          old_content: string | null
          old_path: string | null
          operation_type: string
          project_id: string
          repo_id: string
        }
        SetofOptions: {
          from: "*"
          to: "repo_staging"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      regenerate_share_token: {
        Args: { p_project_id: string; p_token: string }
        Returns: string
      }
      rename_file_with_token: {
        Args: { p_file_id: string; p_new_path: string; p_token?: string }
        Returns: {
          content: string
          created_at: string
          id: string
          is_binary: boolean
          last_commit_sha: string | null
          path: string
          project_id: string
          repo_id: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "repo_files"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      rename_folder_with_token: {
        Args: {
          p_new_folder_path: string
          p_old_folder_path: string
          p_repo_id: string
          p_token?: string
        }
        Returns: number
      }
      request_agent_session_abort_with_token: {
        Args: { p_session_id: string; p_token: string }
        Returns: undefined
      }
      reset_repo_files_with_token: {
        Args: { p_repo_id: string; p_token: string }
        Returns: boolean
      }
      rollback_to_commit_with_token: {
        Args: { p_commit_id: string; p_repo_id: string; p_token: string }
        Returns: boolean
      }
      save_anonymous_project_to_user: {
        Args: { p_project_id: string; p_share_token: string }
        Returns: {
          budget: number | null
          created_at: string
          created_by: string | null
          description: string | null
          github_branch: string | null
          github_repo: string | null
          id: string
          max_tokens: number | null
          name: string
          org_id: string
          organization: string | null
          priority: string | null
          scope: string | null
          selected_model: string | null
          share_token: string | null
          status: Database["public"]["Enums"]["project_status"]
          tags: string[] | null
          thinking_budget: number | null
          thinking_enabled: boolean | null
          timeline_end: string | null
          timeline_start: string | null
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "projects"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      save_project_specification_with_token: {
        Args: {
          p_generated_spec: string
          p_project_id: string
          p_raw_data: Json
          p_token: string
        }
        Returns: {
          created_at: string
          generated_spec: string
          id: string
          project_id: string
          raw_data: Json | null
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "project_specifications"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      set_repo_prime_with_token: {
        Args: { p_repo_id: string; p_token: string }
        Returns: {
          auto_commit: boolean | null
          branch: string
          created_at: string
          id: string
          is_default: boolean
          is_prime: boolean | null
          organization: string
          project_id: string
          repo: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "project_repos"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      set_share_token: { Args: { token: string }; Returns: undefined }
      stage_file_change_with_token: {
        Args: {
          p_file_path: string
          p_new_content?: string
          p_old_content?: string
          p_old_path?: string
          p_operation_type: string
          p_repo_id: string
          p_token: string
        }
        Returns: {
          created_at: string | null
          created_by: string | null
          file_path: string
          id: string
          is_binary: boolean
          new_content: string | null
          old_content: string | null
          old_path: string | null
          operation_type: string
          project_id: string
          repo_id: string
        }
        SetofOptions: {
          from: "*"
          to: "repo_staging"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      unstage_file_with_token: {
        Args: { p_file_path: string; p_repo_id: string; p_token: string }
        Returns: number
      }
      unstage_files_with_token: {
        Args: { p_file_paths: string[]; p_repo_id: string; p_token: string }
        Returns: number
      }
      update_agent_operation_status_with_token: {
        Args: {
          p_error_message?: string
          p_operation_id: string
          p_status: string
          p_token?: string
        }
        Returns: {
          completed_at: string | null
          created_at: string
          details: Json | null
          error_message: string | null
          file_path: string | null
          id: string
          operation_type: string
          session_id: string
          status: string
        }
        SetofOptions: {
          from: "*"
          to: "agent_file_operations"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      update_agent_session_status_with_token: {
        Args: {
          p_completed_at?: string
          p_session_id: string
          p_status: string
          p_token: string
        }
        Returns: {
          abort_requested: boolean | null
          completed_at: string | null
          created_at: string
          created_by: string | null
          id: string
          mode: string
          project_id: string
          started_at: string
          status: string
          task_description: string | null
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "agent_sessions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      update_artifact_with_token:
        | {
            Args: {
              p_ai_summary?: string
              p_ai_title?: string
              p_content?: string
              p_id: string
              p_token: string
            }
            Returns: {
              ai_summary: string | null
              ai_title: string | null
              content: string
              created_at: string
              created_by: string | null
              id: string
              image_url: string | null
              project_id: string
              source_id: string | null
              source_type: string | null
              updated_at: string
            }
            SetofOptions: {
              from: "*"
              to: "artifacts"
              isOneToOne: true
              isSetofReturn: false
            }
          }
        | {
            Args: {
              p_ai_summary?: string
              p_ai_title?: string
              p_content?: string
              p_id: string
              p_image_url?: string
              p_token: string
            }
            Returns: {
              ai_summary: string | null
              ai_title: string | null
              content: string
              created_at: string
              created_by: string | null
              id: string
              image_url: string | null
              project_id: string
              source_id: string | null
              source_type: string | null
              updated_at: string
            }
            SetofOptions: {
              from: "*"
              to: "artifacts"
              isOneToOne: true
              isSetofReturn: false
            }
          }
      update_chat_session_with_token: {
        Args: {
          p_ai_summary?: string
          p_ai_title?: string
          p_id: string
          p_title?: string
          p_token: string
        }
        Returns: {
          ai_summary: string | null
          ai_title: string | null
          created_at: string
          created_by: string | null
          id: string
          project_id: string
          title: string | null
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "chat_sessions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      update_project_llm_settings_with_token: {
        Args: {
          p_max_tokens: number
          p_project_id: string
          p_selected_model: string
          p_thinking_budget: number
          p_thinking_enabled: boolean
          p_token: string
        }
        Returns: {
          budget: number | null
          created_at: string
          created_by: string | null
          description: string | null
          github_branch: string | null
          github_repo: string | null
          id: string
          max_tokens: number | null
          name: string
          org_id: string
          organization: string | null
          priority: string | null
          scope: string | null
          selected_model: string | null
          share_token: string | null
          status: Database["public"]["Enums"]["project_status"]
          tags: string[] | null
          thinking_budget: number | null
          thinking_enabled: boolean | null
          timeline_end: string | null
          timeline_start: string | null
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "projects"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      update_project_with_token:
        | {
            Args: {
              p_budget?: number
              p_description?: string
              p_github_repo?: string
              p_name: string
              p_organization?: string
              p_priority?: string
              p_project_id: string
              p_scope?: string
              p_tags?: string[]
              p_timeline_end?: string
              p_timeline_start?: string
              p_token: string
            }
            Returns: {
              budget: number | null
              created_at: string
              created_by: string | null
              description: string | null
              github_branch: string | null
              github_repo: string | null
              id: string
              max_tokens: number | null
              name: string
              org_id: string
              organization: string | null
              priority: string | null
              scope: string | null
              selected_model: string | null
              share_token: string | null
              status: Database["public"]["Enums"]["project_status"]
              tags: string[] | null
              thinking_budget: number | null
              thinking_enabled: boolean | null
              timeline_end: string | null
              timeline_start: string | null
              updated_at: string
            }
            SetofOptions: {
              from: "*"
              to: "projects"
              isOneToOne: true
              isSetofReturn: false
            }
          }
        | {
            Args: {
              p_description: string
              p_github_repo: string
              p_name: string
              p_project_id: string
              p_token: string
            }
            Returns: {
              budget: number | null
              created_at: string
              created_by: string | null
              description: string | null
              github_branch: string | null
              github_repo: string | null
              id: string
              max_tokens: number | null
              name: string
              org_id: string
              organization: string | null
              priority: string | null
              scope: string | null
              selected_model: string | null
              share_token: string | null
              status: Database["public"]["Enums"]["project_status"]
              tags: string[] | null
              thinking_budget: number | null
              thinking_enabled: boolean | null
              timeline_end: string | null
              timeline_start: string | null
              updated_at: string
            }
            SetofOptions: {
              from: "*"
              to: "projects"
              isOneToOne: true
              isSetofReturn: false
            }
          }
      update_requirement_standard_with_token: {
        Args: { p_id: string; p_notes: string; p_token: string }
        Returns: {
          created_at: string
          id: string
          notes: string | null
          requirement_id: string
          standard_id: string
        }
        SetofOptions: {
          from: "*"
          to: "requirement_standards"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      update_requirement_with_token: {
        Args: {
          p_content: string
          p_id: string
          p_title: string
          p_token: string
        }
        Returns: {
          code: string | null
          content: string | null
          created_at: string
          id: string
          order_index: number
          parent_id: string | null
          project_id: string
          title: string
          type: Database["public"]["Enums"]["requirement_type"]
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "requirements"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      update_staged_file_path_with_token: {
        Args: { p_new_path: string; p_staging_id: string; p_token: string }
        Returns: {
          created_at: string | null
          created_by: string | null
          file_path: string
          id: string
          is_binary: boolean
          new_content: string | null
          old_content: string | null
          old_path: string | null
          operation_type: string
          project_id: string
          repo_id: string
        }
        SetofOptions: {
          from: "*"
          to: "repo_staging"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      upsert_canvas_edge_with_token:
        | {
            Args: {
              p_id: string
              p_label: string
              p_project_id: string
              p_source_id: string
              p_target_id: string
              p_token: string
            }
            Returns: {
              created_at: string
              edge_type: string | null
              id: string
              label: string | null
              project_id: string
              source_id: string
              style: Json | null
              target_id: string
            }
            SetofOptions: {
              from: "*"
              to: "canvas_edges"
              isOneToOne: true
              isSetofReturn: false
            }
          }
        | {
            Args: {
              p_edge_type?: string
              p_id: string
              p_label: string
              p_project_id: string
              p_source_id: string
              p_style?: Json
              p_target_id: string
              p_token: string
            }
            Returns: {
              created_at: string
              edge_type: string | null
              id: string
              label: string | null
              project_id: string
              source_id: string
              style: Json | null
              target_id: string
            }
            SetofOptions: {
              from: "*"
              to: "canvas_edges"
              isOneToOne: true
              isSetofReturn: false
            }
          }
      upsert_canvas_layer_with_token: {
        Args: {
          p_id: string
          p_name?: string
          p_node_ids?: string[]
          p_project_id: string
          p_token?: string
          p_visible?: boolean
        }
        Returns: {
          created_at: string
          id: string
          name: string
          node_ids: string[]
          project_id: string
          updated_at: string
          visible: boolean
        }
        SetofOptions: {
          from: "*"
          to: "canvas_layers"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      upsert_canvas_node_with_token: {
        Args: {
          p_data: Json
          p_id: string
          p_position: Json
          p_project_id: string
          p_token: string
          p_type: Database["public"]["Enums"]["node_type"]
        }
        Returns: {
          created_at: string
          data: Json
          id: string
          position: Json
          project_id: string
          type: Database["public"]["Enums"]["node_type"]
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "canvas_nodes"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      upsert_file_with_token: {
        Args: {
          p_commit_sha?: string
          p_content: string
          p_path: string
          p_repo_id: string
          p_token: string
        }
        Returns: {
          content: string
          created_at: string
          id: string
          is_binary: boolean
          last_commit_sha: string | null
          path: string
          project_id: string
          repo_id: string
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "repo_files"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      upsert_files_batch_with_token: {
        Args: { p_files: Json; p_repo_id: string; p_token: string }
        Returns: {
          files_updated: number
          success: boolean
        }[]
      }
      validate_project_access: {
        Args: { p_project_id: string; p_token: string }
        Returns: boolean
      }
      validate_repo_access: {
        Args: { p_repo_id: string; p_token: string }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "user"
      audit_severity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW"
      build_status: "RUNNING" | "COMPLETED" | "FAILED"
      node_type:
        | "COMPONENT"
        | "API"
        | "DATABASE"
        | "SERVICE"
        | "WEBHOOK"
        | "FIREWALL"
        | "SECURITY"
        | "REQUIREMENT"
        | "STANDARD"
        | "TECH_STACK"
        | "PAGE"
        | "PROJECT"
      project_status: "DESIGN" | "AUDIT" | "BUILD"
      requirement_type: "EPIC" | "FEATURE" | "STORY" | "ACCEPTANCE_CRITERIA"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "user"],
      audit_severity: ["CRITICAL", "HIGH", "MEDIUM", "LOW"],
      build_status: ["RUNNING", "COMPLETED", "FAILED"],
      node_type: [
        "COMPONENT",
        "API",
        "DATABASE",
        "SERVICE",
        "WEBHOOK",
        "FIREWALL",
        "SECURITY",
        "REQUIREMENT",
        "STANDARD",
        "TECH_STACK",
        "PAGE",
        "PROJECT",
      ],
      project_status: ["DESIGN", "AUDIT", "BUILD"],
      requirement_type: ["EPIC", "FEATURE", "STORY", "ACCEPTANCE_CRITERIA"],
    },
  },
} as const
