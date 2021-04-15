import puppeteer, { Browser, Page } from 'puppeteer';
import getDate from './utils/getDate';

type Nullable<T> = T | null;

interface Advert {
  title: Nullable<string>;
  description: Nullable<string>;
  url: Nullable<string>;
  price: Nullable<number>;
  author: Nullable<string>;
  date: Nullable<string>; // ISO-8601
  // phone: string;
}

class Scraper {
  browser: Nullable<Browser> = null;

  private async startBrowser(): Promise<void> {
    try {
      this.browser = await puppeteer.launch({
        // headless: false,
        args: ['--disable-setuid-sandbox'],
        ignoreHTTPSErrors: true,
      });
    } catch (err) {
      console.log('Could not create a browser instance: ', err);
    }
  }

  private async *getPages(url: string) {
    let urls: string[] = [];
    if (!this.browser) return urls;
    let page: Nullable<Page> = await this.browser.newPage();
    try {
      await page.goto(url);
      while (page) {
        console.log(`Navigating to ${page.url()}...`);
        await page.waitForSelector('div[data-marker="catalog-serp"]');
        urls = await page.$$eval(
          'div[data-marker="catalog-serp"] > div[data-marker="item"] div[class*="iva-item-body-"] a[itemprop="url"]',
          links => links.map(el => (el as HTMLAnchorElement).href)
        );
        const result: [string[], Page] = [urls, page];
        yield result;
        let nextButtonClasses: Nullable<string> = null;
        try {
          nextButtonClasses = await page.$eval(
            '[data-marker="pagination-button/next"]',
            item => item.classList.value
          );
        } catch (e) {}
        if (
          !nextButtonClasses ||
          nextButtonClasses.includes('pagination-item_readonly')
        ) {
          if (page && !page.isClosed()) await page.close();
          page = null;
          console.log('last page');
        } else {
          console.log('click');
          await page.click('[data-marker="pagination-button/next"]');
        }
      }
    } catch (err) {
      console.log(`Could not get page: `, err);
      if (page && !page.isClosed()) await page.close();
    }
  }

  private async getTitle(page: Page): Promise<Nullable<string>> {
    let title: Nullable<string> = null;
    try {
      title = await page.$eval(
        '.title-info-title-text[itemprop="name"]',
        item => item.textContent
      );
      if (title) title = title.trim();
    } catch (err) {
      console.log('Could not get title: ', err);
    }
    return title;
  }

  private async getDescription(page: Page): Promise<Nullable<string>> {
    let description: Nullable<string> = null;
    try {
      description = await page.$eval(
        '.item-description-text[itemprop="description"] > p',
        item => item.textContent
      );
      if (description) description = description.trim();
    } catch (err) {
      console.log('Could not get description: ', err);
    }
    return description;
  }

  private async getPrice(page: Page): Promise<Nullable<number>> {
    let price: Nullable<number> = null;
    try {
      price = await page.$eval('.item-price [itemprop="price"]', item => {
        const price = item.getAttribute('content');
        return price === null || price === undefined ? null : +price;
      });
    } catch (err) {
      console.log('Could not get price: ', err);
    }
    return price;
  }

  private async getAuthor(page: Page): Promise<Nullable<string>> {
    let author: Nullable<string> = null;
    try {
      author = await page.$eval(
        '.seller-info-name > a',
        item => item.textContent
      );
      if (author) author = author.trim();
    } catch (err) {
      console.log('Could not get author: ', err);
    }
    return author;
  }

  private async getDate(page: Page): Promise<Nullable<string>> {
    let date: Nullable<string> = null;
    try {
      date = await page.$eval(
        '.title-info-actions .title-info-metadata-item-redesign',
        item => item.textContent
      );
      if (date) date = getDate(date.trim());
    } catch (err) {
      console.log('Could not get date: ', err);
    }
    return date;
  }

  private async getAdvertData(url: string): Promise<Nullable<Advert>> {
    let advert: Nullable<Advert> = null;
    if (!this.browser) return advert;
    let page: Page | undefined;
    try {
      const page = await this.browser.newPage();
      await page.setDefaultNavigationTimeout(0);
      await page.goto(url);
      await page.waitForSelector('.item-view');
      advert = {
        title: await this.getTitle(page),
        description: await this.getDescription(page),
        url,
        price: await this.getPrice(page),
        author: await this.getAuthor(page),
        date: await this.getDate(page),
      };
    } catch (err) {
      console.log(`Could not get ${url}: `, err);
    } finally {
      if (page && !page.isClosed()) await page.close();
    }
    return advert;
  }

  private async getAdverts(urls: string[]): Promise<void> {
    for (const link of urls) {
      const adverts: Nullable<Advert> = await this.getAdvertData(link);
      console.log(adverts);
    }
  }

  async scrapeAdverts(url: string, pages: number): Promise<void> {
    let count = 0;
    let page: Nullable<Page> = null;
    for await (const [links, currentPage] of this.getPages(url)) {
      if (links.length) await this.getAdverts(links);
      console.log(count, links.length);
      page = currentPage;
      count++;
      if (count === pages) break;
    }
    if (page && !page.isClosed()) await page.close();
  }

  async scrape(url: string, pages = 15): Promise<void> {
    try {
      await this.startBrowser();
      if (!this.browser) return;
      await this.scrapeAdverts(url, pages);
    } catch (err) {
      console.log(err);
    } finally {
      if (this.browser) await this.browser.close();
      this.browser = null;
    }
  }
}

export default Scraper;
