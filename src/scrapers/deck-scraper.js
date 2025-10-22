const { login } = require('./auth');

async function getDeckData(page) {
  return await page.evaluate(() => {
    const wins = Number(
      document.querySelector(
        'body > div.flex.flex-col.h-screen > main > div > div.-mx-4 > div > div > div.flex.flex-col > div.flex.flex-row.items-center.gap-x-4.mt-4.w-full.max-w-md > div:nth-child(2) > div > span.text-4xl.leading-none.font-normal.text-on-surface'
      ).innerText
    );
    const losses = Number(
      document.querySelector(
        'body > div.flex.flex-col.h-screen > main > div > div.-mx-4 > div > div > div.flex.flex-col > div.flex.flex-row.items-center.gap-x-4.mt-4.w-full.max-w-md > div:nth-child(3) > div > span.text-4xl.leading-none.font-normal.text-on-surface'
      ).innerText
    );
    const games = Number(
      document.querySelector(
        'body > div.flex.flex-col.h-screen > main > div > div.flex.flex-col.max-w-screen-xl.mx-auto > div.flex.flex-col.lg\\:flex-row.gap-4.lg\\:order-3.order-1.pb-4 > div:nth-child(7) > div:nth-child(3) > div > span.font-normal.text-xl'
      ).innerText
    );
    const winRate = wins / games;
    const avgTurnLength = document.querySelector(
      'body > div.flex.flex-col.h-screen > main > div > div.flex.flex-col.max-w-screen-xl.mx-auto > div.grid.grid-cols-2.lg\\:grid-cols-5.gap-4.mb-4.order-2 > div:nth-child(1) > span.font-normal.text-xl'
    ).innerText;
    const avgWinTurn = Number(
      document.querySelector(
        'body > div.flex.flex-col.h-screen > main > div > div.flex.flex-col.max-w-screen-xl.mx-auto > div.grid.grid-cols-2.lg\\:grid-cols-5.gap-4.mb-4.order-2 > div:nth-child(2) > span.font-normal.text-xl'
      ).innerText
    );
    const avgKillsPerGame = Number(
      document.querySelector(
        'body > div.flex.flex-col.h-screen > main > div > div.flex.flex-col.max-w-screen-xl.mx-auto > div.grid.grid-cols-2.lg\\:grid-cols-5.gap-4.mb-4.order-2 > div:nth-child(3) > span.font-normal.text-xl'
      ).innerText
    );
    const avgDamagePerGame = Number(
      document.querySelector(
        'body > div.flex.flex-col.h-screen > main > div > div.flex.flex-col.max-w-screen-xl.mx-auto > div.grid.grid-cols-2.lg\\:grid-cols-5.gap-4.mb-4.order-2 > div:nth-child(4) > span.font-normal.text-xl'
      ).innerText
    );
    const avgGameRounds = Number(
      document.querySelector(
        'body > div.flex.flex-col.h-screen > main > div > div.flex.flex-col.max-w-screen-xl.mx-auto > div.grid.grid-cols-2.lg\\:grid-cols-5.gap-4.mb-4.order-2 > div:nth-child(5) > span.font-normal.text-xl'
      ).innerText
    );

    return {
      wins,
      losses,
      games,
      winRate,
      avgTurnLength,
      avgWinTurn,
      avgKillsPerGame,
      avgDamagePerGame,
      avgGameRounds,
    };
  });
}

async function getDecks(page) {
  return await page.evaluate(() => {
    const deckLinkElements = document.querySelectorAll(
      '#deck-leaderboard-elo > a'
    );
    const decks = [];

    for (const deckLinkElement of deckLinkElements) {
      // Extract rank and commander from the <p> tag
      const commanderText = deckLinkElement.querySelector('p').innerText.trim();
      const [, rank, commander] = commanderText.match(/^(\d+)\.\s+(.+)$/);

      // Extract pilot from the pilot div
      const pilot = deckLinkElement
        .querySelector('.text-sm.text-on-surface_variant')
        .innerText.trim();

      // Extract ELO from the last div
      const elo = deckLinkElement
        .querySelector('.text-2xs.flex-none')
        .innerText.trim();

      const deck = {
        commander,
        pilot,
        rank: Number(rank),
        elo: Number(elo),
        link: deckLinkElement.href,
      };
      decks.push(deck);
    }
    return decks;
  });
}

async function scrapeDeckData(page, playgroupUrl) {
  console.log('Navigating to playgroup...');
  await page.goto(playgroupUrl, { waitUntil: 'domcontentloaded' });

  console.log('Getting deck leaderboard...');
  const decks = await getDecks(page);
  console.log(`Found ${decks.length} decks`);

  const allData = [];

  for (let i = 0; i < decks.length; i++) {
    const deck = decks[i];
    console.log(
      `[${i + 1}/${decks.length}] Processing ${deck.commander} by ${
        deck.pilot
      }...`
    );

    await page.goto(deck.link, { waitUntil: 'domcontentloaded' });

    const deckData = await getDeckData(page);
    allData.push({
      ...deck,
      ...deckData,
    });
  }

  return allData;
}

module.exports = {
  scrapeDeckData,
};

// Allow standalone execution
if (require.main === module) {
  const { chromium } = require('playwright');
  const fs = require('fs').promises;
  const path = require('path');
  require('dotenv').config();

  const PLAYGROUP_URL = process.env.PLAYGROUP_URL;
  const DATA_DIR = path.join(__dirname, '../../data');

  (async () => {
    const browser = await chromium.launch({ headless: false });
    const page = await browser.newPage();

    try {
      await page.goto(PLAYGROUP_URL, { waitUntil: 'domcontentloaded' });
      await login(page);

      const decks = await scrapeDeckData(page, PLAYGROUP_URL);

      await fs.mkdir(DATA_DIR, { recursive: true });
      await fs.writeFile(
        path.join(DATA_DIR, 'playgroup-data.json'),
        JSON.stringify(decks, null, 2)
      );
      console.log(`Saved ${decks.length} decks`);
    } finally {
      await browser.close();
    }
  })();
}
