import type { Track, InvidiousSearchResponse, InvidiousVideo, InvidiousStreamResponse, InvidiousAdaptiveFormat } from './types.js';

const INSTANCES = [
  'https://invidious.fdn.fr',
  'https://inv.nadeko.net',
  'https://invidious.privacyredirect.com',
  'https://vid.puffyan.us',
  'https://invidious.nerdvpn.de',
  'https://yewtu.be',
  'https://invidious.tiekoetter.com',
];

const TIMEOUT_MS = 4000;

async function raceAll<T>(path: string): Promise<{ data: T; instance: string }> {
  const controller = new AbortController();

  const requests = INSTANCES.map(async (instance) => {
    try {
      const signal = AbortSignal.any
        ? AbortSignal.any([controller.signal, AbortSignal.timeout(TIMEOUT_MS)])
        : controller.signal;

      const res = await fetch(`${instance}${path}`, { signal });
      if (!res.ok) throw new Error(`${res.status}`);
      const data = await res.json() as T;
      controller.abort();
      return { data, instance };
    } catch (err) {
      if ((err as Error).name === 'AbortError') throw err;
      return null;
    }
  });

  const result = await Promise.any(requests);
  if (result) return result!;

  throw new Error('All Invidious instances failed');
}

function mapToTrack(video: InvidiousVideo, _instance: string): Track {
  const thumbnail =
    video.videoThumbnails?.find((t) => t.width >= 320)?.url ||
    video.videoThumbnails?.[video.videoThumbnails.length - 1]?.url ||
    `https://i.ytimg.com/vi/${video.videoId}/hqdefault.jpg`;

  return {
    id: video.videoId,
    title: video.title,
    artist: video.author,
    thumbnail,
    duration: video.lengthSeconds,
  };
}

export async function searchInvidious(query: string, limit = 20): Promise<Track[]> {
  const path = `/api/v1/search?q=${encodeURIComponent(query)}&type=video&sort=relevance`;
  const result = await raceAll<InvidiousSearchResponse>(path);

  const items: InvidiousVideo[] =
    result.data.items ?? result.data.results ?? result.data.videos ?? [];

  return items.slice(0, limit).map((v) => mapToTrack(v, result.instance));
}

export async function getStreamInfo(videoId: string): Promise<{
  audioUrl: string;
  title: string;
  duration: number;
}> {
  const path = `/api/v1/videos/${encodeURIComponent(videoId)}`;
  const result = await raceAll<InvidiousStreamResponse>(path);

  const formats = result.data.adaptiveFormats || result.data.formatStreams || [];

  const audioFormat: InvidiousAdaptiveFormat | undefined =
    formats.find((f) => f.type?.includes('audio') && f.container === 'webm') ||
    formats.find((f) => f.type?.includes('audio') && f.container === 'mp4') ||
    formats.find((f) => f.type?.includes('audio'));

  if (!audioFormat?.url) {
    throw new Error(`No audio stream found for ${videoId}`);
  }

  return {
    audioUrl: audioFormat.url,
    title: result.data.title,
    duration: result.data.lengthSeconds,
  };
}
