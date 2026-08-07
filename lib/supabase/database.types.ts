// Generated from the live schema via the Supabase MCP `generate_typescript_types`
// tool. Regenerate after any migration — do not hand-edit.
export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: "14.15"
  }
  public: {
    Tables: {
      approvers: {
        Row: {
          email: string | null
          id: string
          name: string
          property_code: string | null
          region: string | null
          role: string
        }
        Insert: {
          email?: string | null
          id?: string
          name: string
          property_code?: string | null
          region?: string | null
          role: string
        }
        Update: {
          email?: string | null
          id?: string
          name?: string
          property_code?: string | null
          region?: string | null
          role?: string
        }
        Relationships: [
          {
            foreignKeyName: "approvers_property_code_fkey"
            columns: ["property_code"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["code"]
          },
        ]
      }
      audit_events: {
        Row: {
          actor: string
          cost_usd: number | null
          detail: string
          event_id: string
          id: string
          invoice_id: string | null
          label: string
          latency_ms: number | null
          stage: string
          timestamp: string
          workflow_id: string
        }
        Insert: {
          actor: string
          cost_usd?: number | null
          detail: string
          event_id: string
          id?: string
          invoice_id?: string | null
          label: string
          latency_ms?: number | null
          stage: string
          timestamp?: string
          workflow_id: string
        }
        Update: {
          actor?: string
          cost_usd?: number | null
          detail?: string
          event_id?: string
          id?: string
          invoice_id?: string | null
          label?: string
          latency_ms?: number | null
          stage?: string
          timestamp?: string
          workflow_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "audit_events_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      controls: {
        Row: {
          blocking: boolean
          control_id: string
          created_at: string
          evidence_references: Json
          id: string
          invoice_id: string
          label: string
          reason: string
          severity: string
          status: string
        }
        Insert: {
          blocking?: boolean
          control_id: string
          created_at?: string
          evidence_references?: Json
          id?: string
          invoice_id: string
          label: string
          reason: string
          severity: string
          status: string
        }
        Update: {
          blocking?: boolean
          control_id?: string
          created_at?: string
          evidence_references?: Json
          id?: string
          invoice_id?: string
          label?: string
          reason?: string
          severity?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "controls_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      cost_centers: {
        Row: {
          code: string
          name: string
        }
        Insert: {
          code: string
          name: string
        }
        Update: {
          code?: string
          name?: string
        }
        Relationships: []
      }
      decisions: {
        Row: {
          approval_route: Json
          created_at: string
          id: string
          invoice_id: string
          outcome: string
          policy_version: string
          proposed_accounting_change: Json | null
          reason: string
          required_actions: Json
          workflow_id: string
        }
        Insert: {
          approval_route?: Json
          created_at?: string
          id?: string
          invoice_id: string
          outcome: string
          policy_version: string
          proposed_accounting_change?: Json | null
          reason: string
          required_actions?: Json
          workflow_id: string
        }
        Update: {
          approval_route?: Json
          created_at?: string
          id?: string
          invoice_id?: string
          outcome?: string
          policy_version?: string
          proposed_accounting_change?: Json | null
          reason?: string
          required_actions?: Json
          workflow_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "decisions_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: true
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          created_at: string
          currency: string | null
          due_date: string | null
          extracted: Json
          file_hash: string
          id: string
          invoice_date: string | null
          invoice_number: string | null
          invoice_number_normalized: string | null
          mime_type: string
          original_file_name: string
          policy_version: string | null
          purchase_order_id: string | null
          received_at: string
          scenario_key: string | null
          sender_email: string | null
          source: string
          status: string
          storage_path: string | null
          submission_id: string
          subtotal: number | null
          supplier_id: string | null
          tax: number | null
          total: number | null
          updated_at: string
          workflow_id: string
        }
        Insert: {
          created_at?: string
          currency?: string | null
          due_date?: string | null
          extracted?: Json
          file_hash: string
          id?: string
          invoice_date?: string | null
          invoice_number?: string | null
          invoice_number_normalized?: string | null
          mime_type: string
          original_file_name: string
          policy_version?: string | null
          purchase_order_id?: string | null
          received_at: string
          scenario_key?: string | null
          sender_email?: string | null
          source: string
          status?: string
          storage_path?: string | null
          submission_id: string
          subtotal?: number | null
          supplier_id?: string | null
          tax?: number | null
          total?: number | null
          updated_at?: string
          workflow_id?: string
        }
        Update: {
          created_at?: string
          currency?: string | null
          due_date?: string | null
          extracted?: Json
          file_hash?: string
          id?: string
          invoice_date?: string | null
          invoice_number?: string | null
          invoice_number_normalized?: string | null
          mime_type?: string
          original_file_name?: string
          policy_version?: string | null
          purchase_order_id?: string | null
          received_at?: string
          scenario_key?: string | null
          sender_email?: string | null
          source?: string
          status?: string
          storage_path?: string | null
          submission_id?: string
          subtotal?: number | null
          supplier_id?: string | null
          tax?: number | null
          total?: number | null
          updated_at?: string
          workflow_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoices_purchase_order_id_fkey"
            columns: ["purchase_order_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      jobs: {
        Row: {
          attempts: number
          created_at: string
          id: string
          invoice_id: string | null
          job_type: string
          last_error: string | null
          max_attempts: number
          next_run_at: string
          payload: Json
          status: string
          updated_at: string
        }
        Insert: {
          attempts?: number
          created_at?: string
          id?: string
          invoice_id?: string | null
          job_type: string
          last_error?: string | null
          max_attempts?: number
          next_run_at?: string
          payload?: Json
          status?: string
          updated_at?: string
        }
        Update: {
          attempts?: number
          created_at?: string
          id?: string
          invoice_id?: string | null
          job_type?: string
          last_error?: string | null
          max_attempts?: number
          next_run_at?: string
          payload?: Json
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "jobs_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
        ]
      }
      match_results: {
        Row: {
          duplicate_candidates: Json
          id: string
          invoice_id: string
          purchase_order_id: string | null
          purchase_order_match: string
          receipt_ids: Json
          supplier_id: string | null
          supplier_match: string
        }
        Insert: {
          duplicate_candidates?: Json
          id?: string
          invoice_id: string
          purchase_order_id?: string | null
          purchase_order_match: string
          receipt_ids?: Json
          supplier_id?: string | null
          supplier_match: string
        }
        Update: {
          duplicate_candidates?: Json
          id?: string
          invoice_id?: string
          purchase_order_id?: string | null
          purchase_order_match?: string
          receipt_ids?: Json
          supplier_id?: string | null
          supplier_match?: string
        }
        Relationships: [
          {
            foreignKeyName: "match_results_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: true
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "match_results_purchase_order_id_fkey"
            columns: ["purchase_order_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "match_results_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      po_lines: {
        Row: {
          approved_quantity: number
          description: string
          id: string
          line_number: number
          purchase_order_id: string
          sku: string | null
          unit_price: number
        }
        Insert: {
          approved_quantity: number
          description: string
          id?: string
          line_number: number
          purchase_order_id: string
          sku?: string | null
          unit_price: number
        }
        Update: {
          approved_quantity?: number
          description?: string
          id?: string
          line_number?: number
          purchase_order_id?: string
          sku?: string | null
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "po_lines_purchase_order_id_fkey"
            columns: ["purchase_order_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      policies: {
        Row: {
          config: Json
          created_at: string
          is_active: boolean
          version: string
        }
        Insert: {
          config: Json
          created_at?: string
          is_active?: boolean
          version: string
        }
        Update: {
          config?: Json
          created_at?: string
          is_active?: boolean
          version?: string
        }
        Relationships: []
      }
      properties: {
        Row: {
          city: string
          code: string
          name: string
          region: string
        }
        Insert: {
          city: string
          code: string
          name: string
          region: string
        }
        Update: {
          city?: string
          code?: string
          name?: string
          region?: string
        }
        Relationships: []
      }
      purchase_orders: {
        Row: {
          created_at: string
          currency: string
          id: string
          issued_date: string
          not_to_exceed: number
          po_number: string
          property_code: string
          status: string
          supplier_id: string
        }
        Insert: {
          created_at?: string
          currency?: string
          id?: string
          issued_date: string
          not_to_exceed: number
          po_number: string
          property_code: string
          status?: string
          supplier_id: string
        }
        Update: {
          created_at?: string
          currency?: string
          id?: string
          issued_date?: string
          not_to_exceed?: number
          po_number?: string
          property_code?: string
          status?: string
          supplier_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "purchase_orders_property_code_fkey"
            columns: ["property_code"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["code"]
          },
          {
            foreignKeyName: "purchase_orders_supplier_id_fkey"
            columns: ["supplier_id"]
            isOneToOne: false
            referencedRelation: "suppliers"
            referencedColumns: ["id"]
          },
        ]
      }
      rate_limit_events: {
        Row: {
          client_key: string
          created_at: string
          id: string
        }
        Insert: {
          client_key: string
          created_at?: string
          id?: string
        }
        Update: {
          client_key?: string
          created_at?: string
          id?: string
        }
        Relationships: []
      }
      receipt_lines: {
        Row: {
          description: string
          id: string
          quantity_received: number
          receipt_id: string
          sku: string | null
        }
        Insert: {
          description: string
          id?: string
          quantity_received: number
          receipt_id: string
          sku?: string | null
        }
        Update: {
          description?: string
          id?: string
          quantity_received?: number
          receipt_id?: string
          sku?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "receipt_lines_receipt_id_fkey"
            columns: ["receipt_id"]
            isOneToOne: false
            referencedRelation: "receipts"
            referencedColumns: ["id"]
          },
        ]
      }
      receipts: {
        Row: {
          created_at: string
          id: string
          purchase_order_id: string
          received_by: string
          received_date: string
        }
        Insert: {
          created_at?: string
          id?: string
          purchase_order_id: string
          received_by: string
          received_date: string
        }
        Update: {
          created_at?: string
          id?: string
          purchase_order_id?: string
          received_by?: string
          received_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "receipts_purchase_order_id_fkey"
            columns: ["purchase_order_id"]
            isOneToOne: false
            referencedRelation: "purchase_orders"
            referencedColumns: ["id"]
          },
        ]
      }
      response_cache: {
        Row: {
          cache_key: string
          created_at: string
          response: Json
        }
        Insert: {
          cache_key: string
          created_at?: string
          response: Json
        }
        Update: {
          cache_key?: string
          created_at?: string
          response?: Json
        }
        Relationships: []
      }
      spend_ledger: {
        Row: {
          day: string
          spend_usd: number
        }
        Insert: {
          day: string
          spend_usd?: number
        }
        Update: {
          day?: string
          spend_usd?: number
        }
        Relationships: []
      }
      suppliers: {
        Row: {
          approved_domain: string | null
          bank_account_last4: string | null
          bank_name: string | null
          bank_routing_last4: string | null
          bank_verified_at: string | null
          created_at: string
          id: string
          name: string
          status: string
          tax_id: string
          tax_id_normalized: string | null
        }
        Insert: {
          approved_domain?: string | null
          bank_account_last4?: string | null
          bank_name?: string | null
          bank_routing_last4?: string | null
          bank_verified_at?: string | null
          created_at?: string
          id?: string
          name: string
          status?: string
          tax_id: string
          tax_id_normalized?: string | null
        }
        Update: {
          approved_domain?: string | null
          bank_account_last4?: string | null
          bank_name?: string | null
          bank_routing_last4?: string | null
          bank_verified_at?: string | null
          created_at?: string
          id?: string
          name?: string
          status?: string
          tax_id?: string
          tax_id_normalized?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      claim_next_job: {
        Args: { p_job_type: string }
        Returns: {
          attempts: number
          created_at: string
          id: string
          invoice_id: string | null
          job_type: string
          last_error: string | null
          max_attempts: number
          next_run_at: string
          payload: Json
          status: string
          updated_at: string
        }[]
      }
      refund_spend: {
        Args: { p_amount: number; p_day: string }
        Returns: undefined
      }
      reserve_spend: {
        Args: { p_amount: number; p_cap: number; p_day: string }
        Returns: {
          allowed: boolean
          spent_after: number
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
  public: {
    Enums: {},
  },
} as const
