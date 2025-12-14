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
      canvas_node_types: {
        Row: {
          category: string
          color_class: string
          created_at: string
          description: string | null
          display_label: string
          emoji: string | null
          icon: string
          id: string
          is_active: boolean
          is_legacy: boolean
          order_score: number
          system_name: string
          updated_at: string
        }
        Insert: {
          category?: string
          color_class: string
          created_at?: string
          description?: string | null
          display_label: string
          emoji?: string | null
          icon: string
          id?: string
          is_active?: boolean
          is_legacy?: boolean
          order_score: number
          system_name: string
          updated_at?: string
        }
        Update: {
          category?: string
          color_class?: string
          created_at?: string
          description?: string | null
          display_label?: string
          emoji?: string | null
          icon?: string
          id?: string
          is_active?: boolean
          is_legacy?: boolean
          order_score?: number
          system_name?: string
          updated_at?: string
        }
        Relationships: []
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
      deployment_issues: {
        Row: {
          created_at: string
          deployment_id: string
          file_path: string | null
          id: string
          issue_type: string
          line_number: number | null
          message: string
          metadata: Json | null
          resolved: boolean | null
          stack_trace: string | null
        }
        Insert: {
          created_at?: string
          deployment_id: string
          file_path?: string | null
          id?: string
          issue_type?: string
          line_number?: number | null
          message: string
          metadata?: Json | null
          resolved?: boolean | null
          stack_trace?: string | null
        }
        Update: {
          created_at?: string
          deployment_id?: string
          file_path?: string | null
          id?: string
          issue_type?: string
          line_number?: number | null
          message?: string
          metadata?: Json | null
          resolved?: boolean | null
          stack_trace?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "deployment_issues_deployment_id_fkey"
            columns: ["deployment_id"]
            isOneToOne: false
            referencedRelation: "project_deployments"
            referencedColumns: ["id"]
          },
        ]
      }
      deployment_logs: {
        Row: {
          created_at: string
          deployment_id: string
          id: string
          log_type: string
          message: string
          metadata: Json | null
        }
        Insert: {
          created_at?: string
          deployment_id: string
          id?: string
          log_type?: string
          message: string
          metadata?: Json | null
        }
        Update: {
          created_at?: string
          deployment_id?: string
          id?: string
          log_type?: string
          message?: string
          metadata?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "deployment_logs_deployment_id_fkey"
            columns: ["deployment_id"]
            isOneToOne: false
            referencedRelation: "project_deployments"
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
      profile_linked_projects: {
        Row: {
          created_at: string
          id: string
          project_id: string
          token: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          project_id: string
          token: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          project_id?: string
          token?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "profile_linked_projects_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          bio: string | null
          bio_image_url: string | null
          created_at: string
          display_name: string | null
          email: string | null
          id: string
          language_preference: string | null
          last_login: string | null
          org_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          bio?: string | null
          bio_image_url?: string | null
          created_at?: string
          display_name?: string | null
          email?: string | null
          id?: string
          language_preference?: string | null
          last_login?: string | null
          org_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          bio?: string | null
          bio_image_url?: string | null
          created_at?: string
          display_name?: string | null
          email?: string | null
          id?: string
          language_preference?: string | null
          last_login?: string | null
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
      project_database_sql: {
        Row: {
          created_at: string
          created_by: string | null
          database_id: string
          description: string | null
          id: string
          name: string
          project_id: string
          sql_content: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          database_id: string
          description?: string | null
          id?: string
          name: string
          project_id: string
          sql_content: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          database_id?: string
          description?: string | null
          id?: string
          name?: string
          project_id?: string
          sql_content?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_database_sql_database_id_fkey"
            columns: ["database_id"]
            isOneToOne: false
            referencedRelation: "project_databases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_database_sql_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_databases: {
        Row: {
          created_at: string
          created_by: string | null
          dashboard_url: string | null
          database_internal_name: string | null
          database_user: string | null
          has_connection_info: boolean | null
          id: string
          ip_allow_list: Json | null
          name: string
          plan: Database["public"]["Enums"]["database_plan"]
          postgres_version: string | null
          project_id: string
          provider: Database["public"]["Enums"]["database_provider"]
          region: string | null
          render_postgres_id: string | null
          status: Database["public"]["Enums"]["database_status"]
          supabase_project_id: string | null
          supabase_url: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          dashboard_url?: string | null
          database_internal_name?: string | null
          database_user?: string | null
          has_connection_info?: boolean | null
          id?: string
          ip_allow_list?: Json | null
          name: string
          plan?: Database["public"]["Enums"]["database_plan"]
          postgres_version?: string | null
          project_id: string
          provider?: Database["public"]["Enums"]["database_provider"]
          region?: string | null
          render_postgres_id?: string | null
          status?: Database["public"]["Enums"]["database_status"]
          supabase_project_id?: string | null
          supabase_url?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          dashboard_url?: string | null
          database_internal_name?: string | null
          database_user?: string | null
          has_connection_info?: boolean | null
          id?: string
          ip_allow_list?: Json | null
          name?: string
          plan?: Database["public"]["Enums"]["database_plan"]
          postgres_version?: string | null
          project_id?: string
          provider?: Database["public"]["Enums"]["database_provider"]
          region?: string | null
          render_postgres_id?: string | null
          status?: Database["public"]["Enums"]["database_status"]
          supabase_project_id?: string | null
          supabase_url?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_databases_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_deployments: {
        Row: {
          branch: string | null
          build_command: string | null
          build_folder: string
          created_at: string
          created_by: string | null
          disk_enabled: boolean | null
          disk_mount_path: string | null
          disk_name: string | null
          disk_size_gb: number | null
          env_vars: Json | null
          environment: Database["public"]["Enums"]["deployment_environment"]
          id: string
          last_deployed_at: string | null
          name: string
          platform: Database["public"]["Enums"]["deployment_platform"]
          project_id: string
          project_type: string
          render_deploy_id: string | null
          render_service_id: string | null
          repo_id: string | null
          run_command: string
          run_folder: string
          secrets: Json | null
          status: Database["public"]["Enums"]["deployment_status"]
          updated_at: string
          url: string | null
        }
        Insert: {
          branch?: string | null
          build_command?: string | null
          build_folder?: string
          created_at?: string
          created_by?: string | null
          disk_enabled?: boolean | null
          disk_mount_path?: string | null
          disk_name?: string | null
          disk_size_gb?: number | null
          env_vars?: Json | null
          environment?: Database["public"]["Enums"]["deployment_environment"]
          id?: string
          last_deployed_at?: string | null
          name: string
          platform?: Database["public"]["Enums"]["deployment_platform"]
          project_id: string
          project_type?: string
          render_deploy_id?: string | null
          render_service_id?: string | null
          repo_id?: string | null
          run_command?: string
          run_folder?: string
          secrets?: Json | null
          status?: Database["public"]["Enums"]["deployment_status"]
          updated_at?: string
          url?: string | null
        }
        Update: {
          branch?: string | null
          build_command?: string | null
          build_folder?: string
          created_at?: string
          created_by?: string | null
          disk_enabled?: boolean | null
          disk_mount_path?: string | null
          disk_name?: string | null
          disk_size_gb?: number | null
          env_vars?: Json | null
          environment?: Database["public"]["Enums"]["deployment_environment"]
          id?: string
          last_deployed_at?: string | null
          name?: string
          platform?: Database["public"]["Enums"]["deployment_platform"]
          project_id?: string
          project_type?: string
          render_deploy_id?: string | null
          render_service_id?: string | null
          repo_id?: string | null
          run_command?: string
          run_folder?: string
          secrets?: Json | null
          status?: Database["public"]["Enums"]["deployment_status"]
          updated_at?: string
          url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "project_deployments_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_deployments_repo_id_fkey"
            columns: ["repo_id"]
            isOneToOne: false
            referencedRelation: "project_repos"
            referencedColumns: ["id"]
          },
        ]
      }
      project_migrations: {
        Row: {
          created_at: string
          database_id: string
          executed_at: string
          executed_by: string | null
          id: string
          name: string | null
          object_name: string | null
          object_schema: string | null
          object_type: string
          project_id: string
          sequence_number: number
          sql_content: string
          statement_type: string
        }
        Insert: {
          created_at?: string
          database_id: string
          executed_at?: string
          executed_by?: string | null
          id?: string
          name?: string | null
          object_name?: string | null
          object_schema?: string | null
          object_type: string
          project_id: string
          sequence_number: number
          sql_content: string
          statement_type: string
        }
        Update: {
          created_at?: string
          database_id?: string
          executed_at?: string
          executed_by?: string | null
          id?: string
          name?: string | null
          object_name?: string | null
          object_schema?: string | null
          object_type?: string
          project_id?: string
          sequence_number?: number
          sql_content?: string
          statement_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_migrations_database_id_fkey"
            columns: ["database_id"]
            isOneToOne: false
            referencedRelation: "project_databases"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_migrations_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
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
          agent_id: string | null
          agent_title: string | null
          created_at: string
          generated_by_token: string | null
          generated_by_user_id: string | null
          generated_spec: string
          id: string
          is_latest: boolean | null
          project_id: string
          raw_data: Json | null
          updated_at: string
          version: number | null
        }
        Insert: {
          agent_id?: string | null
          agent_title?: string | null
          created_at?: string
          generated_by_token?: string | null
          generated_by_user_id?: string | null
          generated_spec: string
          id?: string
          is_latest?: boolean | null
          project_id: string
          raw_data?: Json | null
          updated_at?: string
          version?: number | null
        }
        Update: {
          agent_id?: string | null
          agent_title?: string | null
          created_at?: string
          generated_by_token?: string | null
          generated_by_user_id?: string | null
          generated_spec?: string
          id?: string
          is_latest?: boolean | null
          project_id?: string
          raw_data?: Json | null
          updated_at?: string
          version?: number | null
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
      project_testing_logs: {
        Row: {
          created_at: string
          deployment_id: string | null
          file_path: string | null
          id: string
          is_resolved: boolean | null
          line_number: number | null
          log_type: string
          message: string
          metadata: Json | null
          project_id: string
          resolved_at: string | null
          resolved_by: string | null
          stack_trace: string | null
        }
        Insert: {
          created_at?: string
          deployment_id?: string | null
          file_path?: string | null
          id?: string
          is_resolved?: boolean | null
          line_number?: number | null
          log_type?: string
          message: string
          metadata?: Json | null
          project_id: string
          resolved_at?: string | null
          resolved_by?: string | null
          stack_trace?: string | null
        }
        Update: {
          created_at?: string
          deployment_id?: string | null
          file_path?: string | null
          id?: string
          is_resolved?: boolean | null
          line_number?: number | null
          log_type?: string
          message?: string
          metadata?: Json | null
          project_id?: string
          resolved_at?: string | null
          resolved_by?: string | null
          stack_trace?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "project_testing_logs_deployment_id_fkey"
            columns: ["deployment_id"]
            isOneToOne: false
            referencedRelation: "project_deployments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_testing_logs_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_tokens: {
        Row: {
          created_at: string
          created_by: string | null
          expires_at: string | null
          id: string
          label: string | null
          last_used_at: string | null
          project_id: string
          role: Database["public"]["Enums"]["project_token_role"]
          token: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          label?: string | null
          last_used_at?: string | null
          project_id: string
          role?: Database["public"]["Enums"]["project_token_role"]
          token?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          label?: string | null
          last_used_at?: string | null
          project_id?: string
          role?: Database["public"]["Enums"]["project_token_role"]
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_tokens_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
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
          github_sha: string | null
          id: string
          parent_commit_id: string | null
          project_id: string
          pushed_at: string | null
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
          github_sha?: string | null
          id?: string
          parent_commit_id?: string | null
          project_id: string
          pushed_at?: string | null
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
          github_sha?: string | null
          id?: string
          parent_commit_id?: string | null
          project_id?: string
          pushed_at?: string | null
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
      authorize_project_access: {
        Args: { p_project_id: string; p_token?: string }
        Returns: Database["public"]["Enums"]["project_token_role"]
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
          github_sha: string | null
          id: string
          parent_commit_id: string | null
          project_id: string
          pushed_at: string | null
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
      create_project_repo_with_token: {
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
      create_project_token_with_token: {
        Args: {
          p_expires_at?: string
          p_label?: string
          p_project_id: string
          p_role: Database["public"]["Enums"]["project_token_role"]
          p_token: string
        }
        Returns: {
          created_at: string
          created_by: string | null
          expires_at: string | null
          id: string
          label: string | null
          last_used_at: string | null
          project_id: string
          role: Database["public"]["Enums"]["project_token_role"]
          token: string
        }
        SetofOptions: {
          from: "*"
          to: "project_tokens"
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
      delete_database_with_token: {
        Args: { p_database_id: string; p_token?: string }
        Returns: undefined
      }
      delete_deployment_with_token: {
        Args: { p_deployment_id: string; p_token: string }
        Returns: undefined
      }
      delete_file_with_token: {
        Args: { p_file_id: string; p_token: string }
        Returns: boolean
      }
      delete_migration_with_token: {
        Args: { p_migration_id: string; p_token?: string }
        Returns: undefined
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
      delete_project_token_with_token: {
        Args: { p_token: string; p_token_id: string }
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
      delete_saved_query_with_token: {
        Args: { p_query_id: string; p_token?: string }
        Returns: undefined
      }
      delete_specification_with_token: {
        Args: { p_specification_id: string; p_token: string }
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
      get_agent_messages_with_token: {
        Args: {
          p_limit?: number
          p_offset?: number
          p_project_id?: string
          p_session_id?: string
          p_since?: string
          p_token?: string
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
        Args: { p_project_id: string; p_search_term?: string; p_token?: string }
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
      get_canvas_node_types: {
        Args: { p_include_legacy?: boolean }
        Returns: {
          category: string
          color_class: string
          created_at: string
          description: string | null
          display_label: string
          emoji: string | null
          icon: string
          id: string
          is_active: boolean
          is_legacy: boolean
          order_score: number
          system_name: string
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "canvas_node_types"
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
      get_canvas_summary_with_token: {
        Args: { p_project_id: string; p_token?: string }
        Returns: {
          edges: Json
          node_types: Json
          nodes: Json
          total_edges: number
          total_nodes: number
        }[]
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
          github_sha: string | null
          id: string
          parent_commit_id: string | null
          project_id: string
          pushed_at: string | null
          repo_id: string
        }[]
        SetofOptions: {
          from: "*"
          to: "repo_commits"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_database_with_token: {
        Args: { p_database_id: string; p_token?: string }
        Returns: {
          created_at: string
          created_by: string | null
          dashboard_url: string | null
          database_internal_name: string | null
          database_user: string | null
          has_connection_info: boolean | null
          id: string
          ip_allow_list: Json | null
          name: string
          plan: Database["public"]["Enums"]["database_plan"]
          postgres_version: string | null
          project_id: string
          provider: Database["public"]["Enums"]["database_provider"]
          region: string | null
          render_postgres_id: string | null
          status: Database["public"]["Enums"]["database_status"]
          supabase_project_id: string | null
          supabase_url: string | null
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "project_databases"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      get_databases_with_token: {
        Args: { p_project_id: string; p_token?: string }
        Returns: {
          created_at: string
          created_by: string | null
          dashboard_url: string | null
          database_internal_name: string | null
          database_user: string | null
          has_connection_info: boolean | null
          id: string
          ip_allow_list: Json | null
          name: string
          plan: Database["public"]["Enums"]["database_plan"]
          postgres_version: string | null
          project_id: string
          provider: Database["public"]["Enums"]["database_provider"]
          region: string | null
          render_postgres_id: string | null
          status: Database["public"]["Enums"]["database_status"]
          supabase_project_id: string | null
          supabase_url: string | null
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "project_databases"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_deployment_logs_with_token: {
        Args: { p_deployment_id: string; p_limit?: number; p_token?: string }
        Returns: {
          created_at: string
          deployment_id: string
          id: string
          log_type: string
          message: string
          metadata: Json | null
        }[]
        SetofOptions: {
          from: "*"
          to: "deployment_logs"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_deployment_with_secrets_with_token: {
        Args: { p_deployment_id: string; p_token?: string }
        Returns: {
          branch: string | null
          build_command: string | null
          build_folder: string
          created_at: string
          created_by: string | null
          disk_enabled: boolean | null
          disk_mount_path: string | null
          disk_name: string | null
          disk_size_gb: number | null
          env_vars: Json | null
          environment: Database["public"]["Enums"]["deployment_environment"]
          id: string
          last_deployed_at: string | null
          name: string
          platform: Database["public"]["Enums"]["deployment_platform"]
          project_id: string
          project_type: string
          render_deploy_id: string | null
          render_service_id: string | null
          repo_id: string | null
          run_command: string
          run_folder: string
          secrets: Json | null
          status: Database["public"]["Enums"]["deployment_status"]
          updated_at: string
          url: string | null
        }
        SetofOptions: {
          from: "*"
          to: "project_deployments"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      get_deployments_with_token: {
        Args: { p_project_id: string; p_token?: string }
        Returns: {
          branch: string | null
          build_command: string | null
          build_folder: string
          created_at: string
          created_by: string | null
          disk_enabled: boolean | null
          disk_mount_path: string | null
          disk_name: string | null
          disk_size_gb: number | null
          env_vars: Json | null
          environment: Database["public"]["Enums"]["deployment_environment"]
          id: string
          last_deployed_at: string | null
          name: string
          platform: Database["public"]["Enums"]["deployment_platform"]
          project_id: string
          project_type: string
          render_deploy_id: string | null
          render_service_id: string | null
          repo_id: string | null
          run_command: string
          run_folder: string
          secrets: Json | null
          status: Database["public"]["Enums"]["deployment_status"]
          updated_at: string
          url: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "project_deployments"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_file_content_with_token: {
        Args: { p_file_id: string; p_token?: string }
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
      get_linked_projects: {
        Args: never
        Returns: {
          created_at: string
          id: string
          is_valid: boolean
          project_description: string
          project_id: string
          project_name: string
          project_status: Database["public"]["Enums"]["project_status"]
          project_updated_at: string
          role: Database["public"]["Enums"]["project_token_role"]
        }[]
      }
      get_migrations_with_token: {
        Args: { p_database_id: string; p_token?: string }
        Returns: {
          created_at: string
          database_id: string
          executed_at: string
          executed_by: string | null
          id: string
          name: string | null
          object_name: string | null
          object_schema: string | null
          object_type: string
          project_id: string
          sequence_number: number
          sql_content: string
          statement_type: string
        }[]
        SetofOptions: {
          from: "*"
          to: "project_migrations"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_multiple_files_with_token: {
        Args: { p_paths: string[]; p_repo_id: string; p_token?: string }
        Returns: {
          content: string
          id: string
          is_binary: boolean
          is_staged: boolean
          path: string
        }[]
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
      get_project_category_with_token: {
        Args: { p_category: string; p_project_id: string; p_token?: string }
        Returns: Json
      }
      get_project_elements_with_token: {
        Args: { p_elements: Json; p_project_id: string; p_token?: string }
        Returns: Json
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
      get_project_id_from_file: { Args: { p_file_id: string }; Returns: string }
      get_project_id_from_repo: { Args: { p_repo_id: string }; Returns: string }
      get_project_id_from_session: {
        Args: { p_session_id: string }
        Returns: string
      }
      get_project_inventory_with_token: {
        Args: { p_project_id: string; p_token?: string }
        Returns: Json
      }
      get_project_metadata_with_token: {
        Args: { p_project_id: string; p_token?: string }
        Returns: {
          budget: number
          description: string
          github_branch: string
          github_repo: string
          id: string
          max_tokens: number
          name: string
          organization: string
          priority: string
          scope: string
          selected_model: string
          status: Database["public"]["Enums"]["project_status"]
          tags: string[]
          thinking_budget: number
          thinking_enabled: boolean
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
          agent_id: string | null
          agent_title: string | null
          created_at: string
          generated_by_token: string | null
          generated_by_user_id: string | null
          generated_spec: string
          id: string
          is_latest: boolean | null
          project_id: string
          raw_data: Json | null
          updated_at: string
          version: number | null
        }
        SetofOptions: {
          from: "*"
          to: "project_specifications"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      get_project_specifications_with_token: {
        Args: {
          p_agent_id?: string
          p_latest_only?: boolean
          p_project_id: string
          p_token: string
        }
        Returns: {
          agent_id: string | null
          agent_title: string | null
          created_at: string
          generated_by_token: string | null
          generated_by_user_id: string | null
          generated_spec: string
          id: string
          is_latest: boolean | null
          project_id: string
          raw_data: Json | null
          updated_at: string
          version: number | null
        }[]
        SetofOptions: {
          from: "*"
          to: "project_specifications"
          isOneToOne: false
          isSetofReturn: true
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
      get_project_tech_stacks_detail_with_token: {
        Args: { p_project_id: string; p_token?: string }
        Returns: {
          color: string
          description: string
          icon: string
          id: string
          metadata: Json
          name: string
          type: string
        }[]
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
      get_project_tokens_with_token: {
        Args: { p_project_id: string; p_token: string }
        Returns: {
          created_at: string
          created_by: string | null
          expires_at: string | null
          id: string
          label: string | null
          last_used_at: string | null
          project_id: string
          role: Database["public"]["Enums"]["project_token_role"]
          token: string
        }[]
        SetofOptions: {
          from: "*"
          to: "project_tokens"
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
          github_sha: string | null
          id: string
          parent_commit_id: string | null
          project_id: string
          pushed_at: string | null
          repo_id: string
        }[]
        SetofOptions: {
          from: "*"
          to: "repo_commits"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_repo_file_paths_with_token: {
        Args: { p_path_prefix?: string; p_repo_id: string; p_token?: string }
        Returns: {
          id: string
          is_binary: boolean
          is_staged: boolean
          operation_type: string
          path: string
          size_bytes: number
          updated_at: string
        }[]
      }
      get_repo_files_with_token: {
        Args: {
          p_file_paths?: string[]
          p_path_prefix?: string
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
        }[]
        SetofOptions: {
          from: "*"
          to: "repo_files"
          isOneToOne: false
          isSetofReturn: true
        }
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
      get_saved_queries_with_token: {
        Args: { p_database_id: string; p_token?: string }
        Returns: {
          created_at: string
          created_by: string | null
          database_id: string
          description: string | null
          id: string
          name: string
          project_id: string
          sql_content: string
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "project_database_sql"
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
      get_specification_by_id_with_token: {
        Args: { p_specification_id: string; p_token: string }
        Returns: {
          agent_id: string | null
          agent_title: string | null
          created_at: string
          generated_by_token: string | null
          generated_by_user_id: string | null
          generated_spec: string
          id: string
          is_latest: boolean | null
          project_id: string
          raw_data: Json | null
          updated_at: string
          version: number | null
        }
        SetofOptions: {
          from: "*"
          to: "project_specifications"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      get_specification_versions_with_token: {
        Args: { p_agent_id: string; p_project_id: string; p_token: string }
        Returns: {
          agent_id: string | null
          agent_title: string | null
          created_at: string
          generated_by_token: string | null
          generated_by_user_id: string | null
          generated_spec: string
          id: string
          is_latest: boolean | null
          project_id: string
          raw_data: Json | null
          updated_at: string
          version: number | null
        }[]
        SetofOptions: {
          from: "*"
          to: "project_specifications"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_staged_changes_with_token: {
        Args: { p_repo_id: string; p_token?: string }
        Returns: {
          created_at: string
          file_path: string
          id: string
          is_binary: boolean
          new_content: string
          old_content: string
          old_path: string
          operation_type: string
        }[]
      }
      get_testing_logs_with_token: {
        Args: {
          p_deployment_id: string
          p_limit?: number
          p_token?: string
          p_unresolved_only?: boolean
        }
        Returns: {
          created_at: string
          deployment_id: string | null
          file_path: string | null
          id: string
          is_resolved: boolean | null
          line_number: number | null
          log_type: string
          message: string
          metadata: Json | null
          project_id: string
          resolved_at: string | null
          resolved_by: string | null
          stack_trace: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "project_testing_logs"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_user_project_role_with_token: {
        Args: { p_project_id: string; p_token?: string }
        Returns: string
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
      insert_artifact_with_token: {
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
      insert_database_with_token: {
        Args: {
          p_database_internal_name?: string
          p_database_user?: string
          p_ip_allow_list?: Json
          p_name?: string
          p_plan?: Database["public"]["Enums"]["database_plan"]
          p_postgres_version?: string
          p_project_id: string
          p_provider?: Database["public"]["Enums"]["database_provider"]
          p_region?: string
          p_token?: string
        }
        Returns: {
          created_at: string
          created_by: string | null
          dashboard_url: string | null
          database_internal_name: string | null
          database_user: string | null
          has_connection_info: boolean | null
          id: string
          ip_allow_list: Json | null
          name: string
          plan: Database["public"]["Enums"]["database_plan"]
          postgres_version: string | null
          project_id: string
          provider: Database["public"]["Enums"]["database_provider"]
          region: string | null
          render_postgres_id: string | null
          status: Database["public"]["Enums"]["database_status"]
          supabase_project_id: string | null
          supabase_url: string | null
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "project_databases"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      insert_deployment_log_with_token: {
        Args: {
          p_deployment_id: string
          p_log_type: string
          p_message: string
          p_metadata?: Json
          p_token: string
        }
        Returns: {
          created_at: string
          deployment_id: string
          id: string
          log_type: string
          message: string
          metadata: Json | null
        }
        SetofOptions: {
          from: "*"
          to: "deployment_logs"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      insert_deployment_with_token:
        | {
            Args: {
              p_branch?: string
              p_build_command?: string
              p_build_folder?: string
              p_disk_enabled?: boolean
              p_disk_mount_path?: string
              p_disk_name?: string
              p_disk_size_gb?: number
              p_env_vars?: Json
              p_environment?: Database["public"]["Enums"]["deployment_environment"]
              p_name?: string
              p_platform?: Database["public"]["Enums"]["deployment_platform"]
              p_project_id: string
              p_project_type?: string
              p_run_command?: string
              p_run_folder?: string
              p_token?: string
            }
            Returns: {
              branch: string | null
              build_command: string | null
              build_folder: string
              created_at: string
              created_by: string | null
              disk_enabled: boolean | null
              disk_mount_path: string | null
              disk_name: string | null
              disk_size_gb: number | null
              env_vars: Json | null
              environment: Database["public"]["Enums"]["deployment_environment"]
              id: string
              last_deployed_at: string | null
              name: string
              platform: Database["public"]["Enums"]["deployment_platform"]
              project_id: string
              project_type: string
              render_deploy_id: string | null
              render_service_id: string | null
              repo_id: string | null
              run_command: string
              run_folder: string
              secrets: Json | null
              status: Database["public"]["Enums"]["deployment_status"]
              updated_at: string
              url: string | null
            }
            SetofOptions: {
              from: "*"
              to: "project_deployments"
              isOneToOne: true
              isSetofReturn: false
            }
          }
        | {
            Args: {
              p_branch?: string
              p_build_command?: string
              p_build_folder?: string
              p_environment?: Database["public"]["Enums"]["deployment_environment"]
              p_name?: string
              p_platform?: Database["public"]["Enums"]["deployment_platform"]
              p_project_id: string
              p_project_type?: string
              p_repo_id?: string
              p_run_command?: string
              p_run_folder?: string
              p_token?: string
            }
            Returns: {
              branch: string | null
              build_command: string | null
              build_folder: string
              created_at: string
              created_by: string | null
              disk_enabled: boolean | null
              disk_mount_path: string | null
              disk_name: string | null
              disk_size_gb: number | null
              env_vars: Json | null
              environment: Database["public"]["Enums"]["deployment_environment"]
              id: string
              last_deployed_at: string | null
              name: string
              platform: Database["public"]["Enums"]["deployment_platform"]
              project_id: string
              project_type: string
              render_deploy_id: string | null
              render_service_id: string | null
              repo_id: string | null
              run_command: string
              run_folder: string
              secrets: Json | null
              status: Database["public"]["Enums"]["deployment_status"]
              updated_at: string
              url: string | null
            }
            SetofOptions: {
              from: "*"
              to: "project_deployments"
              isOneToOne: true
              isSetofReturn: false
            }
          }
        | {
            Args: {
              p_branch?: string
              p_build_command?: string
              p_build_folder?: string
              p_env_vars?: Json
              p_environment?: Database["public"]["Enums"]["deployment_environment"]
              p_name?: string
              p_platform?: Database["public"]["Enums"]["deployment_platform"]
              p_project_id: string
              p_project_type?: string
              p_repo_id?: string
              p_run_command?: string
              p_run_folder?: string
              p_token?: string
            }
            Returns: {
              branch: string | null
              build_command: string | null
              build_folder: string
              created_at: string
              created_by: string | null
              disk_enabled: boolean | null
              disk_mount_path: string | null
              disk_name: string | null
              disk_size_gb: number | null
              env_vars: Json | null
              environment: Database["public"]["Enums"]["deployment_environment"]
              id: string
              last_deployed_at: string | null
              name: string
              platform: Database["public"]["Enums"]["deployment_platform"]
              project_id: string
              project_type: string
              render_deploy_id: string | null
              render_service_id: string | null
              repo_id: string | null
              run_command: string
              run_folder: string
              secrets: Json | null
              status: Database["public"]["Enums"]["deployment_status"]
              updated_at: string
              url: string | null
            }
            SetofOptions: {
              from: "*"
              to: "project_deployments"
              isOneToOne: true
              isSetofReturn: false
            }
          }
      insert_migration_with_token: {
        Args: {
          p_database_id: string
          p_name?: string
          p_object_name?: string
          p_object_schema?: string
          p_object_type: string
          p_sql_content: string
          p_statement_type: string
          p_token?: string
        }
        Returns: {
          created_at: string
          database_id: string
          executed_at: string
          executed_by: string | null
          id: string
          name: string | null
          object_name: string | null
          object_schema: string | null
          object_type: string
          project_id: string
          sequence_number: number
          sql_content: string
          statement_type: string
        }
        SetofOptions: {
          from: "*"
          to: "project_migrations"
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
          id: string
          share_token: string
        }[]
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
      insert_saved_query_with_token: {
        Args: {
          p_database_id: string
          p_description?: string
          p_name: string
          p_sql_content: string
          p_token?: string
        }
        Returns: {
          created_at: string
          created_by: string | null
          database_id: string
          description: string | null
          id: string
          name: string
          project_id: string
          sql_content: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "project_database_sql"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      insert_specification_with_token: {
        Args: {
          p_agent_id: string
          p_agent_title: string
          p_generated_spec: string
          p_project_id: string
          p_raw_data?: Json
          p_token: string
        }
        Returns: {
          agent_id: string | null
          agent_title: string | null
          created_at: string
          generated_by_token: string | null
          generated_by_user_id: string | null
          generated_spec: string
          id: string
          is_latest: boolean | null
          project_id: string
          raw_data: Json | null
          updated_at: string
          version: number | null
        }
        SetofOptions: {
          from: "*"
          to: "project_specifications"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      insert_testing_log_with_token: {
        Args: {
          p_deployment_id: string
          p_file_path?: string
          p_line_number?: number
          p_log_type?: string
          p_message?: string
          p_metadata?: Json
          p_stack_trace?: string
          p_token?: string
        }
        Returns: {
          created_at: string
          deployment_id: string | null
          file_path: string | null
          id: string
          is_resolved: boolean | null
          line_number: number | null
          log_type: string
          message: string
          metadata: Json | null
          project_id: string
          resolved_at: string | null
          resolved_by: string | null
          stack_trace: string | null
        }
        SetofOptions: {
          from: "*"
          to: "project_testing_logs"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      is_admin: { Args: never; Returns: boolean }
      is_project_owner: { Args: { p_project_id: string }; Returns: boolean }
      is_valid_token_for_project: {
        Args: { p_project_id: string }
        Returns: boolean
      }
      link_shared_project: {
        Args: { p_project_id: string; p_token: string }
        Returns: Json
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
          github_sha: string | null
          id: string
          parent_commit_id: string | null
          project_id: string
          pushed_at: string | null
          repo_id: string
        }
        SetofOptions: {
          from: "*"
          to: "repo_commits"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      mark_commits_pushed_with_token: {
        Args: {
          p_branch?: string
          p_github_sha: string
          p_repo_id: string
          p_token: string
        }
        Returns: number
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
      require_role: {
        Args: {
          p_min_role: Database["public"]["Enums"]["project_token_role"]
          p_project_id: string
          p_token: string
        }
        Returns: Database["public"]["Enums"]["project_token_role"]
      }
      reset_repo_files_with_token: {
        Args: { p_repo_id: string; p_token: string }
        Returns: boolean
      }
      resolve_testing_log_with_token: {
        Args: { p_log_id: string; p_token?: string }
        Returns: {
          created_at: string
          deployment_id: string | null
          file_path: string | null
          id: string
          is_resolved: boolean | null
          line_number: number | null
          log_type: string
          message: string
          metadata: Json | null
          project_id: string
          resolved_at: string | null
          resolved_by: string | null
          stack_trace: string | null
        }
        SetofOptions: {
          from: "*"
          to: "project_testing_logs"
          isOneToOne: true
          isSetofReturn: false
        }
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
          agent_id: string | null
          agent_title: string | null
          created_at: string
          generated_by_token: string | null
          generated_by_user_id: string | null
          generated_spec: string
          id: string
          is_latest: boolean | null
          project_id: string
          raw_data: Json | null
          updated_at: string
          version: number | null
        }
        SetofOptions: {
          from: "*"
          to: "project_specifications"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      search_file_content_with_token: {
        Args: { p_repo_id: string; p_search_term: string; p_token?: string }
        Returns: {
          content: string
          id: string
          is_staged: boolean
          match_count: number
          path: string
        }[]
      }
      search_requirements_with_token: {
        Args: { p_project_id: string; p_search_term: string; p_token?: string }
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
      search_standards_with_token: {
        Args: { p_project_id: string; p_search_term: string; p_token?: string }
        Returns: {
          category_name: string
          code: string
          content: string
          description: string
          id: string
          title: string
        }[]
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
      set_specification_latest_with_token: {
        Args: { p_specification_id: string; p_token: string }
        Returns: {
          agent_id: string | null
          agent_title: string | null
          created_at: string
          generated_by_token: string | null
          generated_by_user_id: string | null
          generated_spec: string
          id: string
          is_latest: boolean | null
          project_id: string
          raw_data: Json | null
          updated_at: string
          version: number | null
        }
        SetofOptions: {
          from: "*"
          to: "project_specifications"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      stage_file_change_with_token: {
        Args: {
          p_file_path: string
          p_is_binary?: boolean
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
      unlink_shared_project: {
        Args: { p_project_id: string }
        Returns: undefined
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
      update_artifact_with_token: {
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
      update_database_with_token: {
        Args: {
          p_dashboard_url?: string
          p_database_id: string
          p_has_connection_info?: boolean
          p_ip_allow_list?: Json
          p_name?: string
          p_plan?: Database["public"]["Enums"]["database_plan"]
          p_render_postgres_id?: string
          p_status?: Database["public"]["Enums"]["database_status"]
          p_token?: string
        }
        Returns: {
          created_at: string
          created_by: string | null
          dashboard_url: string | null
          database_internal_name: string | null
          database_user: string | null
          has_connection_info: boolean | null
          id: string
          ip_allow_list: Json | null
          name: string
          plan: Database["public"]["Enums"]["database_plan"]
          postgres_version: string | null
          project_id: string
          provider: Database["public"]["Enums"]["database_provider"]
          region: string | null
          render_postgres_id: string | null
          status: Database["public"]["Enums"]["database_status"]
          supabase_project_id: string | null
          supabase_url: string | null
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "project_databases"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      update_deployment_secrets_with_token: {
        Args: { p_deployment_id: string; p_secrets: Json; p_token: string }
        Returns: {
          branch: string | null
          build_command: string | null
          build_folder: string
          created_at: string
          created_by: string | null
          disk_enabled: boolean | null
          disk_mount_path: string | null
          disk_name: string | null
          disk_size_gb: number | null
          env_vars: Json | null
          environment: Database["public"]["Enums"]["deployment_environment"]
          id: string
          last_deployed_at: string | null
          name: string
          platform: Database["public"]["Enums"]["deployment_platform"]
          project_id: string
          project_type: string
          render_deploy_id: string | null
          render_service_id: string | null
          repo_id: string | null
          run_command: string
          run_folder: string
          secrets: Json | null
          status: Database["public"]["Enums"]["deployment_status"]
          updated_at: string
          url: string | null
        }
        SetofOptions: {
          from: "*"
          to: "project_deployments"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      update_deployment_with_token:
        | {
            Args: {
              p_branch?: string
              p_build_command?: string
              p_build_folder?: string
              p_deployment_id: string
              p_disk_enabled?: boolean
              p_disk_mount_path?: string
              p_disk_name?: string
              p_disk_size_gb?: number
              p_env_vars?: Json
              p_environment?: Database["public"]["Enums"]["deployment_environment"]
              p_name?: string
              p_project_type?: string
              p_render_deploy_id?: string
              p_render_service_id?: string
              p_run_command?: string
              p_run_folder?: string
              p_status?: Database["public"]["Enums"]["deployment_status"]
              p_token?: string
              p_url?: string
            }
            Returns: {
              branch: string | null
              build_command: string | null
              build_folder: string
              created_at: string
              created_by: string | null
              disk_enabled: boolean | null
              disk_mount_path: string | null
              disk_name: string | null
              disk_size_gb: number | null
              env_vars: Json | null
              environment: Database["public"]["Enums"]["deployment_environment"]
              id: string
              last_deployed_at: string | null
              name: string
              platform: Database["public"]["Enums"]["deployment_platform"]
              project_id: string
              project_type: string
              render_deploy_id: string | null
              render_service_id: string | null
              repo_id: string | null
              run_command: string
              run_folder: string
              secrets: Json | null
              status: Database["public"]["Enums"]["deployment_status"]
              updated_at: string
              url: string | null
            }
            SetofOptions: {
              from: "*"
              to: "project_deployments"
              isOneToOne: true
              isSetofReturn: false
            }
          }
        | {
            Args: {
              p_branch?: string
              p_build_command?: string
              p_build_folder?: string
              p_deployment_id: string
              p_env_vars?: Json
              p_environment?: Database["public"]["Enums"]["deployment_environment"]
              p_name?: string
              p_project_type?: string
              p_render_deploy_id?: string
              p_render_service_id?: string
              p_run_command?: string
              p_run_folder?: string
              p_status?: Database["public"]["Enums"]["deployment_status"]
              p_token?: string
              p_url?: string
            }
            Returns: {
              branch: string | null
              build_command: string | null
              build_folder: string
              created_at: string
              created_by: string | null
              disk_enabled: boolean | null
              disk_mount_path: string | null
              disk_name: string | null
              disk_size_gb: number | null
              env_vars: Json | null
              environment: Database["public"]["Enums"]["deployment_environment"]
              id: string
              last_deployed_at: string | null
              name: string
              platform: Database["public"]["Enums"]["deployment_platform"]
              project_id: string
              project_type: string
              render_deploy_id: string | null
              render_service_id: string | null
              repo_id: string | null
              run_command: string
              run_folder: string
              secrets: Json | null
              status: Database["public"]["Enums"]["deployment_status"]
              updated_at: string
              url: string | null
            }
            SetofOptions: {
              from: "*"
              to: "project_deployments"
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
      update_project_token_with_token: {
        Args: {
          p_expires_at?: string
          p_label?: string
          p_token: string
          p_token_id: string
        }
        Returns: {
          created_at: string
          created_by: string | null
          expires_at: string | null
          id: string
          label: string | null
          last_used_at: string | null
          project_id: string
          role: Database["public"]["Enums"]["project_token_role"]
          token: string
        }
        SetofOptions: {
          from: "*"
          to: "project_tokens"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      update_project_with_token: {
        Args: {
          p_budget?: number
          p_description?: string
          p_name?: string
          p_organization?: string
          p_priority?: string
          p_project_id: string
          p_scope?: string
          p_status?: Database["public"]["Enums"]["project_status"]
          p_tags?: string[]
          p_timeline_end?: string
          p_timeline_start?: string
          p_token?: string
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
      update_saved_query_with_token: {
        Args: {
          p_description?: string
          p_name?: string
          p_query_id: string
          p_sql_content?: string
          p_token?: string
        }
        Returns: {
          created_at: string
          created_by: string | null
          database_id: string
          description: string | null
          id: string
          name: string
          project_id: string
          sql_content: string
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "project_database_sql"
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
      upsert_canvas_edge_with_token: {
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
          p_is_binary?: boolean
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
      upsert_files_batch_with_token: {
        Args: { p_files: Json; p_repo_id: string; p_token: string }
        Returns: {
          files_updated: number
          success: boolean
        }[]
      }
      validate_file_access: {
        Args: { p_file_id: string; p_token: string }
        Returns: boolean
      }
      validate_project_access: {
        Args: { p_project_id: string; p_token: string }
        Returns: boolean
      }
      validate_repo_access: {
        Args: { p_repo_id: string; p_token: string }
        Returns: boolean
      }
      validate_session_access: {
        Args: { p_session_id: string; p_token: string }
        Returns: boolean
      }
      wildcard_search_files_with_token: {
        Args: { p_query: string; p_repo_id: string; p_token?: string }
        Returns: {
          content: string
          id: string
          is_staged: boolean
          match_count: number
          matched_terms: string[]
          path: string
        }[]
      }
    }
    Enums: {
      app_role: "admin" | "user"
      audit_severity: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW"
      build_status: "RUNNING" | "COMPLETED" | "FAILED"
      database_plan:
        | "free"
        | "basic_256mb"
        | "basic_1gb"
        | "basic_4gb"
        | "pro_4gb"
        | "pro_8gb"
        | "pro_16gb"
        | "pro_32gb"
        | "pro_64gb"
        | "pro_128gb"
        | "pro_192gb"
        | "pro_256gb"
        | "pro_384gb"
        | "pro_512gb"
        | "accelerated_16gb"
        | "accelerated_32gb"
        | "accelerated_64gb"
        | "accelerated_128gb"
        | "accelerated_256gb"
        | "accelerated_384gb"
        | "accelerated_512gb"
        | "accelerated_768gb"
        | "accelerated_1024gb"
      database_provider: "render_postgres" | "supabase"
      database_status:
        | "pending"
        | "creating"
        | "available"
        | "suspended"
        | "restarting"
        | "updating"
        | "failed"
        | "deleted"
      deployment_environment: "dev" | "uat" | "prod"
      deployment_platform: "pronghorn_cloud" | "local" | "dedicated_vm"
      deployment_status:
        | "pending"
        | "building"
        | "deploying"
        | "running"
        | "stopped"
        | "failed"
        | "deleted"
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
        | "WEB_COMPONENT"
        | "HOOK_COMPOSABLE"
        | "API_SERVICE"
        | "API_ROUTER"
        | "API_MIDDLEWARE"
        | "API_CONTROLLER"
        | "API_UTIL"
        | "EXTERNAL_SERVICE"
        | "SCHEMA"
        | "TABLE"
        | "AGENT"
        | "OTHER"
      project_status: "DESIGN" | "AUDIT" | "BUILD"
      project_token_role: "owner" | "editor" | "viewer"
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
      database_plan: [
        "free",
        "basic_256mb",
        "basic_1gb",
        "basic_4gb",
        "pro_4gb",
        "pro_8gb",
        "pro_16gb",
        "pro_32gb",
        "pro_64gb",
        "pro_128gb",
        "pro_192gb",
        "pro_256gb",
        "pro_384gb",
        "pro_512gb",
        "accelerated_16gb",
        "accelerated_32gb",
        "accelerated_64gb",
        "accelerated_128gb",
        "accelerated_256gb",
        "accelerated_384gb",
        "accelerated_512gb",
        "accelerated_768gb",
        "accelerated_1024gb",
      ],
      database_provider: ["render_postgres", "supabase"],
      database_status: [
        "pending",
        "creating",
        "available",
        "suspended",
        "restarting",
        "updating",
        "failed",
        "deleted",
      ],
      deployment_environment: ["dev", "uat", "prod"],
      deployment_platform: ["pronghorn_cloud", "local", "dedicated_vm"],
      deployment_status: [
        "pending",
        "building",
        "deploying",
        "running",
        "stopped",
        "failed",
        "deleted",
      ],
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
        "WEB_COMPONENT",
        "HOOK_COMPOSABLE",
        "API_SERVICE",
        "API_ROUTER",
        "API_MIDDLEWARE",
        "API_CONTROLLER",
        "API_UTIL",
        "EXTERNAL_SERVICE",
        "SCHEMA",
        "TABLE",
        "AGENT",
        "OTHER",
      ],
      project_status: ["DESIGN", "AUDIT", "BUILD"],
      project_token_role: ["owner", "editor", "viewer"],
      requirement_type: ["EPIC", "FEATURE", "STORY", "ACCEPTANCE_CRITERIA"],
    },
  },
} as const
