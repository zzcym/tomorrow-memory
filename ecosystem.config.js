module.exports = {
  apps: [{
    name: 'tomorrow-memory',
    script: 'server.js',
    instances: 1,
    exec_mode: 'fork',
    env: {
      NODE_ENV: 'production',
      PORT: 3001,
      JWT_SECRET: process.env.JWT_SECRET || '',
    },
    max_memory_restart: '300M',
    kill_timeout: 5000,
    listen_timeout: 10000,
    shutdown_with_message: true,
    log_date_format: 'YYYY-MM-DD HH:mm:ss',
    error_file: './logs/error.log',
    out_file: './logs/out.log',
    merge_logs: true,
    autorestart: true,
    watch: false,
  }],
};
