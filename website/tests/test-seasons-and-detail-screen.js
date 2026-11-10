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
  console.log('🧪 Testing Multi-Season Franchise Hub & Detail Screen Feature');
  console.log('🎯 Target:', BASE_URL);
  console.log('============================================================\n');

  const browser = await chromium.launch({ channel: 'chrome', headless: true });

  try {
    // =========================================================================
    // SECTION 1: Desktop Experience (1280x800)
    // =========================================================================
    console.log('📌 [TEST GROUP 1] Desktop Anime Detail Modal & Season Selection');
    const desktopContext = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await desktopContext.newPage();

    await page.goto(BASE_URL, { waitUntil: 'networkidle' });

    // 1. DOM Elements Check
    const modalExists = await page.$('#anime-detail-modal') !== null;
    record('Anime Detail Modal exists in DOM', modalExists);

    const closeBtnExists = await page.$('#anime-detail-modal-close') !== null;
    record('Modal close button exists', closeBtnExists);

    const seasonsGridExists = await page.$('#detail-modal-seasons-grid') !== null;
    record('Modal franchise seasons grid container exists', seasonsGridExists);

    const episodesGridExists = await page.$('#detail-modal-episodes-list') !== null;
    record('Modal episodes list container exists', episodesGridExists);

    const watchSeasonSelectorExists = await page.$('#watch-season-selector-wrapper') !== null;
    record('Watch Room season switcher exists in DOM', watchSeasonSelectorExists);

    // 2. Open Anime Detail Modal for Naruto (ID 20)
    console.log('👉 Opening Anime Detail Modal for Naruto (ID 20)...');
    await page.evaluate(() => window.openAnimeDetailModal(20));

    // Wait for modal to become visible
    await page.waitForSelector('#anime-detail-modal:not(.hidden)', { timeout: 8000 });
    const isModalVisible = await page.$eval('#anime-detail-modal', el => !el.classList.contains('hidden'));
    record('Anime Detail Modal opened and is visible', isModalVisible);

    // Wait for seasons grid to populate
    await page.waitForFunction(() => {
      const grid = document.getElementById('detail-modal-seasons-grid');
      return grid && grid.children.length > 0;
    }, { timeout: 10000 });

    const seasonCardsCount = await page.$$eval('#detail-modal-seasons-grid > div', els => els.length);
    record('Franchise seasons loaded in modal', seasonCardsCount >= 2, `Found ${seasonCardsCount} franchise entries`);

    const modalTitle = await page.$eval('#detail-modal-title', el => el.textContent.trim());
    record('Modal title populated correctly', modalTitle.toLowerCase().includes('naruto'), `Title: ${modalTitle}`);

    // Wait for episodes to populate for Season 1
    await page.waitForFunction(() => {
      const list = document.getElementById('detail-modal-episodes-list');
      return list && list.querySelectorAll('button').length > 0;
    }, { timeout: 10000 });

    const epButtonsCount = await page.$$eval('#detail-modal-episodes-list button', els => els.length);
    record('Season 1 episodes rendered in modal', epButtonsCount > 0, `Rendered ${epButtonsCount} episodes`);

    // 3. Test Season Switch: Select Season 2 (Shippuden, ID 1735)
    console.log('👉 Selecting Season 2 in modal...');
    await page.evaluate(() => window.selectDetailModalSeason(1735));
    await page.waitForTimeout(1000);

    const activeSeasonHeading = await page.$eval('#detail-modal-active-season-heading', el => el.textContent.trim());
    record('Active season heading updated to Season 2', activeSeasonHeading.toLowerCase().includes('season 2') || activeSeasonHeading.toLowerCase().includes('shippu'), `Heading: ${activeSeasonHeading}`);

    // 4. Test Closing Modal with Escape Key
    console.log('👉 Testing close modal with Escape key...');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    const isModalHidden = await page.$eval('#anime-detail-modal', el => el.classList.contains('hidden'));
    record('Modal closed on Escape key press', isModalHidden);

    // 5. Test Slime (That Time I Got Reincarnated as a Slime, ID 101280)
    console.log('👉 Opening Detail Modal for Reincarnated as a Slime (ID 101280)...');
    await page.evaluate(() => window.openAnimeDetailModal(101280));
    await page.waitForSelector('#anime-detail-modal:not(.hidden)', { timeout: 8000 });

    await page.waitForFunction(() => {
      const grid = document.getElementById('detail-modal-seasons-grid');
      return grid && grid.children.length >= 2;
    }, { timeout: 10000 });

    const slimeSeasonsCount = await page.$$eval('#detail-modal-seasons-grid > div', els => els.length);
    record('Slime franchise seasons populated', slimeSeasonsCount >= 2, `Found ${slimeSeasonsCount} Slime entries`);

    // 6. Test Start Watching from Modal into Watch Room
    console.log('👉 Clicking Start Watching button...');
    await page.click('#detail-modal-play-btn');
    await page.waitForTimeout(1500);

    const currentHash = await page.evaluate(() => window.location.hash);
    record('Navigated to Watch Room URL', currentHash.startsWith('#watch?anime='), `Hash: ${currentHash}`);

    // Check In-Player Season Switcher is visible and populated in Watch Room
    await page.waitForSelector('#watch-season-selector-wrapper:not(.hidden)', { timeout: 10000 }).catch(() => {});
    const isWatchSeasonVisible = await page.$eval('#watch-season-selector-wrapper', el => !el.classList.contains('hidden')).catch(() => false);
    record('In-Player Season Switcher dropdown is visible in Watch Room', isWatchSeasonVisible);

    const watchSeasonOptionsCount = await page.$$eval('#watch-season-select option', els => els.length).catch(() => 0);
    record('In-Player Season Switcher has franchise options', watchSeasonOptionsCount >= 2, `Options count: ${watchSeasonOptionsCount}`);

    // =========================================================================
    // SECTION 2: Mobile Experience (iPhone 14, 390x844)
    // =========================================================================
    console.log('\n📌 [TEST GROUP 2] Mobile Viewport Responsiveness');
    const mobileContext = await browser.newContext({
      ...devices['iPhone 14'],
      isMobile: true,
      hasTouch: true
    });
    const mobilePage = await mobileContext.newPage();

    await mobilePage.goto(BASE_URL, { waitUntil: 'networkidle' });

    // Open anime detail modal directly on mobile
    await mobilePage.evaluate(() => window.openAnimeDetailModal(20));
    await mobilePage.waitForSelector('#anime-detail-modal:not(.hidden)', { timeout: 8000 });

    const mobileModalVisible = await mobilePage.$eval('#anime-detail-modal', el => !el.classList.contains('hidden'));
    record('Mobile: Detail modal opens cleanly', mobileModalVisible);

    await mobilePage.waitForFunction(() => {
      const grid = document.getElementById('detail-modal-seasons-grid');
      return grid && grid.children.length > 0;
    }, { timeout: 10000 });

    const mobileSeasons = await mobilePage.$$eval('#detail-modal-seasons-grid > div', els => els.length);
    record('Mobile: Franchise seasons are rendered and touchable', mobileSeasons >= 2, `Seasons count: ${mobileSeasons}`);

    // Click close button on mobile
    await mobilePage.click('#anime-detail-modal-close');
    await mobilePage.waitForTimeout(300);
    const mobileModalClosed = await mobilePage.$eval('#anime-detail-modal', el => el.classList.contains('hidden'));
    record('Mobile: Modal close button works reliably', mobileModalClosed);

    await desktopContext.close();
    await mobileContext.close();

  } catch (err) {
    console.error('Fatal test error:', err);
    record('Test Suite Execution', false, err.message);
  } finally {
    await browser.close();
  }

  console.log('\n============================================================');
  console.log(`📊 Test Results: ${results.passed}/${results.total} PASSED (${results.failed} failed)`);
  console.log('============================================================\n');

  if (results.failed > 0) {
    process.exit(1);
  }
}

runTests();
