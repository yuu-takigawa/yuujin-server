#!/bin/bash

# ============================================================
# Let's Encrypt 证书初始化脚本
# 用法: bash nginx/init-letsencrypt.sh
# 在 /opt/yuujin 目录下执行
# ============================================================

set -e

DOMAIN="api.yuujin.cc"
EMAIL="suhangdev280646@gmail.com"  # 证书过期提醒邮箱
COMPOSE_FILE="docker-compose.prod.yml"
RSA_KEY_SIZE=4096

echo ">>> 1. 创建临时自签名证书（让 nginx 能先启动）"

# 创建临时证书目录
docker compose -f $COMPOSE_FILE run --rm --entrypoint "" certbot sh -c "
  mkdir -p /etc/letsencrypt/live/$DOMAIN
  openssl req -x509 -nodes -newkey rsa:1024 \
    -days 1 \
    -keyout /etc/letsencrypt/live/$DOMAIN/privkey.pem \
    -out /etc/letsencrypt/live/$DOMAIN/fullchain.pem \
    -subj '/CN=localhost'
"

echo ">>> 2. 启动 nginx（使用临时证书）"
docker compose -f $COMPOSE_FILE up -d nginx

echo ">>> 3. 删除临时证书"
docker compose -f $COMPOSE_FILE run --rm --entrypoint "" certbot sh -c "
  rm -rf /etc/letsencrypt/live/$DOMAIN
  rm -rf /etc/letsencrypt/archive/$DOMAIN
  rm -rf /etc/letsencrypt/renewal/$DOMAIN.conf
"

echo ">>> 4. 申请 Let's Encrypt 真实证书"
docker compose -f $COMPOSE_FILE run --rm certbot certonly \
  --webroot \
  --webroot-path=/var/www/certbot \
  --email $EMAIL \
  --agree-tos \
  --no-eff-email \
  --rsa-key-size $RSA_KEY_SIZE \
  -d $DOMAIN

echo ">>> 5. 重新加载 nginx（使用真实证书）"
docker compose -f $COMPOSE_FILE exec nginx nginx -s reload

echo ""
echo "========================================="
echo "  证书申请成功！"
echo "  域名: https://$DOMAIN"
echo "  证书自动续签已配置（certbot 容器）"
echo "========================================="
