module.exports = {
  '/api/football': {
    target: 'https://v3.football.api-sports.io',
    changeOrigin: true,
    secure: true,
    pathRewrite: { '^/api/football': '' },
    headers: { 'x-apisports-key': process.env.API_FOOTBALL_KEY || '' }
  },
  '/api/fd': {
    target: 'https://api.football-data.org',
    changeOrigin: true,
    secure: true,
    pathRewrite: { '^/api/fd': '/v4' },
    headers: { 'X-Auth-Token': process.env.FOOTBALL_DATA_TOKEN || '' }
  }
};