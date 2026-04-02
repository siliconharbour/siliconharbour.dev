// =============================================================================
// Event Importer Types - Shared types for event import modules
// This file is client-safe (no server imports)
// =============================================================================

export interface FetchedEvent {
  externalId: string;
  title: string;
  description: string;
  location: string;
  link: string;
  organizer: string;
  startDate: string; // "YYYY-MM-DD"
  endDate: string; // "YYYY-MM-DD"
  startTime: string | null; // "HH:mm"
  endTime: string | null; // "HH:mm"
  coverImageUrl: string | null;
  timezone: string | null;
}

export interface ImportSourceConfig {
  id: number;
  groupId: number | null;
  sourceType: string;
  sourceIdentifier: string;
  sourceUrl: string;
}

export interface EventSyncResult {
  success: boolean;
  added: number;
  skipped: number;
  removed: number;
  error?: string;
}

export interface ValidationResult {
  valid: boolean;
  error?: string;
  eventCount?: number;
}

export interface EventImporter {
  /** The source type this importer handles */
  readonly sourceType: string;

  /**
   * Fetch all events from the source
   * @param config - The import source configuration
   * @returns Array of fetched events
   */
  fetchEvents(config: ImportSourceConfig): Promise<FetchedEvent[]>;

  /**
   * Validate that the configuration is correct and the source is accessible
   * @param config - The import source configuration (partial, without id)
   * @returns Validation result
   */
  validateConfig(
    config: Omit<ImportSourceConfig, "id">,
  ): Promise<ValidationResult>;
}

/**
 * Display labels for event source types
 */
export const sourceTypeLabels: Record<string, string> = {
  "luma-user": "Luma (User)",
  technl: "techNL",
  netbenefit: "NetBenefit Software",
};
