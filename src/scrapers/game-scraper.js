const { extractChartData, extractDamageMatrix } = require('../utils/helpers');

async function loadAllGames(page) {
  console.log('Loading all games with infinite scroll...');
  let previousHeight = 0;
  let stableCount = 0;
  let gamesLoaded = 0;

  while (stableCount < 3) {
    // Scroll to bottom
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(1500); // Wait for turbo-frames to load

    const currentHeight = await page.evaluate(() => document.body.scrollHeight);

    // Count current games
    const currentGames = await page.evaluate(() => {
      return document.querySelectorAll('#hot-games-container > a').length;
    });

    if (currentHeight === previousHeight && currentGames === gamesLoaded) {
      stableCount++;
    } else {
      stableCount = 0;
      gamesLoaded = currentGames;
    }

    previousHeight = currentHeight;
    console.log(`  Loaded ${gamesLoaded} games...`);
  }

  console.log(`Finished loading ${gamesLoaded} games`);
  return gamesLoaded;
}

async function extractGameLinks(page) {
  return await page.evaluate(() => {
    const gameLinks = document.querySelectorAll('#hot-games-container > a');
    return Array.from(gameLinks).map((link) => link.href);
  });
}

async function scrapeGameDetails(page) {
  const gameUrl = page.url();
  const gameId = gameUrl.match(/\/games\/(\d+)/)?.[1] || 'unknown';

  // Check if game is in progress
  const isInProgress = await page.evaluate(() => {
    const cardTitles = Array.from(document.querySelectorAll('.card-title'));
    return cardTitles.some((el) => el.textContent.includes('Game in progress'));
  });

  if (isInProgress) {
    console.log('  ⏳ Game in progress, skipping...');
    return null; // Signal to skip this game
  }

  // Extract basic metadata
  const metadata = await page.evaluate(() => {
    const getCardValue = (index) => {
      const cards = document.querySelectorAll(
        '.flex.flex-col.bg-surface.border.border-outline_variant'
      );
      if (cards[index]) {
        return (
          cards[index]
            .querySelector('.font-normal.text-2xl')
            ?.innerText.trim() || null
        );
      }
      return null;
    };

    return {
      duration: getCardValue(0),
      rounds: Number(getCardValue(1)) || 0,
      pauseTime: getCardValue(2),
      avgFun: Number(getCardValue(3)) || 0,
    };
  });

  // Extract playgroup and date from header
  const header = await page.evaluate(() => {
    const headerText = document.querySelector(
      '.flex.flex-col.truncate'
    )?.innerText;
    const playgroupMatch = headerText?.match(/^(.+)\nGame/);
    const dateMatch = headerText?.match(/on\s+(.+)$/m);

    return {
      playgroup: playgroupMatch?.[1]?.trim() || 'Unknown',
      date: dateMatch?.[1]?.trim() || 'Unknown',
    };
  });

  // Extract player data (4 players in grid)
  const players = await page.evaluate(() => {
    const playerCards = document.querySelectorAll(
      '.gap-4.h-fit.w-full.flex.flex-col.md\\:grid.grid-cols-4 > div'
    );

    return Array.from(playerCards).map((card) => {
      const isWinner =
        card.classList.contains('border-2') &&
        card.classList.contains('border-primary');

      // Extract player name and commander from header
      const nameEl = card.querySelector(
        '.font-medium.text-base.text-on-surface'
      );
      const commanderEl = card.querySelector('.text-on-surface_variant');
      const rankEl = card.querySelector(
        '.flex-row.whitespace-nowrap .text-base'
      );

      // Extract result info
      const resultEl = card.querySelector('.flex.flex-col.gap-y-2 .text-base');
      const resultText = resultEl?.innerText || '';

      let result, killedBy, winCondition;
      if (isWinner) {
        result = 'winner';
        const winMatch = resultText.match(/Winner\s+by\s+(.+)/);
        winCondition = winMatch?.[1] || 'Unknown';
      } else {
        result = 'eliminated';
        const killedMatch = resultText.match(/Killed by\s+(.+)/);
        killedBy = killedMatch?.[1] || 'Unknown';
      }

      // Extract mood
      const moodEl = card.querySelector('.flex.flex-row.items-center.gap-x-1');
      const moodText = moodEl?.innerText?.trim() || 'Unknown';

      // Extract times
      const timeRows = card.querySelectorAll('.flex.flex-row.justify-between');
      let timePlayed, avgTurn;
      timeRows.forEach((row) => {
        const label = row.querySelector('span:first-child')?.innerText;
        const value = row.querySelector('span:last-child')?.innerText;
        if (label === 'Time played') timePlayed = value;
        if (label === 'Avg. turn') avgTurn = value;
      });

      return {
        playerName: nameEl?.innerText?.trim() || 'Unknown',
        commander: commanderEl?.innerText?.trim() || 'Unknown',
        deckRank: Number(rankEl?.innerText) || 0,
        result,
        killedBy,
        winCondition,
        mood: moodText,
        timePlayed: timePlayed || '00:00:00',
        avgTurn: avgTurn || '00:00',
      };
    });
  });

  // Extract highlights
  const highlights = await page.evaluate(() => {
    const highlightCard = document.querySelector(
      '.card.space-y-4.min-h-full.min-w-max.w-full'
    );
    if (!highlightCard) return {};

    const sections = highlightCard.querySelectorAll(
      '.flex.flex-row.items-center'
    );
    let mostDamage, biggestSwing, longestTurn;

    // Most damage
    const dmgSection = sections[0];
    if (dmgSection) {
      const player = dmgSection.querySelector(
        '.leading-none.truncate'
      )?.innerText;
      const amountMatch = dmgSection.innerText.match(/(\d+)\s+damage in total/);
      mostDamage = { player, amount: Number(amountMatch?.[1]) || 0 };
    }

    // Biggest swing (has 2 player sections)
    const swingSection = sections[1];
    if (swingSection?.parentElement) {
      const players =
        swingSection.parentElement.querySelectorAll('.leading-none');
      const damageMatch =
        swingSection.parentElement.innerText.match(/dealt\s+(\d+)\s+dmg/);
      biggestSwing = {
        attacker: players[0]?.innerText || 'Unknown',
        target: players[1]?.innerText || 'Unknown',
        damage: Number(damageMatch?.[1]) || 0,
      };
    }

    // Longest turn
    const turnSection = sections[2];
    if (turnSection) {
      const player = turnSection.querySelector(
        '.leading-none.truncate'
      )?.innerText;
      const durationMatch = turnSection.innerText.match(/(\d+:\d+)\s+minutes/);
      longestTurn = { player, duration: durationMatch?.[1] || '00:00' };
    }

    return { mostDamage, biggestSwing, longestTurn };
  });

  // Extract damage matrices
  const damageMatrices = {
    total: await extractDamageMatrix(page, '#total table'),
    commander: await extractDamageMatrix(page, '#commander table'),
    healing: await extractDamageMatrix(page, '#healing table'),
    poison: await extractDamageMatrix(page, '#poison table'),
  };

  // Extract chart data from embedded JavaScript
  const htmlContent = await page.content();
  const chartData = {
    totalDamage: extractChartData(htmlContent, 'chart-1'), // Bar chart
    turnDuration: extractChartData(htmlContent, 'chart-2'),
    damagePerTurn: extractChartData(htmlContent, 'chart-3'),
    lifeChart: extractChartData(htmlContent, 'chart-4'),
    commanderDamage: extractChartData(htmlContent, 'chart-5'),
  };

  return {
    gameId,
    gameUrl,
    date: header.date,
    playgroup: header.playgroup,
    metadata,
    players,
    highlights,
    damageMatrices,
    chartData,
  };
}

async function scrapeGameData(page, playgroupUrl) {
  console.log('Navigating to Games tab...');
  await page.goto(playgroupUrl, { waitUntil: 'domcontentloaded' });

  // Click the Games tab
  await page.click('button[data-target="#tab-5"]');
  await page.waitForTimeout(1000); // Wait for tab content to show

  // Infinite scroll to load all games
  await loadAllGames(page);

  // Extract all game links
  const gameLinks = await extractGameLinks(page);
  console.log(`Found ${gameLinks.length} game links to scrape`);

  const allGames = [];
  let skippedCount = 0;

  for (let i = 0; i < gameLinks.length; i++) {
    const gameLink = gameLinks[i];
    console.log(`[${i + 1}/${gameLinks.length}] Scraping game ${gameLink}...`);

    try {
      await page.goto(gameLink, { waitUntil: 'domcontentloaded' });
      const gameData = await scrapeGameDetails(page);

      if (gameData === null) {
        // Game in progress, skip
        skippedCount++;
      } else {
        allGames.push(gameData);
      }
    } catch (error) {
      console.error(`  Error scraping ${gameLink}:`, error.message);
      // Continue with next game
    }
  }

  console.log(
    `\nCompleted: ${allGames.length} games scraped, ${skippedCount} in-progress games skipped`
  );
  return allGames;
}

module.exports = {
  scrapeGameData,
};

// Allow standalone execution
if (require.main === module) {
  const { chromium } = require('playwright');
  const fs = require('fs').promises;
  const path = require('path');
  const { login } = require('./auth');
  require('dotenv').config();

  const PLAYGROUP_URL = process.env.PLAYGROUP_URL;
  const DATA_DIR = path.join(__dirname, '../../data');

  (async () => {
    const browser = await chromium.launch({ headless: false });
    const page = await browser.newPage();

    try {
      await page.goto(PLAYGROUP_URL, { waitUntil: 'domcontentloaded' });
      await login(page);

      const games = await scrapeGameData(page, PLAYGROUP_URL);

      await fs.mkdir(DATA_DIR, { recursive: true });
      await fs.writeFile(
        path.join(DATA_DIR, 'games.json'),
        JSON.stringify(games, null, 2)
      );
      console.log(`Saved ${games.length} games`);
    } finally {
      await browser.close();
    }
  })();
}
