import express, { type Request, type Response } from 'express';
import cors from 'cors';
import { searchInvidious, getStreamUrl, getYtDlpVersion } from './ytdlp.js';

const app = express();
const PORT = parseInt(process.env.PORT || '3000', 10);

app.use(cors());
app.use(express.json());

// Cache yt-dlp version at startup so /health is instant
let ytdlpVersion = 'unknown';
getYtDlpVersion()
  .then((v) => { ytdlpVersion = v; })
  .catch((err) => { console.error('Failed to get yt-dlp version:', err.message); });

// ── Health ──────────────────────────────────────────────

app.get('/health', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    uptime: process.uptime(),
    ytdlp: ytdlpVersion,
  });
});

// ── Search (Invidious — metadata only) ──────────────────

app.get('/search', async (req: Request, res: Response) => {
  const query = req.query.q as string;
  if (!query || query.trim().length === 0) {
    res.status(400).json({ error: 'Missing q parameter' });
    return;
  }

  try {
    const tracks = await searchInvidious(query.trim(), 20);
    res.json({ tracks, source: 'invidious' });
  } catch (err) {
    console.error('Search error:', err);
    res.status(502).json({ error: 'All Invidious instances failed', tracks: [] });
  }
});

// ── Stream (yt-dlp → proxy pipe) ────────────────────────

app.get('/stream/:videoId', async (req: Request, res: Response) => {
  const videoId = req.params.videoId as string;
  if (!videoId || videoId.length < 11) {
    res.status(400).json({ error: 'Invalid videoId' });
    return;
  }

  try {
    console.log(`[stream] Resolving URL for ${videoId} via yt-dlp...`);
    const audioUrl = await getStreamUrl(videoId);
    console.log(`[stream] Got URL, fetching bytes...`);

    // Fetch the audio from Google CDN server-side.
    // The client never sees this URL — we read bytes into memory then pipe.
    const upstream = await fetch(audioUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; JalaMusicProxy/1.0)',
        'Accept': 'audio/*',
      },
    });

    if (!upstream.ok || !upstream.body) {
      console.error(`[stream] Upstream fetch failed: ${upstream.status}`);
      res.status(502).json({ error: `Upstream returned ${upstream.status}` });
      return;
    }

    // Stream with chunked transfer encoding — client can start playing
    // before the full file is buffered.
    res.setHeader('Content-Type', 'audio/webm');
    res.setHeader('Transfer-Encoding', 'chunked');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.status(200);

    const reader = upstream.body.getReader();

    // Cancel upstream fetch if client disconnects early
    req.on('close', () => {
      console.log(`[stream] Client disconnected, cancelling upstream`);
      reader.cancel().catch(() => {});
    });

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        res.write(value);
      }
    } catch (pipeErr) {
      console.error('[stream] Pipe error:', pipeErr);
    } finally {
      res.end();
    }

    console.log(`[stream] Finished piping ${videoId}`);
  } catch (err) {
    console.error('[stream] Error:', err);
    if (!res.headersSent) {
      res.status(502).json({ error: 'Failed to resolve or proxy stream' });
    }
  }
});

// ── Start ───────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`spotify-glass-proxy listening on port ${PORT}`);
});
