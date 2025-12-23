const puppeteer = require('puppeteer');
const puppeteerCore = require('puppeteer-core');
const http = require('http');
const { runAutoclickerSteps, checkIfBlocked } = require('../autoclicker2');

async function runAutoclicker(
  userData,
  jobId = null,
  onBrowserReady = null,
  checkStop = null,
) {
  console.log('🤖 Запуск автокликера 2...');
  console.log('📋 Данные:', userData);

  let browser = null;
  let shouldCloseBrowser = false;
  let userDataDir = null;

  try {
    // Пытаемся подключиться к существующему Chrome с remote debugging
    try {
      await new Promise((resolve, reject) => {
        const req = http.get('http://localhost:9222/json/version', res => {
          resolve();
        });
        req.on('error', reject);
        req.setTimeout(2000, () => reject(new Error('Timeout')));
      });

      console.log('🔗 Подключение к существующему Chrome на порту 9222...');
      browser = await puppeteerCore.connect({
        browserURL: 'http://localhost:9222',
        defaultViewport: null,
      });
      console.log('✅ Подключено к существующему Chrome!');
      shouldCloseBrowser = false; // Не закрываем существующий Chrome
      if (onBrowserReady) onBrowserReady(browser);
    } catch (e) {
      // Chrome не запущен с remote debugging, запускаем видимый Chrome для локальной разработки
      // На сервере (Railway) будет использоваться headless режим через переменную окружения
      const isHeadless =
        process.env.NODE_ENV === 'production' ||
        process.env.HEADLESS === 'true';
      console.log(
        `🚀 Chrome с remote debugging не найден, запускаю Chrome (видимый режим)...`,
      );
      const path = require('path');
      const os = require('os');
      userDataDir = path.join(
        os.tmpdir(),
        `chrome-user-data-${Date.now()}-${Math.random()
          .toString(36)
          .substring(7)}`,
      );
      // Используем системный Chrome вместо Chrome for Testing
      const platform = os.platform();
      let executablePath = null;

      if (platform === 'darwin') {
        executablePath =
          '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
      } else if (platform === 'win32') {
        executablePath =
          'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
      } else {
        executablePath = 'google-chrome';
      }

      browser = await puppeteer.launch({
        headless: false, // Всегда видимый режим для локальной разработки
        executablePath: executablePath, // Используем системный Chrome
        userDataDir: userDataDir,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-crash-reporter',
          '--disable-crashpad',
          '--disable-breakpad',
          '--disable-background-networking',
          '--disable-background-timer-throttling',
          '--disable-backgrounding-occluded-windows',
          '--disable-component-extensions-with-background-pages',
          '--disable-features=TranslateUI',
          '--disable-ipc-flooding-protection',
          '--disable-renderer-backgrounding',
          '--disable-sync',
          '--metrics-recording-only',
          '--mute-audio',
          '--no-first-run',
          '--no-default-browser-check',
          '--no-pings',
          '--use-mock-keychain',
          '--crash-dumps-dir=/tmp',
        ],
      });
      console.log(`✅ Chrome запущен (видимый режим)`);
      shouldCloseBrowser = true; // Нужно закрыть после использования

      // Сохраняем PID процесса Chrome для принудительной остановки
      try {
        const process = browser.process();
        if (process && process.pid) {
          // Передаем PID через callback
          if (onBrowserReady) {
            onBrowserReady(browser, process.pid, userDataDir);
          }
        } else {
          if (onBrowserReady) onBrowserReady(browser);
        }
      } catch (e) {
        if (onBrowserReady) onBrowserReady(browser);
      }
    }

    let page = await browser.newPage();
    await page.setViewport({ width: 1920, height: 1080 });

    // Включаем человеко-подобное поведение
    const humanDelay = (min = 500, max = 2000) => {
      const delay = Math.floor(Math.random() * (max - min + 1)) + min;
      return new Promise(resolve => setTimeout(resolve, delay));
    };

    const humanScroll = async () => {
      const scrollSteps = Math.floor(Math.random() * 2) + 1;
      for (let i = 0; i < scrollSteps; i++) {
        const scrollY = Math.floor(Math.random() * 300) + 100;
        await page.evaluate(y => {
          window.scrollBy(0, y);
        }, scrollY);
        await humanDelay(200, 400);
      }
    };

    const humanMouseMove = async element => {
      if (element) {
        const box = await element.boundingBox().catch(() => null);
        if (box) {
          const steps = 5;
          for (let i = 1; i <= steps; i++) {
            const x = box.x + (box.width / 2) * (i / steps);
            const y = box.y + (box.height / 2) * (i / steps);
            await page.mouse.move(x, y, { steps: 10 });
            await humanDelay(50, 150);
          }
        }
      }
    };

    page._humanDelay = humanDelay;
    page._humanScroll = humanScroll;
    page._humanMouseMove = humanMouseMove;

    console.log('✅ Человеко-подобное поведение включено');

    // Логика повторных попыток
    const MAX_RETRIES = 5;
    const RETRY_DELAY = 10000;
    let attempt = 0;
    let success = false;
    let finalResult = null;

    while (attempt < MAX_RETRIES && !success) {
      // Проверяем, не запрошена ли остановка
      if (checkStop && checkStop()) {
        console.log('🛑 Получен запрос на остановку автокликера');
        throw new Error('STOPPED');
      }

      attempt++;
      if (attempt > 1) {
        // Проверяем остановку перед задержкой
        if (checkStop && checkStop()) {
          console.log('🛑 Получен запрос на остановку автокликера');
          throw new Error('STOPPED');
        }

        console.log(`\n🔄 Попытка ${attempt}/${MAX_RETRIES}`);
        console.log(
          `⏳ Ожидание ${
            RETRY_DELAY / 1000
          } секунд перед повторной попыткой...`,
        );

        // Проверяем остановку во время задержки (каждую секунду)
        for (let i = 0; i < RETRY_DELAY / 1000; i++) {
          if (checkStop && checkStop()) {
            console.log('🛑 Получен запрос на остановку автокликера');
            throw new Error('STOPPED');
          }
          await new Promise(resolve => setTimeout(resolve, 1000));
        }

        // Проверяем остановку перед созданием новой страницы
        if (checkStop && checkStop()) {
          console.log('🛑 Получен запрос на остановку автокликера');
          throw new Error('STOPPED');
        }

        // Закрываем старую страницу и создаем новую
        try {
          await page.close();
        } catch (e) {}
        page = await browser.newPage();
        await page.setViewport({ width: 1920, height: 1080 });

        // Восстанавливаем человеко-подобное поведение
        page._humanDelay = humanDelay;
        page._humanScroll = humanScroll;
        page._humanMouseMove = humanMouseMove;
      }

      try {
        // Проверяем остановку перед каждым шагом
        if (checkStop && checkStop()) {
          console.log('🛑 Получен запрос на остановку автокликера');
          throw new Error('STOPPED');
        }

        console.log(
          `\n🚀 Начинаем выполнение шагов автокликера (попытка ${attempt})...`,
        );
        // Запускаем шаги автокликера
        const result = await runAutoclickerSteps(page, userData);

        if (await checkIfBlocked(page)) {
          throw new Error('BLOCKED');
        }

        if (result && result.hasCitas === false) {
          console.log('\n🔄 Записей нет, повторяем процесс...');
          const retryInterval = 30000;
          console.log(
            `⏳ Ожидание ${
              retryInterval / 1000
            } секунд перед повторной попыткой...`,
          );
          await new Promise(resolve => setTimeout(resolve, retryInterval));
          continue;
        } else if (result && result.hasCitas === true) {
          success = true;
          finalResult = result;
          break;
        } else {
          success = true;
          finalResult = result;
        }
      } catch (error) {
        if (error.message === 'BLOCKED') {
          console.log(`\n❌ Попытка ${attempt} заблокирована сайтом`);
          if (attempt < MAX_RETRIES) {
            continue;
          } else {
            throw new Error(
              'Достигнуто максимальное количество попыток. Сайт заблокирован.',
            );
          }
        } else {
          console.error(`\n❌ Ошибка на попытке ${attempt}:`, error.message);
          if (attempt < MAX_RETRIES) {
            continue;
          } else {
            throw error;
          }
        }
      }
    }

    return finalResult;
  } catch (error) {
    if (error.message === 'STOPPED') {
      console.log('✅ Автокликер 2 остановлен пользователем');
    } else {
      console.error('❌ Ошибка в автокликере 2:', error);
    }
    throw error;
  } finally {
    if (browser) {
      try {
        // Закрываем все страницы перед закрытием браузера
        const pages = await browser.pages();
        for (const page of pages) {
          try {
            await page.close();
          } catch (e) {
            // Игнорируем ошибки
          }
        }

        if (shouldCloseBrowser) {
          await browser.close();
          console.log('✅ Браузер закрыт');
        } else {
          await browser.disconnect();
          console.log('✅ Отключено от Chrome (Chrome продолжает работать)');
        }
      } catch (error) {
        console.error('Ошибка при закрытии браузера:', error);
      }
    }
  }
}

module.exports = { runAutoclicker };
