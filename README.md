# Did Kansas Win?

A minimal website that displays the result of the most recent Kansas Jayhawks men's basketball game in simple YES/NO format, inspired by diddukewin.com.

## Features

- **Simple Display**: Shows YES/NO for the most recent game result
- **Score Link**: Displays score with direct link to ESPN game recap
- **Live Game Monitoring**: Shows live scores during games starting at tip-off
- **Season-Aware**: Automatically shows final game result during off-season
- **Tournament Coverage**: Includes both regular season and NCAA tournament games
- **Minimal Design**: Clean, centered layout matching the original diddukewin.com style

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

## Deployment

### Option 1: Vercel (Recommended)

1. Install Vercel CLI:
   ```bash
   npm install -g vercel
   ```

2. Deploy:
   ```bash
   vercel
   ```

3. Follow the prompts:
   - Set up and deploy? `Y`
   - Which scope? (select your account)
   - Link to existing project? `N`
   - Project name: `didkansaswin`
   - In which directory? `./`
   - Want to override settings? `N`

### Option 2: Railway

1. Create account at [railway.app](https://railway.app)
2. Click "New Project" → "Deploy from GitHub repo"
3. Connect your GitHub account and select your repository
4. Railway will automatically detect Node.js and deploy

## How It Works

1. **Daily Schedule Updates**: Every day at 8 AM, the app fetches the Kansas basketball schedule
2. **Game Monitoring**: Starting at tip-off time, checks every 5 minutes for live game updates
3. **Result Display**: Shows YES/NO based on whether Kansas won, with score and ESPN link
4. **Off-Season Handling**: During off-season, displays the final game result from the previous season

## Data Sources

- **Primary**: ESPN API (https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball)
- **Coverage**: Regular season and postseason (NCAA tournament) games
- **Game Links**: ESPN game recaps for official source

## File Structure

```
/
├── server.js          # Main Node.js server with ESPN API integration
├── package.json       # Dependencies
├── public/
│   ├── index.html     # Simple frontend matching diddukewin.com style
│   └── style.css      # (removed - styles are inline)
├── diddukewin.html    # Reference file (Duke version)
└── README.md          # This file
```

## Technical Details

- **Kansas Team ID**: 2305 (ESPN API identifier)
- **Season Types**: Fetches both regular season (2) and postseason (3) games
- **Live Game States**: 
  - `final`: Shows YES/NO with final score
  - `in_progress`: Shows LIVE with current score (yellow)
  - `scheduled`: Shows upcoming games during season
- **Off-Season Logic**: Automatically detects off-season and shows last completed game

## Environment Variables

No environment variables required - the app works out of the box!

## Troubleshooting

- **Loading message**: App is fetching data from ESPN API
- **API errors**: ESPN API is generally reliable, check console logs for details
- **Deployment issues**: Make sure Node.js version is 18+ (check `engines` in package.json)

## License

MIT License - feel free to modify and use!