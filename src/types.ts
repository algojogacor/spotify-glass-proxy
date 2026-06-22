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
