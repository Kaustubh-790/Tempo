#!/bin/bash
set -e

echo "Starting EC2 provisioning..."

# 1. Update OS and install prerequisites
sudo apt-get update && sudo apt-get upgrade -y
sudo apt-get install -y curl git ufw nginx

# 2. Install Node.js 18
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# 3. Install PM2
sudo npm install -g pm2

# 4. Install Docker
sudo apt-get install -y docker.io
sudo systemctl start docker
sudo systemctl enable docker
sudo usermod -aG docker ubuntu

# 5. Run Redis locally in Docker
sudo docker run -d --name redis -p 6379:6379 --restart always redis

# 6. Clone the repository and install backend dependencies
cd /home/ubuntu
git clone https://github.com/Kaustubh-790/Chess-Server.git chess-server
cd chess-server/backend
sudo chown -R ubuntu:ubuntu /home/ubuntu/chess-server

# Install dependencies
npm install

# 7. Create Environment Variables (.env)
# Replace these values with your actual production secrets
cat <<EOF > .env
PORT=5000
NODE_ENV=production
REDIS_URL=redis://127.0.0.1:6379
MONGODB_URI=your_mongo_atlas_uri
JWT_SECRET=your_secret
CLIENT_URL=https://yourdomain.com
EOF

# 8. Start PM2 Cluster Mode
pm2 start server.js -i max --name chess-server
pm2 save
pm2 startup

# 9. Configure Nginx Reverse Proxy
# Change 'your-domain.com' to your actual domain name
sudo bash -c 'cat <<EOF > /etc/nginx/sites-available/chess
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://localhost:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
        proxy_cache_bypass \$http_upgrade;
    }
}
EOF'

# Enable Nginx site and restart
sudo ln -s /etc/nginx/sites-available/chess /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl restart nginx

# 10. Install Certbot (SSL)
sudo apt-get install -y certbot python3-certbot-nginx

# 11. Configure Firewall (UFW)
sudo ufw allow OpenSSH
sudo ufw allow 'Nginx Full'
sudo ufw --force enable

echo "Deployment complete! Application is running via PM2."
echo "Once you have pointed your DNS to this server's public IP, run:"
echo "sudo certbot --nginx -d your-domain.com"
