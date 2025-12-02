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
      contact_submissions: {
        Row: {
          business_name: string
          created_at: string
          email: string
          first_name: string
          id: string
          last_name: string
          marketing_challenge: string | null
          status: string
          updated_at: string
          website_url: string | null
        }
        Insert: {
          business_name: string
          created_at?: string
          email: string
          first_name: string
          id?: string
          last_name: string
          marketing_challenge?: string | null
          status?: string
          updated_at?: string
          website_url?: string | null
        }
        Update: {
          business_name?: string
          created_at?: string
          email?: string
          first_name?: string
          id?: string
          last_name?: string
          marketing_challenge?: string | null
          status?: string
          updated_at?: string
          website_url?: string | null
        }
        Relationships: []
      }
      gap_analysis_submissions: {
        Row: {
          ad_manager: string | null
          ad_performance_notes: string | null
          ad_platforms: string | null
          additional_notes: string | null
          ads_match_customer_intent: boolean | null
          ads_use_landing_pages: boolean | null
          ai_analysis: Json | null
          analytics_review_frequency: string | null
          asks_for_reviews: boolean | null
          automation_wishlist: string | null
          avg_customer_lifetime_value: string | null
          avg_time_to_quote: string | null
          biggest_agency_fear: string | null
          biggest_marketing_frustration: string | null
          business_name: string
          close_rate: string | null
          common_objections: string | null
          completed_at: string | null
          contact_submission_id: string | null
          conversion_tracking_method: string | null
          cost_per_acquisition: string | null
          cost_per_lead: string | null
          created_at: string
          crm_name: string | null
          crm_tracks_all_inbound: boolean | null
          current_step: number | null
          data_accuracy_confidence: string | null
          does_ab_testing: boolean | null
          email: string
          emails_past_customers: boolean | null
          fastest_impact: string | null
          first_name: string
          growth_satisfaction: number | null
          has_abandoned_followups: boolean | null
          has_crm: boolean | null
          has_dashboards: Json | null
          has_loyalty_referral_program: boolean | null
          has_post_purchase_followup: boolean | null
          has_reputation_tool: boolean | null
          has_seasonality: boolean | null
          has_segmentation_drip: boolean | null
          id: string
          investing_in_seo: boolean | null
          knows_best_lead_sources: boolean | null
          knows_organic_traffic: boolean | null
          kpi_tracking_frequency: string | null
          kpis_tracked: string | null
          last_name: string
          lead_response_time: string | null
          lead_to_customer_conversion_rate: string | null
          least_understood_marketing: string | null
          marketing_to_offload: string | null
          monthly_ad_spend: string | null
          monthly_marketing_budget: string | null
          monthly_new_reviews: number | null
          monthly_organic_traffic: number | null
          monthly_website_leads: number | null
          past_marketing_failures: string | null
          phone: string | null
          primary_customer_sources: string | null
          priority_improvement: string | null
          ranking_for_keywords: boolean | null
          reason_seeking_help: string | null
          repeat_customer_rate: string | null
          reputation_tool_name: string | null
          revenue_new_customers_pct: number | null
          revenue_referrals_pct: number | null
          revenue_repeat_customers_pct: number | null
          running_paid_ads: boolean | null
          runs_retargeting: boolean | null
          satisfied_with_ad_performance: boolean | null
          seasonality_details: string | null
          social_media_handles: string | null
          status: string
          success_definition_12mo: string | null
          success_definition_3mo: string | null
          success_definition_6mo: string | null
          suffering_from_weak_digital: string | null
          top_business_goals: string | null
          top_competitors: string | null
          tracking_keyword_rankings: boolean | null
          tracks_website_conversions: boolean | null
          unique_differentiator: string | null
          updated_at: string
          uses_email_automation: boolean | null
          uses_google_analytics: boolean | null
          uses_online_scheduling: boolean | null
          uses_sms_followups: boolean | null
          website_last_updated: string | null
          website_url: string | null
          weekly_team_hours: string | null
          what_makes_it_worth_it: string | null
          where_prospects_lost: string | null
          who_handles_marketing: string | null
        }
        Insert: {
          ad_manager?: string | null
          ad_performance_notes?: string | null
          ad_platforms?: string | null
          additional_notes?: string | null
          ads_match_customer_intent?: boolean | null
          ads_use_landing_pages?: boolean | null
          ai_analysis?: Json | null
          analytics_review_frequency?: string | null
          asks_for_reviews?: boolean | null
          automation_wishlist?: string | null
          avg_customer_lifetime_value?: string | null
          avg_time_to_quote?: string | null
          biggest_agency_fear?: string | null
          biggest_marketing_frustration?: string | null
          business_name: string
          close_rate?: string | null
          common_objections?: string | null
          completed_at?: string | null
          contact_submission_id?: string | null
          conversion_tracking_method?: string | null
          cost_per_acquisition?: string | null
          cost_per_lead?: string | null
          created_at?: string
          crm_name?: string | null
          crm_tracks_all_inbound?: boolean | null
          current_step?: number | null
          data_accuracy_confidence?: string | null
          does_ab_testing?: boolean | null
          email: string
          emails_past_customers?: boolean | null
          fastest_impact?: string | null
          first_name: string
          growth_satisfaction?: number | null
          has_abandoned_followups?: boolean | null
          has_crm?: boolean | null
          has_dashboards?: Json | null
          has_loyalty_referral_program?: boolean | null
          has_post_purchase_followup?: boolean | null
          has_reputation_tool?: boolean | null
          has_seasonality?: boolean | null
          has_segmentation_drip?: boolean | null
          id?: string
          investing_in_seo?: boolean | null
          knows_best_lead_sources?: boolean | null
          knows_organic_traffic?: boolean | null
          kpi_tracking_frequency?: string | null
          kpis_tracked?: string | null
          last_name: string
          lead_response_time?: string | null
          lead_to_customer_conversion_rate?: string | null
          least_understood_marketing?: string | null
          marketing_to_offload?: string | null
          monthly_ad_spend?: string | null
          monthly_marketing_budget?: string | null
          monthly_new_reviews?: number | null
          monthly_organic_traffic?: number | null
          monthly_website_leads?: number | null
          past_marketing_failures?: string | null
          phone?: string | null
          primary_customer_sources?: string | null
          priority_improvement?: string | null
          ranking_for_keywords?: boolean | null
          reason_seeking_help?: string | null
          repeat_customer_rate?: string | null
          reputation_tool_name?: string | null
          revenue_new_customers_pct?: number | null
          revenue_referrals_pct?: number | null
          revenue_repeat_customers_pct?: number | null
          running_paid_ads?: boolean | null
          runs_retargeting?: boolean | null
          satisfied_with_ad_performance?: boolean | null
          seasonality_details?: string | null
          social_media_handles?: string | null
          status?: string
          success_definition_12mo?: string | null
          success_definition_3mo?: string | null
          success_definition_6mo?: string | null
          suffering_from_weak_digital?: string | null
          top_business_goals?: string | null
          top_competitors?: string | null
          tracking_keyword_rankings?: boolean | null
          tracks_website_conversions?: boolean | null
          unique_differentiator?: string | null
          updated_at?: string
          uses_email_automation?: boolean | null
          uses_google_analytics?: boolean | null
          uses_online_scheduling?: boolean | null
          uses_sms_followups?: boolean | null
          website_last_updated?: string | null
          website_url?: string | null
          weekly_team_hours?: string | null
          what_makes_it_worth_it?: string | null
          where_prospects_lost?: string | null
          who_handles_marketing?: string | null
        }
        Update: {
          ad_manager?: string | null
          ad_performance_notes?: string | null
          ad_platforms?: string | null
          additional_notes?: string | null
          ads_match_customer_intent?: boolean | null
          ads_use_landing_pages?: boolean | null
          ai_analysis?: Json | null
          analytics_review_frequency?: string | null
          asks_for_reviews?: boolean | null
          automation_wishlist?: string | null
          avg_customer_lifetime_value?: string | null
          avg_time_to_quote?: string | null
          biggest_agency_fear?: string | null
          biggest_marketing_frustration?: string | null
          business_name?: string
          close_rate?: string | null
          common_objections?: string | null
          completed_at?: string | null
          contact_submission_id?: string | null
          conversion_tracking_method?: string | null
          cost_per_acquisition?: string | null
          cost_per_lead?: string | null
          created_at?: string
          crm_name?: string | null
          crm_tracks_all_inbound?: boolean | null
          current_step?: number | null
          data_accuracy_confidence?: string | null
          does_ab_testing?: boolean | null
          email?: string
          emails_past_customers?: boolean | null
          fastest_impact?: string | null
          first_name?: string
          growth_satisfaction?: number | null
          has_abandoned_followups?: boolean | null
          has_crm?: boolean | null
          has_dashboards?: Json | null
          has_loyalty_referral_program?: boolean | null
          has_post_purchase_followup?: boolean | null
          has_reputation_tool?: boolean | null
          has_seasonality?: boolean | null
          has_segmentation_drip?: boolean | null
          id?: string
          investing_in_seo?: boolean | null
          knows_best_lead_sources?: boolean | null
          knows_organic_traffic?: boolean | null
          kpi_tracking_frequency?: string | null
          kpis_tracked?: string | null
          last_name?: string
          lead_response_time?: string | null
          lead_to_customer_conversion_rate?: string | null
          least_understood_marketing?: string | null
          marketing_to_offload?: string | null
          monthly_ad_spend?: string | null
          monthly_marketing_budget?: string | null
          monthly_new_reviews?: number | null
          monthly_organic_traffic?: number | null
          monthly_website_leads?: number | null
          past_marketing_failures?: string | null
          phone?: string | null
          primary_customer_sources?: string | null
          priority_improvement?: string | null
          ranking_for_keywords?: boolean | null
          reason_seeking_help?: string | null
          repeat_customer_rate?: string | null
          reputation_tool_name?: string | null
          revenue_new_customers_pct?: number | null
          revenue_referrals_pct?: number | null
          revenue_repeat_customers_pct?: number | null
          running_paid_ads?: boolean | null
          runs_retargeting?: boolean | null
          satisfied_with_ad_performance?: boolean | null
          seasonality_details?: string | null
          social_media_handles?: string | null
          status?: string
          success_definition_12mo?: string | null
          success_definition_3mo?: string | null
          success_definition_6mo?: string | null
          suffering_from_weak_digital?: string | null
          top_business_goals?: string | null
          top_competitors?: string | null
          tracking_keyword_rankings?: boolean | null
          tracks_website_conversions?: boolean | null
          unique_differentiator?: string | null
          updated_at?: string
          uses_email_automation?: boolean | null
          uses_google_analytics?: boolean | null
          uses_online_scheduling?: boolean | null
          uses_sms_followups?: boolean | null
          website_last_updated?: string | null
          website_url?: string | null
          weekly_team_hours?: string | null
          what_makes_it_worth_it?: string | null
          where_prospects_lost?: string | null
          who_handles_marketing?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "gap_analysis_submissions_contact_submission_id_fkey"
            columns: ["contact_submission_id"]
            isOneToOne: false
            referencedRelation: "contact_submissions"
            referencedColumns: ["id"]
          },
        ]
      }
      pdf_leads: {
        Row: {
          created_at: string
          email: string
          first_name: string | null
          id: string
          source: string | null
        }
        Insert: {
          created_at?: string
          email: string
          first_name?: string | null
          id?: string
          source?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          first_name?: string | null
          id?: string
          source?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
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
