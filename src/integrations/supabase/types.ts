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
          id: string
          label: string | null
          project_id: string
          source_id: string
          target_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          label?: string | null
          project_id: string
          source_id: string
          target_id: string
        }
        Update: {
          created_at?: string
          id?: string
          label?: string | null
          project_id?: string
          source_id?: string
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
          name: string
          org_id: string
          organization: string | null
          priority: string | null
          scope: string | null
          share_token: string | null
          status: Database["public"]["Enums"]["project_status"]
          tags: string[] | null
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
          name: string
          org_id: string
          organization?: string | null
          priority?: string | null
          scope?: string | null
          share_token?: string | null
          status?: Database["public"]["Enums"]["project_status"]
          tags?: string[] | null
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
          name?: string
          org_id?: string
          organization?: string | null
          priority?: string | null
          scope?: string | null
          share_token?: string | null
          status?: Database["public"]["Enums"]["project_status"]
          tags?: string[] | null
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
          metadata?: Json | null
          name: string
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
          metadata?: Json | null
          name?: string
          org_id?: string | null
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
      generate_requirement_code: {
        Args: { p_parent_id: string; p_project_id: string; p_type: string }
        Returns: string
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      set_share_token: { Args: { token: string }; Returns: undefined }
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
      ],
      project_status: ["DESIGN", "AUDIT", "BUILD"],
      requirement_type: ["EPIC", "FEATURE", "STORY", "ACCEPTANCE_CRITERIA"],
    },
  },
} as const
