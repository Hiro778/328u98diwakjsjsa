// _shared/types.ts
// Shared types for marketplace integration

// ══════════════════════════════════════════════════════════
// OAuth Types
// ══════════════════════════════════════════════════════════

export interface OAuthConfig {
  authorization_url: string;
  token_url: string;
  scopes: string[];
  auth_params?: Record<string, string>;
}

export interface OAuthTokens {
  access_token: string;
  refresh_token?: string;
  token_type?: string;
  expires_in?: number;
  scope?: string;
}

export interface ShopInfo {
  shop_id: string;
  shop_name: string;
  shop_url?: string;
  shop_username?: string;
  shop_email?: string;
  shop_phone?: string;
  shop_avatar_url?: string;
  shop_verified?: boolean;
}

export interface OAuthExchangeResult {
  success: boolean;
  tokens?: OAuthTokens;
  shop_info?: ShopInfo;
  error?: string;
}

export interface OAuthRefreshResult {
  success: boolean;
  tokens?: OAuthTokens;
  error?: string;
}

// ══════════════════════════════════════════════════════════
// Connection Types
// ══════════════════════════════════════════════════════════

export type ConnectionStatus =
  | 'not_connected'
  | 'connecting'
  | 'connected'
  | 'token_expired'
  | 'error'
  | 'disconnected';

export interface MarketplaceConnection {
  id: string;
  business_id: string;
  marketplace: string;
  status: ConnectionStatus;
  shop_name: string;
  shop_id: string;
  shop_url: string;
  shop_username: string;
  shop_email: string;
  shop_phone: string;
  shop_avatar_url: string;
  shop_verified: boolean;
  authorization_status: string;
  token_expires_at: string | null;
  last_sync_at: string | null;
  last_error: string;
  error_count: number;
  created_at: string;
  updated_at: string;
}

// ══════════════════════════════════════════════════════════
// Product & Order Types
// ══════════════════════════════════════════════════════════

export interface MarketplaceProduct {
  marketplace_product_id: string;
  name: string;
  sku: string;
  price: number;
  stock: number;
  image_url: string;
  category: string;
  status: string;
}

export interface MarketplaceOrder {
  marketplace_order_id: string;
  buyer_name: string;
  buyer_address: string;
  buyer_phone: string;
  shipping_method: string;
  tracking_number: string;
  items: OrderItem[];
  subtotal: number;
  shipping_fee: number;
  total_amount: number;
  order_status: string;
  payment_status: string;
  payment_method: string;
  marketplace_created_at: string;
  raw_data: Record<string, unknown>;
}

export interface OrderItem {
  product_name: string;
  marketplace_sku: string;
  quantity: number;
  unit_price: number;
  subtotal: number;
}

export interface SyncResult {
  success: boolean;
  items_synced: number;
  items_failed: number;
  errors: string[];
}

// ══════════════════════════════════════════════════════════
// Provider Interface
// ══════════════════════════════════════════════════════════

export interface MarketplaceProvider {
  name: string;

  /** Check if this marketplace has credentials configured in env */
  isConfigured(): boolean;

  /** Get OAuth configuration for authorization flow */
  getOAuthConfig(): OAuthConfig;

  /** Exchange authorization code for tokens */
  exchangeCode(code: string, state: string): Promise<OAuthExchangeResult>;

  /** Refresh access token using refresh token */
  refreshToken(refreshToken: string): Promise<OAuthRefreshResult>;

  /** Get shop info using access token */
  getShopInfo(accessToken: string): Promise<ShopInfo>;

  /** Fetch products from marketplace */
  fetchProducts(accessToken: string, page?: number, limit?: number): Promise<{ products: MarketplaceProduct[]; total: number }>;

  /** Update stock on marketplace */
  updateStock(accessToken: string, marketplaceProductId: string, quantity: number): Promise<{ success: boolean; error?: string }>;

  /** Update price on marketplace */
  updatePrice(accessToken: string, marketplaceProductId: string, price: number): Promise<{ success: boolean; error?: string }>;

  /** Fetch orders from marketplace */
  fetchOrders(accessToken: string, since?: string, page?: number): Promise<{ orders: MarketplaceOrder[]; total: number }>;
}
