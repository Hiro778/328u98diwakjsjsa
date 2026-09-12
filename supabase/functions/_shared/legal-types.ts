// _shared/legal-types.ts
// Shared types for Legal & Brand Checker Edge Functions

// ══════════════════════════════════════════════════════════
// Multi-Source Check Types
// ══════════════════════════════════════════════════════════

export type LegalSourceKey = 'oss' | 'ahu' | 'djki' | 'bpom' | 'bpjph';

export type LegalSourceStatus =
  | 'DITEMUKAN'
  | 'TIDAK_DITEMUKAN'
  | 'PERLU_DITINJAU'
  | 'TIDAK_RELEVAN'
  | 'GAGAL_DIPERIKSA';

export interface LegalCheckInput {
  businessName: string;
  brandName?: string;
  nibNumber?: string;
  productCategory?: string;
}

export interface LegalSourceResult {
  source: LegalSourceKey;
  status: LegalSourceStatus;
  result_summary: string;
  result_detail: Record<string, unknown>;
  portal_link: string;
  checked_at: string;
  error_message?: string;
}

// ══════════════════════════════════════════════════════════
// Logo Check Types
// ══════════════════════════════════════════════════════════

export type LogoMatchType =
  | 'exact_match'
  | 'partial_match'
  | 'visually_similar'
  | 'web_page_match';

export type LogoOverallStatus = 'CHECKING' | 'CLEAN' | 'HAS_SIMILARITY' | 'ERROR';

export interface LogoCheckInput {
  imageUrl: string;
  businessName?: string;
}

export interface LogoMatchResult {
  type: LogoMatchType;
  similarity?: number;
  name: string;
  description?: string;
  url?: string;
  thumbnail_url?: string;
}

// ══════════════════════════════════════════════════════════
// Google Cloud Vision Types
// ══════════════════════════════════════════════════════════

export interface VisionWebEntity {
  description: string;
  score: number;
  boundingPoly?: unknown;
}

export interface VisionWebDetection {
  fullMatchingImages?: Array<{ url: string }>;
  partialMatchingImages?: Array<{ url: string }>;
  visuallySimilarImages?: Array<{ url: string }>;
  webEntities?: VisionWebEntity[];
  pagesWithMatchingImages?: Array<{ url: string; pageTitle?: string }>;
}

// ══════════════════════════════════════════════════════════
// Portal Links
// ══════════════════════════════════════════════════════════

export const PORTAL_LINKS: Record<LegalSourceKey, string> = {
  oss: 'https://oss.go.id',
  ahu: 'https://ahu.go.id',
  djki: 'https://djki.go.id',
  bpom: 'https://pom.go.id',
  bpjph: 'https://halal.go.id',
};

// Product categories that trigger BPOM check
export const BPOM_RELEVANT_CATEGORIES = [
  'makanan',
  'minuman',
  'obat',
  'kosmetik',
  'suplemen',
  'pangan',
  'produk',
];
