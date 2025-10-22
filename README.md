# Playgroup Data Scraper & Analyzer

Automated data collection and analysis tool for Playgroup.gg using Playwright.

## Setup

1. Install dependencies:
```bash
npm install
```

2. Create `.env` file with your credentials:
```env
USERNAME=your-email@example.com
PASSWORD=your-password
PLAYGROUP_URL=https://playgroup.gg/playgroups/35720-cardfolk
```

## Usage

### Run Complete Pipeline (Recommended)

Scrape all data and generate analysis in one command:

```bash
npm run scrape
```

This will:
1. Log in to Playgroup.gg
2. Scrape all deck stats from leaderboard
3. Scrape all game data with infinite scroll
4. Generate comprehensive analysis and reports
5. Output everything to `data/` directory

### Run Individual Components

**Scrape decks only:**
```bash
npm run scrape:decks
```

**Scrape games only:**
```bash
npm run scrape:games
```

**Analyze existing data:**
```bash
npm run analyze
```

## Features

- **Automated Data Collection**: Scrapes deck stats and game data from Playgroup.gg
- **Comprehensive Analysis**: Player performance, commander meta, playstyle patterns
- **Bracket Classification**: Automatically classifies decks into Commander Brackets (1-5) with confidence scoring
- **Detailed Reports**: Human-readable markdown reports with insights and statistics

## Project Structure

```
src/
├── scrapers/
│   ├── auth.js              # Shared authentication logic
│   ├── deck-scraper.js      # Scrapes deck leaderboard + deck details
│   └── game-scraper.js      # Scrapes games with infinite scroll
├── analyzers/
│   ├── analyze.js           # Data analysis and report generation
│   ├── bracket-classifier.js # Commander bracket classification system
│   └── game-analyzer.js     # Game-specific analysis
├── utils/
│   └── helpers.js           # Utility functions (time parsing, chart extraction)
└── main.js                  # Orchestrator - runs full pipeline

data/
├── playgroup-data.json      # Deck stats data
├── games.json               # Game data
├── insights.json            # Analysis results (includes bracket classifications)
└── report.md                # Human-readable report
```

## Output Files

### `data/playgroup-data.json`
Array of deck objects with stats:
- Commander, pilot, rank, ELO
- Wins, losses, games, win rate
- Average turn length, win turn, kills, damage, rounds

### `data/games.json`
Array of game objects with:
- Game metadata (ID, date, duration, rounds)
- Player results (4 players per game)
- Match highlights (most damage, biggest swing, longest turn)
- Damage matrices (total, commander, healing, poison)
- Chart data (turn duration, damage per turn, life totals, etc.)

### `data/insights.json`
Structured analysis including:
- Player performance rankings
- Commander meta analysis
- Playstyle distribution
- Statistical correlations
- **Bracket classifications** with confidence scores and reasoning

### `data/report.md`
Human-readable markdown report with:
- Player rankings
- Top commanders by ELO and win rate
- Playstyle analysis
- Turn speed analysis
- **Bracket classifications** (Exhibition → cEDH)
- Player bracket tendencies
- Detailed deck analysis with reasoning
- Key findings and outliers

## Bracket Classification

The system automatically classifies each deck into Commander Brackets (2-4) based on performance metrics:

> **Note**: Brackets 1 and 5 are disabled for practical reasons:
> - **Bracket 1 (Exhibition)**: True "theme decks" are rare in practice
> - **Bracket 5 (cEDH)**: cEDH is a distinct format - "if you have to ask, you're not playing it"

- **Bracket 2 (Core)**: Focused gameplay, slower/fair wins - **Minimum**
- **Bracket 3 (Upgraded)**: Strong synergy, 6-8 turn wins
- **Bracket 4 (Optimized)**: Fast and lethal, <6 turn wins, may include infinite combos - **Maximum**

Each classification includes:
- **Confidence Level**: High/Medium/Low based on sample size and metric consistency
- **Detailed Reasoning**: Human-readable explanations for the bracket assignment
- **Key Metrics**: Win turn, kills/game, damage/game, win conditions

See [BRACKET_CLASSIFICATION.md](./BRACKET_CLASSIFICATION.md) for detailed documentation on the classification algorithm and usage.

## Architecture

The scraper uses a modular architecture with separation of concerns:

- **Scrapers**: Independent modules that export data collection functions
- **Analyzers**: Process scraped data and generate insights
- **Utils**: Shared utilities for data parsing and extraction
- **Main**: Orchestrates the entire pipeline

Each module can be run standalone or imported and used programmatically.


