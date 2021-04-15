import Scraper from './scraper';

const scraper = new Scraper();
scraper
  .scrape(
    // 'https://www.avito.ru/sankt-peterburg/koshki/poroda-meyn-kun-ASgBAgICAUSoA5IV'
    // 'https://www.avito.ru/sankt-peterburg/koshki/poroda-nevskaya_maskaradnaya-ASgBAgICAUSoA5YV'
    'https://www.avito.ru/sankt-peterburg/koshki/poroda-mekongskiy_bobteyl-ASgBAgICAUSoA5QV'
  )
  .catch(console.log);
