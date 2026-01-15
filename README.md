# MyHockeyRankings Scraper

Apify actor that scrapes team information from MyHockeyRankings.com, including team names, rankings, ratings, cities, and states.

## Features

- Scrapes all teams from a rankings page
- Handles JavaScript-rendered content using Playwright
- Follows links to individual team pages to extract location data
- Supports pagination automatically
- Exports data in JSON, CSV, Excel, or other formats

## Input

The actor accepts the following input parameters:

| Field | Type | Description | Default |
|-------|------|-------------|---------|
| `rankingUrl` | String | The URL of the rankings page to scrape | `https://myhockeyrankings.com/rank.php?y=2025&v=123` |

### Example Input

```json
{
  "rankingUrl": "https://myhockeyrankings.com/rank.php?y=2025&v=123"
}
```

## Output

The actor exports the following data for each team:

```json
{
  "teamName": "Example Hockey Club",
  "rank": "1",
  "rating": "85.32",
  "city": "Boston",
  "state": "MA",
  "location": "Boston, MA",
  "teamUrl": "https://myhockeyrankings.com/team.php?t=12345"
}
```

### Output Fields

- `teamName` - The name of the hockey team
- `rank` - The team's ranking position
- `rating` - The team's numerical rating
- `city` - The city where the team is located
- `state` - The state where the team is located
- `location` - Full location string (City, State)
- `teamUrl` - URL to the team's detail page

## Usage on Apify Platform

1. Create a new actor on the Apify platform
2. Upload the following files:
   - `main.js`
   - `package.json`
   - `INPUT_SCHEMA.json`
3. Build the actor
4. Run with the desired input parameters
5. Download results in your preferred format (JSON, CSV, Excel)

## Local Development

### Prerequisites

- Node.js 16+
- npm or yarn

### Installation

```bash
npm install
```

### Running Locally

```bash
npm start
```

Or using Apify CLI:

```bash
apify run
```

## Notes

- The scraper uses Playwright in headless mode for better performance
- JavaScript rendering is required as the site loads data dynamically
- The actor respects rate limits and includes appropriate delays
- City/state extraction uses multiple strategies to find location data on team pages

## Troubleshooting

### No data scraped

- Check if the website structure has changed
- Verify the ranking URL is correct and accessible
- Check the Apify logs for specific errors

### Missing city/state data

- The team detail pages may have changed their HTML structure
- You may need to update the selectors in [main.js](main.js) (lines 105-150)
- Inspect a team page manually to find the correct location element

### Rate limiting or blocking

- The site may have rate limits or anti-scraping measures
- Consider adding more delays between requests
- Use residential proxies if needed (can be configured in Apify settings)

## Cost Estimates

Running this scraper for ~326 teams (11U division):
- Estimated runtime: 30-60 minutes
- Estimated cost: $0.50-$2.00 (depending on Apify plan and compute units)

## License

ISC
