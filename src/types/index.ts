export type Nullable<T> = T | null;

export interface Advert {
  title: string;
  description: string;
  url: string;
  price: number;
  author: string;
  date: string; // ISO-8601
  phone: string;
}

export interface ScraperOptions {
  url: string;
  outputPath?: string;
  fileName?: string;
  auth?: boolean;
  pages?: number;
}
