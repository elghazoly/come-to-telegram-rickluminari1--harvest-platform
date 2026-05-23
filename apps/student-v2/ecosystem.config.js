module.exports = {
  apps: [{
    name: 'harvest-student-v2',
    script: '/var/www/harvest/apps/student-v2/server.js',
    env: {
      PORT: 3004,
      ANTHROPIC_API_KEY: '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'
    }
  }]
}
