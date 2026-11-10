// website/routes/api.js
// Main REST API routing AniList metadata & HiAnime streaming services

const express = require('express');
const router = express.Router();
const anilist = require('../services/anilist');
const hianime = require('../services/hianime');

// In-memory cache for fast response times
const cache = new Map();
function getCached(key, ttlMs, fetcher) {
  const cached = cache.get(key);
  if (cached && Date.now() - cached.timestamp < ttlMs) {
    return Promise.resolve(cached.data);
  }
  return fetcher().then(data => {
    cache.set(key, { data, timestamp: Date.now() });
    return data;
  });
}

/**
 * GET /api/trending
 */
router.get('/trending', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const perPage = parseInt(req.query.perPage) || 20;
    const key = `trending_${page}_${perPage}`;

    const items = await getCached(key, 5 * 60 * 1000, () => anilist.getTrending(page, perPage));
    res.json({ success: true, data: items });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/popular
 */
router.get('/popular', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const perPage = parseInt(req.query.perPage) || 20;
    const key = `popular_${page}_${perPage}`;

    const items = await getCached(key, 10 * 60 * 1000, () => anilist.getPopular(page, perPage));
    res.json({ success: true, data: items });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/top-rated
 */
router.get('/top-rated', async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const perPage = parseInt(req.query.perPage) || 20;
    const key = `top_rated_${page}_${perPage}`;

    const items = await getCached(key, 15 * 60 * 1000, () => anilist.getTopRated(page, perPage));
    res.json({ success: true, data: items });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/browse
 * Advanced filtering & sorting
 */
router.get('/browse', async (req, res) => {
  try {
    const { page, perPage, genre, sort, search, format, status } = req.query;
    const result = await anilist.browseAnime({ page, perPage, genre, sort, search, format, status });
    res.json({ success: true, data: result.items, pageInfo: result.pageInfo });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/search?q=query
 */
router.get('/search', async (req, res) => {
  const query = req.query.q;
  if (!query) return res.status(400).json({ success: false, error: 'Query parameter q is required' });

  try {
    const [aniListResults, hiAnimeResults] = await Promise.allSettled([
      anilist.searchAnime(query, 1, 15),
      hianime.search(query)
    ]);

    const anilistData = aniListResults.status === 'fulfilled' ? aniListResults.value : [];
    const hianimeData = hiAnimeResults.status === 'fulfilled' ? hiAnimeResults.value : [];

    res.json({
      success: true,
      data: anilistData,
      raw: {
        anilist: anilistData,
        hianime: hianimeData
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

function isGenericTitle(t) {
  if (!t || typeof t !== 'string') return true;
  const s = t.trim().toLowerCase();
  return (
    s.length < 2 ||
    s === 'anime' ||
    s === 'anime details' ||
    s === 'continue watching' ||
    s === 'unknown' ||
    s === 'unknown anime' ||
    s === 'undefined' ||
    s === 'null' ||
    s.startsWith('anime #')
  );
}

/**
 * GET /api/anime/:id/seasons
 * Fetches complete franchise timeline, seasons, movies, and relations
 */
router.get('/anime/:id/seasons', async (req, res) => {
  const id = req.params.id;
  const title = req.query.title || '';
  try {
    const franchise = await anilist.getFranchiseSeasons(id, title);
    res.json({ success: true, data: franchise });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/anime/:id
 * Fetches AniList anime info and resolves its streamable episode list
 */
router.get('/anime/:id', async (req, res) => {
  const id = req.params.id;
  try {
    const details = await anilist.getAnimeDetails(id);
    if (!details) return res.status(404).json({ success: false, error: 'Anime not found' });

    // Search HiAnime to find matching episodes
    const baseTitles = [
      details.title.english,
      details.title.romaji,
      details.title.userPreferred
    ].filter(t => t && !isGenericTitle(t));

    const rawTitleParam = req.query.title;
    const titleParam = (rawTitleParam && !isGenericTitle(rawTitleParam)) ? rawTitleParam : null;
    const candidateTitles = new Set();
    if (titleParam) {
      candidateTitles.add(titleParam);
      candidateTitles.add(titleParam.replace(/[:\-]/g, ' ').replace(/\s+/g, ' ').trim());
      const prefix = titleParam.split(/[:\-]/)[0].trim();
      if (prefix.length >= 3 && !isGenericTitle(prefix)) candidateTitles.add(prefix);
      const noSeason = titleParam.replace(/\b(Season \d+|Part \d+|\b\d+(?:st|nd|rd|th) Season\b)\b/gi, '').trim();
      if (noSeason.length >= 3 && !isGenericTitle(noSeason)) candidateTitles.add(noSeason);
    }
    if (baseTitles.length > 0) {
      for (const t of baseTitles) {
        if (isGenericTitle(t)) continue;
        candidateTitles.add(t);
        candidateTitles.add(t.replace(/[:\-]/g, ' ').replace(/\s+/g, ' ').trim());
        const prefix = t.split(/[:\-]/)[0].trim();
        if (prefix.length >= 3 && !isGenericTitle(prefix)) candidateTitles.add(prefix);
        const noSeason = t.replace(/\b(Season \d+|Part \d+|\b\d+(?:st|nd|rd|th) Season\b)\b/gi, '').trim();
        if (noSeason.length >= 3 && !isGenericTitle(noSeason)) candidateTitles.add(noSeason);
      }
    } else if (!titleParam && isNaN(Number(id))) {
      const derived = id.replace(/-\d+$/, '').replace(/-/g, ' ').trim();
      if (derived.length >= 2 && !isGenericTitle(derived)) {
        candidateTitles.add(derived);
        const noSeason = derived.replace(/\b(Season \d+|Part \d+|\b\d+(?:st|nd|rd|th) Season\b)\b/gi, '').trim();
        if (noSeason.length >= 2 && !isGenericTitle(noSeason)) candidateTitles.add(noSeason);
      }
    }

    let episodes = [];
    let hiAnimeMatch = null;

    // Only search HiAnime if candidate titles exist and are non-generic
    for (const title of candidateTitles) {
      if (isGenericTitle(title)) continue;
      const searchRes = await hianime.search(title);
      if (searchRes.length > 0) {
        hiAnimeMatch = searchRes[0];
        episodes = await hianime.getEpisodes(hiAnimeMatch.id);
        if (episodes.length > 0) break;
      }
    }

    let franchise = null;
    try {
      const fTitle = details?.title?.english || details?.title?.romaji || titleParam || '';
      franchise = await anilist.getFranchiseSeasons(id, fTitle);
    } catch (_) {}

    res.json({
      success: true,
      data: {
        ...details,
        totalEpisodes: details.episodes,
        episodes: episodes,
        streamEpisodes: episodes,
        hiAnimeMatch,
        franchise
      }
    });
  } catch (err) {
    console.error('API /anime/:id error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/episodes
 * Search & get episode list by anime title query
 */
router.get('/episodes', async (req, res) => {
  const query = req.query.query || req.query.q;
  if (!query || isGenericTitle(query)) return res.status(400).json({ success: false, error: 'Valid query parameter required' });
  try {
    const searchRes = await hianime.search(query);
    let episodes = [];
    let hiAnimeMatch = null;
    if (searchRes.length > 0) {
      hiAnimeMatch = searchRes[0];
      episodes = await hianime.getEpisodes(hiAnimeMatch.id);
    }
    res.json({ success: true, data: episodes, hiAnimeMatch });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/episodes/:idOrSlug
 * Direct episode list from HiAnime
 */
router.get('/episodes/:idOrSlug', async (req, res) => {
  try {
    const episodes = await hianime.getEpisodes(req.params.idOrSlug);
    res.json({ success: true, data: episodes });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/stream/:episodeId?mode=sub|dub
 * Extracts master m3u8 playlist, subtitles, and creates proxy playback links
 */
router.get('/stream/:episodeId', async (req, res) => {
  const episodeId = req.params.episodeId;
  const mode = req.query.mode === 'dub' ? 'dub' : 'sub';

  try {
    const stream = await hianime.resolveEpisodeStream(episodeId, mode);
    if (!stream.success || !stream.m3u8) {
      return res.status(404).json({ success: false, error: stream.error || 'Failed to extract stream' });
    }

    // Support optional external proxy (e.g. Oracle server) to offload video bandwidth from Vercel
    const proxyBase = process.env.STREAM_PROXY_URL ? process.env.STREAM_PROXY_URL.replace(/\/$/, '') : '';

    // Rewritten proxy URL for browser playback
    const proxyStreamUrl = `${proxyBase}/api/proxy/m3u8?url=${encodeURIComponent(stream.m3u8)}&ref=${encodeURIComponent(stream.referer)}`;

    // Rewritten subtitle URLs
    const proxiedSubtitles = (stream.subtitles || []).map(sub => ({
      ...sub,
      proxySrc: `${proxyBase}/api/proxy/vtt?url=${encodeURIComponent(sub.src)}&ref=${encodeURIComponent(stream.referer)}`
    }));

    res.json({
      success: true,
      data: {
        rawM3u8: stream.m3u8,
        proxyM3u8: proxyStreamUrl,
        referer: stream.referer,
        server: stream.serverName,
        type: stream.type,
        availableServers: stream.availableServers,
        subtitles: proxiedSubtitles,
        skip: stream.skip
      }
    });
  } catch (err) {
    console.error('API /stream error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
