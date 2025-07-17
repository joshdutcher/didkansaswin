const express = require('express');
const axios = require('axios');
const cron = require('node-cron');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.static('public'));

let gameState = {
  lastGame: null,
  nextGame: null,
  isMonitoring: false,
  lastUpdated: null
};

const ESPN_API = 'https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball';
const KANSAS_TEAM_ID = '2305';

function getCurrentSeason() {
  const now = new Date();
  const month = now.getMonth() + 1;
  const year = now.getFullYear();
  
  // Basketball season spans two calendar years (e.g., 2023-24 season)
  // ESPN API uses the starting year (2023 for 2023-24 season)
  if (month >= 1 && month <= 10) {
    return year - 1;  // Jan-Oct: use previous year
  }
  return year;  // Nov-Dec: use current year
}

function getMonthFormat(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `${year}/${month}`;
}

function isBasketballSeason() {
  const month = new Date().getMonth() + 1;
  return month >= 11 || month <= 4;
}

async function fetchKansasSchedule(season) {
  let allGames = [];
  
  // Fetch both regular season (2) and postseason (3) games
  const seasonTypes = [2, 3]; // Regular season and postseason
  
  for (const seasonType of seasonTypes) {
    const scheduleUrl = `${ESPN_API}/teams/${KANSAS_TEAM_ID}/schedule?season=${season}&seasontype=${seasonType}`;
    console.log(`Requesting: ${scheduleUrl}`);
    
    try {
      const response = await axios.get(scheduleUrl);
      console.log(`Response status: ${response.status}`);
      const data = response.data;

      if (!data.events || data.events.length === 0) {
        console.log(`No games found for season ${season} seasontype ${seasonType}`);
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
      
      console.log(`Found ${data.events.length} games for season ${season} seasontype ${seasonType}`);
    } catch (error) {
      console.error(`Error fetching Kansas schedule for season ${season} seasontype ${seasonType} (${scheduleUrl}):`, error.message);
      if (error.response) {
        console.log(`Error response status: ${error.response.status}`);
        console.log(`Error response data:`, error.response.data);
      }
    }
  }

  console.log(`Total games found for season ${season}: ${allGames.length}`);
  return allGames.sort((a, b) => a.startTimeEpoch - b.startTimeEpoch);
}

async function updateSchedule() {
  console.log('Updating Kansas schedule...');
  console.log(`Basketball season: ${isBasketballSeason()}`);

  let allGames = [];
  const currentSeason = getCurrentSeason();

  if (isBasketballSeason()) {
    // During basketball season: get current season games
    console.log(`Basketball season active - fetching season ${currentSeason}`);
    allGames = await fetchKansasSchedule(currentSeason);
  } else {
    // Off-season: get previous season games
    console.log(`Off-season - fetching previous season ${currentSeason}`);
    allGames = await fetchKansasSchedule(currentSeason);
    
    // If no games found, try previous season
    if (allGames.length === 0) {
      console.log(`No games found for ${currentSeason}, trying ${currentSeason - 1}`);
      allGames = await fetchKansasSchedule(currentSeason - 1);
    }
  }

  console.log(`Total games found: ${allGames.length}`);

  const now = new Date();
  const completedGames = allGames.filter(g =>
    g.gameState === 'final' && new Date(g.startTimeEpoch * 1000) < now
  );

  console.log(`Completed games found: ${completedGames.length}`);

  if (completedGames.length > 0) {
    gameState.lastGame = completedGames[completedGames.length - 1];
    console.log(`Last game: ${gameState.lastGame.date} - ${gameState.lastGame.gameState}`);
  }

  // Only look for upcoming games during basketball season
  if (isBasketballSeason()) {
    const upcomingGames = allGames.filter(g =>
      g.gameState !== 'final' && new Date(g.startTimeEpoch * 1000) > now
    );

    if (upcomingGames.length > 0) {
      gameState.nextGame = upcomingGames[0];
      console.log(`Next game: ${gameState.nextGame.date}`);
    } else {
      gameState.nextGame = null;
      console.log('No upcoming games found');
    }
  } else {
    gameState.nextGame = null;
    console.log('Off-season: No upcoming game search');
  }

  gameState.lastUpdated = new Date();
}

async function checkGameResult() {
  if (!gameState.nextGame) return;

  try {
    // For ESPN API, we need to fetch the specific game details
    const gameUrl = `${ESPN_API}/summary?event=${gameState.nextGame.gameID}`;
    console.log(`Checking game result: ${gameUrl}`);
    
    const response = await axios.get(gameUrl);
    const gameData = response.data;

    if (gameData.header && gameData.header.competitions && gameData.header.competitions[0]) {
      const competition = gameData.header.competitions[0];
      const status = competition.status;
      
      if (status && status.type.completed) {
        console.log('Game finished! Updating result...');

        // Update the game state to final
        gameState.lastGame = {
          ...gameState.nextGame,
          gameState: 'final'
        };

        // Update scores from the competition data
        if (competition.competitors) {
          for (const competitor of competition.competitors) {
            if (competitor.homeAway === 'home') {
              gameState.lastGame.home.score = competitor.score ? competitor.score.displayValue || competitor.score.value || '0' : '0';
              gameState.lastGame.home.winner = competitor.winner || false;
            } else {
              gameState.lastGame.away.score = competitor.score ? competitor.score.displayValue || competitor.score.value || '0' : '0';
              gameState.lastGame.away.winner = competitor.winner || false;
            }
          }
        }

        gameState.nextGame = null;
        gameState.isMonitoring = false;

        setTimeout(() => updateSchedule(), 5000);
      } else {
        // Update live game info
        if (competition.competitors) {
          for (const competitor of competition.competitors) {
            if (competitor.homeAway === 'home') {
              gameState.nextGame.home.score = competitor.score ? competitor.score.displayValue || competitor.score.value || '0' : '0';
            } else {
              gameState.nextGame.away.score = competitor.score ? competitor.score.displayValue || competitor.score.value || '0' : '0';
            }
          }
        }
        
        if (status && status.type.name === 'STATUS_IN_PROGRESS') {
          gameState.nextGame.gameState = 'in_progress';
        }
      }
    }
  } catch (error) {
    console.error('Error checking game result:', error.message);
    if (error.response) {
      console.log(`Error response status: ${error.response.status}`);
    }
  }
}

function startGameMonitoring() {
  if (!gameState.nextGame || gameState.isMonitoring) return;

  const gameTime = new Date(gameState.nextGame.startTimeEpoch * 1000);
  const now = new Date();

  if (now >= gameTime) {
    console.log('Starting game monitoring...');
    gameState.isMonitoring = true;

    checkGameResult();

    const monitorInterval = setInterval(() => {
      if (!gameState.isMonitoring) {
        clearInterval(monitorInterval);
        return;
      }
      checkGameResult();
    }, 5 * 60 * 1000); // 5 minutes
  }
}

app.get('/api/status', async (req, res) => {
  startGameMonitoring();
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
      url: `https://www.espn.com/mens-college-basketball/game/_/gameId/${gameState.lastGame.gameID}`
    };
  }

  res.json(result);
});

cron.schedule('0 8 * * *', () => {
  updateSchedule();
});

cron.schedule('*/5 * * * *', () => {
  startGameMonitoring();
});

updateSchedule();

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});