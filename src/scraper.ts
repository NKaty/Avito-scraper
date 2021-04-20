import puppeteer, { Browser, Page } from 'puppeteer';
import { Writable } from 'stream';
import { createWriteStream } from 'fs';
import { resolve } from 'path';
import ratelimit from 'promise-ratelimit';
import dotenv from 'dotenv';
import toISOStringTimezoneOffset from './utils/convertDate';
import { Nullable, Advert, ScraperOptions } from './types';

dotenv.config();

class Scraper {
  private browser: Nullable<Browser> = null;
  private outputStream: Nullable<Writable> = null;
  private requestPage: Nullable<Page> = null;
  private advertsPage: Nullable<Page> = null;
  private firstAdvert = true;
  private auth = false;
  // To make pauses between requests
  private throttle = ratelimit(3000);
  private key = 'af0deccbgcgidddjgnvljitntccdduijhdinfgjgfjir';
  private userAgent =
    'Mozilla/5.0 (Linux; Android 6.0; Nexus 5 Build/MRA58N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/87.0.4280.66 Mobile Safari/537.36';

  private beforeStart(auth: boolean): void {
    this.browser = null;
    this.outputStream = null;
    this.requestPage = null;
    this.advertsPage = null;
    this.firstAdvert = true;
    this.auth = auth;
  }

  // Creates a browser instance
  private async startBrowser(): Promise<void> {
    this.browser = await puppeteer.launch({
      args: ['--disable-setuid-sandbox'],
      ignoreHTTPSErrors: true,
    });
  }

  // Gets advert ids from pages
  private async *getPages(url: string) {
    if (!this.browser) throw new Error('There is no browser instance');

    this.advertsPage = await this.browser.newPage();
    // Increase the maximum navigation time
    // Sometimes 30 seconds is not enough
    await this.advertsPage.setDefaultTimeout(120000);
    await this.advertsPage.goto(url);

    while (this.advertsPage) {
      console.log(`Scraping ${this.advertsPage.url()}...`);
      await this.advertsPage.waitForSelector('div[class*="items-items-"]');
      // Get only the ids of the adverts that are related to the url
      // (not vip, not other regions)
      const ids = await this.advertsPage.$$eval(
        'div[data-marker="catalog-serp"] > div[data-marker="item"] div[class*="iva-item-body-"] a[itemprop="url"]',
        links =>
          links.map(
            el => (el as HTMLAnchorElement).href.split('_').slice(-1)[0]
          )
      );
      yield ids;

      let nextButtonClasses: Nullable<string> = null;
      try {
        nextButtonClasses = await this.advertsPage.$eval(
          'span[data-marker="pagination-button/next"]',
          item => item.classList.value
        );
      } catch (err) {}

      if (
        !nextButtonClasses ||
        nextButtonClasses.includes('pagination-item_readonly')
      ) {
        if (this.advertsPage && !this.advertsPage.isClosed()) {
          await this.advertsPage.close();
        }
        this.advertsPage = null;
      } else {
        // Puppeteer recommends this pattern for click, but sometimes
        // it doesn't work (TimeoutError: Navigation timeout exceeded)
        // await Promise.all([
        //   this.advertsPage.waitForNavigation(),
        //   this.advertsPage.click('span[data-marker="pagination-button/next"]'),
        // ]);
        await this.advertsPage.click(
          'span[data-marker="pagination-button/next"]'
        );
      }
    }
  }

  // Gets a mobile page to make request
  // The page can be with an authentication cookie or not
  // Authentication could be needed to get a phone number
  // Whether you can get a phone number without authentication or
  // not depends on the settings of the phone number owner
  // So in order to obtain all phone numbers you have to log in to avito
  // ATTENTION:
  // But if you scrape phone numbers while logged in,
  // your avito account will be banned after about 20 phone numbers
  // So this code is written for educational purposes only and I don't
  // recommend using it in real scraping
  private async getRequestPage(): Promise<void> {
    if (!this.browser) throw new Error('There is no browser instance');

    this.requestPage = await this.browser.newPage();
    // Increase the maximum navigation time
    // Sometimes 30 seconds is not enough
    await this.requestPage.setDefaultTimeout(120000);
    // For a mobile version
    await this.requestPage.setUserAgent(this.userAgent);

    // Username and password are stored in environment variables (.env file)
    // Remember: your avito account will be banned after 20 phone numbers
    if (this.auth && process.env.USERNAME && process.env.PASSWORD) {
      await this.requestPage.goto('https://m.avito.ru/#login');
      await this.requestPage.waitForSelector('#app');
      // Puppeteer recommends this pattern for click, but sometimes
      // it doesn't work (TimeoutError: Navigation timeout exceeded)
      // await Promise.all([
      //   this.requestPage.waitForNavigation(),
      //   this.requestPage.click('div[data-marker="login-button"'),
      // ]);
      await this.requestPage.click('div[data-marker="login-button"');
      await this.requestPage.type('input[name="login"]', process.env.USERNAME);
      await this.requestPage.type(
        'input[name="password"]',
        process.env.PASSWORD
      );
      // Puppeteer recommends this pattern for click, but sometimes
      // it doesn't work (TimeoutError: Navigation timeout exceeded)
      // await Promise.all([
      //   this.requestPage.waitForNavigation(),
      //   this.requestPage.click('input[type="submit"'),
      // ]);
      await this.requestPage.click('input[type="submit"');
    }
  }

  // Makes requests to avito api to get advert data
  private async getAdvertData(id: string): Promise<Nullable<Advert>> {
    if (!this.browser) throw new Error('There is no browser instance');
    let advert: Nullable<Advert> = null;

    try {
      if (this.requestPage) {
        // Make a pause before the request to avoid being banned
        // for too frequent access to the internal api
        await this.throttle();
        // Get all the information except the phone number
        const advertResponse = await this.requestPage.goto(
          `https://m.avito.ru/api/15/items/${id}?key=${this.key}`
        );
        const advertData = await advertResponse.json();

        // Make a pause before the request to avoid being banned
        // for too frequent access to the internal api
        // Although if you scrape phone numbers while logged in,
        // your avito account will still be banned after about 20 phone numbers
        await this.throttle();
        // Get the phone number
        // We don't check here to see if we have the authentication cookie,
        // because we can get some phone numbers even without authentication
        const phoneResponse = await this.requestPage.goto(
          `https://m.avito.ru/api/1/items/${id}/phone?key=${this.key}`
        );
        const phoneData = await phoneResponse.json();
        const phone = phoneData.result?.action?.uri?.split('%2B').slice(-1)[0];

        advert = {
          title: advertData.title || '',
          description: advertData.description || '',
          url: advertData.seo?.canonicalUrl || '',
          price: isNaN(+advertData.firebaseParams?.itemPrice)
            ? 0
            : +advertData.firebaseParams.itemPrice,
          author: advertData.seller?.name || '',
          date: isNaN(+advertData.time)
            ? ''
            : toISOStringTimezoneOffset(+advertData.time),
          phone: isNaN(+phone) ? '' : phone,
        };
      }
    } catch (err) {
      console.log(`Could not get advert (${id}): `, err);
    }

    return advert;
  }

  private writeAdvert(advert: Advert): void {
    if (this.outputStream) {
      if (this.firstAdvert) {
        this.outputStream.write(
          `\n${JSON.stringify({ ...advert }, undefined, 2)}`
        );
        this.firstAdvert = false;
      } else {
        this.outputStream.write(
          `,\n${JSON.stringify({ ...advert }, undefined, 2)}`
        );
      }
    }
  }

  // Writes the adverts to the file
  private async getAdverts(ids: string[]): Promise<void> {
    if (!this.requestPage || this.requestPage.isClosed()) {
      await this.getRequestPage();
    }

    if (!this.requestPage) throw new Error('Could not get the request page.');

    for (const id of ids) {
      const advert: Nullable<Advert> = await this.getAdvertData(id);
      if (advert) this.writeAdvert(advert);
    }
  }

  // Manages the scraping process
  private async scrapeAdverts(
    url: string,
    outputPath: string,
    fileName: string,
    pages: number
  ): Promise<void> {
    let count = 0;

    try {
      this.outputStream = createWriteStream(resolve(outputPath, fileName));
      this.outputStream.write('[');

      for await (const ids of this.getPages(url)) {
        if (ids.length) await this.getAdverts(ids);
        count++;
        if (count === pages) break;
      }
    } catch (err) {
      console.log('Got an error while scraping: ', err);
    }

    if (this.advertsPage && !this.advertsPage.isClosed()) {
      await this.advertsPage.close();
    }
    if (this.outputStream) this.outputStream.end('\n]\n');
  }

  // Cleans after scraping
  private async clean(): Promise<void> {
    this.firstAdvert = true;
    this.auth = false;

    try {
      if (this.advertsPage && !this.advertsPage.isClosed()) {
        await this.advertsPage.close();
      }
      this.advertsPage = null;

      if (this.requestPage && !this.requestPage.isClosed()) {
        await this.requestPage.close();
      }
      this.requestPage = null;

      if (this.browser) await this.browser.close();
      this.browser = null;

      if (this.outputStream && !this.outputStream.writableEnded) {
        this.outputStream.end();
      }
      this.outputStream = null;
    } catch (err) {
      console.log('Could not clean:', err);
      process.exit(1);
    }
  }

  // Launches the scraping process
  async scrape(options: ScraperOptions): Promise<void> {
    // url to scrape
    const url = options.url ?? '';
    // path to output directory
    const outputPath = options.outputPath ?? process.cwd();
    // name of output json file
    const fileName = options.fileName ?? 'adverts.json';
    // whether or not to use an authentication cookie to get phone numbers
    // default value false means not to use an authentication cookie
    // Authentication could be needed to get a phone number
    // Whether you can get a phone number without authentication or
    // not depends on the settings of the phone number owner
    // So in order to obtain all phone numbers you have to log in to avito
    // ATTENTION:
    // But if you scrape phone numbers while logged in,
    // your avito account will be banned after about 20 phone numbers
    // So this feature is added for educational purposes only and I don't
    // recommend using it in real scraping
    const auth = options.auth ?? false;
    // number of pages to scrape (default value 0 means to scrape all pages)
    const pages = options.pages ?? 0;

    if (!url) throw new Error('No url to scrape.');

    try {
      this.beforeStart(auth);
      await this.startBrowser();
      if (this.browser) {
        await this.scrapeAdverts(url, outputPath, fileName, pages);
      }
    } catch (err) {
      console.log('Got an error while scraping: ', err);
    }

    await this.clean();
  }
}

export default Scraper;
