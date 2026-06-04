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
    PostgrestVersion: "14.4"
  }
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      chat_messages: {
        Row: {
          content: string | null
          conversation_id: string | null
          created_at: string
          id: string
          role: string | null
          user_id: string
        }
        Insert: {
          content?: string | null
          conversation_id?: string | null
          created_at?: string
          id?: string
          role?: string | null
          user_id: string
        }
        Update: {
          content?: string | null
          conversation_id?: string | null
          created_at?: string
          id?: string
          role?: string | null
          user_id?: string
        }
        Relationships: []
      }
      daily_stats: {
        Row: {
          calories_burned: number | null
          date: string
          diet_logs: Json | null
          id: string
          total_calories: number | null
          total_carbs: number | null
          total_fat: number | null
          total_protein: number | null
          user_id: string
          water_intake: number | null
          workout_duration: number | null
          workout_logs: Json | null
          workout_session_id: string | null
        }
        Insert: {
          calories_burned?: number | null
          date?: string
          diet_logs?: Json | null
          id?: string
          total_calories?: number | null
          total_carbs?: number | null
          total_fat?: number | null
          total_protein?: number | null
          user_id: string
          water_intake?: number | null
          workout_duration?: number | null
          workout_logs?: Json | null
          workout_session_id?: string | null
        }
        Update: {
          calories_burned?: number | null
          date?: string
          diet_logs?: Json | null
          id?: string
          total_calories?: number | null
          total_carbs?: number | null
          total_fat?: number | null
          total_protein?: number | null
          user_id?: string
          water_intake?: number | null
          workout_duration?: number | null
          workout_logs?: Json | null
          workout_session_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "daily_stats_workout_session_id_fkey"
            columns: ["workout_session_id"]
            isOneToOne: false
            referencedRelation: "workout_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      exercises: {
        Row: {
          avg_rating: number | null
          calories_per_minute: number | null
          category: string
          created_at: string
          created_by: string | null
          default_reps_max: number | null
          default_reps_min: number | null
          default_rest_seconds: number | null
          default_sets: number | null
          difficulty: string
          equipment: string
          id: string
          image_url: string | null
          instructions: string | null
          is_ai_generated: boolean
          is_system: boolean
          movement_pattern: string | null
          muscle_group_details: Json | null
          muscle_groups: string[]
          name: string
          name_en: string | null
          plane: string | null
          updated_at: string
          usage_count: number
          video_url: string | null
        }
        Insert: {
          avg_rating?: number | null
          calories_per_minute?: number | null
          category: string
          created_at?: string
          created_by?: string | null
          default_reps_max?: number | null
          default_reps_min?: number | null
          default_rest_seconds?: number | null
          default_sets?: number | null
          difficulty: string
          equipment: string
          id?: string
          image_url?: string | null
          instructions?: string | null
          is_ai_generated?: boolean
          is_system?: boolean
          movement_pattern?: string | null
          muscle_group_details?: Json | null
          muscle_groups?: string[]
          name: string
          name_en?: string | null
          plane?: string | null
          updated_at?: string
          usage_count?: number
          video_url?: string | null
        }
        Update: {
          avg_rating?: number | null
          calories_per_minute?: number | null
          category?: string
          created_at?: string
          created_by?: string | null
          default_reps_max?: number | null
          default_reps_min?: number | null
          default_rest_seconds?: number | null
          default_sets?: number | null
          difficulty?: string
          equipment?: string
          id?: string
          image_url?: string | null
          instructions?: string | null
          is_ai_generated?: boolean
          is_system?: boolean
          movement_pattern?: string | null
          muscle_group_details?: Json | null
          muscle_groups?: string[]
          name?: string
          name_en?: string | null
          plane?: string | null
          updated_at?: string
          usage_count?: number
          video_url?: string | null
        }
        Relationships: []
      }
      knowledge_base: {
        Row: {
          content: string | null
          embedding: string | null
          id: string
          metadata: Json | null
        }
        Insert: {
          content?: string | null
          embedding?: string | null
          id?: string
          metadata?: Json | null
        }
        Update: {
          content?: string | null
          embedding?: string | null
          id?: string
          metadata?: Json | null
        }
        Relationships: []
      }
      plan_exercises: {
        Row: {
          ai_adjustment_reason: string | null
          alternatives: string[] | null
          created_at: string
          day_id: string
          exercise_id: string
          id: string
          notes: string | null
          order_index: number
          progression_rule: string | null
          progression_step_kg: number | null
          progression_step_percent: number | null
          rest_seconds: number | null
          target_reps_max: number | null
          target_reps_min: number | null
          target_rpe: number | null
          target_sets: number
          target_weight_kg: number | null
        }
        Insert: {
          ai_adjustment_reason?: string | null
          alternatives?: string[] | null
          created_at?: string
          day_id: string
          exercise_id: string
          id?: string
          notes?: string | null
          order_index?: number
          progression_rule?: string | null
          progression_step_kg?: number | null
          progression_step_percent?: number | null
          rest_seconds?: number | null
          target_reps_max?: number | null
          target_reps_min?: number | null
          target_rpe?: number | null
          target_sets?: number
          target_weight_kg?: number | null
        }
        Update: {
          ai_adjustment_reason?: string | null
          alternatives?: string[] | null
          created_at?: string
          day_id?: string
          exercise_id?: string
          id?: string
          notes?: string | null
          order_index?: number
          progression_rule?: string | null
          progression_step_kg?: number | null
          progression_step_percent?: number | null
          rest_seconds?: number | null
          target_reps_max?: number | null
          target_reps_min?: number | null
          target_rpe?: number | null
          target_sets?: number
          target_weight_kg?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "plan_exercises_day_id_fkey"
            columns: ["day_id"]
            isOneToOne: false
            referencedRelation: "workout_days"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plan_exercises_exercise_id_fkey"
            columns: ["exercise_id"]
            isOneToOne: false
            referencedRelation: "exercises"
            referencedColumns: ["id"]
          },
        ]
      }
      set_logs: {
        Row: {
          completed_at: string
          duration_seconds: number | null
          exercise_id: string
          id: string
          is_dropset: boolean
          is_failure: boolean
          is_warmup: boolean
          plan_exercise_id: string | null
          reps_completed: number
          rpe: number | null
          session_id: string
          set_number: number
          weight_kg: number | null
        }
        Insert: {
          completed_at?: string
          duration_seconds?: number | null
          exercise_id: string
          id?: string
          is_dropset?: boolean
          is_failure?: boolean
          is_warmup?: boolean
          plan_exercise_id?: string | null
          reps_completed: number
          rpe?: number | null
          session_id: string
          set_number: number
          weight_kg?: number | null
        }
        Update: {
          completed_at?: string
          duration_seconds?: number | null
          exercise_id?: string
          id?: string
          is_dropset?: boolean
          is_failure?: boolean
          is_warmup?: boolean
          plan_exercise_id?: string | null
          reps_completed?: number
          rpe?: number | null
          session_id?: string
          set_number?: number
          weight_kg?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "set_logs_exercise_id_fkey"
            columns: ["exercise_id"]
            isOneToOne: false
            referencedRelation: "exercises"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "set_logs_plan_exercise_id_fkey"
            columns: ["plan_exercise_id"]
            isOneToOne: false
            referencedRelation: "plan_exercises"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "set_logs_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "workout_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      user_settings: {
        Row: {
          activity_level: string | null
          age: number | null
          created_at: string
          current_plan_id: string | null
          current_plan_start_date: string | null
          current_workout_plan: string | null
          gender: string | null
          height: number | null
          preferences: Json | null
          target_calories: number | null
          target_carbs: number | null
          target_fat: number | null
          target_protein: number | null
          user_id: string
          weight: number | null
        }
        Insert: {
          activity_level?: string | null
          age?: number | null
          created_at?: string
          current_plan_id?: string | null
          current_plan_start_date?: string | null
          current_workout_plan?: string | null
          gender?: string | null
          height?: number | null
          preferences?: Json | null
          target_calories?: number | null
          target_carbs?: number | null
          target_fat?: number | null
          target_protein?: number | null
          user_id: string
          weight?: number | null
        }
        Update: {
          activity_level?: string | null
          age?: number | null
          created_at?: string
          current_plan_id?: string | null
          current_plan_start_date?: string | null
          current_workout_plan?: string | null
          gender?: string | null
          height?: number | null
          preferences?: Json | null
          target_calories?: number | null
          target_carbs?: number | null
          target_fat?: number | null
          target_protein?: number | null
          user_id?: string
          weight?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "user_settings_current_plan_id_fkey"
            columns: ["current_plan_id"]
            isOneToOne: false
            referencedRelation: "workout_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      workout_days: {
        Row: {
          created_at: string
          day_order: number
          day_type: string
          estimated_duration_minutes: number | null
          focus_muscles: string[]
          id: string
          name: string
          plan_id: string
          rest_day: boolean
        }
        Insert: {
          created_at?: string
          day_order: number
          day_type: string
          estimated_duration_minutes?: number | null
          focus_muscles?: string[]
          id?: string
          name: string
          plan_id: string
          rest_day?: boolean
        }
        Update: {
          created_at?: string
          day_order?: number
          day_type?: string
          estimated_duration_minutes?: number | null
          focus_muscles?: string[]
          id?: string
          name?: string
          plan_id?: string
          rest_day?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "workout_days_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "workout_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      workout_plans: {
        Row: {
          ai_model_version: string | null
          ai_prompt: string | null
          completed_sessions: number
          created_at: string
          creator_id: string | null
          description: string | null
          duration_weeks: number | null
          experience_level: string | null
          frequency_per_week: number
          goal: string | null
          id: string
          is_active: boolean
          is_ai_generated: boolean
          is_public: boolean | null
          is_system_template: boolean
          is_template: boolean
          name: string
          plan_type: string | null
          rest_days: number[] | null
          source_template_id: string | null
          time_per_session_minutes: number | null
          updated_at: string
        }
        Insert: {
          ai_model_version?: string | null
          ai_prompt?: string | null
          completed_sessions?: number
          created_at?: string
          creator_id?: string | null
          description?: string | null
          duration_weeks?: number | null
          experience_level?: string | null
          frequency_per_week: number
          goal?: string | null
          id?: string
          is_active?: boolean
          is_ai_generated?: boolean
          is_public?: boolean | null
          is_system_template?: boolean
          is_template?: boolean
          name: string
          plan_type?: string | null
          rest_days?: number[] | null
          source_template_id?: string | null
          time_per_session_minutes?: number | null
          updated_at?: string
        }
        Update: {
          ai_model_version?: string | null
          ai_prompt?: string | null
          completed_sessions?: number
          created_at?: string
          creator_id?: string | null
          description?: string | null
          duration_weeks?: number | null
          experience_level?: string | null
          frequency_per_week?: number
          goal?: string | null
          id?: string
          is_active?: boolean
          is_ai_generated?: boolean
          is_public?: boolean | null
          is_system_template?: boolean
          is_template?: boolean
          name?: string
          plan_type?: string | null
          rest_days?: number[] | null
          source_template_id?: string | null
          time_per_session_minutes?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "workout_plans_source_template_id_fkey"
            columns: ["source_template_id"]
            isOneToOne: false
            referencedRelation: "workout_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      workout_sessions: {
        Row: {
          completed_at: string | null
          created_at: string
          day_id: string | null
          feeling_rating: number | null
          id: string
          notes: string | null
          plan_id: string | null
          session_name: string
          started_at: string
          status: string
          total_duration_minutes: number | null
          total_volume_kg: number | null
          user_id: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          day_id?: string | null
          feeling_rating?: number | null
          id?: string
          notes?: string | null
          plan_id?: string | null
          session_name: string
          started_at?: string
          status?: string
          total_duration_minutes?: number | null
          total_volume_kg?: number | null
          user_id: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          day_id?: string | null
          feeling_rating?: number | null
          id?: string
          notes?: string | null
          plan_id?: string | null
          session_name?: string
          started_at?: string
          status?: string
          total_duration_minutes?: number | null
          total_volume_kg?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workout_sessions_day_id_fkey"
            columns: ["day_id"]
            isOneToOne: false
            referencedRelation: "workout_days"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workout_sessions_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "workout_plans"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      exec_sql: { Args: { sql: string }; Returns: undefined }
      match_documents: {
        Args: {
          match_count: number
          match_threshold: number
          query_embedding: string
        }
        Returns: {
          content: string
          id: string
          similarity: number
        }[]
      }
    }
    Enums: {
      [_ in never]: never
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const
