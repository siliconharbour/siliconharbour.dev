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
  organizer: string | null;
  sourceType: string;
  sourceIdentifier: string;
  sourceUrl: string;
  knownExternalIds?: Set<string>;
}

export interface EventSyncResult {
  success: boolean;
  added: number;
  skipped: number;
  removed: number;
  error?: string;
  rateLimited?: boolean;
}

export interface ValidationResult {
  valid: boolean;
  error?: string;
  eventCount?: number;
}

export interface EventFetchResult {
  events: FetchedEvent[];
  complete: boolean;
  futureOnly: boolean;
}

export interface EventImporter {
  readonly sourceType: string;

  fetchEvents(config: ImportSourceConfig): Promise<FetchedEvent[] | EventFetchResult>;

  validateConfig(config: Omit<ImportSourceConfig, "id">): Promise<ValidationResult>;
}

export const sourceTypeLabels: Record<string, string> = {
  "luma-user": "Luma (User)",
  "luma-calendar": "Luma (Calendar)",
  technl: "techNL",
  netbenefit: "NetBenefit Software",
  eventbrite: "Eventbrite (Organizer)",
  bevy: "Bevy (GDG/Community)",
  meetup: "Meetup",
};
