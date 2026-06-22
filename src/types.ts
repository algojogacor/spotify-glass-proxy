export interface Track {
  id: string;
  title: string;
  artist: string;
  thumbnail: string;
  duration: number;
}

export interface InvidiousVideo {
  videoId: string;
  title: string;
  author: string;
  authorId: string;
  lengthSeconds: number;
  videoThumbnails: Array<{ url: string; width: number; height: number }>;
}

export interface InvidiousSearchResponse {
  items?: InvidiousVideo[];
  results?: InvidiousVideo[];
  videos?: InvidiousVideo[];
}

export interface InvidiousAdaptiveFormat {
  url: string;
  itag: string;
  type: string;
  bitrate: string;
  container: string;
  encoding: string;
  audioChannels?: number;
  audioQuality?: string;
}

export interface InvidiousStreamResponse {
  title: string;
  author: string;
  lengthSeconds: number;
  videoThumbnails: Array<{ url: string }>;
  adaptiveFormats: InvidiousAdaptiveFormat[];
  formatStreams?: InvidiousAdaptiveFormat[];
  hls?: string;
}
