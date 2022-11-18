import express from 'express';
import SQLite from 'better-sqlite3';
import { createRequire } from "node:module";
import helmet from "helmet";
import bodyParser from "body-parser";
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from "node:fs";
import { verify } from 'hcaptcha';
import fetch from 'node-fetch';
import { rateLimit } from "express-rate-limit";

// eslint-disable-next-line no-underscore-dangle
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const require = createRequire(import.meta.url);
const sql = new SQLite(`./src/db.sqlite`);

const VER_STATUS = {
    STAFF_MEMBER: 2,
    VERIFIED_MEMBER: 1,
    MEMBER: 0,
    SUSPENDED: -1,
    SHADOW_USER: -2,
    AWAITING_VERIFICATION: -3
};

/**
 * initial setup process and token validation
 */
async function run()
{
    await initSetup();

    const {
        port, secret, linkWhitelist, freeLinks, projectName, projectDescription, dev,
        emailSMTPHost, emailSMTPPort, emailSMTPSecure, emailSMTPUser, emailSMTPPass, emailFromDisplayName,
        stripeSecretKey, stripeProductID, stripeCustomerPortalURL, stripeWebhookSigningSecret,
        reportEmail
    } = require(`./config.json`);

    let {
        hcaptchaSiteKey, hcaptchaSecret, discordWebhookURL, https
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
    const usernameRegex = /^[\dA-Za-z]+$/;
    const emailRegex = /[^\t\n\r @]+@[^\t\n\r @]+\.[^\t\n\r @]+/;
    // eslint-disable-next-line no-control-regex
    const ASCIIRegex = /^[\u0000-\u007F]*$/;
    const linkRegex = /https?:\/\/(www\.)?[\w#%+.:=@~-]{1,256}\.[\d()A-Za-z]{1,6}\b([\w!#%&()+./:=?@~-]*)/;

    const bannedUsernames = new Set([
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

    const supportedFeaturedContentUrls = new Set([
        `youtube.com`,
        `youtu.be`,
        `twitch.tv`,
        `soundcloud.com`,
        `open.spotify.com`,
        `music.apple.com`,
    ]);

    const themes = [];
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

    const bcrypt = require(`bcrypt`);
    const passport = require(`passport`);
    const flash = require(`express-flash`);
    const session = require(`express-session`);
    const nodemailer = require(`nodemailer`);
    const stripe = require(`stripe`);
    const csurf = require(`@dr.pogodin/csurf`);
    const csrfProtection = csurf({
        cookie: {
            httpOnly: true,
            secure: https === `https`,
            sameSite: `strict`,
            maxAge: 1000 * 60 * 60 * 24 * 7, // 7d
        },
    });
    const cookieParser = require(`cookie-parser`);
    const rateLimiter = rateLimit({
        windowMs: 1 * 30 * 1000, // Every 30s
        max: 300 // Limit each IP to X requests per windowMs.
    });
    const app = express();
    if (!dev) app.set(`trust proxy`, 1); // trust first proxy

    const SqliteStore = require(`better-sqlite3-session-store`)(session);
    const sessionDatabase = new SQLite(`./src/sessions.db`);

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

    const multer = require(`multer`);
    const storage = multer.diskStorage(
        {
            destination: `./src/public/img/ugc/`,
            filename: (request, file, callback) =>
            {
                const fileName = `${ Date.now() }${ path.extname(file.originalname) }`;
                callback(undefined, fileName);
            }
        }
    );
    const uploadImage = multer({ storage }).single(`photo`);

    const initializePassport = require(`./passport-config.cjs`);
    initializePassport(
        passport,
        (email) => sql.prepare(`SELECT * FROM userAuth WHERE email = ?`).get(email),
        (id) => sql.prepare(`SELECT * FROM userAuth WHERE uid = ?`).get(id)
    );

    app.get(`/`, csrfProtection, (request, response) =>
    {
        const csrfToken = request.csrfToken();
        response.render(`index.ejs`, {
            projectName,
            projectDescription,
            image: `${ https }://${ request.get(`host`) }/img/logo.png`,
            isLoggedIn: request.isAuthenticated(),
            csrfToken,
        });
    });

    app.get(`/login`, csrfProtection, checkNotAuthenticated, (request, response) =>
    {
        const csrfToken = request.csrfToken();
        response.render(`login.ejs`, {
            projectName,
            projectDescription,
            image: `${ https }://${ request.get(`host`) }/img/logo.png`,
            hcaptchaSiteKey,
            csrfToken,
        });
    });

    app.post(`/login`, csrfProtection, checkNotAuthenticated, async (request, response, next) =>
    {
        try
        {
            const verifyResults = await verify(hcaptchaSecret, request.body[`h-captcha-response`]);
            if (!verifyResults.success)
            {
                request.flash(`error`, `Please fill out the captcha.`);
                return response.redirect(`/login?message=Please fill out the captcha.&type=error`);
            }
            passport.authenticate(`local`, {
                successRedirect: `/edit`,
                failureRedirect: `/login?message=Email/Password incorrect.&type=error`,
                failureFlash: true
            })(request, response, next);
        }
        catch
        {
            response.redirect(`/login?message=An error occurred.&type=error`);
        }
    });

    app.get(`/register`, csrfProtection, checkNotAuthenticated, (request, response) =>
    {
        const csrfToken = request.csrfToken();
        response.render(`register.ejs`, {
            projectName,
            projectDescription,
            image: `${ https }://${ request.get(`host`) }/img/logo.png`,
            hcaptchaSiteKey,
            csrfToken,
        });
    });

    app.post(`/register`, csrfProtection, checkNotAuthenticated, async (request, response) =>
    {
        try
        {
            const verifyResults = await verify(hcaptchaSecret, request.body[`h-captcha-response`]);
            if (!verifyResults.success)
            {
                request.flash(`error`, `Please fill out the captcha.`);
                return response.redirect(`/register?message=Please fill out the captcha.&type=error`);
            }
            const username = request.body.username.toString().toLowerCase().trim().slice(0, 60);
            if (bannedUsernames.has(username))
                return response.redirect(`/register?message=That username is not available.&type=error`);

            if (!usernameRegex.test(username))
                return response.redirect(`/register?message=That username is not available.&type=error`);

            const email = request.body.email.toString().toLowerCase().trim().slice(0, 512);
            if (!emailRegex.test(email))
                return response.redirect(`/register?message=That email is not valid.&type=error`);

            const user = sql.prepare(`SELECT * FROM userAuth WHERE username = ?`).get(username);
            const emailExists = sql.prepare(`SELECT * FROM userAuth WHERE email = ?`).get(email);
            if (user || emailExists)
                return response.redirect(`/register?message=That username/email is already in use.&type=error`);
            const hashedPassword = await bcrypt.hash(request.body.password.toString().trim().slice(0, 1024), 10);

            const availableChars = `ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789`;
            let token = ``;
            for (let index = 0; index < 32; index++)
                token += availableChars.charAt(Math.floor(Math.random() * availableChars.length));

            const tokenExists = sql.prepare(`SELECT * FROM emailActivations WHERE token = ?`).get(token);
            if (tokenExists) // too lazy to gen them another one so just force them to do it again
                return response.redirect(`/register?message=An error occurred. Please try again.&type=error`);
            sql.prepare(`INSERT INTO emailActivations (email, username, token, expires) VALUES (?, ?, ?, ?)`).run(email, username, `${ token }`, `${ new Date(Date.now() + (86_400_000 * 2)).toISOString().slice(0, 10) }`);

            let stripeCID = ``;
            if (stripeSecretKey && stripeProductID && stripeCustomerPortalURL && stripeWebhookSigningSecret)
            {
                const customer = await Stripe.customers.create({
                    email,
                    description: `New Customer`
                });
                stripeCID = customer.id;
            }
            sql.prepare(`INSERT INTO userAuth (username, email, password, stripeCID) VALUES (?, ?, ?, ?)`).run(username, email, hashedPassword, stripeCID);
            sql.prepare(`INSERT INTO users (username, verified, paid, subExpires, lastUsernameChange, displayName, bio, image, links, linkNames, featuredContent, theme, advancedTheme, ageGated) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(username, `${ VER_STATUS.AWAITING_VERIFICATION }`, `0`, ``, `${ new Date(Date.now()).toISOString().slice(0, 10) }`, username, `No bio yet.`, `${ https }://${ request.get(`host`) }/img/person.png`, `[]`, `[]`, ``, `Light`, ``, `0`);

            // If this is the first user, make them staff.
            const userCount = sql.prepare(`SELECT COUNT(*) FROM userAuth`).get();
            if (userCount[`COUNT(*)`] === 1)
                sql.prepare(`UPDATE users SET paid = ?, subExpires = ?, verified = ? WHERE username = ?`).run(`1`, `9999-01-01`, `${ VER_STATUS.STAFF_MEMBER }`, username);
            else
            {
                if (emailSMTPHost && emailSMTPPort && emailSMTPUser && emailSMTPPass && emailFromDisplayName)
                {
                    await transporter.sendMail({
                        from: `"${ emailFromDisplayName }" <${ emailSMTPUser }>`,
                        to: `${ email }`,
                        subject: `Please verify your email`,
                        text: `Please verify your email by clicking the link below:\n\n${ https }://${ request.get(`host`) }/verifyemail?token=${ token }\n\nIf you did not sign up for an account, please ignore this email.\n\nThanks,\n${ emailFromDisplayName }`,
                        html: `<p>Please verify your email by clicking the link below:</p><p><a href="${ https }://${ request.get(`host`) }/verifyemail?token=${ token }">${ https }://${ request.get(`host`) }/verifyemail?token=${ token }</a></p><p>If you did not sign up for an account, please ignore this email.</p><p>Thanks,<br>${ emailFromDisplayName }</p>`
                    });
                }
                sendAuditLog(`|| ${ username } // ${ email } || registered for an account.`, discordWebhookURL);
                return response.redirect(`/login?message=Account created. Please verify your email address, if you do not verify within 24 hours we will delete your account.&type=success`);
            }
            response.redirect(`/edit`);
        }
        catch
        {
            response.redirect(`/register?message=An error occurred.&type=error`);
        }
    });

    app.get(`/upgrade`, csrfProtection, checkAuthenticated, async (request, response, next) =>
    {
        const userData = sql.prepare(`SELECT * FROM userAuth WHERE email = ?`).get(request.user);
        if (!userData)
        {
            logoutUser(request, response, next);
            return response.redirect(`/login`);
        }

        const verificationStatus = sql.prepare(`SELECT * FROM users WHERE username = ?`).get(userData.username).verified;
        if (verificationStatus === VER_STATUS.AWAITING_VERIFICATION)
            return response.redirect(`/edit?message=Please verify your email address before upgrading.&type=error`);

        try
        {
            if (stripeSecretKey && stripeProductID && stripeCustomerPortalURL && stripeWebhookSigningSecret)
            {
                // if we have a query string, it's a stripe redirect
                if (request.query && request.query.session_id)
                {
                    // verify the session
                    const session = await Stripe.checkout.sessions.retrieve(request.query.session_id);
                    if (session.customer !== userData.stripeCID)
                        return response.redirect(`/edit?message=An error occurred.&type=error`);

                    if (session.payment_status === `paid`)
                    {
                        // We handle the actual subscription update in the webhook.
                        return response.redirect(`/edit?message=You have successfully upgraded your account.&type=success`);
                    }
                }
                else
                {
                    const stripeCID = userData.stripeCID;
                    if (stripeCID)
                    {
                        const customer = await Stripe.customers.retrieve(stripeCID);
                        /* eslint-disable camelcase */
                        const session = await Stripe.checkout.sessions.create({
                            mode: `subscription`,
                            payment_method_types: [`card`],
                            customer: customer.id,
                            line_items: [
                                {
                                    price: stripeProductID,
                                    quantity: 1
                                },
                            ],
                            success_url: `${ https }://${ request.get(`host`) }/upgrade?session_id={CHECKOUT_SESSION_ID}`,
                            cancel_url: `${ https }://${ request.get(`host`) }/edit`
                        });
                        /* eslint-enable camelcase */
                        return response.redirect(session.url);
                    }
                }
            }
        }
        catch
        {
            response.redirect(`/edit`);
        }
        response.redirect(`/edit`);
    });

    app.get(`/billing`, csrfProtection, checkAuthenticated, async (request, response, next) =>
    {
        const userData = sql.prepare(`SELECT * FROM userAuth WHERE email = ?`).get(request.user);
        if (!userData)
        {
            logoutUser(request, response, next);
            return response.redirect(`/login`);
        }

        const paidStatus = sql.prepare(`SELECT * FROM users WHERE username = ?`).get(userData.username).paid;
        if (paidStatus === 0)
            return response.redirect(`/edit?message=You must be a pro member to access this page.&type=error`);

        if (stripeSecretKey && stripeProductID && stripeCustomerPortalURL && stripeWebhookSigningSecret)
        {
            const stripeCID = userData.stripeCID;
            if (stripeCID)
                return response.redirect(`${ stripeCustomerPortalURL }`);
        }
        response.redirect(`/edit`);
    });

    app.post(`/webhook`, async (request, response) =>
    {
        if (stripeSecretKey && stripeProductID && stripeCustomerPortalURL && stripeWebhookSigningSecret)
        {
            let event;

            try
            {
                event = Stripe.webhooks.constructEvent(request.body, request.headers[`stripe-signature`], stripeWebhookSigningSecret);
            }
            catch
            {
                return response.sendStatus(400);
            }

            const data = event.data.object;
            if (event.type === `invoice.paid`)
            {
                const subscription = await Stripe.subscriptions.retrieve(data.subscription);
                if (subscription.status === `active`)
                {
                    const userAuthData = sql.prepare(`SELECT * FROM userAuth WHERE stripeCID = ?`).get(data.customer);
                    if (!userAuthData)
                        return response.sendStatus(400);
                    const userData = sql.prepare(`SELECT * FROM users WHERE username = ?`).get(userAuthData.username);
                    if (!userData)
                        return response.sendStatus(400);
                    const timeNow = new Date(Date.now());
                    const timeNextYear = new Date(timeNow.setFullYear(timeNow.getFullYear() + 1));
                    sql.prepare(`UPDATE users SET paid = ?, subExpires = ? WHERE username = ?`).run(`1`, `${ timeNextYear.toISOString().slice(0, 10) }`, userData.username);

                    if (discordWebhookURL)
                    {
                        let paidCount = sql.prepare(`SELECT COUNT(*) FROM users WHERE paid = 1`).get()[`COUNT(*)`];
                        const staffCount = sql.prepare(`SELECT COUNT(*) FROM users WHERE verified = ?`).get(`${ VER_STATUS.STAFF_MEMBER }`)[`COUNT(*)`];
                        paidCount -= staffCount;
                        let content = ``;
                        content += `|| ${ userData.username } // ${ userData.email } || has upgraded their account!\nWe now have **${ paidCount }** paid users.`;
                        await sendAuditLog(content, discordWebhookURL);
                    }
                }
            }
            else if (event.type === `customer.subscription.updated`)
            {
                const userAuthData = sql.prepare(`SELECT * FROM userAuth WHERE stripeCID = ?`).get(data.customer);
                if (data.cancel_at_period_end === true)
                    sendAuditLog(`|| ${ userAuthData.username } // ${ userAuthData.email } || has cancelled their subscription.\nThey will lose pro perks on/around <t:${ data.current_period_end }>`, discordWebhookURL);

                else if (data.status === `unpaid`)
                {
                    const userAuthData = sql.prepare(`SELECT * FROM userAuth WHERE stripeCID = ?`).get(data.customer);
                    if (!userAuthData)
                        return response.sendStatus(400);
                    const userData = sql.prepare(`SELECT * FROM users WHERE username = ?`).get(userAuthData.username);
                    if (!userData)
                        return response.sendStatus(400);
                    sql.prepare(`UPDATE users SET paid = ?, subExpires = ? WHERE username = ?`).run(`0`, ``, userData.username);
                    sendAuditLog(`|| ${ userAuthData.username } // ${ userAuthData.email } || has failed to pay their subscription.`, discordWebhookURL);
                }
            }

            response.sendStatus(200);
        }
        else
            response.sendStatus(400);
    });

    app.get(`/verifyemail`, csrfProtection, (request, response) =>
    {
        try
        {
            const queries = request.query;
            if (!queries.token)
                return response.redirect(`/edit?message=Invalid token.&type=error`);
            const token = queries.token.toString().trim().slice(0, 32);
            const tokenData = sql.prepare(`SELECT * FROM emailActivations WHERE token = ?`).get(token);
            if (!tokenData)
                return response.redirect(`/edit?message=Invalid token.&type=error`);
            const user = sql.prepare(`SELECT * FROM users WHERE username = ?`).get(tokenData.username);
            if (!user)
                return response.redirect(`/edit?message=An error occurred.&type=error`);
            if (tokenData.expires < new Date(Date.now()).toISOString().slice(0, 10))
            {
                sql.prepare(`DELETE FROM emailActivations WHERE token = ?`).run(token);
                return response.redirect(`/edit?message=Token expired.&type=error`);
            }
            sql.prepare(`DELETE FROM emailActivations WHERE token = ?`).run(token);
            if (user.verified === VER_STATUS.AWAITING_VERIFICATION)
                sql.prepare(`UPDATE users SET verified = ? WHERE username = ?`).run(`${ VER_STATUS.MEMBER }`, tokenData.username);
            sendAuditLog(`|| ${ user.username } // ${ tokenData.email } || activated their account.`, discordWebhookURL);
            return response.redirect(`/login?message=Email verified.&type=success`);
        }
        catch
        {
            response.redirect(`/edit?message=An error occurred.&type=error`);
        }
    });

    app.get(`/resendactivationemail`, csrfProtection, checkAuthenticated, async (request, response, next) =>
    {
        try
        {
            const userEmail = request.user;
            const userData = sql.prepare(`SELECT * FROM userAuth WHERE email = ?`).get(userEmail);
            if (!userData)
            {
                logoutUser(request, response, next);
                return response.redirect(`/login`);
            }
            const user = sql.prepare(`SELECT * FROM users WHERE username = ?`).get(userData.username);
            if (user.verified !== `${ VER_STATUS.AWAITING_VERIFICATION }`)
                return response.redirect(`/edit?message=Email already verified.&type=error`);
            const availableChars = `ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789`;
            let token = ``;
            for (let index = 0; index < 32; index++)
                token += availableChars.charAt(Math.floor(Math.random() * availableChars.length));
            sql.prepare(`DELETE FROM emailActivations WHERE email = ?`).run(userEmail);

            const tokenExists = sql.prepare(`SELECT * FROM emailActivations WHERE token = ?`).get(token);
            if (tokenExists) // too lazy to gen them another one so just force them to do it again
                return response.redirect(`/edit?message=An error occurred. Please try again.&type=error`);
            sql.prepare(`INSERT INTO emailActivations (email, username, token, expires) VALUES (?, ?, ?, ?)`).run(userEmail, userData.username, `${ token }`, `${ new Date(Date.now() + (86_400_000 * 2)).toISOString().slice(0, 10) }`);
            if (emailSMTPHost && emailSMTPPort && emailSMTPUser && emailSMTPPass && emailFromDisplayName)
            {
                await transporter.sendMail({
                    from: `"${ emailFromDisplayName }" <${ emailSMTPUser }>`,
                    to: `${ userEmail }`,
                    subject: `Please verify your email`,
                    text: `Please verify your email by clicking the link below:\n\n${ https }://${ request.get(`host`) }/verifyemail?token=${ token }\n\nIf you did not sign up for an account, please ignore this email.\n\nThanks,\n${ emailFromDisplayName }`,
                    html: `<p>Please verify your email by clicking the link below:</p><p><a href="${ https }://${ request.get(`host`) }/verifyemail?token=${ token }">${ https }://${ request.get(`host`) }/verifyemail?token=${ token }</a></p><p>If you did not sign up for an account, please ignore this email.</p><p>Thanks,<br>${ emailFromDisplayName }</p>`
                });
            }

            sendAuditLog(`|| ${ userData.username } // ${ userEmail } || requested a new email activation.`, discordWebhookURL);
            return response.redirect(`/edit?message=Email resent.&type=success`);
        }
        catch
        {
            response.redirect(`/edit?message=An error occurred.&type=error`);
        }
    });

    app.get(`/forgotpassword`, csrfProtection, (request, response) =>
    {
        const csrfToken = request.csrfToken();
        response.render(`forgotpassword.ejs`, {
            projectName,
            projectDescription,
            image: `${ https }://${ request.get(`host`) }/img/logo.png`,
            hcaptchaSiteKey,
            csrfToken,
        });
    });

    app.post(`/forgotpassword`, csrfProtection, async (request, response) =>
    {
        try
        {
            const verifyResults = await verify(hcaptchaSecret, request.body[`h-captcha-response`]);
            if (!verifyResults.success)
            {
                request.flash(`error`, `Please fill out the captcha.`);
                return response.redirect(`/login?message=Please fill out the captcha.&type=error`);
            }
            const email = request.body.email.toString();
            if (!email)
                return response.redirect(`/forgotpassword?message=Please enter an email.&type=error`);
            const userData = sql.prepare(`SELECT * FROM userAuth WHERE email = ?`).get(email);
            if (!userData)
                return response.redirect(`/forgotpassword?message=An error occurred.&type=error`);

            const availableChars = `ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789`;
            let token = ``;
            for (let index = 0; index < 32; index++)
                token += availableChars.charAt(Math.floor(Math.random() * availableChars.length));
            sql.prepare(`DELETE FROM passwordResets WHERE email = ?`).run(email);
            const tokenExists = sql.prepare(`SELECT * FROM passwordResets WHERE token = ?`).get(token);
            if (tokenExists) // too lazy to gen them another one so just force them to do it again
                return response.redirect(`/forgotpassword?message=An error occurred. Please try again.&type=error`);
            sql.prepare(`INSERT INTO passwordResets (email, username, token, expires) VALUES (?, ?, ?, ?)`).run(email, userData.username, `${ token }`, `${ new Date(Date.now() + (86_400_000 * 2)).toISOString().slice(0, 10) }`);
            if (emailSMTPHost && emailSMTPPort && emailSMTPUser && emailSMTPPass && emailFromDisplayName)
            {
                await transporter.sendMail({
                    from: `"${ emailFromDisplayName }" <${ emailSMTPUser }>`,
                    to: `${ email }`,
                    subject: `Password Reset`,
                    text: `Please reset your password by clicking the link below:\n\n${ https }://${ request.get(`host`) }/resetpassword?token=${ token }\n\nIf you did not request a password reset, please ignore this email.\n\nThanks,\n${ emailFromDisplayName }`,
                    html: `<p>Please reset your password by clicking the link below:</p><p><a href="${ https }://${ request.get(`host`) }/resetpassword?token=${ token }">${ https }://${ request.get(`host`) }/resetpassword?token=${ token }</a></p><p>If you did not request a password reset, please ignore this email.</p><p>Thanks,<br>${ emailFromDisplayName }</p>`
                });
            }

            sendAuditLog(`|| ${ userData.username } // ${ email } || requested a password reset.`, discordWebhookURL);
            return response.redirect(`/forgotpassword?message=Password reset email sent.&type=success`);
        }
        catch
        {
            response.redirect(`/forgotpassword?message=An error occurred.&type=error`);
        }
    });

    app.get(`/resetpassword`, csrfProtection, (request, response) =>
    {
        const queries = request.query;
        if (!queries.token)
            return response.redirect(`/forgotpassword?message=Invalid token.&type=error`);
        const token = queries.token.toString().trim().slice(0, 32);
        const tokenData = sql.prepare(`SELECT * FROM passwordResets WHERE token = ?`).get(token);
        if (!tokenData)
            return response.redirect(`/forgotpassword?message=Invalid token.&type=error`);
        if (tokenData.expires < new Date(Date.now()).toISOString())
        {
            sql.prepare(`DELETE FROM passwordResets WHERE token = ?`).run(token);
            return response.redirect(`/forgotpassword?message=Token expired.&type=error`);
        }
        const csrfToken = request.csrfToken();
        response.render(`resetpassword.ejs`, {
            projectName,
            projectDescription,
            image: `${ https }://${ request.get(`host`) }/img/logo.png`,
            hcaptchaSiteKey,
            token,
            csrfToken,
        });
    });

    app.post(`/resetpassword`, csrfProtection, async (request, response) =>
    {
        try
        {
            const token = request.body.token.toString();
            if (!token)
                return response.redirect(`/forgotpassword?message=Invalid token.&type=error`);
            const verifyResults = await verify(hcaptchaSecret, request.body[`h-captcha-response`]);
            if (!verifyResults.success)
            {
                request.flash(`error`, `Please fill out the captcha.`);
                return response.redirect(`/resetpassword?token=${ token }&message=Please fill out the captcha.&type=error`);
            }
            const tokenData = sql.prepare(`SELECT * FROM passwordResets WHERE token = ?`).get(token);
            if (!tokenData)
                return response.redirect(`/forgotpassword?message=Invalid token.&type=error`);
            if (tokenData.expires < new Date(Date.now()).toISOString())
            {
                sql.prepare(`DELETE FROM passwordResets WHERE token = ?`).run(token);
                return response.redirect(`/forgotpassword?message=Token expired.&type=error`);
            }
            const password = request.body.password.toString();
            const confirmPassword = request.body.password2.toString();
            if (!password || !confirmPassword)
                return response.redirect(`/resetpassword?token=${ token }&message=Please enter a password.&type=error`);
            if (password !== confirmPassword)
                return response.redirect(`/resetpassword?token=${ token }&message=Passwords do not match.&type=error`);
            const hash = await bcrypt.hash(password.slice(0, 128), 10);
            sql.prepare(`UPDATE userAuth SET password = ? WHERE email = ?`).run(hash, tokenData.email);
            sql.prepare(`DELETE FROM passwordResets WHERE token = ?`).run(token);
            sendAuditLog(`|| ${ tokenData.username } // ${ tokenData.email } || reset their password.`, discordWebhookURL);
            return response.redirect(`/login?message=Password reset.&type=success`);
        }
        catch
        {
            response.redirect(`/forgotpassword?message=An error occurred.&type=error`);
        }
    });

    app.get(`/report`, csrfProtection, (request, response) =>
    {
        const csrfToken = request.csrfToken();
        response.render(`report.ejs`, {
            projectName,
            projectDescription,
            image: `${ https }://${ request.get(`host`) }/img/logo.png`,
            hcaptchaSiteKey,
            csrfToken,
        });
    });

    app.post(`/report`, csrfProtection, async (request, response) =>
    {
        try
        {
            const verifyResults = await verify(hcaptchaSecret, request.body[`h-captcha-response`]);
            if (!verifyResults.success)
            {
                request.flash(`error`, `Please fill out the captcha.`);
                return response.redirect(`/report?message=Please fill out the captcha.&type=error`);
            }
            const email = request.body.email.toString();
            const fullName = request.body.fullName.toString();
            const message = request.body.message.toString();
            if (!email || !fullName || !message)
                return response.redirect(`/report?message=Please complete the form.&type=error`);

            if (emailSMTPHost && emailSMTPPort && emailSMTPUser && emailSMTPPass && emailFromDisplayName && reportEmail)
            {
                await transporter.sendMail({
                    from: `"${ emailFromDisplayName }" <${ emailSMTPUser }>`,
                    to: `${ reportEmail }`,
                    subject: `New Report Form Submission`,
                    text: `New report form submission:\n\nEmail: ${ email }\nFull Name: ${ fullName }\nMessage: ${ message }`,
                    html: `<p>New report form submission:</p><p>Email: ${ email }</p><p>Full Name: ${ fullName }</p><p>Message: ${ message }</p>`
                });
                sendAuditLog(`New report form submission. Please have the report administrator check their email.`, discordWebhookURL);
                return response.redirect(`/report?message=Your report has been received.&type=success`);
            }
            return response.redirect(`/report?message=An error occurred.&type=error`);
        }
        catch
        {
            response.redirect(`/report?message=An error occurred.&type=error`);
        }
    });

    app.get(`/edit`, csrfProtection, checkAuthenticated, (request, response, next) =>
    {
        const userAuth = sql.prepare(`SELECT * FROM userAuth WHERE email = ?`).get(request.user);
        if (!userAuth)
        {
            logoutUser(request, response, next);
            return response.redirect(`/login?message=An error occurred.&type=error`);
        }

        const user = sql.prepare(`SELECT * FROM users WHERE username = ?`).get(userAuth.username);
        if (user.verified === VER_STATUS.SUSPENDED)
        {
            logoutUser(request, response, next);
            return response.redirect(`/login?message=Your account has been suspended. Please contact support.&type=error`);
        }

        const advancedTheme = user.advancedTheme;

        let backgroundColor = `#ffffff`;
        let textColor = `#000000`;
        let borderColor = `#ffffff`;
        if (advancedTheme.includes(`style`))
        {
            backgroundColor = advancedTheme.split(`--background-color: `)[1].split(`;`)[0];
            textColor = advancedTheme.split(`--text-color: `)[1].split(`;`)[0];
            borderColor = advancedTheme.split(`--border-color: `)[1].split(`;`)[0];
        }

        const csrfToken = request.csrfToken();
        response.render(`edit.ejs`, {
            username: user.username,
            displayName: user.displayName,
            bio: user.bio,
            image: user.image,
            links: JSON.parse(user.links),
            linkNames: Buffer.from(user.linkNames).toString(`base64`),
            paid: Boolean(user.paid),
            subExpires: user.subExpires,
            verified: user.verified,
            ourImage: `${ https }://${ request.get(`host`) }/img/logo.png`,
            theme: user.theme,
            themes,
            backgroundColor,
            textColor,
            borderColor,
            ageGated: (user.ageGated === `1` ? `checked` : ``),
            projectName,
            linkWhitelist: freeLinks,
            featuredContent: user.featuredContent,
            supportedFeaturedContentUrls: [...supportedFeaturedContentUrls].join(`,`),
            csrfToken,
        });
    });

    app.post(`/edit`, csrfProtection, checkAuthenticated, async (request, response, next) =>
    {
        try
        {
            const userEmail = request.user;
            let username = sql.prepare(`SELECT * FROM userAuth WHERE email = ?`).get(userEmail);
            if (!username)
            {
                logoutUser(request, response, next);
                return response.redirect(`/login?message=An error occurred.&type=error`);
            }
            username = username.username;
            const isPaidUser = Boolean(sql.prepare(`SELECT * FROM users WHERE username = ?`).get(username).paid);
            const isSuspended = Boolean(sql.prepare(`SELECT * FROM users WHERE username = ?`).get(username).verified === VER_STATUS.SUSPENDED);

            if (isSuspended)
                return response.redirect(`/`);

            let ageGated = request.body.adultContent;
            ageGated = ageGated ? `1` : `0`;

            let updatedDisplayName = request.body.displayName.toString().trim().slice(0, 60);
            let updatedBio = request.body.bio.toString().trim().slice(0, 280);
            let updatedImage = request.body.image.toString().trim();
            let featuredContent = request.body.featuredContent.toString().trim();
            let theme = request.body.theme.toString().trim();
            let backgroundColor = request.body.backgroundColor.toString().trim().slice(0, 7);
            let textColor = request.body.textColor.toString().trim().slice(0, 7);
            let borderColor = request.body.borderColor.toString().trim().slice(0, 7);
            const colorRegex = /^#[\da-f]{6}$/i;
            if (!colorRegex.test(backgroundColor))
                backgroundColor = `#ffffff`;
            if (!colorRegex.test(textColor))
                textColor = `#000000`;
            if (!colorRegex.test(borderColor))
                borderColor = `#ffffff`;
            let advancedTheme = `
                    <style>
                    :root {
                    --background-color: ${ backgroundColor };
                    --text-color: ${ textColor };
                    --border-color: ${ borderColor };
                }

                    html,
                    body,
                    main,
                    div.links>div>button {
                        background-color: var(--background-color);
                    }

                    p,
                    a {
                        color: var(--text-color);
                    }

                    div.links>div>button {
                        border: solid var(--border-color) 2px;
                        color: var(--text-color);
                    }
                    </style>
    `.trim();
            advancedTheme = advancedTheme.replace(/(\r\n|\n|\r|\t)/g, ``);
            advancedTheme = advancedTheme.replace(/ {2}/g, ``);

            if ((!themes.includes(theme) || theme !== `Custom`) && (!isPaidUser && theme === `Custom`))
                theme = `Light`;

            if (theme !== `Custom`)
                advancedTheme = ``;

            if (!ASCIIRegex.test(updatedDisplayName) || updatedDisplayName.length > 60)
                updatedDisplayName = username;

            if (!ASCIIRegex.test(updatedBio) || updatedBio.length > 280)
                updatedBio = `No bio yet.`;

            if (!featuredContent.startsWith(`http://`) && !featuredContent.startsWith(`https://`))
                featuredContent = `https://${ featuredContent }`;
            featuredContent = featuredContent.replace(`www.`, ``);

            if (!linkRegex.test(featuredContent) || !isPaidUser || !supportedFeaturedContentUrls.has(new URL(featuredContent).hostname))
                featuredContent = ``;

            const host = escapeRegex(request.get(`host`));
            // eslint-disable-next-line no-useless-escape
            const regexForImageUGCUrl = new RegExp(`^(http|https):\/\/${ host }\/img\/ugc\/(.*)`);
            if (!regexForImageUGCUrl.test(updatedImage))
                updatedImage = `${ https }://${ request.get(`host`) }/img/person.png`;

            let updatedLinks = [];
            let updatedLinkNames = [];
            let unallowedLink = false;
            for (let index = 0; index < 50; index++)
            {
                if (request.body[`link${ index }`] && request.body[`linkName${ index }`])
                {
                    let link = request.body[`link${ index }`].toString().trim();
                    const linkName = request.body[`linkName${ index }`].toString().trim();
                    if (!link.startsWith(`http://`) && !link.startsWith(`https://`))
                        link = `https://${ link }`;
                    link = link.replace(`www.`, ``);

                    if (linkRegex.test(link) && linkName && !updatedLinks.includes(link))
                    {
                        let allowed = false;
                        if (linkWhitelist)
                        {
                            const domain = link.split(`//`)[1].split(`/`)[0];
                            if (!freeLinks.includes(domain) && !isPaidUser) // If free user & link is not in free list, skip.
                            {
                                allowed = false;
                                unallowedLink = true;
                                continue;
                            }
                            else
                                allowed = true;
                        }
                        else if (!linkWhitelist)
                            allowed = true; // they passed all checks

                        if (allowed)
                        {
                            updatedLinks.push(link);
                            updatedLinkNames.push(linkName);
                        }
                    }
                }
            }
            updatedLinks = JSON.stringify(updatedLinks);
            updatedLinkNames = JSON.stringify(updatedLinkNames);
            const currentUserInfo = sql.prepare(`SELECT * FROM users WHERE username = ?`).get(username);
            sql.prepare(`UPDATE users SET displayName = ?, bio = ?, image = ?, links = ?, linkNames = ?, featuredContent = ?, theme = ?, advancedTheme = ?, ageGated = ? WHERE username = ?`).run(updatedDisplayName, updatedBio, updatedImage, updatedLinks, updatedLinkNames, featuredContent, theme, advancedTheme, ageGated, username);
            let newProfileInfo = {
                displayName: updatedDisplayName,
                bio: updatedBio,
                image: updatedImage,
                links: updatedLinks,
                linkNames: updatedLinkNames,
                featuredContent,
                theme,
                backgroundColor,
                textColor,
                borderColor,
                ageGated
            };

            if (newProfileInfo.theme !== `Custom`)
            {
                delete newProfileInfo.backgroundColor;
                delete newProfileInfo.textColor;
                delete newProfileInfo.borderColor;
            }

            if (newProfileInfo.theme === currentUserInfo.theme)
                delete newProfileInfo.theme;
            if (newProfileInfo.displayName === currentUserInfo.displayName)
                delete newProfileInfo.displayName;
            if (newProfileInfo.bio === currentUserInfo.bio)
                delete newProfileInfo.bio;
            if (newProfileInfo.image === currentUserInfo.image)
                delete newProfileInfo.image;
            if (newProfileInfo.links === currentUserInfo.links)
                delete newProfileInfo.links;
            else if (newProfileInfo.links)
                newProfileInfo.links = JSON.parse(newProfileInfo.links);
            if (newProfileInfo.linkNames === currentUserInfo.linkNames)
                delete newProfileInfo.linkNames;
            else if (newProfileInfo.linkNames)
                newProfileInfo.linkNames = JSON.parse(newProfileInfo.linkNames);
            newProfileInfo.ageGated = ageGated;
            if (newProfileInfo.ageGated === `1` && currentUserInfo.ageGated === `1`)
                delete newProfileInfo.ageGated;
            if (newProfileInfo.ageGated === `0` && currentUserInfo.ageGated === `0`)
                delete newProfileInfo.ageGated;
            if (newProfileInfo.featuredContent === currentUserInfo.featuredContent)
                delete newProfileInfo.featuredContent;

            if (Object.keys(newProfileInfo).length > 0)
            {
                newProfileInfo = JSON.stringify(newProfileInfo, undefined, 4);
                sendAuditLog(`|| ${ username } // ${ userEmail } || updated their profile with: \`\`\`json\n${ newProfileInfo }\n\`\`\``, discordWebhookURL);
            }

            if (unallowedLink)
                return response.redirect(`/edit?message=Some of the links you tried to add are not allowed in the free plan.&type=error`);
            response.redirect(`/edit`);
        }
        catch
        {
            response.redirect(`/edit?message=An error occurred.&type=error`);
        }
    });

    app.post(`/edit/*`, csrfProtection, checkAuthenticated, async (request, response, next) =>
    {
        try
        {
            const usersCurrentEmail = request.user;
            let userUsername = sql.prepare(`SELECT * FROM userAuth WHERE email = ?`).get(usersCurrentEmail);
            if (!userUsername)
            {
                logoutUser(request, response, next);
                return response.redirect(`/login?message=An error occurred.&type=error`);
            }
            userUsername = userUsername.username;
            const verificationStatus = sql.prepare(`SELECT * FROM users WHERE username = ?`).get(userUsername).verified;
            if (verificationStatus === VER_STATUS.AWAITING_VERIFICATION)
                return response.redirect(`/edit?message=You must verify your email before you can modify that.&type=error`);

            const actionToTake = request.params[0];

            switch (actionToTake)
            {
                case `changeEmail`: {
                    const oldEmailInput = request.body.oldEmail.toString().toLowerCase().trim();
                    const newEmail = request.body.newEmail.toString().toLowerCase().trim();
                    const password = request.body.password.toString().trim();
                    const usersHashedPassword = sql.prepare(`SELECT * FROM userAuth WHERE username = ?`).get(userUsername).password;
                    const isCorrectPassword = await bcrypt.compare(password, usersHashedPassword);

                    if ((oldEmailInput === usersCurrentEmail)
                        && isCorrectPassword && newEmail.length <= 512
                        && emailRegex.test(newEmail))
                    {
                        const emailExists = sql.prepare(`SELECT * FROM userAuth WHERE email = ?`).get(newEmail);
                        if (!emailExists)
                        {
                            if (stripeSecretKey && stripeProductID && stripeCustomerPortalURL && stripeWebhookSigningSecret)
                            {
                                const stripeCID = sql.prepare(`SELECT * FROM userAuth WHERE username = ?`).get(userUsername).stripeCID;
                                if (stripeCID)
                                {
                                    await Stripe.customers.update(
                                        stripeCID,
                                        {
                                            email: newEmail,
                                        }
                                    );
                                }
                            }

                            sql.prepare(`UPDATE userAuth SET email = ? WHERE username = ?`).run(newEmail, userUsername);
                            sendAuditLog(`|| ${ userUsername } // ${ usersCurrentEmail } || changed their email to || ${ newEmail } ||.`, discordWebhookURL);
                        }
                    }

                    response.redirect(`/edit`);
                    break;
                }
                case `changePassword`: {
                    const oldPassword = request.body.oldPassword.toString().trim();
                    const newPassword = request.body.newPassword.toString().trim();
                    const usersHashedPassword = sql.prepare(`SELECT * FROM userAuth WHERE username = ?`).get(userUsername).password;
                    const isCorrectPassword = await bcrypt.compare(oldPassword, usersHashedPassword);

                    if (isCorrectPassword && newPassword && newPassword.length > 0 && newPassword.length < 1024)
                    {
                        const hashedPassword = await bcrypt.hash(newPassword, 10);
                        sql.prepare(`UPDATE userAuth SET password = ? WHERE username = ?`).run(hashedPassword, userUsername);
                        sendAuditLog(`|| ${ userUsername } // ${ usersCurrentEmail } || changed their password.`, discordWebhookURL);
                        logoutUser(request, response, next);
                    }
                    response.redirect(`/edit`);
                    break;
                }
                case `changeUsername`: {
                    const newUsername = request.body.username.toString().trim().toLowerCase().slice(0, 60);
                    const password = request.body.password.toString().trim();
                    const usersHashedPassword = sql.prepare(`SELECT * FROM userAuth WHERE username = ?`).get(userUsername).password;
                    const isCorrectPassword = await bcrypt.compare(password, usersHashedPassword);

                    if (isCorrectPassword && newUsername && usernameRegex.test(newUsername))
                    {
                        const usernameExists = sql.prepare(`SELECT * FROM userAuth WHERE username = ?`).get(newUsername);
                        if (!usernameExists)
                        {
                            let lastChangeDate = sql.prepare(`SELECT * FROM users WHERE username = ?`).get(userUsername).lastUsernameChange;
                            const isPaidUser = Boolean(sql.prepare(`SELECT * FROM users WHERE username = ?`).get(userUsername).paid);
                            lastChangeDate = new Date(lastChangeDate);
                            const timeSinceLastChange = Date.now() - lastChangeDate;
                            const currentDate = new Date(Date.now()).toISOString().slice(0, 10);
                            if ((timeSinceLastChange > 7_776_000_000 || isPaidUser) && !bannedUsernames.has(newUsername)) // 3 months
                            {
                                sql.prepare(`UPDATE userAuth SET username = ? WHERE username = ?`).run(newUsername, userUsername);
                                sql.prepare(`UPDATE users SET username = ?, lastUsernameChange = ? WHERE username = ?`).run(newUsername, currentDate, userUsername);
                                sendAuditLog(`|| ${ userUsername } // ${ usersCurrentEmail } || changed their username to || ${ newUsername } ||.`, discordWebhookURL);
                            }
                        }
                    }
                    response.redirect(`/edit`);
                    break;
                }
                default: {
                    response.redirect(`/edit`);
                    break;
                }
            }
        }
        catch
        {
            response.redirect(`/edit?message=An error occurred.&type=error`);
        }
    });

    app.get(`/staff`, csrfProtection, checkAuthenticatedStaff, (request, response, next) =>
    {
        let myUsername = sql.prepare(`SELECT * FROM userAuth WHERE email = ?`).get(request.user);
        if (!myUsername)
        {
            logoutUser(request, response, next);
            return response.redirect(`/login`);
        }
        myUsername = myUsername.username;
        if (!request.query.page && !request.query.search)
            return response.redirect(`/staff?page=1`);
        const pageNumber = Number.parseInt(request.query.page.toString(), 10);
        if (Number.isNaN(pageNumber) || pageNumber < 1)
            return response.redirect(`/staff?page=1`);
        const usersPerPage = 100;
        // select users from database that are in the page number*100
        let userDataByPage = sql.prepare(`SELECT * FROM users LIMIT ? OFFSET ?`).all(usersPerPage, (pageNumber - 1) * usersPerPage);
        let userAuthDataByPage = sql.prepare(`SELECT * FROM userAuth LIMIT ? OFFSET ?`).all(usersPerPage, (pageNumber - 1) * usersPerPage);

        let totalUserCount = sql.prepare(`SELECT COUNT(*) FROM users`).get()[`COUNT(*)`];
        const verifiedCount = sql.prepare(`SELECT COUNT(*) FROM users WHERE verified = ?`).get(`${ VER_STATUS.VERIFIED_MEMBER }`)[`COUNT(*)`];
        let paidCount = sql.prepare(`SELECT COUNT(*) FROM users WHERE paid = 1`).get()[`COUNT(*)`];
        const suspendedCount = sql.prepare(`SELECT COUNT(*) FROM users WHERE verified = ?`).get(`${ VER_STATUS.SUSPENDED }`)[`COUNT(*)`];
        const staffCount = sql.prepare(`SELECT COUNT(*) FROM users WHERE verified = ?`).get(`${ VER_STATUS.STAFF_MEMBER }`)[`COUNT(*)`];
        const shadowUserCount = sql.prepare(`SELECT COUNT(*) FROM users WHERE verified = ?`).get(`${ VER_STATUS.SHADOW_USER }`)[`COUNT(*)`];
        const awaitingEmailUserCount = sql.prepare(`SELECT COUNT(*) FROM users WHERE verified = ?`).get(`${ VER_STATUS.AWAITING_VERIFICATION }`)[`COUNT(*)`];

        totalUserCount -= shadowUserCount;
        paidCount -= staffCount;
        let freeCount = totalUserCount - paidCount - staffCount;
        if (freeCount < 0)
            freeCount = 0;

        let search = request.query.search;
        if (search)
        {
            search = search.toString().trim().toLowerCase();
            userDataByPage = sql.prepare(`SELECT * FROM users WHERE username LIKE ?`).all(`%${ search }%`);
            userAuthDataByPage = sql.prepare(`SELECT * FROM userAuth WHERE username LIKE ?`).all(`%${ search }%`);
        }

        if (userDataByPage.length === 0)
            return response.redirect(`/staff?page=1`);

        const userCountPaginated = userDataByPage.length;
        const usernames = [];
        const emails = [];
        const verified = [];
        const paid = [];
        const subExpires = [];
        const displayNames = [];
        const bios = [];
        const images = [];
        const links = [];
        const linkNames = [];
        const ageGated = [];
        const featuredContent = [];

        for (const [index, allUser] of userDataByPage.entries())
        {
            usernames.push(allUser.username);
            emails.push(Buffer.from(userAuthDataByPage[index].email).toString(`base64`));
            verified.push(allUser.verified);
            paid.push(allUser.paid);
            let subExpire = allUser.subExpires;
            if (subExpire === ``)
                subExpire = `n/a`;
            subExpires.push(subExpire);
            displayNames.push(Buffer.from(allUser.displayName).toString(`base64`));
            bios.push(Buffer.from(allUser.bio).toString(`base64`));
            images.push(allUser.image);
            let linkData = JSON.stringify(allUser.links);
            linkData = Buffer.from(linkData).toString(`base64`);
            links.push(linkData);
            let linkNameData = JSON.stringify(allUser.linkNames);
            linkNameData = Buffer.from(linkNameData).toString(`base64`);
            linkNames.push(linkNameData);
            ageGated.push(allUser.ageGated);
            featuredContent.push(allUser.featuredContent);
        }

        const csrfToken = request.csrfToken();
        response.render(`staff.ejs`, {
            userCountPaginated,
            usernames,
            emails,
            verified,
            paid,
            subExpires,
            myUsername,
            displayNames,
            bios,
            images,
            links,
            linkNames,
            featuredContent,
            ageGated,
            totalUserCount,
            verifiedCount,
            paidCount,
            suspendedCount,
            staffCount,
            freeCount,
            shadowUserCount,
            awaitingEmailUserCount,
            projectName,
            ourImage: `${ https }://${ request.get(`host`) }/img/logo.png`,
            csrfToken,
        });
    });

    app.post(`/staff/*`, csrfProtection, checkAuthenticatedStaff, async (request, response, next) =>
    {
        // ! There is not a lot of security here, so be sure you trust who is staff.
        // ! They can delete/modify ANY user, even other staff.
        try
        {
            const staffEmail = request.user;
            let staffUsername = sql.prepare(`SELECT * FROM userAuth WHERE email = ?`).get(staffEmail);
            if (!staffUsername)
            {
                logoutUser(request, response, next);
                return response.redirect(`/login`);
            }
            staffUsername = staffUsername.username;
            const actionToTake = request.params[0];
            const usernameToTakeActionOn = request.body.username.toString();

            if (usernameToTakeActionOn === staffUsername)
                return response.redirect(`/staff`);

            switch (actionToTake)
            {
                case `editUser`: {
                    const userToEdit = request.body.username.toString();

                    const currentUserInfo = sql.prepare(`SELECT * FROM users WHERE username = ?`).get(usernameToTakeActionOn);
                    for (const [key, value] of Object.entries(request.body))
                    {
                        switch (key)
                        {
                            case `username`: {
                                continue;
                            }
                            case `_csrf`: {
                                continue;
                            }
                            case `newUsername`: {
                                if (value === ``)
                                    continue;
                                const newUsername = value.trim().toLowerCase().slice(0, 60);
                                const usernameExists = sql.prepare(`SELECT * FROM userAuth WHERE username = ?`).get(newUsername);
                                if (!usernameExists && !bannedUsernames.has(newUsername))
                                {
                                    sql.prepare(`UPDATE users SET username = ? WHERE username = ?`).run(newUsername, userToEdit);
                                    sql.prepare(`UPDATE userAuth SET username = ? WHERE username = ?`).run(newUsername, userToEdit);
                                }
                                break;
                            }
                            case `bio`: {
                                if (value === ``)
                                    sql.prepare(`UPDATE users SET bio = ? WHERE username = ?`).run(`No bio yet.`, userToEdit);
                                else
                                    sql.prepare(`UPDATE users SET bio = ? WHERE username = ?`).run(`${ value }`, userToEdit);
                                break;
                            }
                            case `image`: {
                                if (value === ``)
                                    sql.prepare(`UPDATE users SET image = ? WHERE username = ?`).run(`${ https }://${ request.get(`host`) }/img/person.png`, userToEdit);
                                break;
                            }
                            case `displayName`: {
                                if (value === ``)
                                    sql.prepare(`UPDATE users SET displayName = ? WHERE username = ?`).run(`${ userToEdit }`, userToEdit);
                                else
                                    sql.prepare(`UPDATE users SET displayName = ? WHERE username = ?`).run(`${ value }`, userToEdit);
                                break;
                            }
                            case `links`: {
                                if (value === `` || value === `[]`)
                                    sql.prepare(`UPDATE users SET links = ? WHERE username = ?`).run(`[]`, userToEdit);
                                else
                                    sql.prepare(`UPDATE users SET links = ? WHERE username = ?`).run(`${ value }`, userToEdit);
                                break;
                            }
                            case `linkNames`: {
                                if (value === `` || value === `[]`)
                                    sql.prepare(`UPDATE users SET linkNames = ? WHERE username = ?`).run(`[]`, userToEdit);
                                else
                                    sql.prepare(`UPDATE users SET linkNames = ? WHERE username = ?`).run(`${ value }`, userToEdit);
                                break;
                            }
                            case `featuredContent`: {
                                if (currentUserInfo.paid === 1)
                                {
                                    if (value === ``)
                                        sql.prepare(`UPDATE users SET featuredContent = ? WHERE username = ?`).run(``, userToEdit);
                                    else
                                        sql.prepare(`UPDATE users SET featuredContent = ? WHERE username = ?`).run(`${ value }`, userToEdit);
                                }
                                break;
                            }
                            case `email`: {
                                if (value === ``)
                                    continue;
                                const newEmail = value;
                                const emailExists = sql.prepare(`SELECT * FROM userAuth WHERE email = ?`).get(newEmail);
                                if (!emailExists)
                                {
                                    if (stripeSecretKey && stripeProductID && stripeCustomerPortalURL && stripeWebhookSigningSecret)
                                    {
                                        const stripeCID = sql.prepare(`SELECT * FROM userAuth WHERE username = ?`).get(userToEdit).stripeCID;
                                        if (stripeCID)
                                        {
                                            await Stripe.customers.update(
                                                stripeCID,
                                                {
                                                    email: newEmail,
                                                }
                                            );
                                        }
                                    }
                                    sql.prepare(`UPDATE userAuth SET email = ? WHERE username = ?`).run(newEmail, userToEdit);
                                }
                                break;
                            }
                            case `ageGated`: {
                                if (value === true)
                                    sql.prepare(`UPDATE users SET ageGated = ? WHERE username = ?`).run(`1`, userToEdit);
                                else if (value === false)
                                    sql.prepare(`UPDATE users SET ageGated = ? WHERE username = ?`).run(`0`, userToEdit);
                                break;
                            }
                            default: {
                                break;
                            }
                        }
                    }
                    const oldData = request.body;
                    let auditEntry = oldData;
                    delete auditEntry.username;
                    // eslint-disable-next-line no-underscore-dangle
                    delete auditEntry._csrf;

                    if (auditEntry.ageGated === true && currentUserInfo.ageGated === `1`)
                        delete auditEntry.ageGated;
                    if (auditEntry.ageGated === false && currentUserInfo.ageGated === `0`)
                        delete auditEntry.ageGated;

                    if (auditEntry.links)
                        auditEntry.links = JSON.parse(auditEntry.links);
                    if (auditEntry.linkNames)
                        auditEntry.linkNames = JSON.parse(auditEntry.linkNames);

                    if (Object.keys(auditEntry).length > 0)
                    {
                        auditEntry = JSON.stringify(auditEntry, undefined, 4);
                        sendAuditLog(`|| ${ staffUsername } // ${ staffEmail } || modified user || ${ userToEdit } || with: \`\`\`json\n${ auditEntry }\n\`\`\``, discordWebhookURL);
                    }

                    response.redirect(`/staff`);
                    break;
                }
                case `verifyUser`: {
                    const verifiedLevel = sql.prepare(`SELECT * FROM users WHERE username = ?`).get(usernameToTakeActionOn).verified;
                    if (verifiedLevel === VER_STATUS.MEMBER)
                    {
                        sql.prepare(`UPDATE users SET verified = ? WHERE username = ?`).run(`${ VER_STATUS.VERIFIED_MEMBER }`, usernameToTakeActionOn);
                        sendAuditLog(`|| ${ staffUsername } // ${ staffEmail } || verified || ${ usernameToTakeActionOn } ||.`, discordWebhookURL);
                    }
                    else if (verifiedLevel === VER_STATUS.AWAITING_VERIFICATION)
                    {
                        sql.prepare(`DELETE FROM emailActivations WHERE username = ?`).run(usernameToTakeActionOn);
                        sql.prepare(`UPDATE users SET verified = ? WHERE username = ?`).run(`${ VER_STATUS.MEMBER }`, usernameToTakeActionOn);
                        sendAuditLog(`|| ${ staffUsername } // ${ staffEmail } || skipped email activation for || ${ usernameToTakeActionOn } ||.`, discordWebhookURL);
                    }
                    response.redirect(`/staff`);
                    break;
                }
                case `unverifyUser`: {
                    sql.prepare(`UPDATE users SET verified = ? WHERE username = ?`).run(`${ VER_STATUS.MEMBER }`, usernameToTakeActionOn);
                    sendAuditLog(`|| ${ staffUsername } // ${ staffEmail } || unverified || ${ usernameToTakeActionOn } ||.`, discordWebhookURL);
                    response.redirect(`/staff`);
                    break;
                }
                case `promoteUser`: {
                    sql.prepare(`UPDATE users SET verified = ? WHERE username = ?`).run(`${ VER_STATUS.STAFF_MEMBER }`, usernameToTakeActionOn);
                    sql.prepare(`UPDATE users SET paid = 1 WHERE username = ?`).run(usernameToTakeActionOn);
                    sql.prepare(`UPDATE users SET subExpires = ? WHERE username = ?`).run(`9999-01-01`, usernameToTakeActionOn);
                    sendAuditLog(`|| ${ staffUsername } // ${ staffEmail } || promoted || ${ usernameToTakeActionOn } || to Staff.`, discordWebhookURL);
                    response.redirect(`/staff`);
                    break;
                }
                case `demoteUser`: {
                    sql.prepare(`UPDATE users SET verified = ? WHERE username = ?`).run(`${ VER_STATUS.MEMBER }`, usernameToTakeActionOn);
                    sql.prepare(`UPDATE users SET paid = 0 WHERE username = ?`).run(usernameToTakeActionOn);
                    sql.prepare(`UPDATE users SET subExpires = ? WHERE username = ?`).run(``, usernameToTakeActionOn);
                    sendAuditLog(`|| ${ staffUsername } // ${ staffEmail } || demoted || ${ usernameToTakeActionOn } || from Staff.`, discordWebhookURL);
                    response.redirect(`/staff`);
                    break;
                }
                case `suspendUser`: {
                    sql.prepare(`UPDATE users SET verified = ? WHERE username = ?`).run(`${ VER_STATUS.SUSPENDED }`, usernameToTakeActionOn);
                    sendAuditLog(`|| ${ staffUsername } // ${ staffEmail } || suspended || ${ usernameToTakeActionOn } ||.`, discordWebhookURL);
                    response.redirect(`/staff`);
                    break;
                }
                case `unsuspendUser`: {
                    sql.prepare(`UPDATE users SET verified = ? WHERE username = ?`).run(`${ VER_STATUS.MEMBER }`, usernameToTakeActionOn);
                    sendAuditLog(`|| ${ staffUsername } // ${ staffEmail } || unsuspended || ${ usernameToTakeActionOn } ||.`, discordWebhookURL);
                    response.redirect(`/staff`);
                    break;
                }
                case `deleteUser`: {
                    if (stripeSecretKey && stripeProductID && stripeCustomerPortalURL && stripeWebhookSigningSecret)
                    {
                        const stripeCID = sql.prepare(`SELECT * FROM userAuth WHERE username = ?`).get(usernameToTakeActionOn).stripeCID;
                        if (stripeCID)
                            await Stripe.customers.del(stripeCID);
                    }
                    sql.prepare(`DELETE FROM users WHERE username = ?`).run(usernameToTakeActionOn);
                    sql.prepare(`DELETE FROM userAuth WHERE username = ?`).run(usernameToTakeActionOn);
                    sql.prepare(`DELETE FROM emailActivations WHERE username = ?`).run(usernameToTakeActionOn);
                    sql.prepare(`DELETE FROM passwordResets WHERE username = ?`).run(usernameToTakeActionOn);
                    sendAuditLog(`|| ${ staffUsername } // ${ staffEmail } || deleted || ${ usernameToTakeActionOn } ||'s account.`, discordWebhookURL);
                    response.redirect(`/staff`);
                    break;
                }
                case `extendUser`: {
                    const timeToExtendInMonths = request.body.months.toString();
                    const user = sql.prepare(`SELECT * FROM users WHERE username = ?`).get(usernameToTakeActionOn);
                    const subExpires = user.subExpires;
                    if (subExpires.startsWith(`9999`))
                        return response.redirect(`/staff`);
                    let newSubExpires;
                    if (timeToExtendInMonths === `-1`) // unlimited paid subscription
                    {
                        newSubExpires = `9999-01-01`;
                        sql.prepare(`UPDATE users SET subExpires = ? WHERE username = ?`).run(newSubExpires, usernameToTakeActionOn);
                    }
                    else
                    {
                        newSubExpires = subExpires === `` ? new Date() : new Date(subExpires);
                        newSubExpires.setMonth(newSubExpires.getMonth() + Number.parseInt(timeToExtendInMonths, 10));
                        newSubExpires = newSubExpires.toISOString().split(`T`)[0];
                        sql.prepare(`UPDATE users SET subExpires = ? WHERE username = ?`).run(newSubExpires, usernameToTakeActionOn);
                    }
                    sql.prepare(`UPDATE users SET paid = 1 WHERE username = ?`).run(usernameToTakeActionOn);
                    sendAuditLog(`|| ${ staffUsername } // ${ staffEmail } || extended || ${ usernameToTakeActionOn } ||'s subscription to ${ newSubExpires }.`, discordWebhookURL);
                    response.redirect(`/staff`);
                    break;
                }
                case `createShadowUser`: {
                    const username = request.body.username.toString();
                    const redirectTo = request.body.redirect.toString();

                    if (!username || !redirectTo)
                        return response.redirect(`/staff`);

                    const user = sql.prepare(`SELECT * FROM users WHERE username = ?`).get(username);
                    if (user)
                        return response.redirect(`/staff`);

                    sql.prepare(`INSERT INTO users (username, verified, paid, subExpires, lastUsernameChange, displayName, bio, image, links, linkNames, featuredContent, theme, advancedTheme, ageGated) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(username, `${ VER_STATUS.SHADOW_USER }`, `0`, ``, ``, redirectTo, ``, ``, `[]`, `[]`, ``, ``, ``, `0`);
                    sql.prepare(`INSERT INTO userAuth (username, password, email, stripeCID) VALUES (?, ?, ?, ?)`).run(username, ``, username, ``);
                    sendAuditLog(`|| ${ staffUsername } // ${ staffEmail } || created a new shadow user || ${ username } || which redirects to || ${ redirectTo } ||.`, discordWebhookURL);

                    response.redirect(`/staff`);
                    break;
                }
                default: {
                    response.redirect(`/staff`);
                    break;
                }
            }
        }
        catch
        {
            response.redirect(`/staff`);
        }
    });

    app.post(`/logout`, csrfProtection, (request, response, next) =>
    {
        logoutUser(request, response, next);
        return response.redirect(`/login`);
    });

    app.post(`/delete`, csrfProtection, async (request, response, next) =>
    {
        const userEmail = request.user;
        if (!userEmail)
            return response.redirect(`/login`);
        let username = sql.prepare(`SELECT * FROM userAuth WHERE email = ?`).get(userEmail);
        if (!username)
            return response.redirect(`/login`);
        username = username.username;

        const password = request.body.password.toString().trim();
        const usersHashedPassword = sql.prepare(`SELECT * FROM userAuth WHERE username = ?`).get(username).password;
        const isCorrectPassword = await bcrypt.compare(password, usersHashedPassword);
        if (isCorrectPassword)
        {
            if (stripeSecretKey && stripeProductID && stripeCustomerPortalURL && stripeWebhookSigningSecret)
            {
                const stripeCID = sql.prepare(`SELECT * FROM userAuth WHERE username = ?`).get(username).stripeCID;
                if (stripeCID)
                    await Stripe.customers.del(stripeCID);
            }
            sql.prepare(`DELETE FROM users WHERE username = ?`).run(username);
            sql.prepare(`DELETE FROM userAuth WHERE username = ?`).run(username);
            sql.prepare(`DELETE FROM emailActivations WHERE username = ?`).run(username);
            sql.prepare(`DELETE FROM passwordResets WHERE username = ?`).run(username);
            sendAuditLog(`|| ${ username } // ${ userEmail } || deleted their account.`, discordWebhookURL);
            logoutUser(request, response, next);
        }

        return response.redirect(`/login`);
    });

    app.get(`/tos`, (request, response) =>
    {
        response.render(`tos.ejs`, {
            projectName,
            projectDescription,
            ourImage: `${ https }://${ request.get(`host`) }/img/logo.png`,
        });
    });

    app.get(`/privacy`, (request, response) =>
    {
        response.render(`privacy.ejs`, {
            projectName,
            projectDescription,
            ourImage: `${ https }://${ request.get(`host`) }/img/logo.png`,
        });
    });

    app.post(`/img`, uploadImage, checkAuthenticated, (request, response) =>
    {
        const userEmail = request.user;
        const userUsername = sql.prepare(`SELECT * FROM userAuth WHERE email = ?`).get(userEmail).username;
        const isEmailVerified = sql.prepare(`SELECT * FROM users WHERE username = ?`).get(userUsername).verified;
        if (isEmailVerified === VER_STATUS.AWAITING_VERIFICATION)
            return response.redirect(`/edit?message=Please verify your email address before uploading an image.&type=error`);
        if (request.file)
            return response.json({ url: `${ https }://${ request.get(`host`) }/img/ugc/${ request.file.filename }` });
        return response.send(`Image upload failed.`);
    });

    // for every other route, get the URL and check if user exists
    app.get(`/*`, (request, response) =>
    {
        const potentialUser = request.url.replaceAll(`/`, ``).replaceAll(`@`, ``).replaceAll(`~`, ``);
        // If the URL is static content, serve it.
        const allowed = [
            `css`,
            `js`,
            `img`,
            `webfonts`
        ];
        if (allowed.includes(request.url))
        {
            if (request.url.endsWith(`/`)) // fixes request hanging if they try and go to `/css/` (for example)
                return response.redirect(`/`);
            return;
        }

        // If URL is not A-Z, 0-9, then bail.
        if (!/^[\da-z]+$/i.test(potentialUser))
        {
            response.status(404);
            return response.redirect(`/`);
        }

        const user = sql.prepare(`SELECT * FROM users WHERE username = ?`).get(potentialUser);
        if (user)
        {
            const username = user.username;
            const displayName = user.displayName;
            const bio = user.bio;
            const image = user.image;
            const links = JSON.parse(user.links);
            const linkNames = Buffer.from(user.linkNames).toString(`base64`);
            const featuredContent = user.featuredContent;
            const paid = Boolean(user.paid);
            const verified = user.verified;
            const theme = user.theme;
            const advancedTheme = user.advancedTheme;
            const ageGated = user.ageGated;

            if (verified === VER_STATUS.SUSPENDED || verified === VER_STATUS.AWAITING_VERIFICATION)
            {
                response.status(404);
                return response.redirect(`/`);
            }
            if (verified === VER_STATUS.SHADOW_USER)
            {
                response.status(302);
                return response.redirect(`/${ displayName }`);
            }

            let themeContent = ``;
            if (paid && advancedTheme.includes(`style`)) // If paid user & has custom CSS, use that.
                themeContent = advancedTheme;
            else if (!paid && advancedTheme.includes(`style`)) // If not paid user & has custom CSS, use default theme. (Sub expired)
                themeContent = `<link rel="stylesheet" href="css/theme-light.css">`;
            else // Everyone else gets the theme they chose.
                themeContent = `<link rel="stylesheet" href="css/theme-${ theme.toLowerCase() }.css">`;

            response.render(`profile.ejs`, {
                username, displayName, bio, image, links, linkNames, featuredContent, paid, verified, ourImage: `${ https }://${ request.get(`host`) }/img/logo.png`, themeContent, ageGated, projectName
            });
        }
        else
        { // user doesn't exist, bail
            response.status(404);
            return response.redirect(`/`);
        }
    });

    app.get(`*`, (request, response) =>
    {
        response.status(404);
        return response.redirect(`/`);
    });

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
}

await run();

/**
 * @name initSetup
 * @description Sets up config.json.
 */
async function initSetup()
{
    if (fs.existsSync(`./src/config.json`))
    {
        const rawConfig = fs.readFileSync(`./src/config.json`);
        const config = JSON.parse(rawConfig);
        const rawDefaultConfig = fs.readFileSync(`./src/config.json.example`);
        const defaultConfig = JSON.parse(rawDefaultConfig);
        for (const key in defaultConfig)
        { // If we already have a config, check and see if everything from defaultConfig is set.
            if (!(key in config))
                config[key] = defaultConfig[key];
        }
        for (const key in config)
        { // Clean Legacy Config Options. (If something in config is not in defaultConfig, remove it from config).
            if (!(key in defaultConfig))
                delete config[key];
        }
        fs.writeFileSync(`./src/config.json`, JSON.stringify(config, undefined, 4));
        return;
    }

    fs.copyFileSync(`./src/config.json.example`, `./src/config.json`);
    const config = require(`./config.json`);

    let sessionSecret = ``;
    const possible = `ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789`;
    for (let index = 0; index < 50; index++)
        sessionSecret += possible.charAt(Math.floor(Math.random() * possible.length));

    config.secret = sessionSecret;

    fs.writeFileSync(`./src/config.json`, JSON.stringify(config, undefined, 4));
}

/**
 * @name checkAuthenticated
 * @description Check if user is authenticated
 * @param {*} request Express request object
 * @param {*} response Express response object
 * @param {Function} next Express next function
 * @returns {void}
 */
function checkAuthenticated(request, response, next)
{
    if (request.isAuthenticated())
        return next();
    response.redirect(`/login`);
}

/**
 * @name checkAuthenticatedStaff
 * @description Check if user is Staff
 * @param {*} request Express request object
 * @param {*} response Express response object
 * @param {Function} next Express next function
 * @returns {void}
 */
function checkAuthenticatedStaff(request, response, next)
{
    try
    {
        const userEmail = request.user;
        let username = sql.prepare(`SELECT * FROM userAuth WHERE email = ?`).get(userEmail);
        if (!username)
        {
            logoutUser(request, response, next);
            return response.redirect(`/login`);
        }
        username = username.username;
        const userProfile = sql.prepare(`SELECT * FROM users WHERE username = ?`).get(username);
        if (request.isAuthenticated() && userProfile.verified === VER_STATUS.STAFF_MEMBER)
            return next();
        response.redirect(`/login`);
    }
    catch
    {
        response.redirect(`/login`);
    }
}

/**
 * @name checkNotAuthenticated
 * @description Check if user is not authenticated
 * @param {*} request Express request object
 * @param {*} response Express response object
 * @param {Function} next Express next function
 * @returns {void}
 */
function checkNotAuthenticated(request, response, next)
{
    if (request.isAuthenticated())
        return response.redirect(`/edit`);
    next();
}

/**
 * @name checkExpiredSubscriptions
 * @description Checks all paying users to see if their sub expired, and if so to reset them to free.
 */
function checkExpiredSubscriptions()
{
    const users = sql.prepare(`SELECT * FROM users WHERE paid = 1`).all();
    for (const user of users)
    {
        const subExpires = user.subExpires;
        if (subExpires.startsWith(`9999`))
            continue;
        const now = new Date();
        const subExpiresDate = new Date(subExpires);
        if (now > subExpiresDate)
        {
            sql.prepare(`UPDATE users SET paid = 0 WHERE username = ?`).run(user.username);
            sql.prepare(`UPDATE users SET subExpires = '' WHERE username = ?`).run(user.username);
        }
    }
}

/**
 * @name logoutUser
 * @description Logs out the user
 * @param {*} request Express request object
 * @param {*} response Express response object
 * @param {*} next Express next function
 */
function logoutUser(request, response, next)
{
    request.logout((error) =>
    {
        if (error)
            return next(error);
    });
}

/**
 * @name cleanUGC
 * @description Cleans up UGC that is no longer assigned to an account.
 */
function cleanUGC()
{
    const files = fs.readdirSync(`./src/public/img/ugc/`);
    for (const file of files)
    {
        if (file === `.gitkeep`)
            continue;

        const users = sql.prepare(`SELECT * FROM users`).all();
        const userImages = [];
        for (const user of users)
        {
            if (user.image && user.image.includes(`ugc/`))
                userImages.push(user.image.split(`/`)[5]);
        }
        if (!userImages.includes(file))
            fs.unlinkSync(`./src/public/img/ugc/${ file }`);
    }
}

/**
 * @name deleteExpiredTokens
 * @description Deletes expired email activation/password reset tokens.
 * @param {Stripe} Stripe Stripe API
 */
async function deleteExpiredTokens(Stripe)
{
    const emailTokens = sql.prepare(`SELECT * FROM emailActivations`).all();
    for (const token of emailTokens)
    {
        const now = new Date();
        const tokenExpires = new Date(token.expires);
        if (now > tokenExpires)
        {
            if (Stripe)
            {
                const stripeCID = sql.prepare(`SELECT * FROM userAuth WHERE username = ?`).get(token.username).stripeCID;
                if (stripeCID)
                    await Stripe.customers.del(stripeCID);
            }
            sql.prepare(`DELETE FROM emailActivations WHERE token = ?`).run(token.token);
            sql.prepare(`DELETE FROM users WHERE username = ?`).run(token.username);
            sql.prepare(`DELETE FROM userAuth WHERE username = ?`).run(token.username);
            sql.prepare(`DELETE FROM passwordResets WHERE username = ?`).run(token.username);
        }
    }

    const passwordTokens = sql.prepare(`SELECT * FROM passwordResets`).all();
    for (const token of passwordTokens)
    {
        const now = new Date();
        const tokenExpires = new Date(token.expires);
        if (now > tokenExpires)
            sql.prepare(`DELETE FROM passwordResets WHERE token = ?`).run(token.token);
    }
}

/**
 * @name sendAuditLog
 * @description Sends an audit log to the staff channel
 * @param {string} message Message to send
 * @param {string} discordWebhookURL Discord webhook URL
 */
async function sendAuditLog(message, discordWebhookURL)
{
    if (discordWebhookURL)
    {
        await fetch(discordWebhookURL, {
            method: `POST`,
            headers: {
                'Content-Type': `application/json`
            },
            body: JSON.stringify({
                content: message
            })
        });
    }
}

/**
 * @name escapeRegex
 * @description Escapes a string for use in a regex
 * @param {string} string String to escape
 * @returns { string } Escaped string
 */
function escapeRegex(string)
{
    // eslint-disable-next-line unicorn/better-regex
    return string.replace(/[/\-\\^$*+?.()|[\]{}]/g, `\\$&`);
}
