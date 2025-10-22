// Bracket Classification System for Commander Decks
// Classifies decks into power level brackets (1-5) based on performance metrics

/**
 * Normalize player/commander names for matching
 */
function normalizeName(name) {
  return name.toLowerCase().trim();
}

/**
 * Analyze win conditions for a specific deck from game data
 * @param {Array} deckGames - Array of games where this deck participated
 * @param {string} commander - Commander name
 * @param {string} pilot - Pilot name
 * @returns {Object} Win condition analysis
 */
function analyzeDeckWinConditions(deckGames, commander, pilot) {
  const winConditions = {};
  let totalWins = 0;
  let comboWins = 0;
  let infiniteWins = 0;
  let combatWins = 0;
  const winTurns = [];

  deckGames.forEach((game) => {
    const winner = game.players?.find((p) => p.result === 'winner');
    if (!winner) return;

    const isThisDeck =
      normalizeName(winner.commander) === normalizeName(commander) &&
      normalizeName(winner.playerName) === normalizeName(pilot);

    if (isThisDeck && winner.winCondition) {
      const winCon = winner.winCondition;
      winConditions[winCon] = (winConditions[winCon] || 0) + 1;
      totalWins++;

      // Track win turn if available
      if (game.metadata?.rounds) {
        winTurns.push(game.metadata.rounds);
      }

      // Categorize win types
      if (
        winCon.toLowerCase().includes('infinite') ||
        winCon.toLowerCase().includes('combo')
      ) {
        comboWins++;
        if (winCon.toLowerCase().includes('infinite')) {
          infiniteWins++;
        }
      } else if (winCon.toLowerCase().includes('combat')) {
        combatWins++;
      }
    }
  });

  // Determine primary win condition
  const primaryWinCondition =
    Object.entries(winConditions).length > 0
      ? Object.entries(winConditions).sort((a, b) => b[1] - a[1])[0][0]
      : 'Unknown';

  return {
    winConditions,
    totalWins,
    comboWins,
    infiniteWins,
    combatWins,
    primaryWinCondition,
    winTurns,
    avgWinTurnFromGames:
      winTurns.length > 0
        ? winTurns.reduce((a, b) => a + b, 0) / winTurns.length
        : null,
  };
}

/**
 * Calculate bracket based on turn speed and other metrics
 * @param {Object} metrics - Deck performance metrics
 * @returns {number} Bracket number (2-4, Brackets 1 and 5 disabled)
 */
function calculateBracket(metrics) {
  const {
    avgWinTurn,
    avgGameRounds,
    avgKillsPerGame,
    avgDamagePerGame,
    comboWins,
    totalWins,
    infiniteWins,
  } = metrics;

  // If deck has no wins, use game rounds as proxy
  const turnMetric = avgWinTurn > 0 ? avgWinTurn : avgGameRounds;

  // Bracket 4 (Optimized): Fast, lethal, consistent - includes infinite combos
  // NOTE: Bracket 5 (cEDH) is disabled - that's a distinct competitive metagame
  // "If you have to ask if you're playing cEDH, you're not playing cEDH"
  if (infiniteWins > 0 && totalWins > 0) {
    return 4; // Any infinite combo usage suggests high optimization
  }
  if (turnMetric < 6) {
    if (avgDamagePerGame > 70 || avgKillsPerGame >= 1.2) {
      return 4; // Fast with high lethality
    }
  }
  if (comboWins > 0 && totalWins > 0 && turnMetric < 7) {
    return 4; // Fast combo wins
  }

  // Bracket 3 (Upgraded): Strong synergy, powered cards
  if (turnMetric >= 6 && turnMetric < 8) {
    return 3; // Solid speed range
  }
  if (turnMetric < 9 && avgKillsPerGame >= 1.0) {
    return 3; // Reasonably fast with good efficiency
  }

  // Bracket 2 (Core): Default minimum bracket - focused but fair gameplay
  // NOTE: Bracket 1 (Exhibition) is disabled - all decks are at least Bracket 2
  // since true "theme decks" with substandard win conditions are rare in practice
  return 2;
}

/**
 * Calculate confidence level in the bracket assignment
 * @param {Object} deck - Deck data
 * @param {Array} deckGames - Games this deck played in
 * @param {Object} metrics - Calculated metrics
 * @param {number} bracket - Assigned bracket
 * @returns {string} "High" | "Medium" | "Low"
 */
function calculateConfidence(deck, deckGames, metrics, bracket) {
  const sampleSize = deck.games;
  const { avgWinTurn, winTurns, totalWins } = metrics;

  // Low confidence: Small sample size
  if (sampleSize < 5) {
    return 'Low';
  }

  // Low confidence: No wins to analyze
  if (totalWins === 0 && sampleSize < 10) {
    return 'Low';
  }

  // Check for borderline cases (metrics suggest it could be adjacent bracket)
  const turnMetric = avgWinTurn > 0 ? avgWinTurn : deck.avgGameRounds;
  const isBorderline =
    (bracket === 2 && (turnMetric < 8.5 || turnMetric >= 8.9)) ||
    (bracket === 3 && (turnMetric < 6.5 || turnMetric >= 7.5)) ||
    (bracket === 4 && turnMetric >= 5.5);

  if (isBorderline && sampleSize < 8) {
    return 'Medium';
  }

  // High confidence: Good sample size and clear metrics
  if (sampleSize >= 8 && totalWins >= 3) {
    return 'High';
  }

  // Medium confidence: Decent sample but some uncertainty
  if (sampleSize >= 5) {
    return 'Medium';
  }

  return 'Low';
}

/**
 * Generate human-readable reasoning for bracket assignment
 * @param {number} bracket - Assigned bracket
 * @param {Object} metrics - All metrics used
 * @param {Object} deck - Original deck data
 * @returns {Array<string>} Array of reasoning statements
 */
function generateReasoning(bracket, metrics, deck) {
  const reasoning = [];
  const {
    avgWinTurn,
    avgGameRounds,
    avgKillsPerGame,
    avgDamagePerGame,
    primaryWinCondition,
    comboWins,
    infiniteWins,
    totalWins,
    games,
  } = metrics;

  const bracketNames = {
    2: 'Core',
    3: 'Upgraded',
    4: 'Optimized',
  };

  // Turn speed reasoning
  if (avgWinTurn > 0) {
    reasoning.push(
      `Average win turn of ${avgWinTurn.toFixed(
        2
      )} suggests Bracket ${bracket} (${bracketNames[bracket]}) speed`
    );
  } else if (avgGameRounds > 0) {
    reasoning.push(
      `Average game length of ${avgGameRounds.toFixed(
        1
      )} rounds (no wins recorded) suggests Bracket ${bracket} (${
        bracketNames[bracket]
      })`
    );
  }

  // Efficiency reasoning
  if (avgKillsPerGame >= 1.2) {
    reasoning.push(
      `High kills per game (${avgKillsPerGame.toFixed(
        2
      )}) indicates efficient, proactive gameplay`
    );
  } else if (avgKillsPerGame < 0.8) {
    reasoning.push(
      `Low kills per game (${avgKillsPerGame.toFixed(
        2
      )}) suggests less explosive, incremental strategy`
    );
  }

  // Damage reasoning
  if (avgDamagePerGame > 80) {
    reasoning.push(
      `High damage output (${avgDamagePerGame.toFixed(
        1
      )} avg) indicates powerful threats`
    );
  } else if (avgDamagePerGame < 40 && avgDamagePerGame > 0) {
    reasoning.push(
      `Lower damage output (${avgDamagePerGame.toFixed(
        1
      )} avg) suggests incremental or alternative win strategies`
    );
  }

  // Win condition reasoning
  if (infiniteWins > 0 && totalWins > 0) {
    reasoning.push(
      `Infinite combo wins (${infiniteWins}/${totalWins}) indicate high-power combinations`
    );
  } else if (comboWins > 0 && totalWins > 0) {
    reasoning.push(
      `Combo-based wins (${comboWins}/${totalWins}) suggest synergistic gameplay`
    );
  } else if (primaryWinCondition && primaryWinCondition !== 'Unknown') {
    reasoning.push(
      `${primaryWinCondition}-focused win conditions align with Bracket ${bracket} power level`
    );
  }

  // Sample size reasoning
  if (games >= 8) {
    reasoning.push(`Sample size of ${games} games provides reliable data`);
  } else if (games >= 5) {
    reasoning.push(
      `Sample size of ${games} games provides moderate confidence`
    );
  } else {
    reasoning.push(
      `Limited sample size (${games} games) - classification may change with more data`
    );
  }

  // Win rate context
  if (deck.winRate >= 0.5) {
    reasoning.push(
      `Strong win rate (${(deck.winRate * 100).toFixed(
        1
      )}%) demonstrates deck effectiveness`
    );
  }

  return reasoning;
}

/**
 * Main classification function
 * @param {Object} deck - Deck data from playgroup-data.json
 * @param {Array} allGames - All games from games.json
 * @returns {Object} Classification result
 */
function classifyDeck(deck, allGames) {
  // Filter games where this deck participated
  const deckGames = allGames.filter((game) => {
    return game.players?.some(
      (p) =>
        normalizeName(p.commander) === normalizeName(deck.commander) &&
        normalizeName(p.playerName) === normalizeName(deck.pilot)
    );
  });

  // Analyze win conditions
  const winConditionAnalysis = analyzeDeckWinConditions(
    deckGames,
    deck.commander,
    deck.pilot
  );

  // Combine all metrics
  const metrics = {
    avgWinTurn: deck.avgWinTurn,
    avgGameRounds: deck.avgGameRounds,
    avgKillsPerGame: deck.avgKillsPerGame,
    avgDamagePerGame: deck.avgDamagePerGame,
    winRate: deck.winRate,
    games: deck.games,
    ...winConditionAnalysis,
  };

  // Calculate bracket
  const bracket = calculateBracket(metrics);

  // Calculate confidence
  const confidence = calculateConfidence(deck, deckGames, metrics, bracket);

  // Generate reasoning
  const reasoning = generateReasoning(bracket, metrics, deck);

  return {
    commander: deck.commander,
    pilot: deck.pilot,
    elo: deck.elo,
    link: deck.link,
    bracket,
    confidence,
    reasoning,
    metrics: {
      avgWinTurn: metrics.avgWinTurn,
      avgGameRounds: metrics.avgGameRounds,
      avgKillsPerGame: metrics.avgKillsPerGame,
      avgDamagePerGame: metrics.avgDamagePerGame,
      winRate: metrics.winRate,
      games: metrics.games,
      primaryWinCondition: metrics.primaryWinCondition,
      comboWins: metrics.comboWins,
      infiniteWins: metrics.infiniteWins,
    },
  };
}

/**
 * Classify all decks in the dataset
 * @param {Array} decks - Array of deck data
 * @param {Array} games - Array of game data
 * @returns {Array} Array of classifications
 */
function classifyAllDecks(decks, games) {
  return decks.map((deck) => classifyDeck(deck, games));
}

/**
 * Analyze bracket distribution and patterns
 * @param {Array} classifications - Array of deck classifications
 * @returns {Object} Bracket analysis
 */
function analyzeBracketDistribution(classifications) {
  const byBracket = { 2: [], 3: [], 4: [] };
  const byPlayer = {};
  const byConfidence = { High: [], Medium: [], Low: [] };

  classifications.forEach((c) => {
    byBracket[c.bracket].push(c);
    byConfidence[c.confidence].push(c);

    if (!byPlayer[c.pilot]) {
      byPlayer[c.pilot] = { 2: 0, 3: 0, 4: 0, total: 0 };
    }
    byPlayer[c.pilot][c.bracket]++;
    byPlayer[c.pilot].total++;
  });

  // Calculate player averages (Brackets 1 and 5 are disabled, range is 2-4)
  const playerBracketAvg = Object.entries(byPlayer).map(([pilot, brackets]) => {
    const avg =
      (brackets[2] * 2 + brackets[3] * 3 + brackets[4] * 4) / brackets.total;
    return {
      pilot,
      avgBracket: avg,
      distribution: { ...brackets },
    };
  });

  playerBracketAvg.sort((a, b) => b.avgBracket - a.avgBracket);

  return {
    byBracket,
    byConfidence,
    playerBracketAvg,
    summary: {
      totalDecks: classifications.length,
      bracket1: 0, // Disabled
      bracket2: byBracket[2].length,
      bracket3: byBracket[3].length,
      bracket4: byBracket[4].length,
      bracket5: 0, // Disabled
      highConfidence: byConfidence.High.length,
      mediumConfidence: byConfidence.Medium.length,
      lowConfidence: byConfidence.Low.length,
    },
  };
}

module.exports = {
  classifyDeck,
  classifyAllDecks,
  analyzeBracketDistribution,
  analyzeDeckWinConditions,
  calculateBracket,
  calculateConfidence,
  generateReasoning,
};
