export interface SpaceImage {
  id: string;
  nasaId?: string;
  source?: string;

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
