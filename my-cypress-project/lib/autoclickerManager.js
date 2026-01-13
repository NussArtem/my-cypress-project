const { v4: uuidv4 } = require('uuid');
const autoclicker1Wrapper = require('./autoclicker1Wrapper');
const autoclicker2Wrapper = require('./autoclicker2Wrapper');

// Хранилище статусов задач
const jobs = new Map();
// Хранилище активных браузеров для возможности остановки
const activeBrowsers = new Map();

// Генерация уникального ID для задачи
function generateJobId() {
  return uuidv4();
}

// Запуск автокликера 1
async function startAutoclicker1(userData) {
  const jobId = generateJobId();
  
  jobs.set(jobId, {
    id: jobId,
    type: 'autoclicker1',
    status: 'running',
    startTime: new Date(),
    userData: userData,
    stopRequested: false
  });

  console.log(`🚀 Запуск автокликера 1, jobId: ${jobId}`);
  console.log(`📋 Данные пользователя:`, userData);

  // Функция проверки остановки
  const checkStop = () => {
    const job = jobs.get(jobId);
    return job && job.stopRequested;
  };

  // Запускаем автокликер асинхронно
  const browserPromise = autoclicker1Wrapper.runAutoclicker(userData, jobId, (browser) => {
    // Сохраняем ссылку на браузер для возможности остановки
    activeBrowsers.set(jobId, browser);
  }, checkStop)
    .then(result => {
      const job = jobs.get(jobId);
      console.log(`🔍 Результат автокликера 1, jobId: ${jobId}:`, JSON.stringify(result));
      if (job) {
        // Если найдена запись, ставим на паузу и НЕ удаляем браузер
        if (result && (result.hasCitas === true || result.success === true)) {
          job.status = 'paused';
          console.log(`⏸️ Автокликер 1 поставлен на паузу (найдена запись), jobId: ${jobId}`);
          console.log(`⚠️ Браузер остается подключенным для сохранения сессии!`);
          // НЕ удаляем браузер из activeBrowsers, чтобы сессия сохранилась
        } else {
          // Если записей нет или другая ситуация, завершаем нормально
          activeBrowsers.delete(jobId);
          if (job.stopRequested) {
            job.status = 'stopped';
          } else {
            job.status = 'completed';
          }
          console.log(`✅ Автокликер 1 завершен успешно, jobId: ${jobId}`, result);
        }
        job.endTime = new Date();
        job.result = result;
        console.log(`📊 Статус задачи ${jobId} обновлен: ${job.status}`);
      } else {
        // Если задачи нет, все равно удаляем браузер
        activeBrowsers.delete(jobId);
      }
    })
    .catch(error => {
      activeBrowsers.delete(jobId);
      console.error(`❌ Ошибка в автокликере 1, jobId: ${jobId}:`, error);
      console.error(`📋 Stack trace:`, error.stack);
      const job = jobs.get(jobId);
      if (job) {
        if (job.stopRequested) {
          job.status = 'stopped';
        } else {
          job.status = 'error';
        }
        job.endTime = new Date();
        job.error = error.message;
        console.log(`📊 Статус задачи ${jobId} обновлен: ${job.status}`);
      }
    });

  return jobId;
}

// Запуск автокликера 2
async function startAutoclicker2(userData) {
  const jobId = generateJobId();
  
  jobs.set(jobId, {
    id: jobId,
    type: 'autoclicker2',
    status: 'running',
    startTime: new Date(),
    userData: userData,
    stopRequested: false
  });

  console.log(`🚀 Запуск автокликера 2, jobId: ${jobId}`);
  console.log(`📋 Данные пользователя:`, userData);

  // Функция проверки остановки
  const checkStop = () => {
    const job = jobs.get(jobId);
    return job && job.stopRequested;
  };

  // Запускаем автокликер асинхронно
  const browserPromise = autoclicker2Wrapper.runAutoclicker(userData, jobId, (browser) => {
    // Сохраняем ссылку на браузер для возможности остановки
    activeBrowsers.set(jobId, browser);
  }, checkStop)
    .then(result => {
      const job = jobs.get(jobId);
      console.log(`🔍 Результат автокликера 2, jobId: ${jobId}:`, JSON.stringify(result));
      if (job) {
        // Если найдена запись, ставим на паузу и НЕ удаляем браузер
        if (result && (result.hasCitas === true || result.success === true)) {
          job.status = 'paused';
          console.log(`⏸️ Автокликер 2 поставлен на паузу (найдена запись), jobId: ${jobId}`);
          console.log(`⚠️ Браузер остается подключенным для сохранения сессии!`);
          // НЕ удаляем браузер из activeBrowsers, чтобы сессия сохранилась
        } else {
          // Если записей нет или другая ситуация, завершаем нормально
          activeBrowsers.delete(jobId);
          if (job.stopRequested) {
            job.status = 'stopped';
          } else {
            job.status = 'completed';
          }
          console.log(`✅ Автокликер 2 завершен успешно, jobId: ${jobId}`, result);
        }
        job.endTime = new Date();
        job.result = result;
        console.log(`📊 Статус задачи ${jobId} обновлен: ${job.status}`);
      } else {
        // Если задачи нет, все равно удаляем браузер
        activeBrowsers.delete(jobId);
      }
    })
    .catch(error => {
      activeBrowsers.delete(jobId);
      console.error(`❌ Ошибка в автокликере 2, jobId: ${jobId}:`, error);
      console.error(`📋 Stack trace:`, error.stack);
      const job = jobs.get(jobId);
      if (job) {
        if (job.stopRequested) {
          job.status = 'stopped';
        } else {
          job.status = 'error';
        }
        job.endTime = new Date();
        job.error = error.message;
        console.log(`📊 Статус задачи ${jobId} обновлен: ${job.status}`);
      }
    });

  return jobId;
}

// Получение статуса задачи
function getJobStatus(jobId) {
  return jobs.get(jobId) || null;
}

// Остановка автокликера
async function stopAutoclicker(jobId) {
  const job = jobs.get(jobId);
  if (!job) {
    return { success: false, error: 'Задача не найдена' };
  }

  if (job.status !== 'running' && job.status !== 'paused') {
    return { success: false, error: 'Задача не выполняется и не на паузе' };
  }

  console.log(`🛑 Остановка автокликера, jobId: ${jobId}`);
  job.stopRequested = true;

  // Закрываем браузер, если он есть
  const browser = activeBrowsers.get(jobId);
  if (browser) {
    try {
      // Если задача на паузе, просто отключаемся, не закрывая браузер
      if (job.status === 'paused') {
        try {
          if (browser.disconnect) {
            browser.disconnect();
            console.log(`✅ Отключено от браузера для задачи ${jobId} (браузер остается открытым)`);
          }
        } catch (e) {
          console.log(`⚠️ Не удалось отключиться от браузера:`, e.message);
        }
      } else {
        // Если задача выполнялась, закрываем браузер
        await browser.close();
        console.log(`✅ Браузер закрыт для задачи ${jobId}`);
      }
    } catch (error) {
      console.error(`❌ Ошибка при закрытии/отключении браузера:`, error);
    }
    activeBrowsers.delete(jobId);
  }

  job.status = 'stopped';
  job.endTime = new Date();

  return { success: true, message: 'Автокликер остановлен' };
}

module.exports = {
  startAutoclicker1,
  startAutoclicker2,
  getJobStatus,
  stopAutoclicker
};

