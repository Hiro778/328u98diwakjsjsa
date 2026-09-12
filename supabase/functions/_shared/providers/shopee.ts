// Shopee Open Platform Provider
// Documentation: https://open.shopee.com/developer-guide/auth
//
// Env vars required:
//   SHOPEE_PARTNER_ID - Partner ID from Shopee Open Platform
//   SHOPEE_PARTNER_KEY - Partner Key (secret) for HMAC signing
//   SHOPEE_REDIRECT_URI - OAuth callback URL
//   SHOPEE_API_BASE - API base URL (default: https://partner.shopee.co.id/api/v2)
//
// Auth flow: Shopee uses partner_id + partner_key, NOT app_id/app_secret.
// Every API call requires HMAC-SHA256 signature.
// Token lifetime: ~4 hours (access), ~30 days (refresh).

import type {
  MarketplaceProvider,
  OAuthConfig,
  OAuthExchangeResult,
  OAuthRefreshResult,
  ShopInfo,
  MarketplaceProduct,
  MarketplaceOrder,
} from "../types.ts";

const API_BASE = Deno.env.get("SHOPEE_API_BASE") || "https://partner.shopee.co.id/api/v2";

// HMAC-SHA256 signing for Shopee API requests
async function signRequest(
  partnerKey: string,
  partnerId: string,
  accessToken: string,
  path: string,
  timestamp: string
): Promise<string> {
  const signString = `${partnerId}${accessToken}${path}${timestamp}`;
  const encoder = new TextEncoder();
  const keyData = encoder.encode(partnerKey);
  const messageData = encoder.encode(signString);

  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    keyData,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const signature = await crypto.subtle.sign("HMAC", cryptoKey, messageData);
  return Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export class ShopeeProvider implements MarketplaceProvider {
  name = "shopee";

  isConfigured(): boolean {
    return !!(
      Deno.env.get("SHOPEE_PARTNER_ID") &&
      Deno.env.get("SHOPEE_PARTNER_KEY") &&
      Deno.env.get("SHOPEE_REDIRECT_URI")
    );
  }

  getOAuthConfig(): OAuthConfig {
    const partnerId = Deno.env.get("SHOPEE_PARTNER_ID")!;
    const redirectUri = Deno.env.get("SHOPEE_REDIRECT_URI")!;

    // Shopee authorization: seller authorizes via partner portal
    // The exact URL depends on Shopee's partner portal setup
    return {
      authorization_url: `https://partner.shopee.co.id/merchant/login?partner_id=${partnerId}&redirect=${encodeURIComponent(redirectUri)}`,
      token_url: `${API_BASE}/auth/token/get`,
      scopes: ["shop_info", "product", "order"],
    };
  }

  async exchangeCode(code: string, state: string): Promise<OAuthExchangeResult> {
    try {
      const partnerId = Deno.env.get("SHOPEE_PARTNER_ID")!;
      const partnerKey = Deno.env.get("SHOPEE_PARTNER_KEY")!;

      // Shopee token exchange requires partner_id, code, and shop_id
      const timestamp = String(Math.floor(Date.now() / 1000));
      const path = "/auth/token/get";

      const response = await fetch(`${API_BASE}/auth/token/get`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Partner-ID": partnerId,
          "Timestamp": timestamp,
          "Sign": await signRequest(partnerKey, partnerId, "", path, timestamp),
        },
        body: JSON.stringify({
          code,
          shop_id: state, // Shopee passes shop_id as state
          partner_id: partnerId,
        }),
      });

      const data = await response.json();

      if (!data.access_token) {
        return {
          success: false,
          error: data.message || "Failed to exchange authorization code",
        };
      }

      // Get shop info
      const shopInfo = await this.getShopInfo(data.access_token, data.shop_id);

      return {
        success: true,
        tokens: {
          access_token: data.access_token,
          refresh_token: data.refresh_token,
          token_type: "bearer",
          expires_in: data.expire_in || 14400, // ~4 hours
          scope: data.scope || "",
        },
        shop_info: shopInfo,
      };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : "Shopee token exchange failed",
      };
    }
  }

  async refreshToken(refreshToken: string): Promise<OAuthRefreshResult> {
    try {
      const partnerId = Deno.env.get("SHOPEE_PARTNER_ID")!;
      const partnerKey = Deno.env.get("SHOPEE_PARTNER_KEY")!;

      const timestamp = String(Math.floor(Date.now() / 1000));
      const path = "/auth/access_token/get";

      const response = await fetch(`${API_BASE}/auth/access_token/get`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Partner-ID": partnerId,
          "Timestamp": timestamp,
          "Sign": await signRequest(partnerKey, partnerId, "", path, timestamp),
        },
        body: JSON.stringify({
          refresh_token: refreshToken,
          partner_id: partnerId,
        }),
      });

      const data = await response.json();

      if (!data.access_token) {
        return {
          success: false,
          error: data.message || "Token refresh failed",
        };
      }

      return {
        success: true,
        tokens: {
          access_token: data.access_token,
          refresh_token: data.refresh_token,
          token_type: "bearer",
          expires_in: data.expire_in || 14400,
        },
      };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : "Token refresh failed",
      };
    }
  }

  async getShopInfo(accessToken: string, shopId?: string): Promise<ShopInfo> {
    try {
      const partnerId = Deno.env.get("SHOPEE_PARTNER_ID")!;
      const partnerKey = Deno.env.get("SHOPEE_PARTNER_KEY")!;

      const timestamp = String(Math.floor(Date.now() / 1000));
      const path = "/shop/get_shop_info";

      const response = await fetch(`${API_BASE}/shop/get_shop_info`, {
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${accessToken}`,
          "Partner-ID": partnerId,
          "Timestamp": timestamp,
          "Sign": await signRequest(partnerKey, partnerId, accessToken, path, timestamp),
        },
      });

      const data = await response.json();
      const shop = data?.response || {};

      return {
        shop_id: String(shop.shopid || shopId || ""),
        shop_name: shop.name || "",
        shop_url: shop.url ? `https://shopee.co.id/shop/${shop.url}` : "",
        shop_username: shop.account?.username || "",
        shop_email: shop.account?.email || "",
        shop_verified: shop.shop_play_flags?.is_official_shop || false,
      };
    } catch (err) {
      console.error("[ShopeeProvider] getShopInfo error:", err);
      return {
        shop_id: shopId || "",
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
      const partnerId = Deno.env.get("SHOPEE_PARTNER_ID")!;
      const partnerKey = Deno.env.get("SHOPEE_PARTNER_KEY")!;

      const timestamp = String(Math.floor(Date.now() / 1000));
      const path = "/product/get_item_list";

      const response = await fetch(
        `${API_BASE}/product/get_item_list?status=1&offset=${page * limit}&limit=${limit}`,
        {
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${accessToken}`,
            "Partner-ID": partnerId,
            "Timestamp": timestamp,
            "Sign": await signRequest(partnerKey, partnerId, accessToken, path, timestamp),
          },
        }
      );

      const data = await response.json();
      const items = data?.response?.item || [];

      return {
        products: items.map((item: any) => ({
          marketplace_product_id: String(item.itemid),
          name: item.name || "",
          sku: item.item_sku || "",
          price: item.price / 100000, // Shopee prices in cents
          stock: item.stock || 0,
          image_url: item.images?.[0] || "",
          category: item.category?.name || "",
          status: item.status === 1 ? "active" : "inactive",
        })),
        total: data?.response?.total || 0,
      };
    } catch (err) {
      console.error("[ShopeeProvider] fetchProducts error:", err);
      return { products: [], total: 0 };
    }
  }

  async updateStock(
    accessToken: string,
    marketplaceProductId: string,
    quantity: number
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const partnerId = Deno.env.get("SHOPEE_PARTNER_ID")!;
      const partnerKey = Deno.env.get("SHOPEE_PARTNER_KEY")!;

      const timestamp = String(Math.floor(Date.now() / 1000));
      const path = "/product/update_stock";

      const response = await fetch(`${API_BASE}/product/update_stock`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${accessToken}`,
          "Partner-ID": partnerId,
          "Timestamp": timestamp,
          "Sign": await signRequest(partnerKey, partnerId, accessToken, path, timestamp),
        },
        body: JSON.stringify({
          itemid: marketplaceProductId,
          stock: quantity,
        }),
      });

      const data = await response.json();
      return {
        success: data?.error === 0,
        error: data?.error !== 0 ? data?.message : undefined,
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
      const partnerId = Deno.env.get("SHOPEE_PARTNER_ID")!;
      const partnerKey = Deno.env.get("SHOPEE_PARTNER_KEY")!;

      const timestamp = String(Math.floor(Date.now() / 1000));
      const path = "/product/update_price";

      const response = await fetch(`${API_BASE}/product/update_price`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${accessToken}`,
          "Partner-ID": partnerId,
          "Timestamp": timestamp,
          "Sign": await signRequest(partnerKey, partnerId, accessToken, path, timestamp),
        },
        body: JSON.stringify({
          itemid: marketplaceProductId,
          price: Math.round(price * 100000), // Convert to Shopee format
        }),
      });

      const data = await response.json();
      return {
        success: data?.error === 0,
        error: data?.error !== 0 ? data?.message : undefined,
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
      const partnerId = Deno.env.get("SHOPEE_PARTNER_ID")!;
      const partnerKey = Deno.env.get("SHOPEE_PARTNER_KEY")!;

      const timestamp = String(Math.floor(Date.now() / 1000));
      const path = "/order/get_order_list";

      const params = new URLSearchParams({
        page_number: String(page),
        page_size: "20",
        status: "11,12,13,14",
      });

      if (since) {
        params.set("create_time_from", String(Math.floor(new Date(since).getTime() / 1000)));
      }

      const response = await fetch(
        `${API_BASE}/order/get_order_list?${params.toString()}`,
        {
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${accessToken}`,
            "Partner-ID": partnerId,
            "Timestamp": timestamp,
            "Sign": await signRequest(partnerKey, partnerId, accessToken, path, timestamp),
          },
        }
      );

      const data = await response.json();
      const orders = data?.response?.order_list || [];

      return {
        orders: orders.map((order: any) => ({
          marketplace_order_id: String(order.orderid),
          buyer_name: order.recipient_address?.name || "",
          buyer_address: order.recipient_address?.full_address || "",
          buyer_phone: order.recipient_address?.phone || "",
          shipping_method: order.shipping_method || "",
          tracking_number: order.tracking_number || "",
          items: (order.item_list || []).map((item: any) => ({
            product_name: item.item_name || "",
            marketplace_sku: item.model_sku || "",
            quantity: item.quantity || 0,
            unit_price: (item.model_original_price || 0) / 100000,
            subtotal: (item.model_discounted_price || 0) / 100000 * (item.quantity || 1),
          })),
          subtotal: (order.subtotal || 0) / 100000,
          shipping_fee: (order.shipping_fee || 0) / 100000,
          total_amount: (order.total_amount || 0) / 100000,
          order_status: this.mapOrderStatus(order.status),
          payment_status: order.payment_status === 1 ? "paid" : "pending",
          payment_method: order.payment_method || "",
          marketplace_created_at: new Date((order.create_time || 0) * 1000).toISOString(),
          raw_data: order,
        })),
        total: data?.response?.total || 0,
      };
    } catch (err) {
      console.error("[ShopeeProvider] fetchOrders error:", err);
      return { orders: [], total: 0 };
    }
  }

  private mapOrderStatus(status: number): string {
    const statusMap: Record<number, string> = {
      1: "pending",
      2: "processing",
      3: "shipped",
      4: "completed",
      5: "cancelled",
      9: "completed",
    };
    return statusMap[status] || "pending";
  }
}
