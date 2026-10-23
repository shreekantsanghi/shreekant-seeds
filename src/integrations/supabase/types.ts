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
    PostgrestVersion: "14.17"
  }
  public: {
    Tables: {
      addresses: {
        Row: {
          address_line1: string
          address_line2: string | null
          approved_delivery_charge: number | null
          created_at: string
          delivery_approved: boolean
          delivery_approved_at: string | null
          delivery_approved_by: string | null
          distance_confirmed_at: string | null
          distance_confirmed_by: string | null
          distance_km: number | null
          district: string
          estimate_error: string | null
          estimate_status: string
          estimated_at: string | null
          estimated_distance_km: number | null
          estimated_duration_min: number | null
          full_name: string
          geo_confidence: number | null
          geo_formatted: string | null
          geo_lat: number | null
          geo_lon: number | null
          geocoded_at: string | null
          id: string
          is_default: boolean
          landmark: string | null
          phone: string
          pincode: string
          state: string
          updated_at: string
          user_id: string
          village_town: string
        }
        Insert: {
          address_line1: string
          address_line2?: string | null
          approved_delivery_charge?: number | null
          created_at?: string
          delivery_approved?: boolean
          delivery_approved_at?: string | null
          delivery_approved_by?: string | null
          distance_confirmed_at?: string | null
          distance_confirmed_by?: string | null
          distance_km?: number | null
          district: string
          estimate_error?: string | null
          estimate_status?: string
          estimated_at?: string | null
          estimated_distance_km?: number | null
          estimated_duration_min?: number | null
          full_name: string
          geo_confidence?: number | null
          geo_formatted?: string | null
          geo_lat?: number | null
          geo_lon?: number | null
          geocoded_at?: string | null
          id?: string
          is_default?: boolean
          landmark?: string | null
          phone: string
          pincode: string
          state?: string
          updated_at?: string
          user_id: string
          village_town: string
        }
        Update: {
          address_line1?: string
          address_line2?: string | null
          approved_delivery_charge?: number | null
          created_at?: string
          delivery_approved?: boolean
          delivery_approved_at?: string | null
          delivery_approved_by?: string | null
          distance_confirmed_at?: string | null
          distance_confirmed_by?: string | null
          distance_km?: number | null
          district?: string
          estimate_error?: string | null
          estimate_status?: string
          estimated_at?: string | null
          estimated_distance_km?: number | null
          estimated_duration_min?: number | null
          full_name?: string
          geo_confidence?: number | null
          geo_formatted?: string | null
          geo_lat?: number | null
          geo_lon?: number | null
          geocoded_at?: string | null
          id?: string
          is_default?: boolean
          landmark?: string | null
          phone?: string
          pincode?: string
          state?: string
          updated_at?: string
          user_id?: string
          village_town?: string
        }
        Relationships: []
      }
      app_secrets: {
        Row: {
          created_at: string
          name: string
          value: string
        }
        Insert: {
          created_at?: string
          name: string
          value: string
        }
        Update: {
          created_at?: string
          name?: string
          value?: string
        }
        Relationships: []
      }
      audit_logs: {
        Row: {
          action: string
          actor_user_id: string | null
          created_at: string
          entity_id: string | null
          entity_type: string | null
          id: string
          metadata: Json | null
        }
        Insert: {
          action: string
          actor_user_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          metadata?: Json | null
        }
        Update: {
          action?: string
          actor_user_id?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          metadata?: Json | null
        }
        Relationships: []
      }
      brands: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          name: string
          name_hi: string | null
          search_terms: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          name_hi?: string | null
          search_terms?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          name_hi?: string | null
          search_terms?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      cart_items: {
        Row: {
          created_at: string
          id: string
          product_id: string
          quantity: number
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          product_id: string
          quantity?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          product_id?: string
          quantity?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cart_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      categories: {
        Row: {
          created_at: string
          description: string | null
          description_hi: string | null
          id: string
          image_url: string | null
          is_active: boolean
          name: string
          name_hi: string
          slug: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          description_hi?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          name: string
          name_hi: string
          slug: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          description_hi?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          name?: string
          name_hi?: string
          slug?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      delivery_locations: {
        Row: {
          accuracy_m: number
          address_id: string | null
          created_at: string
          distance_km: number | null
          duration_min: number | null
          error: string | null
          id: string
          lat: number
          lon: number
          order_id: string | null
          source: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          accuracy_m: number
          address_id?: string | null
          created_at?: string
          distance_km?: number | null
          duration_min?: number | null
          error?: string | null
          id?: string
          lat: number
          lon: number
          order_id?: string | null
          source?: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          accuracy_m?: number
          address_id?: string | null
          created_at?: string
          distance_km?: number | null
          duration_min?: number | null
          error?: string | null
          id?: string
          lat?: number
          lon?: number
          order_id?: string | null
          source?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "delivery_locations_address_id_fkey"
            columns: ["address_id"]
            isOneToOne: false
            referencedRelation: "addresses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_locations_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      delivery_settings: {
        Row: {
          created_at: string
          delivery_charge: number
          estimated_delivery_text: string | null
          estimated_delivery_text_hi: string | null
          free_delivery_above: number | null
          free_delivery_max_km: number
          free_delivery_min_pieces: number
          id: string
          is_active: boolean
          minimum_order_amount: number
          origin_label: string | null
          origin_lat: number | null
          origin_lon: number | null
          service_area: string
          tier1_charge: number
          tier1_max_km: number
          tier2_charge: number
          tier2_max_km: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          delivery_charge?: number
          estimated_delivery_text?: string | null
          estimated_delivery_text_hi?: string | null
          free_delivery_above?: number | null
          free_delivery_max_km?: number
          free_delivery_min_pieces?: number
          id?: string
          is_active?: boolean
          minimum_order_amount?: number
          origin_label?: string | null
          origin_lat?: number | null
          origin_lon?: number | null
          service_area?: string
          tier1_charge?: number
          tier1_max_km?: number
          tier2_charge?: number
          tier2_max_km?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          delivery_charge?: number
          estimated_delivery_text?: string | null
          estimated_delivery_text_hi?: string | null
          free_delivery_above?: number | null
          free_delivery_max_km?: number
          free_delivery_min_pieces?: number
          id?: string
          is_active?: boolean
          minimum_order_amount?: number
          origin_label?: string | null
          origin_lat?: number | null
          origin_lon?: number | null
          service_area?: string
          tier1_charge?: number
          tier1_max_km?: number
          tier2_charge?: number
          tier2_max_km?: number
          updated_at?: string
        }
        Relationships: []
      }
      discounts: {
        Row: {
          code: string
          created_at: string
          description: string | null
          description_hi: string | null
          discount_type: string
          discount_value: number
          ends_at: string | null
          id: string
          is_active: boolean
          maximum_discount_amount: number | null
          minimum_order_amount: number
          starts_at: string | null
          updated_at: string
          usage_count: number
          usage_limit: number | null
        }
        Insert: {
          code: string
          created_at?: string
          description?: string | null
          description_hi?: string | null
          discount_type: string
          discount_value: number
          ends_at?: string | null
          id?: string
          is_active?: boolean
          maximum_discount_amount?: number | null
          minimum_order_amount?: number
          starts_at?: string | null
          updated_at?: string
          usage_count?: number
          usage_limit?: number | null
        }
        Update: {
          code?: string
          created_at?: string
          description?: string | null
          description_hi?: string | null
          discount_type?: string
          discount_value?: number
          ends_at?: string | null
          id?: string
          is_active?: boolean
          maximum_discount_amount?: number | null
          minimum_order_amount?: number
          starts_at?: string | null
          updated_at?: string
          usage_count?: number
          usage_limit?: number | null
        }
        Relationships: []
      }
      email_outbox: {
        Row: {
          attempts: number
          created_at: string
          dedupe_key: string
          event_type: string
          id: string
          last_error: string | null
          order_id: string | null
          payload: Json
          product_id: string | null
          provider_message_id: string | null
          recipient_email: string
          recipient_type: string
          recipient_user_id: string | null
          sent_at: string | null
          status: string
          updated_at: string
        }
        Insert: {
          attempts?: number
          created_at?: string
          dedupe_key: string
          event_type: string
          id?: string
          last_error?: string | null
          order_id?: string | null
          payload?: Json
          product_id?: string | null
          provider_message_id?: string | null
          recipient_email: string
          recipient_type: string
          recipient_user_id?: string | null
          sent_at?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          attempts?: number
          created_at?: string
          dedupe_key?: string
          event_type?: string
          id?: string
          last_error?: string | null
          order_id?: string | null
          payload?: Json
          product_id?: string | null
          provider_message_id?: string | null
          recipient_email?: string
          recipient_type?: string
          recipient_user_id?: string | null
          sent_at?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "email_outbox_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_outbox_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory: {
        Row: {
          batch_number: string | null
          expiry_date: string | null
          id: string
          low_stock_notified: boolean
          low_stock_threshold: number
          out_of_stock_notified: boolean
          product_id: string
          quantity: number
          reserved_quantity: number
          updated_at: string
        }
        Insert: {
          batch_number?: string | null
          expiry_date?: string | null
          id?: string
          low_stock_notified?: boolean
          low_stock_threshold?: number
          out_of_stock_notified?: boolean
          product_id: string
          quantity?: number
          reserved_quantity?: number
          updated_at?: string
        }
        Update: {
          batch_number?: string | null
          expiry_date?: string | null
          id?: string
          low_stock_notified?: boolean
          low_stock_threshold?: number
          out_of_stock_notified?: boolean
          product_id?: string
          quantity?: number
          reserved_quantity?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: true
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          action_label: string | null
          action_url: string | null
          address_id: string | null
          audience: string
          category: string
          created_at: string
          dedupe_key: string | null
          id: string
          is_read: boolean
          message: string
          metadata: Json
          notification_type: string
          order_id: string | null
          priority: string
          product_id: string | null
          read_at: string | null
          recipient_user_id: string
          requires_action: boolean
          title: string
        }
        Insert: {
          action_label?: string | null
          action_url?: string | null
          address_id?: string | null
          audience?: string
          category: string
          created_at?: string
          dedupe_key?: string | null
          id?: string
          is_read?: boolean
          message: string
          metadata?: Json
          notification_type: string
          order_id?: string | null
          priority?: string
          product_id?: string | null
          read_at?: string | null
          recipient_user_id: string
          requires_action?: boolean
          title: string
        }
        Update: {
          action_label?: string | null
          action_url?: string | null
          address_id?: string | null
          audience?: string
          category?: string
          created_at?: string
          dedupe_key?: string | null
          id?: string
          is_read?: boolean
          message?: string
          metadata?: Json
          notification_type?: string
          order_id?: string | null
          priority?: string
          product_id?: string | null
          read_at?: string | null
          recipient_user_id?: string
          requires_action?: boolean
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_address_id_fkey"
            columns: ["address_id"]
            isOneToOne: false
            referencedRelation: "addresses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      order_deliveries: {
        Row: {
          attempt_count: number
          code_hash: string
          created_at: string
          created_by: string | null
          credential_nonce: string | null
          delivery_pin_hash: string
          expires_at: string
          locked_at: string | null
          order_id: string
          token_hash: string
          verified_at: string | null
        }
        Insert: {
          attempt_count?: number
          code_hash: string
          created_at?: string
          created_by?: string | null
          credential_nonce?: string | null
          delivery_pin_hash: string
          expires_at: string
          locked_at?: string | null
          order_id: string
          token_hash: string
          verified_at?: string | null
        }
        Update: {
          attempt_count?: number
          code_hash?: string
          created_at?: string
          created_by?: string | null
          credential_nonce?: string | null
          delivery_pin_hash?: string
          expires_at?: string
          locked_at?: string | null
          order_id?: string
          token_hash?: string
          verified_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "order_deliveries_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: true
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      order_items: {
        Row: {
          created_at: string
          hsn_code: string | null
          id: string
          order_id: string
          pack_size: string | null
          product_id: string | null
          product_name: string
          product_name_hi: string
          product_type: Database["public"]["Enums"]["product_type"] | null
          quantity: number
          sku: string | null
          tax_amount: number
          tax_rate: number | null
          total_price: number
          unit: string | null
          unit_price: number
        }
        Insert: {
          created_at?: string
          hsn_code?: string | null
          id?: string
          order_id: string
          pack_size?: string | null
          product_id?: string | null
          product_name: string
          product_name_hi: string
          product_type?: Database["public"]["Enums"]["product_type"] | null
          quantity: number
          sku?: string | null
          tax_amount?: number
          tax_rate?: number | null
          total_price: number
          unit?: string | null
          unit_price: number
        }
        Update: {
          created_at?: string
          hsn_code?: string | null
          id?: string
          order_id?: string
          pack_size?: string | null
          product_id?: string | null
          product_name?: string
          product_name_hi?: string
          product_type?: Database["public"]["Enums"]["product_type"] | null
          quantity?: number
          sku?: string | null
          tax_amount?: number
          tax_rate?: number | null
          total_price?: number
          unit?: string | null
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          address_id: string | null
          cart_cleared_at: string | null
          cgst_amount: number
          created_at: string
          customer_name: string | null
          customer_note: string | null
          customer_phone: string | null
          delivery_address: Json | null
          delivery_approval_required: boolean
          delivery_charge: number
          delivery_charge_base: number | null
          delivery_distance_km: number | null
          delivery_override_free: boolean
          discount_amount: number
          id: string
          idempotency_key: string | null
          igst_amount: number
          inventory_fulfilled_at: string | null
          invoice_issued_at: string | null
          invoice_number: string | null
          order_number: string
          payment_status: Database["public"]["Enums"]["payment_status"]
          sgst_amount: number
          status: Database["public"]["Enums"]["order_status"]
          subtotal: number
          tax_amount: number
          taxable_value: number
          total_amount: number
          updated_at: string
          user_id: string
        }
        Insert: {
          address_id?: string | null
          cart_cleared_at?: string | null
          cgst_amount?: number
          created_at?: string
          customer_name?: string | null
          customer_note?: string | null
          customer_phone?: string | null
          delivery_address?: Json | null
          delivery_approval_required?: boolean
          delivery_charge?: number
          delivery_charge_base?: number | null
          delivery_distance_km?: number | null
          delivery_override_free?: boolean
          discount_amount?: number
          id?: string
          idempotency_key?: string | null
          igst_amount?: number
          inventory_fulfilled_at?: string | null
          invoice_issued_at?: string | null
          invoice_number?: string | null
          order_number: string
          payment_status?: Database["public"]["Enums"]["payment_status"]
          sgst_amount?: number
          status?: Database["public"]["Enums"]["order_status"]
          subtotal?: number
          tax_amount?: number
          taxable_value?: number
          total_amount?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          address_id?: string | null
          cart_cleared_at?: string | null
          cgst_amount?: number
          created_at?: string
          customer_name?: string | null
          customer_note?: string | null
          customer_phone?: string | null
          delivery_address?: Json | null
          delivery_approval_required?: boolean
          delivery_charge?: number
          delivery_charge_base?: number | null
          delivery_distance_km?: number | null
          delivery_override_free?: boolean
          discount_amount?: number
          id?: string
          idempotency_key?: string | null
          igst_amount?: number
          inventory_fulfilled_at?: string | null
          invoice_issued_at?: string | null
          invoice_number?: string | null
          order_number?: string
          payment_status?: Database["public"]["Enums"]["payment_status"]
          sgst_amount?: number
          status?: Database["public"]["Enums"]["order_status"]
          subtotal?: number
          tax_amount?: number
          taxable_value?: number
          total_amount?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "orders_address_id_fkey"
            columns: ["address_id"]
            isOneToOne: false
            referencedRelation: "addresses"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          amount: number
          created_at: string
          id: string
          order_id: string
          provider: string
          provider_order_id: string | null
          provider_payment_id: string | null
          raw_event_reference: string | null
          signature_verified: boolean
          status: Database["public"]["Enums"]["payment_status"]
          updated_at: string
        }
        Insert: {
          amount: number
          created_at?: string
          id?: string
          order_id: string
          provider?: string
          provider_order_id?: string | null
          provider_payment_id?: string | null
          raw_event_reference?: string | null
          signature_verified?: boolean
          status?: Database["public"]["Enums"]["payment_status"]
          updated_at?: string
        }
        Update: {
          amount?: number
          created_at?: string
          id?: string
          order_id?: string
          provider?: string
          provider_order_id?: string | null
          provider_payment_id?: string | null
          raw_event_reference?: string | null
          signature_verified?: boolean
          status?: Database["public"]["Enums"]["payment_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payments_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      product_discounts: {
        Row: {
          brand_id: string | null
          category_id: string | null
          created_at: string
          created_by: string | null
          ends_at: string
          id: string
          is_active: boolean
          percent: number
          product_id: string | null
          product_type: Database["public"]["Enums"]["product_type"] | null
          reason: string | null
          reason_hi: string | null
          starts_at: string
          target_type: string
          updated_at: string
        }
        Insert: {
          brand_id?: string | null
          category_id?: string | null
          created_at?: string
          created_by?: string | null
          ends_at: string
          id?: string
          is_active?: boolean
          percent: number
          product_id?: string | null
          product_type?: Database["public"]["Enums"]["product_type"] | null
          reason?: string | null
          reason_hi?: string | null
          starts_at: string
          target_type: string
          updated_at?: string
        }
        Update: {
          brand_id?: string | null
          category_id?: string | null
          created_at?: string
          created_by?: string | null
          ends_at?: string
          id?: string
          is_active?: boolean
          percent?: number
          product_id?: string | null
          product_type?: Database["public"]["Enums"]["product_type"] | null
          reason?: string | null
          reason_hi?: string | null
          starts_at?: string
          target_type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_discounts_brand_id_fkey"
            columns: ["brand_id"]
            isOneToOne: false
            referencedRelation: "brands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_discounts_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_discounts_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      product_images: {
        Row: {
          alt_text: string | null
          alt_text_hi: string | null
          created_at: string
          id: string
          image_url: string
          product_id: string
          sort_order: number
        }
        Insert: {
          alt_text?: string | null
          alt_text_hi?: string | null
          created_at?: string
          id?: string
          image_url: string
          product_id: string
          sort_order?: number
        }
        Update: {
          alt_text?: string | null
          alt_text_hi?: string | null
          created_at?: string
          id?: string
          image_url?: string
          product_id?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "product_images_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          brand: string | null
          category_id: string | null
          created_at: string
          description: string | null
          description_hi: string | null
          hsn_code: string | null
          id: string
          is_active: boolean
          is_featured: boolean
          mrp: number | null
          name: string
          name_hi: string
          pack_size: string | null
          price: number
          primary_image_url: string | null
          product_type: Database["public"]["Enums"]["product_type"]
          search_terms: string | null
          sku: string | null
          slug: string
          tax_rate: number | null
          unit: string
          updated_at: string
        }
        Insert: {
          brand?: string | null
          category_id?: string | null
          created_at?: string
          description?: string | null
          description_hi?: string | null
          hsn_code?: string | null
          id?: string
          is_active?: boolean
          is_featured?: boolean
          mrp?: number | null
          name: string
          name_hi: string
          pack_size?: string | null
          price: number
          primary_image_url?: string | null
          product_type: Database["public"]["Enums"]["product_type"]
          search_terms?: string | null
          sku?: string | null
          slug: string
          tax_rate?: number | null
          unit?: string
          updated_at?: string
        }
        Update: {
          brand?: string | null
          category_id?: string | null
          created_at?: string
          description?: string | null
          description_hi?: string | null
          hsn_code?: string | null
          id?: string
          is_active?: boolean
          is_featured?: boolean
          mrp?: number | null
          name?: string
          name_hi?: string
          pack_size?: string | null
          price?: number
          primary_image_url?: string | null
          product_type?: Database["public"]["Enums"]["product_type"]
          search_terms?: string | null
          sku?: string | null
          slug?: string
          tax_rate?: number | null
          unit?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "products_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          full_name: string | null
          id: string
          is_active: boolean
          phone: string | null
          role: Database["public"]["Enums"]["user_role"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          full_name?: string | null
          id: string
          is_active?: boolean
          phone?: string | null
          role?: Database["public"]["Enums"]["user_role"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          full_name?: string | null
          id?: string
          is_active?: boolean
          phone?: string | null
          role?: Database["public"]["Enums"]["user_role"]
          updated_at?: string
        }
        Relationships: []
      }
      push_deliveries: {
        Row: {
          created_at: string
          error: string | null
          id: string
          outbox_id: string
          registration_id: string
          status: string
        }
        Insert: {
          created_at?: string
          error?: string | null
          id?: string
          outbox_id: string
          registration_id: string
          status?: string
        }
        Update: {
          created_at?: string
          error?: string | null
          id?: string
          outbox_id?: string
          registration_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "push_deliveries_outbox_id_fkey"
            columns: ["outbox_id"]
            isOneToOne: false
            referencedRelation: "push_outbox"
            referencedColumns: ["id"]
          },
        ]
      }
      push_dispatch_config: {
        Row: {
          endpoint_url: string | null
          id: boolean
          preview_endpoint_url: string | null
          shared_secret: string
          updated_at: string
        }
        Insert: {
          endpoint_url?: string | null
          id?: boolean
          preview_endpoint_url?: string | null
          shared_secret?: string
          updated_at?: string
        }
        Update: {
          endpoint_url?: string | null
          id?: boolean
          preview_endpoint_url?: string | null
          shared_secret?: string
          updated_at?: string
        }
        Relationships: []
      }
      push_event_types: {
        Row: {
          audience: string
          is_enabled: boolean
          kind: string
          notification_type: string
          urgent: boolean
        }
        Insert: {
          audience: string
          is_enabled?: boolean
          kind?: string
          notification_type: string
          urgent?: boolean
        }
        Update: {
          audience?: string
          is_enabled?: boolean
          kind?: string
          notification_type?: string
          urgent?: boolean
        }
        Relationships: []
      }
      push_outbox: {
        Row: {
          attempts: number
          audience: string
          created_at: string
          id: string
          kind: string
          last_error: string | null
          notification_id: string
          notification_type: string
          recipient_user_id: string
          sent_at: string | null
          status: string
          updated_at: string
          urgent: boolean
        }
        Insert: {
          attempts?: number
          audience: string
          created_at?: string
          id?: string
          kind?: string
          last_error?: string | null
          notification_id: string
          notification_type: string
          recipient_user_id: string
          sent_at?: string | null
          status?: string
          updated_at?: string
          urgent?: boolean
        }
        Update: {
          attempts?: number
          audience?: string
          created_at?: string
          id?: string
          kind?: string
          last_error?: string | null
          notification_id?: string
          notification_type?: string
          recipient_user_id?: string
          sent_at?: string | null
          status?: string
          updated_at?: string
          urgent?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "push_outbox_notification_id_fkey"
            columns: ["notification_id"]
            isOneToOne: true
            referencedRelation: "notifications"
            referencedColumns: ["id"]
          },
        ]
      }
      push_registrations: {
        Row: {
          audience: string
          created_at: string
          enabled: boolean
          fcm_token: string
          id: string
          language: string
          promotional_enabled: boolean
          updated_at: string
          user_agent: string | null
          user_id: string
        }
        Insert: {
          audience?: string
          created_at?: string
          enabled?: boolean
          fcm_token: string
          id?: string
          language?: string
          promotional_enabled?: boolean
          updated_at?: string
          user_agent?: string | null
          user_id: string
        }
        Update: {
          audience?: string
          created_at?: string
          enabled?: boolean
          fcm_token?: string
          id?: string
          language?: string
          promotional_enabled?: boolean
          updated_at?: string
          user_agent?: string | null
          user_id?: string
        }
        Relationships: []
      }
      refunds: {
        Row: {
          amount: number
          created_at: string
          failure_reason: string | null
          id: string
          idempotency_key: string
          initiated_by: string | null
          last_event_id: string | null
          order_id: string
          payment_id: string
          processed_at: string | null
          razorpay_payment_id: string
          razorpay_refund_id: string | null
          razorpay_status: string | null
          reason: string | null
          status: string
          updated_at: string
        }
        Insert: {
          amount: number
          created_at?: string
          failure_reason?: string | null
          id?: string
          idempotency_key: string
          initiated_by?: string | null
          last_event_id?: string | null
          order_id: string
          payment_id: string
          processed_at?: string | null
          razorpay_payment_id: string
          razorpay_refund_id?: string | null
          razorpay_status?: string | null
          reason?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          amount?: number
          created_at?: string
          failure_reason?: string | null
          id?: string
          idempotency_key?: string
          initiated_by?: string | null
          last_event_id?: string | null
          order_id?: string
          payment_id?: string
          processed_at?: string | null
          razorpay_payment_id?: string
          razorpay_refund_id?: string | null
          razorpay_status?: string | null
          reason?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "refunds_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "refunds_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "payments"
            referencedColumns: ["id"]
          },
        ]
      }
      search_aliases: {
        Row: {
          alias: string
          created_at: string
          expansion: string
          id: string
          updated_at: string
        }
        Insert: {
          alias: string
          created_at?: string
          expansion: string
          id?: string
          updated_at?: string
        }
        Update: {
          alias?: string
          created_at?: string
          expansion?: string
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      search_keywords: {
        Row: {
          category_id: string | null
          created_at: string
          id: string
          keyword: string
          product_id: string | null
          updated_at: string
        }
        Insert: {
          category_id?: string | null
          created_at?: string
          id?: string
          keyword: string
          product_id?: string | null
          updated_at?: string
        }
        Update: {
          category_id?: string | null
          created_at?: string
          id?: string
          keyword?: string
          product_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "search_keywords_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "search_keywords_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      wishlist_items: {
        Row: {
          created_at: string
          id: string
          product_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          product_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          product_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "wishlist_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      active_product_discounts: {
        Args: never
        Returns: {
          discounted_price: number
          ends_at: string
          percent: number
          product_id: string
          reason: string
          reason_hi: string
        }[]
      }
      admin_list_sessions: {
        Args: never
        Returns: {
          created_at: string
          ip: string
          is_current: boolean
          last_active_at: string
          session_id: string
          user_agent: string
          within_limit: boolean
        }[]
      }
      admin_revoke_sessions: { Args: { p_session_id: string }; Returns: number }
      admin_session_allowed: { Args: never; Returns: boolean }
      apply_refund_status: {
        Args: {
          p_event_id: string
          p_failure_reason: string
          p_razorpay_payment_id: string
          p_razorpay_refund_id: string
          p_refund_row_id: string
          p_source: string
          p_status: string
        }
        Returns: {
          refund_id: string
          result: string
        }[]
      }
      attach_razorpay_refund_id: {
        Args: {
          p_razorpay_refund_id: string
          p_razorpay_status: string
          p_refund_row_id: string
        }
        Returns: boolean
      }
      cart_change: {
        Args: { p_mode: string; p_product_id: string; p_quantity: number }
        Returns: {
          adjusted: boolean
          out_of_stock: boolean
          quantity: number
        }[]
      }
      claim_email_batch: {
        Args: { p_limit?: number }
        Returns: {
          attempts: number
          created_at: string
          dedupe_key: string
          event_type: string
          id: string
          last_error: string | null
          order_id: string | null
          payload: Json
          product_id: string | null
          provider_message_id: string | null
          recipient_email: string
          recipient_type: string
          recipient_user_id: string | null
          sent_at: string | null
          status: string
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "email_outbox"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      claim_push_batch: {
        Args: { p_limit?: number }
        Returns: {
          attempts: number
          audience: string
          created_at: string
          id: string
          kind: string
          last_error: string | null
          notification_id: string
          notification_type: string
          recipient_user_id: string
          sent_at: string | null
          status: string
          updated_at: string
          urgent: boolean
        }[]
        SetofOptions: {
          from: "*"
          to: "push_outbox"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      confirm_delivery: {
        Args: { p_code: string; p_pin: string; p_token: string }
        Returns: {
          ok: boolean
          reason: string
        }[]
      }
      consume_order_cart: {
        Args: { p_order_id: string }
        Returns: {
          removed: number
          result: string
        }[]
      }
      create_pending_order: {
        Args: { p_address_id: string; p_idempotency_key: string }
        Returns: {
          delivery_approval_required: boolean
          order_id: string
          order_number: string
          total_amount: number
        }[]
      }
      derive_delivery_credentials: {
        Args: { p_nonce: string; p_order_id: string }
        Returns: {
          code: string
          pin: string
          token: string
        }[]
      }
      email_of_user: { Args: { p_user_id: string }; Returns: string }
      fulfill_order_inventory: {
        Args: { p_order_id: string }
        Returns: {
          details: Json
          result: string
        }[]
      }
      get_my_delivery_credentials: {
        Args: { p_order_id: string }
        Returns: {
          code: string
          expires_at: string
          token: string
        }[]
      }
      is_admin: { Args: never; Returns: boolean }
      issue_delivery_credentials: {
        Args: { p_order_id: string; p_reissue?: boolean }
        Returns: {
          code: string
          expires_at: string
          issued: boolean
          pin: string
          token: string
        }[]
      }
      issue_order_invoice: { Args: { p_order_id: string }; Returns: string }
      mark_all_notifications_read: { Args: never; Returns: number }
      mark_notifications_read: { Args: { p_ids: string[] }; Returns: number }
      notify_admins: {
        Args: {
          p_action_label?: string
          p_action_url?: string
          p_category: string
          p_dedupe_key?: string
          p_exclude_user?: string
          p_message: string
          p_metadata?: Json
          p_order_id?: string
          p_priority: string
          p_product_id?: string
          p_requires_action?: boolean
          p_title: string
          p_type: string
        }
        Returns: undefined
      }
      notify_user: {
        Args: {
          p_action_label?: string
          p_action_url?: string
          p_address_id?: string
          p_audience: string
          p_category: string
          p_dedupe_key?: string
          p_message: string
          p_metadata?: Json
          p_order_id?: string
          p_priority: string
          p_product_id?: string
          p_recipient: string
          p_requires_action?: boolean
          p_title: string
          p_type: string
        }
        Returns: undefined
      }
      product_availability: {
        Args: never
        Returns: {
          in_stock: boolean
          is_low: boolean
          product_id: string
        }[]
      }
      product_discount_percent: {
        Args: { p_product_id: string }
        Returns: number
      }
      queue_email: {
        Args: {
          p_dedupe_key: string
          p_event_type: string
          p_order_id?: string
          p_payload?: Json
          p_product_id?: string
          p_recipient_type: string
          p_recipient_user_id: string
        }
        Returns: undefined
      }
      queue_email_admins: {
        Args: {
          p_dedupe_key: string
          p_event_type: string
          p_order_id?: string
          p_payload?: Json
          p_product_id?: string
        }
        Returns: undefined
      }
      recover_stuck_emails: {
        Args: { p_stale_minutes?: number }
        Returns: number
      }
      request_push_dispatch: { Args: never; Returns: undefined }
      reserve_refund: {
        Args: {
          p_actor: string
          p_amount: number
          p_idempotency_key: string
          p_order_id: string
          p_reason: string
        }
        Returns: {
          amount: number
          razorpay_payment_id: string
          razorpay_refund_id: string
          refund_id: string
          refund_status: string
          remaining: number
          result: string
        }[]
      }
      search_fold: { Args: { p: string }; Returns: string }
      search_norm: { Args: { p: string }; Returns: string }
      search_products: {
        Args: { p_limit?: number; p_query: string }
        Returns: {
          matched: number
          product_id: string
          score: number
        }[]
      }
      search_word_fuzzy: {
        Args: { p_doc: string; p_tok: string }
        Returns: boolean
      }
      set_address_delivery_approval: {
        Args: { p_address_id: string; p_approved: boolean; p_charge?: number }
        Returns: {
          approved: boolean
          charge: number
          orders_updated: number
        }[]
      }
      set_order_delivery_override: {
        Args: { p_free: boolean; p_order_id: string }
        Returns: {
          delivery_charge: number
          override_free: boolean
          total_amount: number
        }[]
      }
      set_order_status: {
        Args: {
          p_order_id: string
          p_status: Database["public"]["Enums"]["order_status"]
        }
        Returns: Database["public"]["Enums"]["order_status"]
      }
      sha256_hex: { Args: { p_value: string }; Returns: string }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
      similar_products: {
        Args: { p_limit?: number; p_product_id: string }
        Returns: {
          product_id: string
          score: number
        }[]
      }
    }
    Enums: {
      order_status:
        | "pending"
        | "confirmed"
        | "processing"
        | "ready_for_delivery"
        | "out_for_delivery"
        | "delivered"
        | "cancelled"
      payment_status:
        | "created"
        | "pending"
        | "paid"
        | "failed"
        | "refunded"
        | "partially_refunded"
      product_type: "seed" | "pesticide" | "fertilizer" | "other"
      user_role: "customer" | "admin"
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
    Enums: {
      order_status: [
        "pending",
        "confirmed",
        "processing",
        "ready_for_delivery",
        "out_for_delivery",
        "delivered",
        "cancelled",
      ],
      payment_status: [
        "created",
        "pending",
        "paid",
        "failed",
        "refunded",
        "partially_refunded",
      ],
      product_type: ["seed", "pesticide", "fertilizer", "other"],
      user_role: ["customer", "admin"],
    },
  },
} as const
