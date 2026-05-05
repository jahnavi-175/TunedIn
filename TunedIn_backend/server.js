const express = require('express');
const cors = require('cors');
const axios = require('axios');
const session = require('express-session');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// ─── Middleware ───────────────────────────────────────────────────────────────

app.set('trust proxy', 1);

app.use(express.json());

// Serve the frontend static files
app.use(express.static(path.join(__dirname, '../TunedIn_frontend')));

app.use(cors({
  origin: process.env.FRONTEND_URL,
  credentials: true,
}));

app.use(session({
  secret: process.env.SESSION_SECRET || 'dev-secret',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: true,    
    httpOnly: true,
    sameSite: 'none',  
    maxAge: 1000 * 60 * 60 * 24, 
  },
}));

// ─── Utility ──────────────────────────────────────────────────────────────────

const delay = (ms) => new Promise((r) => setTimeout(r, ms));

// ─── Health check ─────────────────────────────────────────────────────────────

app.get('/', (req, res) => res.json({ status: 'TunePort backend running' }));

// ─────────────────────────────────────────────────────────────────────────────
// SPOTIFY AUTH
// ─────────────────────────────────────────────────────────────────────────────

// 1. Redirect user to Spotify login page
app.get('/auth/spotify', (req, res) => {
  const scopes = [
    'playlist-read-private',
    'playlist-read-collaborative',
    'playlist-modify-public',
    'playlist-modify-private',
  ].join(' ');

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: process.env.SPOTIFY_CLIENT_ID,
    scope: scopes,
    redirect_uri: process.env.SPOTIFY_REDIRECT_URI,
    state: Math.random().toString(36).substring(2),
  });

  res.redirect('https://accounts.spotify.com/authorize?' + params.toString());
});

// 2. Spotify sends user back here with a code — exchange it for tokens
app.get('/auth/spotify/callback', async (req, res) => {
  const { code, error } = req.query;

  if (error) {
    return res.redirect(`${process.env.FRONTEND_URL}?error=spotify_denied`);
  }

  try {
    const response = await axios.post(
      'https://accounts.spotify.com/api/token',
      new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: process.env.SPOTIFY_REDIRECT_URI,
      }),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Authorization:
            'Basic ' +
            Buffer.from(
              `${process.env.SPOTIFY_CLIENT_ID}:${process.env.SPOTIFY_CLIENT_SECRET}`
            ).toString('base64'),
        },
      }
    );

    // Save tokens in the user's session (server-side, never sent to browser)
    req.session.spotify = {
      access_token: response.data.access_token,
      refresh_token: response.data.refresh_token,
      expires_at: Date.now() + response.data.expires_in * 1000,
    };

    res.redirect(`${process.env.FRONTEND_URL}?connected=spotify`);
  } catch (err) {
    console.error('Spotify token exchange failed:', err.response?.data || err.message);
    res.redirect(`${process.env.FRONTEND_URL}?error=spotify_failed`);
  }
});

// Auto-refresh Spotify token if expired
async function getSpotifyToken(req) {
  const sp = req.session.spotify;
  if (!sp) throw new Error('Not connected to Spotify');

  if (Date.now() < sp.expires_at - 60000) {
    return sp.access_token; // still valid
  }

  // Refresh it
  const response = await axios.post(
    'https://accounts.spotify.com/api/token',
    new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: sp.refresh_token,
    }),
    {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Authorization:
          'Basic ' +
          Buffer.from(
            `${process.env.SPOTIFY_CLIENT_ID}:${process.env.SPOTIFY_CLIENT_SECRET}`
          ).toString('base64'),
      },
    }
  );

  req.session.spotify.access_token = response.data.access_token;
  req.session.spotify.expires_at = Date.now() + response.data.expires_in * 1000;
  return response.data.access_token;
}

// ─────────────────────────────────────────────────────────────────────────────
// GOOGLE / YOUTUBE AUTH
// ─────────────────────────────────────────────────────────────────────────────

// 1. Redirect user to Google login page
app.get('/auth/google', (req, res) => {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: process.env.GOOGLE_CLIENT_ID,
    scope: 'https://www.googleapis.com/auth/youtube',
    redirect_uri: process.env.GOOGLE_REDIRECT_URI,
    access_type: 'offline',
    prompt: 'consent',
    state: Math.random().toString(36).substring(2),
  });

  res.redirect('https://accounts.google.com/o/oauth2/v2/auth?' + params.toString());
});

// 2. Google sends user back here with a code — exchange it for tokens
app.get('/auth/google/callback', async (req, res) => {
  const { code, error } = req.query;

  if (error) {
    return res.redirect(`${process.env.FRONTEND_URL}?error=google_denied`);
  }

  try {
    const response = await axios.post(
      'https://oauth2.googleapis.com/token',
      new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: process.env.GOOGLE_REDIRECT_URI,
        client_id: process.env.GOOGLE_CLIENT_ID,
        client_secret: process.env.GOOGLE_CLIENT_SECRET,
      }),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );

    req.session.youtube = {
      access_token: response.data.access_token,
      refresh_token: response.data.refresh_token,
      expires_at: Date.now() + response.data.expires_in * 1000,
    };

    res.redirect(`${process.env.FRONTEND_URL}?connected=youtube`);
  } catch (err) {
    console.error('Google token exchange failed:', err.response?.data || err.message);
    res.redirect(`${process.env.FRONTEND_URL}?error=google_failed`);
  }
});

// Auto-refresh YouTube token if expired
async function getYouTubeToken(req) {
  const yt = req.session.youtube;
  if (!yt) throw new Error('Not connected to YouTube');

  if (Date.now() < yt.expires_at - 60000) {
    return yt.access_token;
  }

  const response = await axios.post(
    'https://oauth2.googleapis.com/token',
    new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: yt.refresh_token,
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
    }),
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
  );

  req.session.youtube.access_token = response.data.access_token;
  req.session.youtube.expires_at = Date.now() + response.data.expires_in * 1000;
  return response.data.access_token;
}

// ─────────────────────────────────────────────────────────────────────────────
// CONNECTION STATUS
// ─────────────────────────────────────────────────────────────────────────────

app.get('/api/status', (req, res) => {
  res.json({
    spotify: !!req.session.spotify,
    youtube: !!req.session.youtube,
  });
});

app.get('/api/logout', (req, res) => {
  req.session.destroy();
  res.json({ ok: true });
});

// ─────────────────────────────────────────────────────────────────────────────
// FETCH PLAYLISTS
// ─────────────────────────────────────────────────────────────────────────────

// Get playlists from Spotify
app.get('/api/playlists/spotify', async (req, res) => {
  try {
    const token = await getSpotifyToken(req);
    const response = await axios.get('https://api.spotify.com/v1/me/playlists?limit=50', {
      headers: { Authorization: `Bearer ${token}` },
    });

    const playlists = (response.data.items || [])
      .filter((p) => p !== null)
      .map((p) => ({
      id: p.id,
      name: p.name || 'Unknown Playlist',
      tracks: p.tracks?.total || 0,
      image: p.images?.[0]?.url || null,
    }));

    res.json({ playlists });
  } catch (err) {
    console.error('Fetch Spotify playlists failed:', err.message);
    res.status(400).json({ error: err.message });
  }
});

// Get playlists from YouTube Music
app.get('/api/playlists/youtube', async (req, res) => {
  try {
    const token = await getYouTubeToken(req);
    const response = await axios.get(
      'https://www.googleapis.com/youtube/v3/playlists?part=snippet,contentDetails&mine=true&maxResults=50',
      { headers: { Authorization: `Bearer ${token}` } }
    );

    const playlists = (response.data.items || []).map((p) => ({
      id: p.id,
      name: p.snippet?.title || 'Unknown Playlist',
      tracks: p.contentDetails?.itemCount || 0,
      image: p.snippet?.thumbnails?.medium?.url || null,
    }));

    res.json({ playlists });
  } catch (err) {
    console.error('Fetch YouTube playlists failed:', err.message);
    res.status(400).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// TRANSFER
// ─────────────────────────────────────────────────────────────────────────────

// Transfer selected playlists from source to destination
// Body: { from: 'spotify'|'youtube', to: 'spotify'|'youtube', playlistIds: [...] }
app.post('/api/transfer', async (req, res) => {
  const { from, to, playlistIds } = req.body;

  if (!playlistIds || !playlistIds.length) {
    return res.status(400).json({ error: 'No playlists selected' });
  }

  const results = [];

  for (const playlistId of playlistIds) {
    const result = { id: playlistId, status: 'pending', tracksTransferred: 0 };

    try {
      // ── Step 1: Fetch tracks from source ──────────────────────────────────
      let tracks = [];

      if (from === 'spotify') {
        const token = await getSpotifyToken(req);
        const r = await axios.get(
          `https://api.spotify.com/v1/playlists/${playlistId}/tracks?limit=100`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        tracks = (r.data.items || [])
          .filter((i) => i.track)
          .map((i) => ({
            title: i.track.name,
            artist: i.track.artists?.[0]?.name || '',
          }));
      } else {
        const token = await getYouTubeToken(req);
        const r = await axios.get(
          `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet&playlistId=${playlistId}&maxResults=50`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        tracks = (r.data.items || []).map((i) => ({
          title: i.snippet.title,
          videoId: i.snippet.resourceId?.videoId,
        }));
      }

      // ── Step 2: Get playlist name ──────────────────────────────────────────
      let playlistName = 'Imported Playlist';

      if (from === 'spotify') {
        const token = await getSpotifyToken(req);
        const r = await axios.get(`https://api.spotify.com/v1/playlists/${playlistId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        playlistName = r.data.name;
      } else {
        const token = await getYouTubeToken(req);
        const r = await axios.get(
          `https://www.googleapis.com/youtube/v3/playlists?part=snippet&id=${playlistId}`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        playlistName = r.data.items?.[0]?.snippet?.title || 'Imported Playlist';
      }

      // ── Step 3: Create playlist on destination ────────────────────────────
      let newPlaylistId = null;

      if (to === 'spotify') {
        const token = await getSpotifyToken(req);

        // Get current user's Spotify ID
        const meRes = await axios.get('https://api.spotify.com/v1/me', {
          headers: { Authorization: `Bearer ${token}` },
        });
        const userId = meRes.data.id;

        // Create the playlist
        const createRes = await axios.post(
          `https://api.spotify.com/v1/users/${userId}/playlists`,
          { name: `${playlistName} (imported)`, public: false, description: 'Transferred by TunePort' },
          { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } }
        );
        newPlaylistId = createRes.data.id;

        // Search for each track and add it
        const uris = [];
        for (const track of tracks.slice(0, 50)) {
          try {
            const q = encodeURIComponent(`${track.title} ${track.artist}`);
            const searchRes = await axios.get(
              `https://api.spotify.com/v1/search?q=${q}&type=track&limit=1`,
              { headers: { Authorization: `Bearer ${token}` } }
            );
            const found = searchRes.data.tracks?.items?.[0];
            if (found) uris.push(found.uri);
            await delay(100); // avoid rate limiting
          } catch (_) {}
        }

        if (uris.length > 0) {
          await axios.post(
            `https://api.spotify.com/v1/playlists/${newPlaylistId}/tracks`,
            { uris },
            { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } }
          );
        }

        result.tracksTransferred = uris.length;

      } else {
        // to === 'youtube'
        const token = await getYouTubeToken(req);

        // Create playlist on YouTube
        const createRes = await axios.post(
          'https://www.googleapis.com/youtube/v3/playlists?part=snippet,status',
          {
            snippet: { title: `${playlistName} (imported)`, description: 'Transferred by TunePort' },
            status: { privacyStatus: 'private' },
          },
          { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } }
        );
        newPlaylistId = createRes.data.id;

        let added = 0;
        for (const track of tracks.slice(0, 50)) {
          try {
            // Search YouTube for the track
            const q = encodeURIComponent(`${track.title} ${track.artist || ''} official audio`);
            const searchRes = await axios.get(
              `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${q}&type=video&maxResults=1`,
              { headers: { Authorization: `Bearer ${token}` } }
            );
            const videoId = searchRes.data.items?.[0]?.id?.videoId;

            if (videoId) {
              await axios.post(
                'https://www.googleapis.com/youtube/v3/playlistItems?part=snippet',
                {
                  snippet: {
                    playlistId: newPlaylistId,
                    resourceId: { kind: 'youtube#video', videoId },
                  },
                },
                { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } }
              );
              added++;
            }
            await delay(200); // YouTube quota is strict
          } catch (_) {}
        }

        result.tracksTransferred = added;
      }

      result.status = 'done';
    } catch (err) {
      console.error(`Transfer failed for playlist ${playlistId}:`, err.message);
      result.status = 'error';
      result.error = err.message;
    }

    results.push(result);
  }

  res.json({ results });
});

// ─────────────────────────────────────────────────────────────────────────────
// START SERVER
// ─────────────────────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`TunePort backend running on port ${PORT}`);
});
