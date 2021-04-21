import yargs from 'yargs/yargs';
import { hideBin } from 'yargs/helpers';
import Scraper from './scraper';
import { ScraperOptions } from './types';

const argv = yargs(hideBin(process.argv))
  .usage('Usage: $0 [options]')
  .option('u', {
    description: 'an url to scrape',
    demandOption: 'You have to provide an url to scrape',
    type: 'string',
    alias: 'url',
  })
  .option('d', {
    description: 'a path to output directory',
    default: process.cwd(),
    type: 'string',
    alias: 'directory',
  })
  .option('f', {
    description: 'a name of output json file',
    default: 'adverts.json',
    type: 'string',
    alias: 'file',
  })
  // In order to use an authentication cookie you have to provide
  // username and password for your avito account in .env file
  // Authentication could be needed to get a phone number
  // Whether you can get a phone number without authentication or
  // not depends on the settings of the phone number owner
  // So in order to obtain all phone numbers you have to log in to avito
  // ATTENTION:
  // But if you scrape phone numbers while logged in,
  // your avito account will be banned after about 20 phone numbers
  // So this feature is added for educational purposes only and I don't
  // recommend using it in real scraping
  .option('a', {
    description: 'use an authentication cookie',
    boolean: true,
    default: false,
    alias: 'auth',
  })
  // default value 0 means to scrape all pages
  .option('p', {
    description: 'a number of pages to scrape',
    default: 0,
    defaultDescription: 'all pages',
    type: 'number',
    alias: 'pages',
  })
  .option('h', {
    alias: 'help',
    description: 'display help message',
  })
  .help('help').argv;

const scraper = new Scraper();

const options: ScraperOptions = {
  url: argv.url as string,
  outputPath: argv.directory as string,
  fileName: argv.file as string,
  auth: argv.auth as boolean,
  pages: argv.pages as number,
};

scraper.scrape(options).catch(console.log);
