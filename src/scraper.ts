import puppeteer, { Browser, Page, Protocol } from 'puppeteer';
import { Writable } from 'stream';
import { createWriteStream } from 'fs';
import { resolve } from 'path';
import ratelimit from 'promise-ratelimit';
import dotenv from 'dotenv';
import toISOStringTimezoneOffset from './utils/convertDate';
import { Nullable, Advert } from './types';
import Cookie = Protocol.Network.Cookie;

dotenv.config();

class Scraper {
  private browser: Nullable<Browser> = null;
  private cookies: Nullable<Array<Cookie>> = null;
  private outputStream: Nullable<Writable> = null;
  private authPage: Nullable<Page> = null;
  private firstAdvert = true;
  private cookieError = false;
  // To make pauses between requests
  private throttle = ratelimit(3000);
  // Key for avito internal api
  private key = 'af0deccbgcgidddjgnvljitntccdduijhdinfgjgfjir';
  private userAgent =
    'Mozilla/5.0 (Linux; Android 6.0; Nexus 5 Build/MRA58N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/87.0.4280.66 Mobile Safari/537.36';

  // Creates a browser instance
  private async startBrowser(): Promise<void> {
    try {
      this.browser = await puppeteer.launch({
        args: ['--disable-setuid-sandbox'],
        ignoreHTTPSErrors: true,
      });
    } catch (err) {
      console.log('Could not create a browser instance: ', err);
    }
  }

  // Gets advert ids from pages
  private async *getPages(url: string) {
    let ids: string[] = [];
    if (!this.browser) return ids;
    let page: Nullable<Page> = await this.browser.newPage();
    // Increase the maximum navigation time
    // Sometimes 30 seconds is not enough
    await page.setDefaultTimeout(120000);

    try {
      await page.goto(url);
      while (page) {
        console.log(`Navigating to ${page.url()}...`);
        await page.waitForSelector('div[class*="items-items-"]');
        // Get only the ids of the adverts that are related to the url
        // (not vip, not other regions)
        ids = await page.$$eval(
          'div[data-marker="catalog-serp"] > div[data-marker="item"] div[class*="iva-item-body-"] a[itemprop="url"]',
          links =>
            links.map(
              el => (el as HTMLAnchorElement).href.split('_').slice(-1)[0]
            )
        );
        const result: [string[], Page] = [ids, page];
        yield result;

        let nextButtonClasses: Nullable<string> = null;
        try {
          nextButtonClasses = await page.$eval(
            '[data-marker="pagination-button/next"]',
            item => item.classList.value
          );
        } catch (err) {}

        if (
          !nextButtonClasses ||
          nextButtonClasses.includes('pagination-item_readonly')
        ) {
          if (page && !page.isClosed()) await page.close();
          page = null;
          console.log('last page');
        } else {
          console.log('click');
          // Puppeteer recommends this pattern for click, but sometimes
          // it doesn't work (TimeoutError: Navigation timeout exceeded)
          // await Promise.all([
          //   page.waitForNavigation(),
          //   page.click('span[data-marker="pagination-button/next"]'),
          // ]);
          await page.click('span[data-marker="pagination-button/next"]');
        }
      }
    } catch (err) {
      console.log(`Could not get page ${page?.url()}: `, err);
      if (page && !page.isClosed()) await page.close();
    }
  }

  // Gets authentication cookie
  // Whether you can get a phone number without authentication or
  // not depends on the settings of the phone number owner
  // So in order to obtain all phone numbers you have to log in to avito
  // But if you scrape phone numbers while logged in,
  // your avito account will be banned after about 20 phone numbers
  // So this code is written for educational purposes only and I don't
  // recommend using it in real scraping
  private async getCookie(): Promise<void> {
    if (!this.browser) return;

    try {
      this.authPage = await this.browser.newPage();
      // Increase the maximum navigation time
      // Sometimes 30 seconds is not enough
      await this.authPage.setDefaultTimeout(120000);
      // For a mobile version
      await this.authPage.setUserAgent(this.userAgent);
      await this.authPage.goto('https://m.avito.ru/#login');
      await this.authPage.waitForSelector('#app');

      // Username and password are stored in environment variables (.env file)
      // Remember: your avito account will be banned after 20 phone numbers
      if (process.env.USERNAME && process.env.PASSWORD) {
        // Puppeteer recommends this pattern for click, but sometimes
        // it doesn't work (TimeoutError: Navigation timeout exceeded)
        // await Promise.all([
        //   page.waitForNavigation(),
        //   page.click('div[data-marker="login-button"'),
        // ]);
        await this.authPage.click('div[data-marker="login-button"');
        await this.authPage.type('input[name="login"]', process.env.USERNAME);
        await this.authPage.type(
          'input[name="password"]',
          process.env.PASSWORD
        );
        // Puppeteer recommends this pattern for click, but sometimes
        // it doesn't work (TimeoutError: Navigation timeout exceeded)
        // await Promise.all([
        //   page.waitForNavigation(),
        //   page.click('input[type="submit"'),
        // ]);
        await this.authPage.click('input[type="submit"');
      }
      this.cookies = await this.authPage.cookies();
    } catch (err) {
      console.log('Could not get cookie: ', err);
      // If we have an error while getting cookies,
      // we don't try to get them every time we make request to the api
      this.cookieError = true;
    }
  }

  // Makes requests to avito api to get advert data
  private async getAdvertData(id: string): Promise<Nullable<Advert>> {
    let advert: Nullable<Advert> = null;
    if (!this.browser) return advert;
    let page: Page | undefined;

    try {
      if (!this.cookieError && !this.cookies) await this.getCookie();
      const page = await this.browser.newPage();
      // For a mobile version
      await page.setUserAgent(this.userAgent);
      if (this.cookies) await page.setCookie(...this.cookies);

      // Make a pause before the request to avoid being banned
      // for too frequent access to the internal api
      await this.throttle();
      // Get all the information except the phone number
      const advertResponse = await page.goto(
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
      const phoneResponse = await page.goto(
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
    } catch (err) {
      console.log(`Could not get advert (${id}): `, err);
    }

    if (page && !page.isClosed()) await page.close();
    return advert;
  }

  // Writes the adverts to the file
  private async getAdverts(ids: string[]): Promise<void> {
    try {
      for (const id of ids) {
        const advert: Nullable<Advert> = await this.getAdvertData(id);
        if (this.outputStream && advert) {
          if (this.firstAdvert) {
            this.outputStream.write(
              `\n${JSON.stringify({ ...advert }, undefined, 2)}`
            );
          } else {
            this.outputStream.write(
              `,\n${JSON.stringify({ ...advert }, undefined, 2)}`
            );
          }
          this.firstAdvert = false;
        }
      }
    } catch (err) {
      console.log('An error occurred while writing to the file: ', err);
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
    let page: Nullable<Page> = null;

    try {
      this.outputStream = createWriteStream(resolve(outputPath, fileName));
      this.outputStream.write('[');

      for await (const [ids, currentPage] of this.getPages(url)) {
        if (ids.length) await this.getAdverts(ids);
        page = currentPage;
        count++;
        console.log(count, ids.length);
        if (count === pages) break;
      }
    } catch (err) {
      console.log('Got an error while scraping: ', err);
    }

    if (page && !page.isClosed()) await page.close();
    if (this.outputStream) this.outputStream.end('\n]\n');
  }

  // Cleans after scraping
  private async clean(): Promise<void> {
    this.firstAdvert = true;
    this.cookieError = false;
    this.cookies = null;

    try {
      if (this.authPage && !this.authPage.isClosed()) {
        await this.authPage.close();
      }
      this.authPage = null;

      if (this.outputStream && !this.outputStream.writableEnded) {
        this.outputStream.end();
      }
      this.outputStream = null;

      if (this.browser) await this.browser.close();
      this.browser = null;
    } catch (err) {
      console.log('Could not clean:', err);
    }
  }

  // Launches the scraping process
  async scrape(
    // url to scrape
    url: string,
    // path to output directory
    outputPath: string = process.cwd(),
    // name of json file
    fileName = 'adverts.json',
    // number of pages to scrape (default value 0 means to scrape all pages)
    pages = 0
  ): Promise<void> {
    try {
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
