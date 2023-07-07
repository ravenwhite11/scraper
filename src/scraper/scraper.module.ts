/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable prettier/prettier */
import { Module, OnApplicationBootstrap } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { TwseScraperService } from './twse-scraper.service';
import { TpexScraperService } from './tpex-scraper.service';
import { TaifexScraperService } from './taifex-scraper.service';
import { YahooFinanceService } from './yahoo-finance.service';
import { UsdtScraperService } from './usdt-scraper.service';


@Module({
  imports: [HttpModule], // HTTP Module 請求網頁資料
  providers: [TwseScraperService, TpexScraperService, TaifexScraperService, YahooFinanceService, UsdtScraperService],
})
export class ScraperModule {
  constructor(
    private readonly twseScraperService: TwseScraperService,
    private readonly tpexScraperService: TpexScraperService,
    private readonly taifexScraperService: TaifexScraperService,
    private readonly yahooFinanceService: YahooFinanceService
  ) {}
  

/*測試一下 
npm run start:dev
若報Cannot find module 可把dist刪除
*/
  //this.twseScraperService.fetchListedStocks({ market: 'TSE' });
  //this.tpexScraperService.fetchInstInvestorsTrades("2022-07-01");
  //this.taifexScraperService.fetchInstInvestorsTxfTrades("2022-07-01");
  //
  async onApplicationBootstrap() {
    const tmp = await this.yahooFinanceService.fetchUsStockMarketIndices("2022-07-01");
    console.log(tmp);
  }

  
}
