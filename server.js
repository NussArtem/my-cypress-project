#!/usr/bin/env node

require('dotenv').config();
const express = require('express');
const path = require('path');
const {
  startAutoclicker1,
  startAutoclicker2,
  getJobStatus,
  stopAutoclicker,
} = require('./lib/autoclickerManager');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

// Главная страница
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// API: Запуск автокликера 1
app.post('/api/start-autoclicker1', async (req, res) => {
  console.log('📥 Получен запрос на запуск автокликера 1');
  try {
    const { tipoDocumento, numeroNie, nombreCompleto, paisCiudadania } =
      req.body;
    console.log('📋 Данные запроса:', {
      tipoDocumento,
      numeroNie,
      nombreCompleto,
      paisCiudadania,
    });

    if (!numeroNie || !nombreCompleto) {
      return res.status(400).json({
        success: false,
        error: 'Необходимо указать номер NIE и имя',
      });
    }

    const userData = {
      tipoDocumento: tipoDocumento || 'NIE',
      numeroNie: numeroNie.trim(),
      nombreCompleto: nombreCompleto.trim(),
      paisCiudadania: paisCiudadania || 'UCRANIA',
    };

    const jobId = await startAutoclicker1(userData);
    console.log(`✅ Автокликер 1 запущен, jobId: ${jobId}`);

    res.json({
      success: true,
      jobId: jobId,
      message: 'Автокликер 1 запущен',
    });
  } catch (error) {
    console.error('Ошибка запуска автокликера 1:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// API: Запуск автокликера 2
app.post('/api/start-autoclicker2', async (req, res) => {
  console.log('📥 Получен запрос на запуск автокликера 2');
  try {
    const { tipoDocumento, numeroNie, nombreCompleto } = req.body;
    console.log('📋 Данные запроса:', {
      tipoDocumento,
      numeroNie,
      nombreCompleto,
    });

    if (!numeroNie || !nombreCompleto) {
      return res.status(400).json({
        success: false,
        error: 'Необходимо указать номер NIE и имя',
      });
    }

    const userData = {
      tipoDocumento: tipoDocumento || 'NIE',
      numeroNie: numeroNie.trim(),
      nombreCompleto: nombreCompleto.trim(),
    };

    const jobId = await startAutoclicker2(userData);
    console.log(`✅ Автокликер 2 запущен, jobId: ${jobId}`);

    res.json({
      success: true,
      jobId: jobId,
      message: 'Автокликер 2 запущен',
    });
  } catch (error) {
    console.error('Ошибка запуска автокликера 2:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// API: Статус выполнения
app.get('/api/status/:jobId', (req, res) => {
  const { jobId } = req.params;
  const job = getJobStatus(jobId);

  if (!job) {
    return res.status(404).json({
      success: false,
      error: 'Задача не найдена',
    });
  }

  res.json({
    success: true,
    job: {
      id: job.id,
      type: job.type,
      status: job.status,
      startTime: job.startTime,
      endTime: job.endTime,
      result: job.result,
      error: job.error,
    },
  });
});

// API: Остановка автокликера
app.post('/api/stop/:jobId', async (req, res) => {
  try {
    const { jobId } = req.params;
    console.log(`🛑 Получен запрос на остановку автокликера, jobId: ${jobId}`);

    const result = await stopAutoclicker(jobId);

    if (result.success) {
      res.json({
        success: true,
        message: result.message,
      });
    } else {
      res.status(400).json({
        success: false,
        error: result.error,
      });
    }
  } catch (error) {
    console.error('Ошибка остановки автокликера:', error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// Запуск сервера
app.listen(PORT, () => {
  console.log(`🚀 Сервер запущен на порту ${PORT}`);
  console.log(`📱 Откройте http://localhost:${PORT} в браузере`);
});
