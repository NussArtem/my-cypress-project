# Автокликер для записи на прием

Веб-приложение для автоматизации записи на прием в испанских государственных учреждениях.

## Установка

1. Установите зависимости:
```bash
npm install
```

2. Создайте файл `.env` на основе `.env.example`:
```bash
cp .env.example .env
```

3. Заполните переменные окружения в `.env`:
- `TELEGRAM_BOT_TOKEN` - токен Telegram бота
- `TELEGRAM_CHAT_IDS` - ID чатов через запятую
- `PORT` - порт сервера (по умолчанию 3000)

## Запуск локально

```bash
npm start
```

Сервер будет доступен по адресу: http://localhost:3000

## Развертывание на Railway

1. Подключите репозиторий к Railway
2. Установите переменные окружения в настройках проекта:
   - `TELEGRAM_BOT_TOKEN`
   - `TELEGRAM_CHAT_IDS`
   - `PORT` (Railway установит автоматически)
3. Railway автоматически определит Node.js проект и запустит `npm start`

## Использование

1. Откройте главную страницу
2. Выберите автокликер (1 или 2)
3. Заполните форму с данными
4. Нажмите "Запустить автокликер"
5. Автокликер начнет работу в фоновом режиме

## API

### POST /api/start-autoclicker1
Запуск автокликера 1 (со страной гражданства)

Тело запроса:
```json
{
  "tipoDocumento": "NIE",
  "numeroNie": "Z1868415S",
  "nombreCompleto": "ANTONII REVSIN",
  "paisCiudadania": "UCRANIA"
}
```

### POST /api/start-autoclicker2
Запуск автокликера 2 (без страны гражданства)

Тело запроса:
```json
{
  "tipoDocumento": "NIE",
  "numeroNie": "Z1868415S",
  "nombreCompleto": "ANTONII REVSIN"
}
```

### GET /api/status/:jobId
Получение статуса выполнения задачи

## Структура проекта

- `server.js` - Express сервер
- `autoclicker.js` - Автокликер 1
- `autoclicker2.js` - Автокликер 2
- `lib/` - Вспомогательные модули
- `public/` - Статические файлы (HTML формы)

