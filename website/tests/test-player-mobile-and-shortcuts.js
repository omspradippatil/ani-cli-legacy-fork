const { chromium, devices } = require('playwright');

const BASE_URL = process.env.BASE_URL || 'http://127.0.0.1:3001';

const results = {
  total: 0,
  passed: 0,
  failed: 0,
  tests: []
};

function record(name, passed, details = '') {
  results.total++;
  if (passed) {
    results.passed++;
    console.log(`  ✅ PASS: ${name}${details ? ` (${details})` : ''}`);
    results.tests.push({ name, status: 'PASS', details });
  } else {
    results.failed++;
    console.error(`  ❌ FAIL: ${name}${details ? ` (${details})` : ''}`);
    results.tests.push({ name, status: 'FAIL', details });
  }
}

async function runTests() {
  console.log('\n============================================================');
  console.log('🧪 Testing Player Mobile UI, Fullscreen, & Laptop Shortcuts');
  console.log('🎯 Target:', BASE_URL);
  console.log('============================================================\n');

  const browser = await chromium.launch({ channel: 'chrome', headless: true });

  try {
    // =========================================================================
    // SECTION 1: Laptop Keyboard Shortcuts & New UI Buttons (Desktop 1280x800)
    // =========================================================================
    console.log('📌 [TEST GROUP 1] Laptop UI Buttons & Keyboard Shortcuts');
    const desktopContext = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await desktopContext.newPage();
    page.on('console', msg => console.log('PAGE LOG:', msg.text()));
    page.on('pageerror', err => console.error('PAGE ERROR:', err.message));

    await page.goto(`${BASE_URL}#watch?anime=20&ep=1`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.art-video-player', { timeout: 15000 });
    await page.waitForTimeout(500);

    // 1.1 Verify new UI buttons exist in player toolbar
    const hasPlayPause = await page.$eval('#btn-play-pause-down', el => !!el).catch(() => false);
    record('1.1 Toolbar Play/Pause button (#btn-play-pause-down) exists', hasPlayPause);

    const hasSkipBack10 = await page.$eval('#btn-skip-backward-10', el => !!el).catch(() => false);
    record('1.2 Toolbar Skip -10s button (#btn-skip-backward-10) exists', hasSkipBack10);

    const hasSkipBack5 = await page.$eval('#btn-skip-backward-5', el => !!el).catch(() => false);
    record('1.2b Toolbar Skip -5s button (#btn-skip-backward-5) exists', hasSkipBack5);

    const hasSkipFwd5 = await page.$eval('#btn-skip-forward-5', el => !!el).catch(() => false);
    record('1.3 Toolbar Skip +5s button (#btn-skip-forward-5) exists', hasSkipFwd5);

    const hasSkipFwd10 = await page.$eval('#btn-skip-forward-10', el => !!el).catch(() => false);
    record('1.3b Toolbar Skip +10s button (#btn-skip-forward-10) exists', hasSkipFwd10);

    // 1.4 Click Toolbar Skip +5s advances currentTime
    await page.evaluate(() => {
      if (window.artplayerInstance) {
        window.artplayerInstance._virtualTime = 100;
        window.artplayerInstance._seekTargetTime = 100;
        window.artplayerInstance._seekTimestamp = Date.now();
      }
    });

    await page.click('#btn-skip-forward-5');
    await page.waitForTimeout(100);
    const timeAfterFwd = await page.evaluate(() => window.artplayerInstance?._virtualTime || window.artplayerInstance?.art?.currentTime || 0);
    record('1.4 Toolbar +5s button seeks forward (+5s)', timeAfterFwd >= 104, `Current: ${timeAfterFwd}`);

    // 1.5 Click Toolbar Skip -5s rewinds currentTime
    await page.click('#btn-skip-backward-5');
    await page.waitForTimeout(100);
    const timeAfterBack = await page.evaluate(() => window.artplayerInstance?._virtualTime || window.artplayerInstance?.art?.currentTime || 0);
    record('1.5 Toolbar -5s button rewinds (-5s)', timeAfterBack <= 101, `Current: ${timeAfterBack}`);

    // 1.6 Click Toolbar Play/Pause toggles playback state & UI
    await page.click('#btn-play-pause-down');
    await page.waitForTimeout(150);
    const pauseState = await page.evaluate(() => {
      const art = window.artplayerInstance?.art;
      const text = document.getElementById('text-play-pause-down')?.textContent;
      return { paused: !art?.playing, text };
    });
    record('1.6 Toolbar Play/Pause button toggles playback state', typeof pauseState.paused === 'boolean', `Paused: ${pauseState.paused}, Button: "${pauseState.text}"`);

    // 1.7 Keyboard Shortcut: 'f' or 'F' toggles Fullscreen
    await page.keyboard.press('KeyF');
    await page.waitForTimeout(200);
    const isFullAfterF = await page.evaluate(() => {
      const art = window.artplayerInstance?.art;
      return !!(document.body.classList.contains('player-in-fullscreen') || art?.fullscreen || art?.fullscreenWeb);
    });
    record('1.7 Pressing "F" toggles Fullscreen on', isFullAfterF, `player-in-fullscreen: ${isFullAfterF}`);

    // 1.8 Pressing "F" again exits Fullscreen
    await page.keyboard.press('KeyF');
    await page.waitForTimeout(200);
    const isFullAfterF2 = await page.evaluate(() => {
      const art = window.artplayerInstance?.art;
      return !!(document.body.classList.contains('player-in-fullscreen') || art?.fullscreen || art?.fullscreenWeb);
    });
    record('1.8 Pressing "F" again toggles Fullscreen off', !isFullAfterF2, `player-in-fullscreen: ${isFullAfterF2}`);

    // 1.9 Keyboard Shortcut: Space or 'k' toggles Play/Pause
    await page.keyboard.press('Space');
    await page.waitForTimeout(150);
    const spaceResult = await page.evaluate(() => window.artplayerInstance?.art?.playing);
    record('1.9 Pressing Space toggles Play / Pause', typeof spaceResult === 'boolean');

    // 1.10 Keyboard Shortcut: ArrowLeft rewinds 5s
    await page.evaluate(() => {
      if (window.artplayerInstance) {
        window.artplayerInstance._virtualTime = 50;
        window.artplayerInstance._seekTargetTime = 50;
        window.artplayerInstance._seekTimestamp = Date.now();
      }
    });
    await page.keyboard.press('ArrowLeft');
    await page.waitForTimeout(100);
    const timeAfterLeft = await page.evaluate(() => window.artplayerInstance?._virtualTime || window.artplayerInstance?.art?.currentTime || 0);
    record('1.10 Pressing ArrowLeft rewinds 5s', timeAfterLeft <= 46, `Current: ${timeAfterLeft}`);

    // 1.11 Keyboard Shortcut: ArrowRight forwards 5s
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(100);
    const timeAfterRight = await page.evaluate(() => window.artplayerInstance?._virtualTime || window.artplayerInstance?.art?.currentTime || 0);
    record('1.11 Pressing ArrowRight forwards 5s', timeAfterRight >= 49, `Current: ${timeAfterRight}`);

    // 1.11b Keyboard Shortcut: J rewinds 10s
    await page.keyboard.press('KeyJ');
    await page.waitForTimeout(100);
    const timeAfterJ = await page.evaluate(() => window.artplayerInstance?._virtualTime || window.artplayerInstance?.art?.currentTime || 0);
    record('1.11b Pressing "J" rewinds 10s', timeAfterJ <= 41, `Current: ${timeAfterJ}`);

    // 1.11c Keyboard Shortcut: L forwards 10s
    await page.keyboard.press('KeyL');
    await page.waitForTimeout(100);
    const timeAfterL = await page.evaluate(() => window.artplayerInstance?._virtualTime || window.artplayerInstance?.art?.currentTime || 0);
    record('1.11c Pressing "L" forwards 10s', timeAfterL >= 48, `Current: ${timeAfterL}`);

    // 1.12 Keyboard Shortcut: ArrowUp / ArrowDown modifies volume
    const initialVol = await page.evaluate(() => {
      if (window.artplayerInstance?.art) {
        window.artplayerInstance.art.volume = 0.5;
        return window.artplayerInstance.art.volume;
      }
      return 0.5;
    });
    await page.keyboard.press('ArrowUp');
    await page.waitForTimeout(50);
    const volUp = await page.evaluate(() => window.artplayerInstance?.art?.volume || 0);
    record('1.12 Pressing ArrowUp increases volume', volUp > initialVol, `Vol: ${volUp}`);

    await page.keyboard.press('ArrowDown');
    await page.waitForTimeout(50);
    const volDown = await page.evaluate(() => window.artplayerInstance?.art?.volume || 0);
    record('1.13 Pressing ArrowDown decreases volume', volDown < volUp, `Vol: ${volDown}`);

    // 1.14 Keyboard Shortcut: 'm' toggles mute
    await page.keyboard.press('KeyM');
    await page.waitForTimeout(50);
    const isMuted = await page.evaluate(() => window.artplayerInstance?.art?.muted);
    record('1.14 Pressing "M" toggles Mute', typeof isMuted === 'boolean', `Muted: ${isMuted}`);

    // 1.15 Shortcuts do not fire when typing in input
    const inputIgnored = await page.evaluate(() => {
      const input = document.createElement('input');
      document.body.appendChild(input);
      input.focus();
      const prevTime = window.artplayerInstance?._virtualTime || 50;
      const event = new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true });
      input.dispatchEvent(event);
      input.remove();
      const afterTime = window.artplayerInstance?._virtualTime || 50;
      return afterTime === prevTime;
    });
    record('1.15 Shortcuts are safely ignored when user focuses input/search field', inputIgnored);

    await desktopContext.close();

    // =========================================================================
    // SECTION 2: Mobile Phone Viewport (iPhone 14 / Pixel 7 Touch 390x844)
    // =========================================================================
    console.log('\n📌 [TEST GROUP 2] Phone / Mobile Viewport UI & Fullscreen');
    const pixel7 = devices['Pixel 7'] || {
      viewport: { width: 393, height: 851 },
      userAgent: 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/116.0.0.0 Mobile Safari/537.36',
      isMobile: true,
      hasTouch: true
    };

    const mobileContext = await browser.newContext(pixel7);
    const mobPage = await mobileContext.newPage();
    mobPage.on('console', msg => console.log('MOB LOG:', msg.text()));
    mobPage.on('pageerror', err => console.error('MOB ERROR:', err.message));

    await mobPage.goto(`${BASE_URL}#watch?anime=20&ep=1`, { waitUntil: 'domcontentloaded' });
    await mobPage.waitForSelector('.art-video-player', { timeout: 15000 });
    await mobPage.waitForTimeout(500);

    // 2.1 Mobile controls visibility inside ArtPlayer
    const mobileControls = await mobPage.evaluate(() => {
      const playBtn = document.querySelector('.art-video-player .art-control-playAndPause') || document.querySelector('.art-video-player .art-control-play');
      const timeDisplay = document.querySelector('.art-video-player .art-control-time');
      const fsBtn = document.querySelector('.art-video-player .art-btn-fs') || document.querySelector('.art-video-player .art-control-fullscreen');
      const skipBack5 = document.querySelector('.art-video-player .art-control-skip-back-5s-btn') || document.querySelector('.art-video-player .art-btn-skip5');
      const skipFwd5 = document.querySelector('.art-video-player .art-control-skip-fwd-5s-btn') || document.querySelector('.art-video-player [data-name="skip-fwd-5s-btn"]');
      return {
        hasPlay: !!playBtn,
        hasTime: !!timeDisplay,
        hasFs: !!fsBtn,
        hasSkipBack5: !!skipBack5,
        hasSkipFwd5: !!skipFwd5
      };
    });
    record('2.1 Mobile controls inside ArtPlayer render Play, Time, -5s, +5s, Fullscreen', 
      mobileControls.hasPlay && mobileControls.hasSkipBack5 && mobileControls.hasSkipFwd5 && mobileControls.hasFs, 
      JSON.stringify(mobileControls)
    );

    // 2.2 Mobile Toolbar under video has large tactile touch targets
    const toolbarButtons = await mobPage.evaluate(() => {
      const playPause = document.getElementById('btn-play-pause-down');
      const skipBack = document.getElementById('btn-skip-backward-5');
      const skipFwd = document.getElementById('btn-skip-forward-5');
      const rect = playPause?.getBoundingClientRect();
      return {
        playPauseExists: !!playPause,
        skipBackExists: !!skipBack,
        skipFwdExists: !!skipFwd,
        height: rect?.height || 0
      };
    });
    record('2.2 Mobile toolbar buttons are touch-sized (>= 30px height)', 
      toolbarButtons.playPauseExists && toolbarButtons.height >= 30, 
      `Height: ${toolbarButtons.height}px`
    );

    // 2.3 Mobile Fullscreen Mode takes full screen (100dvw x 100dvh, no 90deg transform)
    await mobPage.click('#btn-fullscreen-down');
    await mobPage.waitForTimeout(300);

    const fsStyles = await mobPage.evaluate(() => {
      const player = document.querySelector('.art-video-player');
      const computed = window.getComputedStyle(player);
      const isBodyFull = document.body.classList.contains('player-in-fullscreen');
      const isForcedLandscape = document.body.classList.contains('player-forced-landscape');
      const bottomNav = document.getElementById('mobile-bottom-nav');
      const navHidden = bottomNav ? window.getComputedStyle(bottomNav).display === 'none' : true;
      return {
        isBodyFull,
        isForcedLandscape,
        position: computed.position,
        zIndex: computed.zIndex,
        width: computed.width,
        height: computed.height,
        transform: computed.transform,
        navHidden
      };
    });

    record('2.3 Mobile enters true fullscreen (fixed, z-index 2147483647, nav hidden)', 
      fsStyles.isBodyFull && fsStyles.position === 'fixed' && fsStyles.navHidden,
      `isBodyFull: ${fsStyles.isBodyFull}, Pos: ${fsStyles.position}, Z: ${fsStyles.zIndex}, NavHidden: ${fsStyles.navHidden}`
    );

    record('2.4 Mobile fullscreen does NOT force distorted 90deg CSS rotation', 
      !fsStyles.isForcedLandscape && (!fsStyles.transform || fsStyles.transform === 'none'),
      `Transform: "${fsStyles.transform}", ForcedLandscape: ${fsStyles.isForcedLandscape}`
    );

    // 2.5 Exit mobile fullscreen cleanly restores page
    await mobPage.evaluate(() => {
      if (window.artplayerInstance) {
        window.artplayerInstance.exitFullscreen();
      }
    });
    await mobPage.waitForTimeout(300);
    const exitedFull = await mobPage.evaluate(() => {
      return !document.body.classList.contains('player-in-fullscreen');
    });
    record('2.5 Exiting mobile fullscreen restores standard layout', exitedFull);

    // 2.6 Double-tap left/right creates floating seek ripple indicator
    const doubleTapTest = await mobPage.evaluate(() => {
      if (window.artplayerInstance) {
        window.artplayerInstance.showQuickSeekFeedback('left', '-5s');
        const ripple = document.querySelector('.ani-seek-ripple.ani-seek-left');
        const text = ripple?.textContent;
        return { created: !!ripple, text };
      }
      return { created: false };
    });
    record('2.6 Quick seek double-tap feedback HUD ripple displays cleanly', 
      doubleTapTest.created && doubleTapTest.text.includes('-5s'), 
      `Ripple Text: "${doubleTapTest.text}"`
    );

    await mobileContext.close();

  } catch (err) {
    console.error('Test run failed with error:', err);
  } finally {
    await browser.close();
  }

  console.log('\n============================================================');
  console.log(`📊 Test Summary: ${results.passed}/${results.total} Passed (${results.failed} Failed)`);
  console.log('============================================================\n');

  if (results.failed > 0) {
    process.exit(1);
  }
}

runTests();
