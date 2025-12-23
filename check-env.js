#!/usr/bin/env node

require('dotenv').config();

console.log('🔍 Проверка переменных окружения:\n');
console.log('TELEGRAM_BOT_TOKEN:', process.env.TELEGRAM_BOT_TOKEN ? `${process.env.TELEGRAM_BOT_TOKEN.substring(0, 10)}...` : 'НЕ УСТАНОВЛЕН');
console.log('TELEGRAM_CHAT_IDS:', process.env.TELEGRAM_CHAT_IDS || 'НЕ УСТАНОВЛЕН');
console.log('PORT:', process.env.PORT || 'НЕ УСТАНОВЛЕН (будет использован 3000)');

