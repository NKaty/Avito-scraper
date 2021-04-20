# PeacockTeam: Тестовое задание

Написать node-js скрипт на базе Puppeteer, осуществляющий сбор объявлений с авито.

Входные данные - ссылка на страницу с объявлениями (например, https://www.avito.ru/sankt-peterburg/koshki/poroda-meyn-kun-ASgBAgICAUSoA5IV)

Результат - json файл с массивом объявлений

```typescript
interface Advert {
  title: string;
  description: string;
  url: string;
  price: number;
  author: string;
  date: string; // ISO-8601
  phone: string;
}
```
## В реализации использованы

Node.js, Typescript, Puppeteer, Yargs

## Установка
1. Клонируйте репозиторий

   ```git clone https://github.com/NKaty/Avito-scraper.git scraper```
2. Перейдите в директорию с проектом

   ```cd scraper```
3. Установите зависимости

   ```npm install```

## Запуск
### Development mode
1. Запустите компилятор typescript в watch mode

   ```npm run dev```
   
2. Измените пример в src/example.ts
2. Запустите пример

   ```node dist/example.js```

### Production mode
1. Сбилдите скрипт

   ```npm run build```
3. Посмотрите возможные опции для запуска скрипта

   ```node dist/index.js -h```
2. Запустите скрипт с нужными опциями и вашими данными

   ```node dist/index.js -u "https://www.avito.ru/sankt-peterburg/koshki/poroda-meyn-kun-ASgBAgICAUSoA5IV"```
