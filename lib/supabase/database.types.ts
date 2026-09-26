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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      availability_answers: {
        Row: {
          answer: string
          candidate_date_id: string
          comment: string | null
          created_at: string
          id: string
          participant_id: string
          updated_at: string
        }
        Insert: {
          answer?: string
          candidate_date_id: string
          comment?: string | null
          created_at?: string
          id?: string
          participant_id: string
          updated_at?: string
        }
        Update: {
          answer?: string
          candidate_date_id?: string
          comment?: string | null
          created_at?: string
          id?: string
          participant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "availability_answers_candidate_date_id_fkey"
            columns: ["candidate_date_id"]
            isOneToOne: false
            referencedRelation: "candidate_dates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "availability_answers_participant_id_fkey"
            columns: ["participant_id"]
            isOneToOne: false
            referencedRelation: "participants"
            referencedColumns: ["id"]
          },
        ]
      }
      calendar_integrations: {
        Row: {
          account_email: string | null
          calendar_id: string
          created_at: string
          encrypted_access_token: string | null
          encrypted_refresh_token: string
          id: string
          provider: string
          scope: string | null
          token_expires_at: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          account_email?: string | null
          calendar_id?: string
          created_at?: string
          encrypted_access_token?: string | null
          encrypted_refresh_token: string
          id?: string
          provider?: string
          scope?: string | null
          token_expires_at?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          account_email?: string | null
          calendar_id?: string
          created_at?: string
          encrypted_access_token?: string | null
          encrypted_refresh_token?: string
          id?: string
          provider?: string
          scope?: string | null
          token_expires_at?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      candidate_dates: {
        Row: {
          created_at: string
          end_at: string | null
          id: string
          is_all_day: boolean
          memo: string | null
          plan_id: string
          sort_order: number
          start_at: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          end_at?: string | null
          id?: string
          is_all_day?: boolean
          memo?: string | null
          plan_id: string
          sort_order?: number
          start_at: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          end_at?: string | null
          id?: string
          is_all_day?: boolean
          memo?: string | null
          plan_id?: string
          sort_order?: number
          start_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "candidate_dates_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
        ]
      }
      connection_group_members: {
        Row: {
          created_at: string
          group_id: string
          member_user_id: string
        }
        Insert: {
          created_at?: string
          group_id: string
          member_user_id: string
        }
        Update: {
          created_at?: string
          group_id?: string
          member_user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "connection_group_members_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "connection_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      connection_groups: {
        Row: {
          color: string
          created_at: string
          id: string
          name: string
          owner_user_id: string
          updated_at: string
        }
        Insert: {
          color?: string
          created_at?: string
          id?: string
          name: string
          owner_user_id: string
          updated_at?: string
        }
        Update: {
          color?: string
          created_at?: string
          id?: string
          name?: string
          owner_user_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      event_drafts: {
        Row: {
          created_at: string
          id: string
          owner_user_id: string
          payload: Json
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          owner_user_id: string
          payload?: Json
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          owner_user_id?: string
          payload?: Json
          updated_at?: string
        }
        Relationships: []
      }
      event_invite_links: {
        Row: {
          closed_at: string | null
          created_at: string
          created_by_user_id: string
          event_id: string
          id: string
          status: string
          token: string
          updated_at: string
        }
        Insert: {
          closed_at?: string | null
          created_at?: string
          created_by_user_id: string
          event_id: string
          id?: string
          status?: string
          token: string
          updated_at?: string
        }
        Update: {
          closed_at?: string | null
          created_at?: string
          created_by_user_id?: string
          event_id?: string
          id?: string
          status?: string
          token?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_invite_links_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "event_activity_state"
            referencedColumns: ["event_id"]
          },
          {
            foreignKeyName: "event_invite_links_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      event_members: {
        Row: {
          created_at: string
          display_name: string
          event_id: string
          id: string
          role: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          display_name: string
          event_id: string
          id?: string
          role?: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          display_name?: string
          event_id?: string
          id?: string
          role?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_members_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "event_activity_state"
            referencedColumns: ["event_id"]
          },
          {
            foreignKeyName: "event_members_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      event_messages: {
        Row: {
          author_user_id: string
          body: string
          created_at: string
          event_id: string
          id: string
        }
        Insert: {
          author_user_id: string
          body: string
          created_at?: string
          event_id: string
          id?: string
        }
        Update: {
          author_user_id?: string
          body?: string
          created_at?: string
          event_id?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_messages_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "event_activity_state"
            referencedColumns: ["event_id"]
          },
          {
            foreignKeyName: "event_messages_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      event_tasks: {
        Row: {
          assignee_user_id: string | null
          created_at: string
          created_by_user_id: string
          done_at: string | null
          event_id: string
          id: string
          sort_order: number
          title: string
          updated_at: string
        }
        Insert: {
          assignee_user_id?: string | null
          created_at?: string
          created_by_user_id: string
          done_at?: string | null
          event_id: string
          id?: string
          sort_order?: number
          title: string
          updated_at?: string
        }
        Update: {
          assignee_user_id?: string | null
          created_at?: string
          created_by_user_id?: string
          done_at?: string | null
          event_id?: string
          id?: string
          sort_order?: number
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_tasks_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "event_activity_state"
            referencedColumns: ["event_id"]
          },
          {
            foreignKeyName: "event_tasks_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      event_user_invitations: {
        Row: {
          created_at: string
          event_id: string
          id: string
          invitee_user_id: string
          inviter_user_id: string
          responded_at: string | null
          status: string
        }
        Insert: {
          created_at?: string
          event_id: string
          id?: string
          invitee_user_id: string
          inviter_user_id: string
          responded_at?: string | null
          status?: string
        }
        Update: {
          created_at?: string
          event_id?: string
          id?: string
          invitee_user_id?: string
          inviter_user_id?: string
          responded_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_user_invitations_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "event_activity_state"
            referencedColumns: ["event_id"]
          },
          {
            foreignKeyName: "event_user_invitations_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      events: {
        Row: {
          address: string | null
          capacity: number | null
          category: string
          created_at: string
          end_date: string | null
          id: string
          location_name: string | null
          memo: string | null
          owner_user_id: string
          price: number | null
          start_date: string | null
          status: string
          title: string
          updated_at: string
          url: string | null
          wrapup_auto_done: boolean
          wrapup_snoozed_until: string | null
        }
        Insert: {
          address?: string | null
          capacity?: number | null
          category?: string
          created_at?: string
          end_date?: string | null
          id?: string
          location_name?: string | null
          memo?: string | null
          owner_user_id: string
          price?: number | null
          start_date?: string | null
          status?: string
          title: string
          updated_at?: string
          url?: string | null
          wrapup_auto_done?: boolean
          wrapup_snoozed_until?: string | null
        }
        Update: {
          address?: string | null
          capacity?: number | null
          category?: string
          created_at?: string
          end_date?: string | null
          id?: string
          location_name?: string | null
          memo?: string | null
          owner_user_id?: string
          price?: number | null
          start_date?: string | null
          status?: string
          title?: string
          updated_at?: string
          url?: string | null
          wrapup_auto_done?: boolean
          wrapup_snoozed_until?: string | null
        }
        Relationships: []
      }
      expense_splits: {
        Row: {
          amount: number
          created_at: string
          expense_id: string
          id: string
          participant_id: string
          updated_at: string
        }
        Insert: {
          amount: number
          created_at?: string
          expense_id: string
          id?: string
          participant_id: string
          updated_at?: string
        }
        Update: {
          amount?: number
          created_at?: string
          expense_id?: string
          id?: string
          participant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "expense_splits_expense_id_fkey"
            columns: ["expense_id"]
            isOneToOne: false
            referencedRelation: "expenses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expense_splits_participant_id_fkey"
            columns: ["participant_id"]
            isOneToOne: false
            referencedRelation: "participants"
            referencedColumns: ["id"]
          },
        ]
      }
      expenses: {
        Row: {
          amount: number
          category: string
          created_at: string
          id: string
          is_important: boolean
          memo: string | null
          paid_at: string
          payer_participant_id: string
          payment_method: string | null
          payment_url: string | null
          plan_id: string
          title: string
          updated_at: string
        }
        Insert: {
          amount: number
          category?: string
          created_at?: string
          id?: string
          is_important?: boolean
          memo?: string | null
          paid_at?: string
          payer_participant_id: string
          payment_method?: string | null
          payment_url?: string | null
          plan_id: string
          title: string
          updated_at?: string
        }
        Update: {
          amount?: number
          category?: string
          created_at?: string
          id?: string
          is_important?: boolean
          memo?: string | null
          paid_at?: string
          payer_participant_id?: string
          payment_method?: string | null
          payment_url?: string | null
          plan_id?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "expenses_payer_participant_id_fkey"
            columns: ["payer_participant_id"]
            isOneToOne: false
            referencedRelation: "participants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          body: string
          created_at: string
          dedupe_key: string
          href: string
          id: string
          kind: string
          read_at: string | null
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          body: string
          created_at?: string
          dedupe_key: string
          href: string
          id?: string
          kind: string
          read_at?: string | null
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          body?: string
          created_at?: string
          dedupe_key?: string
          href?: string
          id?: string
          kind?: string
          read_at?: string | null
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      participants: {
        Row: {
          created_at: string
          display_name: string
          id: string
          is_organizer: boolean
          participant_type: string
          plan_id: string
          settlement_payment_method: string | null
          status: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          display_name: string
          id?: string
          is_organizer?: boolean
          participant_type?: string
          plan_id: string
          settlement_payment_method?: string | null
          status?: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          display_name?: string
          id?: string
          is_organizer?: boolean
          participant_type?: string
          plan_id?: string
          settlement_payment_method?: string | null
          status?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "participants_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_proofs: {
        Row: {
          created_at: string
          id: string
          memo: string | null
          paid_at: string
          payment_method: string | null
          proof_type: string
          proof_url: string | null
          settlement_id: string
          updated_at: string
          uploaded_by_participant_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          memo?: string | null
          paid_at?: string
          payment_method?: string | null
          proof_type?: string
          proof_url?: string | null
          settlement_id: string
          updated_at?: string
          uploaded_by_participant_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          memo?: string | null
          paid_at?: string
          payment_method?: string | null
          proof_type?: string
          proof_url?: string | null
          settlement_id?: string
          updated_at?: string
          uploaded_by_participant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payment_proofs_settlement_id_fkey"
            columns: ["settlement_id"]
            isOneToOne: false
            referencedRelation: "settlements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_proofs_uploaded_by_participant_id_fkey"
            columns: ["uploaded_by_participant_id"]
            isOneToOne: false
            referencedRelation: "participants"
            referencedColumns: ["id"]
          },
        ]
      }
      plan_reminder_logs: {
        Row: {
          actor_user_id: string | null
          created_at: string
          id: string
          plan_id: string
          recipient_names: string[]
          reminder_message: string | null
          sent_at: string
        }
        Insert: {
          actor_user_id?: string | null
          created_at?: string
          id?: string
          plan_id: string
          recipient_names?: string[]
          reminder_message?: string | null
          sent_at?: string
        }
        Update: {
          actor_user_id?: string | null
          created_at?: string
          id?: string
          plan_id?: string
          recipient_names?: string[]
          reminder_message?: string | null
          sent_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "plan_reminder_logs_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
        ]
      }
      plan_reminder_settings: {
        Row: {
          created_at: string
          id: string
          plan_id: string
          reminder_offset_minutes: number | null
          reminder_offsets_minutes: number[]
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          plan_id: string
          reminder_offset_minutes?: number | null
          reminder_offsets_minutes?: number[]
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          plan_id?: string
          reminder_offset_minutes?: number | null
          reminder_offsets_minutes?: number[]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "plan_reminder_settings_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: true
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
        ]
      }
      plan_timetable_item_assignees: {
        Row: {
          created_at: string
          item_id: string
          participant_id: string
        }
        Insert: {
          created_at?: string
          item_id: string
          participant_id: string
        }
        Update: {
          created_at?: string
          item_id?: string
          participant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "plan_timetable_item_assignees_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "plan_timetable_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plan_timetable_item_assignees_participant_id_fkey"
            columns: ["participant_id"]
            isOneToOne: false
            referencedRelation: "participants"
            referencedColumns: ["id"]
          },
        ]
      }
      plan_timetable_items: {
        Row: {
          created_at: string
          created_by_user_id: string
          end_at: string | null
          id: string
          note: string | null
          plan_id: string
          start_at: string
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by_user_id: string
          end_at?: string | null
          id?: string
          note?: string | null
          plan_id: string
          start_at: string
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by_user_id?: string
          end_at?: string | null
          id?: string
          note?: string | null
          plan_id?: string
          start_at?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "plan_timetable_items_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
        ]
      }
      plans: {
        Row: {
          answer_deadline_at: string | null
          confirmed_end_at: string | null
          confirmed_start_at: string | null
          created_at: string
          event_id: string
          google_calendar_event_id: string | null
          google_calendar_sync_state: string
          id: string
          is_all_day: boolean
          memo: string | null
          owner_user_id: string
          settlement_status: string
          status: string
          ticket_status: string
          title: string | null
          updated_at: string
        }
        Insert: {
          answer_deadline_at?: string | null
          confirmed_end_at?: string | null
          confirmed_start_at?: string | null
          created_at?: string
          event_id: string
          google_calendar_event_id?: string | null
          google_calendar_sync_state?: string
          id?: string
          is_all_day?: boolean
          memo?: string | null
          owner_user_id: string
          settlement_status?: string
          status?: string
          ticket_status?: string
          title?: string | null
          updated_at?: string
        }
        Update: {
          answer_deadline_at?: string | null
          confirmed_end_at?: string | null
          confirmed_start_at?: string | null
          created_at?: string
          event_id?: string
          google_calendar_event_id?: string | null
          google_calendar_sync_state?: string
          id?: string
          is_all_day?: boolean
          memo?: string | null
          owner_user_id?: string
          settlement_status?: string
          status?: string
          ticket_status?: string
          title?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "plans_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "event_activity_state"
            referencedColumns: ["event_id"]
          },
          {
            foreignKeyName: "plans_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_path: string | null
          created_at: string
          deleted_at: string | null
          deletion_state: string
          nickname: string
          onboarding_completed_at: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_path?: string | null
          created_at?: string
          deleted_at?: string | null
          deletion_state?: string
          nickname: string
          onboarding_completed_at?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_path?: string | null
          created_at?: string
          deleted_at?: string | null
          deletion_state?: string
          nickname?: string
          onboarding_completed_at?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      settlement_payments: {
        Row: {
          amount: number
          confirmed_at: string | null
          created_at: string
          id: string
          memo: string | null
          paid_at: string
          paid_by_participant_id: string | null
          payment_method: string | null
          payment_url: string | null
          settlement_id: string
          updated_at: string
        }
        Insert: {
          amount: number
          confirmed_at?: string | null
          created_at?: string
          id?: string
          memo?: string | null
          paid_at?: string
          paid_by_participant_id?: string | null
          payment_method?: string | null
          payment_url?: string | null
          settlement_id: string
          updated_at?: string
        }
        Update: {
          amount?: number
          confirmed_at?: string | null
          created_at?: string
          id?: string
          memo?: string | null
          paid_at?: string
          paid_by_participant_id?: string | null
          payment_method?: string | null
          payment_url?: string | null
          settlement_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "settlement_payments_paid_by_participant_id_fkey"
            columns: ["paid_by_participant_id"]
            isOneToOne: false
            referencedRelation: "participants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "settlement_payments_settlement_id_fkey"
            columns: ["settlement_id"]
            isOneToOne: false
            referencedRelation: "settlements"
            referencedColumns: ["id"]
          },
        ]
      }
      settlement_reminder_logs: {
        Row: {
          actor_user_id: string | null
          created_at: string
          id: string
          plan_id: string
          recipient_names: string[]
          reminder_message: string | null
          reminder_type: string
          sent_at: string
        }
        Insert: {
          actor_user_id?: string | null
          created_at?: string
          id?: string
          plan_id: string
          recipient_names?: string[]
          reminder_message?: string | null
          reminder_type?: string
          sent_at?: string
        }
        Update: {
          actor_user_id?: string | null
          created_at?: string
          id?: string
          plan_id?: string
          recipient_names?: string[]
          reminder_message?: string | null
          reminder_type?: string
          sent_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "settlement_reminder_logs_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
        ]
      }
      settlements: {
        Row: {
          amount: number
          calculated_at: string
          confirmed_at: string | null
          created_at: string
          from_participant_id: string
          id: string
          memo: string | null
          paid_at: string | null
          payment_method: string | null
          payment_url: string | null
          plan_id: string
          status: string
          to_participant_id: string
          updated_at: string
        }
        Insert: {
          amount: number
          calculated_at?: string
          confirmed_at?: string | null
          created_at?: string
          from_participant_id: string
          id?: string
          memo?: string | null
          paid_at?: string | null
          payment_method?: string | null
          payment_url?: string | null
          plan_id: string
          status?: string
          to_participant_id: string
          updated_at?: string
        }
        Update: {
          amount?: number
          calculated_at?: string
          confirmed_at?: string | null
          created_at?: string
          from_participant_id?: string
          id?: string
          memo?: string | null
          paid_at?: string | null
          payment_method?: string | null
          payment_url?: string | null
          plan_id?: string
          status?: string
          to_participant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "settlements_from_participant_id_fkey"
            columns: ["from_participant_id"]
            isOneToOne: false
            referencedRelation: "participants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "settlements_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "settlements_to_participant_id_fkey"
            columns: ["to_participant_id"]
            isOneToOne: false
            referencedRelation: "participants"
            referencedColumns: ["id"]
          },
        ]
      }
      share_links: {
        Row: {
          created_at: string
          expires_at: string | null
          id: string
          plan_id: string
          purpose: string
          revoked_at: string | null
          status: string
          token: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          expires_at?: string | null
          id?: string
          plan_id: string
          purpose?: string
          revoked_at?: string | null
          status?: string
          token: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          expires_at?: string | null
          id?: string
          plan_id?: string
          purpose?: string
          revoked_at?: string | null
          status?: string
          token?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "share_links_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
        ]
      }
      user_blocks: {
        Row: {
          blocked_user_id: string
          blocker_user_id: string
          created_at: string
        }
        Insert: {
          blocked_user_id: string
          blocker_user_id: string
          created_at?: string
        }
        Update: {
          blocked_user_id?: string
          blocker_user_id?: string
          created_at?: string
        }
        Relationships: []
      }
      user_connections: {
        Row: {
          created_at: string
          followed_user_id: string
          follower_user_id: string
        }
        Insert: {
          created_at?: string
          followed_user_id: string
          follower_user_id: string
        }
        Update: {
          created_at?: string
          followed_user_id?: string
          follower_user_id?: string
        }
        Relationships: []
      }
      user_consents: {
        Row: {
          agreed_at: string
          privacy_version: string
          terms_version: string
          updated_at: string
          user_id: string
        }
        Insert: {
          agreed_at?: string
          privacy_version: string
          terms_version: string
          updated_at?: string
          user_id: string
        }
        Update: {
          agreed_at?: string
          privacy_version?: string
          terms_version?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_favorites: {
        Row: {
          created_at: string
          favorite_user_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          favorite_user_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          favorite_user_id?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      event_activity_state: {
        Row: {
          display_state: string | null
          event_id: string | null
          is_active: boolean | null
          lifecycle_finished: boolean | null
          settlement_state: string | null
          status: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      add_connection_group_members: {
        Args: { p_group_id: string; p_member_ids: string[] }
        Returns: undefined
      }
      assert_plan_expenses_mutable: {
        Args: { target_plan_id: string }
        Returns: undefined
      }
      block_user_atomic: {
        Args: { target_user_id: string }
        Returns: undefined
      }
      consume_authenticated_rate_limit: {
        Args: { p_operation: string }
        Returns: Json
      }
      create_connection_group: {
        Args: { p_color: string; p_member_ids?: string[]; p_name: string }
        Returns: string
      }
      create_event_user_invitations: {
        Args: { p_event_id: string; p_invitee_user_ids: string[] }
        Returns: Json
      }
      create_expense: {
        Args: {
          p_amount: number
          p_is_important: boolean
          p_memo: string
          p_payer_participant_id: string
          p_payment_url: string
          p_splits: Json
          p_title: string
          target_plan_id: string
        }
        Returns: string
      }
      create_plan_with_children: {
        Args: {
          p_answer_deadline_at: string
          p_candidate_dates: Json
          p_event_id: string
          p_memo: string
          p_participants: Json
          p_reminder_offset_minutes: number
          p_reminder_offsets_minutes: number[]
          p_share_expires_at: string
          p_share_token: string
          p_title: string
        }
        Returns: string
      }
      delete_connection_group: {
        Args: { p_group_id: string }
        Returns: undefined
      }
      delete_expense: {
        Args: { target_expense_id: string }
        Returns: undefined
      }
      finalize_account_withdrawal: {
        Args: { target_user_id: string }
        Returns: undefined
      }
      follow_user_atomic: {
        Args: { target_user_id: string }
        Returns: undefined
      }
      get_connection_counts: {
        Args: never
        Returns: {
          category: string
          item_count: number
        }[]
      }
      get_connection_group: {
        Args: { p_group_id: string }
        Returns: {
          color: string
          created_at: string
          group_id: string
          member_count: number
          name: string
        }[]
      }
      have_shared_event: {
        Args: { first_user_id: string; second_user_id: string }
        Returns: boolean
      }
      is_event_member: { Args: { target_event_id: string }; Returns: boolean }
      is_event_owner: { Args: { target_event_id: string }; Returns: boolean }
      is_following: {
        Args: { followed_id: string; follower_id: string }
        Returns: boolean
      }
      is_joined_event_member: {
        Args: { target_event_id: string }
        Returns: boolean
      }
      is_own_participant: {
        Args: { target_participant_id: string }
        Returns: boolean
      }
      is_participant_in_my_plan: {
        Args: { target_participant_id: string }
        Returns: boolean
      }
      is_participant_of_event: {
        Args: { target_event_id: string }
        Returns: boolean
      }
      is_plan_participant: {
        Args: { target_plan_id: string }
        Returns: boolean
      }
      is_settlement_in_my_plan: {
        Args: { target_settlement_id: string }
        Returns: boolean
      }
      is_settlement_payer: {
        Args: { target_settlement_id: string }
        Returns: boolean
      }
      is_user_blocked: {
        Args: { first_user_id: string; second_user_id: string }
        Returns: boolean
      }
      list_active_shared_events: {
        Args: { p_other_user_id: string }
        Returns: {
          display_state: string
          event_id: string
          title: string
        }[]
      }
      list_calendar_items: {
        Args: { p_month: string }
        Returns: {
          candidate_id: string
          end_at: string
          event_title: string
          is_all_day: boolean
          location_name: string
          maybe_count: number
          no_count: number
          plan_id: string
          plan_title: string
          start_at: string
          status: string
          unanswered_count: number
          yes_count: number
        }[]
      }
      list_connection_group_candidates: {
        Args: { p_group_id: string }
        Returns: {
          display_name: string
          is_following: boolean
          shared_event_count: number
          user_id: string
        }[]
      }
      list_connection_group_members: {
        Args: { p_group_id: string }
        Returns: {
          display_name: string
          is_following: boolean
          shared_event_count: number
          user_id: string
        }[]
      }
      list_connection_group_memberships: {
        Args: never
        Returns: {
          group_id: string
          member_user_id: string
        }[]
      }
      list_connection_groups: {
        Args: never
        Returns: {
          active_event_count: number
          color: string
          created_at: string
          group_id: string
          member_count: number
          member_names: string[]
          name: string
        }[]
      }
      list_connections: {
        Args: {
          p_category: string
          p_cursor_at: string
          p_cursor_user_id: string
          p_limit: number
        }
        Returns: {
          active_shared_event_count: number
          cursor_at: string
          cursor_user_id: string
          display_name: string
          is_favorite: boolean
          is_followed_by: boolean
          is_following: boolean
          latest_shared_at: string
          shared_event_count: number
          user_id: string
        }[]
      }
      list_event_invite_candidates: {
        Args: {
          p_cursor_at: string
          p_cursor_user_id: string
          p_event_id: string
          p_limit: number
          p_query: string
        }
        Returns: {
          cursor_at: string
          cursor_user_id: string
          display_name: string
          is_favorite: boolean
          is_followed_by: boolean
          is_following: boolean
          latest_shared_at: string
          shared_event_count: number
          user_id: string
        }[]
      }
      list_owned_event_ids: {
        Args: {
          p_category?: string
          p_display_state?: string
          p_filter?: string
          p_limit?: number
          p_offset?: number
          p_query?: string
          p_sort?: string
        }
        Returns: {
          event_ids: string[]
          total_count: number
        }[]
      }
      list_received_event_invitations: {
        Args: { p_limit: number }
        Returns: {
          created_at: string
          event_id: string
          event_title: string
          invitation_id: string
          organizer_name: string
        }[]
      }
      mark_plan_settling: {
        Args: { target_plan_id: string }
        Returns: undefined
      }
      post_event_message: {
        Args: { p_body: string; p_event_id: string }
        Returns: Json
      }
      purge_expired_security_data: { Args: never; Returns: number }
      purge_expired_web_vitals: { Args: never; Returns: number }
      recompute_plan_settlements: {
        Args: { target_plan_id: string }
        Returns: undefined
      }
      record_authenticated_security_audit: {
        Args: {
          p_operation: string
          p_outcome: string
          p_target_id: string
          p_target_type: string
        }
        Returns: undefined
      }
      record_settlement_payment: {
        Args: {
          p_amount: number
          p_memo: string
          p_payment_url: string
          target_settlement_id: string
        }
        Returns: string
      }
      record_web_vital: {
        Args: {
          p_client_ip: string
          p_device_class: string
          p_metric_name: string
          p_metric_value: number
          p_page_template: string
        }
        Returns: Json
      }
      remove_connection_group_member: {
        Args: { p_group_id: string; p_member_id: string }
        Returns: undefined
      }
      replace_expense_splits: {
        Args: {
          p_amount: number
          p_payer_participant_id: string
          p_splits: Json
          target_expense_id: string
          target_plan_id: string
        }
        Returns: undefined
      }
      replace_plan_schedule: {
        Args: {
          p_answer_deadline_at: string
          p_candidate_dates: Json
          p_memo: string
          p_reminder_offset_minutes: number
          p_reminder_offsets_minutes: number[]
          p_title: string
          target_plan_id: string
        }
        Returns: string
      }
      respond_event_user_invitation: {
        Args: { p_invitation_id: string; p_response: string }
        Returns: Json
      }
      set_person_connection_groups: {
        Args: { p_group_ids: string[]; p_member_id: string }
        Returns: undefined
      }
      toggle_favorite_atomic: {
        Args: { target_user_id: string }
        Returns: undefined
      }
      unfollow_user_atomic: {
        Args: { target_user_id: string }
        Returns: undefined
      }
      update_connection_group: {
        Args: { p_color: string; p_group_id: string; p_name: string }
        Returns: undefined
      }
      update_expense: {
        Args: {
          p_amount: number
          p_is_important: boolean
          p_memo: string
          p_payer_participant_id: string
          p_payment_url: string
          p_splits: Json
          p_title: string
          target_expense_id: string
        }
        Returns: undefined
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
