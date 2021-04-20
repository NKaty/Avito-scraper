import Scraper from './scraper';

const scraper = new Scraper();

(async function () {
  await scraper.scrape({
    url:
      'https://www.avito.ru/sankt-peterburg/koshki/poroda-meyn-kun-ASgBAgICAUSoA5IV',
    pages: 2,
  });
  await scraper.scrape({
    url:
      'https://www.avito.ru/sankt-peterburg/koshki/poroda-mekongskiy_bobteyl-ASgBAgICAUSoA5QV',
    fileName: 'adverts1.json',
  });
})();
