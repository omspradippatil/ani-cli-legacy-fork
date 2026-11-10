// website/worker.js
// Cloudflare Worker for Om CLI — Edge Router with Cloudflare D1 SQLite & Static Assets

import anilist from './services/anilist.js';
import hianime from './services/hianime.js';

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-auth-token'
    }
  });
}

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
    s === '[object object]' ||
    s.startsWith('anime #') ||
    s.startsWith('episode ')
  );
}

function corsPreflight() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-auth-token'
    }
  });
}

async function getAuthUser(request, db) {
  const authHeader = request.headers.get('Authorization');
  let token = null;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.substring(7);
  } else {
    token = request.headers.get('x-auth-token');
  }
  if (!token || !db) return null;

  const session = await db.prepare('SELECT * FROM sessions WHERE token = ? AND expires_at > ?').bind(token, Date.now()).first();
  if (!session) return null;

  const user = await db.prepare('SELECT id, username, email, avatar, tier, level, created_at FROM users WHERE id = ?').bind(session.user_id).first();
  return user || null;
}

function bytesToHex(bytes) {
  let hex = '';
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i].toString(16).padStart(2, '0');
  }
  return hex;
}

function hexToBytes(hex) {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return bytes;
}

async function hashPassword(password, saltHex = null, useLegacySha512 = false) {
  const enc = new TextEncoder();
  const salt = saltHex ? hexToBytes(saltHex) : crypto.getRandomValues(new Uint8Array(16));
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    enc.encode(password),
    { name: 'PBKDF2' },
    false,
    ['deriveBits']
  );
  if (useLegacySha512) {
    const derivedBits = await crypto.subtle.deriveBits(
      {
        name: 'PBKDF2',
        salt,
        iterations: 100000,
        hash: 'SHA-512'
      },
      keyMaterial,
      512
    );
    return {
      hash: bytesToHex(new Uint8Array(derivedBits)),
      salt: bytesToHex(salt)
    };
  }
  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt,
      iterations: 10000,
      hash: 'SHA-256'
    },
    keyMaterial,
    256
  );
  return {
    hash: bytesToHex(new Uint8Array(derivedBits)),
    salt: bytesToHex(salt)
  };
}

async function calculateUserStats(userId, db) {
  try {
    const histRow = await db.prepare('SELECT COUNT(*) as count, COALESCE(SUM(progress_seconds), 0) as totalSeconds FROM watch_history WHERE user_id = ?').bind(userId).first();
    const totalEpisodesWatched = histRow?.count || 0;
    const totalSeconds = histRow?.totalSeconds || 0;
    const totalDaysWatched = (totalSeconds / 86400).toFixed(1);

    const completedRow = await db.prepare("SELECT COUNT(*) as count FROM watchlist WHERE user_id = ? AND LOWER(status) = 'completed'").bind(userId).first();
    const completedSeriesCount = completedRow?.count || 0;

    const wlRow = await db.prepare('SELECT COUNT(*) as count, AVG(score) as avgScore FROM watchlist WHERE user_id = ?').bind(userId).first();
    const watchlistCount = wlRow?.count || 0;
    const meanScore = (wlRow?.avgScore && Number(wlRow.avgScore) > 0) ? Number(wlRow.avgScore).toFixed(1) : '--';

    return {
      totalEpisodesWatched,
      totalDaysWatched,
      completedSeriesCount,
      watchlistCount,
      meanScore,
      episodesWatched: totalEpisodesWatched,
      watchTimeHours: Math.round(totalSeconds / 3600),
      completedCount: completedSeriesCount
    };
  } catch (err) {
    console.error('Error calculating user stats:', err);
    return {
      totalEpisodesWatched: 0,
      totalDaysWatched: '0.0',
      completedSeriesCount: 0,
      watchlistCount: 0,
      meanScore: '--',
      episodesWatched: 0,
      watchTimeHours: 0,
      completedCount: 0
    };
  }
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const pathname = url.pathname;
    const method = request.method;

    // Handle CORS preflight
    if (method === 'OPTIONS') {
      return corsPreflight();
    }

    // Favicon handler (avoids 404 console errors in browsers)
    if (pathname === '/favicon.ico') {
      return new Response(null, { status: 204 });
    }

    // SEO Robots & Sitemap handlers
    if (pathname === '/robots.txt') {
      return new Response(`User-agent: *\nAllow: /\nDisallow: /api/\nSitemap: https://ani-cli-steel.vercel.app/sitemap.xml\nHost: https://ani-cli-steel.vercel.app\n`, {
        headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'public, max-age=86400' }
      });
    }

    // TV APK Download Route (Redirect directly to genuine signed Android TV APK on GitHub CDN)
    if (pathname === '/ani-cli-tv.apk' || pathname === '/download/tv-apk' || pathname === '/download/ani-cli-tv.apk') {
      return Response.redirect('https://github.com/omspradippatil/ani-cli/raw/master/ani-cli-production-signed.apk', 302);
    }

    // Donate / Support shortcut
    if (pathname === '/donate' || pathname === '/support') {
      return Response.redirect('https://razorpay.me/@ompradippatil', 302);
    }

    // Serve Frontend Static Assets (HTML, CSS, JS, Images) from Edge
    if (!pathname.startsWith('/api/')) {
      if (env.ASSETS) {
        return env.ASSETS.fetch(request);
      }
    }

    const db = env.DB;

    // =========================================================================
    // API ROUTES
    // =========================================================================

    try {
      // --- AUTH: REGISTER ---
      if (pathname === '/api/auth/register' && method === 'POST') {
        const body = await request.json();
        const username = body.username ? String(body.username).trim() : '';
        const email = body.email ? String(body.email).trim().toLowerCase() : null;
        const password = String(body.password || '');

        if (!username || username.length < 3) {
          return jsonResponse({ success: false, error: 'Username must be at least 3 characters' }, 400);
        }
        if (!password || password.length < 6) {
          return jsonResponse({ success: false, error: 'Password must be at least 6 characters' }, 400);
        }

        // Check if username or email already exists in D1 SQLite
        const existing = await db.prepare('SELECT id FROM users WHERE LOWER(username) = LOWER(?) OR (email IS NOT NULL AND LOWER(email) = LOWER(?))').bind(username, email || '').first();
        if (existing) {
          return jsonResponse({ success: false, error: 'Username or email already registered' }, 400);
        }

        const { hash, salt } = await hashPassword(password);
        const now = Date.now();
        const avatar = `https://api.dicebear.com/7.x/bottts-neutral/svg?seed=${encodeURIComponent(username)}`;

        const insertRes = await db.prepare(`
          INSERT INTO users (username, email, password_hash, salt, avatar, tier, level, created_at)
          VALUES (?, ?, ?, ?, ?, 'Community Otaku', 1, ?)
        `).bind(username, email, hash, salt, avatar, now).run();

        const user = await db.prepare('SELECT id, username, email, avatar, tier, level, created_at FROM users WHERE id = ?').bind(insertRes.meta.last_row_id).first();

        // Seed initial default playback settings
        await db.prepare(`
          INSERT INTO user_settings (user_id, preferred_audio, auto_next, auto_skip_intro, auto_play, preferred_quality, updated_at)
          VALUES (?, 'sub', 1, 1, 1, 'auto', ?)
        `).bind(user.id, now).run();

        // Issue 30-day persistent session token
        const token = crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '');
        const expiresAt = now + (30 * 24 * 60 * 60 * 1000);
        await db.prepare('INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)').bind(token, user.id, expiresAt).run();

        const stats = {
          totalEpisodesWatched: 0,
          totalDaysWatched: '0.0',
          completedSeriesCount: 0,
          watchlistCount: 0,
          meanScore: '--'
        };

        return jsonResponse({
          success: true,
          token,
          user,
          data: {
            user,
            token,
            settings: { preferred_audio: 'sub', auto_next: 1, auto_skip_intro: 1, auto_play: 1, preferred_quality: 'auto' },
            stats
          }
        });
      }

      // --- AUTH: LOGIN ---
      if (pathname === '/api/auth/login' && method === 'POST') {
        const body = await request.json();
        const loginIdentity = String(body.username || body.login || '').trim();
        const password = String(body.password || '');

        if (!loginIdentity || !password) {
          return jsonResponse({ success: false, error: 'Username/email and password are required' }, 400);
        }

        const userWithSecret = await db.prepare('SELECT * FROM users WHERE LOWER(username) = LOWER(?) OR LOWER(email) = LOWER(?)').bind(loginIdentity, loginIdentity).first();
        if (!userWithSecret) {
          return jsonResponse({ success: false, error: 'Invalid username/email or password' }, 401);
        }

        const isLegacySha512 = userWithSecret.password_hash && userWithSecret.password_hash.length === 128;
        const { hash } = await hashPassword(password, userWithSecret.salt, isLegacySha512);
        if (hash !== userWithSecret.password_hash) {
          return jsonResponse({ success: false, error: 'Invalid username/email or password' }, 401);
        }

        const user = {
          id: userWithSecret.id,
          username: userWithSecret.username,
          email: userWithSecret.email,
          avatar: userWithSecret.avatar,
          tier: userWithSecret.tier || 'Community Otaku',
          level: userWithSecret.level || 1,
          created_at: userWithSecret.created_at
        };

        const now = Date.now();
        const token = crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '');
        const expiresAt = now + (30 * 24 * 60 * 60 * 1000);
        await db.prepare('INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)').bind(token, user.id, expiresAt).run();

        const settings = await db.prepare('SELECT * FROM user_settings WHERE user_id = ?').bind(user.id).first() || {
          preferred_audio: 'sub', auto_next: 1, auto_skip_intro: 1, auto_play: 1, preferred_quality: 'auto'
        };

        const stats = await calculateUserStats(user.id, db);

        return jsonResponse({
          success: true,
          token,
          user,
          data: {
            user,
            token,
            settings,
            stats
          }
        });
      }

      // --- AUTH: DEMO LOGIN ---
      if (pathname === '/api/auth/demo' && method === 'POST') {
        let user = await db.prepare('SELECT id, username, email, avatar, tier, level, created_at FROM users WHERE id = 1').first();
        if (!user) {
          const now = Date.now();
          await db.prepare(`
            INSERT OR IGNORE INTO users (id, username, email, password_hash, salt, avatar, tier, level, created_at)
            VALUES (1, 'Alex Mercer', 'alex@omcli.io', 'demo_hash', 'demo_salt', 'https://lh3.googleusercontent.com/aida-public/AB6AXuDTN9AsbPHoQqZimkdf5SKxBvZavvxOhDlT8E9vCHRzGbpe1hvxThzKYFlNmpGAueS_ucTqnCwn48iM-L9lqJQFrldtyx9Xp6-ZCo3-27ltcXs134z1k-7sAYvECqoB3KAEdg54dq4IeYszVKZ2P-tUZLVcDT7_3WqhYcw-qmMiNH1qu3LL-qQ12-c0cyUrSwMX7Zl5uNLBTk7kzuIME_SzDxIEadw5iosTQIcUEh-p', 'Community Otaku', 42, ?)
          `).bind(now).run();
          user = await db.prepare('SELECT id, username, email, avatar, tier, level, created_at FROM users WHERE id = 1').first();
        }

        const token = crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '');
        const expiresAt = Date.now() + (30 * 24 * 60 * 60 * 1000);
        await db.prepare('INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)').bind(token, user.id, expiresAt).run();

        const settings = await db.prepare('SELECT * FROM user_settings WHERE user_id = ?').bind(user.id).first() || {
          preferred_audio: 'sub', auto_next: 1, auto_skip_intro: 1, auto_play: 1, preferred_quality: 'auto'
        };

        const stats = await calculateUserStats(user.id, db);

        return jsonResponse({
          success: true,
          token,
          user,
          data: {
            user,
            token,
            settings,
            stats
          }
        });
      }

      // --- AUTH: PUBLIC ACCOUNTS LIST (FOR QUICK TV SWITCHER) ---
      if (pathname === '/api/auth/accounts' && method === 'GET') {
        const { results } = await db.prepare('SELECT id, username, email, avatar, tier, level, created_at FROM users ORDER BY id ASC LIMIT 20').all();
        return jsonResponse({ success: true, accounts: results || [] });
      }

      // --- AUTH: TV CODE GENERATE (TV REQUESTS A 6-DIGIT CODE) ---
      if (pathname === '/api/auth/tv-code/generate' && method === 'POST') {
        const now = Date.now();
        // Ensure table exists
        await db.prepare(`
          CREATE TABLE IF NOT EXISTS tv_pair_codes (
            code TEXT PRIMARY KEY,
            user_id INTEGER,
            token TEXT,
            status TEXT DEFAULT 'pending',
            created_at INTEGER,
            expires_at INTEGER
          )
        `).run();

        // Prune expired codes
        await db.prepare('DELETE FROM tv_pair_codes WHERE expires_at < ?').bind(now).run();

        // Generate easy-to-read 6-character alphanumeric code (excluding ambiguous 0/O, 1/I)
        const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
        let code = '';
        for (let i = 0; i < 6; i++) {
          code += chars.charAt(Math.floor(Math.random() * chars.length));
        }

        const expiresAt = now + (10 * 60 * 1000); // 10 minutes expiry
        await db.prepare('INSERT INTO tv_pair_codes (code, status, created_at, expires_at) VALUES (?, \'pending\', ?, ?)').bind(code, now, expiresAt).run();

        return jsonResponse({
          success: true,
          code,
          expiresIn: 600,
          expiresAt
        });
      }

      // --- AUTH: TV CODE STATUS (TV POLLS FOR PAIRING SUCCESS) ---
      if (pathname === '/api/auth/tv-code/status' && method === 'GET') {
        const code = String(url.searchParams.get('code') || '').trim().toUpperCase();
        if (!code) {
          return jsonResponse({ success: false, error: 'Code is required' }, 400);
        }

        const now = Date.now();
        const pairRow = await db.prepare('SELECT * FROM tv_pair_codes WHERE code = ?').bind(code).first();
        if (!pairRow || pairRow.expires_at < now) {
          return jsonResponse({ success: false, status: 'expired', error: 'Code has expired or does not exist' }, 404);
        }

        if (pairRow.status === 'paired' && pairRow.user_id && pairRow.token) {
          const user = await db.prepare('SELECT id, username, email, avatar, tier, level, created_at FROM users WHERE id = ?').bind(pairRow.user_id).first();
          if (!user) {
            return jsonResponse({ success: false, error: 'Paired user not found' }, 404);
          }

          const settings = await db.prepare('SELECT * FROM user_settings WHERE user_id = ?').bind(user.id).first() || {
            preferred_audio: 'sub', auto_next: 1, auto_skip_intro: 1, auto_play: 1, preferred_quality: 'auto'
          };
          const stats = await calculateUserStats(user.id, db);

          return jsonResponse({
            success: true,
            status: 'paired',
            token: pairRow.token,
            user,
            data: {
              user,
              token: pairRow.token,
              settings,
              stats
            }
          });
        }

        return jsonResponse({ success: true, status: 'pending' });
      }

      // --- AUTH: TV CODE PAIR (WEB USER AUTHORIZES TV CODE) ---
      if (pathname === '/api/auth/tv-code/pair' && method === 'POST') {
        const user = await getAuthUser(request, db);
        if (!user) {
          return jsonResponse({ success: false, error: 'Unauthorized. Please log in to your account first.' }, 401);
        }

        const body = await request.json();
        const code = String(body.code || '').trim().toUpperCase().replace(/[\s-]/g, '');
        if (!code || code.length < 4) {
          return jsonResponse({ success: false, error: 'Please enter a valid 6-character code' }, 400);
        }

        const now = Date.now();
        const pairRow = await db.prepare('SELECT * FROM tv_pair_codes WHERE code = ? AND expires_at > ?').bind(code, now).first();
        if (!pairRow) {
          return jsonResponse({ success: false, error: 'Invalid or expired TV pairing code' }, 404);
        }

        // Generate persistent TV session token (60-day expiry)
        const tvToken = crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '');
        const expiresAt = now + (60 * 24 * 60 * 60 * 1000);
        await db.prepare('INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)').bind(tvToken, user.id, expiresAt).run();

        // Mark code as paired
        await db.prepare('UPDATE tv_pair_codes SET user_id = ?, token = ?, status = \'paired\' WHERE code = ?').bind(user.id, tvToken, code).run();

        return jsonResponse({
          success: true,
          message: `TV successfully linked to account: ${user.username}!`,
          user
        });
      }

      // --- AUTH: ME ---
      if (pathname === '/api/auth/me' && method === 'GET') {
        const user = await getAuthUser(request, db);
        if (!user) return jsonResponse({ success: false, error: 'Unauthorized' }, 401);
        const settings = await db.prepare('SELECT * FROM user_settings WHERE user_id = ?').bind(user.id).first();
        return jsonResponse({ success: true, user, data: { user, settings } });
      }

      // --- AUTH: LOGOUT ---
      if (pathname === '/api/auth/logout' && method === 'POST') {
        const authHeader = request.headers.get('Authorization');
        const token = authHeader?.replace('Bearer ', '') || request.headers.get('x-auth-token');
        if (token && db) {
          await db.prepare('DELETE FROM sessions WHERE token = ?').bind(token).run();
        }
        return jsonResponse({ success: true, message: 'Logged out' });
      }

      // --- USER: PROFILE ---
      if (pathname === '/api/user/profile' && method === 'GET') {
        const user = await getAuthUser(request, db);
        if (!user) return jsonResponse({ success: false, error: 'Unauthorized' }, 401);
        const settings = await db.prepare('SELECT * FROM user_settings WHERE user_id = ?').bind(user.id).first();
        const stats = await calculateUserStats(user.id, db);
        return jsonResponse({
          success: true,
          data: {
            user,
            settings,
            stats
          }
        });
      }

      // --- USER: HISTORY ---
      if (pathname === '/api/user/history' && method === 'GET') {
        const user = await getAuthUser(request, db);
        if (!user) return jsonResponse({ success: false, error: 'Unauthorized' }, 401);

        // Auto-purge any corrupt ghost records (generic title or missing title or generic poster)
        await db.prepare(`
          DELETE FROM watch_history 
          WHERE user_id = ? 
            AND (
              lower(anime_title) IN ('anime', 'anime details', 'continue watching', 'unknown', 'unknown anime', 'undefined', 'null', '[object object]')
              OR anime_title IS NULL 
              OR trim(anime_title) = ''
              OR lower(anime_title) LIKE 'anime #%'
              OR poster = '/assets/hero_bg.jpg'
              OR poster = 'undefined'
              OR poster = 'null'
            )
        `).bind(user.id).run().catch(() => {});

        const { results } = await db.prepare(`
          SELECT * FROM watch_history 
          WHERE user_id = ? 
            AND lower(anime_title) NOT IN ('anime', 'anime details', 'continue watching', 'unknown', 'unknown anime', 'undefined', 'null', '[object object]')
            AND anime_title IS NOT NULL
            AND trim(anime_title) != ''
            AND lower(anime_title) NOT LIKE 'anime #%'
            AND poster IS NOT NULL
            AND poster != ''
            AND poster != '/assets/hero_bg.jpg'
            AND poster != 'undefined'
            AND poster != 'null'
          ORDER BY updated_at DESC LIMIT 50
        `).bind(user.id).all();

        return jsonResponse({ success: true, data: results || [] });
      }

      if (pathname === '/api/user/history' && method === 'POST') {
        const user = await getAuthUser(request, db);
        if (!user) return jsonResponse({ success: false, error: 'Unauthorized' }, 401);
        const body = await request.json();
        const animeId = String(body.animeId || body.anime_id || '');
        if (!animeId || animeId === 'undefined' || animeId === 'null' || animeId.includes('|')) {
          return jsonResponse({ success: false, error: 'Invalid animeId' }, 400);
        }

        let animeTitle = (body.animeTitle || body.anime_title || '').trim();
        let poster = (body.poster || body.poster_image || '').trim();
        const episodeNum = Number(body.episodeNum || body.episode_num) || 1;
        const episodeId = String(body.episodeId || body.episode_id || '');
        const progressSeconds = Number(body.progressSeconds ?? body.progress_seconds) || 0;
        const durationSeconds = Number(body.durationSeconds ?? body.duration_seconds) || 0;
        const now = Date.now();

        // If animeTitle is generic or missing, and we have an AniList numeric ID, resolve title & poster from AniList
        if (isGenericTitle(animeTitle) && !isNaN(Number(animeId))) {
          try {
            const aniDetails = await anilist.getAnimeDetails(animeId);
            if (aniDetails && (aniDetails.title?.english || aniDetails.title?.romaji)) {
              animeTitle = aniDetails.title.english || aniDetails.title.romaji || aniDetails.title.userPreferred;
              if (!poster || poster === '/assets/hero_bg.jpg' || poster === 'undefined') {
                poster = aniDetails.coverImage?.large || aniDetails.coverImage?.extraLarge || aniDetails.bannerImage || '';
              }
            }
          } catch (_) {}
        }

        // STRICT GATE: Never save ghost records with generic title or missing poster
        if (isGenericTitle(animeTitle) || !poster || poster === '/assets/hero_bg.jpg' || poster === 'undefined' || poster === 'null') {
          return jsonResponse({ success: false, error: 'Cannot save history without valid anime title and poster' }, 400);
        }

        await db.prepare(`
          INSERT INTO watch_history (user_id, anime_id, anime_title, poster, episode_num, episode_id, progress_seconds, duration_seconds, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(user_id, anime_id) DO UPDATE SET
            anime_title = CASE 
              WHEN excluded.anime_title IS NOT NULL AND excluded.anime_title != '' AND lower(excluded.anime_title) NOT IN ('anime', 'anime details', 'continue watching', 'unknown', 'unknown anime', 'undefined', 'null')
              THEN excluded.anime_title
              ELSE watch_history.anime_title
            END,
            poster = CASE
              WHEN excluded.poster IS NOT NULL AND excluded.poster != ''
              THEN excluded.poster
              ELSE watch_history.poster
            END,
            episode_num = excluded.episode_num,
            episode_id = excluded.episode_id,
            progress_seconds = excluded.progress_seconds,
            duration_seconds = excluded.duration_seconds,
            updated_at = excluded.updated_at
        `).bind(user.id, animeId, animeTitle, poster, episodeNum, episodeId, progressSeconds, durationSeconds, now).run();
        return jsonResponse({ success: true, message: 'History saved' });
      }

      // --- USER: WATCHLIST ---
      if (pathname === '/api/user/watchlist' && method === 'GET') {
        const user = await getAuthUser(request, db);
        if (!user) return jsonResponse({ success: false, error: 'Unauthorized' }, 401);
        const { results } = await db.prepare('SELECT * FROM watchlist WHERE user_id = ? ORDER BY updated_at DESC').bind(user.id).all();
        return jsonResponse({ success: true, data: results || [] });
      }

      if (pathname === '/api/user/watchlist' && method === 'POST') {
        const user = await getAuthUser(request, db);
        if (!user) return jsonResponse({ success: false, error: 'Unauthorized' }, 401);
        const body = await request.json();
        const animeId = String(body.animeId || body.anime_id || '');
        const animeTitle = body.animeTitle || body.anime_title || 'Anime';
        const poster = body.poster || '';
        const format = body.format || 'TV';
        const score = Number(body.score) || 0;
        const status = body.status || 'Watching';
        const now = Date.now();
        await db.prepare(`
          INSERT INTO watchlist (user_id, anime_id, anime_title, poster, format, score, status, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(user_id, anime_id) DO UPDATE SET
            status = excluded.status,
            updated_at = excluded.updated_at
        `).bind(user.id, animeId, animeTitle, poster, format, score, status, now).run();
        return jsonResponse({ success: true, message: 'Watchlist updated' });
      }

      // --- USER: DELETE HISTORY ITEM ---
      if (pathname.startsWith('/api/user/history/') && method === 'DELETE') {
        const user = await getAuthUser(request, db);
        if (!user) return jsonResponse({ success: false, error: 'Unauthorized' }, 401);
        const animeId = pathname.replace('/api/user/history/', '');
        await db.prepare('DELETE FROM watch_history WHERE user_id = ? AND anime_id = ?').bind(user.id, animeId).run();
        return jsonResponse({ success: true, message: 'History item removed' });
      }

      // --- USER: CLEAR ALL HISTORY ---
      if (pathname === '/api/user/history' && method === 'DELETE') {
        const user = await getAuthUser(request, db);
        if (!user) return jsonResponse({ success: false, error: 'Unauthorized' }, 401);
        await db.prepare('DELETE FROM watch_history WHERE user_id = ?').bind(user.id).run();
        return jsonResponse({ success: true, message: 'All history cleared' });
      }

      // --- USER: DELETE WATCHLIST ITEM ---
      if (pathname.startsWith('/api/user/watchlist/') && method === 'DELETE') {
        const user = await getAuthUser(request, db);
        if (!user) return jsonResponse({ success: false, error: 'Unauthorized' }, 401);
        const animeId = pathname.replace('/api/user/watchlist/', '');
        await db.prepare('DELETE FROM watchlist WHERE user_id = ? AND anime_id = ?').bind(user.id, animeId).run();
        return jsonResponse({ success: true, message: 'Watchlist item removed' });
      }

      // --- USER: DELETE ACCOUNT ---
      if ((pathname === '/api/user/account' || pathname === '/api/user') && method === 'DELETE') {
        const user = await getAuthUser(request, db);
        if (!user) return jsonResponse({ success: false, error: 'Unauthorized' }, 401);
        if (db) {
          await db.batch([
            db.prepare('DELETE FROM sessions WHERE user_id = ?').bind(user.id),
            db.prepare('DELETE FROM watch_history WHERE user_id = ?').bind(user.id),
            db.prepare('DELETE FROM watchlist WHERE user_id = ?').bind(user.id),
            db.prepare('DELETE FROM user_settings WHERE user_id = ?').bind(user.id),
            db.prepare('DELETE FROM users WHERE id = ?').bind(user.id)
          ]);
        }
        return jsonResponse({ success: true, message: 'Account permanently deleted' });
      }

      // --- USER: SETTINGS ---
      if (pathname === '/api/user/settings' && method === 'GET') {
        const user = await getAuthUser(request, db);
        if (!user) return jsonResponse({ success: false, error: 'Unauthorized' }, 401);
        const settings = await db.prepare('SELECT * FROM user_settings WHERE user_id = ?').bind(user.id).first() || {
          preferred_audio: 'sub', auto_next: 1, auto_skip_intro: 1, auto_play: 1, preferred_quality: 'auto'
        };
        return jsonResponse({ success: true, data: settings });
      }

      if (pathname === '/api/user/settings' && (method === 'POST' || method === 'PUT')) {
        const user = await getAuthUser(request, db);
        if (!user) return jsonResponse({ success: false, error: 'Unauthorized' }, 401);
        const body = await request.json();
        const now = Date.now();
        const prefAudio = body.preferred_audio || body.preferredAudio || 'sub';
        const autoNext = (body.auto_next !== undefined ? body.auto_next : body.autoNext) ? 1 : 0;
        const autoSkipIntro = (body.auto_skip_intro !== undefined ? body.auto_skip_intro : body.autoSkipIntro) ? 1 : 0;
        const autoPlay = (body.auto_play !== undefined ? body.auto_play : body.autoPlay) ? 1 : 0;
        const prefQuality = body.preferred_quality || body.preferredQuality || 'auto';

        await db.prepare(`
          INSERT INTO user_settings (user_id, preferred_audio, auto_next, auto_skip_intro, auto_play, preferred_quality, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(user_id) DO UPDATE SET
            preferred_audio = excluded.preferred_audio,
            auto_next = excluded.auto_next,
            auto_skip_intro = excluded.auto_skip_intro,
            auto_play = excluded.auto_play,
            preferred_quality = excluded.preferred_quality,
            updated_at = excluded.updated_at
        `).bind(
          user.id,
          prefAudio,
          autoNext,
          autoSkipIntro,
          autoPlay,
          prefQuality,
          now
        ).run();
        return jsonResponse({
          success: true,
          data: {
            user_id: user.id,
            preferred_audio: prefAudio,
            auto_next: autoNext,
            auto_skip_intro: autoSkipIntro,
            auto_play: autoPlay,
            preferred_quality: prefQuality,
            updated_at: now
          },
          message: 'Settings saved'
        });
      }

      // --- METADATA: TRENDING ---
      if (pathname === '/api/trending') {
        const page = parseInt(url.searchParams.get('page')) || 1;
        const perPage = parseInt(url.searchParams.get('perPage')) || 20;
        const items = await anilist.getTrending(page, perPage);
        return jsonResponse({ success: true, data: items });
      }

      // --- METADATA: POPULAR ---
      if (pathname === '/api/popular') {
        const page = parseInt(url.searchParams.get('page')) || 1;
        const perPage = parseInt(url.searchParams.get('perPage')) || 20;
        const items = await anilist.getPopular(page, perPage);
        return jsonResponse({ success: true, data: items });
      }

      // --- METADATA: TOP RATED ---
      if (pathname === '/api/top-rated') {
        const page = parseInt(url.searchParams.get('page')) || 1;
        const perPage = parseInt(url.searchParams.get('perPage')) || 20;
        const items = await anilist.getTopRated(page, perPage);
        return jsonResponse({ success: true, data: items });
      }

      // --- METADATA: BROWSE ---
      if (pathname === '/api/browse') {
        const { genre, sort, search, format, status } = Object.fromEntries(url.searchParams);
        const page = parseInt(url.searchParams.get('page')) || 1;
        const perPage = parseInt(url.searchParams.get('perPage')) || 24;
        try {
          const res = await anilist.browseAnime({ page, perPage, genre, sort, search, format, status });
          return jsonResponse({ success: true, data: res?.items || [], pageInfo: res?.pageInfo || { hasNextPage: false, currentPage: page } });
        } catch (e) {
          console.error('[Worker] browseAnime error:', e);
          return jsonResponse({ success: true, data: [], pageInfo: { hasNextPage: false, currentPage: page } });
        }
      }

      // --- METADATA: SEARCH ---
      if (pathname === '/api/search') {
        const q = url.searchParams.get('q');
        if (!q) return jsonResponse({ success: false, error: 'Query parameter q required' }, 400);
        const items = await anilist.searchAnime(q, 1, 15);
        return jsonResponse({ success: true, data: items });
      }

      // --- EPISODES SEARCH & LIST ---
      if (pathname === '/api/episodes') {
        const query = url.searchParams.get('query') || url.searchParams.get('q');
        if (!query || isGenericTitle(query)) return jsonResponse({ success: false, error: 'Valid query parameter required' }, 400);
        const searchRes = await hianime.search(query);
        let episodes = [];
        let hiAnimeMatch = null;
        if (searchRes.length > 0) {
          hiAnimeMatch = searchRes[0];
          episodes = await hianime.getEpisodes(hiAnimeMatch.id);
        }
        return jsonResponse({ success: true, data: episodes, hiAnimeMatch });
      }

      // --- METADATA: ANIME SEASONS & FRANCHISE TIMELINE ---
      if (pathname.startsWith('/api/anime/') && pathname.endsWith('/seasons')) {
        const animeId = pathname.replace('/api/anime/', '').replace('/seasons', '');
        const titleParam = url.searchParams.get('title') || '';
        try {
          const franchise = await anilist.getFranchiseSeasons(animeId, titleParam);
          return jsonResponse({ success: true, data: franchise });
        } catch (err) {
          return jsonResponse({ success: false, error: err.message }, 500);
        }
      }

      // --- METADATA: ANIME DETAILS + EPISODES ---
      if (pathname.startsWith('/api/anime/')) {
        const animeId = pathname.replace('/api/anime/', '');
        const rawTitleParam = url.searchParams.get('title');
        let titleParam = (rawTitleParam && !isGenericTitle(rawTitleParam)) ? rawTitleParam : null;

        // Auto-heal titleParam from D1 SQLite watch_history / watchlist if not provided
        if (!titleParam && db) {
          try {
            const hist = await db.prepare('SELECT anime_title FROM watch_history WHERE anime_id = ? AND anime_title IS NOT NULL AND anime_title != "" AND lower(anime_title) NOT LIKE "anime #%" LIMIT 1').bind(animeId).first();
            if (hist?.anime_title && !isGenericTitle(hist.anime_title)) {
              titleParam = hist.anime_title;
            } else {
              const watch = await db.prepare('SELECT anime_title FROM watchlist WHERE anime_id = ? AND anime_title IS NOT NULL AND anime_title != "" AND lower(anime_title) NOT LIKE "anime #%" LIMIT 1').bind(animeId).first();
              if (watch?.anime_title && !isGenericTitle(watch.anime_title)) {
                titleParam = watch.anime_title;
              }
            }
          } catch (_) {}
        }

        let details = null;
        let anilistError = null;
        try {
          details = await anilist.getAnimeDetails(animeId);
          if (!details) {
            anilistError = anilist.getLastError ? anilist.getLastError() : 'No details returned from AniList';
          }
        } catch (e) {
          anilistError = e.message;
          console.warn('Worker AniList details fallback for', animeId, e.message);
        }

        const candidateTitles = new Set();
        if (titleParam) {
          candidateTitles.add(titleParam);
          candidateTitles.add(titleParam.replace(/[:\-]/g, ' ').replace(/\s+/g, ' ').trim());
          const prefix = titleParam.split(/[:\-]/)[0].trim();
          if (prefix.length >= 3 && !isGenericTitle(prefix)) candidateTitles.add(prefix);
          const noSeason = titleParam.replace(/\b(Season \d+|Part \d+|\b\d+(?:st|nd|rd|th) Season\b)\b/gi, '').trim();
          if (noSeason.length >= 3 && !isGenericTitle(noSeason)) candidateTitles.add(noSeason);
        }
        if (details?.title) {
          [details.title.english, details.title.romaji, details.title.userPreferred]
            .filter(t => t && !isGenericTitle(t))
            .forEach(t => {
              candidateTitles.add(t);
              candidateTitles.add(t.replace(/[:\-]/g, ' ').replace(/\s+/g, ' ').trim());
              const prefix = t.split(/[:\-]/)[0].trim();
              if (prefix.length >= 3 && !isGenericTitle(prefix)) candidateTitles.add(prefix);
            });
        } else if (!titleParam && isNaN(Number(animeId))) {
          const derived = animeId.replace(/-\d+$/, '').replace(/-/g, ' ').trim();
          if (derived.length >= 2 && !isGenericTitle(derived)) {
            candidateTitles.add(derived);
            const noSeason = derived.replace(/\b(Season \d+|Part \d+|\b\d+(?:st|nd|rd|th) Season\b)\b/gi, '').trim();
            if (noSeason.length >= 2 && !isGenericTitle(noSeason)) candidateTitles.add(noSeason);
          }
        }

        let episodes = [];
        let hiAnimeMatch = null;

        // Only search HiAnime if candidateTitles is non-empty and non-generic
        for (const title of candidateTitles) {
          if (isGenericTitle(title)) continue;
          const searchRes = await hianime.search(title);
          if (searchRes.length > 0) {
            hiAnimeMatch = searchRes[0];
            episodes = await hianime.getEpisodes(hiAnimeMatch.id);
            if (episodes.length > 0) break;
          }
        }

        // Auto-synthesize details from hiAnimeMatch if AniList returned 403 or null
        if (!details && hiAnimeMatch) {
          const resolvedTitle = hiAnimeMatch.title || titleParam || `Anime #${animeId}`;
          details = {
            id: animeId,
            title: {
              english: resolvedTitle,
              romaji: resolvedTitle,
              userPreferred: resolvedTitle
            },
            coverImage: {
              extraLarge: hiAnimeMatch.poster,
              large: hiAnimeMatch.poster,
              medium: hiAnimeMatch.poster
            },
            poster: hiAnimeMatch.poster,
            bannerImage: hiAnimeMatch.poster,
            format: 'TV',
            status: 'RELEASING',
            episodes: episodes.length,
            genres: ['Action', 'Fantasy'],
            description: `Stream ${resolvedTitle} with precision dual-audio Japanese/English playback.`
          };
        }

        let franchise = null;
        try {
          const franchiseTitle = details?.title?.english || details?.title?.romaji || titleParam || '';
          franchise = await anilist.getFranchiseSeasons(animeId, franchiseTitle);
        } catch (_) {}

        return jsonResponse({
          success: true,
          data: {
            id: animeId,
            anilistError,
            ...(details || {}),
            totalEpisodes: details?.episodes || episodes.length,
            episodes,
            streamEpisodes: episodes,
            hiAnimeMatch,
            franchise
          }
        });
      }

      // --- STREAM RESOLUTION ---
      if (pathname.startsWith('/api/stream/')) {
        const episodeId = pathname.replace('/api/stream/', '');
        const mode = url.searchParams.get('mode') === 'dub' ? 'dub' : 'sub';
        const stream = await hianime.resolveEpisodeStream(episodeId, mode);

        if (!stream.success || !stream.m3u8) {
          return jsonResponse({ success: false, error: stream.error || 'Failed to extract stream' }, 404);
        }

        const proxyStreamUrl = `/api/proxy/m3u8?url=${encodeURIComponent(stream.m3u8)}&ref=${encodeURIComponent(stream.referer)}`;
        const proxiedSubtitles = (stream.subtitles || []).map(s => ({
          ...s,
          proxySrc: `/api/proxy/vtt?url=${encodeURIComponent(s.src)}&ref=${encodeURIComponent(stream.referer)}`
        }));

        return jsonResponse({
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
      }

      // --- PROXY: M3U8 PLAYLIST ---
      if (pathname === '/api/proxy/m3u8') {
        const targetUrl = url.searchParams.get('url');
        const referer = url.searchParams.get('ref') || 'https://zokoanime.video/';
        if (!targetUrl) return new Response('Missing url parameter', { status: 400 });

        const upRes = await fetch(targetUrl, {
          headers: {
            'User-Agent': USER_AGENT,
            'Referer': referer,
            'Origin': referer.replace(/\/$/, '')
          }
        });

        if (!upRes.ok) return new Response(`Upstream playlist error: ${upRes.status}`, { status: upRes.status });

        const text = await upRes.text();
        const lines = text.split(/\r?\n/);
        const rewritten = [];

        for (let line of lines) {
          line = line.trim();
          if (!line) { rewritten.push(line); continue; }

          if (line.startsWith('#')) {
            if (line.includes('URI="')) {
              line = line.replace(/URI="([^"]+)"/g, (match, uri) => {
                const abs = new URL(uri, targetUrl).href;
                const endpoint = abs.includes('.m3u8') ? '/api/proxy/m3u8' : '/api/proxy/ts';
                return `URI="${endpoint}?url=${encodeURIComponent(abs)}&ref=${encodeURIComponent(referer)}"`;
              });
            }
            rewritten.push(line);
          } else {
            const abs = new URL(line, targetUrl).href;
            const endpoint = abs.includes('.m3u8') ? '/api/proxy/m3u8' : '/api/proxy/ts';
            rewritten.push(`${endpoint}?url=${encodeURIComponent(abs)}&ref=${encodeURIComponent(referer)}`);
          }
        }

        return new Response(rewritten.join('\n'), {
          headers: {
            'Content-Type': 'application/vnd.apple.mpegurl',
            'Access-Control-Allow-Origin': '*',
            'Cache-Control': 'public, max-age=60'
          }
        });
      }

      // --- PROXY: TS VIDEO SEGMENTS & VTT ---
      if (pathname === '/api/proxy/ts' || pathname === '/api/proxy/vtt') {
        const targetUrl = url.searchParams.get('url');
        const referer = url.searchParams.get('ref') || 'https://zokoanime.video/';
        if (!targetUrl) return new Response('Missing url parameter', { status: 400 });

        const upRes = await fetch(targetUrl, {
          headers: {
            'User-Agent': USER_AGENT,
            'Referer': referer,
            'Origin': referer.replace(/\/$/, '')
          }
        });

        if (pathname.endsWith('vtt')) {
          let vttText = await upRes.text();
          vttText = vttText
            .replace(/&lt;(\/?[a-zA-Z0-9]+)&gt;/gi, '<$1>')
            .replace(/&lt;(\/?[a-zA-Z0-9]+)\s+([^&]*?)&gt;/gi, '<$1 $2>')
            .replace(/\{\\i1\}/g, '<i>')
            .replace(/\{\\i0\}/g, '</i>')
            .replace(/\{\\b1\}/g, '<b>')
            .replace(/\{\\b0\}/g, '</b>')
            .replace(/\{[^\}]*\}/g, '');
          return new Response(vttText, {
            status: upRes.status,
            headers: {
              'Content-Type': 'text/vtt; charset=utf-8',
              'Access-Control-Allow-Origin': '*',
              'Cache-Control': 'public, max-age=86400, immutable'
            }
          });
        }

        return new Response(upRes.body, {
          status: upRes.status,
          headers: {
            'Content-Type': upRes.headers.get('content-type') || 'video/mp2t',
            'Access-Control-Allow-Origin': '*',
            'Cache-Control': 'public, max-age=86400, immutable'
          }
        });
      }

      return jsonResponse({ error: 'Endpoint not found' }, 404);
    } catch (err) {
      console.error('[Worker Error]:', err);
      return jsonResponse({ success: false, error: err.message }, 500);
    }
  }
};
