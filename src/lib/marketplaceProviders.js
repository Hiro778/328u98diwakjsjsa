// src/lib/marketplaceProviders.js
// Single Source of Truth for Marketplace Integrations in BisnisSehat.
// Conforms strictly to apps.md specifications:
// "Official API exists" !== "BisnisSehat integration is available"

export const PROVIDER_STATUS = {
  READY: 'READY',
  REQUIRES_APPROVAL: 'REQUIRES_APPROVAL',
  IMPLEMENTATION_REQUIRED: 'IMPLEMENTATION_REQUIRED',
  NOT_INTEGRATABLE: 'NOT_INTEGRATABLE',
  UNKNOWN: 'UNKNOWN',
};

export const MARKETPLACE_REGISTRY = {
  shopee: {
    id: 'shopee',
    name: 'Shopee',
    officialApi: 'Shopee Open Platform v2',
    officialApiUrl: 'https://open.shopee.co.id/document',
    connectorFile: 'supabase/functions/_shared/providers/shopee.ts',
    status: PROVIDER_STATUS.READY,
    color: '#EE4D2D',
    description: 'Marketplace e-commerce dengan integrasi Shopee Open Platform via HMAC-SHA256.',
    capabilities: {
      oauth: true,
      productSync: true,
      inventorySync: true,
      orderSync: true,
      webhook: false, // Requires Open Platform push service verification
    },
    benefits: [
      'Sinkronisasi katalog & stok otomatis',
      'Tarik pesanan langsung ke kasir/antrean',
      'Otorisasi seller via Shopee Open Platform',
    ],
  },
  tokopedia_shop: {
    id: 'tokopedia_shop',
    name: 'Tokopedia & Shop',
    officialApi: 'TikTok Shop Partner API / Tokopedia Developer API',
    officialApiUrl: 'https://partner.tiktokshop.com/',
    connectorFile: 'supabase/functions/_shared/providers/tiktokshop.ts',
    status: PROVIDER_STATUS.READY,
    color: '#111827', // Neutral dark matching Tokopedia & TikTok Shop unified brand
    secondaryColor: '#42B549',
    description: 'Integrasi terpadu Tokopedia & TikTok Shop Indonesia via Partner API resmi.',
    capabilities: {
      oauth: true,
      productSync: true,
      inventorySync: true,
      orderSync: true,
      webhook: false,
    },
    benefits: [
      'Ekosistem gabungan Tokopedia & TikTok Shop',
      'Sinkronisasi stok multi-channel real-time',
      'Otorisasi seller terpusat via Partner API',
    ],
  },
  lazada: {
    id: 'lazada',
    name: 'Lazada',
    officialApi: 'Lazada Open Platform',
    officialApiUrl: 'https://open.lazada.com/',
    connectorFile: null,
    status: PROVIDER_STATUS.IMPLEMENTATION_REQUIRED,
    color: '#0F146D',
    description: 'Lazada Open Platform tersedia secara resmi. Connector BisnisSehat dalam tahap perancangan.',
    capabilities: {
      oauth: false,
      productSync: false,
      inventorySync: false,
      orderSync: false,
      webhook: false,
    },
    benefits: [
      'API resmi tersedia di Open Platform',
      'Konektivitas regional Asia Tenggara (rencana)',
    ],
  },
  blibli: {
    id: 'blibli',
    name: 'Blibli',
    officialApi: 'Blibli Seller API / Enabler',
    officialApiUrl: 'https://developer.blibli.com/',
    connectorFile: null,
    status: PROVIDER_STATUS.IMPLEMENTATION_REQUIRED,
    color: '#0072FF',
    description: 'Blibli Seller API tersedia untuk partner resmi. Connector BisnisSehat belum diimplementasikan.',
    capabilities: {
      oauth: false,
      productSync: false,
      inventorySync: false,
      orderSync: false,
      webhook: false,
    },
    benefits: [
      'API resmi tersedia via Blibli Developer',
      'Ekosistem e-commerce lokal B2C/B2B (rencana)',
    ],
  },
};

/**
 * Returns list of all providers in the registry
 */
export function getAllMarketplaceProviders() {
  return Object.values(MARKETPLACE_REGISTRY);
}

/**
 * Returns providers that are strictly READY (connector implemented + tested).
 * Only these providers count toward availableCount.
 */
export function getReadyMarketplaceProviders() {
  return Object.values(MARKETPLACE_REGISTRY).filter(
    (p) => p.status === PROVIDER_STATUS.READY
  );
}

/**
 * Returns count of marketplaces with READY status.
 */
export function getAvailableMarketplacesCount() {
  return getReadyMarketplaceProviders().length;
}

/**
 * Returns count of READY marketplaces that actually have an active connection.
 * Non-READY providers are NEVER counted as connected.
 */
export function getConnectedMarketplacesCount(connections = []) {
  const readyKeys = new Set(['shopee', 'tokopedia', 'tiktokshop', 'tokopedia_shop']);
  
  return connections.filter(
    (c) => c.status === 'connected' && readyKeys.has(c.marketplace)
  ).length;
}

/**
 * Resolves connection record for a provider, taking into account aliases
 * (e.g. tokopedia_shop can resolve connection from 'tokopedia' or 'tiktokshop').
 */
export function resolveConnectionForProvider(providerId, connectionMap = {}) {
  if (connectionMap[providerId]) {
    return connectionMap[providerId];
  }
  if (providerId === 'tokopedia_shop') {
    return connectionMap['tokopedia'] || connectionMap['tiktokshop'] || null;
  }
  return null;
}
