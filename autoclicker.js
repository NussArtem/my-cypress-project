#!/usr/bin/env node

const puppeteerCore = require('puppeteer-core');

const URL = 'https://icp.administracionelectronica.gob.es/icpplus/index.html';
const PROVINCIA = 'Alicante';
const OFICINA = 'CNP Alcoy, Placeta Les Xiques, S/N, Alcoy';
const TRAMITE =
  'POLICÍA - TOMA DE HUELLAS (EXPEDICIÓN DE TARJETA) INICIAL, RENOVACIÓN, DUPLICADO Y LEY 14/2013';

const MAX_RETRIES = 5;
const RETRY_DELAY = 10000;

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_IDS = process.env.TELEGRAM_CHAT_IDS
  ? process.env.TELEGRAM_CHAT_IDS.split(',').map(id => id.trim())
  : ['402683584'];

async function checkIfBlocked(page) {
  try {
    const pageText = await page
      .evaluate(() => {
        return document.body ? document.body.innerText : '';
      })
      .catch(() => '');
    const pageTitle = await page.title().catch(() => '');
    const pageContent = await page.content().catch(() => '');
    const isBlocked =
      pageText.includes('Request Rejected') ||
      pageText.includes('requested URL was rejected') ||
      pageText.includes('Please consult with your administrador') ||
      pageTitle.includes('Request Rejected') ||
      pageContent.includes('Request Rejected');
    if (isBlocked) {
      const supportId = pageText.match(/support ID is: <([^>]+)>/);
      if (supportId) {
        console.log(
          `\n❌ Сайт заблокировал запрос! Support ID: ${supportId[1]}`,
        );
      } else {
        console.log('\n❌ Сайт заблокировал запрос!');
      }
      return true;
    }
    return false;
  } catch (e) {
    return false;
  }
}

async function getTelegramChatIds() {
  if (!TELEGRAM_BOT_TOKEN) {
    console.log('   ⚠️ Токен бота не указан');
    return {};
  }

  try {
    const https = require('https');
    const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getUpdates`;

    console.log('   🔍 Запрос к Telegram API: getUpdates...');

    return new Promise(resolve => {
      const req = https.get(url, res => {
        let responseData = '';
        res.on('data', chunk => {
          responseData += chunk;
        });
        res.on('end', () => {
          try {
            const response = JSON.parse(responseData);
            const chatIdMap = {};

            if (response.ok && response.result) {
              console.log(
                `   📋 Получено обновлений: ${response.result.length}`,
              );
              for (const update of response.result) {
                const message = update.message || update.edited_message;
                if (message && message.chat) {
                  const chat = message.chat;
                  const username = chat.username;
                  const chatId = chat.id;

                  if (username) {
                    chatIdMap[`@${username}`] = chatId;
                    console.log(
                      `   ✅ Найден chat_id: @${username} -> ${chatId}`,
                    );
                  }
                  chatIdMap[chatId] = chatId;
                }
              }
            } else {
              console.log(
                `   ⚠️ Telegram API вернул ошибку: ${
                  response.description || 'Unknown'
                }`,
              );
              console.log(
                `   📄 Полный ответ: ${JSON.stringify(response, null, 2)}`,
              );
            }

            if (Object.keys(chatIdMap).length === 0) {
              console.log(
                '   ⚠️ Chat IDs не найдены. Убедитесь, что вы написали боту сообщение.',
              );
            }

            resolve(chatIdMap);
          } catch (e) {
            console.log(`   ⚠️ Ошибка парсинга getUpdates: ${e.message}`);
            console.log(`   📄 Ответ API: ${responseData.substring(0, 500)}`);
            resolve({});
          }
        });
      });

      req.on('error', error => {
        console.log(`   ⚠️ Ошибка получения chat_ids: ${error.message}`);
        resolve({});
      });

      req.setTimeout(5000, () => {
        req.destroy();
        console.log('   ⚠️ Таймаут при получении chat_ids');
        resolve({});
      });
    });
  } catch (error) {
    console.log(`   ⚠️ Ошибка получения chat_ids: ${error.message}`);
    return {};
  }
}

async function sendTelegramNotification(message, chatIds = null) {
  if (!TELEGRAM_BOT_TOKEN) {
    console.log('   ⚠️ Telegram уведомления отключены (не указан токен)');
    return [];
  }

  let targetChatIds = chatIds || TELEGRAM_CHAT_IDS;

  if (!targetChatIds || targetChatIds.length === 0) {
    console.log('   ⚠️ Telegram уведомления отключены (не указаны chat_id)');
    return [];
  }

  console.log('   🔍 Получение chat_id из Telegram API...');
  const chatIdMap = await getTelegramChatIds();
  console.log(
    `   📋 Найденные chat_ids: ${JSON.stringify(chatIdMap, null, 2)}`,
  );

  const resolvedChatIds = targetChatIds.map(chatId => {
    if (chatId.startsWith('@')) {
      const numericId = chatIdMap[chatId];
      if (numericId) {
        console.log(`   ✅ Найден chat_id для ${chatId}: ${numericId}`);
        return numericId;
      } else {
        console.log(
          `   ⚠️ Chat_id для ${chatId} не найден в getUpdates, пробуем использовать username напрямую`,
        );
        return chatId;
      }
    }
    return chatId;
  });

  console.log(`   📤 Будем отправлять на: ${resolvedChatIds.join(', ')}`);

  const https = require('https');
  const results = [];

  for (let i = 0; i < resolvedChatIds.length; i++) {
    let chatId = resolvedChatIds[i];
    const originalChatId = targetChatIds[i];

    if (!chatId.startsWith('@') && !isNaN(chatId)) {
      chatId = parseInt(chatId, 10);
    }

    try {
      const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
      const payload = {
        chat_id: chatId,
        text: message,
        parse_mode: 'HTML',
      };

      const data = JSON.stringify(payload);

      const options = {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(data, 'utf8'),
        },
      };

      await new Promise(resolve => {
        const req = https.request(url, options, res => {
          let responseData = '';
          res.on('data', chunk => {
            responseData += chunk;
          });
          res.on('end', () => {
            console.log(`   📥 Ответ от Telegram API для ${originalChatId}:`);
            console.log(`      HTTP статус: ${res.statusCode}`);
            console.log(`      Ответ: ${responseData.substring(0, 300)}`);

            if (res.statusCode === 200) {
              try {
                const response = JSON.parse(responseData);
                if (response.ok) {
                  console.log(
                    `   ✅ Telegram уведомление отправлено на ${originalChatId}`,
                  );
                  results.push({ chatId: originalChatId, success: true });
                } else {
                  console.log(
                    `   ❌ Ошибка отправки на ${originalChatId}: ${
                      response.description || 'Unknown error'
                    }`,
                  );
                  console.log(
                    `   📄 Полный ответ: ${JSON.stringify(response, null, 2)}`,
                  );
                  results.push({
                    chatId: originalChatId,
                    success: false,
                    error: response.description,
                  });
                }
              } catch (e) {
                console.log(`   ⚠️ Ошибка парсинга ответа: ${e.message}`);
                console.log(
                  `   ✅ Предполагаем успех для ${originalChatId} (HTTP 200)`,
                );
                results.push({ chatId: originalChatId, success: true });
              }
            } else {
              console.log(
                `   ❌ Ошибка отправки на ${originalChatId}: HTTP ${res.statusCode}`,
              );
              try {
                const errorResponse = JSON.parse(responseData);
                console.log(
                  `   📄 Детали ошибки: ${JSON.stringify(
                    errorResponse,
                    null,
                    2,
                  )}`,
                );
              } catch (e) {
                console.log(`   📄 Ответ (не JSON): ${responseData}`);
              }
              results.push({
                chatId: originalChatId,
                success: false,
                error: res.statusCode,
              });
            }
            resolve();
          });
        });

        req.on('error', error => {
          console.log(
            `   ⚠️ Ошибка отправки на ${originalChatId}: ${error.message}`,
          );
          results.push({
            chatId: originalChatId,
            success: false,
            error: error.message,
          });
          resolve();
        });

        req.write(data);
        req.end();
      });
    } catch (error) {
      console.log(
        `   ⚠️ Ошибка отправки на ${originalChatId}: ${error.message}`,
      );
      results.push({
        chatId: originalChatId,
        success: false,
        error: error.message,
      });
    }
  }

  return results;
}

async function getUserDataFromForm(browser) {
  const path = require('path');

  const formPath = path.join(__dirname, 'data-form.html');
  const formUrl = `file://${formPath}`;

  console.log('📋 Открываю форму для ввода данных...');
  const page = await browser.newPage();
  await page.goto(formUrl);
  await page.setViewport({ width: 800, height: 600 });

  console.log('⏳ Ожидание ввода данных в форме...');
  console.log(
    '💡 Заполните форму в открывшемся окне Chrome и нажмите "Запустить автокликер"',
  );

  const userData = await page.evaluate(() => {
    return new Promise(resolve => {
      const checkData = setInterval(() => {
        if (window.userData) {
          clearInterval(checkData);
          resolve(window.userData);
        }
      }, 100);
    });
  });

  await page.close();

  console.log('\n✅ Данные получены из формы:');
  console.log(`   Тип документа: ${userData.tipoDocumento}`);
  console.log(`   Номер NIE: ${userData.numeroNie}`);
  console.log(`   Имя: ${userData.nombreCompleto}`);
  console.log(`   Страна: ${userData.paisCiudadania}\n`);

  return userData;
}

async function runAutoclickerSteps(page, userData) {
  const { numeroNie, nombreCompleto, paisCiudadania, tipoDocumento } = userData;

  try {
    console.log('\n📡 Шаг 1: Переход на сайт...');
    console.log(`   URL: ${URL}`);
    await page.goto(URL, {
      waitUntil: 'networkidle2',
      timeout: 60000,
    });
    console.log('✅ Страница загружена');

    if (page._humanScroll) {
      console.log('   👤 Имитация человеческой прокрутки...');
      await page._humanScroll();
    }

    if (await checkIfBlocked(page)) {
      throw new Error('BLOCKED');
    }

    console.log('   ⏳ Ожидание полной загрузки контента (1 секунда)...');
    await new Promise(resolve => setTimeout(resolve, 1000));

    try {
      const pageTitle = await page.title();
      const pageUrl = page.url();
      console.log(`   📄 Заголовок страницы: ${pageTitle}`);
      console.log(`   📍 URL: ${pageUrl}`);
    } catch (e) {
      console.log('   ⚠️ Не удалось получить информацию о странице');
    }

    const hasContent = await page
      .evaluate(() => {
        return document.body && document.body.innerText.length > 100;
      })
      .catch(() => false);
    if (!hasContent) {
      console.log('   ⚠️ Контент страницы не загружен, ждем еще 1 секунду...');
      await new Promise(resolve => setTimeout(resolve, 1000));
    } else {
      console.log('   ✅ Контент страницы загружен');
    }

    console.log('   ⏳ Ожидание появления элементов формы (0.5 секунды)...');
    await new Promise(resolve => setTimeout(resolve, 500));

    const hasSelects = await page
      .evaluate(() => {
        const selects = document.querySelectorAll('select');
        return selects.length > 0;
      })
      .catch(() => false);
    if (!hasSelects) {
      console.log('   ⚠️ Селекты не найдены, ждем еще 1 секунду...');
      await new Promise(resolve => setTimeout(resolve, 1000));
    } else {
      console.log('   ✅ Селекты найдены, страница готова');
    }

    console.log(
      '   ⏳ Финальное ожидание перед выбором провинции (0.5 секунды)...',
    );
    await new Promise(resolve => setTimeout(resolve, 500));

    console.log('\n📡 Шаг 2: Выбор провинции...');
    console.log(`   Провинция: ${PROVINCIA}`);

    const provinciaSelectors = [
      'select[name*="provincia" i]',
      'select[id*="provincia" i]',
      'select[name*="Provincia" i]',
      'select[id*="Provincia" i]',
      'select',
    ];

    let provinciaSelect = null;
    for (const selector of provinciaSelectors) {
      provinciaSelect = await page.$(selector).catch(() => null);
      if (provinciaSelect) {
        console.log(`   ✅ Найден селект: ${selector}`);
        break;
      }
    }

    if (!provinciaSelect) {
      const allSelects = await page.$$('select');
      console.log(`   ⚠️ Найдено селектов: ${allSelects.length}`);
      if (allSelects.length > 0) {
        const selectInfo = await page.evaluate(() => {
          const selects = Array.from(document.querySelectorAll('select'));
          return selects.map(s => ({
            name: s.name || '',
            id: s.id || '',
            options: Array.from(s.options)
              .map(o => o.text)
              .slice(0, 5),
          }));
        });
        console.log(
          '   Отладка селектов:',
          JSON.stringify(selectInfo, null, 2),
        );
      }
      throw new Error('Селект провинции не найден');
    }

    console.log('   🖱️ Открываем селект...');
    if (page._humanMouseMove) {
      await page._humanMouseMove(provinciaSelect);
      if (page._humanDelay) await page._humanDelay(200, 500);
    }
    await provinciaSelect.click();
    if (page._humanDelay) {
      await page._humanDelay(200, 500);
    } else {
      await new Promise(resolve => setTimeout(resolve, 300));
    }

    console.log(`   🔍 Ищем опцию "${PROVINCIA}"...`);
    const selected = await page.evaluate(provincia => {
      const selects = Array.from(document.querySelectorAll('select'));
      for (const select of selects) {
        const options = Array.from(select.options);
        for (let i = 0; i < options.length; i++) {
          const optionText = options[i].text.trim();
          if (optionText.includes(provincia) || optionText === provincia) {
            select.selectedIndex = i;

            select.dispatchEvent(new Event('change', { bubbles: true }));
            return true;
          }
        }
      }
      return false;
    }, PROVINCIA);

    if (!selected) {
      const options = await page.evaluate(() => {
        const selects = Array.from(document.querySelectorAll('select'));
        return selects.map(s => ({
          name: s.name || s.id,
          options: Array.from(s.options).map(o => o.text.trim()),
        }));
      });
      console.log('   ⚠️ Доступные опции:', JSON.stringify(options, null, 2));
      throw new Error(`Опция "${PROVINCIA}" не найдена`);
    }

    console.log(`   ✅ Провинция "${PROVINCIA}" выбрана`);

    console.log('   ⏳ Ожидание обработки выбора провинции (1 секунда)...');
    await new Promise(resolve => setTimeout(resolve, 1000));

    console.log(
      '   🔍 Проверка стабильности страницы после выбора провинции...',
    );
    let pageStableAfterProvincia = false;
    for (let i = 0; i < 2; i++) {
      const pageLoaded = await page
        .evaluate(() => {
          return document.body && document.body.innerText.length > 100;
        })
        .catch(() => false);
      if (pageLoaded) {
        const pageReady = await page
          .evaluate(() => {
            return document.readyState === 'complete';
          })
          .catch(() => false);
        if (pageReady) {
          console.log(`   ✅ Страница стабильна (проверка ${i + 1}/2)`);
          await new Promise(resolve => setTimeout(resolve, 500));
          pageStableAfterProvincia = true;
          break;
        } else {
          console.log(
            `   ⏳ Страница загружается, ждем еще 1 секунду (проверка ${
              i + 1
            }/2)...`,
          );
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      } else {
        console.log(
          `   ⏳ Контент не загружен, ждем еще 1 секунду (проверка ${
            i + 1
          }/2)...`,
        );
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
    if (!pageStableAfterProvincia) {
      console.log('   ⚠️ Страница не стабилизировалась, но продолжаем...');
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    if (await checkIfBlocked(page)) {
      throw new Error('BLOCKED');
    }

    console.log(
      '   ⏳ Финальное ожидание перед поиском кнопки Aceptar (1 секунда)...',
    );
    await new Promise(resolve => setTimeout(resolve, 1000));

    console.log('\n📡 Шаг 3: Нажатие кнопки "Aceptar"...');

    const aceptarSelectors = [
      'button:has-text("Aceptar")',
      'input[type="submit"][value*="Aceptar" i]',
      'button[type="submit"]',
      'input[type="button"][value*="Aceptar" i]',
      'button',
      'input[type="submit"]',
    ];

    let aceptarButton = null;
    for (const selector of aceptarSelectors) {
      try {
        if (selector.includes('has-text')) {
          const [button] = await page.$x(
            "//button[contains(text(), 'Aceptar')] | //input[@type='submit' and contains(@value, 'Aceptar')]",
          ); //button[contains(text(), 'Aceptar')] | //input[@type='submit' and contains(@value, 'Aceptar')]");
          if (button) {
            aceptarButton = button;
            break;
          }
        } else {
          aceptarButton = await page.$(selector).catch(() => null);
          if (aceptarButton) {
            const buttonText = await page.evaluate(el => {
              return el.textContent || el.value || '';
            }, aceptarButton);
            if (buttonText.toLowerCase().includes('aceptar')) {
              console.log(`   ✅ Найдена кнопка: "${buttonText}"`);
              break;
            }
          }
        }
      } catch (e) {
        continue;
      }
    }

    if (!aceptarButton) {
      const buttons = await page.evaluate(() => {
        const allButtons = Array.from(
          document.querySelectorAll(
            'button, input[type="submit"], input[type="button"]',
          ),
        );
        return allButtons.map(b => ({
          tag: b.tagName,
          text: b.textContent || b.value || '',
          type: b.type || '',
        }));
      });
      console.log('   ⚠️ Найденные кнопки:', JSON.stringify(buttons, null, 2));
      throw new Error('Кнопка "Aceptar" не найдена');
    }

    console.log('   🖱️ Нажимаем кнопку "Aceptar"...');

    if (page._humanMouseMove) {
      await page._humanMouseMove(aceptarButton);
      await page._humanDelay(300, 800);
    }

    const navigationPromise = page
      .waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 30000 })
      .catch(() => {
        console.log('   ⚠️ Навигация не обнаружена...');
      });
    await aceptarButton.click();

    if (page._humanDelay) {
      await page._humanDelay(100, 300);
    }

    console.log('   ⏳ Ожидание загрузки следующей страницы...');
    await navigationPromise;

    if (page._humanScroll) {
      console.log('   👤 Имитация человеческой прокрутки после навигации...');
      await page._humanScroll();
    }

    console.log('   ⏳ Ожидание полной загрузки страницы (2 секунды)...');
    await new Promise(resolve => setTimeout(resolve, 2000));

    try {
      const pageTitle = await page.title();
      const pageUrl = page.url();
      console.log(`   ✅ Страница загружена: ${pageTitle}`);
      console.log(`   📍 URL: ${pageUrl}`);
    } catch (e) {
      console.log('   ⚠️ Не удалось получить информацию о странице');
    }

    if (await checkIfBlocked(page)) {
      throw new Error('BLOCKED');
    }

    const hasContentAfterNav = await page
      .evaluate(() => {
        return document.body && document.body.innerText.length > 100;
      })
      .catch(() => false);
    if (!hasContentAfterNav) {
      console.log('   ⚠️ Контент страницы не загружен, ждем еще 1 секунду...');
      await new Promise(resolve => setTimeout(resolve, 1000));
    } else {
      console.log('   ✅ Контент страницы загружен');
    }

    console.log('   ⏳ Ожидание появления элементов формы (1 секунда)...');
    await new Promise(resolve => setTimeout(resolve, 1000));

    console.log('\n📡 Шаг 4: Выбор офиса...');
    console.log(`   Офис: ${OFICINA}`);

    const oficinaSelectors = [
      'select[name*="oficina" i]',
      'select[id*="oficina" i]',
      'select[name*="Oficina" i]',
      'select[id*="Oficina" i]',
      'select',
    ];

    let oficinaSelect = null;
    for (const selector of oficinaSelectors) {
      oficinaSelect = await page.$(selector).catch(() => null);
      if (oficinaSelect) {
        console.log(`   ✅ Найден селект: ${selector}`);
        break;
      }
    }

    if (!oficinaSelect) {
      const allSelects = await page.$$('select');
      console.log(`   ⚠️ Найдено селектов: ${allSelects.length}`);
      if (allSelects.length > 0) {
        const selectInfo = await page.evaluate(() => {
          const selects = Array.from(document.querySelectorAll('select'));
          return selects.map(s => ({
            name: s.name || '',
            id: s.id || '',
            options: Array.from(s.options)
              .map(o => o.text)
              .slice(0, 10),
          }));
        });
        console.log(
          '   Отладка селектов:',
          JSON.stringify(selectInfo, null, 2),
        );
      }
      throw new Error('Селект офиса не найден');
    }

    console.log('   🖱️ Открываем селект офиса...');
    if (page._humanMouseMove) {
      await page._humanMouseMove(oficinaSelect);
      if (page._humanDelay) await page._humanDelay(200, 500);
    }
    await oficinaSelect.click();
    if (page._humanDelay) {
      await page._humanDelay(200, 500);
    } else {
      await new Promise(resolve => setTimeout(resolve, 300));
    }

    console.log(`   🔍 Ищем опцию "${OFICINA}"...`);
    const oficinaSelected = await page.evaluate(oficina => {
      const selects = Array.from(document.querySelectorAll('select'));
      for (const select of selects) {
        const options = Array.from(select.options);
        for (let i = 0; i < options.length; i++) {
          const optionText = options[i].text.trim();

          if (
            optionText.includes(oficina) ||
            optionText.includes('Alcoy') ||
            (optionText.includes('CNP') && optionText.includes('Alcoy'))
          ) {
            select.selectedIndex = i;

            select.dispatchEvent(new Event('change', { bubbles: true }));
            return { success: true, selectedText: optionText };
          }
        }
      }
      return { success: false };
    }, OFICINA);

    if (!oficinaSelected.success) {
      const options = await page.evaluate(() => {
        const selects = Array.from(document.querySelectorAll('select'));
        return selects.map(s => ({
          name: s.name || s.id,
          options: Array.from(s.options).map(o => o.text.trim()),
        }));
      });
      console.log(
        '   ⚠️ Доступные опции офисов:',
        JSON.stringify(options, null, 2),
      );
      throw new Error(`Офис "${OFICINA}" не найден`);
    }

    console.log(`   ✅ Офис выбран: "${oficinaSelected.selectedText}"`);

    console.log(
      '   ⏳ Ожидание появления селекта процедуры после выбора офиса (1 секунда)...',
    );
    await new Promise(resolve => setTimeout(resolve, 1000));

    let tramiteSelectAppeared = false;
    for (let i = 0; i < 5; i++) {
      const selects = await page.$$('select').catch(() => []);
      console.log(
        `   🔍 Проверка ${i + 1}/5: найдено селектов: ${selects.length}`,
      );
      if (selects.length > 0) {
        const hasTramites = await page
          .evaluate(() => {
            const selects = Array.from(document.querySelectorAll('select'));
            return selects.some(select => {
              const options = Array.from(select.options);
              return options.some(
                opt =>
                  opt.text.includes('TRÁMITES') ||
                  opt.text.includes('POLICÍA') ||
                  opt.text.includes('TOMA DE HUELLAS'),
              );
            });
          })
          .catch(() => false);
        if (hasTramites) {
          console.log(`   ✅ Селект процедуры появился (проверка ${i + 1}/5)`);
          tramiteSelectAppeared = true;
          await new Promise(resolve => setTimeout(resolve, 1000));
          break;
        } else {
          console.log(
            `   ⏳ Селект процедуры еще не появился, ждем еще 1 секунду...`,
          );
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      } else {
        console.log(`   ⏳ Селекты не найдены, ждем еще 1 секунду...`);
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
    if (!tramiteSelectAppeared) {
      console.log('   ⚠️ Селект процедуры не появился, но продолжаем...');
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    if (await checkIfBlocked(page)) {
      throw new Error('BLOCKED');
    }

    console.log('\n📡 Шаг 5: Выбор типа процедуры (trámite)...');
    console.log(`   Процедура: ${TRAMITE}`);

    await new Promise(resolve => setTimeout(resolve, 2000));

    const allSelects = await page.$$('select');
    console.log(`   🔍 Найдено селектов на странице: ${allSelects.length}`);
    let tramiteSelect = null;
    let tramiteSelectInfo = null;

    for (let i = 0; i < allSelects.length; i++) {
      const selectInfo = await page.evaluate(sel => {
        const options = Array.from(sel.options);
        return {
          name: sel.name || '',
          id: sel.id || '',
          label: sel.labels.length > 0 ? sel.labels[0].textContent : '',
          placeholder: sel.getAttribute('placeholder') || '',
          optionsCount: options.length,
          firstOptions: options.slice(0, 5).map(o => o.text.trim()),
          hasTramites: options.some(
            opt =>
              opt.text.includes('TRÁMITES POLICÍA NACIONAL') ||
              opt.text.includes('POLICÍA NACIONAL') ||
              opt.text.includes('TOMA DE HUELLAS'),
          ),
        };
      }, allSelects[i]);
      console.log(
        `   📋 Селект ${i + 1}:`,
        JSON.stringify(selectInfo, null, 2),
      );

      if (selectInfo.hasTramites || selectInfo.optionsCount > 5) {
        tramiteSelect = allSelects[i];
        tramiteSelectInfo = selectInfo;
        console.log(`   ✅ Найден селект процедуры (селект ${i + 1})`);
        break;
      }
    }

    if (!tramiteSelect) {
      throw new Error(
        'Селект процедуры не найден. Проверьте отладочную информацию выше.',
      );
    }

    console.log('   🖱️ Открываем селект процедуры...');
    if (page._humanMouseMove) {
      await page._humanMouseMove(tramiteSelect);
      if (page._humanDelay) await page._humanDelay(200, 500);
    }
    await tramiteSelect.click();
    if (page._humanDelay) {
      await page._humanDelay(200, 500);
    } else {
      await new Promise(resolve => setTimeout(resolve, 300));
    }

    console.log(`   🔍 Ищем опцию "${TRAMITE}"...`);

    const possibleNavigation = page
      .waitForNavigation({
        waitUntil: 'networkidle2',
        timeout: 15000,
      })
      .catch(() => {
        console.log(
          '   ℹ️ Автоматическая навигация не обнаружена после выбора',
        );
        return null;
      });
    const tramiteSelected = await page.evaluate(tramiteText => {
      const selects = Array.from(document.querySelectorAll('select'));
      for (const select of selects) {
        const options = Array.from(select.options);
        for (let i = 0; i < options.length; i++) {
          const optionText = options[i].text.trim();

          const searchTerms = [
            'TOMA DE HUELLAS',
            'EXPEDICIÓN DE TARJETA',
            'RENOVACIÓN',
            'DUPLICADO',
            'LEY 14/2013',
          ];
          const matches = searchTerms.filter(term => optionText.includes(term));

          if (
            optionText.includes(tramiteText) ||
            (matches.length >= 2 && optionText.includes('POLICÍA')) ||
            (optionText.includes('TOMA DE HUELLAS') &&
              optionText.includes('TARJETA'))
          ) {
            select.selectedIndex = i;

            select.dispatchEvent(new Event('change', { bubbles: true }));

            select.dispatchEvent(new Event('input', { bubbles: true }));
            return { success: true, selectedText: optionText, index: i };
          }
        }
      }
      return { success: false };
    }, TRAMITE);

    try {
      const navResult = await Promise.race([
        possibleNavigation,
        new Promise(resolve => setTimeout(() => resolve('no-nav'), 2000)),
      ]);
      if (navResult !== 'no-nav' && navResult !== null) {
        console.log(
          '   ⚠️ Обнаружена автоматическая навигация после выбора процедуры!',
        );
        console.log('   ⏳ Ожидание завершения навигации...');
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    } catch (e) {}

    if (!tramiteSelected.success) {
      console.log('   ⚠️ Процедура не найдена, выводим все доступные опции...');
      const options = await page.evaluate(() => {
        const selects = Array.from(document.querySelectorAll('select'));
        return selects.map(s => ({
          name: s.name || s.id,
          label: s.labels.length > 0 ? s.labels[0].textContent : '',
          options: Array.from(s.options).map((o, idx) => ({
            index: idx,
            text: o.text.trim(),
            value: o.value,
          })),
        }));
      });
      console.log(
        '   📋 Доступные опции процедур:',
        JSON.stringify(options, null, 2),
      );

      console.log('   🔄 Пробуем найти по частичному совпадению...');
      const partialMatch = await page.evaluate(searchText => {
        const selects = Array.from(document.querySelectorAll('select'));
        for (const select of selects) {
          const options = Array.from(select.options);
          for (let i = 0; i < options.length; i++) {
            const optionText = options[i].text.trim();

            if (
              optionText.includes('TOMA DE HUELLAS') ||
              optionText.includes('HUELLAS') ||
              (optionText.includes('POLICÍA') && optionText.includes('TARJETA'))
            ) {
              select.selectedIndex = i;
              select.dispatchEvent(new Event('change', { bubbles: true }));
              select.dispatchEvent(new Event('input', { bubbles: true }));
              return { success: true, selectedText: optionText, index: i };
            }
          }
        }
        return { success: false };
      }, TRAMITE);
      if (partialMatch.success) {
        console.log(
          `   ✅ Процедура выбрана (частичное совпадение): "${partialMatch.selectedText}"`,
        );
        await new Promise(resolve => setTimeout(resolve, 100));
      } else {
        throw new Error(
          `Процедура "${TRAMITE}" не найдена. Проверьте доступные опции выше.`,
        );
      }
    } else {
      console.log(`   ✅ Процедура выбрана: "${tramiteSelected.selectedText}"`);
    }

    console.log('   ⏳ Ожидание обработки выбора процедуры (1 секунда)...');
    await new Promise(resolve => setTimeout(resolve, 1000));

    try {
      const currentUrl = page.url();
      const pageTitle = await page.title().catch(() => '');
      console.log(`   📍 Текущий URL: ${currentUrl}`);
      console.log(`   📄 Заголовок страницы: ${pageTitle}`);
    } catch (e) {
      console.log('   ⚠️ Не удалось получить информацию о странице');
    }

    console.log('   🔍 Проверка стабильности страницы (до 2 попыток)...');
    let pageStable = false;
    for (let i = 0; i < 2; i++) {
      const pageInfo = await page
        .evaluate(() => {
          return {
            bodyExists: !!document.body,
            bodyTextLength: document.body ? document.body.innerText.length : 0,
            readyState: document.readyState,
            url: window.location.href,
            hasSelects: document.querySelectorAll('select').length,
            hasButtons: document.querySelectorAll(
              'button, input[type="submit"]',
            ).length,
          };
        })
        .catch(() => null);
      if (pageInfo && pageInfo.bodyExists && pageInfo.bodyTextLength > 100) {
        console.log(`   ✅ Страница загружена (проверка ${i + 1}/5):`);
        console.log(`      - Текст: ${pageInfo.bodyTextLength} символов`);
        console.log(`      - ReadyState: ${pageInfo.readyState}`);
        console.log(`      - Селектов: ${pageInfo.hasSelects}`);
        console.log(`      - Кнопок: ${pageInfo.hasButtons}`);
        if (pageInfo.readyState === 'complete') {
          console.log(
            `   ⏳ Дополнительное ожидание стабильности (1 секунда)...`,
          );
          await new Promise(resolve => setTimeout(resolve, 1000));

          const stillStable = await page
            .evaluate(() => {
              return (
                document.readyState === 'complete' &&
                document.body &&
                document.body.innerText.length > 100
              );
            })
            .catch(() => false);
          if (stillStable) {
            pageStable = true;
            console.log(`   ✅ Страница остается стабильной после ожидания`);
            break;
          } else {
            console.log(
              `   ⚠️ Страница изменилась после ожидания, продолжаем проверку...`,
            );
          }
        } else {
          console.log(`   ⏳ Страница еще загружается, ждем еще 1 секунду...`);
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      } else {
        console.log(
          `   ⚠️ Страница не загружена или контент отсутствует (проверка ${
            i + 1
          }/2), ждем еще 1 секунду...`,
        );
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
    if (!pageStable) {
      console.log('   ⚠️ Страница не стабилизировалась после всех попыток!');
      console.log('   ⏳ Ожидание перед продолжением (1 секунда)...');
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    if (await checkIfBlocked(page)) {
      throw new Error('BLOCKED');
    }

    console.log('   ⏳ Ожидание перед нажатием Aceptar (1 секунда)...');
    await new Promise(resolve => setTimeout(resolve, 1000));

    console.log('\n📡 Шаг 6: Нажатие кнопки "Aceptar"...');

    const aceptarSelectors2 = [
      'button:has-text("Aceptar")',
      'input[type="submit"][value*="Aceptar" i]',
      'button[type="submit"]',
      'input[type="button"][value*="Aceptar" i]',
      'button',
      'input[type="submit"]',
    ];

    let aceptarButton2 = null;
    for (const selector of aceptarSelectors2) {
      try {
        if (selector.includes('has-text')) {
          const [button] = await page.$x(
            "//button[contains(text(), 'Aceptar')] | //input[@type='submit' and contains(@value, 'Aceptar')]",
          );
          if (button) {
            aceptarButton2 = button;
            break;
          }
        } else {
          aceptarButton2 = await page.$(selector).catch(() => null);
          if (aceptarButton2) {
            const buttonText = await page.evaluate(el => {
              return el.textContent || el.value || '';
            }, aceptarButton2);
            if (buttonText.toLowerCase().includes('aceptar')) {
              console.log(`   ✅ Найдена кнопка: "${buttonText}"`);
              break;
            }
          }
        }
      } catch (e) {
        continue;
      }
    }

    if (!aceptarButton2) {
      const buttons = await page.evaluate(() => {
        const allButtons = Array.from(
          document.querySelectorAll(
            'button, input[type="submit"], input[type="button"]',
          ),
        );
        return allButtons.map(b => ({
          tag: b.tagName,
          text: b.textContent || b.value || '',
          type: b.type || '',
        }));
      });
      console.log('   ⚠️ Найденные кнопки:', JSON.stringify(buttons, null, 2));
      throw new Error('Кнопка "Aceptar" не найдена');
    }

    console.log('   🖱️ Нажимаем кнопку "Aceptar"...');

    if (page._humanMouseMove) {
      await page._humanMouseMove(aceptarButton2);
      if (page._humanDelay) await page._humanDelay(300, 800);
    }

    const navigationPromise2 = page
      .waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 30000 })
      .catch(() => {
        console.log('   ⚠️ Навигация не обнаружена...');
      });
    await aceptarButton2.click();

    if (page._humanDelay) {
      await page._humanDelay(100, 300);
    }

    console.log('   ⏳ Ожидание загрузки следующей страницы...');
    await navigationPromise2;

    if (page._humanScroll) {
      console.log('   👤 Имитация человеческой прокрутки после навигации...');
      await page._humanScroll();
    }

    console.log('   ⏳ Ожидание загрузки страницы (1 секунда)...');
    await new Promise(resolve => setTimeout(resolve, 1000));

    try {
      const pageTitle = await page.title();
      const pageUrl = page.url();
      console.log(`   ✅ Страница загружена: ${pageTitle}`);
      console.log(`   📍 URL: ${pageUrl}`);
    } catch (e) {
      console.log(
        '   ⚠️ Не удалось получить информацию о странице, ждем еще...',
      );
      await new Promise(resolve => setTimeout(resolve, 2000));
    }

    if (await checkIfBlocked(page)) {
      throw new Error('BLOCKED');
    }

    console.log('   🔍 Проверка стабильности страницы (до 2 попыток)...');
    let pageStableAfterAceptar = false;
    let attempts = 0;
    const maxAttempts = 2;
    while (!pageStableAfterAceptar && attempts < maxAttempts) {
      attempts++;
      const hasContent2 = await page
        .evaluate(() => {
          return document.body && document.body.innerText.length > 100;
        })
        .catch(() => false);
      if (hasContent2) {
        const pageReady = await page
          .evaluate(() => {
            return (
              document.readyState === 'complete' &&
              document.body &&
              document.body.innerText.length > 100
            );
          })
          .catch(() => false);
        if (pageReady) {
          console.log(
            `   ✅ Страница стабильна (проверка ${attempts}/${maxAttempts})`,
          );

          console.log(
            `   ⏳ Дополнительное ожидание стабильности (1 секунда)...`,
          );
          await new Promise(resolve => setTimeout(resolve, 1000));

          const stillStable = await page
            .evaluate(() => {
              return (
                document.readyState === 'complete' &&
                document.body &&
                document.body.innerText.length > 100
              );
            })
            .catch(() => false);
          if (stillStable) {
            pageStableAfterAceptar = true;
            console.log(`   ✅ Страница остается стабильной после ожидания`);
          } else {
            console.log(
              `   ⚠️ Страница изменилась после ожидания, продолжаем проверку...`,
            );
            await new Promise(resolve => setTimeout(resolve, 1000));
          }
        } else {
          console.log(
            `   ⏳ Страница загружается, ждем еще 1 секунду (попытка ${attempts}/${maxAttempts})...`,
          );
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      } else {
        console.log(
          `   ⏳ Контент не загружен, ждем еще 1 секунду (попытка ${attempts}/${maxAttempts})...`,
        );
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
    if (!pageStableAfterAceptar) {
      console.log(
        '   ⚠️ Страница не стабилизировалась после всех попыток, но продолжаем...',
      );

      console.log('   ⏳ Финальное ожидание перед продолжением (1 секунда)...');
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    if (await checkIfBlocked(page)) {
      throw new Error('BLOCKED');
    }

    console.log('   ⏳ Ожидание появления элементов формы (1 секунда)...');
    await new Promise(resolve => setTimeout(resolve, 1000));

    const hasElements = await page
      .evaluate(() => {
        const buttons = document.querySelectorAll(
          'button, a, input[type="submit"], input[type="button"]',
        );
        const forms = document.querySelectorAll('form');
        return buttons.length > 0 || forms.length > 0;
      })
      .catch(() => false);
    if (!hasElements) {
      console.log('   ⚠️ Элементы формы не найдены, ждем еще 1 секунду...');
      await new Promise(resolve => setTimeout(resolve, 1000));
    } else {
      console.log('   ✅ Элементы формы найдены, страница готова');
    }

    console.log('   ⏳ Ожидание перед следующим шагом (0.5 секунды)...');
    await new Promise(resolve => setTimeout(resolve, 500));

    console.log('\n📡 Шаг 7: Выбор кнопки "Presentación sin Cl@ve"...');
    console.log(
      '   Текст: A continuación puedes acceder a la reserva de la cita, para el trámite y la provincia seleccionados, sin el uso de cl@ve.',
    );

    await new Promise(resolve => setTimeout(resolve, 1000));

    console.log('   📜 Прокручиваем страницу вниз...');
    await page.evaluate(() => {
      window.scrollTo(0, document.body.scrollHeight);
    });
    await new Promise(resolve => setTimeout(resolve, 100));

    await page.evaluate(() => {
      window.scrollTo(0, document.body.scrollHeight / 2);
    });
    await new Promise(resolve => setTimeout(resolve, 100));

    console.log('   🔍 Ищем кнопку "Presentación sin Cl@ve"...');
    let claveButton = null;

    try {
      claveButton = await page.$('#btnEntrar').catch(() => null);
      if (claveButton) {
        const buttonText = await page.evaluate(
          el => el.textContent || el.innerText || '',
          claveButton,
        );
        if (
          buttonText.includes('Presentación sin Cl@ve') ||
          buttonText.includes('sin Cl@ve')
        ) {
          console.log(
            `   ✅ Найдена кнопка по ID #btnEntrar: "${buttonText
              .trim()
              .substring(0, 100)}"`,
          );
        } else {
          claveButton = null;
        }
      }
    } catch (e) {}

    if (!claveButton) {
      const xpathQueries = [
        "//div[@id='btnEntrar']",
        "//div[contains(., 'Presentación sin Cl@ve')]",
        "//*[@id='btnEntrar']",
        "//div[.//p[contains(text(), 'Presentación sin Cl@ve')]]",
        "//*[contains(text(), 'Presentación sin Cl@ve')]",
        "//*[contains(text(), 'sin el uso de cl@ve')]",
      ];
      for (const xpath of xpathQueries) {
        try {
          const elements = await page.$x(xpath);
          for (const element of elements) {
            const buttonText = await page
              .evaluate(el => {
                return el.textContent || el.innerText || '';
              }, element)
              .catch(() => '');
            if (
              buttonText.includes('Presentación sin Cl@ve') ||
              buttonText.includes('sin Cl@ve') ||
              buttonText.includes('sin el uso de cl@ve')
            ) {
              claveButton = element;
              console.log(
                `   ✅ Найдена кнопка через XPath: "${buttonText
                  .trim()
                  .substring(0, 100)}"`,
              );
              break;
            }
          }
          if (claveButton) break;
        } catch (e) {
          continue;
        }
      }
    }

    if (!claveButton) {
      console.log('   🔄 Пробуем найти через поиск по всем элементам...');
      const allElements = await page.evaluate(() => {
        const elements = Array.from(
          document.querySelectorAll(
            'button, a, div, span, p, h1, h2, h3, h4, h5, h6',
          ),
        );
        return elements.map(el => ({
          tag: el.tagName,
          text: (el.textContent || el.innerText || '').trim(),
          href: el.href || '',
          className: el.className || '',
          id: el.id || '',
        }));
      });

      for (const elem of allElements) {
        if (
          elem.text.includes('Presentación sin Cl@ve') ||
          elem.text.includes('sin Cl@ve') ||
          elem.text.includes('sin el uso de cl@ve')
        ) {
          const selector = elem.id
            ? `#${elem.id}`
            : elem.className
            ? `.${elem.className.split(' ')[0]}`
            : elem.tagName.toLowerCase();
          try {
            const found = await page.$(selector).catch(() => null);
            if (found) {
              const foundText = await page.evaluate(
                el => el.textContent || el.innerText || '',
                found,
              );
              if (
                foundText.includes('sin Cl@ve') ||
                foundText.includes('sin el uso de cl@ve')
              ) {
                claveButton = found;
                console.log(
                  `   ✅ Найдена кнопка: "${foundText
                    .trim()
                    .substring(0, 100)}"`,
                );
                break;
              }
            }
          } catch (e) {
            continue;
          }
        }
      }
    }

    if (!claveButton) {
      console.log('   ⚠️ Кнопка не найдена. Выводим все элементы с текстом...');
      const allElements = await page.evaluate(() => {
        const elements = Array.from(
          document.querySelectorAll(
            'button, a, div, span, p, h1, h2, h3, h4, h5, h6',
          ),
        );
        return elements
          .filter(el => {
            const text = (el.textContent || el.innerText || '').trim();
            return (
              text.length > 0 &&
              (text.includes('Cl@ve') ||
                text.includes('cl@ve') ||
                text.includes('Presentación'))
            );
          })
          .map(el => ({
            tag: el.tagName,
            text: (el.textContent || el.innerText || '')
              .trim()
              .substring(0, 200),
            href: el.href || '',
            className: el.className || '',
            id: el.id || '',
            parentTag: el.parentElement ? el.parentElement.tagName : '',
          }));
      });
      console.log(
        '   📋 Элементы со словами Cl@ve или Presentación:',
        JSON.stringify(allElements, null, 2),
      );

      const buttons = await page.evaluate(() => {
        const allButtons = Array.from(
          document.querySelectorAll(
            'button, a, input[type="button"], input[type="submit"]',
          ),
        );
        return allButtons.map(b => ({
          tag: b.tagName,
          text: (b.textContent || b.innerText || b.value || '')
            .trim()
            .substring(0, 200),
          href: b.href || '',
          type: b.type || '',
          className: b.className || '',
          id: b.id || '',
        }));
      });
      console.log(
        '   📋 Все кнопки и ссылки:',
        JSON.stringify(buttons, null, 2),
      );
      throw new Error('Кнопка "Presentación sin Cl@ve" не найдена');
    }

    console.log('   🖱️ Нажимаем кнопку "Presentación sin Cl@ve"...');

    if (page._humanMouseMove) {
      await page._humanMouseMove(claveButton);
      if (page._humanDelay) await page._humanDelay(300, 800);
    }

    const navigationPromise3 = page
      .waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 30000 })
      .catch(() => {
        console.log('   ⚠️ Навигация не обнаружена...');
      });
    await claveButton.click();

    if (page._humanDelay) {
      await page._humanDelay(100, 300);
    }

    console.log('   ⏳ Ожидание загрузки следующей страницы...');
    await navigationPromise3;

    if (page._humanScroll) {
      console.log('   👤 Имитация человеческой прокрутки после навигации...');
      await page._humanScroll();
    }

    console.log('   ⏳ Ожидание полной загрузки страницы (2 секунды)...');
    await new Promise(resolve => setTimeout(resolve, 2000));

    try {
      const pageTitle = await page.title();
      const pageUrl = page.url();
      console.log(`   ✅ Страница загружена: ${pageTitle}`);
      console.log(`   📍 URL: ${pageUrl}`);
    } catch (e) {
      console.log('   ⚠️ Не удалось получить информацию о странице');
    }

    if (await checkIfBlocked(page)) {
      throw new Error('BLOCKED');
    }

    const hasContent3 = await page
      .evaluate(() => {
        return document.body && document.body.innerText.length > 100;
      })
      .catch(() => false);
    if (!hasContent3) {
      console.log('   ⚠️ Контент страницы не загружен, ждем еще 2 секунды...');
      await new Promise(resolve => setTimeout(resolve, 2000));
    } else {
      console.log('   ✅ Контент страницы загружен');
    }

    console.log('   ⏳ Ожидание появления элементов формы (1 секунда)...');
    await new Promise(resolve => setTimeout(resolve, 1000));

    console.log('\n📡 Шаг 8: Заполнение личных данных...');

    console.log('   ⏳ Ожидание появления формы (0.5 секунды)...');
    await new Promise(resolve => setTimeout(resolve, 500));

    const formLoaded = await page
      .evaluate(() => {
        const inputs = document.querySelectorAll('input, select');
        return inputs.length > 0;
      })
      .catch(() => false);
    if (!formLoaded) {
      console.log('   ⚠️ Форма не загружена, ждем еще 2 секунды...');
      await new Promise(resolve => setTimeout(resolve, 2000));
    }

    console.log(
      `   📋 Проверка типа документа: ${tipoDocumento} (уже выбран на странице)`,
    );
    await new Promise(resolve => setTimeout(resolve, 100));

    const tipoDocAlreadySelected = await page
      .evaluate(() => {
        const selects = Array.from(document.querySelectorAll('select'));
        for (const select of selects) {
          const options = Array.from(select.options);
          const selectedIndex = select.selectedIndex;
          if (selectedIndex >= 0 && selectedIndex < options.length) {
            const selectedText = options[selectedIndex].text.trim();
            if (selectedText.includes('NIE') || selectedText === 'NIE') {
              return { found: true, selectedText: selectedText };
            }
          }
        }
        return { found: false };
      })
      .catch(() => ({ found: false }));
    if (tipoDocAlreadySelected.found) {
      console.log(
        `   ✅ Тип документа уже выбран: "${tipoDocAlreadySelected.selectedText}"`,
      );
    } else {
      console.log(
        '   ⚠️ Тип документа NIE не найден в выбранных опциях, но продолжаем...',
      );
    }

    console.log(`   📝 Ввод номера NIE: ${numeroNie}`);

    let nieInput = null;

    const nieInputSelectors = [
      'input[name*="nie" i]',
      'input[id*="nie" i]',
      'input[name*="numero" i]',
      'input[id*="numero" i]',
      'input[type="text"]',
    ];

    for (const selector of nieInputSelectors) {
      const inputs = await page.$$(selector).catch(() => []);
      for (const input of inputs) {
        const placeholder = await page
          .evaluate(el => el.placeholder || '', input)
          .catch(() => '');
        const name = await page
          .evaluate(el => el.name || el.id || '', input)
          .catch(() => '');
        const value = await page
          .evaluate(el => el.value || '', input)
          .catch(() => '');

        if (value && value.length > 0) continue;
        if (
          name.toLowerCase().includes('nie') ||
          name.toLowerCase().includes('numero') ||
          name.toLowerCase().includes('número') ||
          placeholder.toLowerCase().includes('nie') ||
          placeholder.toLowerCase().includes('número') ||
          placeholder.toLowerCase().includes('numero')
        ) {
          nieInput = input;
          console.log(`   ✅ Найдено поле NIE: ${name || placeholder}`);
          break;
        }
      }
      if (nieInput) break;
    }

    if (!nieInput) {
      console.log(
        '   🔍 Поле NIE не найдено по селекторам, ищем первое пустое текстовое поле...',
      );
      const allTextInputs = await page.$$('input[type="text"]').catch(() => []);
      for (const input of allTextInputs) {
        const value = await page
          .evaluate(el => el.value || '', input)
          .catch(() => '');
        if (!value || value.length === 0) {
          nieInput = input;
          const name = await page
            .evaluate(el => el.name || el.id || '', input)
            .catch(() => '');
          console.log(
            `   ✅ Найдено пустое текстовое поле: ${name || 'без имени'}`,
          );
          break;
        }
      }
    }

    if (nieInput) {
      await nieInput.click({ clickCount: 3 });
      await new Promise(resolve => setTimeout(resolve, 100));
      await nieInput.type(numeroNie, { delay: 50 });
      console.log(`   ✅ Номер NIE введен: ${numeroNie}`);

      console.log('   🔍 Проверка на блокировку после ввода NIE...');
      if (await checkIfBlocked(page)) {
        console.log('   ❌ САЙТ ЗАБЛОКИРОВАН ПОСЛЕ ВВОДА NIE!');
        throw new Error('BLOCKED');
      }
      console.log('   ✅ Блокировки нет, продолжаем...');

      console.log('   ⏳ Ожидание обработки ввода NIE (1 секунда)...');
      await new Promise(resolve => setTimeout(resolve, 1000));

      console.log('   🔍 Повторная проверка на блокировку...');
      if (await checkIfBlocked(page)) {
        console.log('   ❌ САЙТ ЗАБЛОКИРОВАН ПОСЛЕ ОЖИДАНИЯ!');
        throw new Error('BLOCKED');
      }
      console.log('   ✅ Блокировки нет, переходим к вводу имени...');
    } else {
      const allInputs = await page.evaluate(() => {
        const inputs = Array.from(document.querySelectorAll('input'));
        return inputs.map(inp => ({
          type: inp.type,
          name: inp.name || '',
          id: inp.id || '',
          placeholder: inp.placeholder || '',
          value: inp.value || '',
        }));
      });
      console.log(
        '   ⚠️ Поле NIE не найдено. Все поля на странице:',
        JSON.stringify(allInputs, null, 2),
      );
      throw new Error('Поле NIE не найдено');
    }

    console.log(`   📝 Ввод имени и фамилии: ${nombreCompleto}`);

    let nombreInput = null;
    const nombreInputSelectors = [
      'input[name*="nombre" i]',
      'input[id*="nombre" i]',
      'input[name*="apellido" i]',
      'input[id*="apellido" i]',
      'input[type="text"]',
    ];

    for (const selector of nombreInputSelectors) {
      const inputs = await page.$$(selector).catch(() => []);
      for (const input of inputs) {
        const name = await page
          .evaluate(el => el.name || el.id || '', input)
          .catch(() => '');
        const placeholder = await page
          .evaluate(el => el.placeholder || '', input)
          .catch(() => '');
        const value = await page
          .evaluate(el => el.value || '', input)
          .catch(() => '');

        if (value === numeroNie) continue;

        if (value && value.length > 0) continue;
        if (
          name.toLowerCase().includes('nombre') ||
          name.toLowerCase().includes('apellido') ||
          placeholder.toLowerCase().includes('nombre') ||
          placeholder.toLowerCase().includes('apellido')
        ) {
          nombreInput = input;
          console.log(`   ✅ Найдено поле имени: ${name || placeholder}`);
          break;
        }
      }
      if (nombreInput) break;
    }

    if (!nombreInput) {
      console.log(
        '   🔍 Поле имени не найдено по селекторам, ищем следующее пустое текстовое поле...',
      );
      const allTextInputs = await page.$$('input[type="text"]').catch(() => []);
      for (const input of allTextInputs) {
        const value = await page
          .evaluate(el => el.value || '', input)
          .catch(() => '');
        const name = await page
          .evaluate(el => el.name || el.id || '', input)
          .catch(() => '');

        if (value === numeroNie || name.toLowerCase().includes('nie')) continue;
        if (!value || value.length === 0) {
          nombreInput = input;
          console.log(
            `   ✅ Найдено пустое текстовое поле: ${name || 'без имени'}`,
          );
          break;
        }
      }
    }

    if (nombreInput) {
      await nombreInput.click({ clickCount: 3 });
      await new Promise(resolve => setTimeout(resolve, 100));
      await nombreInput.type(nombreCompleto, { delay: 50 });
      console.log(`   ✅ Имя и фамилия введены: ${nombreCompleto}`);

      console.log('   🔍 Проверка на блокировку после ввода имени...');
      if (await checkIfBlocked(page)) {
        console.log('   ❌ САЙТ ЗАБЛОКИРОВАН ПОСЛЕ ВВОДА ИМЕНИ!');
        throw new Error('BLOCKED');
      }
      console.log('   ✅ Блокировки нет, продолжаем...');

      console.log('   ⏳ Ожидание обработки ввода имени (1 секунда)...');
      await new Promise(resolve => setTimeout(resolve, 1000));

      console.log('   🔍 Проверка, что страница не обновилась...');
      const currentUrl = page.url();
      const pageInfo = await page
        .evaluate(nombreCompleto => {
          const inputs = document.querySelectorAll('input');
          const selects = document.querySelectorAll('select');
          const hasNombreField = Array.from(inputs).some(inp => {
            const value = inp.value || '';
            return nombreCompleto.split(' ').some(word => value.includes(word));
          });
          return {
            hasForm: inputs.length > 0 && selects.length > 0,
            inputsCount: inputs.length,
            selectsCount: selects.length,
            hasNombreField: hasNombreField,
            url: window.location.href,
          };
        }, nombreCompleto)
        .catch(() => null);
      if (pageInfo) {
        console.log(`   📍 Текущий URL: ${pageInfo.url}`);
        console.log(
          `   📊 Элементы на странице: ${pageInfo.inputsCount} полей, ${pageInfo.selectsCount} селектов`,
        );
        console.log(`   ✅ Поле имени заполнено: ${pageInfo.hasNombreField}`);
        if (!pageInfo.hasForm) {
          console.log('   ⚠️ Форма исчезла, возможно страница обновилась!');
          console.log('   ⏳ Ждем 2 секунды для стабилизации...');
          await new Promise(resolve => setTimeout(resolve, 2000));
        } else {
          console.log('   ✅ Форма все еще на странице, продолжаем...');
        }
      }

      console.log('   🔍 Повторная проверка на блокировку...');
      if (await checkIfBlocked(page)) {
        console.log('   ❌ САЙТ ЗАБЛОКИРОВАН ПОСЛЕ ОЖИДАНИЯ!');
        throw new Error('BLOCKED');
      }
      console.log('   ✅ Блокировки нет, переходим к выбору страны...');
    } else {
      const allInputs = await page.evaluate(() => {
        const inputs = Array.from(document.querySelectorAll('input'));
        return inputs.map(inp => ({
          type: inp.type,
          name: inp.name || '',
          id: inp.id || '',
          placeholder: inp.placeholder || '',
          value: inp.value || '',
        }));
      });
      console.log(
        '   ⚠️ Поле имени не найдено. Все поля на странице:',
        JSON.stringify(allInputs, null, 2),
      );
      throw new Error('Поле имени не найдено');
    }

    console.log(`\n🌍 Шаг 8.4: Выбор страны гражданства: ${paisCiudadania}`);

    console.log('   ⏳ Ожидание появления селекта страны (1 секунда)...');
    await new Promise(resolve => setTimeout(resolve, 1000));

    console.log('   🔍 Проверка на блокировку перед выбором страны...');
    if (await checkIfBlocked(page)) {
      console.log('   ❌ САЙТ ЗАБЛОКИРОВАН ПЕРЕД ВЫБОРОМ СТРАНЫ!');
      throw new Error('BLOCKED');
    }
    console.log('   ✅ Блокировки нет, ищем селект страны...');

    const paisSelectors = [
      'select[name*="nacionalidad" i]',
      'select[id*="nacionalidad" i]',
      'select[name*="pais" i][name*="nacionalidad" i]',
      'select[id*="pais" i][id*="nacionalidad" i]',
      'select[name*="pais" i]',
      'select[id*="pais" i]',
      'select[name*="ciudadania" i]',
      'select[id*="ciudadania" i]',
      'select',
    ];

    console.log(
      '   🔍 Ищем селект по тексту "País de nacionalidad" или "Seleccionar"...',
    );

    let paisSelect = null;

    const selectByText = await page
      .evaluate(() => {
        const selects = Array.from(document.querySelectorAll('select'));
        for (let i = 0; i < selects.length; i++) {
          const select = selects[i];

          const parent = select.parentElement;
          const parentParent = parent ? parent.parentElement : null;
          const label = select.labels.length > 0 ? select.labels[0] : null;
          const prevSibling = select.previousElementSibling;
          const nextSibling = select.nextElementSibling;

          const nearbyText = [
            parent ? parent.textContent : '',
            parentParent ? parentParent.textContent : '',
            label ? label.textContent : '',
            prevSibling ? prevSibling.textContent : '',
            nextSibling ? nextSibling.textContent : '',
          ].join(' ');

          const hasNacionalidad =
            nearbyText.includes('País de nacionalidad') ||
            nearbyText.includes('nacionalidad') ||
            nearbyText.toLowerCase().includes('país de nacionalidad');
          const hasSeleccionar = nearbyText.includes('Seleccionar');
          if (hasNacionalidad || hasSeleccionar) {
            const optionsCount = select.options.length;
            if (optionsCount > 10) {
              let selector = '';
              if (select.id) {
                selector = `select#${select.id}`;
              } else if (select.name) {
                selector = `select[name="${select.name}"]`;
              } else {
                selector = `select:nth-of-type(${i + 1})`;
              }
              return {
                found: true,
                selector: selector,
                name: select.name || select.id || '',
                optionsCount: optionsCount,
                nearbyText: nearbyText.substring(0, 100),
              };
            }
          }
        }
        return { found: false };
      })
      .catch(() => ({ found: false }));
    if (selectByText.found) {
      console.log(
        `   ✅ Найден селект по тексту рядом: ${selectByText.name}, опций: ${selectByText.optionsCount}`,
      );
      console.log(`   📝 Текст рядом: ${selectByText.nearbyText}`);
      console.log(`   🔍 Селектор: ${selectByText.selector}`);

      if (selectByText.selector) {
        const foundSelect = await page
          .$(selectByText.selector)
          .catch(() => null);
        if (foundSelect) {
          paisSelect = foundSelect;
          console.log(
            `   ✅ Селект найден по селектору: ${selectByText.selector}`,
          );
        } else {
          console.log(
            `   ⚠️ Не удалось найти селект по селектору, пробуем по имени/ID...`,
          );

          if (selectByText.name) {
            const foundSelect = await page
              .$(
                `select[name="${selectByText.name}"], select[id="${selectByText.name}"]`,
              )
              .catch(() => null);
            if (foundSelect) {
              paisSelect = foundSelect;
              console.log(
                `   ✅ Селект найден по имени/ID: ${selectByText.name}`,
              );
            }
          }
        }
      }
    }

    if (!paisSelect) {
      console.log('   🔍 Селект не найден по тексту, ищем по селекторам...');
      for (const selector of paisSelectors) {
        const selects = await page.$$(selector).catch(() => []);
        for (const select of selects) {
          if (select === tipoDocSelect) continue;

          const hasNacionalidadText = await page
            .evaluate(sel => {
              const parent = sel.parentElement;
              const label = sel.labels.length > 0 ? sel.labels[0] : null;
              const nearbyText = [
                parent ? parent.textContent : '',
                label ? label.textContent : '',
              ].join(' ');
              return (
                nearbyText.includes('nacionalidad') ||
                nearbyText.includes('País')
              );
            }, select)
            .catch(() => false);
          const hasPais = await page
            .evaluate(sel => {
              const options = Array.from(sel.options);
              return options.some(
                opt =>
                  opt.text.includes('UCRANIA') ||
                  opt.text.includes('Ucrania') ||
                  opt.text.includes('UKRAINE') ||
                  options.length > 10,
              );
            }, select)
            .catch(() => false);
          if (hasPais || hasNacionalidadText) {
            paisSelect = select;
            const selectInfo = await page
              .evaluate(sel => {
                return {
                  name: sel.name || '',
                  id: sel.id || '',
                  optionsCount: sel.options.length,
                };
              }, select)
              .catch(() => ({}));
            console.log(
              `   ✅ Найден селект страны: ${
                selectInfo.name || selectInfo.id || 'без имени'
              }, опций: ${selectInfo.optionsCount || 0}`,
            );
            break;
          }
        }
        if (paisSelect) break;
      }
    }

    if (!paisSelect) {
      console.log(
        '   ⚠️ Селект страны не найден по селекторам, выводим все селекты...',
      );
      const allSelectsInfo = await page.evaluate(() => {
        const selects = Array.from(document.querySelectorAll('select'));
        return selects.map(sel => {
          const parent = sel.parentElement;
          const label = sel.labels.length > 0 ? sel.labels[0] : null;
          const nearbyText = [
            parent ? parent.textContent.substring(0, 200) : '',
            label ? label.textContent : '',
          ].join(' ');
          return {
            name: sel.name || '',
            id: sel.id || '',
            optionsCount: sel.options.length,
            nearbyText: nearbyText.substring(0, 200),
            firstOptions: Array.from(sel.options)
              .slice(0, 5)
              .map(o => o.text.trim()),
          };
        });
      });
      console.log(
        '   📋 Все селекты на странице:',
        JSON.stringify(allSelectsInfo, null, 2),
      );
      throw new Error('Селект страны "País de nacionalidad" не найден');
    }

    if (paisSelect) {
      console.log('   🖱️ Открываем селект страны "País de nacionalidad"...');

      await page.evaluate(sel => {
        sel.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, paisSelect);
      await new Promise(resolve => setTimeout(resolve, 500));

      if (page._humanMouseMove) {
        await page._humanMouseMove(paisSelect);
        if (page._humanDelay) await page._humanDelay(200, 500);
      }

      console.log('   👆 Кликаем на селект для открытия списка...');
      await paisSelect.click();
      await new Promise(resolve => setTimeout(resolve, 1000));

      console.log(`   🔍 Ищем опцию "${paisCiudadania}" в списке...`);
      const paisSelected = await page.evaluate(pais => {
        const selects = Array.from(document.querySelectorAll('select'));
        for (const select of selects) {
          const parent = select.parentElement;
          const label = select.labels.length > 0 ? select.labels[0] : null;
          const nearbyText = [
            parent ? parent.textContent : '',
            label ? label.textContent : '',
          ].join(' ');
          if (
            !nearbyText.includes('nacionalidad') &&
            !nearbyText.includes('País')
          ) {
            continue;
          }
          const options = Array.from(select.options);
          console.log(`   📋 Найдено ${options.length} опций в селекте`);

          for (let i = 0; i < options.length; i++) {
            const optionText = options[i].text.trim();
            const optionValue = options[i].value || optionText;
            if (
              optionText.includes(pais) ||
              optionText.includes('UCRANIA') ||
              optionText.includes('Ucrania') ||
              optionText.includes('UKRAINE') ||
              optionValue.includes('UCRANIA') ||
              optionValue.includes('Ucrania')
            ) {
              console.log(`   ✅ Найдена опция: "${optionText}" (индекс ${i})`);
              select.selectedIndex = i;
              select.focus();
              select.dispatchEvent(new Event('change', { bubbles: true }));
              select.dispatchEvent(new Event('input', { bubbles: true }));
              select.dispatchEvent(new Event('blur', { bubbles: true }));

              const option = options[i];
              if (option) {
                option.selected = true;
                option.dispatchEvent(new Event('click', { bubbles: true }));
              }
              return { success: true, selectedText: optionText, index: i };
            }
          }
        }
        return { success: false, error: 'Опция UCRANIA не найдена в списке' };
      }, paisCiudadania);
      if (paisSelected.success) {
        console.log(
          `   ✅ Страна выбрана: "${paisSelected.selectedText}" (индекс ${paisSelected.index})`,
        );

        await new Promise(resolve => setTimeout(resolve, 1000));

        const verifySelection = await page.evaluate(() => {
          const selects = Array.from(document.querySelectorAll('select'));
          for (const select of selects) {
            const parent = select.parentElement;
            const label = select.labels.length > 0 ? select.labels[0] : null;
            const nearbyText = [
              parent ? parent.textContent : '',
              label ? label.textContent : '',
            ].join(' ');
            if (
              nearbyText.includes('nacionalidad') ||
              nearbyText.includes('País')
            ) {
              const selectedOption = select.options[select.selectedIndex];
              return {
                selected: selectedOption ? selectedOption.text.trim() : '',
                index: select.selectedIndex,
              };
            }
          }
          return { selected: '', index: -1 };
        });
        console.log(
          `   🔍 Проверка выбора: "${verifySelection.selected}" (индекс ${verifySelection.index})`,
        );
        if (
          !verifySelection.selected.includes('UCRANIA') &&
          !verifySelection.selected.includes('Ucrania')
        ) {
          console.log('   ⚠️ Выбор не сохранился, пробуем еще раз...');

          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      } else {
        console.log(
          `   ❌ Ошибка выбора страны: ${
            paisSelected.error || 'Неизвестная ошибка'
          }`,
        );

        const allOptions = await page.evaluate(() => {
          const selects = Array.from(document.querySelectorAll('select'));
          for (const select of selects) {
            const parent = select.parentElement;
            const label = select.labels.length > 0 ? select.labels[0] : null;
            const nearbyText = [
              parent ? parent.textContent : '',
              label ? label.textContent : '',
            ].join(' ');
            if (
              nearbyText.includes('nacionalidad') ||
              nearbyText.includes('País')
            ) {
              return Array.from(select.options).map((opt, idx) => ({
                index: idx,
                text: opt.text.trim(),
                value: opt.value || '',
              }));
            }
          }
          return [];
        });
        console.log(
          '   📋 Все опции в селекте страны:',
          JSON.stringify(allOptions.slice(0, 20), null, 2),
        );
        throw new Error(
          `Не удалось выбрать страну: ${
            paisSelected.error || 'Опция UCRANIA не найдена'
          }`,
        );
      }

      console.log('   🔍 Проверка на блокировку после выбора страны...');
      if (await checkIfBlocked(page)) {
        console.log('   ❌ САЙТ ЗАБЛОКИРОВАН ПОСЛЕ ВЫБОРА СТРАНЫ!');
        throw new Error('BLOCKED');
      }
      console.log('   ✅ Блокировки нет, продолжаем...');

      console.log('   ⏳ Ожидание обработки выбора страны (1 секунда)...');
      await new Promise(resolve => setTimeout(resolve, 1000));

      console.log('   🔍 Повторная проверка на блокировку...');
      if (await checkIfBlocked(page)) {
        console.log('   ❌ САЙТ ЗАБЛОКИРОВАН ПОСЛЕ ОЖИДАНИЯ!');
        throw new Error('BLOCKED');
      }
      console.log('   ✅ Блокировки нет, переходим к финальному Aceptar...');
    } else {
      console.log('   ⚠️ Селект страны не найден, пропускаем...');
    }

    console.log('\n📡 Шаг 9: Нажатие кнопки "Aceptar"...');

    console.log('   🔍 Проверка на блокировку перед поиском кнопки Aceptar...');
    if (await checkIfBlocked(page)) {
      console.log('   ❌ САЙТ ЗАБЛОКИРОВАН ПЕРЕД ПОИСКОМ КНОПКИ!');
      throw new Error('BLOCKED');
    }
    console.log('   ✅ Блокировки нет, ищем кнопку...');
    const aceptarSelectors3 = [
      'button:has-text("Aceptar")',
      'input[type="submit"][value*="Aceptar" i]',
      'button[type="submit"]',
      'input[type="button"][value*="Aceptar" i]',
      'button',
      'input[type="submit"]',
    ];

    let aceptarButton3 = null;
    for (const selector of aceptarSelectors3) {
      try {
        if (selector.includes('has-text')) {
          const [button] = await page.$x(
            "//button[contains(text(), 'Aceptar')] | //input[@type='submit' and contains(@value, 'Aceptar')]",
          );
          if (button) {
            aceptarButton3 = button;
            break;
          }
        } else {
          aceptarButton3 = await page.$(selector).catch(() => null);
          if (aceptarButton3) {
            const buttonText = await page.evaluate(el => {
              return el.textContent || el.value || '';
            }, aceptarButton3);
            if (buttonText.toLowerCase().includes('aceptar')) {
              console.log(`   ✅ Найдена кнопка: "${buttonText}"`);
              break;
            }
          }
        }
      } catch (e) {
        continue;
      }
    }

    if (!aceptarButton3) {
      const buttons = await page.evaluate(() => {
        const allButtons = Array.from(
          document.querySelectorAll(
            'button, input[type="submit"], input[type="button"]',
          ),
        );
        return allButtons.map(b => ({
          tag: b.tagName,
          text: b.textContent || b.value || '',
          type: b.type || '',
        }));
      });
      console.log('   ⚠️ Найденные кнопки:', JSON.stringify(buttons, null, 2));
      throw new Error('Кнопка "Aceptar" не найдена');
    }

    console.log('   🖱️ Нажимаем кнопку "Aceptar"...');

    if (page._humanMouseMove) {
      await page._humanMouseMove(aceptarButton3);
      if (page._humanDelay) await page._humanDelay(300, 800);
    }
    await aceptarButton3.click();

    if (page._humanDelay) {
      await page._humanDelay(100, 300);
    }

    console.log('   ⏳ Ожидание загрузки следующей страницы...');
    await page
      .waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 30000 })
      .catch(() => {
        console.log('   ⚠️ Навигация не обнаружена, ждем 2 секунды...');
      });

    if (page._humanScroll) {
      await page._humanScroll();
    }
    await new Promise(resolve => setTimeout(resolve, 2000));

    if (await checkIfBlocked(page)) {
      throw new Error('BLOCKED');
    }

    console.log('\n📡 Шаг 10: Нажатие кнопки "Solicitar Cita"...');

    console.log('   ⏳ Ожидание загрузки страницы (1 секунда)...');
    await new Promise(resolve => setTimeout(resolve, 1000));

    if (await checkIfBlocked(page)) {
      throw new Error('BLOCKED');
    }

    console.log('   🔍 Ищем кнопку "Solicitar Cita"...');

    let solicitarCitaButton = null;

    const xpathSelectors = [
      "//button[contains(translate(text(), 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), 'solicitar') and contains(translate(text(), 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), 'cita')]",
      "//a[contains(translate(text(), 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), 'solicitar') and contains(translate(text(), 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), 'cita')]",
      "//input[@type='submit' and contains(translate(@value, 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), 'solicitar') and contains(translate(@value, 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), 'cita')]",
      "//button[contains(text(), 'Solicitar')]",
      "//a[contains(text(), 'Solicitar')]",
      "//button[contains(text(), 'Cita')]",
      "//a[contains(text(), 'Cita')]",
    ];

    for (const xpath of xpathSelectors) {
      try {
        const [button] = await page.$x(xpath);
        if (button) {
          const buttonText = await page.evaluate(el => {
            return el.textContent || el.value || el.innerText || '';
          }, button);
          console.log(`   🔍 Проверяем элемент: "${buttonText}"`);
          if (
            buttonText.toLowerCase().includes('solicitar') &&
            buttonText.toLowerCase().includes('cita')
          ) {
            solicitarCitaButton = button;
            console.log(`   ✅ Найдена кнопка через XPath: "${buttonText}"`);
            break;
          }
        }
      } catch (e) {
        continue;
      }
    }

    if (!solicitarCitaButton) {
      console.log('   🔍 Пробуем найти через CSS селекторы...');
      const allClickableElements = await page.evaluate(() => {
        const elements = Array.from(
          document.querySelectorAll(
            'button, a, input[type="submit"], input[type="button"], div[onclick], span[onclick]',
          ),
        );
        return elements.map(el => ({
          tag: el.tagName,
          text: el.textContent || el.value || el.innerText || '',
          id: el.id || '',
          class: el.className || '',
          onclick: el.onclick ? 'yes' : 'no',
        }));
      });

      console.log(
        '   📋 Все кликабельные элементы:',
        JSON.stringify(allClickableElements, null, 2),
      );

      for (const elementInfo of allClickableElements) {
        const text = elementInfo.text.toLowerCase();
        if (
          (text.includes('solicitar') && text.includes('cita')) ||
          text.includes('solicitar cita')
        ) {
          console.log(`   🔍 Найден подходящий элемент: "${elementInfo.text}"`);
          const selector = elementInfo.id
            ? `#${elementInfo.id}`
            : elementInfo.class
            ? `.${elementInfo.class.split(' ')[0]}`
            : null;

          if (selector) {
            solicitarCitaButton = await page.$(selector).catch(() => null);
            if (solicitarCitaButton) {
              console.log(
                `   ✅ Найдена кнопка через селектор: "${elementInfo.text}"`,
              );
              break;
            }
          }

          const [button] = await page.$x(
            `//${elementInfo.tag.toLowerCase()}[contains(text(), '${elementInfo.text.substring(
              0,
              10,
            )}')]`,
          );
          if (button) {
            solicitarCitaButton = button;
            console.log(
              `   ✅ Найдена кнопка через XPath по тексту: "${elementInfo.text}"`,
            );
            break;
          }
        }
      }
    }

    if (!solicitarCitaButton) {
      const buttons = await page.evaluate(() => {
        const allButtons = Array.from(
          document.querySelectorAll(
            'button, a, input[type="submit"], input[type="button"]',
          ),
        );
        return allButtons.map(b => ({
          tag: b.tagName,
          text: b.textContent || b.value || b.innerText || '',
          type: b.type || '',
          id: b.id || '',
          class: b.className || '',
        }));
      });
      console.log('   ⚠️ Найденные кнопки:', JSON.stringify(buttons, null, 2));
      throw new Error('Кнопка "Solicitar Cita" не найдена');
    }

    console.log('   🖱️ Нажимаем кнопку "Solicitar Cita"...');

    console.log('   📜 Прокручиваем к кнопке...');
    await page.evaluate(element => {
      if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }, solicitarCitaButton);
    await new Promise(resolve => setTimeout(resolve, 1000));

    if (page._humanMouseMove) {
      await page._humanMouseMove(solicitarCitaButton);
      if (page._humanDelay) await page._humanDelay(300, 800);
    }

    const navigationPromiseCita = page
      .waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 30000 })
      .catch(() => {
        console.log('   ⚠️ Навигация не обнаружена...');
      });

    try {
      await solicitarCitaButton.click();
      console.log('   ✅ Кнопка нажата через .click()');
    } catch (e) {
      console.log('   ⚠️ Обычный клик не сработал, пробуем через evaluate...');
      await page.evaluate(element => {
        if (element) {
          element.click();
        }
      }, solicitarCitaButton);
      console.log('   ✅ Кнопка нажата через evaluate()');
    }

    if (page._humanDelay) {
      await page._humanDelay(100, 300);
    }

    console.log('   ⏳ Ожидание загрузки следующей страницы...');
    await navigationPromiseCita;

    if (page._humanScroll) {
      await page._humanScroll();
    }
    await new Promise(resolve => setTimeout(resolve, 2000));

    if (await checkIfBlocked(page)) {
      throw new Error('BLOCKED');
    }

    console.log('\n📡 Шаг 11: Проверка наличия записей...');

    console.log('   ⏳ Ожидание загрузки страницы (1 секунда)...');
    await new Promise(resolve => setTimeout(resolve, 1000));

    const pageText = await page
      .evaluate(() => {
        return document.body ? document.body.innerText : '';
      })
      .catch(() => '');

    const pageTitle = await page.title().catch(() => '');
    const pageUrl = page.url();

    console.log(`   📄 Заголовок страницы: ${pageTitle}`);
    console.log(`   📍 URL: ${pageUrl}`);

    const isPaso1 =
      pageText.includes('Paso 1 de 5') || pageTitle.includes('Paso 1');
    console.log(
      `   🔍 Проверка: Страница "Paso 1 de 5" - ${isPaso1 ? 'ДА' : 'НЕТ'}`,
    );

    const noCitasText = 'En este momento no hay citas disponibles';
    const hasNoCitas =
      pageText.includes(noCitasText) ||
      pageText.includes('no hay citas disponibles') ||
      pageText.toLowerCase().includes('no hay citas disponibles');

    console.log(
      `   🔍 Проверка текста "no hay citas disponibles": ${
        hasNoCitas ? 'НАЙДЕНО' : 'НЕ НАЙДЕНО'
      }`,
    );

    if (hasNoCitas) {
      console.log('\n' + '='.repeat(60));
      console.log('❌ ЗАПИСЕЙ НЕТ!');
      console.log(
        '   Текст найден: "En este momento no hay citas disponibles..."',
      );
      console.log('='.repeat(60));
      return { success: false, hasCitas: false };
    } else {
      console.log('\n' + '='.repeat(60));
      console.log('🎉🎉🎉 ЗАПИСИ ДОСТУПНЫ! 🎉🎉🎉');
      console.log('='.repeat(60));
      console.log('✅ Текста "no hay citas disponibles" НЕ найдено!');
      console.log(
        '✅ Страница: ' +
          (isPaso1 ? 'Paso 1 de 5 (найдено)' : 'другая страница'),
      );
      console.log('='.repeat(60));

      const { exec } = require('child_process');
      const os = require('os');

      for (let i = 0; i < 5; i++) {
        console.log(`\n🔔 УВЕДОМЛЕНИЕ ${i + 1}/5: ЕСТЬ ДОСТУПНЫЕ ЗАПИСИ!`);
        console.log('🔔 УВЕДОМЛЕНИЕ: ЕСТЬ ДОСТУПНЫЕ ЗАПИСИ!');
        console.log('🔔 УВЕДОМЛЕНИЕ: ЕСТЬ ДОСТУПНЫЕ ЗАПИСИ!');

        if (os.platform() === 'darwin') {
          exec(
            'say "Записи доступны! Записи доступны! Записи доступны!"',
            () => {},
          );
          exec('afplay /System/Library/Sounds/Glass.aiff', () => {});
        } else if (os.platform() === 'linux') {
          exec('spd-say "Записи доступны!"', () => {});
          exec(
            'paplay /usr/share/sounds/freedesktop/stereo/complete.oga',
            () => {},
          );
        } else if (os.platform() === 'win32') {
          exec(
            'powershell -c "[console]::beep(800,500); [console]::beep(1000,500); [console]::beep(1200,500)"',
            () => {},
          );
        }

        if (i < 4) {
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      }

      console.log('\n' + '='.repeat(60));
      console.log('📢 ВАЖНО: Проверьте страницу в браузере!');
      console.log('📢 URL: ' + pageUrl);
      console.log('='.repeat(60));

      const telegramMessage = `🎉 <b>ЗАПИСИ ДОСТУПНЫ!</b>

✅ Текста "no hay citas disponibles" НЕ найдено!
✅ Страница: ${isPaso1 ? 'Paso 1 de 5' : 'другая страница'}

📢 Проверьте страницу в браузере:
${pageUrl}

👤 Данные:
• NIE: ${numeroNie}
• Имя: ${nombreCompleto}
• Провинция: ${PROVINCIA}
• Офис: ${OFICINA}`;

      console.log('   📱 Отправка уведомления в Telegram...');
      await sendTelegramNotification(telegramMessage);

      return { success: true, hasCitas: true };
    }
  } catch (error) {
    throw error;
  }
}

async function autoclicker() {
  console.log('🤖 Запуск автокликера...');

  const http = require('http');
  const { spawn } = require('child_process');
  const os = require('os');

  try {
    await new Promise((resolve, reject) => {
      const req = http.get('http://localhost:9222/json/version', res => {
        resolve();
      });
      req.on('error', reject);
      req.setTimeout(2000, () => reject(new Error('Timeout')));
    });
    console.log('✅ Chrome уже запущен с отладочным портом 9222');
  } catch (e) {
    console.log('🚀 Chrome не запущен, запускаю автоматически...');
    const chromePath =
      os.platform() === 'darwin'
        ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
        : os.platform() === 'win32'
        ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
        : 'google-chrome';

    const chromeProcess = spawn(chromePath, [
      '--remote-debugging-port=9222',
      '--user-data-dir=/tmp/chrome-debug-profile',
      '--no-first-run',
      '--no-default-browser-check',
    ]);

    chromeProcess.stdout.on('data', () => {});
    chromeProcess.stderr.on('data', () => {});

    chromeProcess.on('error', err => {
      console.error('❌ Ошибка запуска Chrome:', err.message);
      console.log('💡 Попробуйте запустить Chrome вручную:');
      console.log('   ./start-chrome-debug.sh');
      process.exit(1);
    });

    console.log('⏳ Ожидание запуска Chrome (5 секунд)...');
    await new Promise(resolve => setTimeout(resolve, 5000));

    let chromeReady = false;
    for (let i = 0; i < 10; i++) {
      try {
        await new Promise((resolve, reject) => {
          const req = http.get('http://localhost:9222/json/version', res => {
            resolve();
          });
          req.on('error', reject);
          req.setTimeout(1000, () => reject(new Error('Timeout')));
        });
        chromeReady = true;
        break;
      } catch (e) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    if (!chromeReady) {
      console.error('❌ Chrome не запустился за 10 секунд');
      console.log('💡 Попробуйте запустить Chrome вручную:');
      console.log('   ./start-chrome-debug.sh');
      process.exit(1);
    }

    console.log('✅ Chrome успешно запущен с отладочным портом 9222');
  }

  const browser = await puppeteerCore.connect({
    browserURL: 'http://localhost:9222',
    defaultViewport: null,
  });

  console.log('✅ Подключено к Chrome!');

  const userData = await getUserDataFromForm(browser);

  let attempt = 0;
  let errorAttempt = 0; // Счетчик попыток при ошибках/блокировках
  let success = false;

  while (!success) {
    attempt++;
    if (attempt > 1) {
      console.log(`\n🔄 Попытка ${attempt} (поиск записей...)`);
    }

    try {
      if (attempt === 1) {
        console.log('✅ Начинаем работу автокликера...');
      }

      const pages = await browser.pages();
      let page;

      if (attempt > 1) {
        console.log('   🔄 Закрываем старые страницы и создаем новую...');
        for (const oldPage of pages) {
          try {
            await oldPage.close().catch(() => {});
          } catch (e) {}
        }
        page = await browser.newPage();
        console.log('   ✅ Создана новая страница для повторной попытки');
      } else {
        if (pages.length > 0) {
          page = pages[0];
          console.log('📄 Используем существующую страницу');
        } else {
          page = await browser.newPage();
          console.log('📄 Создана новая страница');
        }
      }

      try {
        await page.setViewport({ width: 1920, height: 1080 });
      } catch (e) {}

      console.log('👤 Включаем человеко-подобное поведение...');

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

      const result = await runAutoclickerSteps(page, userData);

      if (await checkIfBlocked(page)) {
        throw new Error('BLOCKED');
      }

      if (result && result.hasCitas === false) {
        console.log('\n🔄 Записей нет, повторяем процесс...');
        const retryInterval = 10000; // 10 секунд вместо 30
        console.log(
          `⏳ Ожидание ${
            retryInterval / 1000
          } секунд перед повторной попыткой...`,
        );
        await new Promise(resolve => setTimeout(resolve, retryInterval));
        console.log('📍 Возвращаемся к шагу 1: Переход на сайт');
        errorAttempt = 0; // Сбрасываем счетчик ошибок при успешном выполнении
        continue;
      } else if (result && result.hasCitas === true) {
        success = true;
        console.log('\n' + '='.repeat(60));
        console.log('🎉🎉🎉 УСПЕХ! ЗАПИСИ ДОСТУПНЫ! 🎉🎉🎉');
        console.log('='.repeat(60));
        console.log('🔔 УВЕДОМЛЕНИЕ: ЕСТЬ ДОСТУПНЫЕ ЗАПИСИ!');
        console.log('📢 Пожалуйста, проверьте страницу в браузере!');
        console.log('='.repeat(60));

        const { exec } = require('child_process');
        const os = require('os');

        for (let i = 0; i < 3; i++) {
          if (os.platform() === 'darwin') {
            exec('say "Записи доступны! Проверьте браузер!"', () => {});
          } else if (os.platform() === 'linux') {
            exec('spd-say "Записи доступны! Проверьте браузер!"', () => {});
          } else if (os.platform() === 'win32') {
            exec(
              'powershell -c "[console]::beep(800,500); [console]::beep(1000,500)"',
              () => {},
            );
          }
          await new Promise(resolve => setTimeout(resolve, 1000));
        }

        const telegramMessage = `🎉 <b>УСПЕХ! ЗАПИСИ ДОСТУПНЫ!</b>

🔔 УВЕДОМЛЕНИЕ: ЕСТЬ ДОСТУПНЫЕ ЗАПИСИ!

📢 Пожалуйста, проверьте страницу в браузере!

👤 Данные:
• NIE: ${numeroNie}
• Имя: ${nombreCompleto}
• Провинция: ${PROVINCIA}
• Офис: ${OFICINA}`;

        console.log('   📱 Отправка уведомления в Telegram...');
        await sendTelegramNotification(telegramMessage);

        break;
      } else {
        success = true;
        console.log('\n✅ Автокликер выполнен успешно!');
      }
    } catch (error) {
      errorAttempt++;
      if (error.message === 'BLOCKED') {
        console.log(`\n❌ Попытка заблокирована сайтом (ошибок: ${errorAttempt}/${MAX_RETRIES})`);
        if (errorAttempt < MAX_RETRIES) {
          console.log(
            `🔄 Автоматический перезапуск с начала через ${
              RETRY_DELAY / 1000
            } секунд...`,
          );
          console.log('   📍 Начнем с шага 1: Переход на сайт');
          await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
          continue;
        } else {
          console.log(
            '\n❌ Достигнуто максимальное количество попыток при блокировке. Остановка.',
          );
          break;
        }
      } else {
        console.error(`\n❌ Ошибка (ошибок: ${errorAttempt}/${MAX_RETRIES}):`, error.message);
        if (errorAttempt < MAX_RETRIES) {
          console.log(
            `🔄 Повторная попытка с начала через ${
              RETRY_DELAY / 1000
            } секунд...`,
          );
          console.log('   📍 Начнем с шага 1: Переход на сайт');
          await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
          continue;
        } else {
          console.log('\n❌ Достигнуто максимальное количество попыток при ошибках.');
          break;
        }
      }
    }
  }

  if (!success) {
    console.log('\n💡 Рекомендации:');
    console.log('   1. Проверьте VPN (IP должен быть из Испании)');
    console.log('   2. Подождите несколько минут перед следующей попыткой');
    console.log('   3. Убедитесь, что Chrome работает нормально');
  }
}

// Экспортируем функции для использования в обертках
module.exports = {
  runAutoclickerSteps,
  checkIfBlocked,
  sendTelegramNotification,
};

// Запуск напрямую, если файл вызван напрямую
if (require.main === module) {
  autoclicker().catch(console.error);
}
