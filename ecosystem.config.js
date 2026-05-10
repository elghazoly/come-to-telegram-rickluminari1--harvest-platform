module.exports = {
  apps: [
    {
      name: 'harvest-admin',
      cwd: '/var/www/harvest/apps/admin',
      script: 'node_modules/next/dist/bin/next',
      args: 'start -p 3000',
      env: { NODE_ENV: 'production', PORT: 3000 },
      max_memory_restart: '400M',
    },
    {
      name: 'harvest-teacher',
      cwd: '/var/www/harvest/apps/teacher',
      script: 'node_modules/next/dist/bin/next',
      args: 'start -p 3001',
      env: { NODE_ENV: 'production', PORT: 3001 },
      max_memory_restart: '400M',
    },
  ],
}
