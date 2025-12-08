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
      client_accounts: {
        Row: {
          business_name: string
          created_at: string
          email: string
          first_name: string | null
          id: string
          last_name: string | null
          onboarded_at: string | null
          status: string
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          tier: string
          updated_at: string
        }
        Insert: {
          business_name: string
          created_at?: string
          email: string
          first_name?: string | null
          id?: string
          last_name?: string | null
          onboarded_at?: string | null
          status?: string
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          tier: string
          updated_at?: string
        }
        Update: {
          business_name?: string
          created_at?: string
          email?: string
          first_name?: string | null
          id?: string
          last_name?: string | null
          onboarded_at?: string | null
          status?: string
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          tier?: string
          updated_at?: string
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
      contact_submissions: {
        Row: {
          business_name: string
          created_at: string
          email: string
          first_name: string
          id: string
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
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
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
