# Did Kansas Win?

A minimal website that displays the result of the most recent Kansas Jayhawks men's basketball game in simple YES/NO format, inspired by diddukewin.com.

Currently lives at https://www.didkansaswin.com/

## Features

- **Simple Display**: Shows YES/NO for the most recent game result
- **Score Link**: Displays score with direct link to ESPN game recap
- **Live Game Monitoring**: Shows live scores during games starting at tip-off
- **Season-Aware**: Automatically shows final game result during off-season
- **Tournament Coverage**: Includes both regular season and NCAA tournament games
- **About Page**: Clean about page with site information and navigation
- **Enhanced Logging**: Console output includes season type descriptions (regular season, postseason)
- **Minimal Design**: Clean, centered layout matching the original diddukewin.com style

## How It Works

1. **Daily Schedule Updates**: Every day at 8 AM, the app fetches the Kansas basketball schedule
2. **Game Monitoring**: Starting at tip-off time, checks every 5 minutes for live game updates
3. **Result Display**: Shows YES/NO based on whether Kansas won, with score and ESPN link
4. **Off-Season Handling**: During off-season, displays the final game result from the previous season

## Data Sources

- **Primary**: ESPN API (https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball)
- **Coverage**: Regular season and postseason (NCAA tournament) games
- **Game Links**: ESPN game recaps for official source

## Setup

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Run locally:**
   ```bash
   npm start
   ```

   Visit `http://localhost:3000`

## File Structure

```
/
├── server.js          # Main Node.js server with ESPN API integration
├── package.json       # Dependencies and scripts
├── public/
│   ├── index.html     # Main page with game status display
│   ├── about.html     # About page with site information
│   └── style.css      # Consolidated CSS styles
└── README.md          # This file
```

## Technical Details

- **Kansas Team ID**: 2305 (ESPN API identifier)
- **Season Types**: Fetches both regular season (2) and postseason (3) games with descriptive logging
- **Live Game States**:
  - `final`: Shows YES/NO with final score
  - `in_progress`: Shows LIVE with current score (yellow)
  - `scheduled`: Shows upcoming games during season
- **Off-Season Logic**: Automatically detects off-season and shows last completed game
- **Navigation**: Simple about page accessible via "/about" link
- **Styling**: Consolidated CSS with responsive design and clean typography

## Environment Variables

No environment variables required - the app works out of the box!

## License

MIT License - feel free to modify and use!