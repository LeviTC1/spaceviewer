export interface SpaceImageDimensions {
  width?: number;
  height?: number;
  scaleArcsecPerPixel?: number;
  unit?: string;
}

export interface MetadataQuality {
  score: number;
  label: "Rich" | "Good" | "Limited";
  factors: string[];
  missing: string[];
}

export interface SpaceImage {
  id: string;
  nasaId?: string;
  source?: string;
  archiveId?: string;
  sourceUrl?: string;
  matchReason?: string;
  metadataQuality?: MetadataQuality;
  dimensions?: SpaceImageDimensions;

  title: string;
  description: string;
  keywords: string[];

  date: string;
  center?: string;
  mission?: string;
  instrument?: string;

  photographer?: string;

  imageUrl: string;
  thumbnailUrl?: string;
  fullRes?: string;
  archiveUrl?: string;

  raw?: unknown;
}
