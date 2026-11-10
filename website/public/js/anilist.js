// website/public/js/anilist.js
// Direct Browser Client for AniList GraphQL API
// Provides seamless high-speed metadata querying directly from the browser (with open CORS)

(function () {
  const ANILIST_URL = 'https://graphql.anilist.co';

  async function fetchAniList(query, variables = {}) {
    const res = await fetch(ANILIST_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({ query, variables })
    });
    if (!res.ok) throw new Error(`AniList HTTP ${res.status}`);
    const json = await res.json();
    if (json.errors && json.errors.length > 0) {
      throw new Error(json.errors[0].message);
    }
    return json.data;
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

  window.AniListClient = {
    async getTrending(page = 1, perPage = 20) {
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
      const data = await fetchAniList(query, { page: Number(page) || 1, perPage: Number(perPage) || 20 });
      return data?.Page?.media || [];
    },

    async getPopular(page = 1, perPage = 20) {
      const query = `
        query ($page: Int, $perPage: Int) {
          Page(page: $page, perPage: $perPage) {
            media(type: ANIME, sort: POPULARITY_DESC, isAdult: false) {
              ${MEDIA_FIELDS}
            }
          }
        }
      `;
      const data = await fetchAniList(query, { page: Number(page) || 1, perPage: Number(perPage) || 20 });
      return data?.Page?.media || [];
    },

    async getTopRated(page = 1, perPage = 20) {
      const query = `
        query ($page: Int, $perPage: Int) {
          Page(page: $page, perPage: $perPage) {
            media(type: ANIME, sort: SCORE_DESC, isAdult: false) {
              ${MEDIA_FIELDS}
            }
          }
        }
      `;
      const data = await fetchAniList(query, { page: Number(page) || 1, perPage: Number(perPage) || 20 });
      return data?.Page?.media || [];
    },

    async searchAnime(keyword, page = 1, perPage = 20) {
      const query = `
        query ($search: String, $page: Int, $perPage: Int) {
          Page(page: $page, perPage: $perPage) {
            media(type: ANIME, search: $search, sort: SEARCH_MATCH, isAdult: false) {
              ${MEDIA_FIELDS}
            }
          }
        }
      `;
      const data = await fetchAniList(query, { search: keyword, page: Number(page) || 1, perPage: Number(perPage) || 20 });
      return data?.Page?.media || [];
    },

    async getAnimeDetails(id) {
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
                  }
                  format
                  type
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
      return data?.Media || null;
    },

    async getFranchiseSeasons(animeId, animeTitle = '') {
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
        console.warn(`[AniListClient] getFranchiseSeasons(${animeId}) error:`, err.message);
        return {
          currentId: animeId,
          all: [],
          seasons: [],
          movies: [],
          specials: []
        };
      }
    },

    async browseAnime({ page = 1, perPage = 24, genre, sort = 'popularity', search, format, status }) {
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

      const data = await fetchAniList(query, variables);
      return {
        items: data?.Page?.media || [],
        pageInfo: data?.Page?.pageInfo || { hasNextPage: false, currentPage: 1 }
      };
    }
  };
})();
