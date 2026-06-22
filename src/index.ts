import express, { type Request, type Response } from 'express';
import cors from 'cors';
import { searchInvidious, getStreamInfo } from './invidious.js';

const app = express();
const PORT = parseInt(process.env.PORT || '3000', 10);

app.use(cors());
app.use(express.json());

app.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', uptime: process.uptime() });
});

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

app.get('/stream/:videoId', async (req: Request, res: Response) => {
  const videoId = req.params.videoId as string;
  if (!videoId) {
    res.status(400).json({ error: 'Missing videoId' });
    return;
  }

  try {
    const { audioUrl, title } = await getStreamInfo(videoId);
    console.log(`Proxying stream: "${title}" (${videoId})`);

    const upstream = await fetch(audioUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; SpotifyGlassProxy/1.0)',
      },
    });

    if (!upstream.ok || !upstream.body) {
      res.status(502).json({ error: `Upstream returned ${upstream.status}` });
      return;
    }

    const contentType = upstream.headers.get('content-type') || 'audio/webm';
    const contentLength = upstream.headers.get('content-length');
    res.setHeader('Content-Type', contentType);
    if (contentLength) res.setHeader('Content-Length', contentLength);
    res.setHeader('Cache-Control', 'no-cache');

    const reader = upstream.body.getReader();
    res.on('close', () => reader.cancel());

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        res.write(value);
      }
    } catch (streamErr) {
      console.error('Stream interrupted:', streamErr);
    } finally {
      res.end();
    }
  } catch (err) {
    console.error('Stream error:', err);
    if (!res.headersSent) {
      res.status(502).json({ error: 'Failed to resolve stream' });
    }
  }
});

app.listen(PORT, () => {
  console.log(`spotify-glass-proxy listening on port ${PORT}`);
});
