module.exports = {
  apps: [
    {
      name: 'whatsapp-connector',
      script: 'server.mjs',
      cwd: __dirname,
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '500M',
      restart_delay: 2000,
      exp_backoff_restart_delay: 100,
      env: {
        NODE_ENV: 'production',
        WHATSAPP_CONNECTOR_PORT: 3001
      }
    }
  ]
};
