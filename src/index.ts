import Scraper from './scraper';

const scraper = new Scraper();
scraper
  .scrape(
    'https://www.avito.ru/sankt-peterburg/koshki/poroda-meyn-kun-ASgBAgICAUSoA5IV'
  )
  .catch(console.log);
