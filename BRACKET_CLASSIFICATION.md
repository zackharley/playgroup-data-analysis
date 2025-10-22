# Commander Bracket Classification System

## Overview

This system automatically classifies Commander decks into power level brackets (1-5) based on performance metrics and game patterns, using the official Commander Brackets framework as a guide.

## Bracket Definitions

> **Note**: Brackets 1 (Exhibition) and 5 (cEDH) are disabled in this system.
> - **Bracket 1**: True "theme decks" with intentionally substandard win conditions are rare in practice
> - **Bracket 5**: cEDH is a distinct competitive metagame - "if you have to ask if you're playing cEDH, you're not"
>
> All decks are classified between Brackets 2-4 for regular casual-to-high-power Commander.

- **Bracket 2 (Core)**: Focused gameplay, fair interactions, slower wins - **Minimum bracket**
- **Bracket 3 (Upgraded)**: Strong synergy, 6-8 turn wins, powered cards  
- **Bracket 4 (Optimized)**: Fast and lethal, <6 turn wins, may include infinite combos - **Maximum bracket**

## Classification Algorithm

### Primary Signals

1. **Turn Speed** (Primary)
   - Uses `avgWinTurn` from deck statistics
   - Brackets are assigned based on turn thresholds
   - For decks without wins, uses `avgGameRounds` as proxy

2. **Win Condition Analysis** (Secondary)
   - Detects infinite combo patterns from game data
   - Identifies combat vs non-combat win strategies
   - Tracks win condition consistency

3. **Efficiency Metrics** (Refinement)
   - `avgKillsPerGame`: Measures elimination efficiency
   - `avgDamagePerGame`: Indicates threat level
   - Combined with turn speed for nuanced classification

### Confidence Scoring

**High Confidence**
- 8+ games played
- Clear, consistent metrics
- Reliable win condition data

**Medium Confidence**
- 5-7 games played, OR
- Borderline metrics between two brackets

**Low Confidence**
- <5 games played, OR
- Contradictory signals in metrics

## Output Structure

Each classified deck includes:

```javascript
{
  commander: "Deck name",
  pilot: "Player name",
  elo: 1580,
  bracket: 3,                    // 1-5
  confidence: "High",            // High/Medium/Low
  reasoning: [                   // Human-readable explanations
    "Average win turn of 7.75 suggests Bracket 3 (Upgraded) speed",
    "High kills per game (1.44) indicates efficient, proactive gameplay",
    // ...
  ],
  metrics: {
    avgWinTurn: 7.75,
    avgGameRounds: 9.33,
    avgKillsPerGame: 1.44,
    avgDamagePerGame: 82.44,
    winRate: 0.444,
    games: 9,
    primaryWinCondition: "Combat",
    comboWins: 0,
    infiniteWins: 0
  }
}
```

## Key Insights from Data

Based on your playgroup's 77 decks:

### Distribution
- **Bracket 2**: 58 decks (75.3%) - Core/Balanced (slower/fairer decks)
- **Bracket 3**: 17 decks (22.1%) - Upgraded/Powered (fast synergistic decks)
- **Bracket 4**: 2 decks (2.6%) - Optimized (Baylen and Kudo, both with infinite combo wins)

### Confidence
- High: 8 decks (10.4%)
- Medium: 21 decks (27.3%)
- Low: 48 decks (62.3%)

### Pattern Detection

**Infinite Combo Detection**: The system identified 2 decks with infinite combo wins:
- Baylen, The Haymaker (Bracket 4)
- Kudo, King Among Bears (Bracket 4)

These were automatically classified as Bracket 4 (Optimized) due to infinite combo usage, representing the highest power level in your meta.

## Using the Results

### In Reports
The bracket classification appears in `data/report.md` with:
- Overall distribution tables
- Player bracket tendencies
- Full deck classifications sorted by ELO
- Borderline cases requiring review
- Sample detailed analyses with reasoning

### In Insights JSON
Access programmatically via `data/insights.json`:
```javascript
const insights = require('./data/insights.json');

// Get all classifications
const classifications = insights.bracketClassifications;

// Get distribution summary
const summary = insights.bracketAnalysis.summary;

// Get player tendencies
const playerAvgs = insights.bracketAnalysis.playerBracketAvg;

// Get decks by bracket
const bracket3Decks = insights.bracketAnalysis.byBracket[3];
```

## Limitations & Caveats

1. **Card-Level Restrictions**: Cannot directly detect specific cards like mass land denial or extra turn spells. Uses win patterns as proxies.

2. **Sample Size**: 62% of classifications have low confidence due to limited games played (<5 games). More data improves accuracy.

3. **Borderline Cases**: Decks with metrics near bracket boundaries may fluctuate with additional games.

4. **Win Condition Data**: 34% of games have unknown win conditions, limiting win pattern analysis.

## Recommendations

1. **High Confidence Decks**: Use these classifications with confidence for power level discussions.

2. **Low Confidence Decks**: Treat as preliminary estimates. Play more games to improve accuracy.

3. **Borderline Cases**: Review the detailed reasoning to understand which metrics are pulling the deck toward different brackets.

4. **Manual Override**: For decks with known card-level restrictions (mass LD, extra turns, etc.), manually adjust classification as needed.

## Running the Analysis

The bracket classification runs automatically when you execute:

```bash
node src/analyzers/analyze.js
```

This will:
1. Load deck statistics from `data/playgroup-data.json`
2. Load game data from `data/games.json`
3. Classify all decks into brackets
4. Generate comprehensive reports in `data/report.md`
5. Save detailed data to `data/insights.json`

## Implementation Details

### Files Created
- `src/analyzers/bracket-classifier.js`: Core classification logic
  - `classifyDeck()`: Main classification function
  - `analyzeDeckWinConditions()`: Win pattern extraction
  - `calculateBracket()`: Turn speed → bracket mapping
  - `calculateConfidence()`: Confidence tier assignment
  - `generateReasoning()`: Human-readable explanations

### Files Modified
- `src/analyzers/analyze.js`: Integration into analysis pipeline
  - Added bracket classification step
  - Enhanced report generation with bracket sections
  - Console output includes bracket statistics

## Future Enhancements

Potential improvements:
1. **Manual Tagging**: Add ability to flag decks with known restrictions
2. **Deck Evolution Tracking**: Monitor bracket changes over time
3. **Matchup Analysis**: Analyze win rates between different brackets
4. **Player Preferences**: Identify which brackets players enjoy most
5. **Recommendation Engine**: Suggest decks based on desired bracket

