/* eslint-disable import/no-mutable-exports */
import PasswordValidator from 'password-validator';
import SQLite from 'better-sqlite3';
import bodyParser from "body-parser";
import cookieParser from 'cookie-parser';
import express from 'express';
import flash from 'express-flash';
import fs from "node:fs";
import helmet from "helmet";
import nodemailer from 'nodemailer';
import passport from 'passport';
import path from 'node:path';
import session from 'express-session';
import stripe from 'stripe';
import yup from 'yup';
import { createRequire } from "node:module";
import { fileURLToPath } from 'node:url';
import { rateLimit } from "express-rate-limit";
import router from './router.js';
import
{
    checkExpiredSubscriptions,
    cleanUGC,
    deleteExpiredTokens,
    initSetup,
    initializePassport,
} from './functions.js';

// eslint-disable-next-line no-underscore-dangle
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const require = createRequire(import.meta.url);
const sql = new SQLite(`./src/db.sqlite`);

await initSetup();

export const {
    dev,
    emailFromDisplayName,
    emailSMTPHost,
    emailSMTPPass,
    emailSMTPPort,
    emailSMTPSecure,
    emailSMTPUser,
    port,
    projectDescription,
    projectName,
    reportEmail,
    secret,
    stripeCustomerPortalURL,
    stripeProductID,
    stripeSecretKey,
    stripeWebhookSigningSecret,
} = require(`./config.json`);

let {
    discordWebhookURL,
    hcaptchaSecret,
    hcaptchaSiteKey,
    https,
} = require(`./config.json`);

if (dev)
{
    hcaptchaSiteKey = `10000000-ffff-ffff-ffff-000000000001`;
    hcaptchaSecret = `0x0000000000000000000000000000000000000000`;
    // ! comment out to allow webhooks to send on dev
    discordWebhookURL = ``;
    https = false;
}

https = https ? `https` : `http`;
export const usernameRegex = /^[\dA-Za-z]+$/;
export const emailRegex = /[^\t\n\r @]+@[^\t\n\r @]+\.[^\t\n\r @]+/;
// eslint-disable-next-line no-control-regex
export const ASCIIRegex = /^[\u0000-\u007F]*$/;
export const linkRegex = /https?:\/\/(www\.)?[\w#%+.:=@~-]{1,256}\.[\d()A-Za-z]{1,6}\b([\w!#%&()+./:=?@~-]*)/;

export const bannedUsernames = new Set([
    `css`,
    `js`,
    `img`,
    `webfonts`,
    `login`,
    `register`,
    `logout`,
    `edit`,
    `delete`,
    `staff`,
    `debug`,
    `tos`,
    `privacy`,
    `verifyemail`,
    `resendactivationemail`,
    `forgotpassword`,
    `resetpassword`,
    `upgrade`,
    `downgrade`,
    `billing`,
    `webhook`,
    `report`,
    `jane`, // used in example screenshots
    `john`, // used in example screenshots
    `jason`, // used in example screenshots
]);

export const supportedFeaturedContentUrls = new Set([
    `youtube.com`,
    `youtu.be`,
    `twitch.tv`,
    `soundcloud.com`,
    `open.spotify.com`,
    `music.apple.com`,
]);

export const themes = [];
const files = fs.readdirSync(`./src/public/css/`);
for (const file of files)
{
    if (file.startsWith(`theme`))
    {
        let themeName = file.split(`theme-`)[1].split(`.css`)[0];
        themeName = themeName.charAt(0).toUpperCase() + themeName.slice(1);
        themes.push(themeName);
    }
}

sql.prepare(`CREATE TABLE IF NOT EXISTS users (username TEXT UNIQUE PRIMARY KEY, verified INTEGER, paid INTEGER, subExpires TEXT, lastUsernameChange TEXT, displayName TEXT, bio TEXT, image TEXT, links TEXT, linkNames TEXT, featuredContent TEXT, theme TEXT, advancedTheme TEXT, ageGated TEXT)`).run();
sql.prepare(`CREATE TABLE IF NOT EXISTS userAuth (uid INTEGER PRIMARY KEY UNIQUE, username TEXT UNIQUE, email TEXT UNIQUE, password TEXT, stripeCID TEXT)`).run();
sql.prepare(`CREATE TABLE IF NOT EXISTS emailActivations (email TEXT PRIMARY KEY UNIQUE, username TEXT UNIQUE, token TEXT UNIQUE, expires TEXT)`).run();
sql.prepare(`CREATE TABLE IF NOT EXISTS passwordResets (email TEXT PRIMARY KEY UNIQUE, username TEXT UNIQUE, token TEXT UNIQUE, expires TEXT)`).run();
sql.pragma(`synchronous = 1`);
sql.pragma(`journal_mode = wal`);
process.on(`exit`, () => sql.close());
process.on(`SIGHUP`, () => process.exit(128 + 1));
process.on(`SIGINT`, () => process.exit(128 + 2));
process.on(`SIGTERM`, () => process.exit(128 + 15));

const rateLimiter = rateLimit({
    windowMs: 1 * 30 * 1000, // Every 30s
    max: 300 // Limit each IP to X requests per windowMs.
});
const passwordPolicy = new PasswordValidator();
/* eslint-disable newline-per-chained-call */
passwordPolicy
    .is().min(8) // Minimum length 8
    .is().max(1024) // Maximum length 100
    .has().uppercase() // has at least 1 uppercase letter
    .has().lowercase() // has at least 1 lowercase letter
    .has().digits() // has at least 1 digit
    .has().symbols(); // has at least 1 symbol
/* eslint-enable newline-per-chained-call */

const app = express();
if (!dev) app.set(`trust proxy`, 1); // trust first proxy

const SqliteStore = require(`better-sqlite3-session-store`)(session);
const sessionDatabase = new SQLite(`./src/sessions.db`);

/* eslint-disable newline-per-chained-call */
const formSchemeToHotLoad = {
    username: yup.string().lowercase().trim().min(1).max(60).matches(usernameRegex).notOneOf(bannedUsernames),
    email: yup.string().lowercase().trim().min(1).max(512).email().matches(emailRegex),
    password: yup.string().trim().min(1).max(1024),
    // eslint-disable-next-line camelcase
    session_id: yup.string().min(1).max(1024),
    token: yup.string().trim().min(1).max(32),
    password2: yup.string().trim().min(1).max(1024),
    fullName: yup.string().trim().min(1).max(512),
    message: yup.string().trim().min(1).max(2048),
    adultContent: yup.string(),
    displayName: yup.string().trim().min(1).max(60).matches(ASCIIRegex),
    bio: yup.string().trim().min(1).max(280).matches(ASCIIRegex),
    image: yup.string().trim().min(1),
    featuredContent: yup.string().trim().max(512),
    theme: yup.string().trim().min(1),
    backgroundColor: yup.string().trim().min(1).max(7),
    textColor: yup.string().trim().min(1).max(7),
    borderColor: yup.string().trim().min(1).max(7),
    oldEmail: yup.string().lowercase().trim().min(1).max(512).email().matches(emailRegex),
    newEmail: yup.string().lowercase().trim().min(1).max(512).email().matches(emailRegex),
    oldPassword: yup.string().trim().min(1).max(1024),
    newPassword: yup.string().trim().min(1).max(1024),
    page: yup.string().min(1),
    search: yup.string().lowercase().trim().min(1).max(60).matches(ASCIIRegex),
    newUsername: yup.string().lowercase().trim().min(1).max(60).matches(usernameRegex).notOneOf(bannedUsernames),
    months: yup.string().min(1).max(12),
    redirect: yup.string().lowercase().trim().min(1).max(60),
};
for (let index = 0; index < 50; index++)
{
    formSchemeToHotLoad[`link${ index }`] = yup.string().trim().min(1).max(512);
    formSchemeToHotLoad[`linkName${ index }`] = yup.string().trim().min(1).max(60);
}
/* eslint-enable newline-per-chained-call */
const formSchema = yup.object().shape(formSchemeToHotLoad);

app.use(`/webhook`, bodyParser.raw({ type: `application/json` }));
app.use(bodyParser.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser(secret));
app.use(session({
    store: new SqliteStore({
        client: sessionDatabase,
        expired: {
            clear: true,
            intervalMs: 900_000 // how often we check for expired sessions (in ms) (15 minutes)
        }
    }),
    secret,
    resave: false,
    saveUninitialized: false,
    cookie: {
        httpOnly: true,
        secure: https === `https`,
        maxAge: 1000 * 60 * 60 * 24 * 7, // 7d
    },
}));
app.use(helmet(
    {
        crossOriginEmbedderPolicy: false,
        crossOriginResourcePolicy: false,
        contentSecurityPolicy: false,
    }
));
app.use((request, response, next) =>
{
    if (request.body)
    {
        try
        {
            const validatedBody = formSchema.validateSync(request.body);
            request.body = validatedBody;
            next();
        }
        catch
        {
            response.status(400).send(`An error occurred.`);
        }
    }
    else next();
});
app.use(flash());
app.use(passport.initialize());
app.use(passport.session());
if (!dev) app.use(rateLimiter);
app.use(express.static(`./src/public`));
app.use(express.static(`./src/views`));
// hotload jquery, bootstrap, and fontawesome
const projectRoot = path.join(__dirname, `..`);
app.use(`/css`, express.static(path.join(projectRoot, `node_modules/bootstrap/dist/css`)));
app.use(`/js`, express.static(path.join(projectRoot, `node_modules/bootstrap/dist/js`)));
app.use(`/js`, express.static(path.join(projectRoot, `node_modules/jquery/dist`)));
app.use(`/js`, express.static(path.join(projectRoot, `node_modules/uppy/dist`)));
app.use(`/css`, express.static(path.join(projectRoot, `node_modules/uppy/dist`)));
app.use(`/css`, express.static(path.join(projectRoot, `node_modules/@fortawesome/fontawesome-free/css`)));
app.use(`/webfonts`, express.static(path.join(projectRoot, `node_modules/@fortawesome/fontawesome-free/webfonts`)));
app.set(`views`, `./src/views`);
app.set(`view engine`, `ejs`);

let Stripe;
if (stripeSecretKey && stripeProductID && stripeCustomerPortalURL && stripeWebhookSigningSecret)
{
    Stripe = stripe(stripeSecretKey, {
        apiVersion: `2022-11-15`
    });
}

let transporter;
if (emailSMTPHost && emailSMTPPort && emailSMTPUser && emailSMTPPass && emailFromDisplayName)
{
    transporter = nodemailer.createTransport({
        host: emailSMTPHost,
        port: emailSMTPPort,
        secure: emailSMTPSecure, // true for 465, false for other ports
        auth: {
            user: emailSMTPUser,
            pass: emailSMTPPass
        }
    });
}

initializePassport(
    passport,
    (email) => sql.prepare(`SELECT * FROM userAuth WHERE email = ?`).get(email),
    (id) => sql.prepare(`SELECT * FROM userAuth WHERE uid = ?`).get(id)
);

app.use(router);

app.listen(port, async () =>
{
    // eslint-disable-next-line no-restricted-syntax
    console.log(`Server now ready: http://localhost:${ port }/`);
    checkExpiredSubscriptions();
    cleanUGC();
    deleteExpiredTokens(Stripe);
});

setInterval(() =>
{
    checkExpiredSubscriptions();
    cleanUGC();
    deleteExpiredTokens(Stripe);
}, 14_400_000); // every 4~ hours

if (!dev)
{
    process.on(`unhandledRejection`, (error) =>
    {
        console.error(`[${ new Date(Date.now()) }] Unhandled Rejection: ${ error }`);
    });

    process.on(`uncaughtException`, (error) =>
    {
        console.error(`[${ new Date(Date.now()) }] Uncaught Exception: ${ error }`);
    });
}

export
{
    Stripe,
    discordWebhookURL,
    hcaptchaSecret,
    hcaptchaSiteKey,
    https,
    passwordPolicy,
    transporter,
};
