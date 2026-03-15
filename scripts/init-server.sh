#!/bin/bash
# ============================================
# Yuujin Server - ECS 首次初始化脚本
# 在阿里云 ECS 上执行一次即可
# ============================================

set -e

echo "=== Yuujin Server 初始化 ==="

# 1. Install Docker (if not installed)
if ! command -v docker &> /dev/null; then
  echo ">> 安装 Docker..."
  curl -fsSL https://get.docker.com | sh
  systemctl enable docker
  systemctl start docker
  echo ">> Docker 安装完成"
else
  echo ">> Docker 已安装，跳过"
fi

# 2. Install Docker Compose plugin (if not installed)
if ! docker compose version &> /dev/null; then
  echo ">> 安装 Docker Compose 插件..."
  apt-get update && apt-get install -y docker-compose-plugin
  echo ">> Docker Compose 安装完成"
else
  echo ">> Docker Compose 已安装，跳过"
fi

# 3. Create project directory
echo ">> 创建项目目录..."
mkdir -p /opt/yuujin/nginx/ssl
mkdir -p /opt/yuujin/database

# 4. Generate .env file
if [ ! -f /opt/yuujin/.env ]; then
  echo ">> 生成 .env 文件..."

  # Generate random passwords
  MYSQL_ROOT_PWD=$(openssl rand -base64 24 | tr -dc 'a-zA-Z0-9' | head -c 24)
  MYSQL_PWD=$(openssl rand -base64 24 | tr -dc 'a-zA-Z0-9' | head -c 24)
  JWT_SEC=$(openssl rand -base64 32 | tr -dc 'a-zA-Z0-9' | head -c 32)
  EGG_K=$(openssl rand -base64 32 | tr -dc 'a-zA-Z0-9' | head -c 32)

  cat > /opt/yuujin/.env << EOF
# ============================================
# Yuujin Production Environment
# Generated at: $(date)
# ============================================

# ACR (filled by CI/CD)
ACR_REGISTRY=registry.cn-hangzhou.aliyuncs.com
ACR_NAMESPACE=yuujin
IMAGE_TAG=latest

# App
EGG_KEYS=${EGG_K}

# MySQL
MYSQL_ROOT_PASSWORD=${MYSQL_ROOT_PWD}
MYSQL_USER=yuujin
MYSQL_PASSWORD=${MYSQL_PWD}
MYSQL_DATABASE=yuujin

# Redis
REDIS_PASSWORD=

# JWT
JWT_SECRET=${JWT_SEC}

# AI Provider (choose one: claude / qianwen / deepseek / ernie)
AI_PROVIDER=ernie
CLAUDE_API_KEY=
CLAUDE_MODEL=claude-haiku-4-5-20251001
QIANWEN_API_KEY=
DEEPSEEK_API_KEY=
ERNIE_API_KEY=YOUR_ERNIE_API_KEY_HERE
ERNIE_MODEL=ernie-speed
EOF

  echo ""
  echo "======================================"
  echo "  .env 已生成: /opt/yuujin/.env"
  echo "  请编辑填入 AI API 密钥！"
  echo "  vi /opt/yuujin/.env"
  echo "======================================"
else
  echo ">> .env 已存在，跳过"
fi

# 5. Open firewall ports
echo ">> 配置防火墙（如有）..."
if command -v ufw &> /dev/null; then
  ufw allow 80/tcp
  ufw allow 443/tcp
  echo ">> UFW 规则已添加"
elif command -v firewall-cmd &> /dev/null; then
  firewall-cmd --permanent --add-port=80/tcp
  firewall-cmd --permanent --add-port=443/tcp
  firewall-cmd --reload
  echo ">> firewalld 规则已添加"
else
  echo ">> 未检测到防火墙工具，请手动确认 80/443 端口已开放"
fi

echo ""
echo "=== 初始化完成 ==="
echo ""
echo "下一步操作："
echo "  1. 编辑 .env 填入 AI 密钥:  vi /opt/yuujin/.env"
echo "  2. 在阿里云安全组中开放 80 和 443 端口"
echo "  3. 推送代码到 GitHub main 分支触发自动部署"
echo "  4. 首次部署后执行 seed:  docker exec yuujin-app npm run seed"
echo ""
