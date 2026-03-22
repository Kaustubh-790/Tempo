module.exports = {
  apps: [
    {
      name: "chess-engine",
      script: "./server.js",
      instances: "max", 
      exec_mode: "cluster", 
      env: {
        NODE_ENV: "development",
        PORT: 5000,
      },
      env_production: {
        NODE_ENV: "production",
        PORT: 80,
      },
      watch: false, 
      max_memory_restart: "1G", 
    },
  ],
};
