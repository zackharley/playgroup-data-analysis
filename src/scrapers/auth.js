require('dotenv').config();

const USERNAME = process.env.USERNAME;
const PASSWORD = process.env.PASSWORD;

async function login(page) {
  console.log('Filling in login credentials...');
  await page.fill('#user_email', USERNAME);
  await page.fill('#user_password', PASSWORD);

  console.log('Submitting login form...');
  await Promise.all([
    page.waitForNavigation({ waitUntil: 'domcontentloaded' }),
    page.click('input[type="submit"][value="Sign In"]'),
  ]);

  console.log('Login complete!');
}

module.exports = {
  login,
};

