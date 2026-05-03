/**
 * PM2 Ecosystem Configuration
 *
 * Usage:
 *   pm2 start ecosystem.config.js
 *   pm2 start ecosystem.config.js --env production
 *   pm2 monit
 *   pm2 logs stationery-api
 */

module.exports = {
  apps: [
    {
      name: 'stationery-api',
      script: 'src/server.js',
      instances: 'max',       // cluster mode — 1 worker per CPU
      exec_mode: 'cluster',
      autorestart: true,
      watch: false,
      max_memory_restart: '512M',
      max_restarts: 10,
      restart_delay: 5000,

      // Graceful shutdown — PM2 sends SIGINT, waits kill_timeout ms
      kill_timeout: 10000,
      listen_timeout: 8000,

      // Logs
      error_file: './logs/pm2-error.log',
      out_file: './logs/pm2-out.log',
      merge_logs: true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',

      // Environment defaults (development)
      env: {
        NODE_ENV: 'development',
        PORT: 4000,
      },

      // Production overrides
      env_production: {
        NODE_ENV: 'production',
        PORT: 4000,
      },
    },

    // Scheduled maintenance jobs — runs daily at 2 AM
    {
      name: 'stationery-jobs',
      script: 'src/scripts/jobs.js',
      instances: 1,
      cron_restart: '0 2 * * *',     // every day at 02:00
      autorestart: false,             // don't restart after exit
      watch: false,

      error_file: './logs/pm2-jobs-error.log',
      out_file: './logs/pm2-jobs-out.log',
      merge_logs: true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',

      env: {
        NODE_ENV: 'production',
      },
    },
  ],
};
