#!/bin/sh
# Yangi Ubuntu 24.04 serverni bir marta tayyorlash (root sifatida):
#   curl -fsSL https://raw.githubusercontent.com/soliha10/furniture/main/deploy/setup-server.sh | sh
# yoki repo klonlangandan keyin: sh deploy/setup-server.sh
set -eu

export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get upgrade -y
apt-get install -y git ufw fail2ban unattended-upgrades rclone

# Docker (rasmiy skript) + compose plugin
if ! command -v docker >/dev/null; then
  curl -fsSL https://get.docker.com | sh
fi

# Firewall: faqat SSH va web
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw allow 443/udp
ufw --force enable

# Xavfsizlik yangilanishlari avtomatik
dpkg-reconfigure -f noninteractive unattended-upgrades

# SSH parol bilan kirishni o'chirish — faqat kalit allaqachon qo'shilgan bo'lsa (aks holda serverga kira olmay qolasiz)
if [ -s /root/.ssh/authorized_keys ]; then
  printf 'PasswordAuthentication no\nKbdInteractiveAuthentication no\n' > /etc/ssh/sshd_config.d/99-mebel.conf
  systemctl reload ssh
  echo "SSH: parol bilan kirish o'chirildi"
else
  echo "OGOHLANTIRISH: /root/.ssh/authorized_keys bo'sh — SSH parol bilan kirish yoqiq qoldi"
fi

echo "Server tayyor. Keyingi qadam: docs/06-deploy.md, 3-bo'lim"
