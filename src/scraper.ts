import puppeteer, { Browser, Page, Protocol } from 'puppeteer';
import { Writable } from 'stream';
import { createWriteStream } from 'fs';
import { resolve } from 'path';
import ratelimit from 'promise-ratelimit';
import dotenv from 'dotenv';
import Cookie = Protocol.Network.Cookie;

dotenv.config();

type Nullable<T> = T | null;

interface Advert {
  title: Nullable<string>;
  description: Nullable<string>;
  url: Nullable<string>;
  price: Nullable<number>;
  author: Nullable<string>;
  date: Nullable<string>; // ISO-8601
  phone: Nullable<string>;
}

class Scraper {
  private browser: Nullable<Browser> = null;
  private cookie: Nullable<Array<Cookie>> = null;
  private outputStream: Nullable<Writable> = null;
  private authPage: Nullable<Page> = null;
  private firstAdvert = true;
  private cookieError = false;
  private throttle = ratelimit(3000);
  private key = 'af0deccbgcgidddjgnvljitntccdduijhdinfgjgfjir';
  private userAgent =
    'Mozilla/5.0 (Linux; Android 6.0; Nexus 5 Build/MRA58N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/87.0.4280.66 Mobile Safari/537.36';

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

  private async *getPages(url: string) {
    let ids: string[] = [];
    if (!this.browser) return ids;
    let page: Nullable<Page> = await this.browser.newPage();
    await page.setDefaultNavigationTimeout(120000);

    try {
      await page.goto(url);
      while (page) {
        console.log(`Navigating to ${page.url()}...`);
        await page.waitForSelector('div[class*="items-items-"]');
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
          // await Promise.all([
          //   page.waitForNavigation(),
          //   page.click('span[data-marker="pagination-button/next"]'),
          // ]);
          await page.click('span[data-marker="pagination-button/next"]');
        }
      }
    } catch (err) {
      console.log(`Could not get page: ${page?.url()}`, err);
      if (page && !page.isClosed()) await page.close();
    }
  }

  private async getCookie(): Promise<void> {
    if (!this.browser) return;
    let page: Nullable<Page> = null;

    try {
      page = await this.browser.newPage();
      await page.setDefaultNavigationTimeout(120000);
      await page.setUserAgent(this.userAgent);
      await page.goto('https://m.avito.ru/#login');
      await page.waitForSelector('#app');

      if (process.env.USERNAME && process.env.PASSWORD) {
        // await Promise.all([
        //   page.waitForNavigation(),
        //   page.click('div[data-marker="login-button"'),
        // ]);
        await page.click('div[data-marker="login-button"');
        await page.type('input[name="login"]', process.env.USERNAME);
        await page.type('input[name="password"]', process.env.PASSWORD);
        // await Promise.all([
        //   page.waitForNavigation(),
        //   page.click('input[type="submit"'),
        // ]);
        await page.click('input[type="submit"');
      }
      this.cookie = await page.cookies();
      this.authPage = page;
    } catch (err) {
      console.log('Could not get cookie:', err);
      this.cookieError = true;
    }
  }

  private async getAdvertData(id: string): Promise<Nullable<Advert>> {
    let advert: Nullable<Advert> = null;
    if (!this.browser) return advert;
    let page: Page | undefined;

    try {
      if (!this.cookieError && !this.cookie) await this.getCookie();
      const page = await this.browser.newPage();
      await page.setUserAgent(this.userAgent);
      if (this.cookie) await page.setCookie(...this.cookie);

      await this.throttle();
      const advertResponse = await page.goto(
        `https://m.avito.ru/api/15/items/${id}?key=${this.key}`
      );
      const advertData = await advertResponse.json();

      await this.throttle();
      const phoneResponse = await page.goto(
        `https://m.avito.ru/api/1/items/${id}/phone?key=${this.key}`
      );
      const phoneData = await phoneResponse.json();
      const phone = phoneData.result?.action?.uri.split('%2B').slice(-1)[0];

      advert = {
        title: advertData.title,
        description: advertData.description,
        url: advertData.seo.canonicalUrl,
        price: isNaN(advertData.price.value) ? 0 : +advertData.price.value,
        author: advertData.seller.name,
        date: new Date(+advertData.time * 1000).toISOString(),
        phone: isNaN(+phone) ? null : phone,
      };
    } catch (err) {
      console.log(`Could not get advert (${id}): `, err);
    }

    if (page && !page.isClosed()) await page.close();
    return advert;
  }

  private async getAdverts(ids: string[]): Promise<void> {
    try {
      for (const id of ids) {
        const advert: Nullable<Advert> = await this.getAdvertData(id);
        if (this.outputStream && advert) {
          if (this.firstAdvert) {
            this.outputStream.write(`\n${JSON.stringify({ ...advert })}`);
          } else {
            this.outputStream.write(`,\n${JSON.stringify({ ...advert })}`);
          }
          this.firstAdvert = false;
        }
      }
    } catch (err) {
      console.log('An error occurred while writing to the file.');
    }
  }

  private async scrapeAdverts(
    url: string,
    outputPath: string,
    fileName: string,
    pages: number
  ): Promise<void> {
    let count = 0;
    let page: Nullable<Page> = null;
    this.outputStream = createWriteStream(resolve(outputPath, fileName));
    this.outputStream.write('[');
    try {
      for await (const [ids, currentPage] of this.getPages(url)) {
        if (ids.length) await this.getAdverts(ids);
        console.log(count, ids.length);
        page = currentPage;
        count++;
        if (count === pages) break;
      }
    } catch (err) {
      console.log(err);
    }
    if (page && !page.isClosed()) await page.close();
    if (this.outputStream) this.outputStream.end('\n]\n');
  }

  private async clean(): Promise<void> {
    this.firstAdvert = true;
    this.cookieError = false;

    try {
      if (this.authPage && !this.authPage.isClosed()) {
        await this.authPage.close();
      }

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

  async scrape(
    url: string,
    outputPath: string = process.cwd(),
    fileName = 'adverts.json',
    pages = 0
  ): Promise<void> {
    try {
      await this.startBrowser();
      if (this.browser) {
        await this.scrapeAdverts(url, outputPath, fileName, pages);
      }
    } catch (err) {
      console.log(err);
    }
    await this.clean();
  }
}

export default Scraper;
