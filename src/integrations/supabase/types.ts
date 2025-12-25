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
      agent_llm_logs: {
        Row: {
          api_response_status: number | null
          created_at: string
          id: string
          input_char_count: number
          input_prompt: string
          iteration: number
          model: string
          output_char_count: number | null
          output_raw: string | null
          parse_error_message: string | null
          project_id: string
          session_id: string
          was_parse_success: boolean
        }
        Insert: {
          api_response_status?: number | null
          created_at?: string
          id?: string
          input_char_count: number
          input_prompt: string
          iteration: number
          model: string
          output_char_count?: number | null
          output_raw?: string | null
          parse_error_message?: string | null
          project_id: string
          session_id: string
          was_parse_success?: boolean
        }
        Update: {
          api_response_status?: number | null
          created_at?: string
          id?: string
          input_char_count?: number
          input_prompt?: string
          iteration?: number
          model?: string
          output_char_count?: number | null
          output_raw?: string | null
          parse_error_message?: string | null
          project_id?: string
          session_id?: string
          was_parse_success?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "agent_llm_logs_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_llm_logs_session_id_fkey"
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
      artifact_collaboration_blackboard: {
        Row: {
          collaboration_id: string
          content: string
          created_at: string
          entry_type: string
          id: string
          metadata: Json | null
        }
        Insert: {
          collaboration_id: string
          content: string
          created_at?: string
          entry_type: string
          id?: string
          metadata?: Json | null
        }
        Update: {
          collaboration_id?: string
          content?: string
          created_at?: string
          entry_type?: string
          id?: string
          metadata?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "artifact_collaboration_blackboard_collaboration_id_fkey"
            columns: ["collaboration_id"]
            isOneToOne: false
            referencedRelation: "artifact_collaborations"
            referencedColumns: ["id"]
          },
        ]
      }
      artifact_collaboration_history: {
        Row: {
          actor_identifier: string | null
          actor_type: string
          collaboration_id: string
          created_at: string
          end_line: number
          full_content_snapshot: string | null
          id: string
          narrative: string | null
          new_content: string | null
          old_content: string | null
          operation_type: string
          start_line: number
          version_number: number
        }
        Insert: {
          actor_identifier?: string | null
          actor_type: string
          collaboration_id: string
          created_at?: string
          end_line: number
          full_content_snapshot?: string | null
          id?: string
          narrative?: string | null
          new_content?: string | null
          old_content?: string | null
          operation_type: string
          start_line: number
          version_number: number
        }
        Update: {
          actor_identifier?: string | null
          actor_type?: string
          collaboration_id?: string
          created_at?: string
          end_line?: number
          full_content_snapshot?: string | null
          id?: string
          narrative?: string | null
          new_content?: string | null
          old_content?: string | null
          operation_type?: string
          start_line?: number
          version_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "artifact_collaboration_history_collaboration_id_fkey"
            columns: ["collaboration_id"]
            isOneToOne: false
            referencedRelation: "artifact_collaborations"
            referencedColumns: ["id"]
          },
        ]
      }
      artifact_collaboration_messages: {
        Row: {
          collaboration_id: string
          content: string
          created_at: string
          id: string
          metadata: Json | null
          role: string
          token_id: string | null
        }
        Insert: {
          collaboration_id: string
          content: string
          created_at?: string
          id?: string
          metadata?: Json | null
          role: string
          token_id?: string | null
        }
        Update: {
          collaboration_id?: string
          content?: string
          created_at?: string
          id?: string
          metadata?: Json | null
          role?: string
          token_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "artifact_collaboration_messages_collaboration_id_fkey"
            columns: ["collaboration_id"]
            isOneToOne: false
            referencedRelation: "artifact_collaborations"
            referencedColumns: ["id"]
          },
        ]
      }
      artifact_collaborations: {
        Row: {
          artifact_id: string
          base_content: string
          created_at: string
          created_by: string | null
          current_content: string
          id: string
          merged_at: string | null
          merged_to_artifact: boolean | null
          project_id: string
          status: string
          title: string | null
          updated_at: string
        }
        Insert: {
          artifact_id: string
          base_content: string
          created_at?: string
          created_by?: string | null
          current_content: string
          id?: string
          merged_at?: string | null
          merged_to_artifact?: boolean | null
          project_id: string
          status?: string
          title?: string | null
          updated_at?: string
        }
        Update: {
          artifact_id?: string
          base_content?: string
          created_at?: string
          created_by?: string | null
          current_content?: string
          id?: string
          merged_at?: string | null
          merged_to_artifact?: boolean | null
          project_id?: string
          status?: string
          title?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "artifact_collaborations_artifact_id_fkey"
            columns: ["artifact_id"]
            isOneToOne: false
            referencedRelation: "artifacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "artifact_collaborations_project_id_fkey"
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
          provenance_id: string | null
          provenance_page: number | null
          provenance_path: string | null
          provenance_total_pages: number | null
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
          provenance_id?: string | null
          provenance_page?: number | null
          provenance_path?: string | null
          provenance_total_pages?: number | null
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
          provenance_id?: string | null
          provenance_page?: number | null
          provenance_path?: string | null
          provenance_total_pages?: number | null
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
      audit_agent_instances: {
        Row: {
          agent_name: string
          agent_role: string
          completed_at: string | null
          consensus_vote: boolean | null
          created_at: string
          id: string
          sector_complete: boolean | null
          sector_end: number | null
          sector_start: number | null
          session_id: string
          status: string
          system_prompt: string
        }
        Insert: {
          agent_name: string
          agent_role: string
          completed_at?: string | null
          consensus_vote?: boolean | null
          created_at?: string
          id?: string
          sector_complete?: boolean | null
          sector_end?: number | null
          sector_start?: number | null
          session_id: string
          status?: string
          system_prompt: string
        }
        Update: {
          agent_name?: string
          agent_role?: string
          completed_at?: string | null
          consensus_vote?: boolean | null
          created_at?: string
          id?: string
          sector_complete?: boolean | null
          sector_end?: number | null
          sector_start?: number | null
          session_id?: string
          status?: string
          system_prompt?: string
        }
        Relationships: [
          {
            foreignKeyName: "audit_agent_instances_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "audit_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_blackboard: {
        Row: {
          agent_role: string
          confidence: number | null
          content: string
          created_at: string
          entry_type: string
          evidence: Json | null
          id: string
          iteration: number
          session_id: string
          target_agent: string | null
        }
        Insert: {
          agent_role: string
          confidence?: number | null
          content: string
          created_at?: string
          entry_type: string
          evidence?: Json | null
          id?: string
          iteration: number
          session_id: string
          target_agent?: string | null
        }
        Update: {
          agent_role?: string
          confidence?: number | null
          content?: string
          created_at?: string
          entry_type?: string
          evidence?: Json | null
          id?: string
          iteration?: number
          session_id?: string
          target_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_blackboard_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "audit_sessions"
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
      audit_graph_edges: {
        Row: {
          created_at: string
          created_by_agent: string
          edge_type: string
          id: string
          label: string | null
          metadata: Json | null
          session_id: string
          source_node_id: string
          target_node_id: string
          weight: number | null
        }
        Insert: {
          created_at?: string
          created_by_agent: string
          edge_type?: string
          id?: string
          label?: string | null
          metadata?: Json | null
          session_id: string
          source_node_id: string
          target_node_id: string
          weight?: number | null
        }
        Update: {
          created_at?: string
          created_by_agent?: string
          edge_type?: string
          id?: string
          label?: string | null
          metadata?: Json | null
          session_id?: string
          source_node_id?: string
          target_node_id?: string
          weight?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_graph_edges_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "audit_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_graph_edges_source_node_id_fkey"
            columns: ["source_node_id"]
            isOneToOne: false
            referencedRelation: "audit_graph_nodes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_graph_edges_target_node_id_fkey"
            columns: ["target_node_id"]
            isOneToOne: false
            referencedRelation: "audit_graph_nodes"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_graph_nodes: {
        Row: {
          color: string | null
          created_at: string
          created_by_agent: string
          description: string | null
          id: string
          label: string
          metadata: Json | null
          node_type: string
          session_id: string
          size: number | null
          source_dataset: string | null
          source_element_ids: string[] | null
          updated_at: string
          x_position: number | null
          y_position: number | null
        }
        Insert: {
          color?: string | null
          created_at?: string
          created_by_agent: string
          description?: string | null
          id?: string
          label: string
          metadata?: Json | null
          node_type?: string
          session_id: string
          size?: number | null
          source_dataset?: string | null
          source_element_ids?: string[] | null
          updated_at?: string
          x_position?: number | null
          y_position?: number | null
        }
        Update: {
          color?: string | null
          created_at?: string
          created_by_agent?: string
          description?: string | null
          id?: string
          label?: string
          metadata?: Json | null
          node_type?: string
          session_id?: string
          size?: number | null
          source_dataset?: string | null
          source_element_ids?: string[] | null
          updated_at?: string
          x_position?: number | null
          y_position?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_graph_nodes_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "audit_sessions"
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
      audit_sessions: {
        Row: {
          agent_definitions: Json | null
          completed_at: string | null
          consensus_reached: boolean | null
          consensus_votes: Json | null
          created_at: string
          created_by: string | null
          current_iteration: number
          dataset_1_ids: string[] | null
          dataset_1_type: string
          dataset_2_ids: string[] | null
          dataset_2_type: string
          description: string | null
          graph_complete_votes: Json | null
          id: string
          max_iterations: number
          name: string
          phase: string | null
          problem_shape: Json | null
          project_id: string
          status: string
          tesseract_dimensions: Json | null
          updated_at: string
          venn_result: Json | null
        }
        Insert: {
          agent_definitions?: Json | null
          completed_at?: string | null
          consensus_reached?: boolean | null
          consensus_votes?: Json | null
          created_at?: string
          created_by?: string | null
          current_iteration?: number
          dataset_1_ids?: string[] | null
          dataset_1_type: string
          dataset_2_ids?: string[] | null
          dataset_2_type: string
          description?: string | null
          graph_complete_votes?: Json | null
          id?: string
          max_iterations?: number
          name: string
          phase?: string | null
          problem_shape?: Json | null
          project_id: string
          status?: string
          tesseract_dimensions?: Json | null
          updated_at?: string
          venn_result?: Json | null
        }
        Update: {
          agent_definitions?: Json | null
          completed_at?: string | null
          consensus_reached?: boolean | null
          consensus_votes?: Json | null
          created_at?: string
          created_by?: string | null
          current_iteration?: number
          dataset_1_ids?: string[] | null
          dataset_1_type?: string
          dataset_2_ids?: string[] | null
          dataset_2_type?: string
          description?: string | null
          graph_complete_votes?: Json | null
          id?: string
          max_iterations?: number
          name?: string
          phase?: string | null
          problem_shape?: Json | null
          project_id?: string
          status?: string
          tesseract_dimensions?: Json | null
          updated_at?: string
          venn_result?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_sessions_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_tesseract_cells: {
        Row: {
          contributing_agents: string[] | null
          created_at: string
          evidence_refs: Json | null
          evidence_summary: string | null
          id: string
          session_id: string
          updated_at: string
          x_element_id: string
          x_element_label: string | null
          x_element_type: string
          x_index: number
          y_step: number
          y_step_label: string | null
          z_criticality: string | null
          z_polarity: number
        }
        Insert: {
          contributing_agents?: string[] | null
          created_at?: string
          evidence_refs?: Json | null
          evidence_summary?: string | null
          id?: string
          session_id: string
          updated_at?: string
          x_element_id: string
          x_element_label?: string | null
          x_element_type: string
          x_index: number
          y_step: number
          y_step_label?: string | null
          z_criticality?: string | null
          z_polarity?: number
        }
        Update: {
          contributing_agents?: string[] | null
          created_at?: string
          evidence_refs?: Json | null
          evidence_summary?: string | null
          id?: string
          session_id?: string
          updated_at?: string
          x_element_id?: string
          x_element_label?: string | null
          x_element_type?: string
          x_index?: number
          y_step?: number
          y_step_label?: string | null
          z_criticality?: string | null
          z_polarity?: number
        }
        Relationships: [
          {
            foreignKeyName: "audit_tesseract_cells_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "audit_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      build_book_standards: {
        Row: {
          build_book_id: string
          created_at: string
          id: string
          standard_id: string
        }
        Insert: {
          build_book_id: string
          created_at?: string
          id?: string
          standard_id: string
        }
        Update: {
          build_book_id?: string
          created_at?: string
          id?: string
          standard_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "build_book_standards_build_book_id_fkey"
            columns: ["build_book_id"]
            isOneToOne: false
            referencedRelation: "build_books"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "build_book_standards_standard_id_fkey"
            columns: ["standard_id"]
            isOneToOne: false
            referencedRelation: "standards"
            referencedColumns: ["id"]
          },
        ]
      }
      build_book_tech_stacks: {
        Row: {
          build_book_id: string
          created_at: string
          id: string
          tech_stack_id: string
        }
        Insert: {
          build_book_id: string
          created_at?: string
          id?: string
          tech_stack_id: string
        }
        Update: {
          build_book_id?: string
          created_at?: string
          id?: string
          tech_stack_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "build_book_tech_stacks_build_book_id_fkey"
            columns: ["build_book_id"]
            isOneToOne: false
            referencedRelation: "build_books"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "build_book_tech_stacks_tech_stack_id_fkey"
            columns: ["tech_stack_id"]
            isOneToOne: false
            referencedRelation: "tech_stacks"
            referencedColumns: ["id"]
          },
        ]
      }
      build_books: {
        Row: {
          cover_image_url: string | null
          created_at: string
          created_by: string | null
          deploy_count: number
          id: string
          is_published: boolean
          long_description: string | null
          name: string
          org_id: string | null
          prompt: string | null
          short_description: string | null
          tags: string[] | null
          updated_at: string
        }
        Insert: {
          cover_image_url?: string | null
          created_at?: string
          created_by?: string | null
          deploy_count?: number
          id?: string
          is_published?: boolean
          long_description?: string | null
          name: string
          org_id?: string | null
          prompt?: string | null
          short_description?: string | null
          tags?: string[] | null
          updated_at?: string
        }
        Update: {
          cover_image_url?: string | null
          created_at?: string
          created_by?: string | null
          deploy_count?: number
          id?: string
          is_published?: boolean
          long_description?: string | null
          name?: string
          org_id?: string | null
          prompt?: string | null
          short_description?: string | null
          tags?: string[] | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "build_books_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
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
          project_id: string
          role: string
        }
        Insert: {
          chat_session_id: string
          content: string
          created_at?: string
          created_by?: string | null
          id?: string
          project_id: string
          role: string
        }
        Update: {
          chat_session_id?: string
          content?: string
          created_at?: string
          created_by?: string | null
          id?: string
          project_id?: string
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
          {
            foreignKeyName: "chat_messages_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
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
      project_database_connections: {
        Row: {
          connection_string: string
          created_at: string
          created_by: string | null
          database_name: string | null
          description: string | null
          host: string | null
          id: string
          last_connected_at: string | null
          last_error: string | null
          name: string
          port: number | null
          project_id: string
          ssl_mode: string | null
          status: string
          updated_at: string
        }
        Insert: {
          connection_string: string
          created_at?: string
          created_by?: string | null
          database_name?: string | null
          description?: string | null
          host?: string | null
          id?: string
          last_connected_at?: string | null
          last_error?: string | null
          name: string
          port?: number | null
          project_id: string
          ssl_mode?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          connection_string?: string
          created_at?: string
          created_by?: string | null
          database_name?: string | null
          description?: string | null
          host?: string | null
          id?: string
          last_connected_at?: string | null
          last_error?: string | null
          name?: string
          port?: number | null
          project_id?: string
          ssl_mode?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_database_connections_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_database_sql: {
        Row: {
          connection_id: string | null
          created_at: string
          created_by: string | null
          database_id: string | null
          description: string | null
          id: string
          name: string
          project_id: string
          sql_content: string
          updated_at: string
        }
        Insert: {
          connection_id?: string | null
          created_at?: string
          created_by?: string | null
          database_id?: string | null
          description?: string | null
          id?: string
          name: string
          project_id: string
          sql_content: string
          updated_at?: string
        }
        Update: {
          connection_id?: string | null
          created_at?: string
          created_by?: string | null
          database_id?: string | null
          description?: string | null
          id?: string
          name?: string
          project_id?: string
          sql_content?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_database_sql_connection_id_fkey"
            columns: ["connection_id"]
            isOneToOne: false
            referencedRelation: "project_database_connections"
            referencedColumns: ["id"]
          },
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
          connection_id: string | null
          created_at: string
          database_id: string | null
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
          connection_id?: string | null
          created_at?: string
          database_id?: string | null
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
          connection_id?: string | null
          created_at?: string
          database_id?: string | null
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
            foreignKeyName: "project_migrations_connection_id_fkey"
            columns: ["connection_id"]
            isOneToOne: false
            referencedRelation: "project_database_connections"
            referencedColumns: ["id"]
          },
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
          splash_image_url: string | null
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
          splash_image_url?: string | null
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
          splash_image_url?: string | null
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
      published_projects: {
        Row: {
          category: string | null
          clone_count: number | null
          description: string | null
          id: string
          image_url: string | null
          is_visible: boolean
          name: string
          project_id: string
          published_at: string
          published_by: string | null
          tags: string[] | null
          updated_at: string
          view_count: number | null
        }
        Insert: {
          category?: string | null
          clone_count?: number | null
          description?: string | null
          id?: string
          image_url?: string | null
          is_visible?: boolean
          name: string
          project_id: string
          published_at?: string
          published_by?: string | null
          tags?: string[] | null
          updated_at?: string
          view_count?: number | null
        }
        Update: {
          category?: string | null
          clone_count?: number | null
          description?: string | null
          id?: string
          image_url?: string | null
          is_visible?: boolean
          name?: string
          project_id?: string
          published_at?: string
          published_by?: string | null
          tags?: string[] | null
          updated_at?: string
          view_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "published_projects_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: true
            referencedRelation: "projects"
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
          content_length: number | null
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
          content_length?: number | null
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
          content_length?: number | null
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
          content_length: number | null
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
          content_length?: number | null
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
          content_length?: number | null
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
          long_description: string | null
          name: string
          order_index: number
          org_id: string | null
          short_description: string | null
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
          long_description?: string | null
          name: string
          order_index?: number
          org_id?: string | null
          short_description?: string | null
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
          long_description?: string | null
          name?: string
          order_index?: number
          org_id?: string | null
          short_description?: string | null
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
      standard_resources: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          name: string
          order_index: number | null
          resource_type: Database["public"]["Enums"]["resource_type"]
          standard_category_id: string | null
          standard_id: string | null
          thumbnail_url: string | null
          updated_at: string
          url: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          name: string
          order_index?: number | null
          resource_type: Database["public"]["Enums"]["resource_type"]
          standard_category_id?: string | null
          standard_id?: string | null
          thumbnail_url?: string | null
          updated_at?: string
          url: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          name?: string
          order_index?: number | null
          resource_type?: Database["public"]["Enums"]["resource_type"]
          standard_category_id?: string | null
          standard_id?: string | null
          thumbnail_url?: string | null
          updated_at?: string
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "standard_resources_standard_category_id_fkey"
            columns: ["standard_category_id"]
            isOneToOne: false
            referencedRelation: "standard_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "standard_resources_standard_id_fkey"
            columns: ["standard_id"]
            isOneToOne: false
            referencedRelation: "standards"
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
          long_description: string | null
          order_index: number
          org_id: string | null
          parent_id: string | null
          short_description: string | null
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
          long_description?: string | null
          order_index?: number
          org_id?: string | null
          parent_id?: string | null
          short_description?: string | null
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
          long_description?: string | null
          order_index?: number
          org_id?: string | null
          parent_id?: string | null
          short_description?: string | null
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
      tech_stack_resources: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          name: string
          order_index: number | null
          resource_type: Database["public"]["Enums"]["resource_type"]
          tech_stack_id: string
          thumbnail_url: string | null
          updated_at: string
          url: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          name: string
          order_index?: number | null
          resource_type: Database["public"]["Enums"]["resource_type"]
          tech_stack_id: string
          thumbnail_url?: string | null
          updated_at?: string
          url: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          name?: string
          order_index?: number | null
          resource_type?: Database["public"]["Enums"]["resource_type"]
          tech_stack_id?: string
          thumbnail_url?: string | null
          updated_at?: string
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "tech_stack_resources_tech_stack_id_fkey"
            columns: ["tech_stack_id"]
            isOneToOne: false
            referencedRelation: "tech_stacks"
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
          long_description: string | null
          metadata: Json | null
          name: string
          order_index: number
          org_id: string | null
          parent_id: string | null
          short_description: string | null
          type: string | null
          updated_at: string
          version: string | null
          version_constraint: string | null
        }
        Insert: {
          color?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          icon?: string | null
          id?: string
          long_description?: string | null
          metadata?: Json | null
          name: string
          order_index?: number
          org_id?: string | null
          parent_id?: string | null
          short_description?: string | null
          type?: string | null
          updated_at?: string
          version?: string | null
          version_constraint?: string | null
        }
        Update: {
          color?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          icon?: string | null
          id?: string
          long_description?: string | null
          metadata?: Json | null
          name?: string
          order_index?: number
          org_id?: string | null
          parent_id?: string | null
          short_description?: string | null
          type?: string | null
          updated_at?: string
          version?: string | null
          version_constraint?: string | null
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
      clone_project_with_token: {
        Args: {
          p_clone_artifacts?: boolean
          p_clone_canvas?: boolean
          p_clone_chat?: boolean
          p_clone_repo_files?: boolean
          p_clone_repo_staging?: boolean
          p_clone_requirements?: boolean
          p_clone_specifications?: boolean
          p_clone_standards?: boolean
          p_new_name: string
          p_source_project_id: string
          p_token: string
        }
        Returns: {
          id: string
          share_token: string
        }[]
      }
      clone_published_project:
        | {
            Args: { p_new_name?: string; p_published_id: string }
            Returns: {
              id: string
              share_token: string
            }[]
          }
        | {
            Args: {
              p_clone_artifacts?: boolean
              p_clone_canvas?: boolean
              p_clone_chat?: boolean
              p_clone_databases?: boolean
              p_clone_repo_files?: boolean
              p_clone_requirements?: boolean
              p_clone_specifications?: boolean
              p_clone_standards?: boolean
              p_clone_tech_stacks?: boolean
              p_new_name: string
              p_published_id: string
            }
            Returns: {
              id: string
              share_token: string
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
      create_artifact_collaboration_with_token: {
        Args: {
          p_artifact_id: string
          p_project_id: string
          p_title?: string
          p_token: string
        }
        Returns: {
          artifact_id: string
          base_content: string
          created_at: string
          created_by: string | null
          current_content: string
          id: string
          merged_at: string | null
          merged_to_artifact: boolean | null
          project_id: string
          status: string
          title: string | null
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "artifact_collaborations"
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
          content_length: number | null
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
      delete_artifact_collaboration_with_token: {
        Args: { p_collaboration_id: string; p_token: string }
        Returns: undefined
      }
      delete_artifact_with_token: {
        Args: { p_id: string; p_token: string }
        Returns: undefined
      }
      delete_audit_session_with_token: {
        Args: { p_session_id: string; p_token?: string }
        Returns: boolean
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
      delete_db_connection_with_token: {
        Args: { p_connection_id: string; p_token: string }
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
        Args: { p_project_id: string; p_token?: string }
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
      delete_user_by_email: { Args: { p_email: string }; Returns: Json }
      discard_staged_with_token: {
        Args: { p_repo_id: string; p_token: string }
        Returns: number
      }
      generate_requirement_code: {
        Args: { p_parent_id: string; p_project_id: string; p_type: string }
        Returns: string
      }
      get_admin_users: {
        Args: never
        Returns: {
          created_at: string
          display_name: string
          email: string
          last_login: string
          role: string
          user_id: string
        }[]
      }
      get_agent_llm_logs_with_token: {
        Args: { p_limit?: number; p_session_id: string; p_token: string }
        Returns: {
          api_response_status: number | null
          created_at: string
          id: string
          input_char_count: number
          input_prompt: string
          iteration: number
          model: string
          output_char_count: number | null
          output_raw: string | null
          parse_error_message: string | null
          project_id: string
          session_id: string
          was_parse_success: boolean
        }[]
        SetofOptions: {
          from: "*"
          to: "agent_llm_logs"
          isOneToOne: false
          isSetofReturn: true
        }
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
      get_artifact_collaboration_with_token: {
        Args: { p_collaboration_id: string; p_token: string }
        Returns: {
          artifact_id: string
          base_content: string
          created_at: string
          created_by: string | null
          current_content: string
          id: string
          merged_at: string | null
          merged_to_artifact: boolean | null
          project_id: string
          status: string
          title: string | null
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "artifact_collaborations"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      get_artifact_collaborations_with_token: {
        Args: {
          p_artifact_id?: string
          p_project_id: string
          p_status?: string
          p_token: string
        }
        Returns: {
          artifact_id: string
          base_content: string
          created_at: string
          created_by: string | null
          current_content: string
          id: string
          merged_at: string | null
          merged_to_artifact: boolean | null
          project_id: string
          status: string
          title: string | null
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "artifact_collaborations"
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
          provenance_id: string | null
          provenance_page: number | null
          provenance_path: string | null
          provenance_total_pages: number | null
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
      get_audit_agent_instances_with_token: {
        Args: { p_session_id: string; p_token?: string }
        Returns: {
          agent_name: string
          agent_role: string
          completed_at: string | null
          consensus_vote: boolean | null
          created_at: string
          id: string
          sector_complete: boolean | null
          sector_end: number | null
          sector_start: number | null
          session_id: string
          status: string
          system_prompt: string
        }[]
        SetofOptions: {
          from: "*"
          to: "audit_agent_instances"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_audit_blackboard_with_token: {
        Args: {
          p_agent_role?: string
          p_entry_type?: string
          p_limit?: number
          p_offset?: number
          p_session_id: string
          p_token?: string
        }
        Returns: {
          agent_role: string
          confidence: number | null
          content: string
          created_at: string
          entry_type: string
          evidence: Json | null
          id: string
          iteration: number
          session_id: string
          target_agent: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "audit_blackboard"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_audit_consensus_state_with_token: {
        Args: { p_session_id: string; p_token?: string }
        Returns: Json
      }
      get_audit_graph_edges_with_token: {
        Args: { p_session_id: string; p_token: string }
        Returns: {
          created_at: string
          created_by_agent: string
          edge_type: string
          id: string
          label: string | null
          metadata: Json | null
          session_id: string
          source_node_id: string
          target_node_id: string
          weight: number | null
        }[]
        SetofOptions: {
          from: "*"
          to: "audit_graph_edges"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_audit_graph_nodes_with_token: {
        Args: { p_session_id: string; p_token: string }
        Returns: {
          color: string | null
          created_at: string
          created_by_agent: string
          description: string | null
          id: string
          label: string
          metadata: Json | null
          node_type: string
          session_id: string
          size: number | null
          source_dataset: string | null
          source_element_ids: string[] | null
          updated_at: string
          x_position: number | null
          y_position: number | null
        }[]
        SetofOptions: {
          from: "*"
          to: "audit_graph_nodes"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_audit_session_with_token: {
        Args: { p_session_id: string; p_token?: string }
        Returns: {
          agent_definitions: Json | null
          completed_at: string | null
          consensus_reached: boolean | null
          consensus_votes: Json | null
          created_at: string
          created_by: string | null
          current_iteration: number
          dataset_1_ids: string[] | null
          dataset_1_type: string
          dataset_2_ids: string[] | null
          dataset_2_type: string
          description: string | null
          graph_complete_votes: Json | null
          id: string
          max_iterations: number
          name: string
          phase: string | null
          problem_shape: Json | null
          project_id: string
          status: string
          tesseract_dimensions: Json | null
          updated_at: string
          venn_result: Json | null
        }
        SetofOptions: {
          from: "*"
          to: "audit_sessions"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      get_audit_sessions_with_token: {
        Args: {
          p_limit?: number
          p_offset?: number
          p_project_id: string
          p_token?: string
        }
        Returns: {
          agent_definitions: Json | null
          completed_at: string | null
          consensus_reached: boolean | null
          consensus_votes: Json | null
          created_at: string
          created_by: string | null
          current_iteration: number
          dataset_1_ids: string[] | null
          dataset_1_type: string
          dataset_2_ids: string[] | null
          dataset_2_type: string
          description: string | null
          graph_complete_votes: Json | null
          id: string
          max_iterations: number
          name: string
          phase: string | null
          problem_shape: Json | null
          project_id: string
          status: string
          tesseract_dimensions: Json | null
          updated_at: string
          venn_result: Json | null
        }[]
        SetofOptions: {
          from: "*"
          to: "audit_sessions"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_audit_tesseract_cells_with_token: {
        Args: {
          p_limit?: number
          p_polarity_max?: number
          p_polarity_min?: number
          p_session_id: string
          p_token?: string
          p_x_element_id?: string
          p_y_step_max?: number
          p_y_step_min?: number
        }
        Returns: {
          contributing_agents: string[] | null
          created_at: string
          evidence_refs: Json | null
          evidence_summary: string | null
          id: string
          session_id: string
          updated_at: string
          x_element_id: string
          x_element_label: string | null
          x_element_type: string
          x_index: number
          y_step: number
          y_step_label: string | null
          z_criticality: string | null
          z_polarity: number
        }[]
        SetofOptions: {
          from: "*"
          to: "audit_tesseract_cells"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_audit_tesseract_summary_with_token: {
        Args: { p_session_id: string; p_token?: string }
        Returns: Json
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
          project_id: string
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
      get_collaboration_blackboard_with_token: {
        Args: {
          p_collaboration_id: string
          p_entry_type?: string
          p_limit?: number
          p_token: string
        }
        Returns: {
          collaboration_id: string
          content: string
          created_at: string
          entry_type: string
          id: string
          metadata: Json | null
        }[]
        SetofOptions: {
          from: "*"
          to: "artifact_collaboration_blackboard"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_collaboration_history_with_token: {
        Args: {
          p_collaboration_id: string
          p_from_version?: number
          p_to_version?: number
          p_token: string
        }
        Returns: {
          actor_identifier: string | null
          actor_type: string
          collaboration_id: string
          created_at: string
          end_line: number
          full_content_snapshot: string | null
          id: string
          narrative: string | null
          new_content: string | null
          old_content: string | null
          operation_type: string
          start_line: number
          version_number: number
        }[]
        SetofOptions: {
          from: "*"
          to: "artifact_collaboration_history"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      get_collaboration_latest_version_with_token: {
        Args: { p_collaboration_id: string; p_token: string }
        Returns: number
      }
      get_collaboration_messages_with_token: {
        Args: {
          p_collaboration_id: string
          p_limit?: number
          p_offset?: number
          p_token: string
        }
        Returns: {
          collaboration_id: string
          content: string
          created_at: string
          id: string
          metadata: Json | null
          role: string
          token_id: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "artifact_collaboration_messages"
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
      get_db_connection_string_with_token: {
        Args: { p_connection_id: string; p_token?: string }
        Returns: string
      }
      get_db_connection_with_token: {
        Args: { p_connection_id: string; p_token?: string }
        Returns: {
          created_at: string
          created_by: string
          database_name: string
          description: string
          host: string
          id: string
          last_connected_at: string
          last_error: string
          name: string
          port: number
          project_id: string
          ssl_mode: string
          status: string
          updated_at: string
        }[]
      }
      get_db_connections_with_token: {
        Args: { p_project_id: string; p_token?: string }
        Returns: {
          created_at: string
          created_by: string
          database_name: string
          description: string
          host: string
          id: string
          last_connected_at: string
          last_error: string
          name: string
          port: number
          project_id: string
          ssl_mode: string
          status: string
          updated_at: string
        }[]
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
          id: string
          is_valid: boolean
          project_description: string
          project_id: string
          project_name: string
          project_splash_image_url: string
          project_status: Database["public"]["Enums"]["project_status"]
          project_updated_at: string
          role: Database["public"]["Enums"]["project_token_role"]
        }[]
      }
      get_migrations_by_connection_with_token: {
        Args: { p_connection_id: string; p_token?: string }
        Returns: {
          connection_id: string | null
          created_at: string
          database_id: string | null
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
      get_migrations_with_token:
        | {
            Args: {
              p_connection_id?: string
              p_database_id?: string
              p_token?: string
            }
            Returns: {
              connection_id: string | null
              created_at: string
              database_id: string | null
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
        | {
            Args: { p_database_id: string; p_token?: string }
            Returns: {
              connection_id: string | null
              created_at: string
              database_id: string | null
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
      get_project_deletion_counts: {
        Args: { p_project_id: string; p_token?: string }
        Returns: {
          cloud_databases: number
          cloud_deployments: number
          external_connections: number
          github_repos: number
          total_artifacts: number
          total_canvas_nodes: number
          total_chat_sessions: number
          total_requirements: number
        }[]
      }
      get_project_elements_with_token: {
        Args: { p_elements: Json; p_project_id: string; p_token?: string }
        Returns: Json
      }
      get_project_files_metadata_with_token: {
        Args: { p_project_id: string; p_token?: string }
        Returns: {
          content_length: number
          id: string
          is_binary: boolean
          last_commit_sha: string
          path: string
          repo_id: string
          updated_at: string
        }[]
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
      get_project_id_from_audit_session: {
        Args: { p_session_id: string }
        Returns: string
      }
      get_project_id_from_collaboration: {
        Args: { p_collaboration_id: string }
        Returns: string
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
          splash_image_url: string | null
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
      get_published_project_content_summary: {
        Args: { p_published_id: string }
        Returns: Json
      }
      get_published_projects: {
        Args: {
          p_category?: string
          p_limit?: number
          p_offset?: number
          p_search?: string
          p_tags?: string[]
        }
        Returns: {
          category: string | null
          clone_count: number | null
          description: string | null
          id: string
          image_url: string | null
          is_visible: boolean
          name: string
          project_id: string
          published_at: string
          published_by: string | null
          tags: string[] | null
          updated_at: string
          view_count: number | null
        }[]
        SetofOptions: {
          from: "*"
          to: "published_projects"
          isOneToOne: false
          isSetofReturn: true
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
          content_length: number | null
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
      get_saved_queries_by_connection_with_token: {
        Args: { p_connection_id: string; p_token?: string }
        Returns: {
          connection_id: string | null
          created_at: string
          created_by: string | null
          database_id: string | null
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
      get_saved_queries_with_token:
        | {
            Args: {
              p_connection_id?: string
              p_database_id?: string
              p_token?: string
            }
            Returns: {
              connection_id: string | null
              created_at: string
              created_by: string | null
              database_id: string | null
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
        | {
            Args: { p_database_id: string; p_token?: string }
            Returns: {
              connection_id: string | null
              created_at: string
              created_by: string | null
              database_id: string | null
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
      get_staged_changes_metadata_with_token: {
        Args: { p_repo_id: string; p_token?: string }
        Returns: {
          content_length: number
          created_at: string
          file_path: string
          id: string
          is_binary: boolean
          old_path: string
          operation_type: string
          repo_id: string
        }[]
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
      get_user_role: { Args: { _user_id: string }; Returns: string }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      increment_build_book_deploy_count: {
        Args: { p_build_book_id: string }
        Returns: undefined
      }
      increment_published_project_views: {
        Args: { p_published_id: string }
        Returns: undefined
      }
      insert_agent_llm_log_with_token: {
        Args: {
          p_api_response_status?: number
          p_input_prompt: string
          p_iteration: number
          p_model: string
          p_output_raw?: string
          p_parse_error_message?: string
          p_project_id: string
          p_session_id: string
          p_token: string
          p_was_parse_success?: boolean
        }
        Returns: {
          api_response_status: number | null
          created_at: string
          id: string
          input_char_count: number
          input_prompt: string
          iteration: number
          model: string
          output_char_count: number | null
          output_raw: string | null
          parse_error_message: string | null
          project_id: string
          session_id: string
          was_parse_success: boolean
        }
        SetofOptions: {
          from: "*"
          to: "agent_llm_logs"
          isOneToOne: true
          isSetofReturn: false
        }
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
          p_ai_title?: string
          p_content: string
          p_image_url?: string
          p_project_id: string
          p_provenance_id?: string
          p_provenance_page?: number
          p_provenance_path?: string
          p_provenance_total_pages?: number
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
          provenance_id: string | null
          provenance_page: number | null
          provenance_path: string | null
          provenance_total_pages: number | null
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
      insert_audit_agent_instance_with_token: {
        Args: {
          p_agent_name: string
          p_agent_role: string
          p_sector_end?: number
          p_sector_start?: number
          p_session_id: string
          p_system_prompt: string
          p_token?: string
        }
        Returns: {
          agent_name: string
          agent_role: string
          completed_at: string | null
          consensus_vote: boolean | null
          created_at: string
          id: string
          sector_complete: boolean | null
          sector_end: number | null
          sector_start: number | null
          session_id: string
          status: string
          system_prompt: string
        }
        SetofOptions: {
          from: "*"
          to: "audit_agent_instances"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      insert_audit_blackboard_with_token: {
        Args: {
          p_agent_role: string
          p_confidence?: number
          p_content: string
          p_entry_type: string
          p_evidence?: Json
          p_iteration: number
          p_session_id: string
          p_target_agent?: string
          p_token?: string
        }
        Returns: {
          agent_role: string
          confidence: number | null
          content: string
          created_at: string
          entry_type: string
          evidence: Json | null
          id: string
          iteration: number
          session_id: string
          target_agent: string | null
        }
        SetofOptions: {
          from: "*"
          to: "audit_blackboard"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      insert_audit_graph_edge_with_token: {
        Args: {
          p_created_by_agent?: string
          p_edge_type?: string
          p_label?: string
          p_metadata?: Json
          p_session_id: string
          p_source_node_id: string
          p_target_node_id: string
          p_token: string
          p_weight?: number
        }
        Returns: {
          created_at: string
          created_by_agent: string
          edge_type: string
          id: string
          label: string | null
          metadata: Json | null
          session_id: string
          source_node_id: string
          target_node_id: string
          weight: number | null
        }
        SetofOptions: {
          from: "*"
          to: "audit_graph_edges"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      insert_audit_session_with_token: {
        Args: {
          p_agent_definitions?: Json
          p_dataset_1_ids?: string[]
          p_dataset_1_type?: string
          p_dataset_2_ids?: string[]
          p_dataset_2_type?: string
          p_description?: string
          p_max_iterations?: number
          p_name: string
          p_project_id: string
          p_token?: string
        }
        Returns: {
          agent_definitions: Json | null
          completed_at: string | null
          consensus_reached: boolean | null
          consensus_votes: Json | null
          created_at: string
          created_by: string | null
          current_iteration: number
          dataset_1_ids: string[] | null
          dataset_1_type: string
          dataset_2_ids: string[] | null
          dataset_2_type: string
          description: string | null
          graph_complete_votes: Json | null
          id: string
          max_iterations: number
          name: string
          phase: string | null
          problem_shape: Json | null
          project_id: string
          status: string
          tesseract_dimensions: Json | null
          updated_at: string
          venn_result: Json | null
        }
        SetofOptions: {
          from: "*"
          to: "audit_sessions"
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
          project_id: string
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
      insert_collaboration_blackboard_with_token: {
        Args: {
          p_collaboration_id: string
          p_content: string
          p_entry_type: string
          p_metadata?: Json
          p_token: string
        }
        Returns: {
          collaboration_id: string
          content: string
          created_at: string
          entry_type: string
          id: string
          metadata: Json | null
        }
        SetofOptions: {
          from: "*"
          to: "artifact_collaboration_blackboard"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      insert_collaboration_edit_with_token: {
        Args: {
          p_actor_identifier: string
          p_actor_type: string
          p_collaboration_id: string
          p_end_line: number
          p_narrative: string
          p_new_content: string
          p_new_full_content: string
          p_old_content: string
          p_operation_type: string
          p_start_line: number
          p_token: string
        }
        Returns: {
          actor_identifier: string | null
          actor_type: string
          collaboration_id: string
          created_at: string
          end_line: number
          full_content_snapshot: string | null
          id: string
          narrative: string | null
          new_content: string | null
          old_content: string | null
          operation_type: string
          start_line: number
          version_number: number
        }
        SetofOptions: {
          from: "*"
          to: "artifact_collaboration_history"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      insert_collaboration_message_with_token: {
        Args: {
          p_collaboration_id: string
          p_content: string
          p_metadata?: Json
          p_role: string
          p_token: string
        }
        Returns: {
          collaboration_id: string
          content: string
          created_at: string
          id: string
          metadata: Json | null
          role: string
          token_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "artifact_collaboration_messages"
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
      insert_db_connection_with_token: {
        Args: {
          p_connection_string: string
          p_database_name?: string
          p_description?: string
          p_host?: string
          p_name: string
          p_port?: number
          p_project_id: string
          p_ssl_mode?: string
          p_token: string
        }
        Returns: string
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
      insert_migration_with_token:
        | {
            Args: {
              p_connection_id?: string
              p_database_id?: string
              p_name?: string
              p_object_name?: string
              p_object_schema?: string
              p_object_type?: string
              p_sql_content?: string
              p_statement_type?: string
              p_token?: string
            }
            Returns: {
              connection_id: string | null
              created_at: string
              database_id: string | null
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
        | {
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
              connection_id: string | null
              created_at: string
              database_id: string | null
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
      insert_saved_query_with_token:
        | {
            Args: {
              p_connection_id?: string
              p_database_id?: string
              p_description?: string
              p_name?: string
              p_sql_content?: string
              p_token?: string
            }
            Returns: {
              connection_id: string | null
              created_at: string
              created_by: string | null
              database_id: string | null
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
        | {
            Args: {
              p_database_id: string
              p_description?: string
              p_name: string
              p_sql_content: string
              p_token?: string
            }
            Returns: {
              connection_id: string | null
              created_at: string
              created_by: string | null
              database_id: string | null
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
      is_admin_or_superadmin: { Args: { _user_id: string }; Returns: boolean }
      is_project_owner: { Args: { p_project_id: string }; Returns: boolean }
      is_superadmin: { Args: { _user_id: string }; Returns: boolean }
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
      merge_collaboration_to_artifact_with_token:
        | {
            Args: { p_collaboration_id: string; p_token: string }
            Returns: {
              ai_summary: string | null
              ai_title: string | null
              content: string
              created_at: string
              created_by: string | null
              id: string
              image_url: string | null
              project_id: string
              provenance_id: string | null
              provenance_page: number | null
              provenance_path: string | null
              provenance_total_pages: number | null
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
              p_close_session?: boolean
              p_collaboration_id: string
              p_token: string
            }
            Returns: {
              artifact_id: string
              base_content: string
              created_at: string
              created_by: string | null
              current_content: string
              id: string
              merged_at: string | null
              merged_to_artifact: boolean | null
              project_id: string
              status: string
              title: string | null
              updated_at: string
            }
            SetofOptions: {
              from: "*"
              to: "artifact_collaborations"
              isOneToOne: true
              isSetofReturn: false
            }
          }
      move_file_with_token: {
        Args: { p_file_id: string; p_new_path: string; p_token: string }
        Returns: {
          content_length: number | null
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
      publish_project_to_gallery: {
        Args: {
          p_category?: string
          p_description?: string
          p_image_url?: string
          p_name?: string
          p_project_id: string
          p_tags?: string[]
        }
        Returns: string
      }
      rename_file_with_token: {
        Args: { p_file_id: string; p_new_path: string; p_token?: string }
        Returns: {
          content: string
          content_length: number | null
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
      restore_collaboration_version_with_token: {
        Args: {
          p_actor_identifier?: string
          p_collaboration_id: string
          p_token: string
          p_version_number: number
        }
        Returns: {
          actor_identifier: string | null
          actor_type: string
          collaboration_id: string
          created_at: string
          end_line: number
          full_content_snapshot: string | null
          id: string
          narrative: string | null
          new_content: string | null
          old_content: string | null
          operation_type: string
          start_line: number
          version_number: number
        }
        SetofOptions: {
          from: "*"
          to: "artifact_collaboration_history"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      roll_project_token_with_token: {
        Args: { p_token: string; p_token_id: string }
        Returns: string
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
          splash_image_url: string | null
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
      set_user_role_by_email: {
        Args: { p_email: string; p_role: string }
        Returns: Json
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
          content_length: number | null
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
      toggle_published_project_visibility: {
        Args: { p_published_id: string }
        Returns: boolean
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
      update_agent_llm_log_parse_status_with_token: {
        Args: {
          p_iteration: number
          p_parse_error_message?: string
          p_session_id: string
          p_token: string
          p_was_parse_success: boolean
        }
        Returns: {
          api_response_status: number | null
          created_at: string
          id: string
          input_char_count: number
          input_prompt: string
          iteration: number
          model: string
          output_char_count: number | null
          output_raw: string | null
          parse_error_message: string | null
          project_id: string
          session_id: string
          was_parse_success: boolean
        }
        SetofOptions: {
          from: "*"
          to: "agent_llm_logs"
          isOneToOne: true
          isSetofReturn: false
        }
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
      update_artifact_collaboration_with_token: {
        Args: {
          p_collaboration_id: string
          p_current_content?: string
          p_status?: string
          p_title?: string
          p_token: string
        }
        Returns: {
          artifact_id: string
          base_content: string
          created_at: string
          created_by: string | null
          current_content: string
          id: string
          merged_at: string | null
          merged_to_artifact: boolean | null
          project_id: string
          status: string
          title: string | null
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "artifact_collaborations"
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
          provenance_id: string | null
          provenance_page: number | null
          provenance_path: string | null
          provenance_total_pages: number | null
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
      update_audit_agent_status_with_token: {
        Args: {
          p_agent_role: string
          p_consensus_vote?: boolean
          p_sector_complete?: boolean
          p_session_id: string
          p_status?: string
          p_token?: string
        }
        Returns: {
          agent_name: string
          agent_role: string
          completed_at: string | null
          consensus_vote: boolean | null
          created_at: string
          id: string
          sector_complete: boolean | null
          sector_end: number | null
          sector_start: number | null
          session_id: string
          status: string
          system_prompt: string
        }
        SetofOptions: {
          from: "*"
          to: "audit_agent_instances"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      update_audit_session_phase_with_token: {
        Args: {
          p_graph_complete_votes?: Json
          p_phase: string
          p_session_id: string
          p_token: string
        }
        Returns: undefined
      }
      update_audit_session_with_token: {
        Args: {
          p_consensus_reached?: boolean
          p_consensus_votes?: Json
          p_current_iteration?: number
          p_problem_shape?: Json
          p_session_id: string
          p_status?: string
          p_tesseract_dimensions?: Json
          p_token?: string
          p_venn_result?: Json
        }
        Returns: {
          agent_definitions: Json | null
          completed_at: string | null
          consensus_reached: boolean | null
          consensus_votes: Json | null
          created_at: string
          created_by: string | null
          current_iteration: number
          dataset_1_ids: string[] | null
          dataset_1_type: string
          dataset_2_ids: string[] | null
          dataset_2_type: string
          description: string | null
          graph_complete_votes: Json | null
          id: string
          max_iterations: number
          name: string
          phase: string | null
          problem_shape: Json | null
          project_id: string
          status: string
          tesseract_dimensions: Json | null
          updated_at: string
          venn_result: Json | null
        }
        SetofOptions: {
          from: "*"
          to: "audit_sessions"
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
      update_db_connection_status_with_token: {
        Args: {
          p_connection_id: string
          p_last_error?: string
          p_status: string
          p_token: string
        }
        Returns: undefined
      }
      update_db_connection_with_token: {
        Args: {
          p_connection_id: string
          p_connection_string?: string
          p_database_name?: string
          p_description?: string
          p_host?: string
          p_name?: string
          p_port?: number
          p_ssl_mode?: string
          p_token: string
        }
        Returns: undefined
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
      update_deployment_with_token: {
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
          splash_image_url: string | null
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
      update_project_with_token:
        | {
            Args: {
              p_budget?: number
              p_description?: string
              p_name?: string
              p_organization?: string
              p_priority?: string
              p_project_id: string
              p_scope?: string
              p_splash_image_url?: string
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
              splash_image_url: string | null
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
              splash_image_url: string | null
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
      update_published_project: {
        Args: {
          p_category?: string
          p_description?: string
          p_image_url?: string
          p_is_visible?: boolean
          p_name?: string
          p_published_id: string
          p_tags?: string[]
        }
        Returns: {
          category: string | null
          clone_count: number | null
          description: string | null
          id: string
          image_url: string | null
          is_visible: boolean
          name: string
          project_id: string
          published_at: string
          published_by: string | null
          tags: string[] | null
          updated_at: string
          view_count: number | null
        }
        SetofOptions: {
          from: "*"
          to: "published_projects"
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
          connection_id: string | null
          created_at: string
          created_by: string | null
          database_id: string | null
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
          content_length: number | null
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
      upsert_audit_graph_node_with_token: {
        Args: {
          p_color?: string
          p_created_by_agent?: string
          p_description?: string
          p_label: string
          p_metadata?: Json
          p_node_type?: string
          p_session_id: string
          p_size?: number
          p_source_dataset?: string
          p_source_element_ids?: string[]
          p_token: string
          p_x_position?: number
          p_y_position?: number
        }
        Returns: {
          color: string | null
          created_at: string
          created_by_agent: string
          description: string | null
          id: string
          label: string
          metadata: Json | null
          node_type: string
          session_id: string
          size: number | null
          source_dataset: string | null
          source_element_ids: string[] | null
          updated_at: string
          x_position: number | null
          y_position: number | null
        }
        SetofOptions: {
          from: "*"
          to: "audit_graph_nodes"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      upsert_audit_tesseract_cell_with_token: {
        Args: {
          p_contributing_agents?: string[]
          p_evidence_refs?: Json
          p_evidence_summary?: string
          p_session_id: string
          p_token?: string
          p_x_element_id: string
          p_x_element_label?: string
          p_x_element_type: string
          p_x_index: number
          p_y_step: number
          p_y_step_label?: string
          p_z_criticality?: string
          p_z_polarity: number
        }
        Returns: {
          contributing_agents: string[] | null
          created_at: string
          evidence_refs: Json | null
          evidence_summary: string | null
          id: string
          session_id: string
          updated_at: string
          x_element_id: string
          x_element_label: string | null
          x_element_type: string
          x_index: number
          y_step: number
          y_step_label: string | null
          z_criticality: string | null
          z_polarity: number
        }
        SetofOptions: {
          from: "*"
          to: "audit_tesseract_cells"
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
          content_length: number | null
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
      app_role: "admin" | "user" | "superadmin"
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
      resource_type:
        | "file"
        | "website"
        | "youtube"
        | "image"
        | "repo"
        | "library"
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
      app_role: ["admin", "user", "superadmin"],
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
      resource_type: ["file", "website", "youtube", "image", "repo", "library"],
    },
  },
} as const
