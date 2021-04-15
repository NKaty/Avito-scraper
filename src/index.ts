import Scraper from './scraper';

const scraper = new Scraper();
scraper
  .scrape(
    // 'https://www.avito.ru/sankt-peterburg/koshki/poroda-meyn-kun-ASgBAgICAUSoA5IV'
    'https://www.avito.ru/sankt-peterburg/koshki/poroda-nevskaya_maskaradnaya-ASgBAgICAUSoA5YV?p=2'
  )
  .catch(console.log);
