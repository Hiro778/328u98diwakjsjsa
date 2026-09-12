// _shared/marketplace-provider.ts
// Provider registry — returns the correct provider for a marketplace.

import type { MarketplaceProvider } from "./types.ts";
import { ShopeeProvider } from "./providers/shopee.ts";
import { TokopediaProvider } from "./providers/tokopedia.ts";
import { TikTokShopProvider } from "./providers/tiktokshop.ts";

const providers: Record<string, MarketplaceProvider> = {
  shopee: new ShopeeProvider(),
  tokopedia: new TokopediaProvider(),
  tiktokshop: new TikTokShopProvider(),
};

export function getProvider(marketplace: string): MarketplaceProvider {
  const provider = providers[marketplace];
  if (!provider) {
    throw new Error(`Unknown marketplace: ${marketplace}`);
  }
  return provider;
}

export function getSupportedMarketplaces(): string[] {
  return Object.keys(providers);
}
