const { chromium } = require('playwright');
const fs = require('fs').promises;
const path = require('path');

require('dotenv').config();

const USERNAME = process.env.USERNAME;
const PASSWORD = process.env.PASSWORD;
const PLAYGROUP_URL = process.env.PLAYGROUP_URL;

const DATA_DIR = path.join(__dirname, 'data');

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
      const innerText = deckLinkElement.innerText;
      const [, rank, commander, pilot, elo] = innerText.match(
        /^(\d+)\.\s(.+)\n\n(.+)\n(\d+)$/
      );
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

async function login(page) {
  console.log('Filling in login credentials...');
  await page.fill('#user_email', USERNAME);
  await page.fill('#user_password', PASSWORD);

  console.log('Submitting login form...');
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'domcontentloaded' }),
    page.click('input[type="submit"][value="Sign In"]'),
  ]);

  console.log('Login complete!');
}

async function main() {
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    console.log('Navigating to playgroup...');
    await page.goto(PLAYGROUP_URL, { waitUntil: 'domcontentloaded' });

    if (USERNAME && PASSWORD) {
      console.log('Logging in...');
      await login(page);
    } else {
      console.log('No credentials provided, skipping login...');
    }

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

    console.log('Saving data to playgroup-data.json...');
    await fs.mkdir(DATA_DIR, { recursive: true });
    await fs.writeFile(
      path.join(DATA_DIR, 'playgroup-data.json'),
      JSON.stringify(allData, null, 2)
    );
    console.log('Done!');

    return allData;
  } catch (error) {
    console.error('Error:', error);
    throw error;
  } finally {
    await browser.close();
  }
}

main();
