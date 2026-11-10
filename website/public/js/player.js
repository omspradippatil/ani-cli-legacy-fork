// website/public/js/player.js
// Cinema-Grade Artplayer.js Video Player Engine with Hls.js & Subtitles for Om CLI

function sanitizeVtt(vtt) {
  if (typeof vtt !== 'string') return vtt;
  return vtt
    // Unescape pre-escaped HTML formatting tags so they don't print as raw literal text
    .replace(/&lt;(\/?[a-zA-Z0-9]+)&gt;/gi, '<$1>')
    .replace(/&lt;(\/?[a-zA-Z0-9]+)\s+([^&]*?)&gt;/gi, '<$1 $2>')
    // Convert ASS style tags into standard WebVTT formatting
    .replace(/\{\\i1\}/g, '<i>')
    .replace(/\{\\i0\}/g, '</i>')
    .replace(/\{\\b1\}/g, '<b>')
    .replace(/\{\\b0\}/g, '</b>')
    // Remove other ASS position and override tags
    .replace(/\{[^\}]*\}/g, '');
}

class AnimePlayer {
  constructor(mountSelector) {
    this.mountSelector = mountSelector;
    this.art = null;
    this.currentEpisodeId = null;
    this.currentMode = 'sub';
    this.onNextEpisode = null;
    this.onPrevEpisode = null;
    this.onToggleMode = null;
    this.onTimeUpdate = null;
    this.onQualityList = null;
    this.onQualityChange = null;
    this.onCaptionsToggle = null;
    this.autoNext = typeof localStorage !== 'undefined' ? localStorage.getItem('omcli_auto_next') !== '0' : true;
    this.captionsEnabled = true;
    this.levels = [];
    this.currentQualityLabel = 'Auto';
    this._episodeEndedTriggered = false;
    this._keyListener = null;
    this.initKeyboardShortcuts();
  }

  /**
   * Helper to trigger auto-playing next episode safely without double calls
   */
  triggerAutoNext() {
    if (!this.autoNext || this._episodeEndedTriggered) return;
    this._episodeEndedTriggered = true;
    console.log('[Player] Episode completed. Triggering auto next episode...');
    if (this.art && this.art.notice) {
      this.art.notice.show = 'Episode finished. Loading next episode...';
    }
    if (typeof this.onNextEpisode === 'function') {
      setTimeout(() => {
        this.onNextEpisode();
      }, 350);
    }
  }

  /**
   * Initializes or updates Artplayer with a stream
   */
  async loadStream(episodeId, mode = 'sub', posterUrl = '', resumeTime = 0) {
    const cleanMode = (String(mode || '').toLowerCase() === 'dub')
      ? 'dub'
      : (String(mode || '').toLowerCase() === 'sub' ? 'sub' : (this.currentMode || (typeof localStorage !== 'undefined' ? localStorage.getItem('omcli_preferred_audio') : 'sub') || 'sub'));
    this.currentEpisodeId = episodeId;
    this.currentMode = cleanMode;
    this._episodeEndedTriggered = false;

    const mount = document.querySelector(this.mountSelector);
    if (!mount) {
      console.error('[Player] Mount selector not found:', this.mountSelector);
      return;
    }

    // If a player instance already exists and is healthy, switch URL directly
    // This avoids unmounting DOM, prevents audio leaks, and keeps fullscreen state intact!
    if (this.art && !this.art.isDestroy) {
      if (this.art.notice) {
        this.art.notice.show = 'Loading episode stream...';
      }
      try {
        const res = await fetch(`/api/stream/${episodeId}?mode=${cleanMode}`);
        const json = await res.json();
        if (!json.success || !json.data) {
          throw new Error(json.error || 'Failed to fetch episode stream');
        }
        const streamData = json.data;
        const streamUrl = streamData.proxyM3u8;
        const actualMode = streamData.type || cleanMode;
        this.currentMode = actualMode;

        // Prepare Subtitle
        let subUrl = '';
        if (streamData.subtitles && streamData.subtitles.length > 0) {
          const primarySub = streamData.subtitles.find(s => s.default) || streamData.subtitles[0];
          subUrl = primarySub.proxySrc || primarySub.src || '';
        }

        if (posterUrl) this.art.poster = posterUrl;
        if (subUrl && this.art.subtitle) {
          this.art.subtitle.switch(subUrl, {
            escape: false,
            onVttLoad: sanitizeVtt
          });
          this.art.subtitle.show = this.captionsEnabled;
        } else if (this.art.subtitle) {
          this.art.subtitle.show = false;
        }

        // Update in-player SUB / DUB toggle button
        const modeBtn = this.art.template.$controls?.querySelector('.art-btn-mode');
        if (modeBtn) {
          modeBtn.textContent = actualMode.toUpperCase();
        }

        // Switch stream URL
        await this.art.switchUrl(streamUrl);
        if (resumeTime > 0) {
          this.art.currentTime = resumeTime;
        }
        if (this.art.video) {
          this.art.video.muted = false;
          this.art.video.volume = 0.90;
        }
        if (this.art.notice) {
          this.art.notice.show = `Loaded Episode (${actualMode.toUpperCase()})`;
        }

        // Automatically start playing immediately after switching
        try {
          await this.art.play();
        } catch (playErr) {
          console.warn('[Player] Auto-play blocked after switchUrl, falling back to video.play():', playErr);
          if (this.art.video) {
            this.art.video.play().catch(() => {});
          }
        }
        this.updatePlayPauseUI(true);

        return streamData;
      } catch (err) {
        console.error('[Player] Switch stream error:', err);
        if (this.art.notice) {
          this.art.notice.show = `Error: ${err.message}`;
        }
        throw err;
      }
    }

    // FIRST: Stop all existing audio and clean up previous instance
    this.stop();

    // Show loading state in mount element
    mount.innerHTML = `
      <div class="w-full h-full flex flex-col items-center justify-center bg-black/95 text-white gap-3 select-none">
        <div class="w-10 h-10 rounded-full border-2 border-primary border-t-transparent animate-spin"></div>
        <span class="font-mono text-xs text-gray-400 tracking-wider">Connecting to Stream Node...</span>
      </div>
    `;

    try {
      const res = await fetch(`/api/stream/${episodeId}?mode=${cleanMode}`);
      const json = await res.json();

      if (!json.success || !json.data) {
        throw new Error(json.error || 'Failed to fetch episode stream');
      }

      const streamData = json.data;
      const streamUrl = streamData.proxyM3u8;
      const actualMode = streamData.type || cleanMode;
      this.currentMode = actualMode;

      console.log(`[Player] Loaded stream for episode ${episodeId} (${actualMode}):`, streamUrl);

      // Check saved progress: priority to cross-device resumeTime, then local localStorage
      let savedTime = resumeTime || 0;
      if (!savedTime) {
        try {
          const saved = JSON.parse(localStorage.getItem(`ani_progress_${episodeId}`));
          if (saved && saved.time && saved.time < saved.duration - 15) {
            savedTime = saved.time;
          }
        } catch {}
      }

      // Prepare Subtitles
      let subUrl = '';
      if (streamData.subtitles && streamData.subtitles.length > 0) {
        const primarySub = streamData.subtitles.find(s => s.default) || streamData.subtitles[0];
        subUrl = primarySub.proxySrc || primarySub.src || '';
      }

      // Clear legacy muted state from localStorage artplayer settings if present
      try {
        localStorage.removeItem('artplayer_settings');
      } catch {}

      // Create a fresh dedicated stage element inside mount to guarantee NO DOM collision
      mount.innerHTML = '<div id="artplayer-inner-stage" class="w-full h-full relative" style="width:100%;height:100%;"></div>';

      const self = this;

      // Create new Artplayer instance
      this.art = new window.Artplayer({
        container: '#artplayer-inner-stage',
        url: streamUrl,
        type: 'm3u8',
        customType: {
          m3u8: function (video, url, art) {
            if (window.Hls && window.Hls.isSupported()) {
              if (art.hls) {
                try { art.hls.destroy(); } catch (e) {}
              }

              const hls = new window.Hls({
                enableWorker: true,
                maxBufferLength: 30,
                maxMaxBufferLength: 60
              });

              hls.loadSource(url);
              hls.attachMedia(video);
              art.hls = hls;

              art.on('destroy', () => {
                if (hls) {
                  try { hls.destroy(); } catch(e) {}
                }
              });

              hls.on(window.Hls.Events.MANIFEST_PARSED, () => {
                if (hls.levels && hls.levels.length > 0) {
                  const levels = hls.levels.map((lvl, idx) => ({
                    html: `${lvl.height}p`,
                    level: idx,
                    height: lvl.height,
                    default: idx === hls.currentLevel
                  }));
                  levels.unshift({ html: 'Auto', level: -1, height: 0, default: hls.currentLevel === -1 });
                  self.levels = levels;

                  // Update dynamic quality selector in Artplayer
                  try {
                    art.setting.update({
                      name: 'quality',
                      html: 'Quality',
                      tooltip: self.currentQualityLabel,
                      selector: levels,
                      onSelect: function (item) {
                        return self.setQuality(item.level);
                      }
                    });
                  } catch (e) {
                    console.warn('[Player] Quality setting update skipped:', e);
                  }

                  // Update in-player Quality control dropdown
                  if (art.controls && art.controls['quality-btn']) {
                    art.controls.update({
                      name: 'quality-btn',
                      selector: levels,
                      onSelect: function (item) {
                        return self.setQuality(item.level);
                      }
                    });
                  }

                  // Notify external listener (e.g. bottom toolbar dropdown)
                  if (typeof self.onQualityList === 'function') {
                    self.onQualityList(levels, hls.currentLevel);
                  }
                }
              });

              hls.on(window.Hls.Events.ERROR, (event, data) => {
                if (data.fatal) {
                  switch (data.type) {
                    case window.Hls.ErrorTypes.NETWORK_ERROR:
                      console.warn('[Player] Network error, recovering...');
                      hls.startLoad();
                      break;
                    case window.Hls.ErrorTypes.MEDIA_ERROR:
                      console.warn('[Player] Media error, recovering...');
                      hls.recoverMediaError();
                      break;
                    default:
                      console.error('[Player] Fatal unrecoverable error:', data);
                      try { hls.destroy(); } catch(e) {}
                      break;
                  }
                }
              });
            } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
              video.src = url;
            }
          }
        },
        poster: posterUrl || '',
        volume: 1.0,
        isLive: false,
        muted: false,
        autoplay: true,
        storage: false,
        pip: false,
        autoSize: false,
        autoMini: false,
        screenshot: false,
        setting: true,
        settings: [
          {
            name: 'quality',
            html: 'Quality',
            tooltip: 'Auto',
            selector: [{ html: 'Auto', level: -1, default: true }],
            onSelect: function (item) {
              return self.setQuality(item.level);
            }
          }
        ],
        loop: false,
        flip: false,
        playbackRate: true,
        aspectRatio: false,
        fullscreen: false,
        fullscreenWeb: false,
        autoOrientation: true,
        subtitleOffset: true,
        miniProgressBar: true,
        mutex: true,
        backdrop: true,
        playsInline: true,
        autoPlayback: true,
        airplay: true,
        hotkey: false,
        theme: '#ff4f73',
        lang: 'en',
        moreVideoAttr: {
          crossOrigin: 'anonymous',
          playsinline: 'true',
          'webkit-playsinline': 'true'
        },
        subtitle: {
          url: subUrl,
          type: 'vtt',
          style: {
            color: '#ffffff',
            fontSize: 'clamp(13px, 3vw, 20px)',
            textShadow: '0 0 4px #000, 0 0 8px #000, 0 2px 4px #000',
            fontFamily: "'Plus Jakarta Sans', sans-serif",
            fontWeight: '600'
          },
          encoding: 'utf-8',
          escape: false,
          onVttLoad: sanitizeVtt,
        },
        controls: [
          // Rewind 5s button (Left controls)
          {
            name: 'skip-back-5s-btn',
            position: 'left',
            index: 11,
            html: '<button class="art-icon-btn art-btn-skip5" title="Rewind 5s (← / J)"><svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M12 5V1L7 6l5 5V7c3.31 0 6 2.69 6 6s-2.69 6-6 6-6-2.69-6-6H4c0 4.42 3.58 8 8 8s8-3.58 8-8-3.58-8-8-8zm-1.1 11h-.85v-3.26l-1.01.31v-.67l1.73-.57h.13V16zm2.97-.04c-.3.04-.6.04-.88 0-.44-.06-.77-.24-1-.53-.22-.29-.33-.67-.33-1.14 0-.48.11-.86.34-1.15.23-.29.57-.46 1.01-.52.29-.04.59-.04.88 0 .44.06.77.23 1 .52.22.29.34.67.34 1.15 0 .47-.11.85-.33 1.14-.23.29-.57.47-1.03.53zm-.44-2.81c-.24 0-.42.09-.54.27-.12.18-.18.44-.18.78 0 .34.06.6.18.78.12.18.3.27.54.27.24 0 .42-.09.54-.27.12-.18.18-.44.18-.78 0-.34-.06-.6-.18-.78-.12-.18-.3-.27-.54-.27z"/></svg></button>',
            click: function () {
              self.seekRelative(-5);
            },
          },
          // Forward 5s button (Left controls)
          {
            name: 'skip-fwd-5s-btn',
            position: 'left',
            index: 12,
            html: '<button class="art-icon-btn art-btn-skip5" title="Forward 5s (→ / L)"><svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M12 5V1l5 5-5 5V7c-3.31 0-6 2.69-6 6s2.69 6 6 6 6-2.69 6-6h2c0 4.42-3.58 8-8 8s-8-3.58-8-8 3.58-8 8-8zm-1.1 11h-.85v-3.26l-1.01.31v-.67l1.73-.57h.13V16zm2.97-.04c-.3.04-.6.04-.88 0-.44-.06-.77-.24-1-.53-.22-.29-.33-.67-.33-1.14 0-.48.11-.86.34-1.15.23-.29.57-.46 1.01-.52.29-.04.59-.04.88 0 .44.06.77.23 1 .52.22.29.34.67.34 1.15 0 .47-.11.85-.33 1.14-.23.29-.57.47-1.03.53zm-.44-2.81c-.24 0-.42.09-.54.27-.12.18-.18.44-.18.78 0 .34.06.6.18.78.12.18.3.27.54.27.24 0 .42-.09.54-.27.12-.18.18-.44.18-.78 0-.34-.06-.6-.18-.78-.12-.18-.3-.27-.54-.27z"/></svg></button>',
            click: function () {
              self.seekRelative(5);
            },
          },
          // Previous Episode button (Left controls)
          {
            name: 'prev-ep-btn',
            position: 'left',
            index: 13,
            html: '<button class="art-icon-btn" title="Previous Episode (P)"><svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><polygon points="19 20 9 12 19 4 19 20"></polygon><line x1="5" y1="19" x2="5" y2="5" stroke="currentColor" stroke-width="2.5"></line></svg></button>',
            click: function () {
              if (typeof self.onPrevEpisode === 'function') {
                self.onPrevEpisode();
              }
            },
          },
          // Next Episode button (Left controls)
          {
            name: 'next-ep-btn',
            position: 'left',
            index: 14,
            html: '<button class="art-icon-btn" title="Next Episode (N)"><svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 4 15 12 5 20 5 4"></polygon><line x1="19" y1="5" x2="19" y2="19" stroke="currentColor" stroke-width="2.5"></line></svg></button>',
            click: function () {
              if (typeof self.onNextEpisode === 'function') {
                self.onNextEpisode();
              }
            },
          },
          // Skip Intro (+85s) button (Left controls)
          {
            name: 'skip-intro-btn',
            position: 'left',
            index: 16,
            html: '<button class="art-btn-skip" title="Skip Opening (+85s / S)">+85s</button>',
            click: function () {
              self.seekRelative(85);
            },
          },
          // Audio Mode SUB / DUB toggle button (Right controls)
          {
            name: 'audio-mode-btn',
            position: 'right',
            index: 10,
            html: `<button class="art-btn-mode" title="Switch Audio Track (SUB / DUB)">${mode.toUpperCase()}</button>`,
            click: function () {
              if (typeof self.onToggleMode === 'function') {
                self.onToggleMode();
              }
            },
          },
          // Captions Disable/Enable CC Button (Right controls)
          {
            name: 'cc-btn',
            position: 'right',
            index: 12,
            html: `<button class="art-btn-cc ${this.captionsEnabled ? '' : 'disabled'}" title="Toggle Captions (CC)">CC</button>`,
            click: function () {
              self.toggleCaptions();
            },
          },
          // Streaming Quality Button with popup selector (Right controls)
          {
            name: 'quality-btn',
            position: 'right',
            index: 14,
            html: `<button class="art-btn-quality" title="Change Streaming Quality">${this.currentQualityLabel}</button>`,
            click: function () {
              self.toggleQualityMenu();
            },
            selector: [{ html: 'Auto', level: -1, default: true }],
            onSelect: function (item) {
              return self.setQuality(item.level);
            },
          },
          // Unified Master Fullscreen Button with auto-rotation (Right controls)
          {
            name: 'custom-fullscreen-btn',
            position: 'right',
            index: 99,
            html: '<button class="art-icon-btn art-btn-fs" title="Toggle Fullscreen" style="display:inline-flex;align-items:center;justify-content:center;color:#00e3fd;"><svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z"/></svg></button>',
            click: function () {
              self.toggleFullscreen();
            },
          }
        ]
      });

      // Events
      const checkMuteState = () => {
        try {
          const v = self.art?.video;
          const stage = document.querySelector('#artplayer-inner-stage') || mount;
          const existing = stage?.querySelector('.ani-unmute-badge');
          if (v && v.muted) {
            if (!existing && stage) {
              const badge = document.createElement('button');
              badge.className = 'ani-unmute-badge';
              badge.style.cssText = 'position:absolute;top:20px;left:20px;z-index:999;display:flex;align-items:center;gap:8px;padding:10px 18px;border-radius:9999px;background:#e11d48;color:#fff;font-weight:700;font-size:13px;border:none;box-shadow:0 10px 25px rgba(0,0,0,0.5);cursor:pointer;';
              badge.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z"/></svg> <span>Sound Muted — Tap to Unmute</span>';
              badge.onclick = (e) => {
                e.stopPropagation();
                if (self.art?.video) {
                  self.art.video.muted = false;
                  self.art.video.volume = 1.0;
                }
                badge.remove();
              };
              stage.appendChild(badge);
            }
          } else if (existing) {
            existing.remove();
          }
        } catch (e) {}
      };

      const ensureAudioAudible = () => {
        try {
          if (self.art && self.art.video) {
            if (self.art.video.muted) self.art.video.muted = false;
          }
          checkMuteState();
        } catch (e) {}
      };

      this.art.on('ready', () => {
        if (savedTime > 0) {
          this.art.currentTime = savedTime;
        }
        if (this.art.subtitle) {
          this.art.subtitle.show = this.captionsEnabled;
        }
        ensureAudioAudible();
        self.updatePlayPauseUI();
        this.art.play().catch(() => {});

        // Add native video ended listener for ultimate reliability
        if (this.art.video) {
          this.art.video.addEventListener('ended', () => {
            self.triggerAutoNext();
          });
        }

        // Prevent setting panel click/touch from propagating to video player to stop glitching/closing
        try {
          const settingEl = this.art.template?.$setting;
          if (settingEl) {
            settingEl.addEventListener('click', (e) => e.stopPropagation());
            settingEl.addEventListener('touchstart', (e) => e.stopPropagation(), { passive: true });
          }
        } catch (e) {}

        // Mobile touch double-tap seek & gestures
        try {
          const vLayer = self.art.template?.$video || self.art.template?.$player;
          if (vLayer) {
            let lastTap = 0;
            vLayer.addEventListener('touchend', (e) => {
              if (e.changedTouches.length !== 1) return;
              const touch = e.changedTouches[0];
              const rect = vLayer.getBoundingClientRect();
              const x = touch.clientX - rect.left;
              const width = rect.width;
              const now = Date.now();
              const diff = now - lastTap;
              if (diff < 320 && diff > 50) {
                lastTap = 0;
                if (x < width * 0.38) {
                  e.preventDefault();
                  self.seekRelative(-5);
                  self.showQuickSeekFeedback('left', '-5s');
                } else if (x > width * 0.62) {
                  e.preventDefault();
                  self.seekRelative(5);
                  self.showQuickSeekFeedback('right', '+5s');
                }
              } else {
                lastTap = now;
              }
            }, { passive: false });
          }
        } catch (_) {}
      });

      this.art.on('video:play', () => {
        ensureAudioAudible();
        self.updatePlayPauseUI(true);
      });
      this.art.on('video:pause', () => {
        self.updatePlayPauseUI(false);
      });
      this.art.on('video:playing', () => {
        ensureAudioAudible();
        checkMuteState();
        self.updatePlayPauseUI(true);
      });
      this.art.on('video:volumechange', checkMuteState);

      // Handle browser autoplay policy restrictions: run once on first user gesture
      let hasUserInteracted = false;
      const onFirstGestureUnmute = () => {
        if (hasUserInteracted) return;
        hasUserInteracted = true;
        ensureAudioAudible();
        ['click', 'keydown', 'touchstart', 'pointerdown'].forEach(evt => {
          window.removeEventListener(evt, onFirstGestureUnmute);
        });
      };

      ['click', 'keydown', 'touchstart', 'pointerdown'].forEach(evt => {
        window.addEventListener(evt, onFirstGestureUnmute, { passive: true, once: true });
      });

      // Fullscreen and Orientation Event Sync
      this.art.on('fullscreen', (isFull) => {
        self.handleFullscreenChange(isFull, 'art.fullscreen');
      });

      this.art.on('fullscreenWeb', (isFull) => {
        self.handleFullscreenChange(isFull, 'art.fullscreenWeb');
      });

      // Synchronize with native browser & device fullscreen events
      const onNativeFsChange = () => {
        const isFull = !!(document.fullscreenElement || document.webkitFullscreenElement);
        if (!isFull && self.art && self.art.fullscreen) {
          self.art.fullscreen = false;
        }
        self.handleFullscreenChange(isFull, 'onNativeFsChange');
      };
      document.addEventListener('fullscreenchange', onNativeFsChange);
      document.addEventListener('webkitfullscreenchange', onNativeFsChange);
      this._nativeFsListener = onNativeFsChange;

      // Double-click on video (desktop) toggles fullscreen
      this.art.on('dblclick', () => {
        const isMobile = window.matchMedia('(pointer: coarse)').matches || /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
        if (!isMobile) {
          self.toggleFullscreen();
        }
      });

      // Clean raw or escaped HTML tags in subtitles so <i> or <b> never display as literal text
      const cleanSubLine = (el) => {
        if (!el) return;
        try {
          if (el.nodeType === 3) {
            // Text node containing literal tags
            if (el.nodeValue && /<\/?(i|b|u|c|em|strong)[^>]*>/i.test(el.nodeValue)) {
              const span = document.createElement('span');
              span.innerHTML = el.nodeValue;
              el.parentNode?.replaceChild(span, el);
            }
          } else if (el.innerHTML && (el.innerHTML.includes('&lt;') || el.innerHTML.includes('&gt;'))) {
            el.innerHTML = el.innerHTML
              .replace(/&lt;(\/?[a-zA-Z0-9]+)&gt;/gi, '<$1>')
              .replace(/&lt;(\/?[a-zA-Z0-9]+)\s+([^&]*?)&gt;/gi, '<$1 $2>');
          }
        } catch (e) {}
      };

      if (this.art.template?.$subtitle) {
        const subObserver = new MutationObserver(() => {
          try {
            const lines = self.art.template.$subtitle.querySelectorAll('.art-subtitle-line, p, span');
            if (lines && lines.length > 0) {
              lines.forEach(l => cleanSubLine(l));
            } else {
              cleanSubLine(self.art.template.$subtitle);
            }
          } catch (e) {}
        });
        subObserver.observe(this.art.template.$subtitle, { childList: true, subtree: true, characterData: true });
        this._subObserver = subObserver;
      }

      this.art.on('subtitleUpdate', () => {
        try {
          const lines = self.art.template?.$subtitle?.querySelectorAll('.art-subtitle-line, p, span');
          if (lines) lines.forEach(l => cleanSubLine(l));
        } catch (e) {}
      });

      this.art.on('video:timeupdate', () => {
        if (this.art && this.art.currentTime > 0) {
          try {
            localStorage.setItem(`ani_progress_${episodeId}`, JSON.stringify({
              time: this.art.currentTime,
              duration: this.art.duration,
              updatedAt: Date.now()
            }));
          } catch {}
          if (typeof this.onTimeUpdate === 'function') {
            this.onTimeUpdate(this.art.currentTime, this.art.duration);
          }

          // Near-end auto-next trigger: if video reached within 0.5s of end, advance seamlessly
          if (self.autoNext && self.art.duration > 20 && self.art.currentTime >= (self.art.duration - 0.5) && !self._episodeEndedTriggered) {
            self.triggerAutoNext();
          }
        }
      });

      this.art.on('video:ended', () => {
        console.log('[Player] Episode completed (video:ended).');
        self.triggerAutoNext();
      });

      return streamData;
    } catch (err) {
      console.error('[Player] Error loading stream:', err);
      if (mount) {
        mount.innerHTML = `
          <div class="w-full h-full flex flex-col items-center justify-center bg-black/95 text-white gap-3 p-6 text-center select-none">
            <span class="material-symbols-outlined text-[36px] text-red-400">error</span>
            <div class="text-sm font-bold text-white">Stream Currently Unavailable</div>
            <div class="text-xs text-gray-400 max-w-sm">${err.message || 'The video provider did not return stream for this episode.'}</div>
            <button class="mt-2 px-4 py-2 rounded-lg bg-surface-container-high border border-white/[0.1] text-xs font-mono font-bold text-secondary hover:text-white" onclick="window.location.reload()">Retry Stream</button>
          </div>
        `;
      }
      throw err;
    }
  }

  /**
   * Toggles captions (subtitles) on or off
   */
  toggleCaptions() {
    this.captionsEnabled = !this.captionsEnabled;
    if (this.art && this.art.subtitle) {
      this.art.subtitle.show = this.captionsEnabled;
    }
    if (this.art && this.art.notice) {
      this.art.notice.show = this.captionsEnabled ? 'Captions: Enabled' : 'Captions: Disabled';
    }

    // Update in-player CC button appearance
    const ccBtn = this.art?.template?.$controls?.querySelector('.art-btn-cc');
    if (ccBtn) {
      ccBtn.classList.toggle('disabled', !this.captionsEnabled);
    }

    if (typeof this.onCaptionsToggle === 'function') {
      this.onCaptionsToggle(this.captionsEnabled);
    }

    return this.captionsEnabled;
  }

  /**
   * Sets streaming quality level (-1 for Auto, or level index / height)
   */
  setQuality(levelIndex) {
    let targetLevel = parseInt(levelIndex);
    let label = 'Auto';

    if (this.art && this.art.hls) {
      if (this.levels && this.levels.length > 0) {
        let match = this.levels.find(l => l.level === targetLevel);
        if (!match && targetLevel > 0) {
          match = this.levels.find(l => l.height === targetLevel);
        }
        if (match) {
          targetLevel = match.level;
          label = match.html;
        } else if (targetLevel === -1) {
          label = 'Auto';
        } else {
          label = `${targetLevel}p`;
        }
      } else {
        label = targetLevel === -1 ? 'Auto' : `${targetLevel}p`;
      }

      try {
        this.art.hls.currentLevel = targetLevel;
      } catch (e) {
        console.warn('[Player] HLS currentLevel error:', e);
      }
    } else {
      label = targetLevel === -1 ? 'Auto' : `${targetLevel}p`;
    }

    this.currentQualityLabel = label;
    try {
      localStorage.setItem('omcli_quality', label);
    } catch (_) {}

    if (this.art && this.art.notice) {
      this.art.notice.show = `Quality: ${label}`;
    }

    // Update in-player quality button label
    const qBtn = this.art?.template?.$controls?.querySelector('.art-btn-quality');
    if (qBtn) qBtn.textContent = label;

    // Update bottom toolbar quality label
    const textQ = document.getElementById('text-current-quality');
    if (textQ) textQ.textContent = label;

    if (typeof this.onQualityChange === 'function') {
      this.onQualityChange(targetLevel, label);
    }
    return label;
  }

  /**
   * Interactive In-Player Quality Selector Modal
   */
  toggleQualityMenu() {
    const container = this.art?.template?.$player || document.querySelector('.art-video-player');
    if (!container) return;

    const existing = container.querySelector('.ani-quality-modal-overlay');
    if (existing) {
      existing.remove();
      return;
    }

    let options = [];
    if (this.levels && this.levels.length > 0) {
      options = this.levels;
    } else {
      options = [
        { html: 'Auto (ABR)', level: -1 },
        { html: '1080p FHD', level: 1080 },
        { html: '720p HD', level: 720 },
        { html: '480p SD', level: 480 },
        { html: '360p Data Saver', level: 360 }
      ];
    }

    const currentLabel = (this.currentQualityLabel || 'Auto').toLowerCase();

    const overlay = document.createElement('div');
    overlay.className = 'ani-quality-modal-overlay';
    overlay.innerHTML = `
      <div class="ani-quality-modal-dialog">
        <div style="display:flex;align-items:center;justify-content:space-between;padding-bottom:10px;border-bottom:1px solid rgba(255,255,255,0.1);">
          <div style="display:flex;align-items:center;gap:6px;color:#fff;font-size:14px;font-weight:700;">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" style="color:#00e3fd;"><path d="M19 4H5c-1.11 0-2 .9-2 2v12c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 14H5V6h14v12z"/></svg>
            <span>Streaming Quality</span>
          </div>
          <button class="ani-quality-modal-close" style="background:none;border:none;color:#94a3b8;font-size:18px;cursor:pointer;padding:4px;" title="Close">✕</button>
        </div>
        <div style="display:flex;flex-direction:column;gap:6px;max-height:260px;overflow-y:auto;">
          ${options.map(opt => {
            const optClean = opt.html.toLowerCase().split(' ')[0];
            const isMatch = currentLabel.includes(optClean) || (opt.level === -1 && currentLabel.startsWith('auto'));
            return `
              <button class="ani-quality-item-btn ${isMatch ? 'active' : ''}" data-level="${opt.level}">
                <span>${opt.html}</span>
                ${isMatch ? '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>' : ''}
              </button>
            `;
          }).join('')}
        </div>
      </div>
    `;

    overlay.addEventListener('click', (e) => {
      if (e.target === overlay || e.target.closest('.ani-quality-modal-close')) {
        overlay.remove();
      }
    });

    overlay.querySelectorAll('.ani-quality-item-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const lvl = parseInt(btn.dataset.level);
        this.setQuality(lvl);
        overlay.remove();
      });
    });

    container.appendChild(overlay);
  }

  /**
   * Toggles video playback (Play / Pause)
   */
  togglePlay() {
    if (!this.art) return;
    this.art.toggle();
    setTimeout(() => {
      this.updatePlayPauseUI(this.art?.playing);
      if (this.art.notice) {
        this.art.notice.show = this.art.playing ? 'Play' : 'Pause';
      }
    }, 60);
  }

  /**
   * Relative seeking in seconds (+5, -5, +85)
   */
  seekRelative(seconds) {
    if (!this.art) return;
    this.lastSeekSeconds = seconds;
    const duration = this.art.duration || 1420;
    const current = (this._virtualTime !== undefined) ? this._virtualTime : (this.art.currentTime || 0);
    const target = Math.max(0, Math.min(duration, current + seconds));
    this._virtualTime = target;
    try {
      this.art.currentTime = target;
    } catch (_) {}
    if (this.art.notice) {
      this.art.notice.show = seconds > 0 ? `+${seconds}s` : `${seconds}s`;
    }
  }

  /**
   * Floating ripple HUD for quick seek on mobile / double-tap
   */
  showQuickSeekFeedback(side, text) {
    try {
      const container = this.art?.template?.$player || document.querySelector('#artplayer-inner-stage');
      if (!container) return;
      const old = container.querySelector('.ani-seek-ripple');
      if (old) old.remove();

      const el = document.createElement('div');
      el.className = `ani-seek-ripple ani-seek-${side}`;
      const icon = side === 'left' ? 'replay_5' : 'forward_5';
      el.innerHTML = `<span class="material-symbols-outlined text-[18px]">${icon}</span><span>${text}</span>`;
      container.appendChild(el);

      setTimeout(() => {
        el.remove();
      }, 520);
    } catch (_) {}
  }

  /**
   * Synchronizes external toolbar Play/Pause button
   */
  updatePlayPauseUI(isPlaying) {
    const playing = (typeof isPlaying === 'boolean') ? isPlaying : (this.art?.playing || false);
    const iconEl = document.getElementById('icon-play-pause-down');
    const textEl = document.getElementById('text-play-pause-down');
    const btnEl = document.getElementById('btn-play-pause-down');
    if (iconEl) iconEl.textContent = playing ? 'pause' : 'play_arrow';
    if (textEl) textEl.textContent = playing ? 'Pause' : 'Play';
    if (btnEl) {
      btnEl.title = playing ? 'Pause (Space / K)' : 'Play (Space / K)';
    }
  }

  /**
   * Universal Laptop / Desktop Keyboard Shortcuts
   */
  initKeyboardShortcuts() {
    if (this._keyListener) return;

    this._keyListener = (e) => {
      // Ignore if user is currently typing in an input element
      const target = e.target;
      if (target) {
        const tag = target.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable) {
          return;
        }
      }

      // Only handle if Watch Room is visible
      const watchView = document.getElementById('watch-view');
      if (watchView && watchView.classList.contains('hidden')) return;

      if (!this.art) return;

      const key = e.key;

      // Fullscreen (F / f)
      if (key === 'f' || key === 'F') {
        e.preventDefault();
        this.toggleFullscreen();
        return;
      }

      // Play / Pause (Space / K / k)
      if (key === ' ' || key === 'k' || key === 'K') {
        e.preventDefault();
        this.togglePlay();
        return;
      }

      // Rewind 5s (ArrowLeft / J / j)
      if (key === 'ArrowLeft' || key === 'j' || key === 'J') {
        e.preventDefault();
        this.seekRelative(-5);
        this.showQuickSeekFeedback('left', '-5s');
        return;
      }

      // Forward 5s (ArrowRight / L / l)
      if (key === 'ArrowRight' || key === 'l' || key === 'L') {
        e.preventDefault();
        this.seekRelative(5);
        this.showQuickSeekFeedback('right', '+5s');
        return;
      }

      // Volume Up (+10%) (ArrowUp)
      if (key === 'ArrowUp') {
        e.preventDefault();
        const v = Math.min(1, Math.round(((this.art.volume || 0) + 0.1) * 10) / 10);
        this.art.volume = v;
        if (this.art.notice) this.art.notice.show = `Volume: ${Math.round(v * 100)}% (↑)`;
        return;
      }

      // Volume Down (-10%) (ArrowDown)
      if (key === 'ArrowDown') {
        e.preventDefault();
        const v = Math.max(0, Math.round(((this.art.volume || 0) - 0.1) * 10) / 10);
        this.art.volume = v;
        if (this.art.notice) this.art.notice.show = `Volume: ${Math.round(v * 100)}% (↓)`;
        return;
      }

      // Mute Toggle (M / m)
      if (key === 'm' || key === 'M') {
        e.preventDefault();
        this.art.muted = !this.art.muted;
        if (this.art.notice) this.art.notice.show = this.art.muted ? 'Muted (M)' : 'Unmuted (M)';
        return;
      }

      // Captions Toggle (C / c)
      if (key === 'c' || key === 'C') {
        e.preventDefault();
        this.toggleCaptions();
        return;
      }

      // Skip Opening +85s (S / s)
      if (key === 's' || key === 'S') {
        e.preventDefault();
        this.seekRelative(85);
        return;
      }

      // Next Episode (N / n)
      if (key === 'n' || key === 'N') {
        e.preventDefault();
        if (typeof this.onNextEpisode === 'function') {
          if (this.art.notice) this.art.notice.show = 'Next Episode (N)';
          this.onNextEpisode();
        }
        return;
      }

      // Previous Episode (P / p)
      if (key === 'p' || key === 'P') {
        e.preventDefault();
        if (typeof this.onPrevEpisode === 'function') {
          if (this.art.notice) this.art.notice.show = 'Previous Episode (P)';
          this.onPrevEpisode();
        }
        return;
      }

      // Theater Mode (T / t)
      if (key === 't' || key === 'T') {
        e.preventDefault();
        const btnTheater = document.getElementById('btn-theater-mode');
        if (btnTheater) btnTheater.click();
        return;
      }

      // Escape -> Exit Fullscreen
      if (key === 'Escape') {
        const isFull = this.art.fullscreen || this.art.fullscreenWeb || document.body.classList.contains('player-in-fullscreen');
        if (isFull) {
          this.exitFullscreen();
        }
      }
    };

    window.addEventListener('keydown', this._keyListener);
  }

  /**
   * Universal Mobile & Desktop Fullscreen
   */
  async toggleFullscreen() {
    if (!this.art) {
      console.log('[Player] toggleFullscreen: no this.art');
      return false;
    }

    const isCurrentlyFull = !!(
      document.fullscreenElement ||
      document.webkitFullscreenElement ||
      (this.art && (this.art.fullscreen || this.art.fullscreenWeb)) ||
      document.body.classList.contains('player-in-fullscreen')
    );

    if (isCurrentlyFull) {
      await this.exitFullscreen();
      return false;
    } else {
      await this.enterFullscreen();
      return true;
    }
  }

  async enterFullscreen() {
    if (!this.art) return false;

    // Detect iPhone specifically (iOS phones only allow native fullscreen via video.webkitEnterFullscreen)
    const isIPhone = /iPhone|iPod/i.test(navigator.userAgent);

    // 1. On iPhone, use native video.webkitEnterFullscreen() for true edge-to-edge hardware player
    if (isIPhone && this.art.video && typeof this.art.video.webkitEnterFullscreen === 'function') {
      try {
        this.art.video.webkitEnterFullscreen();
        const onIosEnd = () => {
          this.art.video?.removeEventListener('webkitendfullscreen', onIosEnd);
          this.exitFullscreen();
        };
        this.art.video.addEventListener('webkitendfullscreen', onIosEnd, { once: true });
        this.handleFullscreenChange(true, 'ios-hardware');
        return true;
      } catch (err) {
        console.warn('[Player] iOS webkitEnterFullscreen failed, falling back:', err);
      }
    }

    // 2. Hardware / Native Fullscreen (Desktop Chrome, Safari, Firefox, Edge, Android Chrome, iPad)
    // Directly invokes native fullscreen so browser tabs, URL address bar, and system bars vanish completely!
    const playerEl = this.art.template?.$player || document.querySelector('.art-video-player');
    let nativeSuccess = false;

    if (!document.fullscreenElement && !document.webkitFullscreenElement) {
      try {
        if (playerEl && playerEl.requestFullscreen) {
          await playerEl.requestFullscreen();
          nativeSuccess = true;
        } else if (this.art.video && this.art.video.requestFullscreen) {
          await this.art.video.requestFullscreen();
          nativeSuccess = true;
        } else if (playerEl && playerEl.webkitRequestFullscreen) {
          await playerEl.webkitRequestFullscreen();
          nativeSuccess = true;
        } else if (this.art.video && typeof this.art.video.webkitEnterFullscreen === 'function') {
          this.art.video.webkitEnterFullscreen();
          nativeSuccess = true;
        }
      } catch (err) {
        console.warn('[Player] Native requestFullscreen error:', err);
      }
    } else {
      nativeSuccess = true;
    }

    // 3. Fallback: ONLY enable web fullscreen styling if native hardware fullscreen is unsupported or denied
    if (!nativeSuccess && !document.fullscreenElement && !document.webkitFullscreenElement) {
      console.log('[Player] Falling back to CSS web fullscreen');
      this.art.fullscreenWeb = true;
    }

    // 4. Screen Orientation Lock: Auto-rotate mobile screen to landscape
    try {
      if (screen.orientation && typeof screen.orientation.lock === 'function') {
        screen.orientation.lock('landscape').catch(() => {
          return screen.orientation.lock('landscape-primary').catch(() => {});
        });
      } else if (screen.lockOrientation) {
        screen.lockOrientation('landscape');
      } else if (screen.mozLockOrientation) {
        screen.mozLockOrientation('landscape');
      } else if (screen.msLockOrientation) {
        screen.msLockOrientation('landscape');
      }
    } catch (_) {}

    this.handleFullscreenChange(true, 'enterFullscreen');
    return true;
  }

  async exitFullscreen() {
    if (!this.art) return false;

    // 1. Exit native browser hardware fullscreen
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen().catch(() => {});
      } else if (document.webkitFullscreenElement) {
        await document.webkitExitFullscreen().catch(() => {});
      }
    } catch (_) {}

    // 2. Clear Artplayer fullscreen states
    if (typeof this.art.fullscreen !== 'undefined' && this.art.fullscreen) {
      try { this.art.fullscreen = false; } catch (_) {}
    }
    if (this.art.fullscreenWeb) {
      this.art.fullscreenWeb = false;
    }

    // 3. Unlock screen orientation on mobile
    try {
      if (screen.orientation && typeof screen.orientation.unlock === 'function') {
        screen.orientation.unlock();
      } else if (screen.unlockOrientation) {
        screen.unlockOrientation();
      } else if (screen.mozUnlockOrientation) {
        screen.mozUnlockOrientation();
      } else if (screen.msUnlockOrientation) {
        screen.msUnlockOrientation();
      }
    } catch (_) {}

    this.handleFullscreenChange(false, 'exitFullscreen');
    return false;
  }

  handleFullscreenChange(isFull, source) {
    const hasNativeFs = !!(document.fullscreenElement || document.webkitFullscreenElement);
    const hasWebFs = !!(this.art && this.art.fullscreenWeb);

    let isActuallyFull = false;
    if (isFull === true) {
      isActuallyFull = true;
    } else if (isFull === false) {
      isActuallyFull = hasNativeFs || hasWebFs;
    } else {
      isActuallyFull = hasNativeFs || hasWebFs;
    }

    if (isActuallyFull) {
      document.body.classList.add('player-in-fullscreen');
    } else {
      document.body.classList.remove('player-in-fullscreen');
      try {
        if (screen.orientation && typeof screen.orientation.unlock === 'function') {
          screen.orientation.unlock();
        }
      } catch (_) {}
    }

    this.updateFullscreenIcons(isActuallyFull);
    if (typeof this.onFullscreenChange === 'function') {
      this.onFullscreenChange(isActuallyFull);
    }
  }

  updateFullscreenIcons(isFull) {
    // In-player custom fullscreen button
    const fsBtn = this.art?.template?.$controls?.querySelector('.art-btn-fs');
    if (fsBtn) {
      fsBtn.innerHTML = isFull
        ? '<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M5 16h3v3h2v-5H5v2zm3-8H5v2h5V5H8v3zm6 11h2v-3h3v-2h-5v5zm2-11V5h-2v5h5V8h-3z"/></svg>'
        : '<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z"/></svg>';
      fsBtn.setAttribute('title', isFull ? 'Exit Fullscreen (F)' : 'Enter Fullscreen (F)');
    }

    // External Down Fullscreen button (#btn-fullscreen-down)
    const btnDown = document.getElementById('btn-fullscreen-down');
    if (btnDown) {
      btnDown.innerHTML = isFull
        ? '<span class="material-symbols-outlined text-[17px]">fullscreen_exit</span><span class="hidden sm:inline">Exit Fullscreen</span>'
        : '<span class="material-symbols-outlined text-[17px]">fullscreen</span><span class="hidden sm:inline">Fullscreen</span>';
      if (isFull) {
        btnDown.classList.add('border-primary/50', 'text-primary');
        btnDown.classList.remove('border-secondary/30', 'text-secondary');
      } else {
        btnDown.classList.remove('border-primary/50', 'text-primary');
        btnDown.classList.add('border-secondary/30', 'text-secondary');
      }
    }
  }

  /**
   * Completely stops, pauses, and tears down video/audio to guarantee no background sound
   */
  stop() {
    document.body.classList.remove('player-in-fullscreen');
    document.body.classList.remove('player-forced-landscape');

    if (this._nativeFsListener) {
      document.removeEventListener('fullscreenchange', this._nativeFsListener);
      document.removeEventListener('webkitfullscreenchange', this._nativeFsListener);
      this._nativeFsListener = null;
    }
    if (this._orientationListener) {
      window.removeEventListener('orientationchange', this._orientationListener);
      window.removeEventListener('resize', this._orientationListener);
      this._orientationListener = null;
    }
    if (this._subObserver) {
      this._subObserver.disconnect();
      this._subObserver = null;
    }

    if (screen.orientation && typeof screen.orientation.unlock === 'function') {
      try { screen.orientation.unlock(); } catch (e) {}
    }

    if (this.art) {
      try {
        if (this.art.hls && typeof this.art.hls.destroy === 'function') {
          this.art.hls.destroy();
          this.art.hls = null;
        }
        if (this.art.video) {
          this.art.video.pause();
          this.art.video.muted = true;
          this.art.video.removeAttribute('src');
          this.art.video.load();
        }
        this.art.destroy(true);
      } catch (err) {
        console.warn('[Player] Error during stop:', err);
      }
      this.art = null;
    }

    // Stop and silence ALL audio & video elements anywhere in the mount or page
    try {
      const mount = document.querySelector(this.mountSelector);
      const mediaList = mount ? mount.querySelectorAll('video, audio') : document.querySelectorAll('video, audio');
      mediaList.forEach(media => {
        try {
          media.pause();
          media.muted = true;
          media.removeAttribute('src');
          media.load();
        } catch (e) {}
      });
      if (mount) mount.innerHTML = '';
    } catch (e) {}

    // Clean any lingering Artplayer instances
    if (window.Artplayer && Array.isArray(window.Artplayer.instances)) {
      window.Artplayer.instances.slice().forEach(inst => {
        try { inst.destroy(true); } catch (e) {}
      });
    }
  }
}

window.AnimePlayer = AnimePlayer;
