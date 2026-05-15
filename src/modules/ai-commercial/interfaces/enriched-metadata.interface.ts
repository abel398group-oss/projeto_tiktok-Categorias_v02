import type { AiCommercial } from "./ai-commercial.interface";

export interface ExportLocalMetadata {
  productId: string;
  sellerId: string | null;
  nome: string;
  categoria: string | null;
  link: string;
  links?: { web?: string; mobile?: string };
  exportedAt: string;
  timestamps?: Record<string, unknown>;
  product?: Record<string, unknown>;
  description?: string | null;
  images?: Record<string, unknown>;
  analytics?: Record<string, unknown>;
  assets?: Record<string, unknown>;
  content?: Record<string, unknown>;
  context?: Record<string, unknown>;
}

export interface EnrichedMetadata extends ExportLocalMetadata {
  aiCommercial?: AiCommercial;
}

