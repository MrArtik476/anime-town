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
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      admin_actions: {
        Row: {
          action: string
          admin_id: string | null
          created_at: string
          id: number
          new_role: string | null
          old_role: string | null
          target_user_id: string | null
        }
        Insert: {
          action: string
          admin_id?: string | null
          created_at?: string
          id?: never
          new_role?: string | null
          old_role?: string | null
          target_user_id?: string | null
        }
        Update: {
          action?: string
          admin_id?: string | null
          created_at?: string
          id?: never
          new_role?: string | null
          old_role?: string | null
          target_user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "admin_actions_admin_id_fkey"
            columns: ["admin_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "admin_actions_target_user_id_fkey"
            columns: ["target_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      anime_hidden: {
        Row: {
          anilist_id: number
          created_at: string
          title: string | null
        }
        Insert: {
          anilist_id: number
          created_at?: string
          title?: string | null
        }
        Update: {
          anilist_id?: number
          created_at?: string
          title?: string | null
        }
        Relationships: []
      }
      anime_list: {
        Row: {
          anilist_id: number
          cover_url: string | null
          created_at: string
          score: number | null
          status: string | null
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          anilist_id: number
          cover_url?: string | null
          created_at?: string
          score?: number | null
          status?: string | null
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          anilist_id?: number
          cover_url?: string | null
          created_at?: string
          score?: number | null
          status?: string | null
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "anime_list_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      anime_rating_stats: {
        Row: {
          anilist_id: number
          score_count: number
          score_sum: number
          updated_at: string
        }
        Insert: {
          anilist_id: number
          score_count?: number
          score_sum?: number
          updated_at?: string
        }
        Update: {
          anilist_id?: number
          score_count?: number
          score_sum?: number
          updated_at?: string
        }
        Relationships: []
      }
      anime_localizations: {
        Row: {
          anilist_id: number
          description_ru: string | null
          mal_id: number | null
          manual_description_ru: string | null
          manual_title_ru: string | null
          shikimori_url: string | null
          source: string | null
          source_hash: string | null
          synonyms_ru: string[]
          title_ru: string | null
          translator: string | null
          updated_at: string
        }
        Insert: {
          anilist_id: number
          description_ru?: string | null
          mal_id?: number | null
          manual_description_ru?: string | null
          manual_title_ru?: string | null
          shikimori_url?: string | null
          source?: string | null
          source_hash?: string | null
          synonyms_ru?: string[]
          title_ru?: string | null
          translator?: string | null
          updated_at?: string
        }
        Update: {
          anilist_id?: number
          description_ru?: string | null
          mal_id?: number | null
          manual_description_ru?: string | null
          manual_title_ru?: string | null
          shikimori_url?: string | null
          source?: string | null
          source_hash?: string | null
          synonyms_ru?: string[]
          title_ru?: string | null
          translator?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      comment_reports: {
        Row: {
          comment_id: number
          created_at: string
          details: string | null
          id: number
          reason: string
          reporter_id: string
          resolved_at: string | null
          resolved_by: string | null
          status: string
        }
        Insert: {
          comment_id: number
          created_at?: string
          details?: string | null
          id?: never
          reason: string
          reporter_id?: string
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
        }
        Update: {
          comment_id?: number
          created_at?: string
          details?: string | null
          id?: never
          reason?: string
          reporter_id?: string
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "comment_reports_comment_id_fkey"
            columns: ["comment_id"]
            isOneToOne: false
            referencedRelation: "comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comment_reports_reporter_id_fkey"
            columns: ["reporter_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comment_reports_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      comments: {
        Row: {
          anilist_id: number
          anime_cover_url: string | null
          anime_title: string | null
          body: string | null
          created_at: string
          edited_at: string | null
          episode_id: number | null
          id: number
          is_spoiler: boolean
          parent_id: number | null
          reply_count: number
          reply_to_user_id: string | null
          status: string
          user_id: string
        }
        Insert: {
          anilist_id: number
          anime_cover_url?: string | null
          anime_title?: string | null
          body?: string | null
          created_at?: string
          edited_at?: string | null
          episode_id?: number | null
          id?: never
          is_spoiler?: boolean
          parent_id?: number | null
          reply_count?: number
          reply_to_user_id?: string | null
          status?: string
          user_id?: string
        }
        Update: {
          anilist_id?: number
          anime_cover_url?: string | null
          anime_title?: string | null
          body?: string | null
          created_at?: string
          edited_at?: string | null
          episode_id?: number | null
          id?: never
          is_spoiler?: boolean
          parent_id?: number | null
          reply_count?: number
          reply_to_user_id?: string | null
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "comments_episode_id_fkey"
            columns: ["episode_id"]
            isOneToOne: false
            referencedRelation: "episodes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comments_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comments_reply_to_user_id_fkey"
            columns: ["reply_to_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      episodes: {
        Row: {
          anilist_id: number
          attribution: string | null
          attribution_url: string | null
          created_at: string
          duration_sec: number | null
          hls_url: string
          id: number
          license_status: string
          number: number
          title: string | null
          updated_at: string
        }
        Insert: {
          anilist_id: number
          attribution?: string | null
          attribution_url?: string | null
          created_at?: string
          duration_sec?: number | null
          hls_url: string
          id?: never
          license_status?: string
          number: number
          title?: string | null
          updated_at?: string
        }
        Update: {
          anilist_id?: number
          attribution?: string | null
          attribution_url?: string | null
          created_at?: string
          duration_sec?: number | null
          hls_url?: string
          id?: number
          license_status?: string
          number?: number
          title?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      moderation_actions: {
        Row: {
          action: string
          ban_duration: string | null
          comment_id: number | null
          created_at: string
          id: number
          moderator_id: string | null
          reason: string | null
          target_user_id: string | null
        }
        Insert: {
          action: string
          ban_duration?: string | null
          comment_id?: number | null
          created_at?: string
          id?: never
          moderator_id?: string | null
          reason?: string | null
          target_user_id?: string | null
        }
        Update: {
          action?: string
          ban_duration?: string | null
          comment_id?: number | null
          created_at?: string
          id?: never
          moderator_id?: string | null
          reason?: string | null
          target_user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "moderation_actions_comment_id_fkey"
            columns: ["comment_id"]
            isOneToOne: false
            referencedRelation: "comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "moderation_actions_moderator_id_fkey"
            columns: ["moderator_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "moderation_actions_target_user_id_fkey"
            columns: ["target_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_prefs: {
        Row: {
          new_episode: boolean
          reply: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          new_episode?: boolean
          reply?: boolean
          updated_at?: string
          user_id?: string
        }
        Update: {
          new_episode?: boolean
          reply?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_prefs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          actor_id: string | null
          anilist_id: number
          comment_id: number | null
          cover_url: string | null
          created_at: string
          episode_number: number | null
          id: number
          read_at: string | null
          title: string | null
          type: string
          user_id: string
        }
        Insert: {
          actor_id?: string | null
          anilist_id: number
          comment_id?: number | null
          cover_url?: string | null
          created_at?: string
          episode_number?: number | null
          id?: never
          read_at?: string | null
          title?: string | null
          type: string
          user_id: string
        }
        Update: {
          actor_id?: string | null
          anilist_id?: number
          comment_id?: number | null
          cover_url?: string | null
          created_at?: string
          episode_number?: number | null
          id?: never
          read_at?: string | null
          title?: string | null
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_comment_id_fkey"
            columns: ["comment_id"]
            isOneToOne: false
            referencedRelation: "comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          display_name: string | null
          id: string
          role: string
          updated_at: string
          username: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          id: string
          role?: string
          updated_at?: string
          username: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          role?: string
          updated_at?: string
          username?: string
        }
        Relationships: []
      }
      subtitles: {
        Row: {
          episode_id: number
          id: number
          is_default: boolean
          label: string
          lang: string
          url: string
        }
        Insert: {
          episode_id: number
          id?: never
          is_default?: boolean
          label: string
          lang: string
          url: string
        }
        Update: {
          episode_id?: number
          id?: number
          is_default?: boolean
          label?: string
          lang?: string
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "subtitles_episode_id_fkey"
            columns: ["episode_id"]
            isOneToOne: false
            referencedRelation: "episodes"
            referencedColumns: ["id"]
          },
        ]
      }
      title_actions: {
        Row: {
          action: string
          admin_id: string | null
          anilist_id: number
          anime_title: string | null
          created_at: string
          description_ru: string | null
          id: number
          old_description_ru: string | null
          old_title_ru: string | null
          reason: string | null
          title_ru: string | null
        }
        Insert: {
          action: string
          admin_id?: string | null
          anilist_id: number
          anime_title?: string | null
          created_at?: string
          description_ru?: string | null
          id?: never
          old_description_ru?: string | null
          old_title_ru?: string | null
          reason?: string | null
          title_ru?: string | null
        }
        Update: {
          action?: string
          admin_id?: string | null
          anilist_id?: number
          anime_title?: string | null
          created_at?: string
          description_ru?: string | null
          id?: never
          old_description_ru?: string | null
          old_title_ru?: string | null
          reason?: string | null
          title_ru?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "title_actions_admin_id_fkey"
            columns: ["admin_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      translation_runs: {
        Row: {
          batches: number | null
          candidates: number | null
          characters: number | null
          error: string | null
          finished_at: string | null
          id: number
          own_limit: number | null
          pending: number | null
          skipped_oversized: number | null
          started_at: string
          status: string
          stopped: string | null
          translated: number | null
          trigger: string
          usage_limit: number | null
          usage_used: number | null
        }
        Insert: {
          batches?: number | null
          candidates?: number | null
          characters?: number | null
          error?: string | null
          finished_at?: string | null
          id?: never
          own_limit?: number | null
          pending?: number | null
          skipped_oversized?: number | null
          started_at?: string
          status?: string
          stopped?: string | null
          translated?: number | null
          trigger: string
          usage_limit?: number | null
          usage_used?: number | null
        }
        Update: {
          batches?: number | null
          candidates?: number | null
          characters?: number | null
          error?: string | null
          finished_at?: string | null
          id?: never
          own_limit?: number | null
          pending?: number | null
          skipped_oversized?: number | null
          started_at?: string
          status?: string
          stopped?: string | null
          translated?: number | null
          trigger?: string
          usage_limit?: number | null
          usage_used?: number | null
        }
        Relationships: []
      }
      user_bans: {
        Row: {
          created_at: string
          expires_at: string | null
          id: number
          moderator_id: string | null
          reason: string | null
          revoked_at: string | null
          revoked_by: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          expires_at?: string | null
          id?: never
          moderator_id?: string | null
          reason?: string | null
          revoked_at?: string | null
          revoked_by?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          expires_at?: string | null
          id?: never
          moderator_id?: string | null
          reason?: string | null
          revoked_at?: string | null
          revoked_by?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_bans_moderator_id_fkey"
            columns: ["moderator_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_bans_revoked_by_fkey"
            columns: ["revoked_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_bans_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      watch_progress: {
        Row: {
          anilist_id: number
          completed: boolean | null
          cover_url: string | null
          duration_sec: number
          episode_id: number
          episode_number: number
          position_sec: number
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          anilist_id: number
          completed?: never
          cover_url?: string | null
          duration_sec: number
          episode_id: number
          episode_number: number
          position_sec: number
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          anilist_id?: number
          completed?: never
          cover_url?: string | null
          duration_sec?: number
          episode_id?: number
          episode_number?: number
          position_sec?: number
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "watch_progress_episode_id_fkey"
            columns: ["episode_id"]
            isOneToOne: false
            referencedRelation: "episodes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "watch_progress_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      begin_translation_run: {
        Args: { p_stale_after_seconds?: number; p_trigger: string }
        Returns: number
      }
      comment_reply_previews: {
        Args: { per_root?: number; root_ids: number[] }
        Returns: {
          anilist_id: number
          anime_cover_url: string | null
          anime_title: string | null
          body: string | null
          created_at: string
          edited_at: string | null
          episode_id: number | null
          id: number
          is_spoiler: boolean
          parent_id: number | null
          reply_count: number
          reply_to_user_id: string | null
          status: string
          user_id: string
        }[]
        SetofOptions: {
          from: "*"
          to: "comments"
          isOneToOne: false
          isSetofReturn: true
        }
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
