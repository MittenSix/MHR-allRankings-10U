import { Actor } from 'apify';
import { PlaywrightCrawler } from 'crawlee';

await Actor.init();

const input = await Actor.getInput();
const {
    rankingUrl = 'https://myhockeyrankings.com/rank.php?y=2025&v=123',
    maxTeams = 0  // 0 = unlimited (scrape all teams)
} = input || {};

console.log('Starting MyHockeyRankings scraper...');
console.log(`Target URL: ${rankingUrl}`);
console.log(`Max teams to scrape: ${maxTeams === 0 ? 'unlimited' : maxTeams}`);

// Store team links and basic info from the rankings page
const teamsData = [];

const crawler = new PlaywrightCrawler({
    headless: true,
    maxRequestsPerCrawl: 500, // Adjust based on number of teams
    requestHandlerTimeoutSecs: 60,

    async requestHandler({ page, request, log, enqueueLinks }) {
        const url = request.url;
        log.info(`Processing: ${url}`);

        // Check if this is the main rankings page
        if (url.includes('rank.php')) {
            log.info('Processing rankings page...');

            // Wait for the rankings table to load (JavaScript rendered)
            await page.waitForSelector('table', { timeout: 30000 });

            // Wait a bit more for JavaScript to fully populate the table
            await page.waitForTimeout(3000);

            // Extract team data from the rankings table
            const teams = await page.evaluate(() => {
                const results = [];

                // Find all table rows - adjust selector based on actual HTML structure
                const rows = document.querySelectorAll('table tr');

                rows.forEach((row) => {
                    // Look for team links within each row
                    const teamLink = row.querySelector('a[href*="team"]');
                    if (teamLink) {
                        const teamName = teamLink.textContent.trim();
                        const teamUrl = teamLink.href;

                        // Try to find rating - usually in a nearby cell
                        const cells = row.querySelectorAll('td');
                        let rating = null;
                        let rank = null;

                        // Common pattern: rank, team name, rating
                        cells.forEach((cell, index) => {
                            const text = cell.textContent.trim();
                            // Look for numeric values that could be rating
                            if (/^\d+\.\d+$/.test(text)) {
                                rating = text;
                            }
                            // Look for rank (usually first column with just a number)
                            if (index === 0 && /^\d+$/.test(text)) {
                                rank = text;
                            }
                        });

                        results.push({
                            teamName,
                            teamUrl,
                            rating,
                            rank
                        });
                    }
                });

                return results;
            });

            log.info(`Found ${teams.length} teams on this page`);

            // Limit teams if maxTeams is set
            const teamsToProcess = maxTeams > 0 ? teams.slice(0, maxTeams) : teams;
            log.info(`Processing ${teamsToProcess.length} teams (limit: ${maxTeams === 0 ? 'none' : maxTeams})`);

            // Store teams data temporarily
            teamsToProcess.forEach(team => teamsData.push(team));

            // Enqueue team detail pages (limited by maxTeams)
            for (const team of teamsToProcess) {
                if (team.teamUrl) {
                    await enqueueLinks({
                        urls: [team.teamUrl],
                        label: 'TEAM_DETAIL'
                    });
                }
            }

            // Check for pagination - look for "next" button or page links
            const nextPageButton = await page.$('a:has-text("Next"), a.next, button:has-text("Next")');
            if (nextPageButton) {
                await enqueueLinks({
                    selector: 'a:has-text("Next"), a.next',
                    label: 'RANKINGS_PAGE'
                });
            }

        }
        // Handle individual team detail pages
        else if (request.label === 'TEAM_DETAIL') {
            log.info('Processing team detail page...');

            // Wait for page to load
            await page.waitForSelector('body', { timeout: 30000 });
            await page.waitForTimeout(2000);

            // Take a screenshot for debugging
            await page.screenshot({ path: 'team-page-debug.png', fullPage: false });

            // Extract city, state, and logo information with enhanced debugging
            const teamDetails = await page.evaluate(() => {
                let city = null;
                let state = null;
                let fullLocation = null;
                let logoUrl = null;
                const debugInfo = [];

                // Extract team logo
                const logoSelectors = [
                    'img[class*="logo"]',
                    'img[class*="team"]',
                    'img[alt*="logo"]',
                    'img[alt*="team"]',
                    '.logo img',
                    '.team-logo img',
                    '.team-info img',
                    'meta[property="og:image"]'
                ];

                for (const selector of logoSelectors) {
                    const element = document.querySelector(selector);
                    if (element) {
                        if (element.tagName === 'IMG') {
                            logoUrl = element.src;
                            debugInfo.push(`Found logo at ${selector}: ${logoUrl}`);
                            break;
                        } else if (element.tagName === 'META') {
                            logoUrl = element.getAttribute('content');
                            debugInfo.push(`Found logo in meta tag: ${logoUrl}`);
                            break;
                        }
                    }
                }

                // If no logo found yet, try to find the first reasonable-sized image
                if (!logoUrl) {
                    const images = Array.from(document.querySelectorAll('img'));
                    for (const img of images) {
                        // Skip very small images (likely icons) and very large images (likely banners)
                        if (img.naturalWidth >= 50 && img.naturalWidth <= 500 &&
                            img.naturalHeight >= 50 && img.naturalHeight <= 500) {
                            logoUrl = img.src;
                            debugInfo.push(`Found logo by size heuristic: ${logoUrl} (${img.naturalWidth}x${img.naturalHeight})`);
                            break;
                        }
                    }
                }

                // Strategy 1: Look for specific selectors in the page
                const locationSelectors = [
                    '[class*="location"]',
                    '[class*="address"]',
                    '[class*="city"]',
                    '[class*="team-info"]',
                    'meta[property="og:locality"]',
                    'meta[property="og:region"]',
                    'h1', 'h2', 'h3', // Team names often in headers
                    '.info', '.details', '.profile'
                ];

                for (const selector of locationSelectors) {
                    const element = document.querySelector(selector);
                    if (element) {
                        const text = element.textContent || element.getAttribute('content');
                        debugInfo.push(`Found ${selector}: ${text?.substring(0, 100)}`);
                    }
                }

                // Strategy 2: Look for all <td> and <div> elements that might contain location
                const allText = Array.from(document.querySelectorAll('td, div, span'))
                    .map(el => el.textContent.trim())
                    .filter(text => text.length > 0 && text.length < 100);

                // Pattern: City, ST or City, State (with flexible capitalization)
                const locationPatterns = [
                    /([A-Z][a-z\s]+),\s*([A-Z]{2})\b/,  // City, ST
                    /([A-Z][a-z\s]+),\s*([A-Z][a-z]+)\b/,  // City, State
                ];

                for (const text of allText) {
                    for (const pattern of locationPatterns) {
                        const match = text.match(pattern);
                        if (match && !fullLocation) {
                            fullLocation = match[0];
                            city = match[1];
                            state = match[2];
                            debugInfo.push(`Matched pattern in: "${text}"`);
                            break;
                        }
                    }
                    if (fullLocation) break;
                }

                // Strategy 3: Get the entire page text for manual inspection
                const pageText = document.body.innerText.substring(0, 1000);

                return {
                    city,
                    state,
                    fullLocation,
                    logoUrl,
                    teamUrl: window.location.href,
                    debugInfo,
                    pageTextSample: pageText
                };
            });

            // Log debug information
            log.info('Team page debug info:', {
                url: request.url,
                foundLocation: teamDetails.fullLocation,
                foundLogo: teamDetails.logoUrl,
                debugInfo: teamDetails.debugInfo,
                pageTextSample: teamDetails.pageTextSample.substring(0, 200)
            });

            // Find the matching team from rankings data
            const teamFromRankings = teamsData.find(t => t.teamUrl === request.url);

            // Combine all data
            const completeTeamData = {
                teamName: teamFromRankings?.teamName || 'Unknown',
                rank: teamFromRankings?.rank || null,
                rating: teamFromRankings?.rating || null,
                city: teamDetails.city,
                state: teamDetails.state,
                location: teamDetails.fullLocation,
                logoUrl: teamDetails.logoUrl,
                teamUrl: request.url
            };

            log.info(`Scraped: ${completeTeamData.teamName} - ${completeTeamData.city}, ${completeTeamData.state} (logo: ${completeTeamData.logoUrl ? 'found' : 'not found'})`);

            // Push to dataset
            await Actor.pushData(completeTeamData);
        }
    },

    failedRequestHandler({ request, log }) {
        log.error(`Request ${request.url} failed multiple times`);
    },
});

// Start crawling
await crawler.run([rankingUrl]);

console.log('Scraping completed!');

await Actor.exit();
