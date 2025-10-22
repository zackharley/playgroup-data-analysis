const fs = require('fs').promises;
const path = require('path');

const DATA_DIR = path.join(__dirname, 'data');

// Helper function to parse time string "MM:SS" to seconds
function parseTimeToSeconds(timeStr) {
  const [minutes, seconds] = timeStr.split(':').map(Number);
  return minutes * 60 + seconds;
}

// Helper function to calculate correlation coefficient
function correlation(xs, ys) {
  const n = xs.length;
  const sumX = xs.reduce((a, b) => a + b, 0);
  const sumY = ys.reduce((a, b) => a + b, 0);
  const sumXY = xs.reduce((sum, x, i) => sum + x * ys[i], 0);
  const sumX2 = xs.reduce((sum, x) => sum + x * x, 0);
  const sumY2 = ys.reduce((sum, y) => sum + y * y, 0);

  const numerator = n * sumXY - sumX * sumY;
  const denominator = Math.sqrt(
    (n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY)
  );

  return denominator === 0 ? 0 : numerator / denominator;
}

// Helper function to get percentile
function percentile(arr, p) {
  const sorted = [...arr].sort((a, b) => a - b);
  const index = (p / 100) * (sorted.length - 1);
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  const weight = index % 1;
  return sorted[lower] * (1 - weight) + sorted[upper] * weight;
}

// Player Performance Analysis
function analyzePlayerPerformance(decks) {
  const playerStats = {};

  decks.forEach((deck) => {
    if (!playerStats[deck.pilot]) {
      playerStats[deck.pilot] = {
        pilot: deck.pilot,
        totalGames: 0,
        totalWins: 0,
        totalLosses: 0,
        totalElo: 0,
        deckCount: 0,
        decks: [],
        totalKills: 0,
        totalDamage: 0,
      };
    }

    const ps = playerStats[deck.pilot];
    ps.totalGames += deck.games;
    ps.totalWins += deck.wins;
    ps.totalLosses += deck.losses;
    ps.totalElo += deck.elo;
    ps.deckCount += 1;
    ps.totalKills += deck.avgKillsPerGame * deck.games;
    ps.totalDamage += deck.avgDamagePerGame * deck.games;
    ps.decks.push({
      commander: deck.commander,
      elo: deck.elo,
      winRate: deck.winRate,
      games: deck.games,
    });
  });

  // Calculate derived stats
  const playerRankings = Object.values(playerStats).map((ps) => {
    ps.overallWinRate = ps.totalWins / ps.totalGames;
    ps.avgElo = ps.totalElo / ps.deckCount;
    ps.avgKillsPerGame = ps.totalKills / ps.totalGames;
    ps.avgDamagePerGame = ps.totalDamage / ps.totalGames;

    // Find best and worst decks
    ps.bestDeck = ps.decks.reduce((best, deck) =>
      deck.elo > best.elo ? deck : best
    );
    ps.worstDeck = ps.decks.reduce((worst, deck) =>
      deck.elo < worst.elo ? deck : worst
    );

    return ps;
  });

  // Sort by overall win rate
  playerRankings.sort((a, b) => b.overallWinRate - a.overallWinRate);

  return {
    playerRankings,
    playerStats,
  };
}

// Commander Meta Analysis
function analyzeCommanderMeta(decks) {
  // Group decks by commander name
  const commanderGroups = {};

  decks.forEach((deck) => {
    if (!commanderGroups[deck.commander]) {
      commanderGroups[deck.commander] = [];
    }
    commanderGroups[deck.commander].push(deck);
  });

  // Analyze duplicates
  const duplicateCommanders = Object.entries(commanderGroups)
    .filter(([, instances]) => instances.length > 1)
    .map(([commander, instances]) => ({
      commander,
      instanceCount: instances.length,
      pilots: instances.map((d) => d.pilot),
      avgElo: instances.reduce((sum, d) => sum + d.elo, 0) / instances.length,
      avgWinRate:
        instances.reduce((sum, d) => sum + d.winRate, 0) / instances.length,
      totalGames: instances.reduce((sum, d) => sum + d.games, 0),
      instances: instances.map((d) => ({
        pilot: d.pilot,
        elo: d.elo,
        winRate: d.winRate,
        games: d.games,
      })),
    }))
    .sort((a, b) => b.instanceCount - a.instanceCount);

  // Top commanders by ELO (with sample size context)
  const topByElo = [...decks]
    .sort((a, b) => b.elo - a.elo)
    .slice(0, 20)
    .map((d) => ({
      commander: d.commander,
      pilot: d.pilot,
      elo: d.elo,
      winRate: d.winRate,
      games: d.games,
      sampleSize: d.games < 5 ? 'low' : d.games < 15 ? 'medium' : 'high',
    }));

  // Top by win rate (minimum 5 games)
  const topByWinRate = [...decks]
    .filter((d) => d.games >= 5)
    .sort((a, b) => b.winRate - a.winRate)
    .slice(0, 20)
    .map((d) => ({
      commander: d.commander,
      pilot: d.pilot,
      elo: d.elo,
      winRate: d.winRate,
      games: d.games,
    }));

  // Outliers (high ELO but low games)
  const outliers = decks
    .filter((d) => d.elo > 1550 && d.games < 5)
    .map((d) => ({
      commander: d.commander,
      pilot: d.pilot,
      elo: d.elo,
      games: d.games,
      winRate: d.winRate,
      warning: 'High ELO with small sample size',
    }));

  // Correlations
  const eloValues = decks.map((d) => d.elo);
  const winRateValues = decks.map((d) => d.winRate);
  const gamesValues = decks.map((d) => d.games);

  const correlations = {
    eloVsWinRate: correlation(eloValues, winRateValues),
    eloVsGames: correlation(eloValues, gamesValues),
    winRateVsGames: correlation(winRateValues, gamesValues),
  };

  return {
    duplicateCommanders,
    topByElo,
    topByWinRate,
    outliers,
    correlations,
    totalUniqueCommanders: Object.keys(commanderGroups).length,
    totalDecks: decks.length,
  };
}

// Playstyle Pattern Analysis
function analyzePlaystylePatterns(decks) {
  // Categorize decks by playstyle
  const categorized = decks.map((deck) => {
    let playstyle = 'midrange';

    // Aggro: fast wins, high damage, high kills
    if (
      deck.avgWinTurn < 8 &&
      deck.avgKillsPerGame > 1.2 &&
      deck.avgDamagePerGame > 60
    ) {
      playstyle = 'aggro';
    }
    // Control: slow wins, low kills, moderate damage
    else if (deck.avgWinTurn > 10 && deck.avgKillsPerGame < 0.8) {
      playstyle = 'control';
    }
    // Combo: fast wins, low kills, low damage
    else if (
      deck.avgWinTurn < 8 &&
      deck.avgKillsPerGame < 0.8 &&
      deck.avgDamagePerGame < 50
    ) {
      playstyle = 'combo';
    }

    return {
      ...deck,
      playstyle,
      turnSpeedSeconds: parseTimeToSeconds(deck.avgTurnLength),
    };
  });

  // Group by playstyle
  const playstyleGroups = {
    aggro: categorized.filter((d) => d.playstyle === 'aggro'),
    midrange: categorized.filter((d) => d.playstyle === 'midrange'),
    control: categorized.filter((d) => d.playstyle === 'control'),
    combo: categorized.filter((d) => d.playstyle === 'combo'),
  };

  // Stats per playstyle
  const playstyleStats = Object.entries(playstyleGroups).map(
    ([style, decks]) => ({
      playstyle: style,
      count: decks.length,
      avgElo: decks.reduce((sum, d) => sum + d.elo, 0) / decks.length || 0,
      avgWinRate:
        decks.reduce((sum, d) => sum + d.winRate, 0) / decks.length || 0,
      avgWinTurn:
        decks.reduce((sum, d) => sum + d.avgWinTurn, 0) / decks.length || 0,
      avgKillsPerGame:
        decks.reduce((sum, d) => sum + d.avgKillsPerGame, 0) / decks.length ||
        0,
    })
  );

  // Turn speed analysis
  const turnSpeeds = categorized.map((d) => d.turnSpeedSeconds);
  const speedPercentiles = {
    p25: percentile(turnSpeeds, 25),
    p50: percentile(turnSpeeds, 50),
    p75: percentile(turnSpeeds, 75),
  };

  const fastDecks = categorized.filter(
    (d) => d.turnSpeedSeconds < speedPercentiles.p25
  );
  const slowDecks = categorized.filter(
    (d) => d.turnSpeedSeconds > speedPercentiles.p75
  );

  // Efficiency metrics
  const efficiencyMetrics = categorized.map((deck) => ({
    commander: deck.commander,
    pilot: deck.pilot,
    damagePerRound: deck.avgDamagePerGame / deck.avgGameRounds,
    killsPerGame: deck.avgKillsPerGame,
    winEfficiency: deck.winRate * deck.avgKillsPerGame, // Combined metric
  }));

  const topEfficient = [...efficiencyMetrics]
    .filter((d) =>
      decks.find((dd) => dd.commander === d.commander && dd.games >= 5)
    )
    .sort((a, b) => b.winEfficiency - a.winEfficiency)
    .slice(0, 10);

  // Fastest winning decks (by avgWinTurn)
  const fastestWinners = [...categorized]
    .filter((d) => d.games >= 5 && d.wins > 0) // Must have wins to have avgWinTurn
    .sort((a, b) => a.avgWinTurn - b.avgWinTurn)
    .slice(0, 15)
    .map((d) => ({
      commander: d.commander,
      pilot: d.pilot,
      avgWinTurn: d.avgWinTurn,
      winRate: d.winRate,
      elo: d.elo,
      games: d.games,
      wins: d.wins,
      playstyle: d.playstyle,
    }));

  return {
    playstyleDistribution: playstyleStats,
    playstyleGroups: Object.fromEntries(
      Object.entries(playstyleGroups).map(([style, decks]) => [
        style,
        decks.map((d) => ({
          commander: d.commander,
          pilot: d.pilot,
          elo: d.elo,
        })),
      ])
    ),
    speedPercentiles,
    fastestDecks: fastDecks.slice(0, 10).map((d) => ({
      commander: d.commander,
      pilot: d.pilot,
      avgTurnLength: d.avgTurnLength,
      turnSpeedSeconds: d.turnSpeedSeconds,
    })),
    slowestDecks: slowDecks.slice(-10).map((d) => ({
      commander: d.commander,
      pilot: d.pilot,
      avgTurnLength: d.avgTurnLength,
      turnSpeedSeconds: d.turnSpeedSeconds,
    })),
    fastestWinners,
    topEfficient,
  };
}

// Generate readable markdown report
function generateMarkdownReport(insights) {
  let md = '# Playgroup Data Analysis Report\n\n';
  md += `Generated: ${new Date().toLocaleString()}\n\n`;

  // Player Rankings
  md += '## Player Performance Rankings\n\n';
  md += '| Rank | Player | Win Rate | Games | Avg ELO | Decks | Best Deck |\n';
  md += '|------|--------|----------|-------|---------|-------|----------|\n';
  insights.playerPerformance.playerRankings.forEach((p, i) => {
    md += `| ${i + 1} | ${p.pilot} | ${(p.overallWinRate * 100).toFixed(
      1
    )}% | ${p.totalGames} | ${Math.round(p.avgElo)} | ${p.deckCount} | ${
      p.bestDeck.commander
    } (${p.bestDeck.elo}) |\n`;
  });
  md += '\n';

  // Top Commanders by ELO
  md += '## Top Commanders by ELO\n\n';
  md += '| Rank | Commander | Pilot | ELO | Win Rate | Games | Sample |\n';
  md += '|------|-----------|-------|-----|----------|-------|--------|\n';
  insights.commanderMeta.topByElo.forEach((d, i) => {
    md += `| ${i + 1} | ${d.commander} | ${d.pilot} | ${d.elo} | ${(
      d.winRate * 100
    ).toFixed(1)}% | ${d.games} | ${d.sampleSize} |\n`;
  });
  md += '\n';

  // Top by Win Rate
  md += '## Top Commanders by Win Rate (min 5 games)\n\n';
  md += '| Rank | Commander | Pilot | Win Rate | ELO | Games |\n';
  md += '|------|-----------|-------|----------|-----|-------|\n';
  insights.commanderMeta.topByWinRate.forEach((d, i) => {
    md += `| ${i + 1} | ${d.commander} | ${d.pilot} | ${(
      d.winRate * 100
    ).toFixed(1)}% | ${d.elo} | ${d.games} |\n`;
  });
  md += '\n';

  // Duplicate Commanders
  if (insights.commanderMeta.duplicateCommanders.length > 0) {
    md += '## Duplicate Commanders (Multiple Players)\n\n';
    insights.commanderMeta.duplicateCommanders.forEach((dup) => {
      md += `### ${dup.commander}\n`;
      md += `- ${dup.instanceCount} pilots: ${dup.pilots.join(', ')}\n`;
      md += `- Avg ELO: ${Math.round(dup.avgElo)} | Avg Win Rate: ${(
        dup.avgWinRate * 100
      ).toFixed(1)}%\n\n`;
      md += '| Pilot | ELO | Win Rate | Games |\n';
      md += '|-------|-----|----------|-------|\n';
      dup.instances.forEach((inst) => {
        md += `| ${inst.pilot} | ${inst.elo} | ${(inst.winRate * 100).toFixed(
          1
        )}% | ${inst.games} |\n`;
      });
      md += '\n';
    });
  }

  // Playstyle Distribution
  md += '## Playstyle Distribution\n\n';
  md +=
    '| Playstyle | Count | Avg ELO | Avg Win Rate | Avg Win Turn | Avg Kills |\n';
  md +=
    '|-----------|-------|---------|--------------|--------------|----------|\n';
  insights.playstylePatterns.playstyleDistribution.forEach((ps) => {
    md += `| ${ps.playstyle} | ${ps.count} | ${Math.round(ps.avgElo)} | ${(
      ps.avgWinRate * 100
    ).toFixed(1)}% | ${ps.avgWinTurn.toFixed(1)} | ${ps.avgKillsPerGame.toFixed(
      2
    )} |\n`;
  });
  md += '\n';

  // Fastest/Slowest Decks
  md += '## Turn Speed Analysis\n\n';
  md += '### Fastest Decks (by turn length)\n\n';
  md += '| Commander | Pilot | Avg Turn Length |\n';
  md += '|-----------|-------|----------------|\n';
  insights.playstylePatterns.fastestDecks.forEach((d) => {
    md += `| ${d.commander} | ${d.pilot} | ${d.avgTurnLength} |\n`;
  });
  md += '\n';

  md += '### Slowest Decks (by turn length)\n\n';
  md += '| Commander | Pilot | Avg Turn Length |\n';
  md += '|-----------|-------|----------------|\n';
  insights.playstylePatterns.slowestDecks.forEach((d) => {
    md += `| ${d.commander} | ${d.pilot} | ${d.avgTurnLength} |\n`;
  });
  md += '\n';

  // Fastest Winners by turn
  md += '## Fastest Winners (by average win turn)\n\n';
  md += 'Min 5 games, must have at least 1 win\n\n';
  md +=
    '| Rank | Commander | Pilot | Avg Win Turn | Win Rate | ELO | Games | Playstyle |\n';
  md +=
    '|------|-----------|-------|--------------|----------|-----|-------|----------|\n';
  insights.playstylePatterns.fastestWinners.forEach((d, i) => {
    md += `| ${i + 1} | ${d.commander} | ${d.pilot} | ${d.avgWinTurn.toFixed(
      2
    )} | ${(d.winRate * 100).toFixed(1)}% | ${d.elo} | ${d.games} | ${
      d.playstyle
    } |\n`;
  });
  md += '\n';

  // Most Efficient Decks
  md += '## Top 10 Most Efficient Decks\n\n';
  md += 'Efficiency = Win Rate × Kills Per Game\n\n';
  md +=
    '| Rank | Commander | Pilot | Efficiency Score | Win Rate | Kills/Game |\n';
  md +=
    '|------|-----------|-------|------------------|----------|------------|\n';
  insights.playstylePatterns.topEfficient.forEach((d, i) => {
    const deck = insights.allDecks.find(
      (dd) => dd.commander === d.commander && dd.pilot === d.pilot
    );
    md += `| ${i + 1} | ${d.commander} | ${d.pilot} | ${d.winEfficiency.toFixed(
      3
    )} | ${(deck.winRate * 100).toFixed(1)}% | ${d.killsPerGame.toFixed(
      2
    )} |\n`;
  });
  md += '\n';

  // Correlations
  md += '## Statistical Correlations\n\n';
  md += `- ELO vs Win Rate: ${insights.commanderMeta.correlations.eloVsWinRate.toFixed(
    3
  )}\n`;
  md += `- ELO vs Games Played: ${insights.commanderMeta.correlations.eloVsGames.toFixed(
    3
  )}\n`;
  md += `- Win Rate vs Games Played: ${insights.commanderMeta.correlations.winRateVsGames.toFixed(
    3
  )}\n\n`;

  // Key Findings
  md += '## Key Findings\n\n';
  md += `- Total unique commanders: ${insights.commanderMeta.totalUniqueCommanders}\n`;
  md += `- Total decks: ${insights.commanderMeta.totalDecks}\n`;
  md += `- Total games played: ${insights.summary.totalGames}\n`;
  md += `- Overall win rate: ${(insights.summary.overallWinRate * 100).toFixed(
    1
  )}%\n`;
  md += `- Most popular playstyle: ${insights.playstylePatterns.playstyleDistribution[0].playstyle}\n`;

  if (insights.commanderMeta.outliers.length > 0) {
    md += '\n### Outliers (High ELO, Low Sample Size)\n\n';
    insights.commanderMeta.outliers.forEach((d) => {
      md += `- ${d.commander} (${d.pilot}): ELO ${d.elo} with only ${d.games} games\n`;
    });
  }

  return md;
}

async function main() {
  console.log('Loading data...');
  const dataPath = path.join(DATA_DIR, 'playgroup-data.json');
  const rawData = await fs.readFile(dataPath, 'utf-8');
  const decks = JSON.parse(rawData);

  console.log(`Analyzing ${decks.length} decks...`);

  // Run all analyses
  const playerPerformance = analyzePlayerPerformance(decks);
  const commanderMeta = analyzeCommanderMeta(decks);
  const playstylePatterns = analyzePlaystylePatterns(decks);

  // Summary stats
  const summary = {
    totalDecks: decks.length,
    totalGames: decks.reduce((sum, d) => sum + d.games, 0),
    totalWins: decks.reduce((sum, d) => sum + d.wins, 0),
    totalLosses: decks.reduce((sum, d) => sum + d.losses, 0),
    overallWinRate:
      decks.reduce((sum, d) => sum + d.wins, 0) /
      decks.reduce((sum, d) => sum + d.games, 0),
    avgElo: decks.reduce((sum, d) => sum + d.elo, 0) / decks.length,
    avgGamesPerDeck: decks.reduce((sum, d) => sum + d.games, 0) / decks.length,
  };

  const insights = {
    generatedAt: new Date().toISOString(),
    summary,
    playerPerformance,
    commanderMeta,
    playstylePatterns,
    allDecks: decks, // Include raw data for report generation
  };

  // Save insights JSON
  console.log('Generating insights...');
  const insightsPath = path.join(DATA_DIR, 'insights.json');
  await fs.writeFile(insightsPath, JSON.stringify(insights, null, 2));
  console.log(`Insights saved to ${insightsPath}`);

  // Generate markdown report
  console.log('Generating report...');
  const report = generateMarkdownReport(insights);
  const reportPath = path.join(DATA_DIR, 'report.md');
  await fs.writeFile(reportPath, report);
  console.log(`Report saved to ${reportPath}`);

  // Print summary to console
  console.log('\n=== SUMMARY ===');
  console.log(`Total Decks: ${summary.totalDecks}`);
  console.log(`Total Games: ${summary.totalGames}`);
  console.log(
    `Overall Win Rate: ${(summary.overallWinRate * 100).toFixed(1)}%`
  );
  console.log(`\nTop 3 Players by Win Rate:`);
  playerPerformance.playerRankings.slice(0, 3).forEach((p, i) => {
    console.log(
      `  ${i + 1}. ${p.pilot}: ${(p.overallWinRate * 100).toFixed(1)}% (${
        p.totalGames
      } games, ${p.deckCount} decks)`
    );
  });
  console.log(`\nTop 3 Commanders by ELO:`);
  commanderMeta.topByElo.slice(0, 3).forEach((d, i) => {
    console.log(
      `  ${i + 1}. ${d.commander} (${d.pilot}): ${d.elo} ELO, ${(
        d.winRate * 100
      ).toFixed(1)}% WR`
    );
  });
  console.log(`\nPlaystyle Distribution:`);
  playstylePatterns.playstyleDistribution.forEach((ps) => {
    console.log(
      `  ${ps.playstyle}: ${ps.count} decks (${(
        (ps.count / decks.length) *
        100
      ).toFixed(1)}%)`
    );
  });
  console.log(`\nFastest Winners (by avg win turn):`);
  playstylePatterns.fastestWinners.slice(0, 5).forEach((d, i) => {
    console.log(
      `  ${i + 1}. ${d.commander} (${d.pilot}): Turn ${d.avgWinTurn.toFixed(
        2
      )} avg, ${(d.winRate * 100).toFixed(1)}% WR, ${d.playstyle}`
    );
  });

  console.log('\nAnalysis complete!');
}

main();
