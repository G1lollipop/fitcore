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
      chat_trace: {
        Row: {
          completion_chars: number | null
          completion_tokens_approx: number | null
          conversation_id: string | null
          created_at: string
          generation_ms: number | null
          id: string
          latency_ms: number | null
          message_id: string | null
          mode: string | null
          plan_ms: number | null
          prompt_chars_approx: number | null
          retrieval_k: number | null
          tools_ms: number | null
          tools_used: string[]
          user_id: string
        }
        Insert: {
          completion_chars?: number | null
          completion_tokens_approx?: number | null
          conversation_id?: string | null
          created_at?: string
          generation_ms?: number | null
          id?: string
          latency_ms?: number | null
          message_id?: string | null
          mode?: string | null
          plan_ms?: number | null
          prompt_chars_approx?: number | null
          retrieval_k?: number | null
          tools_ms?: number | null
          tools_used?: string[]
          user_id: string
        }
        Update: {
          completion_chars?: number | null
          completion_tokens_approx?: number | null
          conversation_id?: string | null
          created_at?: string
          generation_ms?: number | null
          id?: string
          latency_ms?: number | null
          message_id?: string | null
          mode?: string | null
          plan_ms?: number | null
          prompt_chars_approx?: number | null
          retrieval_k?: number | null
          tools_ms?: number | null
          tools_used?: string[]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_trace_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "chat_messages"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_message_feedback: {
        Row: {
          answer: string | null
          citations: Json
          conversation_id: string | null
          created_at: string
          id: string
          message_id: string
          query: string | null
          rating: number
          user_id: string
        }
        Insert: {
          answer?: string | null
          citations?: Json
          conversation_id?: string | null
          created_at?: string
          id?: string
          message_id: string
          query?: string | null
          rating: number
          user_id: string
        }
        Update: {
          answer?: string | null
          citations?: Json
          conversation_id?: string | null
          created_at?: string
          id?: string
          message_id?: string
          query?: string | null
          rating?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_message_feedback_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "chat_messages"
            referencedColumns: ["id"]
          },
        ]
      }
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
          id: string
          total_calories: number | null
          total_carbs: number | null
          total_fat: number | null
          total_protein: number | null
          user_id: string
          water_intake: number | null
          workout_duration: number | null
        }
        Insert: {
          calories_burned?: number | null
          date?: string
          id?: string
          total_calories?: number | null
          total_carbs?: number | null
          total_fat?: number | null
          total_protein?: number | null
          user_id: string
          water_intake?: number | null
          workout_duration?: number | null
        }
        Update: {
          calories_burned?: number | null
          date?: string
          id?: string
          total_calories?: number | null
          total_carbs?: number | null
          total_fat?: number | null
          total_protein?: number | null
          user_id?: string
          water_intake?: number | null
          workout_duration?: number | null
        }
        Relationships: []
      }
      food_logs: {
        Row: {
          calories: number
          carbs: number
          created_at: string
          date: string
          fat: number
          food_name: string
          id: string
          logged_at: string
          protein: number
          user_id: string
        }
        Insert: {
          calories?: number
          carbs?: number
          created_at?: string
          date: string
          fat?: number
          food_name: string
          id?: string
          logged_at?: string
          protein?: number
          user_id: string
        }
        Update: {
          calories?: number
          carbs?: number
          created_at?: string
          date?: string
          fat?: number
          food_name?: string
          id?: string
          logged_at?: string
          protein?: number
          user_id?: string
        }
        Relationships: []
      }
      workout_logs: {
        Row: {
          calories_burned: number
          created_at: string
          date: string
          day_id: string | null
          duration_minutes: number
          id: string
          logged_at: string
          plan_id: string | null
          sets: number | null
          user_id: string
          workout_name: string
        }
        Insert: {
          calories_burned?: number
          created_at?: string
          date: string
          day_id?: string | null
          duration_minutes?: number
          id?: string
          logged_at?: string
          plan_id?: string | null
          sets?: number | null
          user_id: string
          workout_name: string
        }
        Update: {
          calories_burned?: number
          created_at?: string
          date?: string
          day_id?: string | null
          duration_minutes?: number
          id?: string
          logged_at?: string
          plan_id?: string | null
          sets?: number | null
          user_id?: string
          workout_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "workout_logs_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "workout_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      workout_set_logs: {
        Row: {
          id: string
          workout_log_id: string
          exercise_name: string
          set_number: number
          weight_kg: number | null
          reps: number | null
          logged_at: string
        }
        Insert: {
          id?: string
          workout_log_id: string
          exercise_name: string
          set_number: number
          weight_kg?: number | null
          reps?: number | null
          logged_at?: string
        }
        Update: {
          id?: string
          workout_log_id?: string
          exercise_name?: string
          set_number?: number
          weight_kg?: number | null
          reps?: number | null
          logged_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "workout_set_logs_workout_log_id_fkey"
            columns: ["workout_log_id"]
            isOneToOne: false
            referencedRelation: "workout_logs"
            referencedColumns: ["id"]
          },
        ]
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
          water_goal: number | null
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
          water_goal?: number | null
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
          water_goal?: number | null
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
          structure: Json
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
          structure?: Json
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
          structure?: Json
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
