const { parseTimeToSeconds } = require('../utils/helpers');

// Normalize player names (handle case variations)
function normalizeName(name) {
  return name.toLowerCase().trim();
}

// Check if player is a guest
function isGuest(playerName) {
  return normalizeName(playerName).startsWith('guest ');
}

// 1. Head-to-Head Analysis
function analyzeHeadToHead(games) {
  const playerVsPlayer = {};
  const commanderMatchups = {};
  const nemesisPairs = {}; // Who eliminates who most often
  const frequentOpponents = {}; // Who plays together most

  games.forEach((game) => {
    if (!game.players || game.players.length === 0) return;

    const winner = game.players.find((p) => p.result === 'winner');
    if (!winner) return;

    const winnerName = normalizeName(winner.playerName);
    const winnerCommander = winner.commander;

    // Track frequent opponents (all players in this game)
    const playerNames = game.players
      .map((p) => normalizeName(p.playerName))
      .sort();
    for (let i = 0; i < playerNames.length; i++) {
      for (let j = i + 1; j < playerNames.length; j++) {
        const key = `${playerNames[i]} & ${playerNames[j]}`;
        if (!frequentOpponents[key]) {
          frequentOpponents[key] = {
            player1: playerNames[i],
            player2: playerNames[j],
            gamesPlayed: 0,
          };
        }
        frequentOpponents[key].gamesPlayed++;
      }
    }

    game.players.forEach((player) => {
      if (player.result !== 'winner') {
        const loserName = normalizeName(player.playerName);
        const loserCommander = player.commander;

        // Track nemesis relationships (who killed who)
        if (player.killedBy && player.killedBy !== 'Unknown') {
          const killerName = normalizeName(player.killedBy);
          const nemesisKey = `${killerName} → ${loserName}`;
          if (!nemesisPairs[nemesisKey]) {
            nemesisPairs[nemesisKey] = {
              killer: killerName,
              victim: loserName,
              eliminations: 0,
            };
          }
          nemesisPairs[nemesisKey].eliminations++;
        }

        // Player vs Player
        const matchupKey = [winnerName, loserName].sort().join(' vs ');
        if (!playerVsPlayer[matchupKey]) {
          playerVsPlayer[matchupKey] = {
            player1:
              winnerName === [winnerName, loserName].sort()[0]
                ? winnerName
                : loserName,
            player2:
              winnerName === [winnerName, loserName].sort()[1]
                ? winnerName
                : loserName,
            player1Wins: 0,
            player2Wins: 0,
            games: 0,
          };
        }
        playerVsPlayer[matchupKey].games++;
        if (winnerName === playerVsPlayer[matchupKey].player1) {
          playerVsPlayer[matchupKey].player1Wins++;
        } else {
          playerVsPlayer[matchupKey].player2Wins++;
        }

        // Commander Matchups
        const cmdMatchupKey = [winnerCommander, loserCommander]
          .sort()
          .join(' vs ');
        if (!commanderMatchups[cmdMatchupKey]) {
          commanderMatchups[cmdMatchupKey] = {
            commander1: [winnerCommander, loserCommander].sort()[0],
            commander2: [winnerCommander, loserCommander].sort()[1],
            commander1Wins: 0,
            commander2Wins: 0,
            games: 0,
          };
        }
        commanderMatchups[cmdMatchupKey].games++;
        if (winnerCommander === commanderMatchups[cmdMatchupKey].commander1) {
          commanderMatchups[cmdMatchupKey].commander1Wins++;
        } else {
          commanderMatchups[cmdMatchupKey].commander2Wins++;
        }
      }
    });
  });

  // Top nemesis pairs (who eliminates who most, excluding guests)
  const topNemesisPairs = Object.values(nemesisPairs)
    .filter((n) => !isGuest(n.killer) && !isGuest(n.victim))
    .filter((n) => n.eliminations >= 3)
    .sort((a, b) => b.eliminations - a.eliminations)
    .slice(0, 10);

  // Most frequent opponents (excluding guests, min 10 games together)
  const topFrequentOpponents = Object.values(frequentOpponents)
    .filter((o) => !isGuest(o.player1) && !isGuest(o.player2))
    .filter((o) => o.gamesPlayed >= 10)
    .sort((a, b) => b.gamesPlayed - a.gamesPlayed)
    .slice(0, 10);

  // Top commander matchups (min 3 games)
  const topCommanderMatchups = Object.values(commanderMatchups)
    .filter((m) => m.games >= 3)
    .sort((a, b) => b.games - a.games)
    .slice(0, 15);

  return {
    playerVsPlayer,
    commanderMatchups,
    nemesisPairs,
    topNemesisPairs,
    frequentOpponents,
    topFrequentOpponents,
    topCommanderMatchups,
  };
}

// 2. Win Condition Analysis
function analyzeWinConditions(games) {
  const distribution = {};
  const byPlayer = {};
  const byCommander = {};

  games.forEach((game) => {
    const winner = game.players?.find((p) => p.result === 'winner');
    if (!winner || !winner.winCondition) return;

    const winCon = winner.winCondition;
    const player = normalizeName(winner.playerName);
    const commander = winner.commander;

    // Overall distribution
    distribution[winCon] = (distribution[winCon] || 0) + 1;

    // By player
    if (!byPlayer[player]) byPlayer[player] = {};
    byPlayer[player][winCon] = (byPlayer[player][winCon] || 0) + 1;

    // By commander
    if (!byCommander[commander]) byCommander[commander] = {};
    byCommander[commander][winCon] = (byCommander[commander][winCon] || 0) + 1;
  });

  // Calculate percentages
  const total = Object.values(distribution).reduce((a, b) => a + b, 0);
  const distributionWithPercent = Object.entries(distribution).map(
    ([condition, count]) => ({
      condition,
      count,
      percentage: (count / total) * 100,
    })
  );

  return {
    distribution: distributionWithPercent,
    byPlayer,
    byCommander,
    totalGamesWithWinCon: total,
  };
}

// 3. Player Behavior Analysis
function analyzePlayerBehavior(games) {
  const moodsByPlayer = {};
  const moodsByOutcome = { winner: {}, eliminated: {} };
  const turnTimes = {};
  const targetingPatterns = {};

  games.forEach((game) => {
    game.players?.forEach((player) => {
      const playerName = normalizeName(player.playerName);
      const mood = player.mood || 'Unknown';

      // Moods by player
      if (!moodsByPlayer[playerName]) moodsByPlayer[playerName] = {};
      moodsByPlayer[playerName][mood] =
        (moodsByPlayer[playerName][mood] || 0) + 1;

      // Moods by outcome
      const outcome = player.result === 'winner' ? 'winner' : 'eliminated';
      moodsByOutcome[outcome][mood] = (moodsByOutcome[outcome][mood] || 0) + 1;

      // Turn times
      if (player.avgTurn && player.avgTurn !== '00:00') {
        if (!turnTimes[playerName]) turnTimes[playerName] = [];
        turnTimes[playerName].push(parseTimeToSeconds(player.avgTurn));
      }
    });

    // Targeting patterns from damage matrices
    if (game.damageMatrices?.total && game.players?.length === 4) {
      game.players.forEach((attacker, i) => {
        const attackerName = normalizeName(attacker.playerName);
        if (!targetingPatterns[attackerName]) {
          targetingPatterns[attackerName] = {};
        }

        game.players.forEach((target, j) => {
          if (i !== j) {
            const targetName = normalizeName(target.playerName);
            const damage = game.damageMatrices.total[i]?.[j] || 0;

            if (!targetingPatterns[attackerName][targetName]) {
              targetingPatterns[attackerName][targetName] = {
                totalDamage: 0,
                encounters: 0,
              };
            }
            targetingPatterns[attackerName][targetName].totalDamage += damage;
            targetingPatterns[attackerName][targetName].encounters++;
          }
        });
      });
    }
  });

  // Calculate average turn times
  const avgTurnTimes = Object.entries(turnTimes).map(([player, times]) => ({
    player,
    avgTurnSeconds: times.reduce((a, b) => a + b, 0) / times.length,
    games: times.length,
  }));

  avgTurnTimes.sort((a, b) => a.avgTurnSeconds - b.avgTurnSeconds);

  // Most common moods per player
  const playerMoodProfiles = Object.entries(moodsByPlayer).map(
    ([player, moods]) => {
      const total = Object.values(moods).reduce((a, b) => a + b, 0);
      const sortedMoods = Object.entries(moods)
        .map(([mood, count]) => ({
          mood,
          count,
          percentage: (count / total) * 100,
        }))
        .sort((a, b) => b.count - a.count);

      return {
        player,
        mostCommonMood: sortedMoods[0]?.mood || 'Unknown',
        moodDistribution: sortedMoods,
      };
    }
  );

  return {
    moodsByPlayer,
    moodsByOutcome,
    playerMoodProfiles,
    turnSpeed: avgTurnTimes, // Return all players, already sorted fastest to slowest
    targetingPatterns,
  };
}

// 4. Game Tempo & Meta Analysis
function analyzeGameMeta(games) {
  const validGames = games.filter(
    (g) => g.metadata?.duration && g.metadata.duration !== null
  );

  const durations = [];
  const rounds = [];
  const funRatings = [];
  const funByPlayer = {};
  const funByCommander = {};

  validGames.forEach((game) => {
    if (game.metadata.duration) {
      durations.push(parseTimeToSeconds(game.metadata.duration));
    }
    if (game.metadata.rounds) {
      rounds.push(game.metadata.rounds);
    }
    if (game.metadata.avgFun && game.metadata.avgFun > 0) {
      funRatings.push(game.metadata.avgFun);

      // Fun by player
      game.players?.forEach((player) => {
        const playerName = normalizeName(player.playerName);
        if (!funByPlayer[playerName]) funByPlayer[playerName] = [];
        funByPlayer[playerName].push(game.metadata.avgFun);

        // Fun by commander
        const commander = player.commander;
        if (!funByCommander[commander]) funByCommander[commander] = [];
        funByCommander[commander].push(game.metadata.avgFun);
      });
    }
  });

  // Calculate averages
  const avgDuration =
    durations.length > 0
      ? durations.reduce((a, b) => a + b, 0) / durations.length
      : 0;
  const avgRounds =
    rounds.length > 0 ? rounds.reduce((a, b) => a + b, 0) / rounds.length : 0;
  const avgFun =
    funRatings.length > 0
      ? funRatings.reduce((a, b) => a + b, 0) / funRatings.length
      : 0;

  // Duration vs rounds correlation
  const durationVsRounds = validGames
    .filter((g) => g.metadata.duration && g.metadata.rounds)
    .map((g) => ({
      duration: parseTimeToSeconds(g.metadata.duration),
      rounds: g.metadata.rounds,
    }));

  // Rounds distribution
  const roundsDistribution = {};
  rounds.forEach((r) => {
    roundsDistribution[r] = (roundsDistribution[r] || 0) + 1;
  });

  // Fun by player averages
  const avgFunByPlayer = Object.entries(funByPlayer)
    .map(([player, ratings]) => ({
      player,
      avgFun: ratings.reduce((a, b) => a + b, 0) / ratings.length,
      games: ratings.length,
    }))
    .sort((a, b) => b.avgFun - a.avgFun);

  // Fun by commander averages (min 3 games)
  const avgFunByCommander = Object.entries(funByCommander)
    .filter(([, ratings]) => ratings.length >= 3)
    .map(([commander, ratings]) => ({
      commander,
      avgFun: ratings.reduce((a, b) => a + b, 0) / ratings.length,
      games: ratings.length,
    }))
    .sort((a, b) => b.avgFun - a.avgFun);

  return {
    summary: {
      totalValidGames: validGames.length,
      avgDurationSeconds: avgDuration,
      avgDuration: `${Math.floor(avgDuration / 60)}:${String(
        Math.floor(avgDuration % 60)
      ).padStart(2, '0')}`,
      avgRounds: avgRounds.toFixed(1),
      avgFunRating: avgFun.toFixed(2),
    },
    durationVsRounds,
    roundsDistribution,
    avgFunByPlayer,
    avgFunByCommander,
  };
}

// 5. Damage Pattern Analysis
function analyzeDamagePatterns(games) {
  const playerDamageStats = {};
  const biggestSwings = [];

  // Helper to ensure player stats exists
  const ensurePlayerStats = (playerName) => {
    if (!playerDamageStats[playerName]) {
      playerDamageStats[playerName] = {
        totalDamage: 0,
        commanderDamage: 0,
        gamesPlayed: new Set(),
        maxSingleGame: 0,
        gameDetails: [], // Track individual game damages
      };
    }
  };

  games.forEach((game) => {
    // Extract from highlights
    if (game.highlights?.mostDamage) {
      const player = normalizeName(game.highlights.mostDamage.player);
      ensurePlayerStats(player);

      const amount = game.highlights.mostDamage.amount || 0;
      playerDamageStats[player].gameDetails.push(amount);
      playerDamageStats[player].maxSingleGame = Math.max(
        playerDamageStats[player].maxSingleGame,
        amount
      );
    }

    if (game.highlights?.biggestSwing?.damage > 0) {
      biggestSwings.push({
        gameId: game.gameId,
        date: game.date,
        attacker: game.highlights.biggestSwing.attacker,
        target: game.highlights.biggestSwing.target,
        damage: game.highlights.biggestSwing.damage,
      });
    }

    // Process damage matrices
    if (game.damageMatrices?.total && game.players) {
      game.players.forEach((player, i) => {
        const playerName = normalizeName(player.playerName);
        ensurePlayerStats(playerName);

        // Sum damage dealt to all opponents
        const totalDamageDealt =
          game.damageMatrices.total[i]?.reduce((sum, dmg) => sum + dmg, 0) || 0;
        const commanderDamageDealt =
          game.damageMatrices.commander[i]?.reduce(
            (sum, dmg) => sum + dmg,
            0
          ) || 0;

        // Always count the game if player was in it
        playerDamageStats[playerName].gamesPlayed.add(game.gameId);

        if (totalDamageDealt > 0) {
          // Track this game's damage in details (for filtering infinite later)
          if (
            !playerDamageStats[playerName].gameDetails.includes(
              totalDamageDealt
            )
          ) {
            playerDamageStats[playerName].gameDetails.push(totalDamageDealt);
          }

          playerDamageStats[playerName].totalDamage += totalDamageDealt;
          playerDamageStats[playerName].commanderDamage =
            (playerDamageStats[playerName].commanderDamage || 0) +
            commanderDamageDealt;
          playerDamageStats[playerName].maxSingleGame = Math.max(
            playerDamageStats[playerName].maxSingleGame,
            totalDamageDealt
          );
        }
      });
    }
  });

  // Calculate efficiency
  const damageEfficiency = Object.entries(playerDamageStats).map(
    ([player, stats]) => {
      // Count unique games played
      const gamesPlayed = stats.gamesPlayed
        ? stats.gamesPlayed.size
        : stats.games || 0;

      // Check if player has infinite damage
      const hasInfinite = stats.maxSingleGame > 1000000;

      // For totals/averages, filter out infinite games from gameDetails
      const nonInfiniteGames = (stats.gameDetails || []).filter(
        (dmg) => dmg < 1000000
      );
      const totalDamageNonInfinite = nonInfiniteGames.reduce(
        (sum, dmg) => sum + dmg,
        0
      );
      const gamesCountNonInfinite = nonInfiniteGames.length;

      // Commander damage calculation (proportional to non-infinite games)
      const commanderDamageNonInfinite = stats.commanderDamage || 0;

      return {
        player,
        totalDamage: totalDamageNonInfinite,
        avgDamagePerGame:
          gamesCountNonInfinite > 0
            ? totalDamageNonInfinite / gamesCountNonInfinite
            : 0,
        maxSingleGame: stats.maxSingleGame,
        commanderDamagePct:
          totalDamageNonInfinite > 0
            ? (commanderDamageNonInfinite / totalDamageNonInfinite) * 100
            : 0,
        games: gamesPlayed,
        gamesCountedForAvg: gamesCountNonInfinite,
        hasInfinite,
      };
    }
  );

  damageEfficiency.sort((a, b) => b.totalDamage - a.totalDamage);

  // Top 20 biggest swings
  const topSwings = biggestSwings
    .sort((a, b) => b.damage - a.damage)
    .slice(0, 20);

  return {
    damageEfficiency,
    topSwings,
    totalDamageDealt: damageEfficiency.reduce(
      (sum, p) => sum + p.totalDamage,
      0
    ),
  };
}

// Main analysis function
function analyzeGames(games) {
  console.log(`Analyzing ${games.length} games...`);

  const headToHead = analyzeHeadToHead(games);
  const winConditions = analyzeWinConditions(games);
  const playerBehavior = analyzePlayerBehavior(games);
  const gameMeta = analyzeGameMeta(games);
  const damagePatterns = analyzeDamagePatterns(games);

  return {
    summary: gameMeta.summary,
    headToHead,
    winConditions,
    playerBehavior,
    gameMeta,
    damagePatterns,
  };
}

module.exports = {
  analyzeGames,
  analyzeHeadToHead,
  analyzeWinConditions,
  analyzePlayerBehavior,
  analyzeGameMeta,
  analyzeDamagePatterns,
};
