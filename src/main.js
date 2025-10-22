const { chromium } = require('playwright');
const fs = require('fs').promises;
const path = require('path');
require('dotenv').config();

const { login } = require('./scrapers/auth');
const { scrapeDeckData } = require('./scrapers/deck-scraper');
const { scrapeGameData } = require('./scrapers/game-scraper');
const { analyze } = require('./analyzers/analyze');

const USERNAME = process.env.USERNAME;
const PASSWORD = process.env.PASSWORD;
const PLAYGROUP_URL = process.env.PLAYGROUP_URL;
const DATA_DIR = path.join(__dirname, '../data');

async function main() {
  console.log('=======================================================');
  console.log('  PLAYGROUP DATA PIPELINE');
  console.log('=======================================================\n');

  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    // Phase 1: Login
    console.log('=== PHASE 1: Authentication ===');
    await page.goto(PLAYGROUP_URL, { waitUntil: 'domcontentloaded' });

    if (USERNAME && PASSWORD) {
      await login(page);
    } else {
      console.log('No credentials provided, skipping login...');
    }

    // Phase 2: Scrape Deck Data
    console.log('\n=== PHASE 2: Scraping Deck Data ===');
    const decks = await scrapeDeckData(page, PLAYGROUP_URL);

    await fs.mkdir(DATA_DIR, { recursive: true });
    const deckDataPath = path.join(DATA_DIR, 'playgroup-data.json');
    await fs.writeFile(deckDataPath, JSON.stringify(decks, null, 2));
    console.log(`✓ Saved ${decks.length} decks to ${deckDataPath}`);

    // Phase 3: Scrape Game Data
    console.log('\n=== PHASE 3: Scraping Game Data ===');
    const games = await scrapeGameData(page, PLAYGROUP_URL);

    const gamesDataPath = path.join(DATA_DIR, 'games.json');
    await fs.writeFile(gamesDataPath, JSON.stringify(games, null, 2));
    console.log(`✓ Saved ${games.length} games to ${gamesDataPath}`);

    // Close browser before analysis
    await browser.close();
    console.log('\n✓ Browser closed');

    // Phase 4: Analyze Data
    console.log('\n=== PHASE 4: Analyzing Data ===');
    await analyze();

    console.log('\n=======================================================');
    console.log('  PIPELINE COMPLETE!');
    console.log('=======================================================');
    console.log('\nGenerated files:');
    console.log(`  - ${deckDataPath}`);
    console.log(`  - ${gamesDataPath}`);
    console.log(`  - ${path.join(DATA_DIR, 'insights.json')}`);
    console.log(`  - ${path.join(DATA_DIR, 'report.md')}`);
    console.log('');
  } catch (error) {
    console.error('\n❌ Error in pipeline:', error);
    throw error;
  } finally {
    if (browser.isConnected()) {
      await browser.close();
    }
  }
}

main();

