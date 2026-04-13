export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          full_name: string | null;
          role: "admin" | "operator" | "viewer";
          created_at: string;
        };
        Insert: {
          id: string;
          full_name?: string | null;
          role?: "admin" | "operator" | "viewer";
          created_at?: string;
        };
        Update: {
          full_name?: string | null;
          role?: "admin" | "operator" | "viewer";
        };
      };
      campaigns: {
        Row: {
          id: string;
          name: string;
          niche: string | null;
          ai_prompt: string | null;
          timer_minutes: number;
          is_active: boolean;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          niche?: string | null;
          ai_prompt?: string | null;
          timer_minutes?: number;
          is_active?: boolean;
          created_by?: string | null;
        };
        Update: {
          name?: string;
          niche?: string | null;
          ai_prompt?: string | null;
          timer_minutes?: number;
          is_active?: boolean;
        };
      };
      campaign_phones: {
        Row: {
          id: string;
          campaign_id: string;
          phone_number: string;
          evolution_instance_id: string;
          is_admin: boolean;
          is_active: boolean;
          connected_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          campaign_id: string;
          phone_number: string;
          evolution_instance_id: string;
          is_admin?: boolean;
          is_active?: boolean;
          connected_at?: string | null;
        };
        Update: {
          phone_number?: string;
          evolution_instance_id?: string;
          is_admin?: boolean;
          is_active?: boolean;
          connected_at?: string | null;
        };
      };
      campaign_groups: {
        Row: {
          id: string;
          campaign_id: string;
          phone_id: string | null;
          group_jid: string;
          group_name: string;
          group_type: "group" | "channel";
          is_enabled: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          campaign_id: string;
          phone_id?: string | null;
          group_jid: string;
          group_name: string;
          group_type?: "group" | "channel";
          is_enabled?: boolean;
        };
        Update: {
          group_name?: string;
          group_type?: "group" | "channel";
          is_enabled?: boolean;
        };
      };
      campaign_platforms: {
        Row: {
          id: string;
          campaign_id: string;
          platform: "amazon" | "shopee" | "ml";
          api_key: string | null;
          api_secret: string | null;
          cookie: string | null;
          cookie_expires_at: string | null;
          keywords: string[];
          categories: string[];
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          campaign_id: string;
          platform: "amazon" | "shopee" | "ml";
          api_key?: string | null;
          api_secret?: string | null;
          cookie?: string | null;
          cookie_expires_at?: string | null;
          keywords?: string[];
          categories?: string[];
          is_active?: boolean;
        };
        Update: {
          api_key?: string | null;
          api_secret?: string | null;
          cookie?: string | null;
          cookie_expires_at?: string | null;
          keywords?: string[];
          categories?: string[];
          is_active?: boolean;
        };
      };
      offers: {
        Row: {
          id: string;
          source: "manual" | "telegram" | "whatsapp" | "auto";
          source_ref: string | null;
          platform: "amazon" | "shopee" | "ml" | null;
          url: string;
          affiliate_url: string | null;
          title: string | null;
          price_current: number | null;
          price_original: number | null;
          discount_pct: number | null;
          image_url: string | null;
          extra_text: string | null;
          ai_caption: string | null;
          status: "draft" | "queued" | "publishing" | "published" | "error";
          created_by: string | null;
          created_at: string;
          expires_at: string;
        };
        Insert: {
          id?: string;
          source?: "manual" | "telegram" | "whatsapp" | "auto";
          source_ref?: string | null;
          platform?: "amazon" | "shopee" | "ml" | null;
          url: string;
          affiliate_url?: string | null;
          title?: string | null;
          price_current?: number | null;
          price_original?: number | null;
          discount_pct?: number | null;
          image_url?: string | null;
          extra_text?: string | null;
          ai_caption?: string | null;
          status?: "draft" | "queued" | "publishing" | "published" | "error";
          created_by?: string | null;
        };
        Update: {
          affiliate_url?: string | null;
          title?: string | null;
          price_current?: number | null;
          price_original?: number | null;
          discount_pct?: number | null;
          image_url?: string | null;
          extra_text?: string | null;
          ai_caption?: string | null;
          status?: "draft" | "queued" | "publishing" | "published" | "error";
        };
      };
      publication_queue: {
        Row: {
          id: string;
          offer_id: string | null;
          campaign_ids: string[];
          position: number;
          scheduled_at: string | null;
          status: "pending" | "locked" | "publishing" | "published" | "error";
          published_at: string | null;
          error_message: string | null;
          created_by: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          offer_id?: string | null;
          campaign_ids?: string[];
          position?: number;
          scheduled_at?: string | null;
          status?: "pending" | "locked" | "publishing" | "published" | "error";
          created_by?: string | null;
        };
        Update: {
          campaign_ids?: string[];
          position?: number;
          scheduled_at?: string | null;
          status?: "pending" | "locked" | "publishing" | "published" | "error";
          published_at?: string | null;
          error_message?: string | null;
        };
      };
      publication_log: {
        Row: {
          id: string;
          queue_id: string | null;
          campaign_id: string | null;
          group_jid: string;
          group_name: string | null;
          phone_used: string | null;
          status: "success" | "error";
          sent_at: string;
          error_message: string | null;
        };
        Insert: {
          id?: string;
          queue_id?: string | null;
          campaign_id?: string | null;
          group_jid: string;
          group_name?: string | null;
          phone_used?: string | null;
          status: "success" | "error";
          error_message?: string | null;
        };
        Update: never;
      };
      scheduled_posts: {
        Row: {
          id: string;
          title: string;
          body: string | null;
          image_url: string | null;
          link: string | null;
          campaign_ids: string[];
          scheduled_at: string;
          repeat_type: "once" | "daily" | "weekly";
          repeat_limit: number;
          repeat_count: number;
          status: "pending" | "publishing" | "done" | "error";
          created_by: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          title: string;
          body?: string | null;
          image_url?: string | null;
          link?: string | null;
          campaign_ids?: string[];
          scheduled_at: string;
          repeat_type?: "once" | "daily" | "weekly";
          repeat_limit?: number;
          created_by?: string | null;
        };
        Update: {
          title?: string;
          body?: string | null;
          scheduled_at?: string;
          status?: "pending" | "publishing" | "done" | "error";
          repeat_count?: number;
        };
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      current_user_role: {
        Args: Record<PropertyKey, never>;
        Returns: string;
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};
