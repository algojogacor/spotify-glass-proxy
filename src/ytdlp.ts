import { spawn } from 'child_process';
import type { Track, InvidiousSearchResponse, InvidiousVideo } from './types.js';

// ── Invidious search (metadata only) ────────────────────

const INSTANCES = [
  'https://invidious.fdn.fr',
  'https://inv.nadeko.net',
  'https://invidious.privacyredirect.com',
  'https://vid.puffyan.us',
  'https://invidious.nerdvpn.de',
  'https://yewtu.be',
  'https://invidious.tiekoetter.com',
];

const INVIDIOUS_TIMEOUT_MS = 4000;

async function raceAll<T>(path: string): Promise<{ data: T; instance: string }> {
  const controller = new AbortController();

  const requests = INSTANCES.map(async (instance) => {
    try {
      const signal = AbortSignal.any
        ? AbortSignal.any([controller.signal, AbortSignal.timeout(INVIDIOUS_TIMEOUT_MS)])
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

// ── yt-dlp stream URL resolver ──────────────────────────

const YTDLP_PATH = 'yt-dlp';
const YTDLP_TIMEOUT_MS = 15000;

/**
 * Run yt-dlp to extract the best audio stream URL for a YouTube video.
 * Spawns a child process with a 15-second timeout.
 * Returns the raw Google CDN URL (string).
 */
export function getStreamUrl(videoId: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn(YTDLP_PATH, [
      '--no-update',
      '-f', 'bestaudio',
      '--get-url',
      `https://www.youtube.com/watch?v=${videoId}`,
    ], { timeout: YTDLP_TIMEOUT_MS });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString(); });
    proc.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString(); });

    proc.on('close', (code: number | null) => {
      const url = stdout.trim().split('\n').pop() || '';
      if (url && url.startsWith('https://')) {
        resolve(url);
      } else {
        reject(new Error(
          `yt-dlp exited ${code}: ${stderr.slice(-300) || 'no output'}`
        ));
      }
    });

    proc.on('error', (err: Error) => {
      reject(new Error(`yt-dlp spawn failed: ${err.message}`));
    });
  });
}

/**
 * Get the yt-dlp binary version string.
 */
export function getYtDlpVersion(): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn(YTDLP_PATH, ['--version'], { timeout: 5000 });
    let stdout = '';
    proc.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString(); });
    proc.on('close', (code: number | null) => {
      if (code === 0) {
        resolve(stdout.trim());
      } else {
        reject(new Error(`yt-dlp --version exited ${code}`));
      }
    });
    proc.on('error', (err: Error) => {
      reject(new Error(`yt-dlp --version failed: ${err.message}`));
    });
  });
}
