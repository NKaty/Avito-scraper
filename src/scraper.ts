import puppeteer, { Browser, Page } from 'puppeteer';

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
  browser?: Browser;

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

  private async getAdvertLinks(url: string): Promise<string[]> {
    let urls: string[] = [];
    if (!this.browser) return urls;
    const page = await this.browser.newPage();
    console.log(`Navigating to ${url}...`);
    try {
      await page.goto(url);
      await page.waitForSelector('div[data-marker="catalog-serp"]');
      urls = await page.$$eval(
        'div[data-marker="catalog-serp"] > div[data-marker="item"] div[class*="iva-item-body-"] a[itemprop="url"]',
        links => links.map(el => (el as HTMLAnchorElement).href)
      );
    } catch (err) {
      console.log('Could not get advert links: ', err);
    }
    return urls;
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
      if (date) date = date.trim();
    } catch (err) {
      console.log('Could not get date: ', err);
    }
    return date;
  }

  private async getPageData(url: string): Promise<Nullable<Advert>> {
    let advert: Nullable<Advert> = null;
    if (!this.browser) return advert;
    let page: Page | undefined;
    try {
      const page = await this.browser.newPage();
      await page.setDefaultNavigationTimeout(0);
      await page.goto(url);
      await page.waitForSelector('.item-view-q');
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

  private async getData(urls: string[]): Promise<void> {
    for (const link of urls) {
      const adverts: Nullable<Advert> = await this.getPageData(link);
      console.log(adverts);
    }
  }

  async scrape(url: string): Promise<void> {
    await this.startBrowser();
    if (!this.browser) return;
    const links = await this.getAdvertLinks(url);
    if (!links.length) {
      await this.browser.close();
      return;
    }
    await this.getData(links);
    await this.browser.close();
  }
}

export default Scraper;
