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
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      account_users: {
        Row: {
          account_id: string
          can_upload_routes: boolean
          can_view_all_routes: boolean | null
          created_at: string | null
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          account_id: string
          can_upload_routes?: boolean
          can_view_all_routes?: boolean | null
          created_at?: string | null
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          account_id?: string
          can_upload_routes?: boolean
          can_view_all_routes?: boolean | null
          created_at?: string | null
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "account_users_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      accounts: {
        Row: {
          created_at: string | null
          driver_count: number | null
          id: string
          is_platform_account: boolean | null
          machines_per_driver: number | null
          min_drivers_required: number | null
          name: string
          onboarding_completed_at: string | null
          report_format_status: string
          report_source: string | null
          report_source_name: string | null
          stripe_customer_id: string | null
          stripe_state_event_created_at: string | null
          stripe_subscription_id: string | null
          subscription_current_period_end: string | null
          subscription_status: string | null
          trial_ends_at: string | null
        }
        Insert: {
          created_at?: string | null
          driver_count?: number | null
          id?: string
          is_platform_account?: boolean | null
          machines_per_driver?: number | null
          min_drivers_required?: number | null
          name: string
          onboarding_completed_at?: string | null
          report_format_status?: string
          report_source?: string | null
          report_source_name?: string | null
          stripe_customer_id?: string | null
          stripe_state_event_created_at?: string | null
          stripe_subscription_id?: string | null
          subscription_current_period_end?: string | null
          subscription_status?: string | null
          trial_ends_at?: string | null
        }
        Update: {
          created_at?: string | null
          driver_count?: number | null
          id?: string
          is_platform_account?: boolean | null
          machines_per_driver?: number | null
          min_drivers_required?: number | null
          name?: string
          onboarding_completed_at?: string | null
          report_format_status?: string
          report_source?: string | null
          report_source_name?: string | null
          stripe_customer_id?: string | null
          stripe_state_event_created_at?: string | null
          stripe_subscription_id?: string | null
          subscription_current_period_end?: string | null
          subscription_status?: string | null
          trial_ends_at?: string | null
        }
        Relationships: []
      }
      billing_checkout_intents: {
        Row: {
          account_id: string
          created_at: string
          driver_count: number
          operation_id: string
          status: string
          stripe_checkout_session_id: string | null
          stripe_checkout_url: string | null
          updated_at: string
        }
        Insert: {
          account_id: string
          created_at?: string
          driver_count: number
          operation_id: string
          status?: string
          stripe_checkout_session_id?: string | null
          stripe_checkout_url?: string | null
          updated_at?: string
        }
        Update: {
          account_id?: string
          created_at?: string
          driver_count?: number
          operation_id?: string
          status?: string
          stripe_checkout_session_id?: string | null
          stripe_checkout_url?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "billing_checkout_intents_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: true
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      demo_leads: {
        Row: {
          created_at: string | null
          demo_completed: boolean | null
          demo_progress: Json | null
          demo_started_at: string | null
          discount_code: string | null
          discount_type: string | null
          discount_used: boolean | null
          email: string
          first_name: string
          id: string
          items_completed: number | null
          machines_completed: number | null
          updated_at: string | null
          wants_contact: boolean | null
        }
        Insert: {
          created_at?: string | null
          demo_completed?: boolean | null
          demo_progress?: Json | null
          demo_started_at?: string | null
          discount_code?: string | null
          discount_type?: string | null
          discount_used?: boolean | null
          email: string
          first_name: string
          id?: string
          items_completed?: number | null
          machines_completed?: number | null
          updated_at?: string | null
          wants_contact?: boolean | null
        }
        Update: {
          created_at?: string | null
          demo_completed?: boolean | null
          demo_progress?: Json | null
          demo_started_at?: string | null
          discount_code?: string | null
          discount_type?: string | null
          discount_used?: boolean | null
          email?: string
          first_name?: string
          id?: string
          items_completed?: number | null
          machines_completed?: number | null
          updated_at?: string | null
          wants_contact?: boolean | null
        }
        Relationships: []
      }
      demo_routes: {
        Row: {
          created_at: string | null
          id: string
          item_name: string
          item_quantity: number
          item_sequence: number
          machine_location: string
          machine_name: string
          machine_number: number
          route_name: string
          route_number: number
          slot_number: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          item_name: string
          item_quantity: number
          item_sequence: number
          machine_location: string
          machine_name: string
          machine_number: number
          route_name: string
          route_number: number
          slot_number: string
        }
        Update: {
          created_at?: string | null
          id?: string
          item_name?: string
          item_quantity?: number
          item_sequence?: number
          machine_location?: string
          machine_name?: string
          machine_number?: number
          route_name?: string
          route_number?: number
          slot_number?: string
        }
        Relationships: []
      }
      discount_codes: {
        Row: {
          code: string
          created_at: string | null
          discount_type: string
          discount_value: number
          duration_months: number | null
          expires_at: string | null
          id: string
          max_uses: number | null
          times_used: number | null
        }
        Insert: {
          code: string
          created_at?: string | null
          discount_type: string
          discount_value: number
          duration_months?: number | null
          expires_at?: string | null
          id?: string
          max_uses?: number | null
          times_used?: number | null
        }
        Update: {
          code?: string
          created_at?: string | null
          discount_type?: string
          discount_value?: number
          duration_months?: number | null
          expires_at?: string | null
          id?: string
          max_uses?: number | null
          times_used?: number | null
        }
        Relationships: []
      }
      items: {
        Row: {
          created_at: string | null
          id: string
          inventory_current: number | null
          inventory_parlevel: number | null
          machine_id: string
          product_name: string
          quantity: number
          sequence: number
          slot: string | null
          status: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          inventory_current?: number | null
          inventory_parlevel?: number | null
          machine_id: string
          product_name: string
          quantity?: number
          sequence?: number
          slot?: string | null
          status?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          inventory_current?: number | null
          inventory_parlevel?: number | null
          machine_id?: string
          product_name?: string
          quantity?: number
          sequence?: number
          slot?: string | null
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "items_machine_id_fkey"
            columns: ["machine_id"]
            isOneToOne: false
            referencedRelation: "machines"
            referencedColumns: ["id"]
          },
        ]
      }
      global_keywords: {
        Row: {
          confidence_score: number | null
          created_at: string | null
          id: string
          keyword: string
          last_used_at: string | null
          total_failure: number | null
          total_success: number | null
          updated_at: string | null
          user_count: number | null
        }
        Insert: {
          confidence_score?: number | null
          created_at?: string | null
          id?: string
          keyword: string
          last_used_at?: string | null
          total_failure?: number | null
          total_success?: number | null
          updated_at?: string | null
          user_count?: number | null
        }
        Update: {
          confidence_score?: number | null
          created_at?: string | null
          id?: string
          keyword?: string
          last_used_at?: string | null
          total_failure?: number | null
          total_success?: number | null
          updated_at?: string | null
          user_count?: number | null
        }
        Relationships: []
      }
      machines: {
        Row: {
          completed_items: number
          created_at: string | null
          id: string
          location_name: string | null
          machine_name: string
          machine_number: number | null
          route_id: string
          route_name: string | null
          sequence: number
          skipped_at_item: number | null
          status: string | null
          total_items: number | null
        }
        Insert: {
          completed_items?: number
          created_at?: string | null
          id?: string
          location_name?: string | null
          machine_name: string
          machine_number?: number | null
          route_id: string
          route_name?: string | null
          sequence?: number
          skipped_at_item?: number | null
          status?: string | null
          total_items?: number | null
        }
        Update: {
          completed_items?: number
          created_at?: string | null
          id?: string
          location_name?: string | null
          machine_name?: string
          machine_number?: number | null
          route_id?: string
          route_name?: string | null
          sequence?: number
          skipped_at_item?: number | null
          status?: string | null
          total_items?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "machines_route_id_fkey"
            columns: ["route_id"]
            isOneToOne: false
            referencedRelation: "routes"
            referencedColumns: ["id"]
          },
        ]
      }
      monthly_usage: {
        Row: {
          account_id: string
          calculated_drivers_needed: number | null
          created_at: string | null
          declared_drivers: number
          id: string
          month: string
          peak_daily_machines: number | null
          total_machines_completed: number | null
          updated_at: string | null
          working_days: number | null
        }
        Insert: {
          account_id: string
          calculated_drivers_needed?: number | null
          created_at?: string | null
          declared_drivers: number
          id?: string
          month: string
          peak_daily_machines?: number | null
          total_machines_completed?: number | null
          updated_at?: string | null
          working_days?: number | null
        }
        Update: {
          account_id?: string
          calculated_drivers_needed?: number | null
          created_at?: string | null
          declared_drivers?: number
          id?: string
          month?: string
          peak_daily_machines?: number | null
          total_machines_completed?: number | null
          updated_at?: string | null
          working_days?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "monthly_usage_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          call_two_items: boolean
          created_at: string | null
          email: string
          environment_type: string
          first_name: string | null
          id: string
          is_active: boolean | null
          last_name: string | null
          onboarding_completed_at: string | null
          tts_volume: number
          updated_at: string | null
        }
        Insert: {
          call_two_items?: boolean
          created_at?: string | null
          email: string
          environment_type?: string
          first_name?: string | null
          id: string
          is_active?: boolean | null
          last_name?: string | null
          onboarding_completed_at?: string | null
          tts_volume?: number
          updated_at?: string | null
        }
        Update: {
          call_two_items?: boolean
          created_at?: string | null
          email?: string
          environment_type?: string
          first_name?: string | null
          id?: string
          is_active?: boolean | null
          last_name?: string | null
          onboarding_completed_at?: string | null
          tts_volume?: number
          updated_at?: string | null
        }
        Relationships: []
      }
      route_assignments: {
        Row: {
          assigned_at: string | null
          assigned_by: string | null
          id: string
          route_id: string
          user_id: string
        }
        Insert: {
          assigned_at?: string | null
          assigned_by?: string | null
          id?: string
          route_id: string
          user_id: string
        }
        Update: {
          assigned_at?: string | null
          assigned_by?: string | null
          id?: string
          route_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "route_assignments_route_id_fkey"
            columns: ["route_id"]
            isOneToOne: false
            referencedRelation: "routes"
            referencedColumns: ["id"]
          },
        ]
      }
      routes: {
        Row: {
          account_id: string
          created_at: string | null
          delivery_date: string
          driver_name: string | null
          id: string
          pdf_url: string | null
          picking_revision: string
          route_name: string
          total_items: number | null
          total_machines: number | null
          user_id: string
        }
        Insert: {
          account_id: string
          created_at?: string | null
          delivery_date: string
          driver_name?: string | null
          id?: string
          pdf_url?: string | null
          picking_revision?: string
          route_name: string
          total_items?: number | null
          total_machines?: number | null
          user_id: string
        }
        Update: {
          account_id?: string
          created_at?: string | null
          delivery_date?: string
          driver_name?: string | null
          id?: string
          pdf_url?: string | null
          picking_revision?: string
          route_name?: string
          total_items?: number | null
          total_machines?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "routes_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "routes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_keywords: {
        Row: {
          confidence_score: number | null
          created_at: string | null
          failure_count: number | null
          id: string
          keyword: string
          last_used_at: string | null
          success_count: number | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          confidence_score?: number | null
          created_at?: string | null
          failure_count?: number | null
          id?: string
          keyword: string
          last_used_at?: string | null
          success_count?: number | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          confidence_score?: number | null
          created_at?: string | null
          failure_count?: number | null
          id?: string
          keyword?: string
          last_used_at?: string | null
          success_count?: number | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      sessions: {
        Row: {
          completed_at: string | null
          created_at: string | null
          current_machine_id: string | null
          current_route_id: string | null
          delivery_date: string | null
          id: string
          pick_direction: string | null
          session_key: string
          started_at: string | null
          status: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string | null
          current_machine_id?: string | null
          current_route_id?: string | null
          delivery_date?: string | null
          id?: string
          pick_direction?: string | null
          session_key: string
          started_at?: string | null
          status?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string | null
          current_machine_id?: string | null
          current_route_id?: string | null
          delivery_date?: string | null
          id?: string
          pick_direction?: string | null
          session_key?: string
          started_at?: string | null
          status?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sessions_current_machine_id_fkey"
            columns: ["current_machine_id"]
            isOneToOne: false
            referencedRelation: "machines"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sessions_current_route_id_fkey"
            columns: ["current_route_id"]
            isOneToOne: false
            referencedRelation: "routes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sessions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      stripe_webhook_events: {
        Row: {
          attempts: number
          event_created_at: string
          event_id: string
          event_type: string
          last_error: string | null
          processed_at: string | null
          status: string
          updated_at: string
        }
        Insert: {
          attempts?: number
          event_created_at: string
          event_id: string
          event_type: string
          last_error?: string | null
          processed_at?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          attempts?: number
          event_created_at?: string
          event_id?: string
          event_type?: string
          last_error?: string | null
          processed_at?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      account_users_view: {
        Row: {
          account_id: string | null
          account_name: string | null
          can_view_all_routes: boolean | null
          created_at: string | null
          email: string | null
          first_name: string | null
          id: string | null
          last_name: string | null
          role: Database["public"]["Enums"]["app_role"] | null
          user_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "account_users_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      apply_stripe_account_state: {
        Args: {
          p_account_id: string
          p_customer_id: string
          p_driver_count: number
          p_event_created_at: string
          p_period_end: string | null
          p_subscription_id: string
          p_subscription_status: string
        }
        Returns: boolean
      }
      admin_update_account_access: {
        Args: {
          p_account_id: string
          p_driver_count: number
          p_is_complimentary: boolean
          p_subscription_status: string
        }
        Returns: Database["public"]["Tables"]["accounts"]["Row"]
      }
      can_view_all_routes: { Args: { _user_id: string }; Returns: boolean }
      claim_stripe_webhook_event: {
        Args: {
          p_event_created_at: string
          p_event_id: string
          p_event_type: string
        }
        Returns: string
      }
      complete_billing_checkout: {
        Args: {
          p_account_id: string
          p_operation_id: string
          p_session_id: string
          p_session_url: string
        }
        Returns: undefined
      }
      expire_billing_checkout: {
        Args: { p_account_id: string; p_operation_id: string }
        Returns: undefined
      }
      finish_stripe_webhook_event: {
        Args: { p_error?: string | null; p_event_id: string }
        Returns: undefined
      }
      generate_demo_discount_code: { Args: never; Returns: string }
      get_top_user_keywords: {
        Args: {
          p_limit?: number
          p_min_confidence?: number
          p_user_id: string
        }
        Returns: {
          confidence_score: number
          failure_count: number
          keyword: string
          last_used_at: string
          success_count: number
        }[]
      }
      get_next_item: {
        Args: { p_session_key: string }
        Returns: {
          items_remaining: number
          location_name: string
          machine_complete: boolean
          machine_name: string
          machine_number: number
          product_name: string
          quantity: number
          route_complete: boolean
          route_name: string
          session_id: string
          session_status: string
          slot: string
        }[]
      }
      get_routes_for_date: {
        Args: { p_date: string; p_user_id: string }
        Returns: {
          route_id: string
          route_name: string
          total_items: number
          total_machines: number
        }[]
      }
      get_user_account_id: { Args: { user_uuid: string }; Returns: string }
      has_role: {
        Args: {
          required_role: Database["public"]["Enums"]["app_role"]
          user_uuid: string
        }
        Returns: boolean
      }
      reserve_billing_checkout: {
        Args: {
          p_account_id: string
          p_driver_count: number
          p_operation_id: string
        }
        Returns: {
          driver_count: number
          operation_id: string
          status: string
          stripe_checkout_session_id: string | null
          stripe_checkout_url: string | null
        }[]
      }
      update_demo_progress: {
        Args: {
          p_demo_completed?: boolean
          p_email: string
          p_items_completed: number
          p_machines_completed: number
        }
        Returns: undefined
      }
      upsert_user_keyword: {
        Args: { p_keyword: string; p_success: boolean; p_user_id: string }
        Returns: undefined
      }
    }
    Enums: {
      app_role: "primary_admin" | "driver"
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
      app_role: ["primary_admin", "driver"],
    },
  },
} as const
