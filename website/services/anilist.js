// website/services/anilist.js
// Free public GraphQL API from AniList (No API key needed)

const ANILIST_URL = 'https://graphql.anilist.co';

let trendingSeed = [];
let popularSeed = [];
let topRatedSeed = [];

try {
  trendingSeed = require('../data/trending_seed.json');
} catch (_) {}
try {
  popularSeed = require('../data/popular_seed.json');
} catch (_) {}
try {
  topRatedSeed = require('../data/top_rated_seed.json');
} catch (_) {}

let lastAniListError = null;

async function fetchAniList(query, variables = {}) {
  try {
    const res = await fetch(ANILIST_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'User-Agent': 'OmCLI-AnimeStream/2.0 (https://github.com/omspradippatil/ani-cli)'
      },
      body: JSON.stringify({ query, variables })
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      throw new Error(`AniList HTTP ${res.status}: ${errText.slice(0, 100)}`);
    }
    const json = await res.json();
    return json.data;
  } catch (err) {
    lastAniListError = err.message;
    console.error('AniList fetch error:', err.message);
    throw err;
  }
}

const MEDIA_FIELDS = `
  id
  idMal
  title {
    romaji
    english
    native
    userPreferred
  }
  coverImage {
    extraLarge
    large
    medium
    color
  }
  bannerImage
  format
  status
  episodes
  duration
  seasonYear
  season
  averageScore
  genres
  description(asHtml: false)
  nextAiringEpisode {
    episode
    airingAt
    timeUntilAiring
  }
`;

/**
 * Get trending anime
 */
async function getTrending(page = 1, perPage = 20) {
  try {
    const query = `
      query ($page: Int, $perPage: Int) {
        Page(page: $page, perPage: $perPage) {
          pageInfo {
            hasNextPage
            currentPage
          }
          media(type: ANIME, sort: TRENDING_DESC, isAdult: false) {
            ${MEDIA_FIELDS}
          }
        }
      }
    `;
    const data = await fetchAniList(query, { page, perPage });
    const media = data?.Page?.media;
    if (media && media.length > 0) return media;
  } catch (err) {
    console.warn('[AniList] getTrending fallback to seed:', err.message);
  }
  return trendingSeed.slice(0, perPage);
}

/**
 * Get popular anime this season or all time
 */
async function getPopular(page = 1, perPage = 20) {
  try {
    const query = `
      query ($page: Int, $perPage: Int) {
        Page(page: $page, perPage: $perPage) {
          media(type: ANIME, sort: POPULARITY_DESC, isAdult: false) {
            ${MEDIA_FIELDS}
          }
        }
      }
    `;
    const data = await fetchAniList(query, { page, perPage });
    const media = data?.Page?.media;
    if (media && media.length > 0) return media;
  } catch (err) {
    console.warn('[AniList] getPopular fallback to seed:', err.message);
  }
  return popularSeed.slice(0, perPage);
}

/**
 * Get top rated anime
 */
async function getTopRated(page = 1, perPage = 20) {
  try {
    const query = `
      query ($page: Int, $perPage: Int) {
        Page(page: $page, perPage: $perPage) {
          media(type: ANIME, sort: SCORE_DESC, isAdult: false) {
            ${MEDIA_FIELDS}
          }
        }
      }
    `;
    const data = await fetchAniList(query, { page, perPage });
    const media = data?.Page?.media;
    if (media && media.length > 0) return media;
  } catch (err) {
    console.warn('[AniList] getTopRated fallback to seed:', err.message);
  }
  return topRatedSeed.slice(0, perPage);
}

/**
 * Search anime by title keyword
 */
async function searchAnime(keyword, page = 1, perPage = 20) {
  try {
    const query = `
      query ($search: String, $page: Int, $perPage: Int) {
        Page(page: $page, perPage: $perPage) {
          media(type: ANIME, search: $search, sort: SEARCH_MATCH, isAdult: false) {
            ${MEDIA_FIELDS}
          }
        }
      }
    `;
    const data = await fetchAniList(query, { search: keyword, page, perPage });
    if (data?.Page?.media && data.Page.media.length > 0) {
      return data.Page.media;
    }
  } catch (err) {
    console.warn('[AniList] searchAnime fallback:', err.message);
  }

  // Fallback 1: Match against local seed databases
  const normKey = keyword.toLowerCase().trim();
  const allSeeds = [...trendingSeed, ...popularSeed, ...topRatedSeed];
  const matched = allSeeds.filter(a => {
    const tEng = a.title?.english?.toLowerCase() || '';
    const tRom = a.title?.romaji?.toLowerCase() || '';
    const tUser = a.title?.userPreferred?.toLowerCase() || '';
    const desc = a.description?.toLowerCase() || '';
    return tEng.includes(normKey) || tRom.includes(normKey) || tUser.includes(normKey) || desc.includes(normKey);
  });
  if (matched.length > 0) {
    return matched.slice(0, perPage);
  }

  // Fallback 2: Search HiAnime
  try {
    const hianime = require('./hianime');
    const hiResults = await hianime.search(keyword);
    if (hiResults && hiResults.length > 0) {
      return hiResults.slice(0, perPage).map(h => ({
        id: h.slug || h.id,
        title: {
          english: h.title,
          romaji: h.jname || h.title,
          userPreferred: h.title
        },
        coverImage: {
          extraLarge: h.poster || 'https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/default.jpg',
          large: h.poster || 'https://s4.anilist.co/file/anilistcdn/media/anime/cover/medium/default.jpg',
          medium: h.poster || 'https://s4.anilist.co/file/anilistcdn/media/anime/cover/small/default.jpg'
        },
        format: h.type || 'TV',
        status: 'RELEASING',
        episodes: h.episodes?.sub || h.episodes?.dub || null
      }));
    }
  } catch (_) {}

  return [];
}

/**
 * Get detailed info for a single anime by ID
 */
async function getAnimeDetails(id) {
  try {
    const query = `
      query ($id: Int) {
        Media(id: $id, type: ANIME) {
          ${MEDIA_FIELDS}
          studios(isMain: true) {
            nodes {
              name
            }
          }
          relations {
            edges {
              relationType
              node {
                id
                title {
                  romaji
                  english
                  userPreferred
                }
                coverImage {
                  medium
                  large
                  extraLarge
                }
                bannerImage
                format
                type
                status
                episodes
                seasonYear
                averageScore
              }
            }
          }
          recommendations(perPage: 10) {
            nodes {
              mediaRecommendation {
                id
                title {
                  userPreferred
                }
                coverImage {
                  large
                }
                averageScore
              }
            }
          }
        }
      }
    `;
    const data = await fetchAniList(query, { id: Number(id) });
    if (data?.Media) return data.Media;
  } catch (err) {
    console.warn(`[AniList] getAnimeDetails(${id}) fallback:`, err.message);
  }
  const allSeeds = [...trendingSeed, ...popularSeed, ...topRatedSeed];
  return allSeeds.find(a => a.id == id) || null;
}

/**
 * Get complete franchise seasons, movies, and relations for an anime
 */
async function getFranchiseSeasons(animeId, animeTitle = '') {
  try {
    const cleanTitle = (animeTitle || '')
      .replace(/:\s*(Season|\d+(?:st|nd|rd|th)|Part|Final|Entertainment|Swordsmith|Mugen|Shippuuden|Next Generations|Thousand-Year).*$/i, '')
      .replace(/Season \d+.*$/i, '')
      .trim() || animeTitle;

    const query = `
      query ($id: Int, $search: String) {
        Media(id: $id, type: ANIME) {
          id
          title { romaji english userPreferred }
          format
          status
          episodes
          seasonYear
          averageScore
          description(asHtml: false)
          coverImage { medium large extraLarge }
          bannerImage
          relations {
            edges {
              relationType
              node {
                id
                title { romaji english userPreferred }
                format
                type
                status
                episodes
                seasonYear
                averageScore
                coverImage { medium large extraLarge }
                bannerImage
              }
            }
          }
        }
        Page(page: 1, perPage: 15) {
          media(type: ANIME, search: $search, sort: [START_DATE]) {
            id
            title { romaji english userPreferred }
            format
            status
            episodes
            seasonYear
            averageScore
            coverImage { medium large extraLarge }
            bannerImage
          }
        }
      }
    `;

    const data = await fetchAniList(query, {
      id: Number(animeId) || 0,
      search: (cleanTitle && cleanTitle.length >= 3) ? cleanTitle : undefined
    });

    const current = data?.Media;
    const searchResults = data?.Page?.media || [];

    const map = new Map();
    if (current) {
      map.set(current.id, { ...current, isCurrent: true, relationType: 'CURRENT' });
    }

    const relationsAnime = (current?.relations?.edges || [])
      .filter(e => e.node?.type === 'ANIME')
      .map(e => ({ ...e.node, relationType: e.relationType }));

    relationsAnime.forEach(item => {
      if (!map.has(item.id)) map.set(item.id, item);
    });

    if (cleanTitle && cleanTitle.length >= 3) {
      const core = cleanTitle.toLowerCase();
      searchResults.forEach(item => {
        const t = (item.title?.english || item.title?.romaji || item.title?.userPreferred || '').toLowerCase();
        if (t.includes(core.slice(0, 5)) || core.includes(t.slice(0, 5))) {
          if (!map.has(item.id)) map.set(item.id, { ...item, relationType: 'FRANCHISE' });
        }
      });
    }

    const allEntries = Array.from(map.values());

    const mainSeasons = [];
    const movies = [];
    const specials = [];

    allEntries.forEach(item => {
      const fmt = (item.format || 'TV').toUpperCase();
      if (fmt === 'MOVIE') {
        movies.push(item);
      } else if (fmt === 'OVA' || fmt === 'SPECIAL' || fmt === 'ONA') {
        if (item.episodes && item.episodes >= 10) {
          mainSeasons.push(item);
        } else {
          specials.push(item);
        }
      } else {
        mainSeasons.push(item);
      }
    });

    mainSeasons.sort((a, b) => (a.seasonYear || 9999) - (b.seasonYear || 9999));
    movies.sort((a, b) => (a.seasonYear || 9999) - (b.seasonYear || 9999));
    specials.sort((a, b) => (a.seasonYear || 9999) - (b.seasonYear || 9999));

    // Assign clean labels to main seasons
    mainSeasons.forEach((s, idx) => {
      const rawTitle = s.title?.english || s.title?.romaji || '';
      const seasonMatch = rawTitle.match(/(?:Season\s*(\d+)|(\d+)(?:st|nd|rd|th)\s*Season)/i);
      if (seasonMatch) {
        const num = seasonMatch[1] || seasonMatch[2];
        s.seasonLabel = `Season ${num}`;
      } else {
        s.seasonLabel = `Season ${idx + 1}`;
      }
    });

    movies.forEach((m, idx) => {
      m.seasonLabel = `Movie ${idx + 1}`;
    });

    specials.forEach((sp, idx) => {
      sp.seasonLabel = `OVA / Special ${idx + 1}`;
    });

    return {
      currentId: animeId,
      all: [...mainSeasons, ...movies, ...specials],
      seasons: mainSeasons,
      movies,
      specials
    };
  } catch (err) {
    console.warn(`[AniList] getFranchiseSeasons(${animeId}) error:`, err.message);
    return {
      currentId: animeId,
      all: [],
      seasons: [],
      movies: [],
      specials: []
    };
  }
}

/**
 * Advanced browse with filtering & sorting
 */
async function browseAnime({ page = 1, perPage = 24, genre, sort = 'POPULARITY_DESC', search, format, status }) {
  const sortMap = {
    'score': 'SCORE_DESC',
    'popularity': 'POPULARITY_DESC',
    'updated': 'UPDATED_AT_DESC',
    'release': 'START_DATE_DESC',
    'episodes': 'EPISODES_DESC',
    'trending': 'TRENDING_DESC'
  };

  const ANILIST_GENRES = new Set([
    'action', 'adventure', 'comedy', 'drama', 'ecchi', 'fantasy', 'horror',
    'mahou shoujo', 'mecha', 'music', 'mystery', 'psychological', 'romance',
    'sci-fi', 'slice of life', 'sports', 'supernatural', 'thriller'
  ]);

  const variables = { page: Number(page) || 1, perPage: Number(perPage) || 24 };
  const filterArgs = ['$page: Int', '$perPage: Int'];
  const mediaArgs = ['type: ANIME', 'isAdult: false'];

  if (search && search.trim()) {
    variables.search = search.trim();
    filterArgs.push('$search: String');
    mediaArgs.push('search: $search');
    if (!sort || sort === 'popularity' || sort === 'score') {
      variables.sort = 'SEARCH_MATCH';
      filterArgs.push('$sort: [MediaSort]');
      mediaArgs.push('sort: $sort');
    } else {
      variables.sort = sortMap[sort] || sort;
      filterArgs.push('$sort: [MediaSort]');
      mediaArgs.push('sort: $sort');
    }
  } else {
    const resolvedSort = sortMap[sort] || sort || 'POPULARITY_DESC';
    variables.sort = resolvedSort;
    filterArgs.push('$sort: [MediaSort]');
    mediaArgs.push('sort: $sort');
  }

  // Handle genres and tags (like Shounen, Isekai, etc.)
  const rawGenres = Array.isArray(genre) ? genre : (genre && genre !== 'All' ? String(genre).split(',') : []);
  const matchedGenres = [];
  const matchedTags = [];

  for (const item of rawGenres) {
    if (!item || item === 'All') continue;
    const norm = item.trim();
    if (ANILIST_GENRES.has(norm.toLowerCase())) {
      matchedGenres.push(norm);
    } else {
      matchedTags.push(norm);
    }
  }

  if (matchedGenres.length === 1) {
    variables.genre = matchedGenres[0];
    filterArgs.push('$genre: String');
    mediaArgs.push('genre: $genre');
  } else if (matchedGenres.length > 1) {
    variables.genres = matchedGenres;
    filterArgs.push('$genres: [String]');
    mediaArgs.push('genre_in: $genres');
  }

  if (matchedTags.length === 1) {
    variables.tag = matchedTags[0];
    filterArgs.push('$tag: String');
    mediaArgs.push('tag: $tag');
  } else if (matchedTags.length > 1) {
    variables.tags = matchedTags;
    filterArgs.push('$tags: [String]');
    mediaArgs.push('tag_in: $tags');
  }

  if (format && format !== 'All' && format !== 'all') {
    variables.format = format;
    filterArgs.push('$format: MediaFormat');
    mediaArgs.push('format: $format');
  }

  if (status && status !== 'All' && status !== 'all') {
    variables.status = status;
    filterArgs.push('$status: MediaStatus');
    mediaArgs.push('status: $status');
  }

  const query = `
    query (${filterArgs.join(', ')}) {
      Page(page: $page, perPage: $perPage) {
        pageInfo {
          hasNextPage
          currentPage
          total
        }
        media(${mediaArgs.join(', ')}) {
          ${MEDIA_FIELDS}
        }
      }
    }
  `;

  try {
    const data = await fetchAniList(query, variables);
    if (data?.Page?.media && data.Page.media.length > 0) {
      return {
        items: data.Page.media,
        pageInfo: data.Page.pageInfo || { hasNextPage: false, currentPage: 1 }
      };
    }
  } catch (err) {
    console.warn('[AniList] browseAnime fallback:', err.message);
  }

  // Offline / Error Fallbacks
  const allSeeds = [...trendingSeed, ...popularSeed, ...topRatedSeed];
  let filtered = allSeeds;

  if (search && search.trim()) {
    const normKey = search.toLowerCase().trim();
    filtered = filtered.filter(a => {
      const tEng = a.title?.english?.toLowerCase() || '';
      const tRom = a.title?.romaji?.toLowerCase() || '';
      const tUser = a.title?.userPreferred?.toLowerCase() || '';
      const desc = a.description?.toLowerCase() || '';
      return tEng.includes(normKey) || tRom.includes(normKey) || tUser.includes(normKey) || desc.includes(normKey);
    });

    if (filtered.length === 0) {
      try {
        const hianime = require('./hianime');
        const hiResults = await hianime.search(search);
        if (hiResults && hiResults.length > 0) {
          return {
            items: hiResults.slice((page - 1) * perPage, page * perPage).map(h => ({
              id: h.slug || h.id,
              title: {
                english: h.title,
                romaji: h.jname || h.title,
                userPreferred: h.title
              },
              coverImage: {
                extraLarge: h.poster || 'https://s4.anilist.co/file/anilistcdn/media/anime/cover/large/default.jpg',
                large: h.poster || 'https://s4.anilist.co/file/anilistcdn/media/anime/cover/medium/default.jpg',
                medium: h.poster || 'https://s4.anilist.co/file/anilistcdn/media/anime/cover/small/default.jpg'
              },
              format: h.type || 'TV',
              status: 'RELEASING',
              episodes: h.episodes?.sub || h.episodes?.dub || null
            })),
            pageInfo: { hasNextPage: false, currentPage: page }
          };
        }
      } catch (_) {}
      return { items: [], pageInfo: { hasNextPage: false, currentPage: page } };
    }
  }

  if (matchedGenres.length > 0 || matchedTags.length > 0) {
    const wanted = [...matchedGenres, ...matchedTags].map(s => s.toLowerCase());
    filtered = filtered.filter(a => {
      const gList = (a.genres || []).map(g => g.toLowerCase());
      const hasGenre = wanted.some(w => gList.includes(w));
      if (hasGenre) return true;
      if (wanted.includes('shounen')) {
        const desc = (a.description || '').toLowerCase();
        return desc.includes('shounen') || desc.includes('shonen') || gList.includes('action') || gList.includes('adventure');
      }
      return false;
    });
  }

  if (format && format !== 'All' && format !== 'all') {
    filtered = filtered.filter(a => (a.format || '').toUpperCase() === format.toUpperCase());
  }

  if (status && status !== 'All' && status !== 'all') {
    filtered = filtered.filter(a => (a.status || '').toUpperCase() === status.toUpperCase());
  }

  return {
    items: filtered.slice((page - 1) * perPage, page * perPage),
    pageInfo: { hasNextPage: filtered.length > page * perPage, currentPage: page }
  };
}

module.exports = {
  getTrending,
  getPopular,
  getTopRated,
  searchAnime,
  getAnimeDetails,
  getFranchiseSeasons,
  browseAnime,
  getLastError: () => lastAniListError
};
