import puppeteer from "puppeteer";
import readline from "readline";
import { from, merge } from "rxjs";
import path from "path";
import { fileURLToPath } from "url";
import { rimraf } from "rimraf";

let browser = null;
let page = null;
let args = {};
let counter = { fails: 0, success: 0 };
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const tmpPath = path.resolve(__dirname, "../tmp");

const SELECTORS = {
  NUMBER_BUTTON:
    "#auth-pages > div > div.tabs-container.auth-pages__container > div.tabs-tab.page-signQR.active > div > div.input-wrapper > button:nth-child(1)",
  LOADING: "progress",
  INSIDE_CHAT: "document.getElementsByClassName('two')[0]",
  QRCODE_PAGE: "body > div > div > .landing-wrapper",
  QRCODE_DATA: "canvas",
  QRCODE_DATA_ATTR: "qr-canvas",
  SEND_BUTTON: 'div:nth-child(2) > button > span[data-icon="send"]',
};

export async function startsTelegram({
  showBrowser = false,
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

    await page.goto("https://web.telegram.org/k/");

    async function checkPage(end = false) {
      await page.waitForTimeout(2000); // задержка в 2 секунды
      await page.waitForSelector("div.chat", { timeout: 2000 }).catch(() => {});

      const chat = await page.$("div.chat");
      if (chat) {
        console.log("Вы вошли в телеграм");
        browser.close();
        return;
      }

      let title = await page.$("h4.i18n");
      const err = await page.$("div.error");

      if (title) {
        title = await page.$eval("h4.i18n", (h4) => h4.textContent);
      }
      // Страница входа
      if (title === "Log in to Telegram by QR Code") {
        await page.click("button");
        return checkPage();
      }
      // ввести код
      if (!title || (end && !err)) {
        const phoneText = await page.$eval("h4.phone", (h4) => h4.textContent);
        const inputCode = await page.$(
          "div.input-wrapper div.input-field input"
        );
        console.log("Номер телефона который введен: ", phoneText);
        return await inpYouNumber(inputCode, "Введите код: ");
      }
      // номер введен,  ожидание кода
      if (title === "Sign in to Telegram") {
        const inputNumber = await page.$(
          "#auth-pages > div > div.tabs-container.auth-pages__container > div.tabs-tab.page-sign.active > div > div.input-wrapper > div.input-field.input-field-phone > div.input-field-input"
        );

        return await inpYouNumber(
          inputNumber,
          "Введите номер. Вписывайте по 3 цифры после +7/8. Например: 333 enter, 333 enter, 333 enter, 3 enter. Если после ввода не появилось надписи введите код, перезапустите сервер и попробуйте снова. Вводите:  "
        );
      }
    }

    async function inpYouNumber(input, text) {
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
      });

      rl.question(text, (code) => {
        input.type(code);
        if (text.includes("Введите номер")) {
          page.click("button");
          rl.close();
          checkPage(true);
        } else {
          rl.close();
          return false;
        }
      });
    }
    checkPage();
  } catch (err) {
    deleteSession(tmpPath);
    throw err;
  }
}

export async function messageToTelegram({
  showBrowser = false,
  session = true,
  tell,
  nameValue,
  messageValue = "",
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

  browser = await puppeteer.launch(args);
  page = await browser.newPage();

  await page.goto("https://web.telegram.org/k/");

  page.on("dialog", async (dialog) => {
    await dialog.accept();
  });

  async function sendContacts(num) {
    console.log(num);
    if (num === "1") {
      await page.waitForTimeout(2000);
      const button = await page.$("button");
      button.click();
      return await sendContacts("2");
    }
    if (num === "2") {
      await page.waitForTimeout(2000);
      const contacts = await page.$("div.tgico-user");
      contacts.click();
      return await sendContacts("3");
    }
    if (num === "3") {
      await page.waitForTimeout(2000);
      const addButton = await page.$("button.tgico-add");
      addButton.click();
      return await sendContacts("4");
    }
    if (num === "4") {
      await page.waitForTimeout(2000);
      const name = await page.$("div.name-fields div div");
      const phone = await page.$("div.input-field-phone div");
      await name.type(nameValue);
      await phone.click({ clickCount: 3 });
      await phone.press("Backspace");
      await phone.type(tell);
      return await sendContacts("5");
    }
    if (num === "5") {
      await page.waitForTimeout(2000);
      const addButtonContact = await page.$("div.popup-header button");
      addButtonContact.click();
      return await sendContacts("6");
    }
    if (num === "6") {
      await page.waitForTimeout(4000);
      const modal = await page.$("div.popup-create-contact");
      if (modal) {
        console.log(
          "Контакта нет в телеграмме, либо неправильно был введен номер"
        );
        return browser.close();
      } else {
        await page.waitForTimeout(4000);
        const searchInput = await page.$(
          "#contacts-container > div.sidebar-header > div > input"
        );
        searchInput.type(tell);
        return await sendContacts("7");
      }
    }
    if (num === "7") {
      await page.waitForTimeout(4000);
      try {
        const contact = await page.$("#contacts > a");
        contact.click();
        return await sendContacts("8");
      } catch (err) {
        console.log("Аккаунт не найден");
        return browser.close();
      }
    }
    if (num === "8") {
      await page.waitForTimeout(4000);
      const message = await page.$(
        "#column-center > div > div > div.chat-input > div > div.rows-wrapper-wrapper > div > div.new-message-wrapper > div.input-message-container > div:nth-child(1)"
      );
      await message.type(nameValue + ", " + messageValue);
      await message.press("Enter");
      console.log(`${nameValue} на номер: ${tell} отправлено уведомление`);
      return browser.close();
    }
  }

  try {
    await sendContacts("1");
  } catch (err) {
    await browser.close();
    console.log(err);
  }
}

function deleteSession() {
  rimraf.sync(tmpPath);
}
