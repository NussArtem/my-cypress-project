#!/usr/bin/env node

require('dotenv').config();
const { sendTelegramNotification } = require('./autoclicker');
const { exec } = require('child_process');
const os = require('os');

async function testNotifications() {
  console.log('🧪 Тестирование уведомлений...\n');

  // Тест голосовых уведомлений
  console.log('🔊 Тест голосовых уведомлений...');

  for (let i = 0; i < 3; i++) {
    console.log(`   Уведомление ${i + 1}/3`);

    if (os.platform() === 'darwin') {
      exec(
        'say "Тестовое уведомление! Проверка голосовых уведомлений!"',
        () => {},
      );
      exec('afplay /System/Library/Sounds/Glass.aiff', () => {});
    } else if (os.platform() === 'linux') {
      exec(
        'spd-say "Тестовое уведомление! Проверка голосовых уведомлений!"',
        () => {},
      );
      exec(
        'paplay /usr/share/sounds/freedesktop/stereo/complete.oga',
        () => {},
      );
    } else if (os.platform() === 'win32') {
      exec(
        'powershell -c "[console]::beep(800,500); [console]::beep(1000,500)"',
        () => {},
      );
    }

    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  console.log('✅ Голосовые уведомления отправлены\n');

  // Тест Telegram уведомлений
  console.log('📱 Тест Telegram уведомлений...');

  const testMessage = `🧪 <b>ТЕСТОВОЕ УВЕДОМЛЕНИЕ</b>

✅ Это тестовое сообщение для проверки работы Telegram уведомлений

📅 Время: ${new Date().toLocaleString('ru-RU')}

🔔 Если вы видите это сообщение, значит Telegram уведомления работают правильно!`;

  try {
    console.log('📤 Отправка на chat_id: 402683584');
    await sendTelegramNotification(testMessage, ['402683584']);
    console.log('✅ Telegram уведомление отправлено на 402683584');
  } catch (error) {
    console.error('❌ Ошибка отправки Telegram уведомления:', error.message);
  }

  console.log('\n✅ Тестирование завершено!');
}

testNotifications().catch(console.error);
