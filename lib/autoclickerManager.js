const { v4: uuidv4 } = require('uuid');
const autoclicker1Wrapper = require('./autoclicker1Wrapper');
const autoclicker2Wrapper = require('./autoclicker2Wrapper');

// Хранилище статусов задач
const jobs = new Map();
// Хранилище активных браузеров для возможности остановки
const activeBrowsers = new Map();
// Хранилище PID процессов Chrome для принудительной остановки
const chromeProcesses = new Map();

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
  const browserPromise = autoclicker1Wrapper.runAutoclicker(userData, jobId, (browser, chromePid, userDataDir) => {
    // Сохраняем ссылку на браузер для возможности остановки
    activeBrowsers.set(jobId, browser);
    // Сохраняем PID процесса Chrome и userDataDir для принудительной остановки
    if (chromePid) {
      chromeProcesses.set(jobId, { pid: chromePid, userDataDir: userDataDir });
    }
  }, checkStop)
    .then(result => {
      activeBrowsers.delete(jobId);
      chromeProcesses.delete(jobId);
      console.log(`✅ Автокликер 1 завершен успешно, jobId: ${jobId}`, result);
      const job = jobs.get(jobId);
      if (job) {
        if (job.stopRequested) {
          job.status = 'stopped';
        } else {
          job.status = 'completed';
        }
        job.endTime = new Date();
        job.result = result;
        console.log(`📊 Статус задачи ${jobId} обновлен: ${job.status}`);
      }
    })
    .catch(error => {
      activeBrowsers.delete(jobId);
      chromeProcesses.delete(jobId);
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
  const browserPromise = autoclicker2Wrapper.runAutoclicker(userData, jobId, (browser, chromePid, userDataDir) => {
    // Сохраняем ссылку на браузер для возможности остановки
    activeBrowsers.set(jobId, browser);
    // Сохраняем PID процесса Chrome и userDataDir для принудительной остановки
    if (chromePid) {
      chromeProcesses.set(jobId, { pid: chromePid, userDataDir: userDataDir });
    }
  }, checkStop)
    .then(result => {
      activeBrowsers.delete(jobId);
      chromeProcesses.delete(jobId);
      console.log(`✅ Автокликер 2 завершен успешно, jobId: ${jobId}`, result);
      const job = jobs.get(jobId);
      if (job) {
        if (job.stopRequested) {
          job.status = 'stopped';
        } else {
          job.status = 'completed';
        }
        job.endTime = new Date();
        job.result = result;
        console.log(`📊 Статус задачи ${jobId} обновлен: ${job.status}`);
      }
    })
    .catch(error => {
      activeBrowsers.delete(jobId);
      chromeProcesses.delete(jobId);
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

  if (job.status !== 'running') {
    return { success: false, error: 'Задача не выполняется' };
  }

  console.log(`🛑 ПРИНУДИТЕЛЬНАЯ ОСТАНОВКА автокликера, jobId: ${jobId}`);
  job.stopRequested = true;

  // ПРИНУДИТЕЛЬНОЕ УБИЙСТВО процесса Chrome через kill -9
  const chromeProcess = chromeProcesses.get(jobId);
  if (chromeProcess && chromeProcess.pid) {
    try {
      const { exec } = require('child_process');
      const os = require('os');
      const platform = os.platform();
      
      console.log(`💀 Принудительное убийство процесса Chrome (PID: ${chromeProcess.pid})...`);
      
      if (platform === 'win32') {
        exec(`taskkill /F /PID ${chromeProcess.pid}`, (error) => {
          if (error) {
            console.error(`Ошибка при убийстве процесса:`, error);
          } else {
            console.log(`✅ Процесс Chrome (PID: ${chromeProcess.pid}) убит принудительно`);
          }
        });
      } else {
        exec(`kill -9 ${chromeProcess.pid}`, (error) => {
          if (error) {
            console.error(`Ошибка при убийстве процесса:`, error);
          } else {
            console.log(`✅ Процесс Chrome (PID: ${chromeProcess.pid}) убит принудительно`);
          }
        });
      }
      
      // Также убиваем все дочерние процессы Chrome с тем же userDataDir
      if (chromeProcess.userDataDir) {
        if (platform === 'win32') {
          exec(`taskkill /F /FI "WINDOWTITLE eq *${chromeProcess.userDataDir}*"`, () => {});
        } else {
          exec(`pkill -9 -f "${chromeProcess.userDataDir}"`, () => {});
        }
      }
    } catch (error) {
      console.error(`Ошибка при принудительном убийстве процесса:`, error);
    }
  }

  // Закрываем браузер, если он есть
  const browser = activeBrowsers.get(jobId);
  if (browser) {
    try {
      // Закрываем все страницы перед закрытием браузера
      const pages = await browser.pages();
      for (const page of pages) {
        try {
          await page.close();
        } catch (e) {
          // Игнорируем ошибки при закрытии страниц
        }
      }
      console.log(`✅ Все страницы закрыты для задачи ${jobId}`);
      
      // Закрываем браузер
      await browser.close();
      console.log(`✅ Браузер закрыт для задачи ${jobId}`);
    } catch (error) {
      console.error(`❌ Ошибка при закрытии браузера:`, error);
      // Пытаемся закрыть принудительно
      try {
        await browser.disconnect();
      } catch (e) {
        // Игнорируем ошибки
      }
    }
    activeBrowsers.delete(jobId);
  }

  chromeProcesses.delete(jobId);
  job.status = 'stopped';
  job.endTime = new Date();

  return { success: true, message: 'Автокликер остановлен принудительно' };
}

module.exports = {
  startAutoclicker1,
  startAutoclicker2,
  getJobStatus,
  stopAutoclicker
};

