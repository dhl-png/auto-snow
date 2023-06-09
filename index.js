const puppeteer = require('puppeteer');
const fs = require('fs');
(async () => {
    const url = "https://rhcgroupprod.service-now.com/now/workspace/agent/home/sub/non_record/layout/params/list-title/New%20interactions/table/interaction/query/state%3Dnew/workspace-config-id/7b24ceae5304130084acddeeff7b12a3/word-wrap/false/disable-quick-edit/true"
    const browser = await puppeteer.launch({headless: false});
    const page = await browser.newPage();
    const cookiesString = fs.readFileSync('./cookies.json');
    const cookies = JSON.parse(cookiesString);
    await page.setCookie(...cookies);
    await page.goto(url);
    await login(page);
    await page.waitForNavigation();
    console.log("Page has loaded");

    //Give time for the shadow roots to load
    await page.waitForSelector('body > sn-workspace-layout > sn-workspace-main > sn-workspace-primary-content')
    await page.waitForTimeout(1000);

    // Select the table-body
    let elementHandle = await page.evaluateHandle(() => {
        let sr = document.querySelector('body > sn-workspace-layout > sn-workspace-main > sn-workspace-primary-content').shadowRoot
        //console.log("Got first root")
        let sr2 = sr.querySelector('#chrome-tab-panel-non_record_2 > now-record-list-connected').shadowRoot
        let sr3 = sr2.querySelector('div > now-record-list').shadowRoot
        //console.log(sr3);
        let sr4 = sr3.querySelector('div > div.sn-list-grid-container > div > div > now-grid').shadowRoot
        return sr4.querySelector('.table-body');
    });

    console.log(elementHandle);
    //const tbody = await  page.$('.table-body  ');
    // If you want to select all td elements inside this table, you can do:
    const tds = await elementHandle.$$('td');

    // And to get the inner text of these tds, you can do:
    for (const td of tds) {
        console.log(td);
        let text = await page.evaluate(element => element.textContent, td);
        console.log(text);
    }

})();


async function login(page){

// Login
    await page.waitForSelector('#i0116');
    await page.type('#i0116', 'finley.tohill@rhcnz.com');

    await page.click('#idSIButton9');

    await page.waitForSelector('#i0118');

    await page.type('#i0118','desfgh345@');
    await page.waitForTimeout(6000);

    await page.evaluate(() => {
        document.querySelector('form').submit();
    })
}


