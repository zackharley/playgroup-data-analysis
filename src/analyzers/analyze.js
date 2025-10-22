const fs = require('fs').promises;
const path = require('path');
const { parseTimeToSeconds } = require('../utils/helpers');
const { analyzeGames } = require('./game-analyzer');
const {
  classifyAllDecks,
  analyzeBracketDistribution,
} = require('./bracket-classifier');

const DATA_DIR = path.join(__dirname, '../../data');

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

  // Duplicate Commanders (filter out same pilot with multiple builds)
  const trueDuplicates = insights.commanderMeta.duplicateCommanders.filter(
    (dup) => {
      const uniquePilots = new Set(dup.pilots);
      return uniquePilots.size > 1; // Only show if different pilots
    }
  );

  if (trueDuplicates.length > 0) {
    md += '## Duplicate Commanders (Multiple Players)\n\n';
    trueDuplicates.forEach((dup) => {
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

  // Bracket Classification Section
  if (insights.bracketClassifications && insights.bracketAnalysis) {
    md += '\n---\n\n';
    md += '# Commander Bracket Classification\n\n';
    md +=
      '**[→ View Detailed Bracket Classifications (all decks with full reasoning)](./bracket-details.md)**\n\n';

    const ba = insights.bracketAnalysis;

    // Overall distribution
    md += '## Bracket Distribution\n\n';
    md += '| Bracket | Name | Count | Percentage |\n';
    md += '|---------|------|-------|------------|\n';
    const bracketNames = {
      2: 'Core',
      3: 'Upgraded',
      4: 'Optimized',
    };
    // Note: Brackets 1 (Exhibition) and 5 (cEDH) are disabled
    // Range is 2-4 for regular casual-to-high-power Commander
    for (let i = 2; i <= 4; i++) {
      const count = ba.summary[`bracket${i}`];
      const pct = ((count / ba.summary.totalDecks) * 100).toFixed(1);
      md += `| ${i} | ${bracketNames[i]} | ${count} | ${pct}% |\n`;
    }
    md += '\n';

    // Confidence distribution
    md += '## Classification Confidence\n\n';
    md += '| Confidence | Count | Percentage |\n';
    md += '|------------|-------|------------|\n';
    ['High', 'Medium', 'Low'].forEach((conf) => {
      const count = ba.summary[`${conf.toLowerCase()}Confidence`];
      const pct = ((count / ba.summary.totalDecks) * 100).toFixed(1);
      md += `| ${conf} | ${count} | ${pct}% |\n`;
    });
    md += '\n';

    // Player bracket analysis
    if (ba.playerBracketAvg.length > 0) {
      md += '## Player Bracket Tendencies\n\n';
      md +=
        '| Rank | Player | Avg Bracket | Bracket 2 | Bracket 3 | Bracket 4 |\n';
      md +=
        '|------|--------|-------------|-----------|-----------|----------|\n';
      ba.playerBracketAvg.forEach((p, i) => {
        md += `| ${i + 1} | ${p.pilot} | ${p.avgBracket.toFixed(2)} | ${
          p.distribution[2]
        } | ${p.distribution[3]} | ${p.distribution[4]} |\n`;
      });
      md += '\n';
    }

    // Bracket 4 decks (Optimized) - highest power level we classify
    if (ba.byBracket[4] && ba.byBracket[4].length > 0) {
      md += '## Bracket 4: Optimized Decks (Highest Power)\n\n';
      md +=
        '| Commander | Pilot | Confidence | ELO | Avg Win Turn | Win Rate |\n';
      md +=
        '|-----------|-------|------------|-----|--------------|----------|\n';
      ba.byBracket[4].forEach((c) => {
        md += `| ${c.commander} | ${c.pilot} | ${c.confidence} | ${c.elo} | ${
          c.metrics.avgWinTurn > 0 ? c.metrics.avgWinTurn.toFixed(2) : 'N/A'
        } | ${(c.metrics.winRate * 100).toFixed(1)}% |\n`;
      });
      md += '\n';
    }

    // Full classification table (top 30 by ELO)
    md += '## Full Deck Classifications (Top 30 by ELO)\n\n';
    md +=
      '| Rank | Commander | Pilot | Bracket | Confidence | ELO | Win Turn | Win Rate |\n';
    md +=
      '|------|-----------|-------|---------|------------|-----|----------|----------|\n';
    const sortedByElo = [...insights.bracketClassifications].sort(
      (a, b) => b.elo - a.elo
    );
    sortedByElo.slice(0, 30).forEach((c, i) => {
      md += `| ${i + 1} | ${c.commander} | ${c.pilot} | ${c.bracket} | ${
        c.confidence
      } | ${c.elo} | ${
        c.metrics.avgWinTurn > 0 ? c.metrics.avgWinTurn.toFixed(2) : 'N/A'
      } | ${(c.metrics.winRate * 100).toFixed(1)}% |\n`;
    });
    md += '\n';

    // Borderline/Low confidence cases for review
    const borderlineCases = insights.bracketClassifications.filter(
      (c) => c.confidence === 'Low' || c.confidence === 'Medium'
    );
    if (borderlineCases.length > 0) {
      md += '## Borderline Cases Requiring Review\n\n';
      md +=
        'These decks have Medium or Low confidence classifications and may benefit from more games or manual review.\n\n';
      md +=
        '| Commander | Pilot | Bracket | Confidence | Games | Primary Reason |\n';
      md +=
        '|-----------|-------|---------|------------|-------|----------------|\n';
      borderlineCases.slice(0, 20).forEach((c) => {
        const primaryReason = c.reasoning[0] || 'Limited data';
        md += `| ${c.commander} | ${c.pilot} | ${c.bracket} | ${c.confidence} | ${c.metrics.games} | ${primaryReason} |\n`;
      });
      md += '\n';
    }

    md +=
      '*For full reasoning, metrics, and confidence levels for all decks, see [bracket-details.md](./bracket-details.md)*\n\n';
  }

  // Game Analysis Section
  if (insights.gameAnalysis) {
    md += '\n---\n\n';
    md += '# Game Data Analysis\n\n';

    const ga = insights.gameAnalysis;
    const isGuest = (name) => name.toLowerCase().startsWith('guest ');

    // Game Summary
    md += '## Game Summary\n\n';
    md += `- Total games analyzed: ${ga.summary.totalValidGames}\n`;
    md += `- Average duration: ${ga.summary.avgDuration}\n`;
    md += `- Average rounds: ${ga.summary.avgRounds}\n`;
    md += `- Average fun rating: ${ga.summary.avgFunRating}/5\n\n`;

    // Nemesis Pairs
    if (ga.headToHead.topNemesisPairs.length > 0) {
      md += '## Top Nemesis Pairs (Who Eliminates Who)\n\n';
      md += '| Killer | Victim | Eliminations |\n';
      md += '|--------|--------|-------------|\n';
      ga.headToHead.topNemesisPairs.forEach((n) => {
        md += `| ${n.killer} | ${n.victim} | ${n.eliminations} |\n`;
      });
      md += '\n';
    }

    // Frequent Opponents
    if (ga.headToHead.topFrequentOpponents.length > 0) {
      md += '## Most Frequent Opponents (Who Plays Together Most)\n\n';
      md += '| Player 1 | Player 2 | Games Together |\n';
      md += '|----------|----------|----------------|\n';
      ga.headToHead.topFrequentOpponents.forEach((o) => {
        md += `| ${o.player1} | ${o.player2} | ${o.gamesPlayed} |\n`;
      });
      md += '\n';
    }

    // Commander Matchups
    if (ga.headToHead.topCommanderMatchups.length > 0) {
      md += '## Top Commander Matchups (min 3 games)\n\n';
      md += '| Commander 1 | Commander 2 | Games | C1 Wins | C2 Wins |\n';
      md += '|-------------|-------------|-------|---------|----------|\n';
      ga.headToHead.topCommanderMatchups.forEach((m) => {
        md += `| ${m.commander1} | ${m.commander2} | ${m.games} | ${m.commander1Wins} | ${m.commander2Wins} |\n`;
      });
      md += '\n';
    }

    // Win Conditions
    if (ga.winConditions.distribution.length > 0) {
      md += '## Win Condition Distribution\n\n';
      md += '| Condition | Count | Percentage |\n';
      md += '|-----------|-------|------------|\n';
      ga.winConditions.distribution.forEach((wc) => {
        md += `| ${wc.condition} | ${wc.count} | ${wc.percentage.toFixed(
          1
        )}% |\n`;
      });
      md += '\n';

      // Win conditions by player (non-guests only)
      const playerWinConditions = Object.entries(ga.winConditions.byPlayer)
        .filter(([player]) => !isGuest(player))
        .map(([player, conditions]) => {
          const total = Object.values(conditions).reduce((a, b) => a + b, 0);
          const topCondition = Object.entries(conditions).sort(
            (a, b) => b[1] - a[1]
          )[0];
          return {
            player,
            topCondition: topCondition[0],
            count: topCondition[1],
            total,
          };
        })
        .sort((a, b) => b.total - a.total);

      if (playerWinConditions.length > 0) {
        md += '### Win Conditions by Player\n\n';
        md += '| Player | Total Wins | Favorite Win Con | Count |\n';
        md += '|--------|------------|------------------|-------|\n';
        playerWinConditions.forEach((p) => {
          md += `| ${p.player} | ${p.total} | ${p.topCondition} | ${p.count} |\n`;
        });
        md += '\n';
      }
    }

    // Player Turn Speed (filter guests, show all)
    const turnSpeedsFiltered = ga.playerBehavior.turnSpeed.filter(
      (p) => !isGuest(p.player)
    );

    if (turnSpeedsFiltered.length > 0) {
      md += '## Player Turn Speed (excluding guests)\n\n';
      md += '| Rank | Player | Avg Turn Time | Games |\n';
      md += '|------|--------|---------------|-------|\n';
      turnSpeedsFiltered.forEach((p, i) => {
        const mins = Math.floor(p.avgTurnSeconds / 60);
        const secs = Math.floor(p.avgTurnSeconds % 60);
        md += `| ${i + 1} | ${p.player} | ${mins}:${String(secs).padStart(
          2,
          '0'
        )} | ${p.games} |\n`;
      });
      md += '\n';
    }

    // Damage Leaders (filter guests, show infinite separately)
    const damageLeadersFiltered = ga.damagePatterns.damageEfficiency.filter(
      (p) => !isGuest(p.player)
    );

    if (damageLeadersFiltered.length > 0) {
      md += '## Damage Leaders (excluding guests)\n\n';
      md +=
        '| Rank | Player | Total Damage | Avg/Game | Max Single Game | Cmdr Dmg % |\n';
      md +=
        '|------|--------|--------------|----------|-----------------|------------|\n';
      damageLeadersFiltered.slice(0, 10).forEach((p, i) => {
        const maxDmg = p.maxSingleGame > 1000000 ? 'Infinite' : p.maxSingleGame;
        md += `| ${i + 1} | ${p.player} | ${
          p.totalDamage
        } | ${p.avgDamagePerGame.toFixed(
          1
        )} | ${maxDmg} | ${p.commanderDamagePct.toFixed(1)}% |\n`;
      });
      md += '\n';

      // Show players with infinite games separately
      const infinitePlayers = damageLeadersFiltered.filter(
        (p) => p.hasInfinite
      );
      if (infinitePlayers.length > 0) {
        md +=
          '*Note: Players with infinite combo games have their totals/averages excluded from rankings but infinite damage is shown in "Max Single Game"*\n\n';
      }
    }

    // Biggest Swings
    if (ga.damagePatterns.topSwings.length > 0) {
      md += '## Top 10 Biggest Swings\n\n';
      md += '| Rank | Attacker | Target | Damage | Game | Date |\n';
      md += '|------|----------|--------|--------|------|------|\n';
      ga.damagePatterns.topSwings.slice(0, 10).forEach((s, i) => {
        md += `| ${i + 1} | ${s.attacker} | ${s.target} | ${s.damage} | #${
          s.gameId
        } | ${s.date} |\n`;
      });
      md += '\n';
    }

    // Average Mood Scores (filter guests)
    const avgMoodFiltered = ga.playerBehavior.avgMoodScores.filter(
      (p) => !isGuest(p.player)
    );
    if (avgMoodFiltered.length > 0) {
      md += '## Average Player Mood (1-5 scale, excluding guests)\n\n';
      md += '| Rank | Player | Avg Mood Score | Games |\n';
      md += '|------|--------|----------------|-------|\n';
      avgMoodFiltered.forEach((p, i) => {
        md += `| ${i + 1} | ${p.player} | ${p.avgMoodScore.toFixed(2)}/5 | ${
          p.gamesWithMood
        } |\n`;
      });
      md += '\n';
      md +=
        '*Mood Scale: 1=Very disappointed, 2=Disappointed, 3=Indifferent, 4=Excited, 5=Happy*\n\n';
    }

    // Salt Analysis (filter guests)
    const saltStatsFiltered = ga.playerBehavior.saltStats.filter(
      (p) => !isGuest(p.player) && p.totalSaltyGames > 0
    );
    if (saltStatsFiltered.length > 0) {
      md += '## Salt Analysis (excluding guests)\n\n';
      md +=
        '| Rank | Player | Salty Games | Somewhat | Extremely | Salt Rate |\n';
      md +=
        '|------|--------|-------------|----------|-----------|----------|\n';
      saltStatsFiltered.forEach((p, i) => {
        md += `| ${i + 1} | ${p.player} | ${p.totalSaltyGames} | ${
          p.somewhatSalty
        } | ${p.extremelySalty} | ${(p.saltRate * 100).toFixed(1)}% |\n`;
      });
      md += '\n';
    }

    // Targeting Patterns (top damage dealers to specific opponents)
    const targetingData = [];
    Object.entries(ga.playerBehavior.targetingPatterns || {}).forEach(
      ([attacker, targets]) => {
        if (isGuest(attacker)) return;
        Object.entries(targets).forEach(([target, stats]) => {
          if (isGuest(target)) return;
          if (stats.totalDamage > 0 && stats.encounters >= 5) {
            targetingData.push({
              attacker,
              target,
              totalDamage: stats.totalDamage,
              encounters: stats.encounters,
              avgDamage: stats.totalDamage / stats.encounters,
            });
          }
        });
      }
    );

    if (targetingData.length > 0) {
      const topTargeting = targetingData
        .sort((a, b) => b.totalDamage - a.totalDamage)
        .slice(0, 10);
      md +=
        '## Top Targeting Patterns (min 5 encounters, excluding guests)\n\n';
      md += '| Attacker | Target | Total Damage | Games | Avg Damage/Game |\n';
      md += '|----------|--------|--------------|-------|----------------|\n';
      topTargeting.forEach((t) => {
        md += `| ${t.attacker} | ${t.target} | ${t.totalDamage} | ${
          t.encounters
        } | ${t.avgDamage.toFixed(1)} |\n`;
      });
      md += '\n';
    }

    // Data Quality Note
    md += '## Data Quality Notes\n\n';
    const unknownWinCons = ga.winConditions.distribution.find(
      (w) => w.condition === 'Unknown'
    );
    if (unknownWinCons) {
      md += `- ${
        unknownWinCons.count
      } games (${unknownWinCons.percentage.toFixed(
        1
      )}%) have unknown win conditions\n`;
    }
    md += `- ${ga.summary.totalValidGames} of ${
      insights.gameAnalysis ? '129' : '0'
    } games have complete data\n`;
    md +=
      '- Guest players are excluded from rankings but included in overall statistics\n';
    md +=
      '- Infinite combo damage values are flagged and displayed separately\n';
  }

  return md;
}

// Generate detailed bracket classification report
function generateBracketDetailsReport(classifications, analysis) {
  let md = '# Commander Bracket Classification - Detailed Report\n\n';
  md += `Generated: ${new Date().toLocaleString()}\n\n`;
  md += `**[← Back to Main Report](./report.md)**\n\n`;

  md += '## Overview\n\n';
  md += `This report contains detailed bracket classifications for all ${classifications.length} decks, including:\n`;
  md += '- Full reasoning for each bracket assignment\n';
  md += '- Confidence levels and what they mean\n';
  md += '- Complete metrics breakdown\n';
  md += '- Win condition analysis\n\n';

  // Summary stats
  md += '## Summary Statistics\n\n';
  md += '| Bracket | Name | Count | Percentage |\n';
  md += '|---------|------|-------|------------|\n';
  const bracketNames = { 2: 'Core', 3: 'Upgraded', 4: 'Optimized' };
  for (let i = 2; i <= 4; i++) {
    const count = analysis.summary[`bracket${i}`];
    const pct = ((count / analysis.summary.totalDecks) * 100).toFixed(1);
    md += `| ${i} | ${bracketNames[i]} | ${count} | ${pct}% |\n`;
  }
  md += '\n';

  md += '**Confidence Distribution:**\n';
  md += `- High Confidence: ${analysis.summary.highConfidence} decks (${(
    (analysis.summary.highConfidence / analysis.summary.totalDecks) *
    100
  ).toFixed(1)}%)\n`;
  md += `- Medium Confidence: ${analysis.summary.mediumConfidence} decks (${(
    (analysis.summary.mediumConfidence / analysis.summary.totalDecks) *
    100
  ).toFixed(1)}%)\n`;
  md += `- Low Confidence: ${analysis.summary.lowConfidence} decks (${(
    (analysis.summary.lowConfidence / analysis.summary.totalDecks) *
    100
  ).toFixed(1)}%)\n\n`;

  // Confidence level explanations
  md += '## Understanding Confidence Levels\n\n';
  md +=
    '**High Confidence**: 8+ games played with clear, consistent metrics. These classifications are reliable.\n\n';
  md +=
    '**Medium Confidence**: 5-7 games played OR borderline metrics between brackets. May shift with more data.\n\n';
  md +=
    '**Low Confidence**: <5 games played OR contradictory signals. Treat as preliminary estimates.\n\n';

  md += '---\n\n';

  // Bracket 4 decks (if any)
  const bracket4Decks = classifications.filter((c) => c.bracket === 4);
  if (bracket4Decks.length > 0) {
    md += '## Bracket 4: Optimized (Highest Power)\n\n';
    bracket4Decks
      .sort((a, b) => b.elo - a.elo)
      .forEach((deck) => {
        md += generateDeckDetailSection(deck);
      });
  }

  // Bracket 3 decks
  const bracket3Decks = classifications.filter((c) => c.bracket === 3);
  if (bracket3Decks.length > 0) {
    md += '## Bracket 3: Upgraded\n\n';
    bracket3Decks
      .sort((a, b) => b.elo - a.elo)
      .forEach((deck) => {
        md += generateDeckDetailSection(deck);
      });
  }

  // Bracket 2 decks
  const bracket2Decks = classifications.filter((c) => c.bracket === 2);
  if (bracket2Decks.length > 0) {
    md += '## Bracket 2: Core\n\n';
    bracket2Decks
      .sort((a, b) => b.elo - a.elo)
      .forEach((deck) => {
        md += generateDeckDetailSection(deck);
      });
  }

  return md;
}

// Helper function to generate detailed section for a single deck
function generateDeckDetailSection(deck) {
  let md = `### ${deck.commander} (${deck.pilot})\n\n`;

  // Header info
  md += `**Bracket:** ${deck.bracket} | **Confidence:** ${deck.confidence} | **ELO:** ${deck.elo}\n\n`;

  // Reasoning
  md += '**Classification Reasoning:**\n\n';
  deck.reasoning.forEach((reason) => {
    md += `- ${reason}\n`;
  });
  md += '\n';

  // Key Metrics
  md += '**Key Metrics:**\n\n';
  md += '| Metric | Value |\n';
  md += '|--------|-------|\n';
  md += `| Games Played | ${deck.metrics.games} |\n`;
  md += `| Win Rate | ${(deck.metrics.winRate * 100).toFixed(1)}% |\n`;
  md += `| Avg Win Turn | ${
    deck.metrics.avgWinTurn > 0 ? deck.metrics.avgWinTurn.toFixed(2) : 'N/A'
  } |\n`;
  md += `| Avg Game Rounds | ${deck.metrics.avgGameRounds.toFixed(1)} |\n`;
  md += `| Kills Per Game | ${deck.metrics.avgKillsPerGame.toFixed(2)} |\n`;
  md += `| Damage Per Game | ${deck.metrics.avgDamagePerGame.toFixed(1)} |\n`;
  md += `| Primary Win Condition | ${deck.metrics.primaryWinCondition} |\n`;
  if (deck.metrics.comboWins > 0) {
    md += `| Combo Wins | ${deck.metrics.comboWins} (${deck.metrics.infiniteWins} infinite) |\n`;
  }
  md += '\n';

  // Deck link
  if (deck.link) {
    md += `[View Deck on Playgroup.gg](${deck.link})\n\n`;
  }

  md += '---\n\n';

  return md;
}

async function analyze() {
  console.log('Loading data...');
  const deckDataPath = path.join(DATA_DIR, 'playgroup-data.json');
  const deckRawData = await fs.readFile(deckDataPath, 'utf-8');
  const decks = JSON.parse(deckRawData);

  console.log(`Analyzing ${decks.length} decks...`);

  // Run deck analyses
  const playerPerformance = analyzePlayerPerformance(decks);
  const commanderMeta = analyzeCommanderMeta(decks);
  const playstylePatterns = analyzePlaystylePatterns(decks);

  // Load and analyze games if available
  let gameAnalysis = null;
  let bracketClassifications = null;
  let bracketAnalysis = null;
  const gamesDataPath = path.join(DATA_DIR, 'games.json');
  try {
    const gamesRawData = await fs.readFile(gamesDataPath, 'utf-8');
    const games = JSON.parse(gamesRawData);
    console.log(`Analyzing ${games.length} games...`);
    gameAnalysis = analyzeGames(games);

    // Classify decks into brackets
    console.log(`Classifying ${decks.length} decks into brackets...`);
    bracketClassifications = classifyAllDecks(decks, games);
    bracketAnalysis = analyzeBracketDistribution(bracketClassifications);
  } catch (error) {
    console.log('Error loading/analyzing games:', error.message);
    console.log('Skipping game analysis and bracket classification...');
  }

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
    gameAnalysis,
    bracketClassifications,
    bracketAnalysis,
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

  // Generate detailed bracket classification report
  if (bracketClassifications) {
    console.log('Generating detailed bracket report...');
    const bracketReport = generateBracketDetailsReport(
      bracketClassifications,
      bracketAnalysis
    );
    const bracketReportPath = path.join(DATA_DIR, 'bracket-details.md');
    await fs.writeFile(bracketReportPath, bracketReport);
    console.log(`Bracket details saved to ${bracketReportPath}`);
  }

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

  // Game Analysis Summary
  if (gameAnalysis) {
    console.log('\n=== GAME ANALYSIS ===');
    console.log(`Total Games: ${gameAnalysis.summary.totalValidGames}`);
    console.log(`Avg Duration: ${gameAnalysis.summary.avgDuration}`);
    console.log(`Avg Rounds: ${gameAnalysis.summary.avgRounds}`);
    console.log(`Avg Fun Rating: ${gameAnalysis.summary.avgFunRating}/5`);

    if (gameAnalysis.winConditions.distribution.length > 0) {
      console.log(`\nWin Condition Distribution:`);
      gameAnalysis.winConditions.distribution.slice(0, 3).forEach((wc) => {
        console.log(
          `  ${wc.condition}: ${wc.count} games (${wc.percentage.toFixed(1)}%)`
        );
      });
    }

    if (gameAnalysis.headToHead.topNemesisPairs.length > 0) {
      console.log(`\nTop Nemesis Pair:`);
      const top = gameAnalysis.headToHead.topNemesisPairs[0];
      console.log(
        `  ${top.killer} has eliminated ${top.victim} ${top.eliminations} times`
      );
    }

    if (gameAnalysis.headToHead.topFrequentOpponents.length > 0) {
      console.log(`\nMost Frequent Opponents:`);
      const top = gameAnalysis.headToHead.topFrequentOpponents[0];
      console.log(
        `  ${top.player1} & ${top.player2}: ${top.gamesPlayed} games together`
      );
    }

    if (gameAnalysis.damagePatterns.damageEfficiency.length > 0) {
      console.log(`\nTop Damage Dealer:`);
      const top = gameAnalysis.damagePatterns.damageEfficiency[0];
      console.log(
        `  ${top.player}: ${
          top.totalDamage
        } total damage (${top.avgDamagePerGame.toFixed(1)} avg/game)`
      );
    }
  }

  // Bracket Classification Summary
  if (bracketAnalysis) {
    console.log('\n=== BRACKET CLASSIFICATION ===');
    console.log(
      `Total Decks Classified: ${bracketAnalysis.summary.totalDecks}`
    );
    console.log(`\nBracket Distribution:`);
    const bracketNames = {
      2: 'Core',
      3: 'Upgraded',
      4: 'Optimized',
    };
    // Note: Brackets 1 (Exhibition) and 5 (cEDH) are disabled
    // Range is 2-4 for regular casual-to-high-power Commander
    for (let i = 2; i <= 4; i++) {
      const count = bracketAnalysis.summary[`bracket${i}`];
      const pct = ((count / bracketAnalysis.summary.totalDecks) * 100).toFixed(
        1
      );
      console.log(
        `  Bracket ${i} (${bracketNames[i]}): ${count} decks (${pct}%)`
      );
    }
    console.log(`\nConfidence Distribution:`);
    console.log(
      `  High: ${bracketAnalysis.summary.highConfidence} decks (${(
        (bracketAnalysis.summary.highConfidence /
          bracketAnalysis.summary.totalDecks) *
        100
      ).toFixed(1)}%)`
    );
    console.log(
      `  Medium: ${bracketAnalysis.summary.mediumConfidence} decks (${(
        (bracketAnalysis.summary.mediumConfidence /
          bracketAnalysis.summary.totalDecks) *
        100
      ).toFixed(1)}%)`
    );
    console.log(
      `  Low: ${bracketAnalysis.summary.lowConfidence} decks (${(
        (bracketAnalysis.summary.lowConfidence /
          bracketAnalysis.summary.totalDecks) *
        100
      ).toFixed(1)}%)`
    );

    if (bracketAnalysis.playerBracketAvg.length > 0) {
      console.log(`\nTop 3 Players by Average Bracket:`);
      bracketAnalysis.playerBracketAvg.slice(0, 3).forEach((p, i) => {
        console.log(
          `  ${i + 1}. ${p.pilot}: Avg Bracket ${p.avgBracket.toFixed(2)}`
        );
      });
    }
  }

  console.log('\nAnalysis complete!');
}

module.exports = {
  analyze,
};

// Allow standalone execution
if (require.main === module) {
  analyze();
}
