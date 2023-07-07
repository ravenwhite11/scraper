/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable prettier/prettier */
import { Injectable } from '@nestjs/common';
import { default as yahooFinance } from 'yahoo-finance2';
import { DateTime } from 'luxon';

@Injectable()
export class YahooFinanceService {
    /*  實作11：取得美股四大指數(yahoo股市)
        https://ithelp.ithome.com.tw/articles/10289167
        美股四大指數為：道瓊工業平均指數、標準普爾 500 指數、納斯達克綜合指數、費城半導體指數。
        。道瓊工業平均指數：僅包含 30 檔大型股，編製方式是採價格加權。
        。標準普爾 500 指數(S&P)：編制方式是採市值加權，更能代表美國股市整體的表現。
        。納斯達克綜合指數(NASDAQ)：科技股佔了較高的比重。
        。費城半導體指數：台積電 ADR 也是費半指數重要的成份股，因此臺股與費半指數有很大的連動性。 */
    async fetchUsStockMarketIndices(date: string) {
        const dt = DateTime.fromISO(date).endOf('day');
        const symbols = ['^DJI', '^GSPC', '^IXIC', '^SOX'];
        try {
            // 取得 yahoo finance 歷史報價
            const results = await Promise.all(symbols.map(symbol => (
                    yahooFinance.historical(symbol, {
                    period1: dt.toISODate(),
                    period2: dt.plus({ day: 1 }).toISODate(),
                })
                .then(result => result.find(data => DateTime.fromJSDate(data.date).toISODate() === date))
            )));
        
            const [
                dow30,  // 道瓊工業平均指數
                sp500,  // S&P500 指數
                nasdaq, // 那斯達克指數
                sox,    // 費城半導體指數
            ] = results;
        
            return { date, dow30, sp500, nasdaq, sox };
        } catch (err) {
            return null;
        }
    }


}
