// website/public/js/app.js
// Om CLI Core Application Controller & Router

document.addEventListener('DOMContentLoaded', () => {
  // Universal Saved Settings from LocalStorage
  const savedAudioMode = localStorage.getItem('omcli_preferred_audio') || localStorage.getItem('omcli_audio_mode') || localStorage.getItem('kuronami_audio_mode') || 'sub';
  const savedAutoNext = localStorage.getItem('omcli_auto_next') !== '0';
  const savedAutoSkip = localStorage.getItem('omcli_skip_intro') !== '0';
  const savedQuality = localStorage.getItem('omcli_quality') || 'auto';

  // Global Application State
  const state = {
    auth: {
      token: localStorage.getItem('omcli_token') || localStorage.getItem('kuronami_token') || null,
      user: null,
      settings: {
        preferred_audio: savedAudioMode,
        auto_next: savedAutoNext ? 1 : 0,
        auto_skip_intro: savedAutoSkip ? 1 : 0,
        auto_play: 1,
        preferred_quality: savedQuality
      }
    },
    player: null,
    currentAnime: null,
    currentEpisodeIndex: 0,
    currentMode: savedAudioMode,
    activeView: 'home',
    browseFilters: {
      search: '',
      sort: 'score',
      format: 'all',
      status: 'all',
      genre: 'All',
      viewMode: 'grid', // 'grid' | 'detailed' | 'compact'
      preset: 'trending'
    },
    spotlightList: [],
    spotlightIndex: 0,
    spotlightTimer: null,
    rawTrendingList: [],
    userWatchlist: [],
    userHistory: [],
    genresList: [
      'Action', 'Adventure', 'Comedy', 'Drama', 'Fantasy', 
      'Horror', 'Isekai', 'Mecha', 'Music', 'Mystery', 
      'Psychological', 'Romance', 'Sci-Fi', 'Shounen', 
      'Slice of Life', 'Sports', 'Supernatural', 'Thriller'
    ]
  };

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

  function isGenericPoster(p) {
    if (!p || typeof p !== 'string') return true;
    const s = p.trim().toLowerCase();
    return (
      s.length < 5 ||
      s === 'undefined' ||
      s === 'null' ||
      s === '/assets/hero_bg.jpg' ||
      s.endsWith('/hero_bg.jpg')
    );
  }

  // ============================================================================
  // DOM ELEMENT SELECTORS
  // ============================================================================

  // Views
  const views = {
    home: document.getElementById('home-view'),
    browse: document.getElementById('browse-view'),
    watch: document.getElementById('watch-view'),
    account: document.getElementById('account-view')
  };

  // Nav Elements
  const navTabs = document.querySelectorAll('.nav-tab');
  const navLogoBtn = document.getElementById('nav-logo-btn');
  const globalSearchInput = document.getElementById('global-search-input');
  const searchDropdown = document.getElementById('search-dropdown');
  const quickSubBtn = document.getElementById('quick-sub-btn');
  const quickDubBtn = document.getElementById('quick-dub-btn');
  const navGuestBlock = document.getElementById('nav-guest-block');
  const navUserBlock = document.getElementById('nav-user-block');
  const btnSignInNav = document.getElementById('btn-sign-in-nav');
  const btnLogout = document.getElementById('btn-logout');
  const navAvatarImg = document.getElementById('nav-avatar-img');
  const navUserName = document.getElementById('nav-user-name');
  const navUserTier = document.getElementById('nav-user-tier');
  const flyoutUserName = document.getElementById('flyout-user-name');
  const flyoutUserBadge = document.getElementById('flyout-user-badge');
  const flyoutUserEmail = document.getElementById('flyout-user-email');
  const flyoutWatchlistCount = document.getElementById('flyout-watchlist-count');
  const flyoutHistoryCount = document.getElementById('flyout-history-count');

  // Auth Modal Elements
  const authModal = document.getElementById('auth-modal');
  const authModalClose = document.getElementById('auth-modal-close');
  const btnAuthDemo = document.getElementById('btn-auth-demo');
  const tabAuthLogin = document.getElementById('tab-auth-login');
  const tabAuthRegister = document.getElementById('tab-auth-register');
  const formAuthLogin = document.getElementById('form-auth-login');
  const formAuthRegister = document.getElementById('form-auth-register');
  const authAlertBox = document.getElementById('auth-alert-box');
  const loginInputIdentity = document.getElementById('login-input-identity');
  const loginInputPassword = document.getElementById('login-input-password');
  const regInputUsername = document.getElementById('reg-input-username');
  const regInputEmail = document.getElementById('reg-input-email');
  const regInputPassword = document.getElementById('reg-input-password');

  // TV Link Modal Elements
  const tvLinkModal = document.getElementById('tv-link-modal');
  const tvLinkModalClose = document.getElementById('tv-link-modal-close');
  const btnOpenLinkTv = document.getElementById('btn-open-link-tv');
  const btnLinkTvGuest = document.getElementById('btn-link-tv-guest');
  const formTvLink = document.getElementById('form-tv-link');
  const inputTvCode = document.getElementById('input-tv-code');
  const tvLinkAlert = document.getElementById('tv-link-alert');
  const btnSubmitTvLink = document.getElementById('btn-submit-tv-link');

  // Home View Elements
  const heroBackdrop = document.getElementById('hero-backdrop');
  const heroRank = document.getElementById('hero-rank');
  const heroTitle = document.getElementById('hero-title');
  const heroStudioMeta = document.getElementById('hero-studio-meta');
  const heroScore = document.getElementById('hero-score');
  const heroYear = document.getElementById('hero-year');
  const heroFormat = document.getElementById('hero-format');
  const heroEpisodes = document.getElementById('hero-episodes');
  const heroGenres = document.getElementById('hero-genres');
  const heroDesc = document.getElementById('hero-desc');
  const heroPlayBtn = document.getElementById('hero-play-btn');
  const heroWatchlistBtn = document.getElementById('hero-watchlist-btn');
  const heroInfoBtn = document.getElementById('hero-info-btn');
  const heroIndicators = document.getElementById('hero-indicators');
  const genreBar = document.getElementById('genre-bar');
  const continueSection = document.getElementById('continue-watching-section');
  const continueGrid = document.getElementById('continue-grid');
  const trendingGrid = document.getElementById('trending-grid');
  const popularGrid = document.getElementById('popular-grid');
  const topRatedGrid = document.getElementById('top-rated-grid');

  // Browse View Elements
  const browseSearchInput = document.getElementById('browse-search-input');
  const browseClearBtn = document.getElementById('browse-clear-btn');
  const browseSortSelect = document.getElementById('browse-sort-select');
  const viewModeGrid = document.getElementById('view-mode-grid');
  const viewModeDetailed = document.getElementById('view-mode-detailed');
  const viewModeCompact = document.getElementById('view-mode-compact');
  const browseQuickChips = document.getElementById('browse-quick-chips');
  const browseResetFilters = document.getElementById('browse-reset-filters');
  const filterFormatGroup = document.getElementById('filter-format-group');
  const filterStatusGroup = document.getElementById('filter-status-group');
  const filterGenresMatrix = document.getElementById('filter-genres-matrix');
  const browseResultsCount = document.getElementById('browse-results-count');
  const browseResultsContainer = document.getElementById('browse-results-container');
  const browseActiveTags = document.getElementById('browse-active-tags');

  // Mobile UI & Navigation Elements
  const mobileNavBtns = document.querySelectorAll('.mobile-nav-btn');
  const mobileWatchlistBadge = document.getElementById('mobile-watchlist-badge');
  const btnMobileSearchToggle = document.getElementById('btn-mobile-search-toggle');
  const mobileSearchModal = document.getElementById('mobile-search-modal');
  const mobileSearchCloseBtn = document.getElementById('mobile-search-close-btn');
  const mobileSearchInput = document.getElementById('mobile-search-input');
  const mobileSearchClearBtn = document.getElementById('mobile-search-clear-btn');
  const mobileSearchResults = document.getElementById('mobile-search-results');
  const mobileQuickTags = document.querySelectorAll('.mobile-search-tag');

  // Mobile Browse Filter Drawer Elements
  const btnMobileFilterOpen = document.getElementById('btn-mobile-filter-open');
  const btnMobileFilterClose = document.getElementById('btn-mobile-filter-close');
  const btnMobileFilterApply = document.getElementById('btn-mobile-filter-apply');
  const browseFilterSidebar = document.getElementById('browse-filter-sidebar');
  const browseFilterDrawerBackdrop = document.getElementById('browse-filter-drawer-backdrop');
  const mobileBrowseSortSelect = document.getElementById('mobile-browse-sort-select');
  const mobileFilterCountBadge = document.getElementById('mobile-filter-count-badge');

  // Cinema Watch Room Elements
  const crumbAnimeGenre = document.getElementById('crumb-anime-genre');
  const crumbAnimeTitle = document.getElementById('crumb-anime-title');
  const crumbEpisodeNum = document.getElementById('crumb-episode-num');
  const btnShareRoom = document.getElementById('btn-share-room');
  const btnToggleWatchlist = document.getElementById('btn-toggle-watchlist');
  const iconWatchlistStatus = document.getElementById('icon-watchlist-status');
  const textWatchlistStatus = document.getElementById('text-watchlist-status');
  const btnTheaterMode = document.getElementById('btn-theater-mode');
  const playerGridLayout = document.getElementById('player-grid-layout');
  const btnStreamSub = document.getElementById('btn-stream-sub');
  const btnStreamDub = document.getElementById('btn-stream-dub');
  const btnStreamSubDown = document.getElementById('btn-stream-sub-down');
  const btnStreamDubDown = document.getElementById('btn-stream-dub-down');
  const btnFullscreenDown = document.getElementById('btn-fullscreen-down');
  const btnToggleCaptionsDown = document.getElementById('btn-toggle-captions-down');
  const textCaptionsStatus = document.getElementById('text-captions-status');
  const btnQualityDown = document.getElementById('btn-quality-down');
  const textCurrentQuality = document.getElementById('text-current-quality');
  const qualitySelectorWrap = document.getElementById('quality-selector-wrap');
  const qualityDropdownMenu = document.getElementById('quality-dropdown-menu');
  const currentEpTitle = document.getElementById('current-ep-title');
  const currentAnimeTitleSub = document.getElementById('current-anime-title-sub');
  const btnPlayPauseDown = document.getElementById('btn-play-pause-down');
  const btnSkipBackward10 = document.getElementById('btn-skip-backward-10');
  const btnSkipBackward5 = document.getElementById('btn-skip-backward-5');
  const btnSkipForward5 = document.getElementById('btn-skip-forward-5');
  const btnSkipForward10 = document.getElementById('btn-skip-forward-10');
  const btnSkipIntro = document.getElementById('btn-skip-intro');
  const btnPrevEp = document.getElementById('btn-prev-ep');
  const btnNextEp = document.getElementById('btn-next-ep');
  const detailPosterImg = document.getElementById('detail-poster-img');
  const detailAnimeTitle = document.getElementById('detail-anime-title');
  const detailAnimeScore = document.getElementById('detail-anime-score');
  const detailAnimeNative = document.getElementById('detail-anime-native');
  const detailTagsContainer = document.getElementById('detail-tags-container');
  const detailSynopsisText = document.getElementById('detail-synopsis-text');
  const episodesTotalCount = document.getElementById('episodes-total-count');
  const episodeSearchFilter = document.getElementById('episode-search-filter');
  const rangeTabsContainer = document.getElementById('range-tabs-container');
  const episodesScrollList = document.getElementById('episodes-scroll-list');
  const recsListContainer = document.getElementById('recs-list-container');

  // Account View Elements
  const accountAvatarImg = document.getElementById('account-avatar-img');
  const accountLevelBadge = document.getElementById('account-level-badge');
  const accountUserName = document.getElementById('account-user-name');
  const accountHandle = document.getElementById('account-handle');
  const accountTierBadge = document.getElementById('account-tier-badge');
  const accountEmail = document.getElementById('account-email');
  const btnAccountLogout = document.getElementById('btn-account-logout');
  const statTotalEpisodes = document.getElementById('stat-total-episodes');
  const statTotalDays = document.getElementById('stat-total-days');
  const statCompletedShows = document.getElementById('stat-completed-shows');
  const statWatchlistCount = document.getElementById('stat-watchlist-count');
  const accountSubTabs = document.getElementById('account-sub-tabs');
  const watchlistStatusChips = document.getElementById('watchlist-status-chips');
  const watchlistCountBadge = document.getElementById('watchlist-count-badge');
  const accountWatchlistGrid = document.getElementById('account-watchlist-grid');
  const btnClearAllHistory = document.getElementById('btn-clear-all-history');
  const accountHistoryList = document.getElementById('account-history-list');
  const prefAudio = document.getElementById('pref-audio');
  const prefQuality = document.getElementById('pref-quality');
  const prefSkipIntro = document.getElementById('pref-skip-intro');
  const prefAutoNext = document.getElementById('pref-auto-next');
  const btnSavePreferences = document.getElementById('btn-save-preferences');
  const accInputUsername = document.getElementById('acc-input-username');
  const accInputEmail = document.getElementById('acc-input-email');
  const btnAccLogoutBottom = document.getElementById('btn-acc-logout-bottom');
  const btnDeleteAccount = document.getElementById('btn-delete-account');

  // Toast Container
  const toastContainer = document.getElementById('toast-container');

  // ============================================================================
  // INITIALIZATION & PLAYER INSTANTIATION
  // ============================================================================

  state.player = new window.AnimePlayer('#artplayer-mount');
  state.player.autoNext = savedAutoNext;
  state.player.onNextEpisode = () => playNextEpisode();
  state.player.onPrevEpisode = () => playPrevEpisode();
  state.player.onToggleMode = () => switchGlobalAudio(state.currentMode === 'sub' ? 'dub' : 'sub');
  window.appState = state;
  window.artplayerInstance = state.player;

  // Captions Toggle Sync
  state.player.onCaptionsToggle = (isEnabled) => {
    if (textCaptionsStatus) {
      textCaptionsStatus.textContent = isEnabled ? 'CC ON' : 'CC OFF';
    }
    if (btnToggleCaptionsDown) {
      btnToggleCaptionsDown.classList.toggle('text-secondary', isEnabled);
      btnToggleCaptionsDown.classList.toggle('text-gray-400', !isEnabled);
      btnToggleCaptionsDown.classList.toggle('line-through', !isEnabled);
      btnToggleCaptionsDown.classList.toggle('opacity-60', !isEnabled);
    }
    showToast(isEnabled ? 'Captions Enabled' : 'Captions Disabled', 'info');
  };

  // Quality List & Change Sync
  state.player.onQualityList = (levels, currentLevel) => {
    if (!qualityDropdownMenu) return;
    qualityDropdownMenu.innerHTML = levels.map(lvl => {
      const isSelected = lvl.level === currentLevel;
      return `
        <button class="quality-opt-btn px-2.5 py-1.5 text-left rounded-lg text-xs font-mono font-bold transition-all ${isSelected ? 'bg-primary-container text-white' : 'text-gray-300 hover:bg-surface-container-high hover:text-white'}" data-level="${lvl.level}">
          ${lvl.html}
        </button>
      `;
    }).join('');

    qualityDropdownMenu.querySelectorAll('.quality-opt-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const lvl = parseInt(btn.dataset.level);
        state.player.setQuality(lvl);
        qualityDropdownMenu.classList.add('hidden');
      });
    });
  };

  state.player.onQualityChange = (levelIndex, label) => {
    if (textCurrentQuality) {
      textCurrentQuality.textContent = `Quality: ${label}`;
    }
    if (qualityDropdownMenu) {
      qualityDropdownMenu.querySelectorAll('.quality-opt-btn').forEach(btn => {
        const isMatch = parseInt(btn.dataset.level) === levelIndex;
        btn.className = `quality-opt-btn px-2.5 py-1.5 text-left rounded-lg text-xs font-mono font-bold transition-all ${isMatch ? 'bg-primary-container text-white' : 'text-gray-300 hover:bg-surface-container-high hover:text-white'}`;
      });
    }
    showToast(`Streaming Quality: ${label}`, 'info');
  };

  // Stop video & audio when user unloads or leaves tab, flushing latest progress
  window.addEventListener('beforeunload', () => {
    if (state.player && state.player.art && state.player.art.currentTime > 2 && state.currentAnime) {
      recordWatchProgress(state.player.art.currentTime, state.player.art.duration);
    }
    if (state.player) state.player.stop();
  });
  window.addEventListener('pagehide', () => {
    if (state.player && state.player.art && state.player.art.currentTime > 2 && state.currentAnime) {
      recordWatchProgress(state.player.art.currentTime, state.player.art.duration);
    }
    if (state.player) state.player.stop();
  });

  // Progress sync debouncer
  let lastSyncTime = 0;
  state.player.onTimeUpdate = (currentTime, duration) => {
    const now = Date.now();
    if (now - lastSyncTime > 3000 && state.currentAnime && currentTime > 1) {
      lastSyncTime = now;
      recordWatchProgress(currentTime, duration);
    }
  };

  // Build Genre Checkboxes in Browse Filter Sidebar
  buildGenreMatrix();

  window.getWatchUrl = (animeId, ep = 1, t = 0) => {
    const mode = state.currentMode || localStorage.getItem('omcli_preferred_audio') || 'sub';
    const cleanTime = Math.round(Number(t) || 0);
    return `#watch?anime=${animeId}&ep=${ep}${cleanTime > 0 ? `&t=${cleanTime}` : ''}&mode=${mode}`;
  };

  // Prevent automatic browser scroll restoration (stops automatic scrolling down to footer)
  if ('scrollRestoration' in history) {
    history.scrollRestoration = 'manual';
  }

  window.navigateToWatch = (animeId, ep = 1, t = 0) => {
    const mode = state.currentMode || localStorage.getItem('omcli_preferred_audio') || 'sub';
    const cleanTime = Math.round(Number(t) || 0);
    window.scrollTo(0, 0);
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
    navigateTo(`watch?anime=${animeId}&ep=${ep}${cleanTime > 0 ? `&t=${cleanTime}` : ''}&mode=${mode}`);
  };

  // Safe initial default for hero play button
  if (heroPlayBtn) {
    heroPlayBtn.onclick = () => navigateTo(`watch?anime=20&ep=1&mode=${state.currentMode}`);
  }

  // Initialize Auth & Data
  initAuth().then(() => {
    initRouting();
    loadHomeFeed();
  });

  // ============================================================================
  // AUTHENTICATION MODULE
  // ============================================================================

  async function initAuth() {
    // Proactively purge any corrupt ghost entries from local history
    try {
      let localHist = JSON.parse(localStorage.getItem('omcli_local_history') || '[]');
      if (Array.isArray(localHist) && localHist.length > 0) {
        const cleaned = localHist.filter(h => {
          const title = h.anime_title || h.title || '';
          const poster = h.poster || h.poster_image || '';
          const aid = String(h.anime_id || h.animeId || '');
          return !isGenericTitle(title) && !isGenericPoster(poster) && aid && aid !== 'undefined' && aid !== 'null';
        });
        if (cleaned.length !== localHist.length) {
          localStorage.setItem('omcli_local_history', JSON.stringify(cleaned));
        }
      }
    } catch (_) {}

    // Apply immediate local preference to all UI buttons & settings inputs
    updateAudioButtons(state.currentMode);
    if (prefAudio) prefAudio.value = state.currentMode;
    if (prefAutoNext) prefAutoNext.checked = savedAutoNext;
    if (prefSkipIntro) prefSkipIntro.checked = savedAutoSkip;
    if (prefQuality) prefQuality.value = savedQuality;

    if (!state.auth.token) {
      updateAuthUI(null);
      return;
    }

    try {
      const res = await fetch('/api/auth/me', {
        headers: { 'Authorization': `Bearer ${state.auth.token}` }
      });
      const data = await res.json();

      if (data.success && data.user) {
        state.auth.user = data.user;
        updateAuthUI(data.user);
        await loadUserSettings();
      } else {
        // Token invalid or expired
        clearAuth();
      }
    } catch (err) {
      console.warn('[Auth] Check failed:', err);
      clearAuth();
    }
  }

  function clearAuth() {
    state.auth.token = null;
    state.auth.user = null;
    localStorage.removeItem('omcli_token');
    localStorage.removeItem('kuronami_token');
    updateAuthUI(null);
  }

  function setAuth(token, user) {
    state.auth.token = token;
    state.auth.user = user;
    localStorage.setItem('omcli_token', token);
    updateAuthUI(user);
    loadUserSettings();
    loadContinueWatching();
    showToast(`Welcome back, ${user.username}!`, 'success');
  }

  function updateAuthUI(user) {
    if (user) {
      navGuestBlock.classList.add('hidden');
      navUserBlock.classList.remove('hidden');

      const avatar = user.avatar || 'https://api.dicebear.com/7.x/bottts-neutral/svg?seed=Alex';
      navAvatarImg.src = avatar;
      navUserName.textContent = user.username;
      navUserTier.textContent = `LVL ${user.level || 42} OTAKU`;
      flyoutUserName.textContent = user.username;
      flyoutUserBadge.textContent = '100% FREE';
      flyoutUserEmail.textContent = user.email || `${user.username.toLowerCase()}@omcli.io`;

      // Update Account View Info
      accountAvatarImg.src = avatar;
      accountLevelBadge.innerHTML = `<span class="material-symbols-outlined text-[12px]">military_tech</span> LVL ${user.level || 42}`;
      accountUserName.textContent = user.username;
      accountHandle.textContent = `@${user.username.toLowerCase().replace(/\s+/g, '_')}`;
      accountTierBadge.innerHTML = `<span class="material-symbols-outlined text-[14px]">verified</span> Community Otaku`;
      accountEmail.textContent = user.email || `${user.username.toLowerCase()}@omcli.io`;
      const accountTokenId = document.getElementById('account-token-id');
      if (accountTokenId) accountTokenId.textContent = `#USER-${user.id || 'SYNC'}`;
      accInputUsername.value = user.username;
      accInputEmail.value = user.email || '';
    } else {
      navGuestBlock.classList.remove('hidden');
      navUserBlock.classList.add('hidden');
    }
  }

  async function loadUserSettings() {
    if (!state.auth.token) {
      const localAudio = localStorage.getItem('omcli_preferred_audio') || localStorage.getItem('omcli_audio_mode') || 'sub';
      state.currentMode = localAudio;
      updateAudioButtons(localAudio);
      if (prefAudio) prefAudio.value = localAudio;
      return;
    }
    try {
      const res = await fetch('/api/user/settings', {
        headers: { 'Authorization': `Bearer ${state.auth.token}` }
      });
      const json = await res.json();
      if (json.success && json.data) {
        state.auth.settings = json.data;
        const cloudAudio = json.data.preferred_audio || json.data.preferredAudio;
        if (cloudAudio && (cloudAudio === 'sub' || cloudAudio === 'dub')) {
          state.currentMode = cloudAudio;
          localStorage.setItem('omcli_preferred_audio', cloudAudio);
          localStorage.setItem('omcli_audio_mode', cloudAudio);
        }
        updateAudioButtons(state.currentMode);

        const autoNextVal = json.data.auto_next !== undefined ? json.data.auto_next : json.data.autoNext;
        if (autoNextVal !== undefined) {
          const isNext = !!autoNextVal;
          localStorage.setItem('omcli_auto_next', isNext ? '1' : '0');
          if (state.player) state.player.autoNext = isNext;
          if (prefAutoNext) prefAutoNext.checked = isNext;
        }

        const skipVal = json.data.auto_skip_intro !== undefined ? json.data.auto_skip_intro : json.data.autoSkipIntro;
        if (skipVal !== undefined) {
          if (prefSkipIntro) prefSkipIntro.checked = !!skipVal;
          localStorage.setItem('omcli_skip_intro', skipVal ? '1' : '0');
        }

        if (prefAudio) prefAudio.value = state.currentMode;
        if (prefQuality) prefQuality.value = json.data.preferred_quality || json.data.preferredQuality || 'auto';
      }
    } catch (err) {
      console.warn('[Settings] Load failed:', err);
    }
  }

  // Auth Modal Listeners
  btnSignInNav.addEventListener('click', () => openAuthModal('login'));
  authModalClose.addEventListener('click', closeAuthModal);
  authModal.addEventListener('click', (e) => {
    if (e.target === authModal) closeAuthModal();
  });

  tabAuthLogin.addEventListener('click', () => switchAuthTab('login'));
  tabAuthRegister.addEventListener('click', () => switchAuthTab('register'));

  function openAuthModal(mode = 'login') {
    authAlertBox.classList.add('hidden');
    authAlertBox.textContent = '';
    switchAuthTab(mode);
    authModal.classList.remove('hidden');
  }

  function closeAuthModal() {
    authModal.classList.add('hidden');
  }

  function switchAuthTab(mode) {
    if (mode === 'login') {
      tabAuthLogin.className = 'flex-1 py-2 rounded-lg font-mono text-xs font-bold text-white bg-surface-container-high shadow-sm transition-all';
      tabAuthRegister.className = 'flex-1 py-2 rounded-lg font-mono text-xs font-bold text-gray-400 hover:text-white transition-all';
      formAuthLogin.classList.remove('hidden');
      formAuthRegister.classList.add('hidden');
    } else {
      tabAuthRegister.className = 'flex-1 py-2 rounded-lg font-mono text-xs font-bold text-white bg-surface-container-high shadow-sm transition-all';
      tabAuthLogin.className = 'flex-1 py-2 rounded-lg font-mono text-xs font-bold text-gray-400 hover:text-white transition-all';
      formAuthRegister.classList.remove('hidden');
      formAuthLogin.classList.add('hidden');
    }
  }

  // 1-Click Demo Login (Alex Mercer)
  btnAuthDemo.addEventListener('click', async () => {
    try {
      btnAuthDemo.disabled = true;
      btnAuthDemo.innerHTML = '<span class="material-symbols-outlined text-[16px] animate-spin">refresh</span> Logging in as Alex Mercer...';

      const res = await fetch('/api/auth/demo', { method: 'POST' });
      const json = await res.json();

      if (json.success && json.token) {
        setAuth(json.token, json.user);
        closeAuthModal();
      } else {
        throw new Error(json.error || 'Demo login failed');
      }
    } catch (err) {
      showAuthAlert(err.message);
    } finally {
      btnAuthDemo.disabled = false;
      btnAuthDemo.innerHTML = '<span class="material-symbols-outlined text-[16px]">bolt</span> 1-Click Demo Login (Alex Mercer - LVL 42)';
    }
  });

  // Login Form Submit
  formAuthLogin.addEventListener('submit', async (e) => {
    e.preventDefault();
    const identity = loginInputIdentity.value.trim();
    const password = loginInputPassword.value;

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ login: identity, password })
      });
      const json = await res.json();

      if (json.success && json.token) {
        setAuth(json.token, json.user);
        closeAuthModal();
      } else {
        throw new Error(json.error || 'Invalid credentials');
      }
    } catch (err) {
      showAuthAlert(err.message);
    }
  });

  // Register Form Submit
  formAuthRegister.addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = regInputUsername.value.trim();
    const email = regInputEmail.value.trim();
    const password = regInputPassword.value;

    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, email, password })
      });
      const json = await res.json();

      if (json.success && json.token) {
        setAuth(json.token, json.user);
        closeAuthModal();
      } else {
        throw new Error(json.error || 'Registration failed');
      }
    } catch (err) {
      showAuthAlert(err.message);
    }
  });

  function showAuthAlert(msg) {
    authAlertBox.textContent = msg;
    authAlertBox.classList.remove('hidden');
  }

  // Logout Handlers
  btnLogout.addEventListener('click', handleLogout);
  btnAccountLogout.addEventListener('click', handleLogout);
  btnAccLogoutBottom.addEventListener('click', handleLogout);

  async function handleLogout() {
    if (state.auth.token) {
      try {
        await fetch('/api/auth/logout', {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${state.auth.token}` }
        });
      } catch {}
    }
    clearAuth();
    showToast('Logged out successfully', 'info');
    navigateTo('home');
  }

  // --- TV Link Modal Handlers ---
  function openTvLinkModal() {
    if (!state.auth.token) {
      openAuthModal();
      showAuthAlert('Please sign in or create an account first to link your Android TV.');
      return;
    }
    if (tvLinkAlert) {
      tvLinkAlert.classList.add('hidden');
      tvLinkAlert.textContent = '';
    }
    if (inputTvCode) inputTvCode.value = '';
    if (tvLinkModal) tvLinkModal.classList.remove('hidden');
    if (inputTvCode) inputTvCode.focus();
  }

  function closeTvLinkModal() {
    if (tvLinkModal) tvLinkModal.classList.add('hidden');
  }

  if (btnOpenLinkTv) btnOpenLinkTv.addEventListener('click', openTvLinkModal);
  if (btnLinkTvGuest) btnLinkTvGuest.addEventListener('click', openTvLinkModal);
  if (tvLinkModalClose) tvLinkModalClose.addEventListener('click', closeTvLinkModal);
  if (tvLinkModal) {
    tvLinkModal.addEventListener('click', (e) => {
      if (e.target === tvLinkModal) closeTvLinkModal();
    });
  }

  if (inputTvCode) {
    inputTvCode.addEventListener('input', (e) => {
      let val = e.target.value.toUpperCase().replace(/[^23456789ABCDEFGHJKLMNPQRSTUVWXYZ]/g, '');
      if (val.length > 3) {
        val = val.slice(0, 3) + '-' + val.slice(3, 6);
      }
      e.target.value = val;
    });
  }

  if (formTvLink) {
    formTvLink.addEventListener('submit', async (e) => {
      e.preventDefault();
      const code = inputTvCode.value.trim().toUpperCase().replace(/[\s-]/g, '');
      if (!code || code.length < 4) {
        showTvLinkAlert('Please enter a valid 6-character code', false);
        return;
      }

      try {
        btnSubmitTvLink.disabled = true;
        btnSubmitTvLink.innerHTML = '<span class="material-symbols-outlined text-[18px] animate-spin">refresh</span> Linking TV...';

        const res = await fetch('/api/auth/tv-code/pair', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${state.auth.token}`
          },
          body: JSON.stringify({ code })
        });
        const json = await res.json();

        if (json.success) {
          showTvLinkAlert(`🎉 ${json.message || 'TV successfully linked!'}`, true);
          showToast(`TV successfully linked to account: ${state.auth.user?.username || 'You'}!`, 'success');
          setTimeout(() => {
            closeTvLinkModal();
          }, 2500);
        } else {
          throw new Error(json.error || 'Failed to link TV');
        }
      } catch (err) {
        showTvLinkAlert(err.message, false);
      } finally {
        btnSubmitTvLink.disabled = false;
        btnSubmitTvLink.innerHTML = '<span class="material-symbols-outlined text-[18px]">sync_alt</span> <span>Connect & Sync TV</span>';
      }
    });
  }

  function showTvLinkAlert(msg, isSuccess) {
    if (!tvLinkAlert) return;
    tvLinkAlert.textContent = msg;
    tvLinkAlert.className = `p-3 rounded-lg text-xs font-mono font-medium ${isSuccess ? 'bg-emerald-500/15 border border-emerald-500/30 text-emerald-400' : 'bg-red-500/10 border border-red-500/30 text-red-400'}`;
    tvLinkAlert.classList.remove('hidden');
  }

  // Support directly opening via URL hash #tv or /tv
  if (window.location.hash === '#tv' || window.location.hash === '#link-tv' || window.location.pathname === '/tv') {
    setTimeout(openTvLinkModal, 400);
  }

  // ============================================================================
  // ROUTING & SPA VIEW MANAGEMENT
  // ============================================================================

  function initRouting() {
    window.addEventListener('hashchange', handleRoute);
    navLogoBtn.addEventListener('click', (e) => { e.preventDefault(); navigateTo('home'); });

    navTabs.forEach(tab => {
      tab.addEventListener('click', (e) => {
        e.preventDefault();
        const target = tab.dataset.nav;
        navigateTo(target);
      });
    });

    mobileNavBtns.forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        const target = btn.dataset.nav;
        navigateTo(target);
      });
    });

    // Initial Route
    handleRoute();
  }

  function navigateTo(hashPath) {
    window.scrollTo(0, 0);
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
    window.location.hash = hashPath;
  }

  function handleRoute() {
    const rawHash = window.location.hash.slice(1) || 'home';
    const [path, queryStr] = rawHash.split('?');
    const params = new URLSearchParams(queryStr || '');

    // STOP AUDIO / VIDEO PLAYBACK IMMEDIATELY IF LEAVING WATCH VIEW!
    if (path !== 'watch' && state.player) {
      if (state.player.art && state.player.art.currentTime > 2 && state.currentAnime) {
        recordWatchProgress(state.player.art.currentTime, state.player.art.duration);
      }
      state.player.stop();
      state.currentAnime = null;
    }

    // Auto-close any mobile overlays on route navigation
    if (mobileSearchModal) {
      mobileSearchModal.classList.add('hidden');
      mobileSearchModal.classList.remove('flex');
    }
    if (browseFilterSidebar) {
      browseFilterSidebar.classList.add('hidden');
      browseFilterSidebar.classList.remove('flex');
    }
    if (browseFilterDrawerBackdrop) {
      browseFilterDrawerBackdrop.classList.add('hidden');
    }
    document.body.classList.remove('overflow-hidden');

    // Hide all views
    Object.values(views).forEach(v => {
      if (v) v.classList.add('hidden');
    });

    // Update active desktop nav tabs
    navTabs.forEach(tab => {
      const isTarget = tab.dataset.nav === path || 
        (path.startsWith('account') && tab.dataset.nav === 'account') ||
        (path === 'watchlist' && tab.dataset.nav === 'watchlist');
      
      if (isTarget) {
        tab.className = 'nav-tab px-3.5 py-2 rounded-lg text-sm font-semibold text-white bg-surface-container-high transition-all';
      } else {
        tab.className = 'nav-tab px-3.5 py-2 rounded-lg text-sm font-medium text-gray-400 hover:text-white hover:bg-surface-container transition-all';
      }
    });

    // Update active mobile bottom nav buttons
    mobileNavBtns.forEach(btn => {
      const isTarget = btn.dataset.nav === path || 
        (path.startsWith('account') && btn.dataset.nav === 'account') ||
        (path === 'watchlist' && btn.dataset.nav === 'watchlist');
      
      if (isTarget) {
        btn.classList.add('active');
        btn.classList.remove('text-gray-400');
        btn.classList.add('text-primary');
      } else {
        btn.classList.remove('active');
        btn.classList.remove('text-primary');
        btn.classList.add('text-gray-400');
      }
    });

    state.activeView = path;
    window.scrollTo(0, 0);
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;

    if (path === 'home') {
      document.title = 'Om CLI — Watch Anime Free in HD | Dual-Audio HLS & Android TV Sync';
      views.home.classList.remove('hidden');
      loadContinueWatching();
    } else if (path === 'browse') {
      views.browse.classList.remove('hidden');
      const searchParam = params.get('search');
      const genreParam = params.get('genre');
      const sortParam = params.get('sort');
      const formatParam = params.get('format');
      const statusParam = params.get('status');

      if (genreParam && genreParam !== 'All') {
        document.title = `${genreParam} Anime — Stream Free in HD | Om CLI`;
      } else if (searchParam) {
        document.title = `Search: "${searchParam}" — Om CLI Anime`;
      } else {
        document.title = 'Browse Anime Catalog & Seasonal Releases | Om CLI';
      }

      if (queryStr) {
        state.browseFilters.search = searchParam || '';
        state.browseFilters.genre = genreParam || 'All';
        state.browseFilters.sort = sortParam || state.browseFilters.sort || 'score';
        state.browseFilters.format = formatParam || 'all';
        state.browseFilters.status = statusParam || 'all';
      } else {
        // Fresh navigation to browse catalog without query parameters: reset to defaults
        state.browseFilters.search = '';
        state.browseFilters.genre = 'All';
        state.browseFilters.format = 'all';
        state.browseFilters.status = 'all';
        state.browseFilters.sort = 'score';
      }

      syncFilterUIWithState();
      executeBrowse();
    } else if (path === 'watch') {
      views.watch.classList.remove('hidden');
      const animeId = params.get('anime') || params.get('id');
      const epNum = parseInt(params.get('ep')) || 1;
      const requestedMode = params.get('mode');
      const mode = (requestedMode === 'sub' || requestedMode === 'dub')
        ? requestedMode
        : (state.currentMode || localStorage.getItem('omcli_preferred_audio') || 'sub');
      state.currentMode = mode;
      updateAudioButtons(mode);
      const startTime = parseFloat(params.get('t')) || 0;
      if (animeId) {
        if (state.currentAnime && String(state.currentAnime.id) === String(animeId)) {
          // Anime already loaded in current watch room, simply switch episode
          if (state.currentEpisodeIndex !== epNum - 1 || state.currentMode !== mode) {
            window.playEpisodeAtIndex(epNum - 1, startTime);
          }
        } else {
          loadWatchRoom(animeId, epNum, mode, startTime);
        }
      } else {
        navigateTo('home');
      }
    } else if (path === 'watchlist') {
      document.title = 'My Anime Watchlist & Synced Library | Om CLI';
      views.account.classList.remove('hidden');
      switchAccountTab('watchlist');
      loadAccountData();
    } else if (path === 'account' || path.startsWith('account-')) {
      document.title = 'Account Profile & Playback Preferences | Om CLI';
      views.account.classList.remove('hidden');
      const sub = path.replace('account-', '') || 'watchlist';
      switchAccountTab(sub);
      loadAccountData();
    } else {
      views.home.classList.remove('hidden');
    }
  }

  // ============================================================================
  // AUDIO MODE CONTROLS (SUB / DUB) & FULLSCREEN
  // ============================================================================

  quickSubBtn.addEventListener('click', () => switchGlobalAudio('sub'));
  quickDubBtn.addEventListener('click', () => switchGlobalAudio('dub'));
  btnStreamSub.addEventListener('click', () => switchGlobalAudio('sub'));
  btnStreamDub.addEventListener('click', () => switchGlobalAudio('dub'));

  // Down Audio Controls
  if (btnStreamSubDown) btnStreamSubDown.addEventListener('click', () => switchGlobalAudio('sub'));
  if (btnStreamDubDown) btnStreamDubDown.addEventListener('click', () => switchGlobalAudio('dub'));

  // Down Captions Disable/Enable Button
  if (btnToggleCaptionsDown) {
    btnToggleCaptionsDown.addEventListener('click', () => {
      if (state.player) {
        state.player.toggleCaptions();
      }
    });
  }

  // Down Streaming Quality Selector Menu
  if (btnQualityDown && qualityDropdownMenu) {
    btnQualityDown.addEventListener('click', (e) => {
      e.stopPropagation();
      qualityDropdownMenu.classList.toggle('hidden');
    });

    qualityDropdownMenu.querySelectorAll('.quality-opt-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const lvl = parseInt(btn.dataset.level);
        if (state.player && typeof state.player.setQuality === 'function') {
          state.player.setQuality(lvl);
        }
        qualityDropdownMenu.classList.add('hidden');
      });
    });

    document.addEventListener('click', (e) => {
      if (qualitySelectorWrap && !qualitySelectorWrap.contains(e.target)) {
        qualityDropdownMenu.classList.add('hidden');
      }
    });
  }

  // Down Fullscreen ("Make Again Full Big") Button
  if (btnFullscreenDown) {
    btnFullscreenDown.addEventListener('click', () => {
      if (state.player && typeof state.player.toggleFullscreen === 'function') {
        state.player.toggleFullscreen();
      } else if (state.player && state.player.art) {
        state.player.art.fullscreen = !state.player.art.fullscreen;
      }
    });
  }

  // Auto-Orientation Sensor: Automatically enters fullscreen when phone is turned landscape, and exits in portrait
  function setupAutoOrientationFullscreen() {
    const isMobileDevice = window.matchMedia('(pointer: coarse)').matches && /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
    if (!isMobileDevice) return;

    let orientationTimeout = null;
    const handleOrientation = () => {
      clearTimeout(orientationTimeout);
      orientationTimeout = setTimeout(() => {
        if (state.activeView !== 'watch' || !state.player || !state.player.art) return;
        const isLandscape = (window.screen?.orientation && window.screen.orientation.type.startsWith('landscape')) ||
          (typeof window.orientation === 'number' && Math.abs(window.orientation) === 90) ||
          (window.innerWidth > window.innerHeight && window.matchMedia('(orientation: landscape)').matches);

        const isCurrentlyFull = !!(
          document.fullscreenElement ||
          document.webkitFullscreenElement ||
          state.player.art.fullscreen ||
          state.player.art.fullscreenWeb ||
          document.body.classList.contains('player-in-fullscreen')
        );

        if (isLandscape && !isCurrentlyFull) {
          state.player.enterFullscreen();
        } else if (!isLandscape && isCurrentlyFull) {
          state.player.exitFullscreen();
        }
      }, 200);
    };

    if (window.screen && window.screen.orientation) {
      window.screen.orientation.addEventListener('change', handleOrientation);
    }
    window.addEventListener('orientationchange', handleOrientation);
    window.addEventListener('resize', handleOrientation);
  }
  setupAutoOrientationFullscreen();

  function switchGlobalAudio(mode) {
    const cleanMode = String(mode).toLowerCase() === 'dub' ? 'dub' : 'sub';
    state.currentMode = cleanMode;
    localStorage.setItem('omcli_preferred_audio', cleanMode);
    localStorage.setItem('omcli_audio_mode', cleanMode);
    updateAudioButtons(cleanMode);
    if (prefAudio) prefAudio.value = cleanMode;

    // Sync in background to cloud if authenticated
    if (state.auth && state.auth.token) {
      fetch('/api/user/settings', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${state.auth.token}`
        },
        body: JSON.stringify({ preferred_audio: cleanMode, preferredAudio: cleanMode })
      }).catch(() => {});
    }

    // If currently playing in watch room, reload stream with updated mode preserving timestamp
    if (state.activeView === 'watch' && state.currentAnime) {
      const episodes = state.currentAnime.episodes || [];
      const ep = episodes[state.currentEpisodeIndex];
      if (ep) {
        const currentTime = (state.player && state.player.art) ? state.player.art.currentTime : 0;
        const epNum = ep.number || state.currentEpisodeIndex + 1;
        try {
          history.replaceState(null, '', `#watch?anime=${state.currentAnime.id}&ep=${epNum}&mode=${cleanMode}`);
        } catch {}
        state.player.loadStream(ep.id, cleanMode, state.currentAnime.bannerImage || state.currentAnime.coverImage?.extraLarge, currentTime);
      }
    }
  }

  function updateAudioButtons(mode) {
    const isSub = mode === 'sub';

    // Quick Navbar switch
    quickSubBtn.className = isSub 
      ? 'px-2.5 py-1 rounded text-xs font-mono font-bold transition-all bg-secondary-container text-on-secondary-container shadow-sm' 
      : 'px-2.5 py-1 rounded text-xs font-mono font-bold transition-all text-gray-400 hover:text-white';
    quickDubBtn.className = !isSub 
      ? 'px-2.5 py-1 rounded text-xs font-mono font-bold transition-all bg-secondary-container text-on-secondary-container shadow-sm' 
      : 'px-2.5 py-1 rounded text-xs font-mono font-bold transition-all text-gray-400 hover:text-white';

    // Top watch room switch
    btnStreamSub.className = isSub
      ? 'flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-secondary text-on-secondary font-mono text-xs font-bold shadow-sm transition-all'
      : 'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-gray-400 hover:text-white font-mono text-xs font-bold transition-all';
    btnStreamDub.className = !isSub
      ? 'flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-secondary text-on-secondary font-mono text-xs font-bold shadow-sm transition-all'
      : 'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-gray-400 hover:text-white font-mono text-xs font-bold transition-all';

    // Down watch room switch
    if (btnStreamSubDown && btnStreamDubDown) {
      btnStreamSubDown.className = isSub
        ? 'flex items-center gap-1 px-2.5 py-1 rounded-md bg-secondary text-on-secondary font-mono text-xs font-bold shadow-sm transition-all'
        : 'flex items-center gap-1 px-2.5 py-1 rounded-md text-gray-400 hover:text-white font-mono text-xs font-bold transition-all';
      btnStreamDubDown.className = !isSub
        ? 'flex items-center gap-1 px-2.5 py-1 rounded-md bg-secondary text-on-secondary font-mono text-xs font-bold shadow-sm transition-all'
        : 'flex items-center gap-1 px-2.5 py-1 rounded-md text-gray-400 hover:text-white font-mono text-xs font-bold transition-all';
    }
  }

  // ============================================================================
  // HOME DISCOVERY MODULE
  // ============================================================================

  async function loadHomeFeed() {
    // 1. Trending Feed & Spotlight
    try {
      let trendingItems = [];
      const res = await fetch('/api/trending').catch(() => null);
      if (res && res.ok) {
        const json = await res.json().catch(() => ({}));
        if (json.success && Array.isArray(json.data) && json.data.length > 0) {
          trendingItems = json.data;
        }
      }
      if (!trendingItems.length && window.AniListClient) {
        trendingItems = await window.AniListClient.getTrending(1, 20).catch(() => []);
      }

      if (trendingItems.length > 0) {
        state.rawTrendingList = trendingItems;
        state.spotlightList = trendingItems.slice(0, 5);
        initHeroSpotlight();
        renderAnimeCards(trendingGrid, trendingItems);
      }
    } catch (err) {
      console.error('[Feed] Trending error:', err);
    }

    // 2. Popular Feed
    (async () => {
      try {
        let popItems = [];
        const res = await fetch('/api/popular').catch(() => null);
        if (res && res.ok) {
          const json = await res.json().catch(() => ({}));
          if (json.success && Array.isArray(json.data) && json.data.length > 0) popItems = json.data;
        }
        if (!popItems.length && window.AniListClient) {
          popItems = await window.AniListClient.getPopular(1, 20).catch(() => []);
        }
        if (popItems.length > 0) renderAnimeCards(popularGrid, popItems);
      } catch (e) {
        console.error('[Feed] Popular error:', e);
      }
    })();

    // 3. Top Rated Feed
    (async () => {
      try {
        let topItems = [];
        const res = await fetch('/api/top-rated').catch(() => null);
        if (res && res.ok) {
          const json = await res.json().catch(() => ({}));
          if (json.success && Array.isArray(json.data) && json.data.length > 0) topItems = json.data;
        }
        if (!topItems.length && window.AniListClient) {
          topItems = await window.AniListClient.getTopRated(1, 20).catch(() => []);
        }
        if (topItems.length > 0) renderAnimeCards(topRatedGrid, topItems);
      } catch (e) {
        console.error('[Feed] Top rated error:', e);
      }
    })();
  }

  function initHeroSpotlight() {
    if (!state.spotlightList.length) return;
    renderHeroSpotlight(0);

    // Build indicator dots
    heroIndicators.innerHTML = state.spotlightList.map((_, idx) => `
      <button class="hero-dot w-6 h-1.5 rounded-full ${idx === 0 ? 'bg-primary-container w-10' : 'bg-surface-container-high'} transition-all cursor-pointer" data-index="${idx}"></button>
    `).join('');

    heroIndicators.querySelectorAll('.hero-dot').forEach(btn => {
      btn.addEventListener('click', () => {
        clearInterval(state.spotlightTimer);
        const idx = parseInt(btn.dataset.index);
        renderHeroSpotlight(idx);
        startSpotlightTimer();
      });
    });

    startSpotlightTimer();
  }

  function startSpotlightTimer() {
    clearInterval(state.spotlightTimer);
    state.spotlightTimer = setInterval(() => {
      state.spotlightIndex = (state.spotlightIndex + 1) % state.spotlightList.length;
      renderHeroSpotlight(state.spotlightIndex);
    }, 8000);
  }

  function renderHeroSpotlight(index) {
    const item = state.spotlightList[index];
    if (!item) return;

    state.spotlightIndex = index;

    // Update Indicators
    heroIndicators.querySelectorAll('.hero-dot').forEach((btn, idx) => {
      if (idx === index) {
        btn.className = 'hero-dot h-1.5 rounded-full bg-primary-container w-10 transition-all';
      } else {
        btn.className = 'hero-dot h-1.5 rounded-full bg-surface-container-high w-6 transition-all';
      }
    });

    const backdropUrl = item.bannerImage || item.coverImage?.extraLarge || '';
    if (heroBackdrop) heroBackdrop.style.backgroundImage = `url('${backdropUrl}')`;
    if (heroTitle) heroTitle.textContent = item.title?.english || item.title?.romaji || 'Anime Showcase';
    if (heroStudioMeta) heroStudioMeta.textContent = `${item.studios?.nodes?.[0]?.name || 'Studio Animation'} • Winter Arc`;
    if (heroScore) heroScore.innerHTML = `<span class="material-symbols-outlined text-[16px]" style="font-variation-settings: 'FILL' 1;">star</span> ${(item.averageScore ? (item.averageScore / 10).toFixed(1) : '8.8')} RATING`;
    if (heroYear) heroYear.textContent = item.seasonYear || item.startDate?.year || '2025';
    if (heroFormat) heroFormat.textContent = item.format || 'TV SERIES';
    if (heroEpisodes) heroEpisodes.textContent = `${item.episodes || 24} Episodes`;

    const genres = item.genres || ['Action', 'Fantasy'];
    if (heroGenres) {
      heroGenres.innerHTML = genres.slice(0, 3).map(g => `
        <span class="px-2 py-0.5 rounded bg-surface-container text-white text-xs">${g}</span>
      `).join('');
    }

    const cleanDesc = (item.description || 'Denji finds himself unexpectedly enchanted in a neon Tokyo underworld as deadly secrets ignite an epic clash.')
      .replace(/<[^>]*>/g, '');
    if (heroDesc) heroDesc.textContent = cleanDesc;

    // Watermark Japanese Title
    const watermarkEl = document.getElementById('hero-watermark');
    if (watermarkEl) {
      watermarkEl.textContent = item.title?.native || '黒波アニメ';
    }

    // Play CTA
    heroPlayBtn.onclick = () => {
      navigateTo(`watch?anime=${item.id}&ep=1&mode=${state.currentMode}`);
    };

    // Watchlist CTA
    heroWatchlistBtn.onclick = () => {
      toggleWatchlistAnime(item);
    };

    heroInfoBtn.onclick = () => {
      navigateTo(`watch?anime=${item.id}&ep=1&mode=${state.currentMode}`);
    };
  }

  // Genre Filter Bar on Home Feed
  genreBar.addEventListener('click', (e) => {
    const chip = e.target.closest('.genre-chip');
    if (!chip) return;

    const wasActive = chip.classList.contains('active');
    const genre = chip.dataset.genre || 'All';

    // If already active and clicked again on a specific genre, jump straight to full Browse catalog!
    if (wasActive && genre !== 'All') {
      navigateTo(`browse?genre=${encodeURIComponent(genre)}`);
      return;
    }

    genreBar.querySelectorAll('.genre-chip').forEach(c => {
      c.className = 'genre-chip px-4 py-1.5 rounded-full bg-surface-container-low border border-white/[0.06] text-gray-300 hover:bg-surface-container font-mono text-xs font-bold tracking-wide transition-all whitespace-nowrap';
    });
    chip.className = 'genre-chip active px-4 py-1.5 rounded-full bg-primary-container text-white font-mono text-xs font-bold tracking-wide transition-all whitespace-nowrap shadow-sm';

    if (genre === 'All') {
      renderAnimeCards(trendingGrid, state.rawTrendingList);
    } else {
      const gNorm = genre.toLowerCase();
      const filtered = state.rawTrendingList.filter(a => {
        const gList = (a.genres || []).map(g => g.toLowerCase());
        if (gList.includes(gNorm)) return true;
        if (gNorm === 'shounen') {
          const desc = (a.description || '').toLowerCase();
          return desc.includes('shounen') || desc.includes('shonen') || gList.includes('action') || gList.includes('adventure');
        }
        return false;
      });

      if (filtered.length > 0) {
        renderAnimeCards(trendingGrid, filtered);
      } else {
        // No items in memory trending feed, navigate directly to full catalog in browse
        navigateTo(`browse?genre=${encodeURIComponent(genre)}`);
      }
    }
  });

  // ============================================================================
  // WATCH PROGRESS & CONTINUE WATCHING MANAGEMENT
  // ============================================================================

  function saveLocalWatchProgress(entry) {
    if (!entry || !entry.animeId) return;
    try {
      const animeId = String(entry.animeId);
      if (!animeId || animeId === 'undefined' || animeId === 'null' || animeId.includes('|')) return;
      const animeTitle = String(entry.animeTitle || entry.title || 'Anime');
      const poster = String(entry.poster || entry.poster_image || '');
      
      // STRICT GATE: Never store ghost entries locally (generic title OR invalid poster)
      if (isGenericTitle(animeTitle) || isGenericPoster(poster)) {
        return;
      }

      const episodeNum = parseInt(entry.episodeNum || entry.episode_num) || 1;
      const episodeId = String(entry.episodeId || entry.episode_id || '');
      const progressSeconds = Math.round(Number(entry.progressSeconds ?? entry.progress_seconds) || 0);
      const durationSeconds = Math.round(Number(entry.durationSeconds ?? entry.duration_seconds) || 1420);
      const now = Date.now();

      // 1. Maintain structured omcli_local_history array (deduplicated by anime_id)
      let history = [];
      try {
        history = JSON.parse(localStorage.getItem('omcli_local_history') || '[]');
        if (!Array.isArray(history)) history = [];
      } catch {
        history = [];
      }

      // Deduplicate: remove previous entry for this anime
      history = history.filter(h => String(h.anime_id) !== animeId);

      // Add updated entry to top
      history.unshift({
        anime_id: animeId,
        anime_title: animeTitle,
        poster: poster,
        episode_num: episodeNum,
        episode_id: episodeId,
        progress_seconds: progressSeconds,
        duration_seconds: durationSeconds,
        updated_at: now
      });

      if (history.length > 25) history = history.slice(0, 25);
      localStorage.setItem('omcli_local_history', JSON.stringify(history));

      // 2. Direct progress keys for in-player resume
      localStorage.setItem(`ani_progress_${animeId}`, JSON.stringify({
        animeId,
        title: animeTitle,
        poster,
        episode: episodeNum,
        episodeId,
        time: progressSeconds,
        duration: durationSeconds,
        updatedAt: now
      }));

      if (episodeId) {
        localStorage.setItem(`ani_progress_${episodeId}`, JSON.stringify({
          animeId,
          title: animeTitle,
          poster,
          episode: episodeNum,
          time: progressSeconds,
          duration: durationSeconds,
          updatedAt: now
        }));
      }
    } catch (err) {
      console.warn('[History] Local save error:', err);
    }
  }

  window.saveLocalWatchProgress = saveLocalWatchProgress;

  function recordWatchProgress(currentTime, duration) {
    if (!state.currentAnime) return;
    const episodes = state.currentAnime.episodes || [];
    const currentEp = episodes[state.currentEpisodeIndex] || {};
    const animeId = String(state.currentAnime.id);
    if (!animeId || animeId === 'undefined' || animeId === 'null' || animeId.includes('|')) return;

    let animeTitle = state.currentAnime.title?.english || state.currentAnime.title?.romaji || state.currentAnime.title?.userPreferred || '';
    if (isGenericTitle(animeTitle)) {
      const cached = (state.userHistory || []).find(h => String(h.anime_id) === animeId);
      if (cached && !isGenericTitle(cached.anime_title)) {
        animeTitle = cached.anime_title;
      }
    }
    const poster = state.currentAnime.coverImage?.extraLarge || state.currentAnime.coverImage?.large || state.currentAnime.bannerImage || '';
    if (isGenericTitle(animeTitle) || isGenericPoster(poster)) {
      return; // Do not record ghost progress for unknown/generic media
    }
    const episodeNum = currentEp.number || state.currentEpisodeIndex + 1;
    const episodeId = currentEp.id || '';
    const progressSeconds = Math.round(currentTime || 0);
    const durationSeconds = Math.round(duration || 1420);

    saveLocalWatchProgress({
      animeId,
      animeTitle: animeTitle || 'Anime',
      poster,
      episodeNum,
      episodeId,
      progressSeconds,
      durationSeconds
    });

    if (state.auth && state.auth.token) {
      syncProgressToBackend(progressSeconds, durationSeconds);
    }
  }

  window.recordWatchProgress = recordWatchProgress;

  // Continue Watching Rail Loading
  let continueWatchingRequestId = 0;
  async function loadContinueWatching() {
    const currentReqId = ++continueWatchingRequestId;
    let history = [];

    if (state.auth.token) {
      try {
        const res = await fetch('/api/user/history', {
          headers: { 'Authorization': `Bearer ${state.auth.token}` }
        });
        const json = await res.json();
        if (currentReqId !== continueWatchingRequestId) return;
        if (json.success && Array.isArray(json.data)) {
          history = json.data;
          state.userHistory = history;
        }
      } catch (err) {
        if (currentReqId !== continueWatchingRequestId) return;
        console.warn('[History] Fetch failed:', err);
      }
    } else {
      // Guest mode: load from structured omcli_local_history
      try {
        const local = JSON.parse(localStorage.getItem('omcli_local_history') || '[]');
        if (Array.isArray(local) && local.length > 0) {
          history = local;
        }
      } catch {}

      // Legacy fallback: check old ani_progress_ keys if omcli_local_history was empty
      if (!history.length) {
        const legacyKeys = Object.keys(localStorage).filter(k => k.startsWith('ani_progress_'));
        if (legacyKeys.length) {
          history = legacyKeys.map(k => {
            try {
              const data = JSON.parse(localStorage.getItem(k));
              const idPart = k.replace('ani_progress_', '');
              return {
                anime_id: data.animeId || idPart,
                anime_title: data.title || 'Continue Watching',
                poster: data.poster || '',
                episode_num: data.episode || 1,
                progress_seconds: data.time || 0,
                duration_seconds: data.duration || 1420,
                updated_at: data.updatedAt || 0
              };
            } catch { return null; }
          }).filter(Boolean);
        }
      }
    }

    if (currentReqId !== continueWatchingRequestId) return;

    // Deduplicate by anime_id (keep most recent) and filter invalid / ghost records
    const seen = new Set();
    const deduplicated = [];
    const ghostIdsToPurge = [];
    for (const item of history) {
      const aid = String(item.anime_id || item.animeId || '');
      if (!aid || aid === 'undefined' || aid === 'null' || aid.includes('|')) continue;

      const title = String(item.anime_title || item.title || '');
      const poster = String(item.poster || item.poster_image || '');
      const isGhost = isGenericTitle(title) || isGenericPoster(poster);

      if (isGhost) {
        ghostIdsToPurge.push(aid);
        continue;
      }

      if (seen.has(aid)) continue;
      seen.add(aid);
      deduplicated.push(item);
    }

    // Auto-purge any ghosts locally & on server
    if (ghostIdsToPurge.length > 0) {
      try {
        let localHist = JSON.parse(localStorage.getItem('omcli_local_history') || '[]');
        if (Array.isArray(localHist)) {
          localHist = localHist.filter(h => !ghostIdsToPurge.includes(String(h.anime_id)));
          localStorage.setItem('omcli_local_history', JSON.stringify(localHist));
        }
        for (const gid of ghostIdsToPurge) {
          localStorage.removeItem(`ani_progress_${gid}`);
        }
      } catch (_) {}

      if (state.auth && state.auth.token) {
        for (const gid of ghostIdsToPurge) {
          fetch(`/api/user/history/${gid}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${state.auth.token}` }
          }).catch(() => {});
        }
      }
    }

    state.userHistory = deduplicated;

    const countBadge = document.getElementById('continue-count-badge');
    if (deduplicated.length > 0) {
      continueSection.classList.remove('hidden');
      if (flyoutHistoryCount) flyoutHistoryCount.textContent = deduplicated.length;
      if (countBadge) countBadge.textContent = `${deduplicated.length} IN PROGRESS`;
      renderContinueWatchingRail(deduplicated);

      // Background healing for items with generic titles or missing posters
      const itemsToHeal = deduplicated.filter(it => isGenericTitle(it.anime_title) || !it.poster);
      if (itemsToHeal.length > 0 && window.AniListClient) {
        Promise.all(itemsToHeal.map(async (it) => {
          try {
            const d = await window.AniListClient.getAnimeDetails(it.anime_id);
            if (d && (d.title?.english || d.title?.romaji)) {
              const healedTitle = d.title.english || d.title.romaji || d.title.userPreferred;
              const healedPoster = d.coverImage?.large || d.coverImage?.extraLarge || d.bannerImage || '';
              it.anime_title = healedTitle;
              if (!it.poster) it.poster = healedPoster;
              if (state.auth && state.auth.token) {
                fetch('/api/user/history', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${state.auth.token}` },
                  body: JSON.stringify({
                    animeId: String(it.anime_id),
                    animeTitle: healedTitle,
                    poster: it.poster,
                    episodeNum: it.episode_num || 1,
                    episodeId: it.episode_id || '',
                    progressSeconds: it.progress_seconds || 0,
                    durationSeconds: it.duration_seconds || 1420
                  })
                }).catch(() => {});
              }
            }
          } catch (_) {}
        })).then(() => {
          if (currentReqId === continueWatchingRequestId && deduplicated.length > 0) {
            renderContinueWatchingRail(deduplicated);
          }
        });
      }
    } else {
      continueSection.classList.add('hidden');
      continueGrid.innerHTML = '';
      if (flyoutHistoryCount) flyoutHistoryCount.textContent = '0';
      if (countBadge) countBadge.textContent = '0 IN PROGRESS';
    }
  }

  function renderContinueWatchingRail(items) {
    continueGrid.innerHTML = items.slice(0, 15).map(item => {
      const duration = Number(item.duration_seconds) || 1420;
      const progress = Math.round(Number(item.progress_seconds) || 0);
      const isFinished = duration > 60 && progress >= (duration - 25);
      const progressPercent = duration > 0 
        ? Math.min(100, Math.round((progress / duration) * 100))
        : 0;

      const resumeTime = isFinished ? 0 : progress;
      const resumeEp = isFinished ? (Number(item.episode_num) + 1) : Number(item.episode_num);
      const safeTitle = escapeQuotes(item.anime_title || 'Anime');
      const posterSrc = item.poster || item.poster_image || '/assets/hero_bg.jpg';
      const cleanAnimeId = String(item.anime_id);
      const remainingSec = Math.max(0, duration - progress);
      const remMinutes = Math.ceil(remainingSec / 60);
      const remLabel = isFinished ? 'Completed' : `${remMinutes}m left`;

      return `
        <div id="continue-card-${cleanAnimeId}" class="continue-card group relative w-[280px] sm:w-[320px] shrink-0 snap-start bg-surface-container-low/95 backdrop-blur-xl border border-white/[0.08] hover:border-primary/60 rounded-2xl overflow-hidden shadow-[0_8px_30px_rgba(0,0,0,0.5)] hover:shadow-[0_16px_40px_rgba(255,79,115,0.25)] transition-all duration-300 flex flex-col cursor-pointer select-none" onclick="window.navigateToWatch('${cleanAnimeId}', ${resumeEp}, ${resumeTime})">
          <div class="relative aspect-video w-full bg-surface-container-high overflow-hidden">
            <img src="${posterSrc}" alt="${safeTitle}" class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500 ease-out" onerror="this.onerror=null; this.src='/assets/hero_bg.jpg'">
            <div class="absolute inset-0 bg-gradient-to-t from-[#0c0e14] via-[#0c0e14]/40 to-transparent"></div>
            
            <!-- Quick Remove Button -->
            <button class="btn-remove-continue absolute top-2 right-2 z-20 w-7 h-7 rounded-full bg-black/70 hover:bg-rose-600 text-gray-300 hover:text-white backdrop-blur-md border border-white/20 flex items-center justify-center opacity-80 group-hover:opacity-100 hover:scale-110 active:scale-95 transition-all duration-200 shadow-md cursor-pointer" title="Remove from Continue Watching" onclick="window.removeHistoryItem('${cleanAnimeId}', event);">
              <span class="material-symbols-outlined text-[15px] pointer-events-none">close</span>
            </button>

            <!-- Top-Left Episode Badge -->
            <div class="absolute top-2 left-2 flex items-center gap-1.5 z-10">
              <span class="bg-primary-container px-2.5 py-0.5 rounded-lg text-white font-mono text-[10px] sm:text-[11px] font-bold shadow-[0_2px_10px_rgba(255,79,115,0.4)] flex items-center gap-1 border border-white/20">
                EP ${item.episode_num}
              </span>
            </div>

            <!-- Bottom Thumbnail Overlays -->
            <div class="absolute bottom-2 left-2 right-2 flex items-center justify-between z-10 pointer-events-none">
              <div class="px-2 py-0.5 rounded bg-black/75 backdrop-blur-md text-gray-300 text-[10px] font-semibold border border-white/10 flex items-center gap-1">
                <i class="material-symbols-outlined text-[11px] text-gray-400 not-italic">schedule</i>
                ${remLabel}
              </div>
              ${isFinished ? '<span class="px-2 py-0.5 rounded bg-emerald-500/90 text-white font-mono text-[9px] font-bold shadow-[0_0_10px_rgba(16,185,129,0.5)] border border-emerald-400/40">FINISHED</span>' : ''}
            </div>

            <!-- Glowing Center Play Overlay -->
            <div class="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 bg-black/40 backdrop-blur-[2px] transition-all duration-300 pointer-events-none">
              <div class="w-12 h-12 rounded-full bg-primary/90 text-white flex items-center justify-center shadow-[0_0_25px_rgba(255,79,115,0.8)] border border-white/40 scale-75 group-hover:scale-100 transition-transform duration-300">
                <span class="material-symbols-outlined text-[26px]">play_arrow</span>
              </div>
            </div>
          </div>

          <div class="p-3.5 flex flex-col gap-2 flex-1 justify-between bg-surface-container-low/50">
            <h3 class="text-sm font-bold text-white line-clamp-1 group-hover:text-primary transition-colors tracking-tight font-display">${safeTitle}</h3>
            
            <!-- High-Contrast Progress Bar -->
            <div class="w-full bg-surface-container-high h-1.5 rounded-full overflow-hidden shadow-inner relative">
              <div class="bg-primary-container h-full rounded-full transition-all duration-500 shadow-[0_0_10px_rgba(255,79,115,0.5)]" style="width: ${progressPercent}%;"></div>
            </div>

            <div class="flex items-center justify-between text-[11px] font-mono text-gray-400">
              <span>${progressPercent}% Complete</span>
              <span class="text-secondary font-bold flex items-center gap-1 group-hover:text-primary transition-colors">
                <span class="material-symbols-outlined text-[13px]">play_circle</span>
                ${isFinished ? 'Next Ep' : 'Resume'}
              </span>
            </div>
          </div>
        </div>
      `;
    }).join('');
  }

  // Setup Carousel Glide Buttons
  const btnContinueScrollLeft = document.getElementById('btn-continue-scroll-left');
  const btnContinueScrollRight = document.getElementById('btn-continue-scroll-right');
  if (btnContinueScrollLeft && continueGrid) {
    btnContinueScrollLeft.addEventListener('click', () => {
      continueGrid.scrollBy({ left: -340, behavior: 'smooth' });
    });
  }
  if (btnContinueScrollRight && continueGrid) {
    btnContinueScrollRight.addEventListener('click', () => {
      continueGrid.scrollBy({ left: 340, behavior: 'smooth' });
    });
  }

  // Generic Card Renderer
  function renderAnimeCards(container, list) {
    if (!list || !list.length) {
      container.innerHTML = '<div class="col-span-full py-8 text-center text-gray-500 font-mono text-xs">No entries found.</div>';
      return;
    }

    container.innerHTML = list.map(item => {
      const title = item.title?.english || item.title?.romaji || 'Anime';
      const poster = item.coverImage?.extraLarge || item.coverImage?.large || '';
      const score = item.averageScore ? (item.averageScore / 10).toFixed(1) : '8.5';
      const format = item.format || 'TV';
      const epCount = item.episodes ? `${item.episodes} EP` : 'Simulcast';

      return `
        <div class="anime-card group relative bg-surface-container-low border border-white/[0.08] hover:border-primary/50 rounded-2xl overflow-hidden shadow-lg transition-all duration-300 flex flex-col cursor-pointer" onclick="window.location.hash='watch?anime=${item.id}&ep=1'">
          <div class="relative aspect-[2/3] w-full bg-surface-container-high overflow-hidden">
            <img src="${poster}" alt="${title}" loading="lazy" class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500">
            <div class="absolute inset-0 bg-gradient-to-t from-surface-container-lowest via-transparent to-transparent opacity-90"></div>
            
            <!-- Badges -->
            <div class="absolute top-2 left-2 flex items-center gap-1">
              <span class="px-2 py-0.5 rounded bg-black/60 backdrop-blur-md text-white font-mono text-[10px] font-bold border border-white/[0.1]">
                ${format}
              </span>
              <span class="px-1.5 py-0.5 rounded bg-secondary-container/90 text-on-secondary-container font-mono text-[9px] font-bold">
                SUB • DUB
              </span>
            </div>

            <div class="absolute top-2 right-2">
              <button class="w-8 h-8 rounded-full bg-black/70 backdrop-blur-md text-gray-300 hover:text-primary active:scale-90 flex items-center justify-center transition-all shadow-md cursor-pointer" title="Add to Watchlist" onclick="event.stopPropagation(); window.toggleWatchlistAnimeById('${item.id}', '${escapeQuotes(title)}', '${poster}')">
                <span class="material-symbols-outlined text-[17px]">bookmark_add</span>
              </button>
            </div>

            <div class="absolute bottom-2 left-2 right-2 flex items-center justify-between text-xs font-mono font-bold">
              <span class="text-primary flex items-center gap-0.5">
                <span class="material-symbols-outlined text-[14px]" style="font-variation-settings: 'FILL' 1;">star</span>
                ${score}
              </span>
              <span class="text-gray-400 text-[10px]">${epCount}</span>
            </div>
          </div>

          <div class="p-3 flex flex-col gap-1">
            <h3 class="text-xs font-bold text-white line-clamp-1 group-hover:text-primary transition-colors">${title}</h3>
            <span class="text-[10px] font-mono text-gray-500 line-clamp-1">${(item.genres || []).slice(0, 2).join(' • ')}</span>
          </div>
        </div>
      `;
    }).join('');
  }

  // ============================================================================
  // ADVANCED SEARCH & BROWSE MODULE
  // ============================================================================

  function buildGenreMatrix() {
    filterGenresMatrix.innerHTML = state.genresList.map(g => {
      const isChecked = state.browseFilters.genre && state.browseFilters.genre.toLowerCase() === g.toLowerCase();
      return `
        <label class="flex items-center gap-2 p-1.5 rounded-lg bg-surface-container hover:bg-surface-container-high transition-colors cursor-pointer text-xs text-gray-300">
          <input type="checkbox" value="${g}" ${isChecked ? 'checked' : ''} class="genre-matrix-chk rounded bg-surface-container-high border-white/[0.1] text-primary focus:ring-0">
          <span>${g}</span>
        </label>
      `;
    }).join('');

    filterGenresMatrix.querySelectorAll('.genre-matrix-chk').forEach(chk => {
      chk.addEventListener('change', () => {
        executeBrowse();
      });
    });
  }

  // Browse Search Handlers
  let browseDebounce = null;
  browseSearchInput.addEventListener('input', (e) => {
    clearTimeout(browseDebounce);
    state.browseFilters.search = e.target.value.trim();
    browseDebounce = setTimeout(() => executeBrowse(), 350);
  });

  browseClearBtn.addEventListener('click', () => {
    browseSearchInput.value = '';
    state.browseFilters.search = '';
    executeBrowse();
  });

  browseSearchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      clearTimeout(browseDebounce);
      executeBrowse();
    }
  });

  browseSortSelect.addEventListener('change', (e) => {
    state.browseFilters.sort = e.target.value;
    executeBrowse();
  });

  // View Mode Toggles
  viewModeGrid.addEventListener('click', () => setViewMode('grid'));
  viewModeDetailed.addEventListener('click', () => setViewMode('detailed'));
  viewModeCompact.addEventListener('click', () => setViewMode('compact'));

  function setViewMode(mode) {
    state.browseFilters.viewMode = mode;
    [viewModeGrid, viewModeDetailed, viewModeCompact].forEach(b => {
      b.className = 'p-1.5 rounded-lg text-gray-400 hover:text-white transition-all';
    });

    if (mode === 'grid') viewModeGrid.className = 'p-1.5 rounded-lg bg-surface-container-high text-secondary shadow-sm transition-all';
    if (mode === 'detailed') viewModeDetailed.className = 'p-1.5 rounded-lg bg-surface-container-high text-secondary shadow-sm transition-all';
    if (mode === 'compact') viewModeCompact.className = 'p-1.5 rounded-lg bg-surface-container-high text-secondary shadow-sm transition-all';

    executeBrowse();
  }

  // Format Filter
  filterFormatGroup.addEventListener('click', (e) => {
    const btn = e.target.closest('.filter-btn');
    if (!btn) return;
    filterFormatGroup.querySelectorAll('.filter-btn').forEach(b => {
      b.className = 'filter-btn px-2.5 py-1.5 rounded-lg bg-surface-container-low border border-white/[0.06] text-gray-400 hover:text-white font-mono text-[11px] font-bold';
    });
    btn.className = 'filter-btn active px-2.5 py-1.5 rounded-lg bg-surface-container-high border border-primary/30 text-white font-mono text-[11px] font-bold';
    state.browseFilters.format = btn.dataset.format;
    executeBrowse();
  });

  // Status Filter
  filterStatusGroup.addEventListener('click', (e) => {
    const btn = e.target.closest('.filter-btn');
    if (!btn) return;
    filterStatusGroup.querySelectorAll('.filter-btn').forEach(b => {
      b.className = 'filter-btn px-2.5 py-1.5 rounded-lg bg-surface-container-low border border-white/[0.06] text-gray-400 hover:text-white font-mono text-[11px] font-bold';
    });
    btn.className = 'filter-btn active px-2.5 py-1.5 rounded-lg bg-surface-container-high border border-primary/30 text-white font-mono text-[11px] font-bold';
    state.browseFilters.status = btn.dataset.status;
    executeBrowse();
  });

  function syncFilterUIWithState() {
    if (browseSearchInput) browseSearchInput.value = state.browseFilters.search || '';
    if (browseSortSelect) browseSortSelect.value = state.browseFilters.sort || 'score';
    if (mobileBrowseSortSelect) mobileBrowseSortSelect.value = state.browseFilters.sort || 'score';

    if (filterFormatGroup) {
      filterFormatGroup.querySelectorAll('.filter-btn').forEach(b => {
        const isAct = (b.dataset.format || '').toLowerCase() === (state.browseFilters.format || 'all').toLowerCase();
        b.className = isAct 
          ? 'filter-btn active px-2.5 py-1.5 rounded-lg bg-surface-container-high border border-primary/30 text-white font-mono text-[11px] font-bold'
          : 'filter-btn px-2.5 py-1.5 rounded-lg bg-surface-container-low border border-white/[0.06] text-gray-400 hover:text-white font-mono text-[11px] font-bold';
      });
    }

    if (filterStatusGroup) {
      filterStatusGroup.querySelectorAll('.filter-btn').forEach(b => {
        const isAct = (b.dataset.status || '').toLowerCase() === (state.browseFilters.status || 'all').toLowerCase();
        b.className = isAct 
          ? 'filter-btn active px-2.5 py-1.5 rounded-lg bg-surface-container-high border border-primary/30 text-white font-mono text-[11px] font-bold'
          : 'filter-btn px-2.5 py-1.5 rounded-lg bg-surface-container-low border border-white/[0.06] text-gray-400 hover:text-white font-mono text-[11px] font-bold';
      });
    }

    if (filterGenresMatrix) {
      const activeGenres = (state.browseFilters.genre || '').split(',').map(s => s.trim().toLowerCase()).filter(s => s && s !== 'all');
      filterGenresMatrix.querySelectorAll('.genre-matrix-chk').forEach(c => {
        c.checked = activeGenres.includes(c.value.toLowerCase());
      });
    }
  }

  function renderActiveTags() {
    if (!browseActiveTags) return;
    const tags = [];

    if (state.browseFilters.search) {
      tags.push(`
        <button class="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-secondary/15 border border-secondary/30 text-secondary font-mono text-[10px] font-bold hover:bg-secondary/25 transition-all cursor-pointer" onclick="window.clearBrowseSearch()">
          <span>"${state.browseFilters.search}"</span>
          <span class="material-symbols-outlined text-[13px]">close</span>
        </button>
      `);
    }

    const checkedGenres = Array.from(filterGenresMatrix ? filterGenresMatrix.querySelectorAll('.genre-matrix-chk:checked') : []).map(c => c.value);
    checkedGenres.forEach(g => {
      tags.push(`
        <button class="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-primary-container/20 border border-primary/40 text-primary font-mono text-[10px] font-bold hover:bg-primary-container/30 transition-all cursor-pointer" onclick="window.removeBrowseGenre('${g}')">
          <span>${g}</span>
          <span class="material-symbols-outlined text-[13px]">close</span>
        </button>
      `);
    });

    if (state.browseFilters.format && state.browseFilters.format.toLowerCase() !== 'all') {
      tags.push(`
        <button class="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-surface-container-high border border-white/20 text-gray-200 font-mono text-[10px] font-bold hover:bg-white/10 transition-all cursor-pointer" onclick="window.clearBrowseFormat()">
          <span>${state.browseFilters.format}</span>
          <span class="material-symbols-outlined text-[13px]">close</span>
        </button>
      `);
    }

    if (state.browseFilters.status && state.browseFilters.status.toLowerCase() !== 'all') {
      tags.push(`
        <button class="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-surface-container-high border border-white/20 text-gray-200 font-mono text-[10px] font-bold hover:bg-white/10 transition-all cursor-pointer" onclick="window.clearBrowseStatus()">
          <span>${state.browseFilters.status}</span>
          <span class="material-symbols-outlined text-[13px]">close</span>
        </button>
      `);
    }

    browseActiveTags.innerHTML = tags.join('');
  }

  window.clearBrowseSearch = () => {
    state.browseFilters.search = '';
    if (browseSearchInput) browseSearchInput.value = '';
    executeBrowse();
  };

  window.removeBrowseGenre = (genre) => {
    if (filterGenresMatrix) {
      filterGenresMatrix.querySelectorAll('.genre-matrix-chk').forEach(c => {
        if (c.value.toLowerCase() === genre.toLowerCase()) c.checked = false;
      });
    }
    executeBrowse();
  };

  window.clearBrowseFormat = () => {
    state.browseFilters.format = 'all';
    syncFilterUIWithState();
    executeBrowse();
  };

  window.clearBrowseStatus = () => {
    state.browseFilters.status = 'all';
    syncFilterUIWithState();
    executeBrowse();
  };

  // Quick Chips in Browse
  browseQuickChips.addEventListener('click', (e) => {
    const chip = e.target.closest('.browse-chip');
    if (!chip) return;
    browseQuickChips.querySelectorAll('.browse-chip').forEach(c => {
      c.className = 'browse-chip px-3 py-1 rounded-full bg-surface-container-low border border-white/[0.06] text-gray-300 hover:bg-surface-container font-mono text-[11px] font-bold whitespace-nowrap';
    });
    chip.className = 'browse-chip active px-3 py-1 rounded-full bg-primary-container text-white font-mono text-[11px] font-bold whitespace-nowrap';

    const preset = chip.dataset.preset;
    if (preset === 'top_rated') {
      state.browseFilters.sort = 'score';
      state.browseFilters.format = 'all';
      state.browseFilters.status = 'all';
    } else if (preset === 'trending') {
      state.browseFilters.sort = 'popularity';
      state.browseFilters.format = 'all';
      state.browseFilters.status = 'all';
    } else if (preset === 'movies') {
      state.browseFilters.sort = 'popularity';
      state.browseFilters.format = 'MOVIE';
      state.browseFilters.status = 'all';
    } else if (preset === 'completed') {
      state.browseFilters.sort = 'popularity';
      state.browseFilters.format = 'all';
      state.browseFilters.status = 'FINISHED';
    }

    syncFilterUIWithState();
    executeBrowse();
  });

  browseResetFilters.addEventListener('click', () => {
    state.browseFilters = {
      search: '',
      sort: 'score',
      format: 'all',
      status: 'all',
      genre: 'All',
      viewMode: state.browseFilters.viewMode,
      preset: 'trending'
    };
    browseQuickChips.querySelectorAll('.browse-chip').forEach(c => {
      c.className = 'browse-chip px-3 py-1 rounded-full bg-surface-container-low border border-white/[0.06] text-gray-300 hover:bg-surface-container font-mono text-[11px] font-bold whitespace-nowrap';
    });
    const trendingChip = browseQuickChips.querySelector('[data-preset="trending"]');
    if (trendingChip) trendingChip.className = 'browse-chip active px-3 py-1 rounded-full bg-primary-container text-white font-mono text-[11px] font-bold whitespace-nowrap';

    syncFilterUIWithState();
    executeBrowse();
  });

  async function executeBrowse() {
    browseResultsContainer.innerHTML = '<div class="col-span-full py-12 flex justify-center"><div class="w-8 h-8 rounded-full border-2 border-primary border-t-transparent animate-spin"></div></div>';

    // Gather checked genres
    const selectedGenres = Array.from(filterGenresMatrix ? filterGenresMatrix.querySelectorAll('.genre-matrix-chk:checked') : []).map(c => c.value);
    state.browseFilters.genre = selectedGenres.length > 0 ? selectedGenres.join(',') : 'All';

    // Update active filter counter badges
    let activeFilterCount = selectedGenres.length;
    if (state.browseFilters.search) activeFilterCount++;
    if (state.browseFilters.format && state.browseFilters.format !== 'all') activeFilterCount++;
    if (state.browseFilters.status && state.browseFilters.status !== 'all') activeFilterCount++;
    if (mobileFilterCountBadge) mobileFilterCountBadge.textContent = activeFilterCount;
    if (browseResetFilters) browseResetFilters.textContent = `Reset (${activeFilterCount})`;
    if (mobileBrowseSortSelect) mobileBrowseSortSelect.value = state.browseFilters.sort;

    renderActiveTags();

    const queryParams = new URLSearchParams();
    if (state.browseFilters.search) queryParams.set('search', state.browseFilters.search);
    if (state.browseFilters.sort) queryParams.set('sort', state.browseFilters.sort);
    if (state.browseFilters.format && state.browseFilters.format !== 'all') queryParams.set('format', state.browseFilters.format);
    if (state.browseFilters.status && state.browseFilters.status !== 'all') queryParams.set('status', state.browseFilters.status);
    if (selectedGenres.length > 0) queryParams.set('genre', selectedGenres.join(','));

    try {
      let browseItems = null;

      // 1. Direct Browser Client (window.AniListClient) - High-speed, unblocked, complete 10,000+ catalog
      if (window.AniListClient) {
        const clientRes = await window.AniListClient.browseAnime({
          search: state.browseFilters.search,
          sort: state.browseFilters.sort,
          format: state.browseFilters.format,
          status: state.browseFilters.status,
          genre: selectedGenres.length > 0 ? selectedGenres : (state.browseFilters.genre || 'All')
        }).catch(err => {
          console.warn('[Browse] Direct AniListClient error, falling back:', err.message);
          return null;
        });

        if (clientRes && Array.isArray(clientRes.items) && clientRes.items.length > 0) {
          browseItems = clientRes.items;
        }
      }

      // 2. Server fallback if direct client failed or returned empty
      if (!browseItems || browseItems.length === 0) {
        const res = await fetch(`/api/browse?${queryParams.toString()}`).catch(() => null);
        if (res && res.ok) {
          const json = await res.json().catch(() => ({}));
          if (json.success && Array.isArray(json.data) && json.data.length > 0) {
            browseItems = json.data;
          }
        }
      }

      if (browseItems && browseItems.length > 0) {
        browseResultsCount.textContent = `SHOWING ${browseItems.length} ENTRIES`;
        renderBrowseResults(browseItems, state.browseFilters.viewMode);
      } else {
        browseResultsContainer.innerHTML = '<div class="col-span-full py-8 text-center text-gray-500 font-mono text-xs">No matching titles found.</div>';
      }
    } catch (err) {
      console.error('[Browse] Fetch error:', err);
      browseResultsContainer.innerHTML = '<div class="col-span-full py-8 text-center text-red-400 font-mono text-xs">Failed to load browse results.</div>';
    }
  }

  function renderBrowseResults(list, viewMode) {
    if (!list.length) {
      browseResultsContainer.innerHTML = '<div class="col-span-full py-12 text-center text-gray-500 font-mono text-sm">No titles match your filter matrix.</div>';
      return;
    }

    if (viewMode === 'grid') {
      browseResultsContainer.className = 'grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5 gap-3 sm:gap-4';
      renderAnimeCards(browseResultsContainer, list);
    } else if (viewMode === 'detailed') {
      browseResultsContainer.className = 'flex flex-col gap-3 sm:gap-4';
      browseResultsContainer.innerHTML = list.map(item => {
        const title = item.title?.english || item.title?.romaji || 'Anime';
        const poster = item.coverImage?.extraLarge || item.coverImage?.large || '';
        const score = item.averageScore ? (item.averageScore / 10).toFixed(1) : '8.5';
        const cleanDesc = (item.description || 'No synopsis provided.').replace(/<[^>]*>/g, '');

        return `
          <div class="p-3.5 sm:p-4 rounded-2xl bg-surface-container-low border border-white/[0.08] hover:border-primary/50 shadow-xl transition-all flex flex-row items-start gap-3 sm:gap-5 group cursor-pointer" onclick="window.location.hash='watch?anime=${item.id}&ep=1'">
            <img src="${poster}" alt="${title}" class="w-20 sm:w-28 md:w-32 h-28 sm:h-40 md:h-44 object-cover rounded-xl border border-white/[0.08] flex-shrink-0 group-hover:scale-102 transition-transform">
            <div class="flex flex-col justify-between flex-1 gap-2 min-w-0">
              <div class="flex flex-col gap-1">
                <div class="flex items-center justify-between flex-wrap gap-1 sm:gap-2">
                  <h3 class="text-sm sm:text-base md:text-lg font-bold text-white group-hover:text-primary transition-colors truncate">${title}</h3>
                  <span class="font-mono text-xs font-bold text-primary flex items-center gap-1 flex-shrink-0">★ ${score}</span>
                </div>
                <div class="flex items-center gap-1.5 sm:gap-2 font-mono text-[11px] sm:text-xs text-gray-400 flex-wrap">
                  <span class="px-1.5 py-0.5 rounded bg-surface-container-high text-white text-[9px] sm:text-[10px]">${item.format || 'TV'}</span>
                  <span>${item.seasonYear || '2025'}</span>
                  <span>•</span>
                  <span>${item.episodes ? `${item.episodes} Ep` : 'Airing'}</span>
                  <span class="hidden sm:inline">•</span>
                  <span class="hidden sm:inline text-secondary truncate max-w-xs">${(item.genres || []).slice(0, 3).join(', ')}</span>
                </div>
                <p class="text-xs text-gray-300 line-clamp-2 sm:line-clamp-3 leading-relaxed mt-0.5">${cleanDesc}</p>
              </div>

              <div class="flex items-center gap-2 pt-1 flex-wrap">
                <button class="px-3 sm:px-4 py-1.5 sm:py-2 rounded-xl bg-primary-container text-white text-xs font-bold uppercase tracking-wider shadow-md hover:brightness-110 active:scale-95 transition-all flex items-center gap-1 sm:gap-1.5 cursor-pointer" onclick="event.stopPropagation(); window.location.hash='watch?anime=${item.id}&ep=1'">
                  <span class="material-symbols-outlined text-[16px]">play_arrow</span>Play
                </button>
                <button class="px-3 sm:px-3.5 py-1.5 sm:py-2 rounded-xl bg-surface-container-high border border-white/[0.08] text-gray-300 hover:text-white text-xs font-semibold active:scale-95 transition-all flex items-center gap-1 sm:gap-1.5 cursor-pointer" onclick="event.stopPropagation(); window.toggleWatchlistAnimeById('${item.id}', '${escapeQuotes(title)}', '${poster}')">
                  <span class="material-symbols-outlined text-[16px]">bookmark_add</span>Watchlist
                </button>
              </div>
            </div>
          </div>
        `;
      }).join('');
    } else if (viewMode === 'compact') {
      browseResultsContainer.className = 'flex flex-col gap-2';
      browseResultsContainer.innerHTML = list.map((item, idx) => {
        const title = item.title?.english || item.title?.romaji || 'Anime';
        const poster = item.coverImage?.medium || item.coverImage?.large || '';
        const score = item.averageScore ? (item.averageScore / 10).toFixed(1) : '8.5';

        return `
          <div class="px-3.5 py-2 sm:px-4 sm:py-2.5 rounded-xl bg-surface-container-low border border-white/[0.06] hover:border-primary/50 flex items-center justify-between gap-3 sm:gap-4 transition-all cursor-pointer group" onclick="window.location.hash='watch?anime=${item.id}&ep=1'">
            <div class="flex items-center gap-2.5 sm:gap-3 min-w-0">
              <span class="font-mono text-xs text-gray-500 font-bold w-5 sm:w-6 text-center">${idx + 1}</span>
              <img src="${poster}" alt="${title}" class="w-8 sm:w-9 h-11 sm:h-12 object-cover rounded-md flex-shrink-0">
              <div class="flex flex-col min-w-0">
                <span class="text-xs font-bold text-white group-hover:text-primary transition-colors truncate">${title}</span>
                <span class="text-[10px] font-mono text-gray-500">${item.format || 'TV'} • ${item.episodes ? `${item.episodes} EP` : 'Simulcast'}</span>
              </div>
            </div>
            <div class="flex items-center gap-3 sm:gap-4 flex-shrink-0">
              <span class="font-mono text-xs font-bold text-primary">★ ${score}</span>
              <span class="material-symbols-outlined text-gray-400 group-hover:text-white text-[18px]">play_circle</span>
            </div>
          </div>
        `;
      }).join('');
    }
  }

  // Mobile Browse Filter Drawer Handlers
  if (btnMobileFilterOpen) {
    btnMobileFilterOpen.addEventListener('click', () => {
      if (browseFilterSidebar) {
        browseFilterSidebar.classList.remove('hidden');
        browseFilterSidebar.classList.add('flex');
      }
      if (browseFilterDrawerBackdrop) {
        browseFilterDrawerBackdrop.classList.remove('hidden');
      }
      document.body.classList.add('overflow-hidden');
    });
  }

  function closeMobileFilterDrawer() {
    if (browseFilterSidebar) {
      browseFilterSidebar.classList.add('hidden');
      browseFilterSidebar.classList.remove('flex');
    }
    if (browseFilterDrawerBackdrop) {
      browseFilterDrawerBackdrop.classList.add('hidden');
    }
    document.body.classList.remove('overflow-hidden');
  }

  if (btnMobileFilterClose) btnMobileFilterClose.addEventListener('click', closeMobileFilterDrawer);
  if (browseFilterDrawerBackdrop) browseFilterDrawerBackdrop.addEventListener('click', closeMobileFilterDrawer);
  if (btnMobileFilterApply) {
    btnMobileFilterApply.addEventListener('click', () => {
      closeMobileFilterDrawer();
      executeBrowse();
    });
  }

  if (mobileBrowseSortSelect) {
    mobileBrowseSortSelect.addEventListener('change', () => {
      state.browseFilters.sort = mobileBrowseSortSelect.value;
      browseSortSelect.value = mobileBrowseSortSelect.value;
      executeBrowse();
    });
  }

  // ============================================================================
  // CINEMA WATCH ROOM MODULE
  // ============================================================================

  async function loadWatchRoom(animeId, episodeNum = 1, mode = null, startTime = 0) {
    state.currentEpisodeIndex = Math.max(0, parseInt(episodeNum) - 1);
    const resolvedMode = (mode === 'sub' || mode === 'dub') ? mode : (state.currentMode || 'sub');
    state.currentMode = resolvedMode;
    updateAudioButtons(resolvedMode);

    // Instant scroll to top upon entering watch room
    window.scrollTo(0, 0);
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;

    try {
      history.replaceState(null, '', `#watch?anime=${animeId}&ep=${episodeNum}&mode=${resolvedMode}${startTime ? `&t=${startTime}` : ''}`);
    } catch {}

    try {
      let episodes = [];

      // Check if we already have this anime cached in client memory
      const cached = (state.rawTrendingList || []).find(a => String(a.id) === String(animeId)) ||
                     (state.spotlightList || []).find(a => String(a.id) === String(animeId)) ||
                     (state.userWatchlist || []).find(a => String(a.anime_id) === String(animeId)) ||
                     (state.userHistory || []).find(a => String(a.anime_id) === String(animeId));
      const rawTitle = cached?.title?.english || cached?.title?.romaji || cached?.title?.userPreferred || cached?.anime_title || '';
      const titleHint = (!isGenericTitle(rawTitle)) ? rawTitle : '';

      const res = await fetch(`/api/anime/${animeId}${titleHint ? `?title=${encodeURIComponent(titleHint)}` : ''}`).catch(() => null);
      if (res && res.ok) {
        const json = await res.json().catch(() => ({}));
        if (json.success && json.data) {
          anime = json.data;
          episodes = Array.isArray(anime.episodes) ? anime.episodes : (anime.streamEpisodes || []);
        }
      }

      // Check if metadata actually has a valid title
      const hasValidTitle = anime && anime.title && (anime.title.english || anime.title.romaji || anime.title.userPreferred);

      // Fallback: direct browser AniList query + backend HiAnime episode extraction
      if ((!hasValidTitle || !episodes.length) && window.AniListClient) {
        const directDetails = await window.AniListClient.getAnimeDetails(animeId).catch(() => null);
        if (directDetails && (directDetails.title?.english || directDetails.title?.romaji)) {
          const directTitle = directDetails.title?.english || directDetails.title?.romaji || directDetails.title?.userPreferred || '';
          const epRes = await fetch(`/api/episodes?query=${encodeURIComponent(directTitle)}`).catch(() => null);
          let extractedEps = [];
          let match = null;
          if (epRes && epRes.ok) {
            const epJson = await epRes.json().catch(() => ({}));
            if (epJson.success && Array.isArray(epJson.data)) {
              extractedEps = epJson.data;
              match = epJson.hiAnimeMatch;
            }
          }
          anime = {
            ...directDetails,
            totalEpisodes: directDetails.episodes || extractedEps.length,
            episodes: extractedEps,
            streamEpisodes: extractedEps,
            hiAnimeMatch: match
          };
          episodes = extractedEps;

          // Silent self-heal: sync accurate title and poster to backend history!
          if (state.auth && state.auth.token) {
            fetch('/api/user/history', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${state.auth.token}` },
              body: JSON.stringify({
                animeId: String(animeId),
                animeTitle: directTitle,
                poster: directDetails.coverImage?.extraLarge || directDetails.coverImage?.large || directDetails.bannerImage || '',
                episodeNum: Number(episodeNum) || 1,
                progressSeconds: Number(startTime) || 0,
                durationSeconds: 1420
              })
            }).catch(() => {});
          }
        }
      }

      if (!anime || !anime.title) {
        showToast('Anime metadata could not be loaded', 'error');
        navigateTo('home');
        return;
      }

      state.currentAnime = anime;
      state.currentAnime.episodes = episodes;

      // Update Breadcrumbs & Info safely
      const genre = anime.genres?.[0] || 'Anime';
      if (crumbAnimeGenre) crumbAnimeGenre.textContent = genre;
      const currentTitle = anime.title?.english || anime.title?.romaji || 'Anime';
      if (crumbAnimeTitle) crumbAnimeTitle.textContent = currentTitle;
      if (crumbEpisodeNum) crumbEpisodeNum.textContent = `Episode ${episodeNum}`;
      document.title = `Watch Episode ${episodeNum} — ${currentTitle} [${(state.currentMode || 'sub').toUpperCase()}] | Om CLI`;

      if (detailPosterImg) detailPosterImg.src = anime.coverImage?.extraLarge || anime.coverImage?.large || '';
      if (detailAnimeTitle) detailAnimeTitle.textContent = anime.title?.english || anime.title?.romaji || 'Anime';
      if (detailAnimeNative) detailAnimeNative.textContent = anime.title?.native || '';
      if (detailAnimeScore) detailAnimeScore.textContent = `★ ${(anime.averageScore ? (anime.averageScore / 10).toFixed(1) : '9.0')}`;

      if (detailTagsContainer) {
        detailTagsContainer.innerHTML = (anime.genres || []).map(g => `
          <span class="px-2 py-0.5 rounded bg-surface-container-high border border-white/[0.08] text-white text-[11px] font-medium">${g}</span>
        `).join('');
      }

      if (detailSynopsisText) {
        detailSynopsisText.innerHTML = (anime.description || 'No synopsis provided.').replace(/<[^>]*>/g, '');
      }

      // Check Watchlist status
      updateWatchlistButtonState(anime.id);

      // Render Episode Queue
      if (episodesTotalCount) episodesTotalCount.textContent = `${episodes.length} EP`;
      renderEpisodeQueue(episodes, state.currentEpisodeIndex);

      // Load Current Episode Stream
      const currentEp = episodes[state.currentEpisodeIndex] || { id: `${animeId}-${episodeNum}`, number: episodeNum };
      if (currentEpTitle) currentEpTitle.textContent = `Episode ${currentEp.number || episodeNum}`;
      if (currentAnimeTitleSub) currentAnimeTitleSub.textContent = anime.title?.english || anime.title?.romaji || 'Anime';

      // Load stream into Artplayer with cross-device resume
      let resumeTime = Number(startTime) || 0;
      if (!resumeTime && state.userHistory && state.userHistory.length > 0) {
        const histMatch = state.userHistory.find(h => String(h.anime_id) === String(animeId));
        if (histMatch && Number(histMatch.episode_num) === Number(episodeNum) && Number(histMatch.progress_seconds) > 0) {
          resumeTime = Number(histMatch.progress_seconds);
        }
      }
      if (!resumeTime) {
        try {
          const localProg = JSON.parse(localStorage.getItem(`ani_progress_${animeId}`));
          if (localProg && Number(localProg.episode) === Number(episodeNum) && Number(localProg.time) > 0) {
            resumeTime = Number(localProg.time);
          }
        } catch {}
      }

      // If resumeTime is in the last 25 seconds of the episode, reset to 0 to avoid immediate auto-next/freeze
      if (resumeTime > 0 && currentEp.duration && resumeTime >= (currentEp.duration - 25)) {
        resumeTime = 0;
      }

      const posterUrl = anime.bannerImage || anime.coverImage?.extraLarge || '';
      state.player.loadStream(currentEp.id, resolvedMode, posterUrl, resumeTime).then(() => {
        // Mobile auto-scroll: smoothly scroll the player into optimal viewing position
        if (window.innerWidth < 768) {
          const stage = document.getElementById('video-stage-container');
          if (stage) {
            setTimeout(() => {
              stage.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }, 100);
          }
        } else {
          window.scrollTo(0, 0);
          document.documentElement.scrollTop = 0;
          document.body.scrollTop = 0;
        }

        if (state.player && state.player.art) {
          state.player.art.on('fullscreen', (isFull) => {
            if (btnFullscreenDown) {
              btnFullscreenDown.innerHTML = isFull
                ? '<span class="material-symbols-outlined text-[16px]">fullscreen_exit</span><span>Exit Fullscreen</span>'
                : '<span class="material-symbols-outlined text-[16px]">fullscreen</span><span>Fullscreen</span>';
            }
          });
        }
      }).catch(err => {
        console.error('[WatchRoom] Error loading stream into player:', err);
      });

      // Load recommendations
      loadRecommendations(anime.recommendations?.nodes || []);

    } catch (err) {
      console.error('[WatchRoom] Error loading watch room:', err);
      showToast(`Error: ${err.message}`, 'error');
    }
  }

  function renderEpisodeQueue(episodes, activeIndex) {
    if (!episodes || !episodes.length) {
      episodesScrollList.innerHTML = '<div class="py-6 text-center text-gray-500 font-mono text-xs">No episodes listed yet.</div>';
      return;
    }

    // Build Range Tabs if episodes > 50
    if (episodes.length > 50) {
      const ranges = [];
      for (let i = 0; i < episodes.length; i += 50) {
        const start = i + 1;
        const end = Math.min(episodes.length, i + 50);
        ranges.push({ start, end, index: Math.floor(i / 50) });
      }

      rangeTabsContainer.innerHTML = ranges.map((r, idx) => `
        <button class="range-tab px-2.5 py-1 rounded-md ${idx === 0 ? 'bg-primary-container text-white' : 'bg-surface-container text-gray-400'} font-mono text-[10px] font-bold whitespace-nowrap" data-start="${r.start}" data-end="${r.end}">
          ${r.start}-${r.end}
        </button>
      `).join('');

      rangeTabsContainer.querySelectorAll('.range-tab').forEach(tab => {
        tab.addEventListener('click', () => {
          rangeTabsContainer.querySelectorAll('.range-tab').forEach(t => t.className = 'range-tab px-2.5 py-1 rounded-md bg-surface-container text-gray-400 font-mono text-[10px] font-bold whitespace-nowrap');
          tab.className = 'range-tab px-2.5 py-1 rounded-md bg-primary-container text-white font-mono text-[10px] font-bold whitespace-nowrap';
          filterEpisodesByRange(parseInt(tab.dataset.start), parseInt(tab.dataset.end));
        });
      });
    } else {
      rangeTabsContainer.innerHTML = '';
    }

    renderEpisodeTiles(episodes, activeIndex);
  }

  function renderEpisodeTiles(episodes, activeIndex) {
    episodesScrollList.innerHTML = episodes.map((ep, idx) => {
      const isActive = idx === activeIndex;
      const isWatched = isEpisodeWatched(ep.number || idx + 1);

      return `
        <div class="ep-tile flex items-center justify-between p-2.5 rounded-xl ${isActive ? 'bg-primary-container/20 border border-primary/40' : 'bg-surface-container-low border border-white/[0.04] hover:bg-surface-container'} transition-all cursor-pointer group" data-idx="${idx}" data-num="${ep.number || idx + 1}" onclick="window.playEpisodeAtIndex(${idx})">
          <div class="flex items-center gap-3">
            <span class="w-7 h-7 rounded-lg ${isActive ? 'bg-primary-container text-white' : 'bg-surface-container-high text-gray-300'} font-mono text-xs font-bold flex items-center justify-center">
              ${ep.number || idx + 1}
            </span>
            <div class="flex flex-col">
              <span class="text-xs font-bold ${isActive ? 'text-primary' : 'text-white'} group-hover:text-primary transition-colors">
                Episode ${ep.number || idx + 1}
              </span>
              <span class="text-[10px] font-mono text-gray-500">${ep.title ? ep.title : 'Official Stream'}</span>
            </div>
          </div>

          <!-- Active Soundwave Equalizer or Watched Status -->
          <div class="flex items-center gap-2">
            ${isActive ? `
              <div class="wave-equalizer flex items-end gap-[3px] h-4">
                <span class="wave-bar w-[3px] h-full bg-primary rounded-full animate-bounce"></span>
                <span class="wave-bar w-[3px] h-3 bg-primary rounded-full animate-pulse"></span>
                <span class="wave-bar w-[3px] h-full bg-primary rounded-full animate-bounce"></span>
              </div>
            ` : isWatched ? `
              <span class="material-symbols-outlined text-[16px] text-emerald-400" title="Watched">check_circle</span>
            ` : ''}
          </div>
        </div>
      `;
    }).join('');

    // Scroll active episode tile into view inside episodes container only (never scroll the outer window)
    const activeTile = episodesScrollList.querySelector(`.ep-tile[data-idx="${activeIndex}"]`);
    if (activeTile && episodesScrollList) {
      const offsetTop = activeTile.offsetTop - episodesScrollList.offsetTop;
      episodesScrollList.scrollTop = Math.max(0, offsetTop - 40);
    }
  }

  function filterEpisodesByRange(start, end) {
    const tiles = episodesScrollList.querySelectorAll('.ep-tile');
    tiles.forEach(tile => {
      const num = parseInt(tile.dataset.num);
      tile.style.display = (num >= start && num <= end) ? 'flex' : 'none';
    });
  }

  function isEpisodeWatched(epNum) {
    if (!state.userHistory.length || !state.currentAnime) return false;
    const item = state.userHistory.find(h => String(h.anime_id) === String(state.currentAnime.id));
    return item && item.episode_num >= epNum;
  }

  window.playEpisodeAtIndex = function(index, resumeTime = 0) {
    if (!state.currentAnime || !state.currentAnime.episodes) return;
    const episodes = state.currentAnime.episodes;
    if (index < 0 || index >= episodes.length) return;

    state.currentEpisodeIndex = index;
    const ep = episodes[index];
    const epNum = ep.number || index + 1;

    if (crumbEpisodeNum) crumbEpisodeNum.textContent = `Episode ${epNum}`;
    if (currentEpTitle) currentEpTitle.textContent = `Episode ${epNum}`;
    const epAnimeTitle = state.currentAnime.title?.english || state.currentAnime.title?.romaji || 'Anime';
    document.title = `Watch Episode ${epNum} — ${epAnimeTitle} [${(state.currentMode || 'sub').toUpperCase()}] | Om CLI`;

    renderEpisodeTiles(episodes, index);

    // Update URL without triggering recursive hashchange re-render
    try {
      history.replaceState(null, '', `#watch?anime=${state.currentAnime.id}&ep=${epNum}&mode=${state.currentMode}`);
    } catch {}

    const posterUrl = state.currentAnime.bannerImage || state.currentAnime.coverImage?.extraLarge || '';
    state.player.loadStream(ep.id, state.currentMode, posterUrl, resumeTime);
  };

  function playNextEpisode() {
    if (!state.currentAnime || !state.currentAnime.episodes) return;
    const nextIdx = state.currentEpisodeIndex + 1;
    if (nextIdx < state.currentAnime.episodes.length) {
      const nextEp = state.currentAnime.episodes[nextIdx];
      const epNum = nextEp ? (nextEp.number || nextIdx + 1) : nextIdx + 1;
      showToast(`Auto-playing Episode ${epNum}...`, 'info');

      // Update watch progress to new episode at 0s
      saveLocalWatchProgress({
        animeId: state.currentAnime.id,
        animeTitle: state.currentAnime.title?.english || state.currentAnime.title?.romaji || 'Anime',
        poster: state.currentAnime.coverImage?.extraLarge || state.currentAnime.coverImage?.large || state.currentAnime.bannerImage || '',
        episodeNum: epNum,
        episodeId: nextEp?.id || '',
        progressSeconds: 0,
        durationSeconds: 1420
      });
      if (state.auth && state.auth.token) {
        syncProgressToBackend(0, 1420);
      }

      window.playEpisodeAtIndex(nextIdx);
    } else {
      showToast('You have reached the latest episode!', 'info');
    }
  }

  function playPrevEpisode() {
    if (!state.currentAnime || !state.currentAnime.episodes) return;
    const prevIdx = state.currentEpisodeIndex - 1;
    if (prevIdx >= 0) {
      window.playEpisodeAtIndex(prevIdx);
    }
  }

  btnNextEp.addEventListener('click', playNextEpisode);
  btnPrevEp.addEventListener('click', playPrevEpisode);

  if (btnPlayPauseDown) {
    btnPlayPauseDown.addEventListener('click', () => {
      if (state.player && typeof state.player.togglePlay === 'function') {
        state.player.togglePlay();
      } else if (state.player && state.player.art) {
        state.player.art.toggle();
      }
    });
  }

  if (btnSkipBackward10) {
    btnSkipBackward10.addEventListener('click', () => {
      if (state.player && typeof state.player.seekRelative === 'function') {
        state.player.seekRelative(-10);
        if (state.player.showQuickSeekFeedback) state.player.showQuickSeekFeedback('left', '-10s');
      } else if (state.player && state.player.art) {
        state.player.art.currentTime = Math.max(0, state.player.art.currentTime - 10);
      }
    });
  }

  if (btnSkipBackward5) {
    btnSkipBackward5.addEventListener('click', () => {
      if (state.player && typeof state.player.seekRelative === 'function') {
        state.player.seekRelative(-5);
        if (state.player.showQuickSeekFeedback) state.player.showQuickSeekFeedback('left', '-5s');
      } else if (state.player && state.player.art) {
        state.player.art.currentTime = Math.max(0, state.player.art.currentTime - 5);
      }
    });
  }

  if (btnSkipForward5) {
    btnSkipForward5.addEventListener('click', () => {
      if (state.player && typeof state.player.seekRelative === 'function') {
        state.player.seekRelative(5);
        if (state.player.showQuickSeekFeedback) state.player.showQuickSeekFeedback('right', '+5s');
      } else if (state.player && state.player.art) {
        state.player.art.currentTime = Math.min(state.player.art.duration || Infinity, state.player.art.currentTime + 5);
      }
    });
  }

  if (btnSkipForward10) {
    btnSkipForward10.addEventListener('click', () => {
      if (state.player && typeof state.player.seekRelative === 'function') {
        state.player.seekRelative(10);
        if (state.player.showQuickSeekFeedback) state.player.showQuickSeekFeedback('right', '+10s');
      } else if (state.player && state.player.art) {
        state.player.art.currentTime = Math.min(state.player.art.duration || Infinity, state.player.art.currentTime + 10);
      }
    });
  }

  btnSkipIntro.addEventListener('click', () => {
    if (state.player && typeof state.player.seekRelative === 'function') {
      state.player.seekRelative(85);
      showToast('Skipped intro (+85s)', 'info');
    } else if (state.player && state.player.art) {
      state.player.art.currentTime = Math.min(state.player.art.duration, state.player.art.currentTime + 85);
      showToast('Skipped intro (+85s)', 'info');
    }
  });

  // Theater Mode Toggle
  btnTheaterMode.addEventListener('click', () => {
    const isTheater = playerGridLayout.classList.toggle('theater-mode');
    btnTheaterMode.classList.toggle('bg-primary-container', isTheater);
    btnTheaterMode.classList.toggle('text-white', isTheater);
  });

  // Share Watch Room Link
  btnShareRoom.addEventListener('click', () => {
    navigator.clipboard.writeText(window.location.href).then(() => {
      showToast('Watch room link copied to clipboard!', 'success');
    }).catch(() => {
      showToast('Failed to copy link', 'error');
    });
  });

  // Watchlist Toggle
  btnToggleWatchlist.addEventListener('click', () => {
    if (!state.currentAnime) return;
    toggleWatchlistAnime(state.currentAnime);
  });

  function updateWatchlistBadges(count) {
    if (flyoutWatchlistCount) flyoutWatchlistCount.textContent = count;
    if (mobileWatchlistBadge) {
      if (count > 0) {
        mobileWatchlistBadge.textContent = count > 99 ? '99+' : count;
        mobileWatchlistBadge.classList.remove('hidden');
      } else {
        mobileWatchlistBadge.classList.add('hidden');
      }
    }
  }

  async function updateWatchlistButtonState(animeId) {
    if (!state.auth.token) {
      if (textWatchlistStatus) textWatchlistStatus.textContent = 'Add to Watchlist';
      if (iconWatchlistStatus) iconWatchlistStatus.textContent = 'bookmark_add';
      return;
    }

    try {
      const res = await fetch('/api/user/watchlist', {
        headers: { 'Authorization': `Bearer ${state.auth.token}` }
      });
      const json = await res.json();
      if (json.success && Array.isArray(json.data)) {
        state.userWatchlist = json.data;
        updateWatchlistBadges(json.data.length);

        const isListed = json.data.some(w => String(w.anime_id) === String(animeId));
        if (isListed) {
          if (textWatchlistStatus) textWatchlistStatus.textContent = 'In Watchlist';
          if (iconWatchlistStatus) iconWatchlistStatus.textContent = 'bookmark_added';
if (btnToggleWatchlist) {
            // Toggle state classes only, so the responsive sizing declared in the
            // markup (px-2.5 sm:px-3) is preserved.
            btnToggleWatchlist.classList.remove('bg-surface-container-low', 'text-gray-300', 'hover:text-primary', 'border-white/[0.08]');
            btnToggleWatchlist.classList.add('bg-primary-container/20', 'border-primary/40', 'text-primary');
          }
        } else {
          if (textWatchlistStatus) textWatchlistStatus.textContent = 'Add to Watchlist';
          if (iconWatchlistStatus) iconWatchlistStatus.textContent = 'bookmark_add';
if (btnToggleWatchlist) {
            // Toggle state classes only, so the responsive sizing declared in the
            // markup (px-2.5 sm:px-3) is preserved.
            btnToggleWatchlist.classList.remove('bg-primary-container/20', 'border-primary/40', 'text-primary');
            btnToggleWatchlist.classList.add('bg-surface-container-low', 'border-white/[0.08]', 'text-gray-300', 'hover:text-primary');
          }
        }
      }
    } catch {}
  }

  async function toggleWatchlistAnime(anime) {
    if (!state.auth.token) {
      openAuthModal('login');
      return;
    }

    const animeId = anime.id;
    const title = anime.title?.english || anime.title?.romaji || 'Anime';
    const poster = anime.coverImage?.extraLarge || anime.coverImage?.large || '';
    const isListed = state.userWatchlist.some(w => String(w.anime_id) === String(animeId));

    try {
      if (isListed) {
        await fetch(`/api/user/watchlist/${animeId}`, {
          method: 'DELETE',
          headers: { 'Authorization': `Bearer ${state.auth.token}` }
        });
        showToast(`Removed "${title}" from Watchlist`, 'info');
      } else {
        await fetch('/api/user/watchlist', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${state.auth.token}`
          },
          body: JSON.stringify({
            animeId,
            animeTitle: title,
            poster,
            status: 'Watching'
          })
        });
        showToast(`Added "${title}" to Watchlist!`, 'success');
      }
      updateWatchlistButtonState(animeId);
    } catch (err) {
      showToast(err.message, 'error');
    }
  }

  window.toggleWatchlistAnimeById = function(id, title, poster) {
    toggleWatchlistAnime({
      id,
      title: { english: title },
      coverImage: { extraLarge: poster }
    });
  };

  // Debounced History Progress Sync
  async function syncProgressToBackend(progressSeconds, durationSeconds) {
    if (!state.auth.token || !state.currentAnime) return;
    const episodes = state.currentAnime.episodes || [];
    const currentEp = episodes[state.currentEpisodeIndex] || {};
    const animeId = String(state.currentAnime.id);
    if (!animeId || animeId === 'undefined' || animeId === 'null' || animeId.includes('|')) return;

    const animeTitle = state.currentAnime.title?.english || state.currentAnime.title?.romaji || state.currentAnime.title?.userPreferred || 'Anime';
    const poster = state.currentAnime.coverImage?.extraLarge || state.currentAnime.coverImage?.large || state.currentAnime.bannerImage || '';
    if (isGenericTitle(animeTitle) || isGenericPoster(poster)) return;

    const episodeNum = currentEp.number || state.currentEpisodeIndex + 1;
    const episodeId = currentEp.id || '';

    // Optimistically update state.userHistory in memory
    if (state.userHistory) {
      const existingIdx = state.userHistory.findIndex(h => String(h.anime_id) === animeId);
      const updatedItem = {
        anime_id: animeId,
        anime_title: animeTitle,
        poster,
        episode_num: episodeNum,
        episode_id: episodeId,
        progress_seconds: progressSeconds,
        duration_seconds: durationSeconds,
        updated_at: Date.now()
      };
      if (existingIdx >= 0) {
        state.userHistory[existingIdx] = updatedItem;
      } else {
        state.userHistory.unshift(updatedItem);
      }
    }

    try {
      await fetch('/api/user/history', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${state.auth.token}`
        },
        body: JSON.stringify({
          animeId,
          animeTitle,
          poster,
          episodeNum,
          episodeId,
          progressSeconds,
          durationSeconds
        })
      });
    } catch {}
  }

  function loadRecommendations(recs) {
    if (!recs || !recs.length) {
      recsListContainer.innerHTML = '<div class="py-4 text-center text-gray-500 font-mono text-xs">No related titles.</div>';
      return;
    }

    recsListContainer.innerHTML = recs.slice(0, 4).map(node => {
      const media = node.mediaRecommendation;
      if (!media) return '';
      const title = media.title?.english || media.title?.romaji || 'Anime';
      const poster = media.coverImage?.medium || media.coverImage?.large || '';
      const score = media.averageScore ? (media.averageScore / 10).toFixed(1) : '8.5';

      return `
        <div class="p-2 rounded-xl bg-surface-container-low hover:bg-surface-container border border-white/[0.04] hover:border-primary/40 flex items-center gap-3 transition-all cursor-pointer group" onclick="window.location.hash='watch?anime=${media.id}&ep=1'">
          <img src="${poster}" alt="${title}" class="w-10 h-14 object-cover rounded-lg flex-shrink-0">
          <div class="flex flex-col min-w-0 flex-1">
            <span class="text-xs font-bold text-white group-hover:text-primary transition-colors truncate">${title}</span>
            <span class="text-[10px] font-mono text-gray-500">${media.format || 'TV'} • ★ ${score}</span>
          </div>
          <span class="material-symbols-outlined text-gray-500 group-hover:text-primary text-[18px]">play_circle</span>
        </div>
      `;
    }).join('');
  }

  // ============================================================================
  // USER ACCOUNT, WATCHLIST & SETTINGS MODULE
  // ============================================================================

  accountSubTabs.addEventListener('click', (e) => {
    const tab = e.target.closest('.account-tab');
    if (!tab) return;
    const tabName = tab.dataset.tab;
    switchAccountTab(tabName);
  });

  function switchAccountTab(tabName) {
accountSubTabs.querySelectorAll('.account-tab').forEach(t => {
      const isActive = t.dataset.tab === tabName;
      // Toggle state classes only. Rewriting className here used to drop the
      // responsive variants the markup defines for narrow phones
      // (px-3 sm:px-4, py-2 sm:py-2.5, gap-1.5 sm:gap-2, whitespace-nowrap),
      // which broke the tab strip after the first tap on a small screen.
      t.classList.toggle('active', isActive);
      t.classList.toggle('text-white', isActive);
      t.classList.toggle('text-gray-400', !isActive);
      t.classList.toggle('border-primary', isActive);
      t.classList.toggle('border-transparent', !isActive);
      t.classList.toggle('hover:text-white', !isActive);
    });

    document.querySelectorAll('.account-tab-panel').forEach(p => p.classList.add('hidden'));
    const targetPanel = document.getElementById(`tab-content-${tabName}`);
    if (targetPanel) targetPanel.classList.remove('hidden');

    if (tabName === 'preferences') {
      if (prefAudio) prefAudio.value = state.currentMode || 'sub';
      if (prefAutoNext) prefAutoNext.checked = state.player ? state.player.autoNext : (localStorage.getItem('omcli_auto_next') !== '0');
      if (prefSkipIntro) prefSkipIntro.checked = localStorage.getItem('omcli_skip_intro') !== '0';
      if (prefQuality) prefQuality.value = localStorage.getItem('omcli_quality') || 'auto';
    }
  }

  async function loadAccountData() {
    if (!state.auth.token) {
      openAuthModal('login');
      return;
    }

    try {
      // 1. Fetch Profile & Stats
      const profRes = await fetch('/api/user/profile', {
        headers: { 'Authorization': `Bearer ${state.auth.token}` }
      });
      const profJson = await profRes.json();

      if (profJson.success && profJson.data) {
        const { stats, user } = profJson.data;
        if (user) updateAuthUI(user);
        if (stats) {
          if (statTotalEpisodes) statTotalEpisodes.innerHTML = `${stats.totalEpisodesWatched || 0} <span class="text-primary text-sm font-normal">Eps</span>`;
          if (statTotalDays) statTotalDays.textContent = `${stats.totalDaysWatched || '0.0'} Days`;
          if (statCompletedShows) statCompletedShows.innerHTML = `${stats.completedSeriesCount || 0} <span class="text-secondary text-sm font-normal">Shows</span>`;
          if (statWatchlistCount) statWatchlistCount.innerHTML = `${stats.watchlistCount || 0} <span class="text-tertiary text-sm font-normal">Titles</span>`;
          const statMeanScore = document.getElementById('stat-mean-score');
          if (statMeanScore) {
            statMeanScore.innerHTML = `${stats.meanScore || '--'} <span class="text-yellow-400 text-sm font-normal">★</span>`;
          }
          updateWatchlistBadges(stats.watchlistCount || 0);
          if (flyoutHistoryCount) flyoutHistoryCount.textContent = stats.totalEpisodesWatched || 0;
        }
      }

      // 2. Load Watchlist Tab
      loadAccountWatchlist('All');

      // 3. Load Watch History Tab
      loadAccountHistory();

    } catch (err) {
      console.error('[Account] Error loading data:', err);
    }
  }

  // Watchlist Filter Chips in Account
  watchlistStatusChips.addEventListener('click', (e) => {
    const chip = e.target.closest('.wl-chip');
    if (!chip) return;
    watchlistStatusChips.querySelectorAll('.wl-chip').forEach(c => {
      c.className = 'wl-chip px-3 py-1 rounded-full bg-surface-container-low border border-white/[0.06] text-gray-400 hover:text-white font-mono text-xs font-bold';
    });
    chip.className = 'wl-chip active px-3 py-1 rounded-full bg-primary-container text-white font-mono text-xs font-bold';
    loadAccountWatchlist(chip.dataset.status);
  });

  async function loadAccountWatchlist(statusFilter = 'All') {
    accountWatchlistGrid.innerHTML = '<div class="col-span-full py-8 flex justify-center"><div class="w-8 h-8 rounded-full border-2 border-primary border-t-transparent animate-spin"></div></div>';

    try {
      const url = statusFilter === 'All' ? '/api/user/watchlist' : `/api/user/watchlist?status=${encodeURIComponent(statusFilter)}`;
      const res = await fetch(url, {
        headers: { 'Authorization': `Bearer ${state.auth.token}` }
      });
      const json = await res.json();

      if (json.success && Array.isArray(json.data)) {
        watchlistCountBadge.textContent = `${json.data.length} TITLES`;
        renderAccountWatchlistGrid(json.data);
      } else {
        accountWatchlistGrid.innerHTML = '<div class="col-span-full py-8 text-center text-gray-500 font-mono text-xs">Your watchlist is currently empty.</div>';
      }
    } catch {
      accountWatchlistGrid.innerHTML = '<div class="col-span-full py-8 text-center text-red-400 font-mono text-xs">Failed to load watchlist.</div>';
    }
  }

  function renderAccountWatchlistGrid(list) {
    if (!list.length) {
      accountWatchlistGrid.innerHTML = '<div class="col-span-full py-8 text-center text-gray-500 font-mono text-xs">No entries match this filter.</div>';
      return;
    }

    accountWatchlistGrid.innerHTML = list.map(item => `
      <div class="group relative bg-surface-container-low border border-white/[0.08] hover:border-primary/50 rounded-2xl overflow-hidden shadow-lg transition-all duration-300 flex flex-col cursor-pointer" onclick="window.location.hash='watch?anime=${item.anime_id}&ep=1'">
        <div class="relative aspect-[2/3] w-full bg-surface-container-high overflow-hidden">
          <img src="${item.poster || 'https://via.placeholder.com/300x450'}" alt="${item.anime_title}" class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500">
          <div class="absolute inset-0 bg-gradient-to-t from-surface-container-lowest via-transparent to-transparent"></div>
          
          <div class="absolute top-2 left-2">
            <span class="px-2 py-0.5 rounded bg-black/60 backdrop-blur-md text-white font-mono text-[10px] font-bold border border-white/[0.1]">
              ${item.status || 'Watching'}
            </span>
          </div>

          <div class="absolute top-2 right-2">
            <button class="w-7 h-7 rounded-full bg-black/60 text-red-400 hover:bg-red-500 hover:text-white flex items-center justify-center transition-all" title="Remove" onclick="event.stopPropagation(); window.removeWatchlistItem('${item.anime_id}')">
              <span class="material-symbols-outlined text-[15px]">delete</span>
            </button>
          </div>
        </div>

        <div class="p-3 flex flex-col gap-1">
          <h3 class="text-xs font-bold text-white line-clamp-1 group-hover:text-primary transition-colors">${item.anime_title}</h3>
          <span class="text-[10px] font-mono text-secondary font-semibold">Resume Watching &rarr;</span>
        </div>
      </div>
    `).join('');
  }

  window.removeWatchlistItem = async function(animeId) {
    if (!state.auth.token) return;
    try {
      await fetch(`/api/user/watchlist/${animeId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${state.auth.token}` }
      });
      showToast('Item removed from watchlist', 'info');
      loadAccountWatchlist();
    } catch {}
  };

  // History Tab
  async function loadAccountHistory() {
    accountHistoryList.innerHTML = '<div class="py-8 flex justify-center"><div class="w-8 h-8 rounded-full border-2 border-primary border-t-transparent animate-spin"></div></div>';

    try {
      const res = await fetch('/api/user/history', {
        headers: { 'Authorization': `Bearer ${state.auth.token}` }
      });
      const json = await res.json();

      if (json.success && Array.isArray(json.data)) {
        const cleanHistory = json.data.filter(item => {
          const title = String(item.anime_title || '');
          const poster = String(item.poster || '');
          return !(isGenericTitle(title) || isGenericPoster(poster));
        });

        if (cleanHistory.length > 0) {
          accountHistoryList.innerHTML = cleanHistory.map(item => {
            const progressPercent = item.duration_seconds > 0 
              ? Math.min(100, Math.round((item.progress_seconds / item.duration_seconds) * 100))
              : 50;
            const dateStr = new Date(item.updated_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

            return `
              <div class="p-3.5 rounded-2xl bg-surface-container-low border border-white/[0.08] hover:border-primary/50 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 transition-all cursor-pointer group" onclick="window.location.hash='watch?anime=${item.anime_id}&ep=${item.episode_num}'">
                <div class="flex items-center gap-3.5 min-w-0">
                  <img src="${item.poster || 'https://via.placeholder.com/60x80'}" alt="${item.anime_title}" class="w-12 h-16 object-cover rounded-xl border border-white/[0.08] flex-shrink-0">
                  <div class="flex flex-col min-w-0">
                    <h3 class="text-sm font-bold text-white group-hover:text-primary transition-colors truncate">${item.anime_title}</h3>
                    <div class="flex items-center gap-2 font-mono text-xs text-gray-400 mt-0.5">
                      <span class="text-secondary font-bold">Episode ${item.episode_num}</span>
                      <span>•</span>
                      <span>${progressPercent}% Watched</span>
                      <span>•</span>
                      <span class="text-[10px] text-gray-500">${dateStr}</span>
                    </div>
                    <!-- Progress bar -->
                    <div class="w-48 bg-surface-container-high h-1 rounded-full overflow-hidden mt-1.5">
                      <div class="bg-primary-container h-full rounded-full" style="width: ${progressPercent}%;"></div>
                    </div>
                  </div>
                </div>

                <div class="flex items-center gap-3 flex-shrink-0 self-end sm:self-center">
                  <button class="px-3.5 py-1.5 rounded-xl bg-primary-container text-white font-mono text-xs font-bold uppercase shadow-md hover:brightness-110 transition-all flex items-center gap-1">
                    <span class="material-symbols-outlined text-[15px]">play_arrow</span>Resume
                  </button>
                  <button class="p-1.5 rounded-lg text-gray-400 hover:text-red-400 hover:bg-red-500/10 transition-all" title="Remove from history" onclick="event.stopPropagation(); window.removeHistoryItem('${item.anime_id}')">
                    <span class="material-symbols-outlined text-[16px]">close</span>
                  </button>
                </div>
              </div>
            `;
          }).join('');
        } else {
          accountHistoryList.innerHTML = '<div class="py-12 text-center text-gray-500 font-mono text-xs">No watch history recorded yet. Start watching anime to build your timeline!</div>';
        }
      } else {
        accountHistoryList.innerHTML = '<div class="py-12 text-center text-gray-500 font-mono text-xs">No watch history recorded yet. Start watching anime to build your timeline!</div>';
      }
    } catch {
      accountHistoryList.innerHTML = '<div class="py-8 text-center text-red-400 font-mono text-xs">Failed to load history timeline.</div>';
    }
  }

  window.removeHistoryItem = async function(animeId, e) {
    continueWatchingRequestId++;
    if (e) {
      try {
        e.preventDefault();
        e.stopPropagation();
      } catch (_) {}
    }

    const cleanId = String(animeId);

    // 1. Instant optimistic DOM removal with smooth animation
    const cardEl = document.getElementById(`continue-card-${cleanId}`);
    if (cardEl) {
      cardEl.style.transition = 'all 0.25s ease-out';
      cardEl.style.opacity = '0';
      cardEl.style.transform = 'scale(0.9)';
      setTimeout(() => {
        cardEl.remove();
        const remaining = continueGrid.querySelectorAll('.continue-card').length;
        const countBadge = document.getElementById('continue-count-badge');
        if (countBadge) countBadge.textContent = `${remaining} IN PROGRESS`;
        if (remaining === 0) {
          continueSection.classList.add('hidden');
        }
      }, 250);
    }

    // 2. Remove from structured omcli_local_history
    try {
      let localHist = JSON.parse(localStorage.getItem('omcli_local_history') || '[]');
      if (Array.isArray(localHist)) {
        localHist = localHist.filter(h => String(h.anime_id) !== cleanId);
        localStorage.setItem('omcli_local_history', JSON.stringify(localHist));
      }
    } catch {}

    // 3. Remove all matching individual progress keys from localStorage
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const key = localStorage.key(i);
      if (!key) continue;
      if (key === `ani_progress_${cleanId}` || key.startsWith(`ani_progress_${cleanId}_`)) {
        localStorage.removeItem(key);
      } else if (key.startsWith('ani_progress_')) {
        try {
          const val = JSON.parse(localStorage.getItem(key));
          if (val && String(val.animeId) === cleanId) {
            localStorage.removeItem(key);
          }
        } catch {}
      }
    }

    // 4. Update memory state
    state.userHistory = (state.userHistory || []).filter(h => String(h.anime_id) !== cleanId);
    if (flyoutHistoryCount) {
      flyoutHistoryCount.textContent = Math.max(0, parseInt(flyoutHistoryCount.textContent || 0) - 1);
    }

    // 5. If authenticated, sync deletion to cloud database
    if (state.auth && state.auth.token) {
      try {
        await fetch(`/api/user/history/${cleanId}`, {
          method: 'DELETE',
          headers: { 'Authorization': `Bearer ${state.auth.token}` }
        });
      } catch (err) {
        console.warn('[History] Backend deletion failed:', err);
      }
    }

    showToast('Removed from Continue Watching', 'info');
    loadAccountHistory();
  };

  // Rail Header Clear All
  const btnClearContinueWatching = document.getElementById('btn-clear-continue-watching');
  if (btnClearContinueWatching) {
    btnClearContinueWatching.addEventListener('click', async (e) => {
      e.preventDefault();
      if (!confirm('Clear all items from Continue Watching?')) return;

      continueWatchingRequestId++;
      continueSection.classList.add('hidden');
      continueGrid.innerHTML = '';
      const countBadge = document.getElementById('continue-count-badge');
      if (countBadge) countBadge.textContent = '0 IN PROGRESS';

      localStorage.removeItem('omcli_local_history');

      for (let i = localStorage.length - 1; i >= 0; i--) {
        const key = localStorage.key(i);
        if (key && (key.startsWith('ani_progress_') || key.startsWith('artplayer_settings_'))) {
          localStorage.removeItem(key);
        }
      }

      state.userHistory = [];
      if (flyoutHistoryCount) flyoutHistoryCount.textContent = '0';

      if (state.auth && state.auth.token) {
        try {
          await fetch('/api/user/history', {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${state.auth.token}` }
          });
        } catch {}
      }

      showToast('Continue Watching cleared', 'info');
      loadAccountHistory();
    });
  }

  btnClearAllHistory.addEventListener('click', async () => {
    if (!state.auth.token || !confirm('Are you sure you want to clear your entire watch history?')) return;
    try {
      await fetch('/api/user/history', {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${state.auth.token}` }
      });
      showToast('Watch history cleared', 'info');
      state.userHistory = [];
      loadAccountHistory();
      loadContinueWatching();
    } catch {}
  });

  // Direct Change on Audio Preference in Settings
  if (prefAudio) {
    prefAudio.addEventListener('change', () => {
      switchGlobalAudio(prefAudio.value);
    });
  }

  // Direct Change on Auto-Next in Settings
  if (prefAutoNext) {
    prefAutoNext.addEventListener('change', () => {
      const isNext = !!prefAutoNext.checked;
      localStorage.setItem('omcli_auto_next', isNext ? '1' : '0');
      if (state.player) {
        state.player.autoNext = isNext;
      }
    });
  }

  // Save Playback Preferences
  btnSavePreferences.addEventListener('click', async () => {
    const chosenAudio = prefAudio ? prefAudio.value : state.currentMode;
    const chosenQuality = prefQuality ? prefQuality.value : 'auto';
    const chosenSkip = prefSkipIntro ? prefSkipIntro.checked : true;
    const chosenNext = prefAutoNext ? prefAutoNext.checked : true;

    // Apply immediately to universal client state & local storage
    state.currentMode = chosenAudio;
    localStorage.setItem('omcli_preferred_audio', chosenAudio);
    localStorage.setItem('omcli_audio_mode', chosenAudio);
    localStorage.setItem('omcli_auto_next', chosenNext ? '1' : '0');
    localStorage.setItem('omcli_skip_intro', chosenSkip ? '1' : '0');
    localStorage.setItem('omcli_quality', chosenQuality);

    updateAudioButtons(chosenAudio);
    if (state.player) {
      state.player.autoNext = chosenNext;
    }

    if (!state.auth.token) {
      showToast('Playback preferences saved locally!', 'success');
      return;
    }

    const data = {
      preferred_audio: chosenAudio,
      preferredAudio: chosenAudio,
      preferred_quality: chosenQuality,
      preferredQuality: chosenQuality,
      auto_skip_intro: chosenSkip ? 1 : 0,
      autoSkipIntro: chosenSkip ? 1 : 0,
      auto_next: chosenNext ? 1 : 0,
      autoNext: chosenNext ? 1 : 0,
      auto_play: 1,
      autoPlay: 1
    };

    try {
      btnSavePreferences.disabled = true;
      btnSavePreferences.textContent = 'Saving...';

      const res = await fetch('/api/user/settings', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${state.auth.token}`
        },
        body: JSON.stringify(data)
      });
      const json = await res.json();

      if (json.success) {
        state.auth.settings = json.data || data;
        showToast('Playback preferences saved to cloud!', 'success');
      } else {
        showToast(json.error || 'Saved locally', 'warning');
      }
    } catch (err) {
      showToast('Saved locally', 'info');
    } finally {
      btnSavePreferences.disabled = false;
      btnSavePreferences.textContent = 'Save Playback Preferences';
    }
  });

  // Permanently Delete Account
  if (btnDeleteAccount) {
    btnDeleteAccount.addEventListener('click', async () => {
      if (!state.auth.token) return;

      const confirmed = confirm(
        '⚠️ PERMANENT ACCOUNT DELETION\n\nAre you sure you want to permanently delete your Om CLI account?\n\nThis will permanently erase:\n• All your watch progress & history\n• All your watchlist items\n• All playback preferences & settings\n• Your account profile and credentials\n\nThis action CANNOT be undone. Proceed?'
      );

      if (!confirmed) return;

      btnDeleteAccount.disabled = true;
      btnDeleteAccount.innerHTML = '<span class="material-symbols-outlined text-[16px] animate-spin">progress_activity</span> Deleting...';

      try {
        const res = await fetch('/api/user/account', {
          method: 'DELETE',
          headers: {
            'Authorization': `Bearer ${state.auth.token}`
          }
        });
        const json = await res.json();

        if (json.success) {
          state.userHistory = [];
          clearAuth();
          showToast('Account permanently deleted.', 'info');
          loadContinueWatching();
          navigateTo('home');
        } else {
          showToast(json.error || 'Failed to delete account', 'error');
          btnDeleteAccount.disabled = false;
          btnDeleteAccount.innerHTML = '<span class="material-symbols-outlined text-[16px]">delete_forever</span> Delete Account';
        }
      } catch (err) {
        showToast('Error deleting account: ' + err.message, 'error');
        btnDeleteAccount.disabled = false;
        btnDeleteAccount.innerHTML = '<span class="material-symbols-outlined text-[16px]">delete_forever</span> Delete Account';
      }
    });
  }

  // ============================================================================
  // LIVE FLOATING SEARCH DROPDOWN
  // ============================================================================

  let liveSearchDebounce = null;
  globalSearchInput.addEventListener('input', (e) => {
    clearTimeout(liveSearchDebounce);
    const query = e.target.value.trim();
    if (!query) {
      searchDropdown.classList.add('hidden');
      searchDropdown.innerHTML = '';
      return;
    }
    liveSearchDebounce = setTimeout(() => handleLiveSearch(query), 300);
  });

  globalSearchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      const q = globalSearchInput.value.trim();
      if (q) {
        searchDropdown.classList.add('hidden');
        navigateTo(`browse?search=${encodeURIComponent(q)}`);
      }
    }
  });

  document.addEventListener('click', (e) => {
    if (!e.target.closest('#global-search-input') && !e.target.closest('#search-dropdown')) {
      searchDropdown.classList.add('hidden');
    }
  });

  async function handleLiveSearch(query) {
    try {
      let results = [];
      // 1. Direct Browser Client (window.AniListClient) - High-speed, unblocked, complete catalog
      if (window.AniListClient) {
        results = await window.AniListClient.searchAnime(query, 1, 10).catch(() => []);
      }
      // 2. Server fallback if direct client failed or returned empty
      if (!results.length) {
        const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`).catch(() => null);
        if (res && res.ok) {
          const json = await res.json().catch(() => ({}));
          if (json.success && Array.isArray(json.data) && json.data.length > 0) {
            results = json.data;
          }
        }
      }

      if (results.length > 0) {
        searchDropdown.innerHTML = results.slice(0, 5).map(item => {
          const title = item.title?.english || item.title?.romaji || 'Anime';
          const poster = item.coverImage?.medium || item.coverImage?.large || '';
          const score = item.averageScore ? (item.averageScore / 10).toFixed(1) : '8.5';

          return `
            <div class="p-2 rounded-lg hover:bg-surface-container flex items-center gap-3 transition-colors cursor-pointer" onclick="window.location.hash='watch?anime=${item.id}&ep=1'; document.getElementById('search-dropdown').classList.add('hidden');">
              <img src="${poster}" alt="${title}" class="w-9 h-12 object-cover rounded-md flex-shrink-0">
              <div class="flex flex-col min-w-0 flex-1">
                <span class="text-xs font-bold text-white truncate">${title}</span>
                <span class="text-[10px] font-mono text-gray-500">${item.format || 'TV'} • ★ ${score}</span>
              </div>
            </div>
          `;
        }).join('') + `
          <div class="pt-2 mt-1 border-t border-white/[0.06] text-center">
            <button class="text-xs font-mono text-secondary hover:underline font-bold" onclick="window.location.hash='browse?search=${encodeURIComponent(query)}'; document.getElementById('search-dropdown').classList.add('hidden');">
              View All Results &rarr;
            </button>
          </div>
        `;
        searchDropdown.classList.remove('hidden');
      } else {
        searchDropdown.innerHTML = '<div class="p-3 text-center text-xs font-mono text-gray-500">No matching titles</div>';
        searchDropdown.classList.remove('hidden');
      }
    } catch {}
  }

  // ============================================================================
  // MOBILE SEARCH MODAL & INSTANT RESULTS
  // ============================================================================

  if (btnMobileSearchToggle) {
    btnMobileSearchToggle.addEventListener('click', () => {
      if (mobileSearchModal) {
        mobileSearchModal.classList.remove('hidden');
        mobileSearchModal.classList.add('flex');
        if (mobileSearchInput) {
          mobileSearchInput.value = '';
          setTimeout(() => mobileSearchInput.focus(), 80);
        }
        if (mobileSearchResults) mobileSearchResults.innerHTML = '';
      }
    });
  }

  if (mobileSearchCloseBtn) {
    mobileSearchCloseBtn.addEventListener('click', () => {
      if (mobileSearchModal) {
        mobileSearchModal.classList.add('hidden');
        mobileSearchModal.classList.remove('flex');
      }
    });
  }

  let mobileLiveSearchDebounce = null;
  if (mobileSearchInput) {
    mobileSearchInput.addEventListener('input', (e) => {
      clearTimeout(mobileLiveSearchDebounce);
      const query = e.target.value.trim();
      if (mobileSearchClearBtn) {
        if (query) mobileSearchClearBtn.classList.remove('hidden');
        else mobileSearchClearBtn.classList.add('hidden');
      }
      if (!query) {
        if (mobileSearchResults) mobileSearchResults.innerHTML = '';
        return;
      }
      mobileLiveSearchDebounce = setTimeout(() => handleMobileLiveSearch(query), 300);
    });

    mobileSearchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const q = mobileSearchInput.value.trim();
        if (q) {
          if (mobileSearchModal) {
            mobileSearchModal.classList.add('hidden');
            mobileSearchModal.classList.remove('flex');
          }
          navigateTo(`browse?search=${encodeURIComponent(q)}`);
        }
      }
    });
  }

  if (mobileSearchClearBtn) {
    mobileSearchClearBtn.addEventListener('click', () => {
      if (mobileSearchInput) {
        mobileSearchInput.value = '';
        mobileSearchInput.focus();
      }
      mobileSearchClearBtn.classList.add('hidden');
      if (mobileSearchResults) mobileSearchResults.innerHTML = '';
    });
  }

  mobileQuickTags.forEach(tag => {
    tag.addEventListener('click', () => {
      const q = tag.dataset.query;
      if (mobileSearchInput) {
        mobileSearchInput.value = q;
        if (mobileSearchClearBtn) mobileSearchClearBtn.classList.remove('hidden');
        handleMobileLiveSearch(q);
      }
    });
  });

  async function handleMobileLiveSearch(query) {
    if (!mobileSearchResults) return;
    try {
      mobileSearchResults.innerHTML = '<div class="py-8 flex justify-center"><div class="w-7 h-7 rounded-full border-2 border-primary border-t-transparent animate-spin"></div></div>';
      let results = [];
      // 1. Direct Browser Client (window.AniListClient) - High-speed, unblocked, complete catalog
      if (window.AniListClient) {
        results = await window.AniListClient.searchAnime(query, 1, 10).catch(() => []);
      }
      // 2. Server fallback if direct client failed or returned empty
      if (!results.length) {
        const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`).catch(() => null);
        if (res && res.ok) {
          const json = await res.json().catch(() => ({}));
          if (json.success && Array.isArray(json.data) && json.data.length > 0) {
            results = json.data;
          }
        }
      }

      if (results.length > 0) {
        mobileSearchResults.innerHTML = results.slice(0, 8).map(item => {
          const title = item.title?.english || item.title?.romaji || 'Anime';
          const poster = item.coverImage?.medium || item.coverImage?.large || '';
          const score = item.averageScore ? (item.averageScore / 10).toFixed(1) : '8.5';

          return `
            <div class="p-2.5 rounded-xl bg-surface-container border border-white/[0.06] hover:bg-surface-container-high flex items-center gap-3 transition-colors cursor-pointer active:scale-98" onclick="window.location.hash='watch?anime=${item.id}&ep=1'; const m = document.getElementById('mobile-search-modal'); if (m) { m.classList.add('hidden'); m.classList.remove('flex'); }">
              <img src="${poster}" alt="${title}" class="w-10 h-14 object-cover rounded-lg flex-shrink-0">
              <div class="flex flex-col min-w-0 flex-1">
                <span class="text-xs font-bold text-white truncate">${title}</span>
                <span class="text-[10px] font-mono text-gray-400 mt-0.5">${item.format || 'TV'} • ★ ${score}</span>
              </div>
              <span class="material-symbols-outlined text-primary text-[20px] flex-shrink-0">play_circle</span>
            </div>
          `;
        }).join('') + `
          <div class="pt-2 text-center">
            <button class="w-full py-2.5 rounded-xl bg-surface-container-high text-xs font-mono font-bold text-secondary hover:text-white transition-colors cursor-pointer" onclick="window.location.hash='browse?search=${encodeURIComponent(query)}'; const m = document.getElementById('mobile-search-modal'); if (m) { m.classList.add('hidden'); m.classList.remove('flex'); }">
              Explore All Results for "${escapeQuotes(query)}" &rarr;
            </button>
          </div>
        `;
      } else {
        mobileSearchResults.innerHTML = '<div class="py-8 text-center text-xs font-mono text-gray-500">No matching anime titles found.</div>';
      }
    } catch {
      mobileSearchResults.innerHTML = '<div class="py-8 text-center text-xs font-mono text-gray-500">Error loading search results.</div>';
    }
  }

  // ============================================================================
  // TOAST NOTIFICATION UTILITY
  // ============================================================================

  function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    const color = type === 'success' ? 'border-primary/50 text-white' : type === 'error' ? 'border-red-500/50 text-red-300' : 'border-secondary/50 text-white';
    const icon = type === 'success' ? 'check_circle' : type === 'error' ? 'error' : 'info';

    toast.className = `flex items-center gap-2.5 px-4 py-2.5 rounded-xl bg-surface-container-low border ${color} shadow-2xl backdrop-blur-md text-xs font-semibold animate-slide-up transition-all`;
    toast.innerHTML = `
      <span class="material-symbols-outlined text-[16px] text-primary">${icon}</span>
      <span>${message}</span>
    `;

    toastContainer.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(10px)';
      setTimeout(() => toast.remove(), 300);
    }, 3500);
  }

  function escapeQuotes(str) {
    return (str || '').replace(/'/g, "\\'").replace(/"/g, '&quot;');
  }

});
