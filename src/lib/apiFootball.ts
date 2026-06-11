// API-Football (api-football.com) adapter - the premium data source.
// Activated when the API_FOOTBALL_KEY environment variable is set.
// Provides player ratings and more detailed statistics than the free ESPN feed.

function isEnabled(): boolean {
  return Boolean(process.env.API_FOOTBALL_KEY);
}

export { isEnabled as apiFootballEnabled };
