import type {
  ConversationState,
  Lead,
  OperationType,
  Tenant,
} from '@prisma/client';
import type { ConversationMessage } from '../llm/llm-provider.interface';
import type { PropertyWithPhotos } from '../properties/property-search.service';
import type { ExtractionResult } from '../llm/extraction.schema';

export interface LeadFilters {
  fOperation: OperationType | null;
  fNeighborhoods: string[];
  fMaxPrice: number | null;
  fCurrency: string | null;
  fMinRooms: number | null;
  fGarage: boolean | null;
  fPetsAllowed: boolean | null;
  fNotes: string | null;
  /** Zonas aledañas sugeridas, pendientes de que el lead las acepte (§4). */
  fOfferedNeighborhoods: string[];
  /** Turno en el que se mencionó precio/moneda por última vez (ver isPriceStale). */
  fPriceMentionedAtTurn: number | null;
}

export interface HandlerContext {
  tenant: Tenant;
  lead: Lead;
  turnText: string;
  extraction: ExtractionResult;
  recentMessages: ConversationMessage[];
}

export type OutgoingAction =
  | { kind: 'text'; text: string }
  | { kind: 'property'; property: PropertyWithPhotos; index: number };

export interface HandlerResult {
  actions: OutgoingAction[];
  nextState: ConversationState;
  filterUpdates?: LeadFilters;
  /** "entre semana" | "sábado" | null — se completa solo al pasar a SCHEDULING. */
  preferredDay?: string | null;
  /** Marca que se mandó el saludo+aviso legal completo (se manda una sola vez por lead). */
  markGreeted?: boolean;
}
