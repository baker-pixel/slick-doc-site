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
      activity_feed: {
        Row: {
          activity_type: string
          client_account_id: string
          created_at: string
          description: string | null
          icon: string | null
          id: string
          metadata: Json | null
          title: string
        }
        Insert: {
          activity_type: string
          client_account_id: string
          created_at?: string
          description?: string | null
          icon?: string | null
          id?: string
          metadata?: Json | null
          title: string
        }
        Update: {
          activity_type?: string
          client_account_id?: string
          created_at?: string
          description?: string | null
          icon?: string | null
          id?: string
          metadata?: Json | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "activity_feed_client_account_id_fkey"
            columns: ["client_account_id"]
            isOneToOne: false
            referencedRelation: "client_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      ad_campaign_analytics: {
        Row: {
          ad_campaign_id: string
          clicks: number | null
          conversions: number | null
          cpa: number | null
          cpc: number | null
          created_at: string
          ctr: number | null
          id: string
          impressions: number | null
          notes: string | null
          platform: string | null
          recorded_date: string
          roas: number | null
          spend: number | null
        }
        Insert: {
          ad_campaign_id: string
          clicks?: number | null
          conversions?: number | null
          cpa?: number | null
          cpc?: number | null
          created_at?: string
          ctr?: number | null
          id?: string
          impressions?: number | null
          notes?: string | null
          platform?: string | null
          recorded_date: string
          roas?: number | null
          spend?: number | null
        }
        Update: {
          ad_campaign_id?: string
          clicks?: number | null
          conversions?: number | null
          cpa?: number | null
          cpc?: number | null
          created_at?: string
          ctr?: number | null
          id?: string
          impressions?: number | null
          notes?: string | null
          platform?: string | null
          recorded_date?: string
          roas?: number | null
          spend?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "ad_campaign_analytics_ad_campaign_id_fkey"
            columns: ["ad_campaign_id"]
            isOneToOne: false
            referencedRelation: "ad_campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      ad_campaigns: {
        Row: {
          ab_variants: Json | null
          additional_info: string | null
          budget: string | null
          budget_recommendations: Json | null
          client_account_id: string | null
          competitor_urls: string[] | null
          created_at: string
          generated_ads: Json
          generated_images: Json | null
          goal: string
          id: string
          industry: string
          landing_page_html: string | null
          location: string
          name: string
          performance_predictions: Json | null
          platform: string
          scheduled_end_date: string | null
          scheduled_start_date: string | null
          status: string
          updated_at: string
        }
        Insert: {
          ab_variants?: Json | null
          additional_info?: string | null
          budget?: string | null
          budget_recommendations?: Json | null
          client_account_id?: string | null
          competitor_urls?: string[] | null
          created_at?: string
          generated_ads?: Json
          generated_images?: Json | null
          goal: string
          id?: string
          industry: string
          landing_page_html?: string | null
          location: string
          name: string
          performance_predictions?: Json | null
          platform?: string
          scheduled_end_date?: string | null
          scheduled_start_date?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          ab_variants?: Json | null
          additional_info?: string | null
          budget?: string | null
          budget_recommendations?: Json | null
          client_account_id?: string | null
          competitor_urls?: string[] | null
          created_at?: string
          generated_ads?: Json
          generated_images?: Json | null
          goal?: string
          id?: string
          industry?: string
          landing_page_html?: string | null
          location?: string
          name?: string
          performance_predictions?: Json | null
          platform?: string
          scheduled_end_date?: string | null
          scheduled_start_date?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ad_campaigns_client_account_id_fkey"
            columns: ["client_account_id"]
            isOneToOne: false
            referencedRelation: "client_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      ad_templates: {
        Row: {
          ad_type: string
          created_at: string
          description: string | null
          id: string
          is_active: boolean | null
          name: string
          platform: string
          template_config: Json
          updated_at: string
        }
        Insert: {
          ad_type: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          platform: string
          template_config: Json
          updated_at?: string
        }
        Update: {
          ad_type?: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          platform?: string
          template_config?: Json
          updated_at?: string
        }
        Relationships: []
      }
      admin_settings: {
        Row: {
          created_at: string
          description: string | null
          id: string
          key: string
          updated_at: string
          value: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          key: string
          updated_at?: string
          value: string
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          key?: string
          updated_at?: string
          value?: string
        }
        Relationships: []
      }
      automation_alerts: {
        Row: {
          acknowledged_at: string | null
          acknowledged_by: string | null
          alert_type: string
          created_at: string
          id: string
          message: string
          metadata: Json | null
          severity: string
          source: string | null
          source_id: string | null
          title: string
        }
        Insert: {
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          alert_type: string
          created_at?: string
          id?: string
          message: string
          metadata?: Json | null
          severity?: string
          source?: string | null
          source_id?: string | null
          title: string
        }
        Update: {
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          alert_type?: string
          created_at?: string
          id?: string
          message?: string
          metadata?: Json | null
          severity?: string
          source?: string | null
          source_id?: string | null
          title?: string
        }
        Relationships: []
      }
      automation_jobs: {
        Row: {
          ai_model_used: string | null
          client_id: string
          completed_at: string | null
          created_at: string
          error_message: string | null
          id: string
          input_data: Json | null
          job_type: string
          output_data: Json | null
          sop_id: string | null
          started_at: string | null
          status: string
        }
        Insert: {
          ai_model_used?: string | null
          client_id: string
          completed_at?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          input_data?: Json | null
          job_type: string
          output_data?: Json | null
          sop_id?: string | null
          started_at?: string | null
          status?: string
        }
        Update: {
          ai_model_used?: string | null
          client_id?: string
          completed_at?: string | null
          created_at?: string
          error_message?: string | null
          id?: string
          input_data?: Json | null
          job_type?: string
          output_data?: Json | null
          sop_id?: string | null
          started_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "automation_jobs_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "client_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "automation_jobs_sop_id_fkey"
            columns: ["sop_id"]
            isOneToOne: false
            referencedRelation: "sop_documents"
            referencedColumns: ["id"]
          },
        ]
      }
      before_after_showcases: {
        Row: {
          after_mobile_url: string | null
          after_screenshot_url: string | null
          after_stats: Json | null
          before_mobile_url: string | null
          before_screenshot_url: string | null
          before_stats: Json | null
          client_account_id: string
          created_at: string
          description: string | null
          id: string
          improvements: Json | null
          is_public: boolean
          project_type: string
          title: string
          updated_at: string
        }
        Insert: {
          after_mobile_url?: string | null
          after_screenshot_url?: string | null
          after_stats?: Json | null
          before_mobile_url?: string | null
          before_screenshot_url?: string | null
          before_stats?: Json | null
          client_account_id: string
          created_at?: string
          description?: string | null
          id?: string
          improvements?: Json | null
          is_public?: boolean
          project_type?: string
          title: string
          updated_at?: string
        }
        Update: {
          after_mobile_url?: string | null
          after_screenshot_url?: string | null
          after_stats?: Json | null
          before_mobile_url?: string | null
          before_screenshot_url?: string | null
          before_stats?: Json | null
          client_account_id?: string
          created_at?: string
          description?: string | null
          id?: string
          improvements?: Json | null
          is_public?: boolean
          project_type?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "before_after_showcases_client_account_id_fkey"
            columns: ["client_account_id"]
            isOneToOne: false
            referencedRelation: "client_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      brand_assets: {
        Row: {
          asset_type: string
          category: string
          client_account_id: string
          created_at: string
          description: string | null
          file_path: string | null
          file_size: number | null
          file_url: string | null
          id: string
          is_primary: boolean | null
          metadata: Json | null
          name: string
          updated_at: string
        }
        Insert: {
          asset_type?: string
          category?: string
          client_account_id: string
          created_at?: string
          description?: string | null
          file_path?: string | null
          file_size?: number | null
          file_url?: string | null
          id?: string
          is_primary?: boolean | null
          metadata?: Json | null
          name: string
          updated_at?: string
        }
        Update: {
          asset_type?: string
          category?: string
          client_account_id?: string
          created_at?: string
          description?: string | null
          file_path?: string | null
          file_size?: number | null
          file_url?: string | null
          id?: string
          is_primary?: boolean | null
          metadata?: Json | null
          name?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "brand_assets_client_account_id_fkey"
            columns: ["client_account_id"]
            isOneToOne: false
            referencedRelation: "client_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      case_studies: {
        Row: {
          challenge: string
          client_account_id: string
          created_at: string
          id: string
          industry: string | null
          results: Json
          solution: string
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          challenge: string
          client_account_id: string
          created_at?: string
          id?: string
          industry?: string | null
          results?: Json
          solution: string
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          challenge?: string
          client_account_id?: string
          created_at?: string
          id?: string
          industry?: string | null
          results?: Json
          solution?: string
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "case_studies_client_account_id_fkey"
            columns: ["client_account_id"]
            isOneToOne: false
            referencedRelation: "client_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      client_accounts: {
        Row: {
          business_name: string
          created_at: string
          email: string
          first_name: string | null
          google_place_id: string | null
          google_review_url: string | null
          id: string
          industry: string | null
          intake_completed_at: string | null
          kickoff_scheduled_at: string | null
          last_name: string | null
          level: number | null
          onboarded_at: string | null
          review_qr_image_url: string | null
          status: string
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          tier: string
          tone: string | null
          updated_at: string
          website_summary: string | null
          website_url: string | null
        }
        Insert: {
          business_name: string
          created_at?: string
          email: string
          first_name?: string | null
          google_place_id?: string | null
          google_review_url?: string | null
          id?: string
          industry?: string | null
          intake_completed_at?: string | null
          kickoff_scheduled_at?: string | null
          last_name?: string | null
          level?: number | null
          onboarded_at?: string | null
          review_qr_image_url?: string | null
          status?: string
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          tier: string
          tone?: string | null
          updated_at?: string
          website_summary?: string | null
          website_url?: string | null
        }
        Update: {
          business_name?: string
          created_at?: string
          email?: string
          first_name?: string | null
          google_place_id?: string | null
          google_review_url?: string | null
          id?: string
          industry?: string | null
          intake_completed_at?: string | null
          kickoff_scheduled_at?: string | null
          last_name?: string | null
          level?: number | null
          onboarded_at?: string | null
          review_qr_image_url?: string | null
          status?: string
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          tier?: string
          tone?: string | null
          updated_at?: string
          website_summary?: string | null
          website_url?: string | null
        }
        Relationships: []
      }
      client_analytics: {
        Row: {
          client_account_id: string
          created_at: string
          highlights: Json | null
          id: string
          metrics: Json
          period_end: string
          period_start: string
        }
        Insert: {
          client_account_id: string
          created_at?: string
          highlights?: Json | null
          id?: string
          metrics?: Json
          period_end: string
          period_start: string
        }
        Update: {
          client_account_id?: string
          created_at?: string
          highlights?: Json | null
          id?: string
          metrics?: Json
          period_end?: string
          period_start?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_analytics_client_account_id_fkey"
            columns: ["client_account_id"]
            isOneToOne: false
            referencedRelation: "client_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      client_competitors: {
        Row: {
          client_account_id: string
          created_at: string
          domain: string
          id: string
          name: string
          notes: string | null
        }
        Insert: {
          client_account_id: string
          created_at?: string
          domain: string
          id?: string
          name: string
          notes?: string | null
        }
        Update: {
          client_account_id?: string
          created_at?: string
          domain?: string
          id?: string
          name?: string
          notes?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "client_competitors_client_account_id_fkey"
            columns: ["client_account_id"]
            isOneToOne: false
            referencedRelation: "client_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      client_credentials: {
        Row: {
          client_id: string | null
          created_at: string | null
          id: string
          wordpress_app_password: string | null
          wordpress_url: string | null
          wordpress_username: string | null
        }
        Insert: {
          client_id?: string | null
          created_at?: string | null
          id?: string
          wordpress_app_password?: string | null
          wordpress_url?: string | null
          wordpress_username?: string | null
        }
        Update: {
          client_id?: string | null
          created_at?: string | null
          id?: string
          wordpress_app_password?: string | null
          wordpress_url?: string | null
          wordpress_username?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "client_credentials_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "client_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      client_documents: {
        Row: {
          category: string
          client_account_id: string
          created_at: string
          description: string | null
          file_path: string
          file_size: number | null
          file_type: string | null
          id: string
          name: string
          updated_at: string
          uploaded_by: string | null
        }
        Insert: {
          category?: string
          client_account_id: string
          created_at?: string
          description?: string | null
          file_path: string
          file_size?: number | null
          file_type?: string | null
          id?: string
          name: string
          updated_at?: string
          uploaded_by?: string | null
        }
        Update: {
          category?: string
          client_account_id?: string
          created_at?: string
          description?: string | null
          file_path?: string
          file_size?: number | null
          file_type?: string | null
          id?: string
          name?: string
          updated_at?: string
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "client_documents_client_account_id_fkey"
            columns: ["client_account_id"]
            isOneToOne: false
            referencedRelation: "client_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      client_integrations: {
        Row: {
          client_account_id: string
          created_at: string
          external_id: string | null
          id: string
          integration_config_id: string
          is_active: boolean | null
          settings: Json | null
          updated_at: string
        }
        Insert: {
          client_account_id: string
          created_at?: string
          external_id?: string | null
          id?: string
          integration_config_id: string
          is_active?: boolean | null
          settings?: Json | null
          updated_at?: string
        }
        Update: {
          client_account_id?: string
          created_at?: string
          external_id?: string | null
          id?: string
          integration_config_id?: string
          is_active?: boolean | null
          settings?: Json | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_integrations_client_account_id_fkey"
            columns: ["client_account_id"]
            isOneToOne: false
            referencedRelation: "client_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_integrations_integration_config_id_fkey"
            columns: ["integration_config_id"]
            isOneToOne: false
            referencedRelation: "integration_configs"
            referencedColumns: ["id"]
          },
        ]
      }
      client_invitations: {
        Row: {
          accepted_at: string | null
          client_account_id: string
          created_at: string
          email: string
          expires_at: string
          first_name: string | null
          id: string
          invited_by: string | null
          last_name: string | null
          token: string
        }
        Insert: {
          accepted_at?: string | null
          client_account_id: string
          created_at?: string
          email: string
          expires_at?: string
          first_name?: string | null
          id?: string
          invited_by?: string | null
          last_name?: string | null
          token?: string
        }
        Update: {
          accepted_at?: string | null
          client_account_id?: string
          created_at?: string
          email?: string
          expires_at?: string
          first_name?: string | null
          id?: string
          invited_by?: string | null
          last_name?: string | null
          token?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_invitations_client_account_id_fkey"
            columns: ["client_account_id"]
            isOneToOne: false
            referencedRelation: "client_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      client_invoices: {
        Row: {
          amount: number
          client_account_id: string
          created_at: string
          currency: string | null
          description: string | null
          due_date: string
          id: string
          invoice_number: string
          line_items: Json | null
          paid_at: string | null
          status: string
          stripe_invoice_id: string | null
          stripe_payment_intent_id: string | null
          updated_at: string
        }
        Insert: {
          amount: number
          client_account_id: string
          created_at?: string
          currency?: string | null
          description?: string | null
          due_date: string
          id?: string
          invoice_number: string
          line_items?: Json | null
          paid_at?: string | null
          status?: string
          stripe_invoice_id?: string | null
          stripe_payment_intent_id?: string | null
          updated_at?: string
        }
        Update: {
          amount?: number
          client_account_id?: string
          created_at?: string
          currency?: string | null
          description?: string | null
          due_date?: string
          id?: string
          invoice_number?: string
          line_items?: Json | null
          paid_at?: string | null
          status?: string
          stripe_invoice_id?: string | null
          stripe_payment_intent_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_invoices_client_account_id_fkey"
            columns: ["client_account_id"]
            isOneToOne: false
            referencedRelation: "client_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      client_meetings: {
        Row: {
          booked_by: string | null
          client_account_id: string
          created_at: string
          description: string | null
          duration_minutes: number
          id: string
          meeting_link: string | null
          meeting_type: string
          notes: string | null
          scheduled_at: string
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          booked_by?: string | null
          client_account_id: string
          created_at?: string
          description?: string | null
          duration_minutes?: number
          id?: string
          meeting_link?: string | null
          meeting_type?: string
          notes?: string | null
          scheduled_at: string
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          booked_by?: string | null
          client_account_id?: string
          created_at?: string
          description?: string | null
          duration_minutes?: number
          id?: string
          meeting_link?: string | null
          meeting_type?: string
          notes?: string | null
          scheduled_at?: string
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_meetings_client_account_id_fkey"
            columns: ["client_account_id"]
            isOneToOne: false
            referencedRelation: "client_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      client_messages: {
        Row: {
          client_account_id: string
          created_at: string
          id: string
          is_read: boolean
          message: string
          sender_name: string | null
          sender_type: string
        }
        Insert: {
          client_account_id: string
          created_at?: string
          id?: string
          is_read?: boolean
          message: string
          sender_name?: string | null
          sender_type: string
        }
        Update: {
          client_account_id?: string
          created_at?: string
          id?: string
          is_read?: boolean
          message?: string
          sender_name?: string | null
          sender_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_messages_client_account_id_fkey"
            columns: ["client_account_id"]
            isOneToOne: false
            referencedRelation: "client_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      client_notifications: {
        Row: {
          client_account_id: string
          created_at: string
          description: string | null
          id: string
          is_positive: boolean | null
          is_read: boolean
          metric: string | null
          metric_value: string | null
          notification_type: string
          priority: string
          title: string
        }
        Insert: {
          client_account_id: string
          created_at?: string
          description?: string | null
          id?: string
          is_positive?: boolean | null
          is_read?: boolean
          metric?: string | null
          metric_value?: string | null
          notification_type: string
          priority?: string
          title: string
        }
        Update: {
          client_account_id?: string
          created_at?: string
          description?: string | null
          id?: string
          is_positive?: boolean | null
          is_read?: boolean
          metric?: string | null
          metric_value?: string | null
          notification_type?: string
          priority?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_notifications_client_account_id_fkey"
            columns: ["client_account_id"]
            isOneToOne: false
            referencedRelation: "client_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      client_oauth_tokens: {
        Row: {
          access_token: string | null
          client_id: string | null
          created_at: string | null
          id: string
          platform: string
          token_metadata: Json | null
          updated_at: string | null
        }
        Insert: {
          access_token?: string | null
          client_id?: string | null
          created_at?: string | null
          id?: string
          platform: string
          token_metadata?: Json | null
          updated_at?: string | null
        }
        Update: {
          access_token?: string | null
          client_id?: string | null
          created_at?: string | null
          id?: string
          platform?: string
          token_metadata?: Json | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "client_oauth_tokens_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "client_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      client_onboarding: {
        Row: {
          client_account_id: string
          created_at: string
          crm_added_at: string | null
          current_step: number | null
          dashboard_created_at: string | null
          id: string
          intake_form_completed_at: string | null
          intake_form_sent_at: string | null
          kickoff_completed_at: string | null
          kickoff_scheduled_at: string | null
          notes: string | null
          onboarding_completed_at: string | null
          review_system_setup_at: string | null
          updated_at: string
        }
        Insert: {
          client_account_id: string
          created_at?: string
          crm_added_at?: string | null
          current_step?: number | null
          dashboard_created_at?: string | null
          id?: string
          intake_form_completed_at?: string | null
          intake_form_sent_at?: string | null
          kickoff_completed_at?: string | null
          kickoff_scheduled_at?: string | null
          notes?: string | null
          onboarding_completed_at?: string | null
          review_system_setup_at?: string | null
          updated_at?: string
        }
        Update: {
          client_account_id?: string
          created_at?: string
          crm_added_at?: string | null
          current_step?: number | null
          dashboard_created_at?: string | null
          id?: string
          intake_form_completed_at?: string | null
          intake_form_sent_at?: string | null
          kickoff_completed_at?: string | null
          kickoff_scheduled_at?: string | null
          notes?: string | null
          onboarding_completed_at?: string | null
          review_system_setup_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_onboarding_client_account_id_fkey"
            columns: ["client_account_id"]
            isOneToOne: true
            referencedRelation: "client_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      client_platform_credentials: {
        Row: {
          additional_info: Json | null
          client_account_id: string
          created_at: string
          id: string
          login_url: string | null
          notes: string | null
          password: string | null
          platform_name: string
          platform_type: string
          updated_at: string
          username: string | null
        }
        Insert: {
          additional_info?: Json | null
          client_account_id: string
          created_at?: string
          id?: string
          login_url?: string | null
          notes?: string | null
          password?: string | null
          platform_name: string
          platform_type: string
          updated_at?: string
          username?: string | null
        }
        Update: {
          additional_info?: Json | null
          client_account_id?: string
          created_at?: string
          id?: string
          login_url?: string | null
          notes?: string | null
          password?: string | null
          platform_name?: string
          platform_type?: string
          updated_at?: string
          username?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "client_platform_credentials_client_account_id_fkey"
            columns: ["client_account_id"]
            isOneToOne: false
            referencedRelation: "client_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      client_portal_preferences: {
        Row: {
          accent_color: string
          activity_widget_types: string[] | null
          client_account_id: string
          created_at: string
          default_landing_page: string
          email_notifications: boolean
          hidden_tabs: string[] | null
          id: string
          layout_density: string
          notification_digest: string
          notify_on_approvals: boolean
          notify_on_deliverables: boolean
          notify_on_invoices: boolean
          notify_on_meetings: boolean
          notify_on_messages: boolean
          pinned_sections: string[] | null
          show_analytics_summary: boolean
          show_quick_actions: boolean
          sidebar_order: string[] | null
          theme: string
          updated_at: string
          user_id: string
        }
        Insert: {
          accent_color?: string
          activity_widget_types?: string[] | null
          client_account_id: string
          created_at?: string
          default_landing_page?: string
          email_notifications?: boolean
          hidden_tabs?: string[] | null
          id?: string
          layout_density?: string
          notification_digest?: string
          notify_on_approvals?: boolean
          notify_on_deliverables?: boolean
          notify_on_invoices?: boolean
          notify_on_meetings?: boolean
          notify_on_messages?: boolean
          pinned_sections?: string[] | null
          show_analytics_summary?: boolean
          show_quick_actions?: boolean
          sidebar_order?: string[] | null
          theme?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          accent_color?: string
          activity_widget_types?: string[] | null
          client_account_id?: string
          created_at?: string
          default_landing_page?: string
          email_notifications?: boolean
          hidden_tabs?: string[] | null
          id?: string
          layout_density?: string
          notification_digest?: string
          notify_on_approvals?: boolean
          notify_on_deliverables?: boolean
          notify_on_invoices?: boolean
          notify_on_meetings?: boolean
          notify_on_messages?: boolean
          pinned_sections?: string[] | null
          show_analytics_summary?: boolean
          show_quick_actions?: boolean
          sidebar_order?: string[] | null
          theme?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_portal_preferences_client_account_id_fkey"
            columns: ["client_account_id"]
            isOneToOne: false
            referencedRelation: "client_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      client_portal_users: {
        Row: {
          client_account_id: string
          created_at: string
          first_name: string | null
          id: string
          invited_at: string
          invited_by: string | null
          last_login_at: string | null
          last_name: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          client_account_id: string
          created_at?: string
          first_name?: string | null
          id?: string
          invited_at?: string
          invited_by?: string | null
          last_login_at?: string | null
          last_name?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          client_account_id?: string
          created_at?: string
          first_name?: string | null
          id?: string
          invited_at?: string
          invited_by?: string | null
          last_login_at?: string | null
          last_name?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_portal_users_client_account_id_fkey"
            columns: ["client_account_id"]
            isOneToOne: false
            referencedRelation: "client_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      client_projects: {
        Row: {
          client_account_id: string
          created_at: string
          description: string | null
          id: string
          name: string
          progress_percentage: number | null
          start_date: string | null
          status: string
          target_end_date: string | null
          updated_at: string
        }
        Insert: {
          client_account_id: string
          created_at?: string
          description?: string | null
          id?: string
          name: string
          progress_percentage?: number | null
          start_date?: string | null
          status?: string
          target_end_date?: string | null
          updated_at?: string
        }
        Update: {
          client_account_id?: string
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          progress_percentage?: number | null
          start_date?: string | null
          status?: string
          target_end_date?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_projects_client_account_id_fkey"
            columns: ["client_account_id"]
            isOneToOne: false
            referencedRelation: "client_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      client_reports: {
        Row: {
          client_id: string
          created_at: string
          id: string
          insights: Json | null
          job_id: string | null
          metrics: Json | null
          recommendations: Json | null
          report_period_end: string
          report_period_start: string
          report_type: string
        }
        Insert: {
          client_id: string
          created_at?: string
          id?: string
          insights?: Json | null
          job_id?: string | null
          metrics?: Json | null
          recommendations?: Json | null
          report_period_end: string
          report_period_start: string
          report_type: string
        }
        Update: {
          client_id?: string
          created_at?: string
          id?: string
          insights?: Json | null
          job_id?: string | null
          metrics?: Json | null
          recommendations?: Json | null
          report_period_end?: string
          report_period_start?: string
          report_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_reports_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "client_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_reports_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "automation_jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      client_requests: {
        Row: {
          admin_notes: string | null
          assigned_to: string | null
          attachments: Json | null
          client_account_id: string
          completed_at: string | null
          created_at: string
          description: string | null
          due_date: string | null
          id: string
          priority: string
          request_type: string
          status: string
          submitted_by: string | null
          title: string
          updated_at: string
        }
        Insert: {
          admin_notes?: string | null
          assigned_to?: string | null
          attachments?: Json | null
          client_account_id: string
          completed_at?: string | null
          created_at?: string
          description?: string | null
          due_date?: string | null
          id?: string
          priority?: string
          request_type?: string
          status?: string
          submitted_by?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          admin_notes?: string | null
          assigned_to?: string | null
          attachments?: Json | null
          client_account_id?: string
          completed_at?: string | null
          created_at?: string
          description?: string | null
          due_date?: string | null
          id?: string
          priority?: string
          request_type?: string
          status?: string
          submitted_by?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_requests_client_account_id_fkey"
            columns: ["client_account_id"]
            isOneToOne: false
            referencedRelation: "client_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      client_tasks: {
        Row: {
          assigned_to: string | null
          automation_job_id: string | null
          automation_type: string
          blocked_reason: string | null
          category: string
          client_account_id: string
          completed_at: string | null
          completed_by: string | null
          created_at: string
          depends_on: string[] | null
          description: string | null
          due_date: string | null
          id: string
          instructions: string | null
          name: string
          notes: string | null
          order_index: number | null
          output_data: Json | null
          priority: string | null
          sla_deadline_hours: number | null
          started_at: string | null
          status: string
          task_template_id: string | null
          time_spent_minutes: number | null
          timer_started_at: string | null
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          automation_job_id?: string | null
          automation_type?: string
          blocked_reason?: string | null
          category?: string
          client_account_id: string
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          depends_on?: string[] | null
          description?: string | null
          due_date?: string | null
          id?: string
          instructions?: string | null
          name: string
          notes?: string | null
          order_index?: number | null
          output_data?: Json | null
          priority?: string | null
          sla_deadline_hours?: number | null
          started_at?: string | null
          status?: string
          task_template_id?: string | null
          time_spent_minutes?: number | null
          timer_started_at?: string | null
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          automation_job_id?: string | null
          automation_type?: string
          blocked_reason?: string | null
          category?: string
          client_account_id?: string
          completed_at?: string | null
          completed_by?: string | null
          created_at?: string
          depends_on?: string[] | null
          description?: string | null
          due_date?: string | null
          id?: string
          instructions?: string | null
          name?: string
          notes?: string | null
          order_index?: number | null
          output_data?: Json | null
          priority?: string | null
          sla_deadline_hours?: number | null
          started_at?: string | null
          status?: string
          task_template_id?: string | null
          time_spent_minutes?: number | null
          timer_started_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_tasks_automation_job_id_fkey"
            columns: ["automation_job_id"]
            isOneToOne: false
            referencedRelation: "automation_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_tasks_client_account_id_fkey"
            columns: ["client_account_id"]
            isOneToOne: false
            referencedRelation: "client_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_tasks_task_template_id_fkey"
            columns: ["task_template_id"]
            isOneToOne: false
            referencedRelation: "task_templates"
            referencedColumns: ["id"]
          },
        ]
      }
      client_workflows: {
        Row: {
          client_id: string
          created_at: string | null
          current_step: number | null
          id: string
          status: string | null
          total_steps: number | null
          updated_at: string | null
          workflow_name: string | null
        }
        Insert: {
          client_id: string
          created_at?: string | null
          current_step?: number | null
          id?: string
          status?: string | null
          total_steps?: number | null
          updated_at?: string | null
          workflow_name?: string | null
        }
        Update: {
          client_id?: string
          created_at?: string | null
          current_step?: number | null
          id?: string
          status?: string | null
          total_steps?: number | null
          updated_at?: string | null
          workflow_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "client_workflows_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "client_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      contact_submissions: {
        Row: {
          business_name: string
          created_at: string
          email: string
          first_name: string
          id: string
          last_activity_at: string | null
          last_name: string
          marketing_challenge: string | null
          pipeline_stage_id: string | null
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
          last_activity_at?: string | null
          last_name: string
          marketing_challenge?: string | null
          pipeline_stage_id?: string | null
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
          last_activity_at?: string | null
          last_name?: string
          marketing_challenge?: string | null
          pipeline_stage_id?: string | null
          status?: string
          updated_at?: string
          website_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contact_submissions_pipeline_stage_id_fkey"
            columns: ["pipeline_stage_id"]
            isOneToOne: false
            referencedRelation: "pipeline_stages"
            referencedColumns: ["id"]
          },
        ]
      }
      content_approvals: {
        Row: {
          client_account_id: string
          content_id: string | null
          content_preview: string | null
          content_type: string
          created_at: string
          feedback: string | null
          full_content: string | null
          id: string
          reviewed_at: string | null
          status: string
          submitted_at: string
          title: string
          updated_at: string
        }
        Insert: {
          client_account_id: string
          content_id?: string | null
          content_preview?: string | null
          content_type: string
          created_at?: string
          feedback?: string | null
          full_content?: string | null
          id?: string
          reviewed_at?: string | null
          status?: string
          submitted_at?: string
          title: string
          updated_at?: string
        }
        Update: {
          client_account_id?: string
          content_id?: string | null
          content_preview?: string | null
          content_type?: string
          created_at?: string
          feedback?: string | null
          full_content?: string | null
          id?: string
          reviewed_at?: string | null
          status?: string
          submitted_at?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "content_approvals_client_account_id_fkey"
            columns: ["client_account_id"]
            isOneToOne: false
            referencedRelation: "client_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_approvals_content_id_fkey"
            columns: ["content_id"]
            isOneToOne: false
            referencedRelation: "generated_content"
            referencedColumns: ["id"]
          },
        ]
      }
      content_calendar: {
        Row: {
          content: string
          content_id: string | null
          content_type: string
          created_at: string
          id: string
          metadata: Json | null
          platform: string | null
          published_at: string | null
          scheduled_for: string
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          content: string
          content_id?: string | null
          content_type: string
          created_at?: string
          id?: string
          metadata?: Json | null
          platform?: string | null
          published_at?: string | null
          scheduled_for: string
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          content?: string
          content_id?: string | null
          content_type?: string
          created_at?: string
          id?: string
          metadata?: Json | null
          platform?: string | null
          published_at?: string | null
          scheduled_for?: string
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "content_calendar_content_id_fkey"
            columns: ["content_id"]
            isOneToOne: false
            referencedRelation: "generated_content"
            referencedColumns: ["id"]
          },
        ]
      }
      daily_digests: {
        Row: {
          content: Json
          created_at: string
          generated_for: string
          id: string
          sent_at: string | null
          sent_to: string[] | null
        }
        Insert: {
          content?: Json
          created_at?: string
          generated_for: string
          id?: string
          sent_at?: string | null
          sent_to?: string[] | null
        }
        Update: {
          content?: Json
          created_at?: string
          generated_for?: string
          id?: string
          sent_at?: string | null
          sent_to?: string[] | null
        }
        Relationships: []
      }
      deliverables: {
        Row: {
          category: string
          client_account_id: string
          created_at: string
          description: string | null
          feedback: string | null
          file_name: string | null
          file_url: string | null
          id: string
          preview_url: string | null
          project_id: string | null
          rating: number | null
          reviewed_at: string | null
          revision_count: number | null
          revision_notes: string | null
          status: string
          submitted_at: string
          title: string
          updated_at: string
        }
        Insert: {
          category?: string
          client_account_id: string
          created_at?: string
          description?: string | null
          feedback?: string | null
          file_name?: string | null
          file_url?: string | null
          id?: string
          preview_url?: string | null
          project_id?: string | null
          rating?: number | null
          reviewed_at?: string | null
          revision_count?: number | null
          revision_notes?: string | null
          status?: string
          submitted_at?: string
          title: string
          updated_at?: string
        }
        Update: {
          category?: string
          client_account_id?: string
          created_at?: string
          description?: string | null
          feedback?: string | null
          file_name?: string | null
          file_url?: string | null
          id?: string
          preview_url?: string | null
          project_id?: string | null
          rating?: number | null
          reviewed_at?: string | null
          revision_count?: number | null
          revision_notes?: string | null
          status?: string
          submitted_at?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "deliverables_client_account_id_fkey"
            columns: ["client_account_id"]
            isOneToOne: false
            referencedRelation: "client_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deliverables_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "client_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      email_cleanup_log: {
        Row: {
          cleaned_at: string
          email: string
          id: string
          metadata: Json | null
          reason: string
        }
        Insert: {
          cleaned_at?: string
          email: string
          id?: string
          metadata?: Json | null
          reason: string
        }
        Update: {
          cleaned_at?: string
          email?: string
          id?: string
          metadata?: Json | null
          reason?: string
        }
        Relationships: []
      }
      email_logs: {
        Row: {
          id: string
          metadata: Json | null
          recipient_email: string
          resend_id: string | null
          sent_at: string
          status: string
          subject: string
          tracking_id: string | null
        }
        Insert: {
          id?: string
          metadata?: Json | null
          recipient_email: string
          resend_id?: string | null
          sent_at?: string
          status: string
          subject: string
          tracking_id?: string | null
        }
        Update: {
          id?: string
          metadata?: Json | null
          recipient_email?: string
          resend_id?: string | null
          sent_at?: string
          status?: string
          subject?: string
          tracking_id?: string | null
        }
        Relationships: []
      }
      email_preferences: {
        Row: {
          created_at: string
          email: string
          id: string
          preferences: Json | null
          subscribed: boolean
          unsubscribe_reason: string | null
          unsubscribed_at: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          preferences?: Json | null
          subscribed?: boolean
          unsubscribe_reason?: string | null
          unsubscribed_at?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          preferences?: Json | null
          subscribed?: boolean
          unsubscribe_reason?: string | null
          unsubscribed_at?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      email_queue: {
        Row: {
          created_at: string
          error_message: string | null
          html_content: string
          id: string
          metadata: Json | null
          optimal_send_time: boolean | null
          recipient_email: string
          recipient_name: string | null
          recipient_timezone: string | null
          scheduled_for: string
          sent_at: string | null
          status: string
          subject: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          html_content: string
          id?: string
          metadata?: Json | null
          optimal_send_time?: boolean | null
          recipient_email: string
          recipient_name?: string | null
          recipient_timezone?: string | null
          scheduled_for?: string
          sent_at?: string | null
          status?: string
          subject: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          html_content?: string
          id?: string
          metadata?: Json | null
          optimal_send_time?: boolean | null
          recipient_email?: string
          recipient_name?: string | null
          recipient_timezone?: string | null
          scheduled_for?: string
          sent_at?: string | null
          status?: string
          subject?: string
        }
        Relationships: []
      }
      email_sequences: {
        Row: {
          created_at: string
          emails: Json
          id: string
          is_active: boolean
          name: string
          trigger_type: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          emails?: Json
          id?: string
          is_active?: boolean
          name: string
          trigger_type: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          emails?: Json
          id?: string
          is_active?: boolean
          name?: string
          trigger_type?: string
          updated_at?: string
        }
        Relationships: []
      }
      email_templates: {
        Row: {
          category: string
          created_at: string
          description: string | null
          html_content: string
          id: string
          is_active: boolean
          name: string
          slug: string
          subject: string
          updated_at: string
          variables: Json | null
        }
        Insert: {
          category?: string
          created_at?: string
          description?: string | null
          html_content: string
          id?: string
          is_active?: boolean
          name: string
          slug: string
          subject: string
          updated_at?: string
          variables?: Json | null
        }
        Update: {
          category?: string
          created_at?: string
          description?: string | null
          html_content?: string
          id?: string
          is_active?: boolean
          name?: string
          slug?: string
          subject?: string
          updated_at?: string
          variables?: Json | null
        }
        Relationships: []
      }
      email_tracking_events: {
        Row: {
          created_at: string
          email_log_id: string | null
          event_type: string
          id: string
          ip_address: string | null
          link_url: string | null
          metadata: Json | null
          user_agent: string | null
        }
        Insert: {
          created_at?: string
          email_log_id?: string | null
          event_type: string
          id?: string
          ip_address?: string | null
          link_url?: string | null
          metadata?: Json | null
          user_agent?: string | null
        }
        Update: {
          created_at?: string
          email_log_id?: string | null
          event_type?: string
          id?: string
          ip_address?: string | null
          link_url?: string | null
          metadata?: Json | null
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "email_tracking_events_email_log_id_fkey"
            columns: ["email_log_id"]
            isOneToOne: false
            referencedRelation: "email_logs"
            referencedColumns: ["id"]
          },
        ]
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
          is_partial: boolean | null
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
          resume_token: string | null
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
          is_partial?: boolean | null
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
          resume_token?: string | null
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
          is_partial?: boolean | null
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
          resume_token?: string | null
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
      generated_content: {
        Row: {
          client_id: string
          content: string
          content_type: string
          created_at: string
          id: string
          job_id: string | null
          metadata: Json | null
          status: string
          title: string | null
          updated_at: string
        }
        Insert: {
          client_id: string
          content: string
          content_type: string
          created_at?: string
          id?: string
          job_id?: string | null
          metadata?: Json | null
          status?: string
          title?: string | null
          updated_at?: string
        }
        Update: {
          client_id?: string
          content?: string
          content_type?: string
          created_at?: string
          id?: string
          job_id?: string | null
          metadata?: Json | null
          status?: string
          title?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "generated_content_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "client_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "generated_content_job_id_fkey"
            columns: ["job_id"]
            isOneToOne: false
            referencedRelation: "automation_jobs"
            referencedColumns: ["id"]
          },
        ]
      }
      integration_configs: {
        Row: {
          api_key_encrypted: string | null
          created_at: string
          id: string
          integration_type: string
          is_active: boolean | null
          name: string
          settings: Json | null
          updated_at: string
        }
        Insert: {
          api_key_encrypted?: string | null
          created_at?: string
          id?: string
          integration_type: string
          is_active?: boolean | null
          name: string
          settings?: Json | null
          updated_at?: string
        }
        Update: {
          api_key_encrypted?: string | null
          created_at?: string
          id?: string
          integration_type?: string
          is_active?: boolean | null
          name?: string
          settings?: Json | null
          updated_at?: string
        }
        Relationships: []
      }
      keyword_gap_results: {
        Row: {
          client_account_id: string
          competitors: string[] | null
          created_at: string
          id: string
          results: Json
        }
        Insert: {
          client_account_id: string
          competitors?: string[] | null
          created_at?: string
          id?: string
          results?: Json
        }
        Update: {
          client_account_id?: string
          competitors?: string[] | null
          created_at?: string
          id?: string
          results?: Json
        }
        Relationships: [
          {
            foreignKeyName: "keyword_gap_results_client_account_id_fkey"
            columns: ["client_account_id"]
            isOneToOne: false
            referencedRelation: "client_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      kpi_dashboards: {
        Row: {
          client_account_id: string
          config: Json
          created_at: string
          id: string
          updated_at: string
        }
        Insert: {
          client_account_id: string
          config?: Json
          created_at?: string
          id?: string
          updated_at?: string
        }
        Update: {
          client_account_id?: string
          config?: Json
          created_at?: string
          id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "kpi_dashboards_client_account_id_fkey"
            columns: ["client_account_id"]
            isOneToOne: true
            referencedRelation: "client_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      learning_content: {
        Row: {
          content_body: string | null
          content_type: string
          content_url: string | null
          created_at: string
          description: string | null
          difficulty_level: string | null
          estimated_read_time: number | null
          id: string
          industry: string | null
          is_featured: boolean | null
          is_published: boolean | null
          tags: string[] | null
          thumbnail_url: string | null
          title: string
          updated_at: string
          view_count: number | null
        }
        Insert: {
          content_body?: string | null
          content_type?: string
          content_url?: string | null
          created_at?: string
          description?: string | null
          difficulty_level?: string | null
          estimated_read_time?: number | null
          id?: string
          industry?: string | null
          is_featured?: boolean | null
          is_published?: boolean | null
          tags?: string[] | null
          thumbnail_url?: string | null
          title: string
          updated_at?: string
          view_count?: number | null
        }
        Update: {
          content_body?: string | null
          content_type?: string
          content_url?: string | null
          created_at?: string
          description?: string | null
          difficulty_level?: string | null
          estimated_read_time?: number | null
          id?: string
          industry?: string | null
          is_featured?: boolean | null
          is_published?: boolean | null
          tags?: string[] | null
          thumbnail_url?: string | null
          title?: string
          updated_at?: string
          view_count?: number | null
        }
        Relationships: []
      }
      learning_progress: {
        Row: {
          client_account_id: string
          completed_at: string | null
          content_id: string
          created_at: string
          id: string
          is_bookmarked: boolean | null
          viewed_at: string | null
        }
        Insert: {
          client_account_id: string
          completed_at?: string | null
          content_id: string
          created_at?: string
          id?: string
          is_bookmarked?: boolean | null
          viewed_at?: string | null
        }
        Update: {
          client_account_id?: string
          completed_at?: string | null
          content_id?: string
          created_at?: string
          id?: string
          is_bookmarked?: boolean | null
          viewed_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "learning_progress_client_account_id_fkey"
            columns: ["client_account_id"]
            isOneToOne: false
            referencedRelation: "client_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "learning_progress_content_id_fkey"
            columns: ["content_id"]
            isOneToOne: false
            referencedRelation: "learning_content"
            referencedColumns: ["id"]
          },
        ]
      }
      page_speed_results: {
        Row: {
          client_account_id: string
          core_web_vitals: Json | null
          created_at: string
          id: string
          raw_data: Json | null
          score_desktop: number | null
          score_mobile: number | null
          url: string
        }
        Insert: {
          client_account_id: string
          core_web_vitals?: Json | null
          created_at?: string
          id?: string
          raw_data?: Json | null
          score_desktop?: number | null
          score_mobile?: number | null
          url: string
        }
        Update: {
          client_account_id?: string
          core_web_vitals?: Json | null
          created_at?: string
          id?: string
          raw_data?: Json | null
          score_desktop?: number | null
          score_mobile?: number | null
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "page_speed_results_client_account_id_fkey"
            columns: ["client_account_id"]
            isOneToOne: false
            referencedRelation: "client_accounts"
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
      personalization_rules: {
        Row: {
          client_account_id: string
          component_type: string
          conditions: Json | null
          created_at: string
          id: string
          is_active: boolean
          name: string
          original_content: string
          personalized_content: string
          priority: number
          segment: string
          updated_at: string
        }
        Insert: {
          client_account_id: string
          component_type: string
          conditions?: Json | null
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          original_content: string
          personalized_content: string
          priority?: number
          segment: string
          updated_at?: string
        }
        Update: {
          client_account_id?: string
          component_type?: string
          conditions?: Json | null
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          original_content?: string
          personalized_content?: string
          priority?: number
          segment?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "personalization_rules_client_account_id_fkey"
            columns: ["client_account_id"]
            isOneToOne: false
            referencedRelation: "client_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      pipeline_stages: {
        Row: {
          color: string | null
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          name: string
          stage_order: number
          updated_at: string
        }
        Insert: {
          color?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          stage_order: number
          updated_at?: string
        }
        Update: {
          color?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          stage_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      project_comments: {
        Row: {
          client_account_id: string
          created_at: string
          id: string
          is_read: boolean | null
          message: string
          milestone_id: string | null
          project_id: string
          sender_name: string | null
          sender_type: string
          user_id: string | null
        }
        Insert: {
          client_account_id: string
          created_at?: string
          id?: string
          is_read?: boolean | null
          message: string
          milestone_id?: string | null
          project_id: string
          sender_name?: string | null
          sender_type: string
          user_id?: string | null
        }
        Update: {
          client_account_id?: string
          created_at?: string
          id?: string
          is_read?: boolean | null
          message?: string
          milestone_id?: string | null
          project_id?: string
          sender_name?: string | null
          sender_type?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "project_comments_client_account_id_fkey"
            columns: ["client_account_id"]
            isOneToOne: false
            referencedRelation: "client_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_comments_milestone_id_fkey"
            columns: ["milestone_id"]
            isOneToOne: false
            referencedRelation: "project_milestones"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_comments_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "client_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_milestones: {
        Row: {
          completed_at: string | null
          created_at: string
          description: string | null
          due_date: string | null
          id: string
          name: string
          project_id: string
          sort_order: number | null
          status: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          description?: string | null
          due_date?: string | null
          id?: string
          name: string
          project_id: string
          sort_order?: number | null
          status?: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          description?: string | null
          due_date?: string | null
          id?: string
          name?: string
          project_id?: string
          sort_order?: number | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_milestones_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "client_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_update_requests: {
        Row: {
          client_account_id: string
          created_at: string
          id: string
          message: string | null
          project_id: string
          requested_by: string | null
          responded_at: string | null
          response: string | null
          status: string
        }
        Insert: {
          client_account_id: string
          created_at?: string
          id?: string
          message?: string | null
          project_id: string
          requested_by?: string | null
          responded_at?: string | null
          response?: string | null
          status?: string
        }
        Update: {
          client_account_id?: string
          created_at?: string
          id?: string
          message?: string | null
          project_id?: string
          requested_by?: string | null
          responded_at?: string | null
          response?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_update_requests_client_account_id_fkey"
            columns: ["client_account_id"]
            isOneToOne: false
            referencedRelation: "client_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_update_requests_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "client_projects"
            referencedColumns: ["id"]
          },
        ]
      }
      qa_checkpoints: {
        Row: {
          checked_at: string | null
          checked_by: string | null
          checkpoint_name: string
          checkpoint_type: string
          created_at: string
          id: string
          is_passed: boolean | null
          notes: string | null
          task_id: string
        }
        Insert: {
          checked_at?: string | null
          checked_by?: string | null
          checkpoint_name: string
          checkpoint_type?: string
          created_at?: string
          id?: string
          is_passed?: boolean | null
          notes?: string | null
          task_id: string
        }
        Update: {
          checked_at?: string | null
          checked_by?: string | null
          checkpoint_name?: string
          checkpoint_type?: string
          created_at?: string
          id?: string
          is_passed?: boolean | null
          notes?: string | null
          task_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "qa_checkpoints_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "client_tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      qa_reports: {
        Row: {
          accessibility_issues: Json | null
          auto_fixes_applied: Json | null
          broken_links: Json | null
          client_account_id: string
          created_at: string
          id: string
          load_time_ms: number | null
          missing_metadata: Json | null
          mobile_issues: Json | null
          overall_score: number | null
          page_title: string | null
          spelling_errors: Json | null
          status: string
          updated_at: string
          url: string
        }
        Insert: {
          accessibility_issues?: Json | null
          auto_fixes_applied?: Json | null
          broken_links?: Json | null
          client_account_id: string
          created_at?: string
          id?: string
          load_time_ms?: number | null
          missing_metadata?: Json | null
          mobile_issues?: Json | null
          overall_score?: number | null
          page_title?: string | null
          spelling_errors?: Json | null
          status?: string
          updated_at?: string
          url: string
        }
        Update: {
          accessibility_issues?: Json | null
          auto_fixes_applied?: Json | null
          broken_links?: Json | null
          client_account_id?: string
          created_at?: string
          id?: string
          load_time_ms?: number | null
          missing_metadata?: Json | null
          mobile_issues?: Json | null
          overall_score?: number | null
          page_title?: string | null
          spelling_errors?: Json | null
          status?: string
          updated_at?: string
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "qa_reports_client_account_id_fkey"
            columns: ["client_account_id"]
            isOneToOne: false
            referencedRelation: "client_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      reporting_schedules: {
        Row: {
          client_account_id: string
          created_at: string
          frequency: string
          id: string
          is_active: boolean | null
          last_run_at: string | null
          next_run_at: string | null
          recipients: string[]
          report_type: string
          updated_at: string
        }
        Insert: {
          client_account_id: string
          created_at?: string
          frequency?: string
          id?: string
          is_active?: boolean | null
          last_run_at?: string | null
          next_run_at?: string | null
          recipients?: string[]
          report_type?: string
          updated_at?: string
        }
        Update: {
          client_account_id?: string
          created_at?: string
          frequency?: string
          id?: string
          is_active?: boolean | null
          last_run_at?: string | null
          next_run_at?: string | null
          recipients?: string[]
          report_type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "reporting_schedules_client_account_id_fkey"
            columns: ["client_account_id"]
            isOneToOne: false
            referencedRelation: "client_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      sales_proposals: {
        Row: {
          contact_submission_id: string | null
          created_at: string
          id: string
          industry_analysis: Json | null
          pricing_breakdown: Json | null
          proposed_services: Json | null
          prospect_business: string
          prospect_email: string
          prospect_industry: string | null
          prospect_name: string
          responded_at: string | null
          roi_projections: Json | null
          sample_designs: Json | null
          sent_at: string | null
          status: string
          timeline: Json | null
          total_investment: number | null
          updated_at: string
          viewed_at: string | null
        }
        Insert: {
          contact_submission_id?: string | null
          created_at?: string
          id?: string
          industry_analysis?: Json | null
          pricing_breakdown?: Json | null
          proposed_services?: Json | null
          prospect_business: string
          prospect_email: string
          prospect_industry?: string | null
          prospect_name: string
          responded_at?: string | null
          roi_projections?: Json | null
          sample_designs?: Json | null
          sent_at?: string | null
          status?: string
          timeline?: Json | null
          total_investment?: number | null
          updated_at?: string
          viewed_at?: string | null
        }
        Update: {
          contact_submission_id?: string | null
          created_at?: string
          id?: string
          industry_analysis?: Json | null
          pricing_breakdown?: Json | null
          proposed_services?: Json | null
          prospect_business?: string
          prospect_email?: string
          prospect_industry?: string | null
          prospect_name?: string
          responded_at?: string | null
          roi_projections?: Json | null
          sample_designs?: Json | null
          sent_at?: string | null
          status?: string
          timeline?: Json | null
          total_investment?: number | null
          updated_at?: string
          viewed_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sales_proposals_contact_submission_id_fkey"
            columns: ["contact_submission_id"]
            isOneToOne: false
            referencedRelation: "contact_submissions"
            referencedColumns: ["id"]
          },
        ]
      }
      seo_audits: {
        Row: {
          audit_type: string
          client_account_id: string
          created_at: string
          id: string
          results: Json
          score: number | null
        }
        Insert: {
          audit_type?: string
          client_account_id: string
          created_at?: string
          id?: string
          results?: Json
          score?: number | null
        }
        Update: {
          audit_type?: string
          client_account_id?: string
          created_at?: string
          id?: string
          results?: Json
          score?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "seo_audits_client_account_id_fkey"
            columns: ["client_account_id"]
            isOneToOne: false
            referencedRelation: "client_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      seo_page_analysis: {
        Row: {
          ai_rewrites: Json | null
          analyzed_at: string
          backlink_potential: number | null
          broken_links: Json | null
          client_account_id: string
          created_at: string
          external_links: number | null
          h1_tags: Json | null
          id: string
          image_count: number | null
          images_missing_alt: number | null
          internal_links: number | null
          keyword_score: number | null
          keywords_found: Json | null
          load_time_ms: number | null
          meta_description: string | null
          meta_title: string | null
          mobile_friendly: boolean | null
          overall_score: number | null
          page_title: string | null
          readability_issues: Json | null
          readability_score: number | null
          suggestions: Json | null
          technical_issues: Json | null
          technical_score: number | null
          updated_at: string
          url: string
          word_count: number | null
        }
        Insert: {
          ai_rewrites?: Json | null
          analyzed_at?: string
          backlink_potential?: number | null
          broken_links?: Json | null
          client_account_id: string
          created_at?: string
          external_links?: number | null
          h1_tags?: Json | null
          id?: string
          image_count?: number | null
          images_missing_alt?: number | null
          internal_links?: number | null
          keyword_score?: number | null
          keywords_found?: Json | null
          load_time_ms?: number | null
          meta_description?: string | null
          meta_title?: string | null
          mobile_friendly?: boolean | null
          overall_score?: number | null
          page_title?: string | null
          readability_issues?: Json | null
          readability_score?: number | null
          suggestions?: Json | null
          technical_issues?: Json | null
          technical_score?: number | null
          updated_at?: string
          url: string
          word_count?: number | null
        }
        Update: {
          ai_rewrites?: Json | null
          analyzed_at?: string
          backlink_potential?: number | null
          broken_links?: Json | null
          client_account_id?: string
          created_at?: string
          external_links?: number | null
          h1_tags?: Json | null
          id?: string
          image_count?: number | null
          images_missing_alt?: number | null
          internal_links?: number | null
          keyword_score?: number | null
          keywords_found?: Json | null
          load_time_ms?: number | null
          meta_description?: string | null
          meta_title?: string | null
          mobile_friendly?: boolean | null
          overall_score?: number | null
          page_title?: string | null
          readability_issues?: Json | null
          readability_score?: number | null
          suggestions?: Json | null
          technical_issues?: Json | null
          technical_score?: number | null
          updated_at?: string
          url?: string
          word_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "seo_page_analysis_client_account_id_fkey"
            columns: ["client_account_id"]
            isOneToOne: false
            referencedRelation: "client_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      seo_suggestions: {
        Row: {
          client_account_id: string
          created_at: string
          id: string
          period: string | null
          status: string | null
          suggestions: Json
        }
        Insert: {
          client_account_id: string
          created_at?: string
          id?: string
          period?: string | null
          status?: string | null
          suggestions?: Json
        }
        Update: {
          client_account_id?: string
          created_at?: string
          id?: string
          period?: string | null
          status?: string | null
          suggestions?: Json
        }
        Relationships: [
          {
            foreignKeyName: "seo_suggestions_client_account_id_fkey"
            columns: ["client_account_id"]
            isOneToOne: false
            referencedRelation: "client_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      service_agreements: {
        Row: {
          agreement_type: string
          client_account_id: string
          created_at: string
          description: string | null
          effective_date: string | null
          expiration_date: string | null
          file_name: string | null
          file_size: number | null
          file_url: string | null
          id: string
          signature_data: string | null
          signed_at: string | null
          signer_ip: string | null
          signer_name: string | null
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          agreement_type?: string
          client_account_id: string
          created_at?: string
          description?: string | null
          effective_date?: string | null
          expiration_date?: string | null
          file_name?: string | null
          file_size?: number | null
          file_url?: string | null
          id?: string
          signature_data?: string | null
          signed_at?: string | null
          signer_ip?: string | null
          signer_name?: string | null
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          agreement_type?: string
          client_account_id?: string
          created_at?: string
          description?: string | null
          effective_date?: string | null
          expiration_date?: string | null
          file_name?: string | null
          file_size?: number | null
          file_url?: string | null
          id?: string
          signature_data?: string | null
          signed_at?: string | null
          signer_ip?: string | null
          signer_name?: string | null
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "service_agreements_client_account_id_fkey"
            columns: ["client_account_id"]
            isOneToOne: false
            referencedRelation: "client_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      sla_configurations: {
        Row: {
          created_at: string
          description: string | null
          id: string
          target_hours: number
          task_category: string
          tier: string
          updated_at: string
          warning_hours: number
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          target_hours?: number
          task_category: string
          tier: string
          updated_at?: string
          warning_hours?: number
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          target_hours?: number
          task_category?: string
          tier?: string
          updated_at?: string
          warning_hours?: number
        }
        Relationships: []
      }
      sop_documents: {
        Row: {
          action_items: Json | null
          category: string
          created_at: string
          description: string | null
          file_url: string | null
          id: string
          is_active: boolean
          name: string
          parsed_content: Json | null
          tier: string
          updated_at: string
        }
        Insert: {
          action_items?: Json | null
          category: string
          created_at?: string
          description?: string | null
          file_url?: string | null
          id?: string
          is_active?: boolean
          name: string
          parsed_content?: Json | null
          tier: string
          updated_at?: string
        }
        Update: {
          action_items?: Json | null
          category?: string
          created_at?: string
          description?: string | null
          file_url?: string | null
          id?: string
          is_active?: boolean
          name?: string
          parsed_content?: Json | null
          tier?: string
          updated_at?: string
        }
        Relationships: []
      }
      task_notifications: {
        Row: {
          client_task_id: string | null
          created_at: string | null
          id: string
          is_read: boolean | null
          message: string | null
          notification_type: string
          read_at: string | null
          title: string
        }
        Insert: {
          client_task_id?: string | null
          created_at?: string | null
          id?: string
          is_read?: boolean | null
          message?: string | null
          notification_type: string
          read_at?: string | null
          title: string
        }
        Update: {
          client_task_id?: string | null
          created_at?: string | null
          id?: string
          is_read?: boolean | null
          message?: string | null
          notification_type?: string
          read_at?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_notifications_client_task_id_fkey"
            columns: ["client_task_id"]
            isOneToOne: false
            referencedRelation: "client_tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      task_templates: {
        Row: {
          automation_type: string
          category: string
          created_at: string
          depends_on_categories: string[] | null
          description: string | null
          estimated_minutes: number | null
          frequency: string | null
          id: string
          instructions: string | null
          is_active: boolean | null
          name: string
          order_index: number | null
          sla_hours: number | null
          tier: string
          updated_at: string
        }
        Insert: {
          automation_type?: string
          category?: string
          created_at?: string
          depends_on_categories?: string[] | null
          description?: string | null
          estimated_minutes?: number | null
          frequency?: string | null
          id?: string
          instructions?: string | null
          is_active?: boolean | null
          name: string
          order_index?: number | null
          sla_hours?: number | null
          tier: string
          updated_at?: string
        }
        Update: {
          automation_type?: string
          category?: string
          created_at?: string
          depends_on_categories?: string[] | null
          description?: string | null
          estimated_minutes?: number | null
          frequency?: string | null
          id?: string
          instructions?: string | null
          is_active?: boolean | null
          name?: string
          order_index?: number | null
          sla_hours?: number | null
          tier?: string
          updated_at?: string
        }
        Relationships: []
      }
      team_members: {
        Row: {
          bio: string | null
          created_at: string
          display_order: number | null
          email: string | null
          id: string
          is_active: boolean
          name: string
          phone: string | null
          photo_url: string | null
          role: string
          specialties: string[] | null
          updated_at: string
        }
        Insert: {
          bio?: string | null
          created_at?: string
          display_order?: number | null
          email?: string | null
          id?: string
          is_active?: boolean
          name: string
          phone?: string | null
          photo_url?: string | null
          role: string
          specialties?: string[] | null
          updated_at?: string
        }
        Update: {
          bio?: string | null
          created_at?: string
          display_order?: number | null
          email?: string | null
          id?: string
          is_active?: boolean
          name?: string
          phone?: string | null
          photo_url?: string | null
          role?: string
          specialties?: string[] | null
          updated_at?: string
        }
        Relationships: []
      }
      tier_interest_submissions: {
        Row: {
          business_name: string
          contacted_at: string | null
          created_at: string
          email: string
          first_name: string
          id: string
          last_name: string
          message: string | null
          phone: string | null
          selected_tier: string
          status: string
        }
        Insert: {
          business_name: string
          contacted_at?: string | null
          created_at?: string
          email: string
          first_name: string
          id?: string
          last_name: string
          message?: string | null
          phone?: string | null
          selected_tier: string
          status?: string
        }
        Update: {
          business_name?: string
          contacted_at?: string | null
          created_at?: string
          email?: string
          first_name?: string
          id?: string
          last_name?: string
          message?: string | null
          phone?: string | null
          selected_tier?: string
          status?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      voice_memos: {
        Row: {
          audio_duration: number | null
          audio_url: string
          client_account_id: string
          context: string | null
          created_at: string
          id: string
          is_read: boolean | null
          related_id: string | null
          transcript: string | null
          transcription_status: string | null
          user_id: string
        }
        Insert: {
          audio_duration?: number | null
          audio_url: string
          client_account_id: string
          context?: string | null
          created_at?: string
          id?: string
          is_read?: boolean | null
          related_id?: string | null
          transcript?: string | null
          transcription_status?: string | null
          user_id: string
        }
        Update: {
          audio_duration?: number | null
          audio_url?: string
          client_account_id?: string
          context?: string | null
          created_at?: string
          id?: string
          is_read?: boolean | null
          related_id?: string | null
          transcript?: string | null
          transcription_status?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "voice_memos_client_account_id_fkey"
            columns: ["client_account_id"]
            isOneToOne: false
            referencedRelation: "client_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      workflow_steps: {
        Row: {
          callback_deadline: string | null
          client_id: string
          completed_at: string | null
          created_at: string | null
          depends_on: number | null
          id: string
          payload: Json | null
          result: Json | null
          status: string | null
          step_name: string
          step_number: number
          task_id: string | null
          task_type: string
          workflow_id: string
        }
        Insert: {
          callback_deadline?: string | null
          client_id: string
          completed_at?: string | null
          created_at?: string | null
          depends_on?: number | null
          id?: string
          payload?: Json | null
          result?: Json | null
          status?: string | null
          step_name: string
          step_number: number
          task_id?: string | null
          task_type: string
          workflow_id: string
        }
        Update: {
          callback_deadline?: string | null
          client_id?: string
          completed_at?: string | null
          created_at?: string | null
          depends_on?: number | null
          id?: string
          payload?: Json | null
          result?: Json | null
          status?: string | null
          step_name?: string
          step_number?: number
          task_id?: string | null
          task_type?: string
          workflow_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "workflow_steps_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "client_accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workflow_steps_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "workflow_tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "workflow_steps_workflow_id_fkey"
            columns: ["workflow_id"]
            isOneToOne: false
            referencedRelation: "client_workflows"
            referencedColumns: ["id"]
          },
        ]
      }
      workflow_tasks: {
        Row: {
          client_id: string
          created_at: string
          id: string
          payload: Json | null
          result: Json | null
          status: string
          task_type: string
          updated_at: string
        }
        Insert: {
          client_id: string
          created_at?: string
          id?: string
          payload?: Json | null
          result?: Json | null
          status?: string
          task_type: string
          updated_at?: string
        }
        Update: {
          client_id?: string
          created_at?: string
          id?: string
          payload?: Json | null
          result?: Json | null
          status?: string
          task_type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "workflow_tasks_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "client_accounts"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      generate_tasks_for_client: {
        Args: { p_client_id: string }
        Returns: number
      }
      get_optimal_send_hour: { Args: { p_timezone?: string }; Returns: number }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      log_client_activity: {
        Args: {
          p_activity_type: string
          p_client_account_id: string
          p_description?: string
          p_icon?: string
          p_metadata?: Json
          p_title: string
        }
        Returns: string
      }
    }
    Enums: {
      app_role: "admin" | "client"
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
      app_role: ["admin", "client"],
    },
  },
} as const
