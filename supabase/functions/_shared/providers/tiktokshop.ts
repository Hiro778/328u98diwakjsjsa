// TikTok Shop Partner API Provider
// Documentation: https://partner.tiktokshop.com/docv2/page/6507ead7b99d5302be949ba9
//
// Env vars required:
//   TIKTOKSHOP_APP_KEY - Application Key from TikTok Shop Developer Portal
//   TIKTOKSHOP_APP_SECRET - Application Secret from TikTok Shop Developer Portal
//   TIKTOKSHOP_REDIRECT_URI - OAuth callback URL
//   TIKTOKSHOP_API_BASE - API base URL (default: https://open-api.tiktokshop.com)
//
// Auth flow: Standard OAuth2 (authorization code grant).
// Token lifetime: ~24 hours (access).
// For Indonesia: authorization URL uses seller-id.tiktok.com

import type {
  MarketplaceProvider,
  OAuthConfig,
  OAuthExchangeResult,
  OAuthRefreshResult,
  ShopInfo,
  MarketplaceProduct,
  MarketplaceOrder,
} from "../types.ts";

const API_BASE = Deno.env.get("TIKTOKSHOP_API_BASE") || "https://open-api.tiktokshop.com";

export class TikTokShopProvider implements MarketplaceProvider {
  name = "tiktokshop";

  isConfigured(): boolean {
    return !!(
      Deno.env.get("TIKTOKSHOP_APP_KEY") &&
      Deno.env.get("TIKTOKSHOP_APP_SECRET") &&
      Deno.env.get("TIKTOKSHOP_REDIRECT_URI")
    );
  }

  getOAuthConfig(): OAuthConfig {
    const appKey = Deno.env.get("TIKTOKSHOP_APP_KEY")!;
    const redirectUri = Deno.env.get("TIKTOKSHOP_REDIRECT_URI")!;

    return {
      // Indonesia seller portal
      authorization_url: `https://seller-id.tiktok.com/authorization?app_key=${appKey}&state={state}&redirect_uri=${encodeURIComponent(redirectUri)}`,
      token_url: `${API_BASE}/api/v2/oauth/token`,
      scopes: [
        "product.read",
        "product.write",
        "order.read",
        "order.write",
        "fulfillment.read",
        "fulfillment.write",
        "finance.read",
        "analytics.read",
      ],
    };
  }

  async exchangeCode(code: string, state: string): Promise<OAuthExchangeResult> {
    try {
      const appKey = Deno.env.get("TIKTOKSHOP_APP_KEY")!;
      const appSecret = Deno.env.get("TIKTOKSHOP_APP_SECRET")!;

      // Exchange authorization code for access token
      const tokenResponse = await fetch(`${API_BASE}/api/v2/oauth/token`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          app_key: appKey,
          app_secret: appSecret,
          auth_code: code,
          grant_type: "authorization_code",
        }),
      });

      const tokenData = await tokenResponse.json();

      if (!tokenData?.data?.access_token) {
        return {
          success: false,
          error: tokenData?.message || "Failed to exchange authorization code",
        };
      }

      const tokens = tokenData.data;

      // Get shop info
      const shopInfo = await this.getShopInfo(tokens.access_token);

      return {
        success: true,
        tokens: {
          access_token: tokens.access_token,
          refresh_token: tokens.refresh_token,
          token_type: "bearer",
          expires_in: tokens.expires_in || 86400, // ~24 hours
          scope: tokens.scope || "",
        },
        shop_info: shopInfo,
      };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : "TikTok Shop token exchange failed",
      };
    }
  }

  async refreshToken(refreshToken: string): Promise<OAuthRefreshResult> {
    try {
      const appKey = Deno.env.get("TIKTOKSHOP_APP_KEY")!;
      const appSecret = Deno.env.get("TIKTOKSHOP_APP_SECRET")!;

      const response = await fetch(`${API_BASE}/api/v2/oauth/token`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          app_key: appKey,
          app_secret: appSecret,
          refresh_token: refreshToken,
          grant_type: "refresh_token",
        }),
      });

      const data = await response.json();

      if (!data?.data?.access_token) {
        return {
          success: false,
          error: data?.message || "Token refresh failed",
        };
      }

      const tokens = data.data;

      return {
        success: true,
        tokens: {
          access_token: tokens.access_token,
          refresh_token: tokens.refresh_token,
          token_type: "bearer",
          expires_in: tokens.expires_in || 86400,
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
      const response = await fetch(`${API_BASE}/api/v2/shop/get_shop_info`, {
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${accessToken}`,
          "X-Tt-Logid": crypto.randomUUID(),
        },
      });

      const data = await response.json();
      const shop = data?.data?.shop || {};

      return {
        shop_id: String(shop.shop_id || ""),
        shop_name: shop.shop_name || "",
        shop_url: shop.shop_url || "",
        shop_username: shop.shop_username || "",
        shop_email: shop.shop_email || "",
        shop_phone: shop.shop_phone || "",
        shop_avatar_url: shop.shop_avatar || "",
        shop_verified: shop.is_official || false,
      };
    } catch (err) {
      console.error("[TikTokShopProvider] getShopInfo error:", err);
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
        `${API_BASE}/api/v2/products/list?page_size=${limit}&page_token=${page === 0 ? "" : String(page * limit)}`,
        {
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${accessToken}`,
            "X-Tt-Logid": crypto.randomUUID(),
          },
        }
      );

      const data = await response.json();
      const items = data?.data?.products || [];

      return {
        products: items.map((item: any) => ({
          marketplace_product_id: String(item.product_id),
          name: item.title || "",
          sku: item.sku_list?.[0]?.seller_sku || "",
          price: parseFloat(item.sku_list?.[0]?.price?.original_price || "0"),
          stock: item.sku_list?.[0]?.stock || 0,
          image_url: item.main_images?.[0] || "",
          category: item.category?.name || "",
          status: item.status === "ACTIVATE" ? "active" : "inactive",
        })),
        total: data?.data?.total || 0,
      };
    } catch (err) {
      console.error("[TikTokShopProvider] fetchProducts error:", err);
      return { products: [], total: 0 };
    }
  }

  async updateStock(
    accessToken: string,
    marketplaceProductId: string,
    quantity: number
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const response = await fetch(`${API_BASE}/api/v2/products/stocks`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${accessToken}`,
          "X-Tt-Logid": crypto.randomUUID(),
        },
        body: JSON.stringify({
          product_id: marketplaceProductId,
          stock: quantity,
        }),
      });

      const data = await response.json();
      return {
        success: data?.code === 0,
        error: data?.code !== 0 ? data?.message : undefined,
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
      const response = await fetch(`${API_BASE}/api/v2/products/prices`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${accessToken}`,
          "X-Tt-Logid": crypto.randomUUID(),
        },
        body: JSON.stringify({
          product_id: marketplaceProductId,
          price: String(price),
        }),
      });

      const data = await response.json();
      return {
        success: data?.code === 0,
        error: data?.code !== 0 ? data?.message : undefined,
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
        page_size: "20",
        page_token: page === 0 ? "" : String(page * 20),
      });

      if (since) {
        params.set("create_time_from", String(Math.floor(new Date(since).getTime() / 1000)));
      }

      const response = await fetch(
        `${API_BASE}/api/v2/orders/list?${params.toString()}`,
        {
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${accessToken}`,
            "X-Tt-Logid": crypto.randomUUID(),
          },
        }
      );

      const data = await response.json();
      const orders = data?.data?.order_list || [];

      return {
        orders: orders.map((order: any) => ({
          marketplace_order_id: String(order.order_id),
          buyer_name: order.buyer?.user_name || "",
          buyer_address: order.shipping?.address?.full_address || "",
          buyer_phone: order.buyer?.phone || "",
          shipping_method: order.shipping?.provider || "",
          tracking_number: order.shipping?.tracking_number || "",
          items: (order.line_items || []).map((item: any) => ({
            product_name: item.product_name || "",
            marketplace_sku: item.sku_id || "",
            quantity: item.quantity || 0,
            unit_price: parseFloat(item.sale_price || "0"),
            subtotal: parseFloat(item.sale_price || "0") * (item.quantity || 0),
          })),
          subtotal: parseFloat(order.sub_total || "0"),
          shipping_fee: parseFloat(order.shipping_fee || "0"),
          total_amount: parseFloat(order.total_amount || "0"),
          order_status: this.mapOrderStatus(order.status),
          payment_status: order.payment?.payment_status || "pending",
          payment_method: order.payment?.payment_method || "",
          marketplace_created_at: new Date((order.create_time || 0) * 1000).toISOString(),
          raw_data: order,
        })),
        total: data?.data?.total || 0,
      };
    } catch (err) {
      console.error("[TikTokShopProvider] fetchOrders error:", err);
      return { orders: [], total: 0 };
    }
  }

  private mapOrderStatus(status: string): string {
    const statusMap: Record<string, string> = {
      "UNPAID": "pending",
      "AWAITING_SHIPMENT": "processing",
      "AWAITING_COLLECTION": "processing",
      "IN_TRANSIT": "shipped",
      "DELIVERED": "delivered",
      "COMPLETED": "completed",
      "CANCELLED": "cancelled",
      "RETURNED": "returned",
    };
    return statusMap[status] || "pending";
  }
}
