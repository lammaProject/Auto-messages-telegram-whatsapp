import puppeteer from "puppeteer";
import qrcode from "qrcode-terminal";
import { from, merge } from "rxjs";
import { take } from "rxjs/operators";
import path from "path";
import { fileURLToPath } from "url";
import { rimraf } from "rimraf";

let browser = null;
let page = null;
let counter = { fails: 0, success: 0 };
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const tmpPath = path.resolve(__dirname, "../tmp");

const SELECTORS = {
  LOADING: "progress",
  INSIDE_CHAT: "document.getElementsByClassName('two')[0]",
  QRCODE_PAGE: "body > div > div > .landing-wrapper",
  QRCODE_DATA: "div[data-ref]",
  QRCODE_DATA_ATTR: "data-ref",
  SEND_BUTTON: 'div:nth-child(2) > button > span[data-icon="send"]',
};

export async function startWhats({
  showBrowser = false,
  qrCodeData = false,
  session = true,
} = {}) {
  if (!session) {
    deleteSession(tmpPath);
  }

  const args = {
    headless: !showBrowser ? "new" : false,
    userDataDir: tmpPath,
    args: [
      "--no-sandbox",
      // "--blink-settings=imagesEnabled=false"]
    ],
  };
  try {
    browser = await puppeteer.launch(args);
    page = await browser.newPage();
    page.on("dialog", async (dialog) => {
      await dialog.accept();
    });

    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/61.0.3163.100 Safari/537.36"
    );
    page.setDefaultTimeout(60000);

    await page.goto("https://web.whatsapp.com");
    if (session && (await isAuthenticated())) {
      console.log("Вы вошли в WhatsApp");
      return;
    } else {
      if (qrCodeData) {
        console.log("Getting QRCode data...");
        console.log(
          "Note: You should use wbm.waitQRCode() inside wbm.startWhats() to avoid errors."
        );
        return await getQRCodeData();
      } else {
        await generateQRCode();
      }
    }
  } catch (err) {
    deleteSession(tmpPath);
    throw err;
  }
}

/**
 * Check if needs to scan qr code or already is is inside the chat
 */
function isAuthenticated() {
  console.log("Authenticating...");
  return merge(needsToScan(page), isInsideChat(page)).pipe(take(1)).toPromise();
}

function needsToScan() {
  return from(
    page
      .waitForSelector(SELECTORS.QRCODE_PAGE, {
        timeout: 0,
      })
      .then(() => false)
  );
}

function isInsideChat() {
  return from(
    page
      .waitForFunction(SELECTORS.INSIDE_CHAT, {
        timeout: 0,
      })
      .then(() => true)
  );
}

function deleteSession() {
  rimraf.sync(tmpPath);
}
/**
 * return the data used to create the QR Code
 */
async function getQRCodeData() {
  await page.waitForSelector(SELECTORS.QRCODE_DATA, { timeout: 60000 });
  const qrcodeData = await page.evaluate((SELECTORS) => {
    let qrcodeDiv = document.querySelector(SELECTORS.QRCODE_DATA);
    return qrcodeDiv.getAttribute(SELECTORS.QRCODE_DATA_ATTR);
  }, SELECTORS);
  return await qrcodeData;
}

/**
 * Access whatsapp web page, get QR Code data and generate it on terminal
 */
async function generateQRCode() {
  try {
    console.log("generating QRCode...");
    const qrcodeData = await getQRCodeData();
    qrcode.generate(qrcodeData, { small: true });
    console.log("QRCode generated! Scan it using Whatsapp App.");
  } catch (err) {
    throw await QRCodeExeption(
      "QR Code can't be generated(maybe your connection is too slow)."
    );
  }
  await waitQRCode();
}

/**
 * Wait 30s to the qrCode be hidden on page
 */
async function waitQRCode() {
  // if user scan QR Code it will be hidden
  try {
    await page.waitForSelector(SELECTORS.QRCODE_PAGE, {
      timeout: 30000,
      hidden: true,
    });
  } catch (err) {
    throw await QRCodeExeption("Dont't be late to scan the QR Code.");
  }
}

/**
 * Close browser and show an error message
 * @param {string} msg
 */
async function QRCodeExeption(msg) {
  await browser.close();
  return "QRCodeException: " + msg;
}

/**
 * @param {string} phone phone number: '5535988841854'
 * @param {string} message Message to send to phone number
 * Send message to a phone number
 */
export async function sendToWhats(phoneOrContact, message) {
  let phone = phoneOrContact;
  if (typeof phoneOrContact === "object") {
    phone = phoneOrContact.phone;
    message = generateCustomMessage(phoneOrContact, message);
  }
  try {
    process.stdout.write("Sending Message...\r");
    await page.goto(
      `https://web.whatsapp.com/send?phone=${phone}&text=${encodeURIComponent(
        message
      )}`
    );
    await page.waitForSelector(SELECTORS.LOADING, {
      hidden: true,
      timeout: 60000,
    });
    await page.waitForSelector(SELECTORS.SEND_BUTTON, { timeout: 5000 });
    await page.keyboard.press("Enter");
    process.stdout.clearLine();
    process.stdout.cursorTo(0);
    process.stdout.write(`${phone} Sent\n`);
    counter.success++;
    return true;
  } catch (err) {
    process.stdout.clearLine();
    process.stdout.cursorTo(0);
    process.stdout.write(`${phone} Failed\n`);
    counter.fails++;
    return false;
  }
}

/**
 * @param {array} phones Array of phone numbers: ['5535988841854', ...]
 * @param {string} message Message to send to every phone number
 * Send same message to every phone number
 */
async function send(phoneOrContacts, message) {
  for (let phoneOrContact of phoneOrContacts) {
    await sendToWhats(phoneOrContact, message);
  }
}

/**
 * @param {object} contact contact with several properties defined by the user
 * @param {string} messagePrototype Custom message to send to every phone number
 * @returns {string} message
 * Replace all text between {{}} to respective contact property
 */
function generateCustomMessage(contact, messagePrototype) {
  let message = messagePrototype;
  for (let property in contact) {
    message = message.replace(
      new RegExp(`{{${property}}}`, "g"),
      contact[property]
    );
  }
  return message;
}

/**
 * Close browser and show results(number of messages sent and failed)
 */
export async function endWhats() {
  await browser.close();
  console.log(`Result: ${counter.success} sent, ${counter.fails} failed`);
}
