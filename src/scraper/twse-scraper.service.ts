/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable prettier/prettier */
import { Injectable, OnApplicationBootstrap } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { DateTime } from 'luxon';     //替代Moment.js 
import * as cheerio from 'cheerio';   //從 HTML 中擷取我們要的資料(API 方法類似 JQuery)
import * as iconv from 'iconv-lite';  //中文編碼
import * as numeral from 'numeral';   //處理數字資料


@Injectable()
export class TwseScraperService{
    constructor(private httpService: HttpService) {}
    
    /*  實作02：取得上市上櫃公司股票清單(臺灣證券交易所)
        https://ithelp.ithome.com.tw/articles/10287328
        在證交所網站每個交易日盤後，可以取得集中市場以及上市股票行情資訊。
    */
    async fetchListedStocks(options?: { market: 'TSE' | 'OTC' }) {
        const url = options?.market === 'OTC'
            ? 'https://isin.twse.com.tw/isin/class_main.jsp?market=2&issuetype=4'  //上市>股票
            : 'https://isin.twse.com.tw/isin/class_main.jsp?market=1&issuetype=1'; //上櫃>股票

        const page = await firstValueFrom( // 取得HTML 並 轉換為Big-5編碼
            this.httpService.get(url, { responseType: 'arraybuffer' }))
            .then((res) => iconv.decode(res.data, 'big5'));

        const $ = cheerio.load(page);// 載入 HTML 以取得表格的 table rows
        const rows = $('.h4 tr');

        const data = rows.slice(1).map((i, el) => {
            const td = $(el).find('td');
            return {
            symbol: td.eq(2).text().trim(),   // 股票代碼
            name: td.eq(3).text().trim(),     // 股票名稱
            market: td.eq(4).text().trim(),   // 市場別
            industry: td.eq(6).text().trim(), // 產業別
            };
        }).toArray();
        return data;
    }
    /*---------------------------------------------------------------------------------------------------------------*/

    /*---------------------------------------------------------------------
        大盤指數是衡量整體股票市場漲跌的重要指標，
        集中市場的「加權指數」與櫃買市場的「櫃買指數」都是以股票的市值加權計算，
        市值較高的股票加權比較高，因此權值股的漲跌對於大盤指數有舉足輕重的影響。

        由上而下的投資策略是確認大盤處於上升趨勢後，再挑選表現強勁的產業，然後從產業中選擇理想的個股。
        取得最近一段期間的大盤指數與市場成交資訊，以確認市場目前處在的位置。
    ---------------------------------------------------------------------*/
    /*  實作03：取得集中市場成交資訊
        https://ithelp.ithome.com.tw/articles/10287544 */
    async fetchMarketTrades(date: string) { // date: '2022-07-01'
        const formattedDate = DateTime.fromISO(date).toFormat('yyyyMMdd');
        const query = new URLSearchParams({
        response: 'json', 
        date: formattedDate,
        });
        const url = `https://www.twse.com.tw/exchangeReport/FMTQIK?${query}`;
        const responseData = await firstValueFrom(this.httpService.get(url))
            .then(response => (response.data.stat === 'OK') && response.data);
        if (!responseData) return null; //若該日期非交易日 或 尚無成交資訊

        const data = responseData.data
        .map(row => {
            // [ 日期, 成交股數, 成交金額, 成交筆數, 發行量加權股價指數, 漲跌點數 ]
            const [ date, ...values ] = row;
            // 將 `民國年/MM/dd` 的日期格式轉換成 `yyyy-MM-dd`
            const [ year, month, day ] = date.split('/');
            const formatted = `${+year + 1911}${month}${day}`;
            const formattedDate = DateTime.fromFormat(formatted, 'yyyyMMdd').toISODate();
            // 轉為數字格式
            const [ tradeVolume, tradeValue, transaction, price, change ]
                = values.map(value => numeral(value).value());

            return {
                date: formattedDate,
                tradeVolume, tradeValue, transaction, price, change,
            };
        })
        .find(data => data.date === date) || null;  // 取得目標日期的成交資訊
        return data;
    }
    /*---------------------------------------------------------------------
        小心！大盤指數可能失真
        若大盤指數可能無法反映整體市況時，可觀察上下漲跌家數的技術指標，
        如 騰落指標（ADL）、漲跌比率（ADR）、超買超賣指標（OBOS）等較客觀。
        利用市場每個交易日的上漲家數及下跌家數計算，藉此反映整體市場行情漲升力道與強弱變化。
    ---------------------------------------------------------------------*/
    /* 實作03：取得集中市場上漲及下跌家數 */
    async fetchMarketBreadth(date: string) { // date: '2022-07-01'
        const formattedDate = DateTime.fromISO(date).toFormat('yyyyMMdd');
        const query = new URLSearchParams({
          response: 'json',
          date: formattedDate,
          type: 'MS',           // 指定類別為大盤統計資訊
        });
        const url = `https://www.twse.com.tw/exchangeReport/MI_INDEX?${query}`;
        const responseData = await firstValueFrom(this.httpService.get(url))
          .then(response => (response.data.stat === 'OK') && response.data);
        if (!responseData) return null;
    
        const raw = responseData.data8.map(row => row[2]);  // 取股票市場統計
        const [ up, limitUp, down, limitDown, unchanged, unmatched, notApplicable ] = [
          ...raw[0].replace(')', '').split('('),  // 取出漲停家數
          ...raw[1].replace(')', '').split('('),  // 取出漲停家數
          ...raw.slice(2),
        ].map(value => numeral(value).value());   // 轉為數字格式
    
        const data = {
          date,
          up,
          limitUp,
          down,
          limitDown,
          unchanged,
          unmatched: unmatched + notApplicable, // 未成交(含暫停交易)家數
        };
        return data;
    }
    /*---------------------------------------------------------------------------------------------------------------*/

    /*---------------------------------------------------------------------
        在臺灣證券市場三大法人為：外資、投信及自營商。
        。外資：政府允許並核准的外國機構投資者，在證交所及櫃買中心揭露的買賣資訊，分為「外資與陸資（不含自營商）」和「外資自營商」。
        。投信：證券投資信託公司 的簡稱，就是基金公司。
        。自營商：使用自有資金操作的證券商，依買賣目的可區分為「自行買賣」和「避險」。
        外資的資金最雄厚，在臺股的連續買超或賣超，容易帶出大盤的波段走勢(加權指數漲跌)。
        除了 MSCI指數季度 調整階段(每年 2、5、8、11 月中)。
        。第四大法人 政府國安基金：僅能參考八大公股行庫券商的分點進出。
    ---------------------------------------------------------------------*/
    /* 實作04：查詢集中市場三大法人買賣超 */
    async fetchInstInvestorsTrades(date: string) { // date: '2022-07-01'
        const formattedDate = DateTime.fromISO(date).toFormat('yyyyMMdd');
        const query = new URLSearchParams({
        response: 'json',         
        dayDate: formattedDate,   
        type: 'day',              // 輸出日報表
        });
        const url = `https://www.twse.com.tw/fund/BFI82U?${query}`;
        const responseData = await firstValueFrom(this.httpService.get(url))
            .then(response => (response.data.stat === 'OK') && response.data);
        if (!responseData) return null;

        const raw = responseData.data
            .map(data => data.slice(1)).flat()  // 取出買賣金額並減少一層陣列嵌套
            .map(data => numeral(data).value() || +data);   // 轉為數字格式
        const [
            dealersProprietaryBuy,            // 自營商(自行買賣)買進金額
            dealersProprietarySell,           // 自營商(自行買賣)賣出金額
            dealersProprietaryNetBuySell,     // 自營商(自行買賣)買賣超
            dealersHedgeBuy,                  // 自營商(避險)買進金額
            dealersHedgeSell,                 // 自營商(避險)賣出金額
            dealersHedgeNetBuySell,           // 自營商(避險)買賣超
            sitcBuy,                          // 投信買進金額
            sitcSell,                         // 投信賣出金額
            sitcNetBuySell,                   // 投信買賣超
            foreignDealersExcludedBuy,        // 外資及陸資(不含外資自營商)買進金額
            foreignDealersExcludedSell,       // 外資及陸資(不含外資自營商)賣出金額
            foreignDealersExcludedNetBuySell, // 外資及陸資(不含外資自營商)買賣超
            foreignDealersBuy,                // 外資自營商買進金額
            foreignDealersSell,               // 外資自營商賣出金額
            foreignDealersNetBuySell,         // 外資自營商買賣超
        ] = raw;
        // 計算外資合計買進金額
        const foreignInvestorsBuy = foreignDealersExcludedBuy + foreignDealersBuy;
        // 外資合計賣出金額
        const foreignInvestorsSell = foreignDealersExcludedSell + foreignDealersSell;
        // 計算外資合計買賣超
        const foreignInvestorsNetBuySell = foreignDealersExcludedNetBuySell + foreignDealersNetBuySell;
        // 計算自營商合計買進金額
        const dealersBuy = dealersProprietaryBuy + dealersHedgeBuy;
        // 計算自營商合計賣出金額
        const dealersSell = dealersProprietarySell + dealersHedgeSell;
        // 計算自營商合計買賣超
        const dealersNetBuySell = dealersProprietaryNetBuySell + dealersHedgeNetBuySell;
        return {
            date,
            foreignDealersExcludedBuy,  foreignDealersExcludedSell, foreignDealersExcludedNetBuySell,
            foreignDealersBuy,          foreignDealersSell,         foreignDealersNetBuySell,
            foreignInvestorsBuy,        foreignInvestorsSell,       foreignInvestorsNetBuySell,
            sitcBuy,                    sitcSell,                   sitcNetBuySell,
            dealersProprietaryBuy,      dealersProprietarySell,     dealersProprietaryNetBuySell,
            dealersHedgeBuy,            dealersHedgeSell,           dealersHedgeNetBuySell,
            dealersBuy,                 dealersSell,                dealersNetBuySell,
        };
    }
    /*---------------------------------------------------------------------------------------------------------------*/
    
    /*---------------------------------------------------------------------
        股票交易可以分成「現股交易」和「信用交易」。
        。現股交易：現金買賣股票。（For做多）
        。信用交易：「融資」向券商借錢買股、「融券」向券商借股票來賣出。（For放空）
        長期而言，通常法人是市場的贏家、散戶則是市場的輸家，可將散戶視為市場的反指標。

        在臺灣證券市場，法人不能使用融資融券交易，所以大盤融資融券餘額通常被視為散戶指標。
        「斷頭」當股票下跌造成整戶擔保維持率不足時，券商就會發出融資追繳通知，必須在期限內完成補錢，如果不補足差額，就會被券商強制賣出。
    ---------------------------------------------------------------------*/
    /* 實作05：取得集中市場融資融券餘額
        當融資餘額增加，代表散戶看多，後續股市下跌的機會較大。
        當融券餘額增加，代表散戶看空，後續股市上漲的機會較大。
        大盤連續下跌造成融資斷頭出場，可視為短線止跌的訊號。
    */
    async fetchMarginTransactions(date: string) {
        const formattedDate = DateTime.fromISO(date).toFormat('yyyyMMdd'); // date: '2022-07-01'
        const query = new URLSearchParams({
            response: 'json',
            dayDate: formattedDate,
            selectType: 'MS',         // 分類項目為信用交易統計
            });
        const url = `https://www.twse.com.tw/exchangeReport/MI_MARGN?${query}`;
        const responseData = await firstValueFrom(this.httpService.get(url))
            .then(response => (response.data.stat === 'OK')? response.data : null);
        if (!responseData) return null;
        if (!responseData.creditList.length) return null;
        const raw = responseData.creditList
            .map(data => data.slice(1)).flat()  // 取出買賣金額並減少一層陣列嵌套
            .map(data => numeral(data).value() || +data); // 轉為數字格式
        const [
            marginPurchase,           // 融資(交易單位)-買進
            marginSale,               // 融資(交易單位)-賣出
            cashRedemption,           // 融資(交易單位)-現金(券)償還
            marginBalancePrev,        // 融資(交易單位)-前日餘額
            marginBalance,            // 融資(交易單位)-今日餘額
            shortCovering,            // 融券(交易單位)-買進
            shortSale,                // 融券(交易單位)-賣出
            stockRedemption,          // 融券(交易單位)-現金(券)償還
            shortBalancePrev,         // 融券(交易單位)-前日餘額
            shortBalance,             // 融券(交易單位)-今日餘額
            marginPurchaseValue,      // 融資金額(仟元)-買進
            marginSaleValue,          // 融資金額(仟元)-賣出
            cashRedemptionValue,      // 融資金額(仟元)-現金(券)償還
            marginBalanceValuePrev,   // 融資金額(仟元)-前日餘額
            marginBalanceValue,       // 融資金額(仟元)-今日餘額
        ] = raw;
        // 計算融資餘額增減(交易單位)
        const marginBalanceChange = marginBalance - marginBalancePrev;
        // 計算融資餘額增減(仟元)
        const marginBalanceValueChange = marginBalanceValue - marginBalanceValuePrev;
        // 計算融券餘額增減(交易單位)
        const shortBalanceChange = shortBalance - shortBalancePrev;

        return {
            date,
            marginBalance,
            marginBalanceChange,
            marginBalanceValue,
            marginBalanceValueChange,
            shortBalance,
            shortBalanceChange
        };
    }



}


