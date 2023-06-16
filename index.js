const puppeteer = require('puppeteer');

const fs = require('fs');
const fsp = require('fs').promises;
const { type } = require('os');
// Function to get shadowRoot from an element
async function getShadowRoot(page, selector) {
    let shadowRoot = await page.evaluateHandle(selector => document.querySelector(selector).shadowRoot, selector);
    return shadowRoot;
}

// Function to get shadowRoot nested in another shadowRoot
async function getNestedShadowRoot(page, shadowRootHandle, selector) {
    let nestedShadowRoot = await shadowRootHandle.evaluateHandle((root, selector) => root.querySelector(selector).shadowRoot, selector);
    return nestedShadowRoot;
}

// Function to get buttons from shadowRoot
async function getButtonsFromShadowRoot(shadowRootHandle) {
    console.clear()
    const getTypeStr = getType.toString();

    return await shadowRootHandle.evaluate((sr4, getTypeStr) => {
        let getType = new Function(`return ${getTypeStr}`)(getTypeStr);
        let rows = sr4.querySelectorAll('.table-body > tr');
        let linkElements = [];

        for (let i = 0; i < rows.length; i++) {
            let cells = rows[i].querySelectorAll('td');
            let linkElement = cells[2].querySelector('a');
            let text = cells[4].textContent;
            console.log(`The text is ${text}`)
            let type = getType(text);
            if (type === "None") continue;
            linkElements.push({ link: `.table-body > tr:nth-child(${i + 1}) td:nth-child(3) a`, text: text, type: type });
        }

        return linkElements;
    }, getTypeStr);
}


let ticketCount = 0;
const URGENT = 12;
(async () => {
    const url = "https://rhcgroupprod.service-now.com/now/workspace/agent/home/sub/non_record/layout/params/list-title/New%20interactions/table/interaction/query/state%3Dnew/workspace-config-id/7b24ceae5304130084acddeeff7b12a3/word-wrap/false/disable-quick-edit/true"

    const browser = await puppeteer.launch({ headless: false });
    const page = await browser.newPage();
    page.on('console', message => {
        if (message.type() === 'log') {
            console.log('Browser console.log:', message.text());
        }
    });
    await page.goto(url);
    await login(page);
    await page.waitForNavigation();
    await page.setViewport({ width: 1920, height: 1080 });

    //Give time for the shadow roots to load
    await page.waitForSelector('body > sn-workspace-layout > sn-workspace-main > sn-workspace-primary-content')
    await page.waitForTimeout(1000);

    while (true) {
        readCount('count.json').then(count => {
            ticketCount = count
        })
        await search(page);
        await page.waitForTimeout(10000);

        //get Refresh button
        let refreshButton = await getRefreshButton(page)
        await page.evaluate((button) => {
            button.click()
        }, refreshButton)
        await page.waitForTimeout(2000)
    }
})();


async function handleClick(page, button) {
    await page.evaluate((button) => {
        button.click();
    }, button)
}

async function search(page) {
    let [linkSelectors, sr4Handle] = await getLinkSelector(page);
    console.log(`
        I have completed ${ticketCount} tickets\n
        I have saved Finley and Rutvik ${ticketCount * 5} clicks \n
        Yet I am getting paid nothing...`)
    for (let linkSelector of linkSelectors) {
        let linkHandle = await sr4Handle.evaluateHandle((root, selector) => root.querySelector(selector), linkSelector.link);
        await linkHandle.click();
        await page.waitForTimeout(1000);
        console.log(`Text value: ${await linkSelector.text}`)
        // handle navigation if necessary

        await page.waitForTimeout(1000);
        //Check description for urgency
        let description = await getDescription(page);
        let descriptionValue = await page.evaluate((description, title) => {
            if (description.value === '') {
                description.value = title
                description.dispatchEvent(new Event('input'))
            }
            return (description.value)
        }, description, linkSelector.text)
        handleClick(page, await getUpdateButton(page))

        let isUrgent = getUrgency(descriptionValue, linkSelector.text)

        await page.waitForTimeout(500);

        let incidentButton = await getIncidentButton(page);
        await page.evaluate((button) => {
            button.click();
        }, incidentButton)

        if (isUrgent) { console.log("AAHHHHHHHHH") }

        await page.waitForNavigation({ waitUntil: 'networkidle2' })
        await page.waitForTimeout(2000);
        //Click on template
        let templateType = getTemplateType(getType(linkSelector.text));

        let templateButton = await getTemplateButton(page, templateType);
        await page.evaluate((button) => {
            button.click()
        }, templateButton)
        await page.waitForTimeout(500);

        if (isUrgent) {
            let urgentButton = await getTemplateButton(page, URGENT)
            handleClick(page, urgentButton)
        }

        await page.waitForTimeout(100);
        if (linkSelector.type == "Staff") await changeRequesterName(page)

        await page.waitForTimeout(500);
        let saveButton = await getSaveButton(page);
        await page.evaluate((button) => {
            button.click();
        }, saveButton)

        await page.waitForNetworkIdle({ idleTime: 100, timeout: 5000}).catch((error) => {
            console.log("Network is too busy to go fast :(")
        })

        let closeButton = await getCloseButton(page);
        await page.evaluate((button) => {
            button.click();
        }, closeButton)
        incrementCountAndClicks('count.json');
    }
}

function getUrgency(description, title) {
    let descriptionText = description.toLowerCase()
    let titleText = title.toLowerCase()
    let searchPattern = /(urgent|urgently|asap)/gi;
    let regexNoSpecialChars = /[.,\/#!$%\^&\*;:{}=\-_`~()]/g;
    return (searchPattern.test(descriptionText.replace(regexNoSpecialChars, " ")) || searchPattern.test(titleText.replace(regexNoSpecialChars, " ")))
}

function getTemplateType(type) {
    let template;
    switch (type) {
        case "Data Mismatch":
            template = 1;
            break;
        case "Mimecast":
            template = 2;
            break;
        case "New Referrer":
            template = 3;
            break;
        case "Pacs":
            template = 4;
            break;
        case "Transfer":
            template = 8;
            break
        case "Staff":
            template = 10;
            break;
        case "NHI":
            template = 11;
            break;
        case "Delete":
            template = 13;
            break;
        case "Visit":
            template = 14;
            break;
        default:
            template = 0;
            break;
    }
    console.log(`template is ${template}`)
    return template
}
async function changeRequesterName(page){
    let descriptionHandle = await getOnBoardDescription(page)
    let description = await page.evaluate((description) => {
        return description.value
    }, descriptionHandle)

    console.log("post parsed description: " + description)
    let email = getEmailFromDescription(description)

    let requesterInput = await getRequestedFor(page)
    await requesterInput.evaluateHandle((input,email) => {
        input.value = email
        input.dispatchEvent(new Event('input'))
    }, email)
}
async function getLinkSelector(page) {

    let srHandle = await getShadowRoot(page, 'body > sn-workspace-layout > sn-workspace-main > sn-workspace-primary-content');
    let sr2Handle = await getNestedShadowRoot(page, srHandle, '#chrome-tab-panel-non_record_2 > now-record-list-connected');
    let sr3Handle = await getNestedShadowRoot(page, sr2Handle, 'div > now-record-list');
    let sr4Handle = await getNestedShadowRoot(page, sr3Handle, 'div > div.sn-list-grid-container > div > div > now-grid');

    const linkSelectors = await getButtonsFromShadowRoot(sr4Handle);
    return [linkSelectors, sr4Handle]
}

async function getUpdateButton(page) {
    await page.waitForSelector("body > sn-workspace-layout > sn-workspace-main > sn-workspace-content")
    await page.waitForTimeout(200);
    let updateButtonHandle = await page.evaluateHandle(() => {
        let updateButton = document.querySelector("body > sn-workspace-layout > sn-workspace-main > sn-workspace-content").shadowRoot
            .querySelector("sn-interaction-custom-renderer").shadowRoot
            .querySelector("now-record-form-connected").shadowRoot
            .querySelector("div > sn-form-internal-workspace-form-layout").shadowRoot
            .querySelector("form > sn-form-internal-header-layout").shadowRoot
            .querySelector("header > div > div.sn-header-layout-content.-last > now-record-common-uiactionbar").shadowRoot
            .querySelector("sn-form-internal-uiactionbar").shadowRoot
            .querySelector("div > div > div:nth-child(1) > now-button:nth-child(3)").shadowRoot
            .querySelector("button")
        return updateButton
    })
    return updateButtonHandle
}

function getEmailFromDescription(description) {
    let regex = /by:\s*([\w.-]+@[\w.-]+\.\w+)/;
    const match = description.match(regex)
    if (match) return match[1];

    return null;
}
async function getOnBoardDescription(page) {
   await page.waitForSelector("body > sn-workspace-layout > sn-workspace-main > sn-workspace-content")
    await page.waitForTimeout(1000)
    let descriptionHandle = await page.evaluateHandle(() => {
      let description = document.querySelector("body > sn-workspace-layout > sn-workspace-main > sn-workspace-content").shadowRoot
            .querySelector("now-record-form-connected").shadowRoot
            .querySelector("div > sn-form-internal-workspace-form-layout").shadowRoot
            .querySelector("form > section > div > now-record-form-blob").shadowRoot
            .querySelector("sn-form-internal-tabs").shadowRoot
            .querySelector("section > sn-form-internal-tab-contents").shadowRoot
            .querySelector("#tab_panel_0_undefined > now-record-form-section-column-layout").shadowRoot
            .querySelector("div > div > div.sn-form-column-layout-left-col.sn-form-column-layout-col.resizable-controller.resizable-left-column.flex-resize.state-resizing > div.sn-form-column-layout-sections > section:nth-child(1) > div > div > div:nth-child(6) > div > sn-record-input-connected:nth-child(2)").shadowRoot
            .querySelector("now-textarea").shadowRoot
            .querySelector("textarea")
        console.log("Beffore parsed desc: " + description.value)
        return description
    })
    return descriptionHandle
}

function getType(title) {
    let lowTitle = title.toLowerCase();
    //Comrad
    if (title.startsWith("COMRAD") && title.endsWith('.alert')) {
        return "Data Mismatch"
    }
    if (title.startsWith("COMRAD") && title.endsWith('exception')) {
        return "Data Mismatch"
    }
    //New Refer
    if (title.startsWith("New Referrer Application Form :")) {
        return "New Referrer"
    }
    //Current referere
    if (title.startsWith("Current Referrer Application Form :")) {
        return "New Referrer"
    }
    //Refere support
    if (title.startsWith("Referrers Support Form")) {
        return "New Referrer"
    }
    if (title.toLowerCase().includes("referrer")) {
        return "New Referrer"
    }
    //Mimecast
    if (title.includes("You have new held messages")) {
        return "Mimecast"
    }
    //Pacs Account
    if (title.startsWith("New account application:")) {
        return "Pacs"
    }
    //Onboarding
    if (title.startsWith("I.T On-Boarding Form -")) {
        return "Staff"
    }
    //Transfer Images
    if (lowTitle.match("/\bimage(s)?\b/gi") && lowTitle.match("/pac/gi")) {
        return "Transfer"
    }
    if (lowTitle.startsWith("external images")) {
        return "Transfer"
    }
    if (title.includes("FW: Images")) {
        return "Transfer"
    }
    if (title.startsWith("Images from")) {
        return "Transfer"
    }
    if (title.toLowerCase().startsWith("missing images")) {
        return "Transfer"
    }
    if (title.includes("Merges")) {
        return "Transfer"
    }
    if ((title.toLowerCase().includes("attach")
        || title.toLowerCase().includes("required")
        || title.toLowerCase().includes("transfer")
        || title.toLowerCase().includes("forward")
        || title.toLowerCase().includes("request"))
        || title.toLowerCase().includes("to")
        &&
        (title.toLowerCase().includes("images")
            || title.toLowerCase().includes("image"))
        || title.toLowerCase().includes("xray")
        || title.toLowerCase().includes("scan")
        || title.toLowerCase().includes("imaging")
    ) {
        return "Transfer"
    }
    if (title.toLowerCase().includes("prior imaging")) {
        return "Transfer"
    }
    if (title.startsWith("Tisza sent you")) {
        return "Transfer"
    }
    if (title.startsWith("Loading external images")) {
        return "Transfer"
    }
    if (title.includes("(M/") || title.includes("(F/")) {
        return "Transfer"
    }
    if (title.toLowerCase().includes("patient gender")) {
        return "NHI"
    }
    if (title.toLowerCase().match("\bvisit(s)?\b")) {
        return "Visit"
    }
    if (title.toLowerCase().includes("from kyocera")) {
        return "Transfer"
    }

    if (lowTitle.includes("image")
        && (lowTitle.includes("delete"))
        || (lowTitle.includes("deleting")) ) {
        return "Delete"
    }
    return "None"
}

async function getRequestedFor(page) {
    await page.waitForSelector("body > sn-workspace-layout > sn-workspace-main > sn-workspace-content")
    await page.waitForTimeout(300);

    let requesterHandle = await page.evaluateHandle(() => {
        let requesterInput =  document.querySelector("body > sn-workspace-layout > sn-workspace-main > sn-workspace-content").shadowRoot
            .querySelector("now-record-form-connected").shadowRoot
            .querySelector("div > sn-form-internal-workspace-form-layout").shadowRoot
            .querySelector("form > section > div > now-record-form-blob").shadowRoot
            .querySelector("sn-form-internal-tabs").shadowRoot
            .querySelector("section > sn-form-internal-tab-contents").shadowRoot
            .querySelector("#tab_panel_0_undefined > now-record-form-section-column-layout").shadowRoot
            .querySelector("div > div > div.sn-form-column-layout-left-col.sn-form-column-layout-col.resizable-controller.resizable-left-column.flex-resize.state-resizing > div.sn-form-column-layout-sections > section:nth-child(1) > div > div > div:nth-child(3) > div:nth-child(1) > sn-record-reference-connected").shadowRoot
            .querySelector("now-record-typeahead").shadowRoot
            .querySelector("now-typeahead").shadowRoot
            .querySelector("input")
        return requesterInput
    })
    return requesterHandle
}

async function login(page) {

    // Login
    await page.waitForSelector('#i0116');
    await page.type('#i0116', 'finley.tohill@rhcnz.com');

    await page.click('#idSIButton9');

    await page.waitForSelector('#i0118');

    await page.type('#i0118', 'desfgh345@');
    await page.waitForTimeout(6000);

    await page.evaluate(() => {
        document.querySelector('form').submit();
    })
}

async function getDescription(page) {
    await page.waitForSelector("body > sn-workspace-layout > sn-workspace-main > sn-workspace-content")
    await page.waitForTimeout(200);

    let descriptionHandle = await page.evaluateHandle(() => {
        let description = document.querySelector("body > sn-workspace-layout > sn-workspace-main > sn-workspace-content").shadowRoot
            .querySelector("sn-interaction-custom-renderer").shadowRoot
            .querySelector("now-record-form-connected").shadowRoot
            .querySelector("div > sn-form-internal-workspace-form-layout").shadowRoot
            .querySelector("form > section > div > now-record-form-blob").shadowRoot
            .querySelector("sn-form-internal-tabs").shadowRoot
            .querySelector("section > sn-form-internal-tab-contents").shadowRoot
            .querySelector("now-record-form-section-column-layout").shadowRoot
            .querySelector("div > div > div.sn-form-column-layout-left-col.sn-form-column-layout-col.resizable-controller.resizable-left-column.flex-resize.state-resizing > div > section > div > div > div:nth-child(6) > div > sn-record-input-connected:nth-child(2)").shadowRoot
            .querySelector("now-textarea").shadowRoot
            .querySelector("textarea[name=u_description]")
        return description
    });
    return descriptionHandle
}

async function getTemplateButton(page, template) {

    await page.waitForSelector("body > sn-workspace-layout > sn-workspace-main > sn-workspace-content")
    await page.waitForTimeout(200);
    let templateButton = await page.evaluateHandle((template) => {
        card = document.querySelector("body > sn-workspace-layout > sn-workspace-main > sn-workspace-content").shadowRoot
            .querySelector("now-record-form-connected").shadowRoot
            .querySelector("div > sn-form-internal-workspace-form-layout").shadowRoot
            .querySelector("now-record-common-sidebar").shadowRoot
            .querySelector("div > div > sn-form-internal-sidebar-panel:nth-child(1)").shadowRoot
            .querySelector("now-record-common-templates-connected").shadowRoot
            .querySelector(`div > div.sn-panel-body.-workspace.-template-panel-body > div > now-template-card-attachment:nth-child(${template}`).shadowRoot
            .querySelector("now-card").shadowRoot
            .querySelector("article > div")
        return card
    }, template)
    return templateButton

}
async function getIncidentButton(page) {
    await page.waitForSelector('body > sn-workspace-layout > sn-workspace-main > sn-workspace-content');
    await page.waitForTimeout(1000);
    let incidentButtonHandle = await page.evaluateHandle(() => {
        const shadowRootList = [
            'now-record-form-connected',
            'sn-form-internal-workspace-form-layout',
            'sn-form-internal-header-layout',
            'header > div > div.sn-header-layout-content.-last > now-record-common-uiactionbar',
            'sn-form-internal-uiactionbar',
            'div > div > div:nth-child(1) > now-button:nth-child(2)',]

        let sr = document.querySelector('body > sn-workspace-layout > sn-workspace-main > sn-workspace-content').shadowRoot;
        console.log("Got root")
        let sr1 = sr.querySelector('sn-interaction-custom-renderer').shadowRoot
        console.log("got seccond root")
        for (let shadowRoot of shadowRootList) {
            console.log(shadowRoot);
            let sr2 = sr1.querySelector(shadowRoot).shadowRoot;
            sr1 = sr2;
        }

        return sr1.querySelector('button');

    })
    return incidentButtonHandle
}

async function createIncident(page) {

}

async function getCloseButton(page) {

    await page.waitForSelector('body > sn-workspace-layout > sn-workspace-tabs')
    await page.waitForTimeout(100);
    let closeButtonHandle = await page.evaluateHandle(() => {
        let root = document.querySelector('body > sn-workspace-layout > sn-workspace-tabs').shadowRoot;
        let sr = root.querySelector('div > sn-workspace-tab-bar').shadowRoot
        let sr1 = sr.querySelector('div > div.sn-chrome-tabs-content.tab-list > ul > sn-workspace-tab:nth-child(2)').shadowRoot
        return sr1.querySelector('li > button');
    })
    return closeButtonHandle
}

async function getSaveButton(page) {
    await page.waitForSelector("body > sn-workspace-layout > sn-workspace-main > sn-workspace-content")
    await page.waitForTimeout(200);
    let saveButtonHandle = await page.evaluateHandle(() => {
        let saveButton = document.querySelector("body > sn-workspace-layout > sn-workspace-main > sn-workspace-content").shadowRoot
            .querySelector("now-record-form-connected").shadowRoot
            .querySelector("div > sn-form-internal-workspace-form-layout").shadowRoot
            .querySelector("form > sn-form-internal-header-layout").shadowRoot
            .querySelector("header > div > div.sn-header-layout-content.-last > now-record-common-uiactionbar").shadowRoot
            .querySelector("sn-form-internal-uiactionbar").shadowRoot
            .querySelector("div > div > div:nth-child(1) > now-button:nth-child(2)").shadowRoot
            .querySelector("button")
        return saveButton
    })
    return saveButtonHandle
}


async function getRefreshButton(page) {
    await page.waitForSelector("body > sn-workspace-layout > sn-workspace-main > sn-workspace-primary-content")
    await page.waitForTimeout(1000)
    let refreshButtonHandle = await page.evaluateHandle(() => {
        let refreshButton = document.querySelector("body > sn-workspace-layout > sn-workspace-main > sn-workspace-primary-content").shadowRoot
            .querySelector("now-record-list-connected").shadowRoot
            .querySelector("div > now-record-list").shadowRoot
            .querySelector("div > div.sn-list-header > sn-record-list-header-toolbar").shadowRoot
            .querySelector("div.sn-list-header-toolbar > div.sn-record-list-header-toolbar-button-refresh.-md > div > now-button").shadowRoot
            .querySelector("button")
        return refreshButton
    })
    return refreshButtonHandle
}

async function readCount(filename) {
    try {
        let jsonString = await fsp.readFile(filename, 'utf8')
        let data = JSON.parse(jsonString)
        return data.count
    } catch (err) {
        console.error('Error reading file', err)
    }
}

async function incrementCountAndClicks(filename) {
    // Read the JSON file
    fs.readFile(filename, 'utf8', (err, data) => {
        if (err) {
            console.error('Error reading file:', err);
            return;
        }

        try {
            // Parse the JSON data
            const jsonData = JSON.parse(data);

            // Increment count and clicks
            jsonData.count += 1;
            jsonData.clicks += 5;

            // Convert the updated data back to JSON
            const updatedData = JSON.stringify(jsonData);

            // Save the updated JSON data back to the file
            fs.writeFile(filename, updatedData, 'utf8', (err) => {
                if (err) {
                    console.error('Error writing file:', err);
                    return;
                }
                console.log('File updated successfully!');
            });
        } catch (error) {
            console.error('Error parsing JSON:', error);
        }
    });
}

