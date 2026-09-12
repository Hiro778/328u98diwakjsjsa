// Tokopedia Developer API Provider
// Documentation: https://developer.tokopedia.com/
//
// NOTE: Tokopedia merged with TikTok Shop Indonesia (Jan 2024).
// New integrations may need to use TikTok Shop Partner API instead.
// This provider supports legacy Tokopedia API for existing partners.
//
// Env vars required:
//   TOKOPEDIA_CLIENT_ID - Application Client ID
//   TOKOPEDIA_CLIENT_SECRET - Application Client Secret
//   TOKOPEDIA_REDIRECT_URI - OAuth callback URL
//   TOKOPEDIA_API_BASE - API base URL (default: https://accounts.tokopedia.com)
//
// Auth flow: Standard OAuth2 (authorization code grant).
// Token lifetime: ~1 hour (access).

import type {
  MarketplaceProvider,
  OAuthConfig,
  OAuthExchangeResult,
  OAuthRefreshResult,
  ShopInfo,
  MarketplaceProduct,
  MarketplaceOrder,
} from "../types.ts";

const API_BASE = Deno.env.get("TOKOPEDIA_API_BASE") || "https://accounts.tokopedia.com";

export class TokopediaProvider implements MarketplaceProvider {
  name = "tokopedia";

  isConfigured(): boolean {
    return !!(
      Deno.env.get("TOKOPEDIA_CLIENT_ID") &&
      Deno.env.get("TOKOPEDIA_CLIENT_SECRET") &&
      Deno.env.get("TOKOPEDIA_REDIRECT_URI")
    );
  }

  getOAuthConfig(): OAuthConfig {
    const clientId = Deno.env.get("TOKOPEDIA_CLIENT_ID")!;
    const redirectUri = Deno.env.get("TOKOPEDIA_REDIRECT_URI")!;

    return {
      authorization_url: `https://accounts.tokopedia.com/oauth/authorize?response_type=code&client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&state={state}`,
      token_url: `${API_BASE}/oauth/token`,
      scopes: ["read_write"],
    };
  }

  async exchangeCode(code: string, state: string): Promise<OAuthExchangeResult> {
    try {
      const clientId = Deno.env.get("TOKOPEDIA_CLIENT_ID")!;
      const clientSecret = Deno.env.get("TOKOPEDIA_CLIENT_SECRET")!;
      const redirectUri = Deno.env.get("TOKOPEDIA_REDIRECT_URI")!;

      // Exchange authorization code for access token
      const tokenResponse = await fetch(`${API_BASE}/oauth/token`, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          client_id: clientId,
          client_secret: clientSecret,
          code,
          redirect_uri: redirectUri,
        }),
      });

      const tokenData = await tokenResponse.json();

      if (!tokenData.access_token) {
        return {
          success: false,
          error: tokenData.error_description || tokenData.message || "Failed to exchange code",
        };
      }

      // Get shop info
      const shopInfo = await this.getShopInfo(tokenData.access_token);

      return {
        success: true,
        tokens: {
          access_token: tokenData.access_token,
          refresh_token: tokenData.refresh_token,
          token_type: tokenData.token_type || "bearer",
          expires_in: tokenData.expires_in || 3600,
          scope: tokenData.scope || "",
        },
        shop_info: shopInfo,
      };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : "Tokopedia token exchange failed",
      };
    }
  }

  async refreshToken(refreshToken: string): Promise<OAuthRefreshResult> {
    try {
      const clientId = Deno.env.get("TOKOPEDIA_CLIENT_ID")!;
      const clientSecret = Deno.env.get("TOKOPEDIA_CLIENT_SECRET")!;

      const response = await fetch(`${API_BASE}/oauth/token`, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          grant_type: "refresh_token",
          client_id: clientId,
          client_secret: clientSecret,
          refresh_token: refreshToken,
        }),
      });

      const data = await response.json();

      if (!data.access_token) {
        return {
          success: false,
          error: data.error_description || data.message || "Token refresh failed",
        };
      }

      return {
        success: true,
        tokens: {
          access_token: data.access_token,
          refresh_token: data.refresh_token,
          token_type: data.token_type || "bearer",
          expires_in: data.expires_in || 3600,
        },
      };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : "Token refresh failed",
      };
    }
  }

  async getShopInfo(accessToken: string): Promise<ShopInfo> {
    try {
      const response = await fetch("https://api.tokopedia.com/shop/info", {
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${accessToken}`,
          "X-Source": "tokopedia",
          "X-Tkpd-Lite-Service": "zeus",
        },
      });

      const data = await response.json();
      const shop = data?.data || {};

      return {
        shop_id: String(shop.id || ""),
        shop_name: shop.name || "",
        shop_url: shop.url ? `https://www.tokopedia.com/${shop.url}` : "",
        shop_username: shop.url || "",
        shop_email: shop.email || "",
        shop_phone: shop.phone || "",
        shop_avatar_url: shop.image_url || "",
        shop_verified: shop.is_power_badge || false,
      };
    } catch (err) {
      console.error("[TokopediaProvider] getShopInfo error:", err);
      return {
        shop_id: "",
        shop_name: "Unknown Shop",
      };
    }
  }

  async fetchProducts(
    accessToken: string,
    page = 0,
    limit = 20
  ): Promise<{ products: MarketplaceProduct[]; total: number }> {
    try {
      const response = await fetch(
        `https://api.tokopedia.com/inventory/v1/get?page=${page + 1}&per_page=${limit}`,
        {
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${accessToken}`,
            "X-Source": "tokopedia",
            "X-Tkpd-Lite-Service": "patron",
          },
        }
      );

      const data = await response.json();
      const items = data?.data?.products || [];

      return {
        products: items.map((item: any) => ({
          marketplace_product_id: String(item.id),
          name: item.name || "",
          sku: item.sku || "",
          price: item.price || 0,
          stock: item.stock || 0,
          image_url: item.images?.[0]?.url || "",
          category: item.category?.name || "",
          status: item.status === "active" ? "active" : "inactive",
        })),
        total: data?.data?.total_data || 0,
      };
    } catch (err) {
      console.error("[TokopediaProvider] fetchProducts error:", err);
      return { products: [], total: 0 };
    }
  }

  async updateStock(
    accessToken: string,
    marketplaceProductId: string,
    quantity: number
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const response = await fetch("https://api.tokopedia.com/inventory/v1/update", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${accessToken}`,
          "X-Source": "tokopedia",
          "X-Tkpd-Lite-Service": "patron",
        },
        body: JSON.stringify({
          product_id: marketplaceProductId,
          stock: quantity,
        }),
      });

      const data = await response.json();
      return {
        success: data?.data?.updated === 1,
        error: data?.data?.updated !== 1 ? data?.message : undefined,
      };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : "Stock update failed",
      };
    }
  }

  async updatePrice(
    accessToken: string,
    marketplaceProductId: string,
    price: number
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const response = await fetch("https://api.tokopedia.com/inventory/v1/update", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${accessToken}`,
          "X-Source": "tokopedia",
          "X-Tkpd-Lite-Service": "patron",
        },
        body: JSON.stringify({
          product_id: marketplaceProductId,
          price,
        }),
      });

      const data = await response.json();
      return {
        success: data?.data?.updated === 1,
        error: data?.data?.updated !== 1 ? data?.message : undefined,
      };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : "Price update failed",
      };
    }
  }

  async fetchOrders(
    accessToken: string,
    since?: string,
    page = 0
  ): Promise<{ orders: MarketplaceOrder[]; total: number }> {
    try {
      const params = new URLSearchParams({
        page: String(page + 1),
        per_page: "20",
        status: "1,2,3,4,5",
      });

      if (since) {
        params.set("order_date_from", since);
      }

      const response = await fetch(
        `https://api.tokopedia.com/order/v2/get?${params.toString()}`,
        {
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${accessToken}`,
            "X-Source": "tokopedia",
            "X-Tkpd-Lite-Service": "patron",
          },
        }
      );

      const data = await response.json();
      const orders = data?.data?.orders || [];

      return {
        orders: orders.map((order: any) => ({
          marketplace_order_id: String(order.id),
          buyer_name: order.buyer?.name || "",
          buyer_address: order.buyer?.address?.address || "",
          buyer_phone: order.buyer?.phone || "",
          shipping_method: order.shipping?.service || "",
          tracking_number: order.shipping?.tracking_number || "",
          items: (order.products || []).map((item: any) => ({
            product_name: item.name || "",
            marketplace_sku: item.sku || "",
            quantity: item.quantity || 0,
            unit_price: item.price || 0,
            subtotal: (item.price || 0) * (item.quantity || 0),
          })),
          subtotal: order.subtotal || 0,
          shipping_fee: order.shipping_cost || 0,
          total_amount: order.total_amount || 0,
          order_status: this.mapOrderStatus(order.status),
          payment_status: order.payment?.status === "settlement" ? "paid" : "pending",
          payment_method: order.payment?.method || "",
          marketplace_created_at: order.order_date || "",
          raw_data: order,
        })),
        total: data?.data?.total_data || 0,
      };
    } catch (err) {
      console.error("[TokopediaProvider] fetchOrders error:", err);
      return { orders: [], total: 0 };
    }
  }

  private mapOrderStatus(status: number): string {
    const statusMap: Record<number, string> = {
      1: "pending",
      2: "processing",
      3: "shipped",
      4: "delivered",
      5: "completed",
      6: "cancelled",
      7: "returned",
    };
    return statusMap[status] || "pending";
  }
}
