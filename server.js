const express = require('express');
const axios = require('axios');
const cron = require('node-cron');

const app = express();
const PORT = process.env.PORT || 3050;

// Configure EJS templating
app.set('view engine', 'ejs');
app.set('views', __dirname + '/public/templates');

// Dual sport state management
let basketballState = {
  lastGame: null,
  nextGame: null,
  isMonitoring: false,
  lastUpdated: null
};

let footballState = {
  lastGame: null,
  nextGame: null,
  isMonitoring: false,
  lastUpdated: null
};

// Sport configuration
const SPORTS_CONFIG = {
  basketball: {
    apiBase: 'https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball',
    teamId: '2305',
    seasonMonths: [11, 12, 1, 2, 3, 4], // Nov-Apr
    espnUrlPrefix: 'mens-college-basketball'
  },
  football: {
    apiBase: 'https://site.api.espn.com/apis/site/v2/sports/football/college-football',
    teamId: '2305',
    seasonMonths: [8, 9, 10, 11, 12, 1], // Aug-Jan
    espnUrlPrefix: 'college-football'
  }
};

// Helper functions
function getSportConfig(sport) {
  return SPORTS_CONFIG[sport] || SPORTS_CONFIG.basketball;
}

function getSportState(sport) {
  return sport === 'football' ? footballState : basketballState;
}

function setSportState(sport, state) {
  if (sport === 'football') {
    footballState = { ...footballState, ...state };
  } else {
    basketballState = { ...basketballState, ...state };
  }
}

function getCurrentSeason(sport = 'basketball') {
  const now = new Date();
  const month = now.getMonth() + 1;
  const year = now.getFullYear();
  
  if (sport === 'football') {
    // Football season: Aug-Jan spans calendar years
    // ESPN API uses the starting year (2025 for 2025-26 season)
    if (month >= 8) {
      return year;  // Aug-Dec: use current year
    }
    return year - 1;  // Jan-July: use previous year
  } else {
    // Basketball season: Nov-Apr spans calendar years  
    // ESPN API uses the starting year (2024 for 2024-25 season)
    if (month >= 11) {
      return year;  // Nov-Dec: use current year
    }
    return year - 1;  // Jan-Oct: use previous year
  }
}

function getSeasonTypeDescription(seasonType) {
  switch (seasonType) {
    case 1: return 'preseason';
    case 2: return 'regular season';
    case 3: return 'postseason';
    default: return 'unknown';
  }
}

function getMonthFormat(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${year}/${month}`;
}

function isInSeason(sport = 'basketball') {
  const month = new Date().getMonth() + 1;
  const config = getSportConfig(sport);
  return config.seasonMonths.includes(month);
}

async function fetchKansasSchedule(sport, season) {
  const config = getSportConfig(sport);
  let allGames = [];
  
  // Fetch both regular season (2) and postseason (3) games
  const seasonTypes = [2, 3]; // Regular season and postseason
  
  for (const seasonType of seasonTypes) {
    const scheduleUrl = `${config.apiBase}/teams/${config.teamId}/schedule?season=${season}&seasontype=${seasonType}`;
    console.log(`Requesting: ${scheduleUrl}`);
    
    try {
      const response = await axios.get(scheduleUrl);
      console.log(`Response status: ${response.status}`);
      const data = response.data;

      if (!data.events || data.events.length === 0) {
        console.log(`No games found for season ${season} seasontype ${seasonType} (${getSeasonTypeDescription(seasonType)})`);
        continue;
      }

      for (const event of data.events) {
        try {
          const game = event;
          
          // Extract date
          const gameDate = new Date(game.date);
          const startTimeEpoch = Math.floor(gameDate.getTime() / 1000);
          
          // Determine game state
          let gameState = 'scheduled';
          if (game.competitions && game.competitions[0]) {
            const competition = game.competitions[0];
            if (competition.status) {
              if (competition.status.type.completed) {
                gameState = 'final';
              } else if (competition.status.type.name === 'STATUS_IN_PROGRESS') {
                gameState = 'in_progress';
              }
            }
          }

          console.log(`Game ${game.id} on ${gameDate.toISOString().split('T')[0]}: ${gameState}`);

          // Extract teams
          let home = null;
          let away = null;
          
          if (game.competitions && game.competitions[0] && game.competitions[0].competitors) {
            const competitors = game.competitions[0].competitors;
            
            for (const competitor of competitors) {
              const team = {
                names: {
                  seo: competitor.team.abbreviation.toLowerCase()
                },
                score: competitor.score ? competitor.score.displayValue || competitor.score.value || '0' : '0',
                winner: competitor.winner || false,
                ...competitor.team
              };
              
              if (competitor.homeAway === 'home') {
                home = team;
              } else {
                away = team;
              }
            }
          }

          allGames.push({
            gameID: game.id,
            date: gameDate.toISOString().split('T')[0],
            startTimeEpoch: startTimeEpoch,
            gameState: gameState,
            home: home,
            away: away
          });

        } catch (error) {
          console.log(`Error processing game data:`, error.message);
        }
      }
      
      console.log(`Found ${data.events.length} games for season ${season} seasontype ${seasonType} (${getSeasonTypeDescription(seasonType)})`);
    } catch (error) {
      console.error(`Error fetching Kansas schedule for season ${season} seasontype ${seasonType} (${getSeasonTypeDescription(seasonType)}) (${scheduleUrl}):`, error.message);
      if (error.response) {
        console.log(`Error response status: ${error.response.status}`);
        console.log(`Error response data:`, error.response.data);
      }
    }
  }

  console.log(`Total games found for season ${season}: ${allGames.length}`);
  return allGames.sort((a, b) => a.startTimeEpoch - b.startTimeEpoch);
}

async function updateSchedule(sport = 'basketball') {
  console.log(`Updating Kansas ${sport} schedule...`);
  console.log(`${sport} season: ${isInSeason(sport)}`);

  let allGames = [];
  const currentSeason = getCurrentSeason(sport);
  const gameState = getSportState(sport);

  if (isInSeason(sport)) {
    // During season: get current season games
    console.log(`${sport} season active - fetching season ${currentSeason}`);
    allGames = await fetchKansasSchedule(sport, currentSeason);
  } else {
    // Off-season: get previous season games
    console.log(`${sport} off-season - fetching previous season ${currentSeason}`);
    allGames = await fetchKansasSchedule(sport, currentSeason);
    
    // If no games found, try previous season
    if (allGames.length === 0) {
      console.log(`No games found for ${currentSeason}, trying ${currentSeason - 1}`);
      allGames = await fetchKansasSchedule(sport, currentSeason - 1);
    }
  }

  console.log(`Total games found: ${allGames.length}`);

  const now = new Date();
  const completedGames = allGames.filter(g =>
    g.gameState === 'final' && new Date(g.startTimeEpoch * 1000) < now
  );

  console.log(`Completed games found: ${completedGames.length}`);

  const updatedState = { lastUpdated: new Date() };

  if (completedGames.length > 0) {
    updatedState.lastGame = completedGames[completedGames.length - 1];
    console.log(`Last ${sport} game: ${updatedState.lastGame.date} - ${updatedState.lastGame.gameState}`);
  } else {
    // No completed games in current season, try previous season
    console.log(`No completed games found in current season ${currentSeason}, trying previous season ${currentSeason - 1}`);
    const previousSeasonGames = await fetchKansasSchedule(sport, currentSeason - 1);
    const previousCompletedGames = previousSeasonGames.filter(g =>
      g.gameState === 'final' && new Date(g.startTimeEpoch * 1000) < now
    );
    
    if (previousCompletedGames.length > 0) {
      updatedState.lastGame = previousCompletedGames[previousCompletedGames.length - 1];
      console.log(`Last ${sport} game from previous season: ${updatedState.lastGame.date} - ${updatedState.lastGame.gameState}`);
    } else {
      console.log(`No completed ${sport} games found in previous season either`);
    }
  }

  // Look for live or upcoming games during season
  if (isInSeason(sport)) {
    // First check for live games
    const liveGames = allGames.filter(g => g.gameState === 'in_progress');

    if (liveGames.length > 0) {
      updatedState.nextGame = liveGames[0];
      console.log(`Live ${sport} game in progress: ${updatedState.nextGame.date}`);
    } else {
      // If no live games, look for upcoming games
      const upcomingGames = allGames.filter(g =>
        g.gameState !== 'final' && new Date(g.startTimeEpoch * 1000) > now
      );

      if (upcomingGames.length > 0) {
        updatedState.nextGame = upcomingGames[0];
        console.log(`Next ${sport} game: ${updatedState.nextGame.date}`);
      } else {
        updatedState.nextGame = null;
        console.log(`No upcoming ${sport} games found`);
      }
    }
  } else {
    updatedState.nextGame = null;
    console.log(`${sport} off-season: No upcoming game search`);
  }

  setSportState(sport, updatedState);
}

async function checkGameResult(sport = 'basketball') {
  const gameState = getSportState(sport);
  const config = getSportConfig(sport);

  if (!gameState.nextGame) return;

  try {
    // For ESPN API, we need to fetch the specific game details
    const gameUrl = `${config.apiBase}/summary?event=${gameState.nextGame.gameID}`;
    console.log(`Checking ${sport} game result: ${gameUrl}`);

    const response = await axios.get(gameUrl);
    const gameData = response.data;
    console.log(`Game data status: ${response.status}`);

    if (gameData.header && gameData.header.competitions && gameData.header.competitions[0]) {
      const competition = gameData.header.competitions[0];
      const status = competition.status;

      console.log(`Game status: ${status ? status.type.name : 'unknown'}, completed: ${status ? status.type.completed : 'unknown'}`);

      if (status && status.type.completed) {
        console.log('Game finished! Updating result...');

        // Update the game state to final
        const lastGame = {
          ...gameState.nextGame,
          gameState: 'final'
        };

        // Update scores from the competition data
        if (competition.competitors) {
          for (const competitor of competition.competitors) {
            if (competitor.homeAway === 'home') {
              lastGame.home.score = competitor.score ? competitor.score.displayValue || competitor.score.value || '0' : '0';
              lastGame.home.winner = competitor.winner || false;
            } else {
              lastGame.away.score = competitor.score ? competitor.score.displayValue || competitor.score.value || '0' : '0';
              lastGame.away.winner = competitor.winner || false;
            }
          }
        }

        setSportState(sport, {
          lastGame: lastGame,
          nextGame: null,
          isMonitoring: false
        });

        setTimeout(() => updateSchedule(sport), 5000);
      } else {
        // Update live game info
        console.log(`Updating live game scores. Competitors found: ${competition.competitors ? competition.competitors.length : 0}`);
        const nextGame = { ...gameState.nextGame };

        if (competition.competitors) {
          for (const competitor of competition.competitors) {
            const score = competitor.score || '0';
            console.log(`Team ${competitor.team.displayName} (${competitor.homeAway}): ${score}`);

            if (competitor.homeAway === 'home') {
              nextGame.home.score = score;
            } else {
              nextGame.away.score = score;
            }
          }
        }

        if (status && status.type.name === 'STATUS_IN_PROGRESS') {
          nextGame.gameState = 'in_progress';
        }

        console.log(`Updated game: ${nextGame.away?.names?.seo || 'Away'} ${nextGame.away?.score || '0'} - ${nextGame.home?.names?.seo || 'Home'} ${nextGame.home?.score || '0'}`);
        setSportState(sport, { nextGame });
      }
    }
  } catch (error) {
    console.error('Error checking game result:', error.message);
    if (error.response) {
      console.log(`Error response status: ${error.response.status}`);
    }
  }
}

function startGameMonitoring(sport = 'basketball') {
  const gameState = getSportState(sport);
  
  if (!gameState.nextGame || gameState.isMonitoring) return;

  const gameTime = new Date(gameState.nextGame.startTimeEpoch * 1000);
  const now = new Date();

  if (now >= gameTime) {
    console.log(`Starting ${sport} game monitoring...`);
    setSportState(sport, { isMonitoring: true });

    checkGameResult(sport);

    const monitorInterval = setInterval(() => {
      const currentState = getSportState(sport);
      if (!currentState.isMonitoring) {
        clearInterval(monitorInterval);
        return;
      }
      checkGameResult(sport);
    }, 5 * 60 * 1000); // 5 minutes
  }
}

// Route handlers for templated pages
app.get('/', (req, res) => {
  res.render('index', {
    title: 'Did Kansas Win?',
    canonicalUrl: 'https://www.didkansaswin.com/',
    sport: 'basketball'
  });
});

app.get('/about', (req, res) => {
  res.render('about', {
    title: 'About - Did Kansas Win?',
    canonicalUrl: 'https://www.didkansaswin.com/about'
  });
});

app.get('/football', (req, res) => {
  res.render('football', {
    title: 'Did Kansas Win? - Football',
    canonicalUrl: 'https://www.didkansaswin.com/football',
    sport: 'football'
  });
});

app.get('/api/status', async (req, res) => {
  const sport = req.query.sport || 'basketball';
  const config = getSportConfig(sport);
  const gameState = getSportState(sport);
  
  startGameMonitoring(sport);
  let result = {
    didWin: null,
    scoreLink: null,
    isLive: false,
    liveScore: null,
    lastUpdated: gameState.lastUpdated
  };

  // Check if there's a live game
  if (gameState.nextGame && gameState.isMonitoring) {
    result.isLive = true;
    let kansasScore, opponentScore;
    
    // Find Kansas team and get their score
    if (gameState.nextGame.home.names.seo === 'kansas' || gameState.nextGame.home.names.seo === 'ku') {
      kansasScore = gameState.nextGame.home.score;
      opponentScore = gameState.nextGame.away.score;
    } else if (gameState.nextGame.away.names.seo === 'kansas' || gameState.nextGame.away.names.seo === 'ku') {
      kansasScore = gameState.nextGame.away.score;
      opponentScore = gameState.nextGame.home.score;
    } else {
      // Fallback if we can't identify Kansas
      kansasScore = gameState.nextGame.home.score;
      opponentScore = gameState.nextGame.away.score;
    }
    
    result.liveScore = `${kansasScore}-${opponentScore}`;
  }
  // Check for completed game
  else if (gameState.lastGame && gameState.lastGame.gameState === 'final') {
    let kansasScore, opponentScore, kansasWon;
    
    // Find Kansas team and get their score and winner status
    if (gameState.lastGame.home.names.seo === 'kansas' || gameState.lastGame.home.names.seo === 'ku') {
      kansasScore = gameState.lastGame.home.score;
      opponentScore = gameState.lastGame.away.score;
      kansasWon = gameState.lastGame.home.winner;
    } else if (gameState.lastGame.away.names.seo === 'kansas' || gameState.lastGame.away.names.seo === 'ku') {
      kansasScore = gameState.lastGame.away.score;
      opponentScore = gameState.lastGame.home.score;
      kansasWon = gameState.lastGame.away.winner;
    } else {
      // Fallback if we can't identify Kansas
      kansasScore = gameState.lastGame.home.score;
      opponentScore = gameState.lastGame.away.score;
      kansasWon = gameState.lastGame.home.winner;
    }

    result.didWin = kansasWon;

    const prefix = result.didWin ? 'W' : 'L';
    result.scoreLink = {
      text: `${prefix} ${kansasScore}-${opponentScore}`,
      url: `https://www.espn.com/${config.espnUrlPrefix}/game/_/gameId/${gameState.lastGame.gameID}`
    };
  }

  res.json(result);
});

// Basketball schedule updates
cron.schedule('0 8 * * *', () => {
  updateSchedule('basketball');
});

// Football schedule updates
cron.schedule('0 9 * * *', () => {
  updateSchedule('football');
});

// Game monitoring for both sports
cron.schedule('*/5 * * * *', () => {
  startGameMonitoring('basketball');
  startGameMonitoring('football');
});

// Serve static files (CSS, images, etc.) - place after routes to avoid conflicts
app.use(express.static('public'));

// Initialize both sports
updateSchedule('basketball');
updateSchedule('football');

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});