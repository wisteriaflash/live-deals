export type DealOrigin = "poll" | "inbox";

export type DealInput = {
  fingerprint: string;
  brand: string;
  title: string;
  summary: string;
  url: string | null;
  city: string;
  origin: DealOrigin;
};

export type SourceConfig = {
  id: string;
  url: string;
  brandHint?: string;
  enabled: boolean;
};
