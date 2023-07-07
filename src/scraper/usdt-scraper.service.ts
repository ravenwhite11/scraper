/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable prettier/prettier */
import * as csvtojson from 'csvtojson';
import * as numeral from 'numeral';
import { DateTime } from 'luxon';
import { Injectable } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';

@Injectable()
export class UsdtScraperService {
    constructor(private httpService: HttpService) {}
    /*---------------------------------------------------------------------
        債券是股票之外另一個重要的投資工具，美國公債是所有債券中最重要的避險資產。
        。債券價格與債券殖利率呈反向關係 -> 債券價格上漲，殖利率就會下跌。
                                      -> 債券價格下跌，殖利率就會上漲。
        美國二年期公債殖利率與十年期公債殖利率的利差被視為是景氣反轉的領先指標。
    ---------------------------------------------------------------------*/
    /*  實作12：取得美國公債殖利率(美國財政部)
        https://ithelp.ithome.com.tw/articles/10289479 */
    async fetchUsTreasuryYields(date: string) {
        const dt = DateTime.fromISO(date);
        const month = dt.toFormat('yyyyMM');
        const url = `https://home.treasury.gov/resource-center/data-chart-center/interest-rates/daily-treasury-rates.csv/all/${month}?type=daily_treasury_yield_curve&field_tdr_date_value_month=${month}&page&_format=csv`
        const responseData = await firstValueFrom(this.httpService.get(url))
        .then(response => csvtojson({ noheader: true, output: 'csv' }).fromString(response.data));
        const [ fields, ...rows ] = responseData;
        if (fields[0] !== 'Date') return null;

        const data = rows.map(row => {
            const date = DateTime.fromFormat(row[0], 'MM/dd/yyyy').toISODate()// 轉換日期格式
            // 將 string 型別數字轉換成 number
            const raw = row.slice(1).map(data => numeral(data).value());
            const [
                us1m,   // 美國 1 個月期公債殖利率
                us2m,   // 美國 2 個月期公債殖利率
                us3m,   // 美國 3 個月期公債殖利率
                us6m,   // 美國 6 個月期公債殖利率
                us1y,   // 美國 1 年期公債殖利率
                us2y,   // 美國 2 年期公債殖利率
                us3y,   // 美國 3 年期公債殖利率
                us5y,   // 美國 5 年期公債殖利率
                us7y,   // 美國 7 年期公債殖利率
                us10y,  // 美國 10 年期公債殖利率
                us20y,  // 美國 20 年期公債殖利率
                us30y,  // 美國 30 年期公債殖利率
            ] = raw;

            return { date, us1m, us2m, us3m, us6m, us1y, us2y, us3y, us5y, us7y, us10y, us20y, us30y };
        }).find(data => data.date === date);  // 取得目標日期的美國公債殖利率

        return data;
    }
}
