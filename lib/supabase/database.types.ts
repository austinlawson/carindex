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
      admin_users: {
        Row: {
          user_id: string;
          granted_by: string | null;
          granted_at: string;
        };
        Insert: {
          user_id: string;
          granted_by?: string | null;
          granted_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["admin_users"]["Insert"]>;
        Relationships: [];
      };
      profiles: {
        Row: {
          id: string;
          display_name: string;
          seller_type: "Private Seller" | "Dealer" | "Small Lot";
          location: string | null;
          phone: string | null;
          email: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          display_name?: string;
          seller_type?: "Private Seller" | "Dealer" | "Small Lot";
          location?: string | null;
          phone?: string | null;
          email?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["profiles"]["Insert"]>;
        Relationships: [];
      };
      listings: {
        Row: {
          id: string;
          owner_id: string | null;
          source_mode: "user" | "marketcheck" | "ebay" | "csv" | "mock";
          source_name: string | null;
          source_url: string | null;
          external_listing_url: string | null;
          provider_listing_id: string | null;
          status: "draft" | "active" | "sold" | "archived";
          year: number;
          make: string;
          model: string;
          trim: string;
          price: number;
          mileage: number;
          location: string;
          distance: number;
          seller_type: "Private Seller" | "Dealer" | "Small Lot";
          seller_name: string | null;
          seller_phone: string | null;
          seller_email: string | null;
          contact_url: string | null;
          vin: string | null;
          seller_title_status:
            | "not_disclosed"
            | "paid_off_title_in_hand"
            | "paid_off_title_pending"
            | "financed_lien"
            | "lease_payoff"
            | "not_sure";
          vehicle_condition:
            | "not_disclosed"
            | "excellent"
            | "good"
            | "runs_with_issues"
            | "needs_repair"
            | "mechanic_special"
            | "project_non_running";
          known_issue_flags: string[];
          seller_disclosure_notes: string | null;
          listing_title: string | null;
          listing_description: string | null;
          deal_grade: "A" | "A-" | "B+" | "B" | "C" | "Pass";
          feed_badge: string;
          ai_hook: string;
          ai_take: string;
          ai_voice_script: string | null;
          ai_voice_url: string | null;
          ai_voice_persona: string | null;
          ai_voice_voice: string | null;
          ai_voice_script_model: string | null;
          ai_voice_tts_model: string | null;
          ai_voice_prompt_version: string | null;
          ai_voice_generated_at: string | null;
          fair_value_low: number;
          fair_value_high: number;
          market_edge: string;
          confidence: number;
          risk_level: "Low" | "Medium" | "High";
          why_it_made_the_feed: string;
          red_flags: string[];
          seller_questions: string[];
          suggested_first_message: string;
          suggested_offer: number;
          walkaway_price: number;
          checklist_items: string[];
          tags: string[];
          reel_captions: string[];
          raw_provider_summary: Json | null;
          imported_at: string | null;
          last_seen_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["listings"]["Row"]> & {
          year: number;
          make: string;
          model: string;
          price: number;
          mileage: number;
          location: string;
        };
        Update: Partial<Database["public"]["Tables"]["listings"]["Row"]>;
        Relationships: [];
      };
      listing_media: {
        Row: {
          id: string;
          listing_id: string;
          owner_id: string | null;
          media_type: "image" | "video";
          storage_path: string | null;
          public_url: string;
          thumbnail_url: string | null;
          sort_order: number;
          label: string | null;
          width: number | null;
          height: number | null;
          duration_seconds: number | null;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["listing_media"]["Row"]> & {
          listing_id: string;
          media_type: "image" | "video";
          public_url: string;
        };
        Update: Partial<Database["public"]["Tables"]["listing_media"]["Row"]>;
        Relationships: [];
      };
      saved_listings: {
        Row: {
          user_id: string;
          listing_id: string;
          created_at: string;
        };
        Insert: {
          user_id: string;
          listing_id: string;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["saved_listings"]["Insert"]>;
        Relationships: [];
      };
      offers: {
        Row: {
          id: string;
          listing_id: string;
          buyer_id: string;
          seller_id: string | null;
          asking_price: number;
          offer_amount: number;
          counter_amount: number | null;
          payment_type: "Cash" | "Financing" | "Trade";
          message: string;
          status: "sent" | "accepted" | "declined" | "countered" | "counter-accepted";
          expires_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["offers"]["Row"]> & {
          listing_id: string;
          buyer_id: string;
          asking_price: number;
          offer_amount: number;
          payment_type: "Cash" | "Financing" | "Trade";
        };
        Update: Partial<Database["public"]["Tables"]["offers"]["Row"]>;
        Relationships: [];
      };
      offer_events: {
        Row: {
          id: string;
          offer_id: string;
          actor_id: string | null;
          event_type: string;
          amount: number | null;
          note: string | null;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["offer_events"]["Row"]> & {
          offer_id: string;
          event_type: string;
        };
        Update: Partial<Database["public"]["Tables"]["offer_events"]["Row"]>;
        Relationships: [];
      };
      messages: {
        Row: {
          id: string;
          listing_id: string;
          offer_id: string | null;
          sender_id: string;
          recipient_id: string;
          body: string;
          read_at: string | null;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["messages"]["Row"]> & {
          listing_id: string;
          sender_id: string;
          recipient_id: string;
          body: string;
        };
        Update: Partial<Database["public"]["Tables"]["messages"]["Row"]>;
        Relationships: [];
      };
      listing_imports: {
        Row: {
          id: string;
          source_mode: "marketcheck" | "ebay" | "csv";
          source_listing_id: string;
          listing_id: string | null;
          payload: Json;
          imported_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["listing_imports"]["Row"]> & {
          source_mode: "marketcheck" | "ebay" | "csv";
          source_listing_id: string;
          payload: Json;
        };
        Update: Partial<Database["public"]["Tables"]["listing_imports"]["Row"]>;
        Relationships: [];
      };
      listing_interest_events: {
        Row: {
          id: string;
          user_id: string | null;
          anonymous_id: string | null;
          listing_id: string;
          event_type: string;
          event_weight: number;
          dwell_ms: number | null;
          metadata: Json;
          listing_snapshot: Json;
          occurred_at: string;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["listing_interest_events"]["Row"]> & {
          listing_id: string;
          event_type: string;
        };
        Update: Partial<Database["public"]["Tables"]["listing_interest_events"]["Row"]>;
        Relationships: [];
      };
      provider_sync_runs: {
        Row: {
          id: string;
          provider: string;
          status: "completed" | "failed";
          month_key: string;
          started_at: string;
          finished_at: string | null;
          calls_used: number;
          rows_fetched: number;
          listings_upserted: number;
          listings_archived: number;
          listings_reactivated: number;
          error: string | null;
          notes: Json;
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["provider_sync_runs"]["Row"]> & {
          provider: string;
          month_key: string;
        };
        Update: Partial<Database["public"]["Tables"]["provider_sync_runs"]["Row"]>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
