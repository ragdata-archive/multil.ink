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
    const emailRegex = /[^\t\n\r @]+@[^\t\n\r @]+\.[^\t\n\r @]+/gm;
    // eslint-disable-next-line no-control-regex
    const ASCIIRegex = /^[\u0000-\u007F]*$/;
    const linkRegex = /https?:\/\/(www\.)?[\w#%+.:=@~-]{1,256}\.[\d()A-Za-z]{1,6}\b([\w!#%&()+./:=?@~-]*)/gm;

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
        `webhook`,
        `report`,
        `jane`, // used in example screenshots
        `john`, // used in example screenshots
        `jason`, // used in example screenshots
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

    sql.prepare(`CREATE TABLE IF NOT EXISTS users (username TEXT PRIMARY KEY, verified INTEGER, paid INTEGER, subExpires TEXT, lastUsernameChange TEXT, displayName TEXT, bio TEXT, image TEXT, links TEXT, linkNames TEXT, theme TEXT, advancedTheme TEXT, ageGated TEXT)`).run();
    sql.prepare(`CREATE TABLE IF NOT EXISTS userAuth (uid INTEGER PRIMARY KEY, username TEXT, email TEXT, password TEXT, stripeCID TEXT)`).run();
    sql.prepare(`CREATE TABLE IF NOT EXISTS emailActivations (email TEXT PRIMARY KEY, username TEXT, token TEXT, expires TEXT)`).run();
    sql.prepare(`CREATE TABLE IF NOT EXISTS passwordResets (email TEXT PRIMARY KEY, username TEXT, token TEXT, expires TEXT)`).run();

    const app = express();

    app.use(helmet(
        {
            crossOriginEmbedderPolicy: false,
            crossOriginResourcePolicy: false,
            contentSecurityPolicy: false,
        }
    ));

    const bcrypt = require(`bcrypt`);
    const passport = require(`passport`);
    const flash = require(`express-flash`);
    const session = require(`express-session`);
    const methodOverride = require(`method-override`);
    const nodemailer = require(`nodemailer`);
    const stripe = require(`stripe`);

    let Stripe;
    if (stripeSecretKey && stripeProductID && stripeCustomerPortalURL && stripeWebhookSigningSecret)
    {
        Stripe = stripe(stripeSecretKey, {
            apiVersion: `2022-08-01`
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

    app.use(`/webhook`, bodyParser.raw({ type: `application/json` }));
    app.use(bodyParser.json());
    app.use(express.urlencoded({ extended: true }));
    app.use(flash());
    app.use(session({
        secret,
        resave: false,
        saveUninitialized: false
    }));
    app.use(passport.initialize());
    app.use(passport.session());
    app.use(methodOverride(`_method`));
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

    app.get(`/`, (request, response) =>
    {
        response.render(`index.ejs`, {
            projectName, projectDescription, image: `${ https }://${ request.get(`host`) }/img/logo.png`, isLoggedIn: request.isAuthenticated()
        });
    });

    app.get(`/login`, checkNotAuthenticated, (request, response) =>
    {
        response.render(`login.ejs`, {
            projectName, projectDescription, image: `${ https }://${ request.get(`host`) }/img/logo.png`, hcaptchaSiteKey
        });
    });

    app.post(`/login`, checkNotAuthenticated, async (request, response, next) =>
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
    });

    app.get(`/register`, checkNotAuthenticated, (request, response) =>
    {
        response.render(`register.ejs`, {
            projectName, projectDescription, image: `${ https }://${ request.get(`host`) }/img/logo.png`, hcaptchaSiteKey
        });
    });

    app.post(`/register`, checkNotAuthenticated, async (request, response) =>
    {
        try
        {
            const verifyResults = await verify(hcaptchaSecret, request.body[`h-captcha-response`]);
            if (!verifyResults.success)
            {
                request.flash(`error`, `Please fill out the captcha.`);
                return response.redirect(`/register?message=Please fill out the captcha.&type=error`);
            }
            const username = request.body.username.toLowerCase().trim().slice(0, 60);
            if (bannedUsernames.has(username))
                return response.redirect(`/register?message=That username is not available.&type=error`);

            if (!usernameRegex.test(username))
                return response.redirect(`/register?message=That username is not available.&type=error`);

            const email = request.body.email.toLowerCase().trim().slice(0, 512);
            if (!emailRegex.test(email))
                return response.redirect(`/register?message=That email is not valid.&type=error`);

            const user = sql.prepare(`SELECT * FROM userAuth WHERE username = ?`).get(username);
            const emailExists = sql.prepare(`SELECT * FROM userAuth WHERE email = ?`).get(email);
            if (user || emailExists)
                return response.redirect(`/register?message=That username/email is already in use.&type=error`);
            const hashedPassword = await bcrypt.hash(request.body.password.trim().slice(0, 1024), 10);

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
            sql.prepare(`INSERT INTO users (username, verified, paid, subExpires, lastUsernameChange, displayName, bio, image, links, linkNames, theme, advancedTheme, ageGated) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(username, `-3`, `0`, ``, `${ new Date(Date.now()).toISOString().slice(0, 10) }`, username, `No bio yet.`, `${ https }://${ request.get(`host`) }/img/person.png`, `[]`, `[]`, `Light`, ``, `0`);

            // If this is the first user, make them staff.
            const userCount = sql.prepare(`SELECT COUNT(*) FROM userAuth`).get();
            if (userCount[`COUNT(*)`] === 1)
                sql.prepare(`UPDATE users SET paid = ?, subExpires = ?, verified = ? WHERE username = ?`).run(1, `9999-01-01`, `2`, username);

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

    app.get(`/upgrade`, checkAuthenticated, async (request, response, next) =>
    {
        const userData = sql.prepare(`SELECT * FROM userAuth WHERE email = ?`).get(request.user);
        if (!userData)
        {
            logoutUser(request, response, next);
            return response.redirect(`/login`);
        }

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
        response.redirect(`/edit`);
    });

    app.get(`/downgrade`, checkAuthenticated, async (request, response, next) =>
    {
        const userData = sql.prepare(`SELECT * FROM userAuth WHERE email = ?`).get(request.user);
        if (!userData)
        {
            logoutUser(request, response, next);
            return response.redirect(`/login`);
        }

        if (stripeSecretKey && stripeProductID && stripeCustomerPortalURL && stripeWebhookSigningSecret)
            return response.redirect(`${ stripeCustomerPortalURL }`);
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
                    sql.prepare(`UPDATE users SET paid = ?, subExpires = ? WHERE username = ?`).run(1, `${ timeNextYear.toISOString().slice(0, 10) }`, userData.username);

                    if (discordWebhookURL)
                    {
                        let paidCount = sql.prepare(`SELECT COUNT(*) FROM users WHERE paid = 1`).get()[`COUNT(*)`];
                        const staffCount = sql.prepare(`SELECT COUNT(*) FROM users WHERE verified = 2`).get()[`COUNT(*)`];
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
                    sendAuditLog(`|| ${ userAuthData.username } // ${ userAuthData.email } || has failed to pay their subscription.`, discordWebhookURL);
            }

            response.sendStatus(200);
        }
        else
            response.sendStatus(400);
    });

    app.get(`/verifyemail`, (request, response) =>
    {
        const queries = request.query;
        if (!queries.token)
            return response.redirect(`/edit?message=Invalid token.&type=error`);
        const token = queries.token.trim().slice(0, 32);
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
            sql.prepare(`UPDATE users SET verified = ? WHERE username = ?`).run(`0`, tokenData.username);
        sendAuditLog(`|| ${ user.username } // ${ tokenData.email } || activated their account.`, discordWebhookURL);
        return response.redirect(`/login?message=Email verified.&type=success`);
    });

    app.get(`/resendactivationemail`, checkAuthenticated, async (request, response, next) =>
    {
        const userEmail = request.user;
        const userData = sql.prepare(`SELECT * FROM userAuth WHERE email = ?`).get(userEmail);
        if (!userData)
        {
            logoutUser(request, response, next);
            return response.redirect(`/login`);
        }
        const user = sql.prepare(`SELECT * FROM users WHERE username = ?`).get(userData.username);
        if (user.verified !== -3)
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
    });

    app.get(`/forgotpassword`, (request, response) =>
    {
        response.render(`forgotpassword.ejs`, {
            projectName, projectDescription, image: `${ https }://${ request.get(`host`) }/img/logo.png`, hcaptchaSiteKey
        });
    });

    app.post(`/forgotpassword`, async (request, response) =>
    {
        const verifyResults = await verify(hcaptchaSecret, request.body[`h-captcha-response`]);
        if (!verifyResults.success)
        {
            request.flash(`error`, `Please fill out the captcha.`);
            return response.redirect(`/login?message=Please fill out the captcha.&type=error`);
        }
        const email = request.body.email;
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
    });

    app.get(`/resetpassword`, (request, response) =>
    {
        const queries = request.query;
        if (!queries.token)
            return response.redirect(`/forgotpassword?message=Invalid token.&type=error`);
        const token = queries.token.trim().slice(0, 32);
        const tokenData = sql.prepare(`SELECT * FROM passwordResets WHERE token = ?`).get(token);
        if (!tokenData)
            return response.redirect(`/forgotpassword?message=Invalid token.&type=error`);
        if (tokenData.expires < new Date(Date.now()).toISOString())
        {
            sql.prepare(`DELETE FROM passwordResets WHERE token = ?`).run(token);
            return response.redirect(`/forgotpassword?message=Token expired.&type=error`);
        }
        response.render(`resetpassword.ejs`, {
            projectName, projectDescription, image: `${ https }://${ request.get(`host`) }/img/logo.png`, hcaptchaSiteKey, token
        });
    });

    app.post(`/resetpassword`, async (request, response) =>
    {
        const verifyResults = await verify(hcaptchaSecret, request.body[`h-captcha-response`]);
        if (!verifyResults.success)
        {
            request.flash(`error`, `Please fill out the captcha.`);
            return response.redirect(`/login?message=Please fill out the captcha.&type=error`);
        }
        const token = request.body.token;
        if (!token)
            return response.redirect(`/forgotpassword?message=Invalid token.&type=error`);
        const tokenData = sql.prepare(`SELECT * FROM passwordResets WHERE token = ?`).get(token);
        if (!tokenData)
            return response.redirect(`/forgotpassword?message=Invalid token.&type=error`);
        if (tokenData.expires < new Date(Date.now()).toISOString())
        {
            sql.prepare(`DELETE FROM passwordResets WHERE token = ?`).run(token);
            return response.redirect(`/forgotpassword?message=Token expired.&type=error`);
        }
        const password = request.body.password;
        if (!password)
            return response.redirect(`/resetpassword?token=${ token }&message=Please enter a password.&type=error`);
        const confirmPassword = request.body.password2;
        if (password !== confirmPassword)
            return response.redirect(`/resetpassword?token=${ token }&message=Passwords do not match.&type=error`);
        const hash = await bcrypt.hash(password.slice(0, 128), 10);
        sql.prepare(`UPDATE userAuth SET password = ? WHERE email = ?`).run(hash, tokenData.email);
        sql.prepare(`DELETE FROM passwordResets WHERE token = ?`).run(token);
        sendAuditLog(`|| ${ tokenData.username } // ${ tokenData.email } || reset their password.`, discordWebhookURL);
        return response.redirect(`/login?message=Password reset.&type=success`);
    });

    app.get(`/report`, (request, response) =>
    {
        response.render(`report.ejs`, {
            projectName, projectDescription, image: `${ https }://${ request.get(`host`) }/img/logo.png`, hcaptchaSiteKey
        });
    });

    app.post(`/report`, async (request, response) =>
    {
        const verifyResults = await verify(hcaptchaSecret, request.body[`h-captcha-response`]);
        if (!verifyResults.success)
        {
            request.flash(`error`, `Please fill out the captcha.`);
            return response.redirect(`/report?message=Please fill out the captcha.&type=error`);
        }
        const email = request.body.email;
        const fullName = request.body.fullName;
        const message = request.body.message;
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
    });

    app.get(`/edit`, checkAuthenticated, (request, response, next) =>
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

        response.render(`edit.ejs`, {
            username: user.username,
            displayName: user.displayName,
            bio: user.bio,
            image: user.image,
            links: JSON.parse(user.links),
            linkNames: JSON.parse(user.linkNames),
            paid: Boolean(user.paid),
            subExpires: user.subExpires,
            verified: user.verified,
            ourImage: `${ https }://${ request.get(`host`) }/img/logo.png`,
            theme: user.theme,
            advancedTheme,
            themes,
            backgroundColor,
            textColor,
            borderColor,
            ageGated: (user.ageGated === `1` ? `checked` : ``),
            projectName
        });
    });

    app.post(`/edit`, checkAuthenticated, async (request, response, next) =>
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
            const isStaffMember = Boolean(sql.prepare(`SELECT * FROM users WHERE username = ?`).get(username).verified === VER_STATUS.STAFF_MEMBER);
            const isSuspended = Boolean(sql.prepare(`SELECT * FROM users WHERE username = ?`).get(username).verified === VER_STATUS.SUSPENDED);
            const isNotEmailVerified = Boolean(sql.prepare(`SELECT * FROM users WHERE username = ?`).get(username).verified === VER_STATUS.AWAITING_VERIFICATION);

            if (isSuspended || isNotEmailVerified)
                return response.redirect(`/`);

            let ageGated = request.body.adultContent;
            ageGated = ageGated === `` ? `1` : `0`;

            let updatedDisplayName = request.body.displayName.trim().slice(0, 60);
            let updatedBio = request.body.bio.trim().slice(0, 280);
            let updatedImage = request.body.image.trim();
            let theme = request.body.theme.trim();
            let advancedTheme = request.body.finalCSS.trim();
            advancedTheme = advancedTheme.replace(/ {2}/g, ` `);

            if ((!themes.includes(theme) || theme !== `Custom`) && (!isPaidUser && theme === `Custom`))
                theme = `Light`;

            if (theme !== `Custom`)
                advancedTheme = ``;

            if (!advancedTheme.startsWith(`<style>`) || !advancedTheme.endsWith(`</style>`))
            {
                advancedTheme = ``; // If the user somehow manages to bypass the client-side check, this will prevent them from injecting shit into <head> of their profile.
                theme = `Light`;
            }

            if (!ASCIIRegex.test(updatedDisplayName) || updatedDisplayName.length > 60)
                updatedDisplayName = username;

            if (!ASCIIRegex.test(updatedBio) || updatedBio.length > 280)
                updatedBio = `No bio yet.`;

            // eslint-disable-next-line no-useless-escape
            const regexForURL = new RegExp(`/^(http|https):\/\/${ request.get(`host)`) }\/img\/ugc\/(.*)/`);
            if (!regexForURL.test(updatedImage))
                updatedImage = `${ https }://${ request.get(`host`) }/img/person.png`;

            let updatedLinks = [];
            let updatedLinkNames = [];
            for (let index = 0; index < 50; index++)
            {
                if (request.body[`link${ index }`] && request.body[`linkName${ index }`])
                {
                    let link = request.body[`link${ index }`].trim();
                    const linkName = request.body[`linkName${ index }`].trim();
                    if (!link.startsWith(`http://`) && !link.startsWith(`https://`))
                        link = `https://${ link }`;

                    if (linkRegex.test(link) && link && linkName && !updatedLinks.includes(link))
                    {
                        let allowed = false;
                        if (linkWhitelist)
                        {
                            let domain = link.split(`//`)[1].split(`/`)[0];
                            if (domain.startsWith(`www.`))
                                domain = domain.slice(4);
                            if (!freeLinks.includes(domain) && !isPaidUser && !isStaffMember) // If free user & link is not in free list, skip.
                            {
                                allowed = false;
                                continue;
                            }
                            else
                                allowed = true;
                        }

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
            sql.prepare(`UPDATE users SET displayName = ?, bio = ?, image = ?, links = ?, linkNames = ?, theme = ?, advancedTheme = ?, ageGated = ? WHERE username = ?`).run(updatedDisplayName, updatedBio, updatedImage, updatedLinks, updatedLinkNames, theme, advancedTheme, ageGated, username);
            let newProfileInfo = request.body;

            delete newProfileInfo.finalCSS;
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
            if (updatedLinks !== currentUserInfo.links)
                newProfileInfo.links = JSON.parse(updatedLinks);
            if (updatedLinkNames !== currentUserInfo.linkNames)
                newProfileInfo.linkNames = JSON.parse(updatedLinkNames);

            for (let index = 0; index < 50; index++)
            {
                if (newProfileInfo[`link${ index }`])
                    delete newProfileInfo[`link${ index }`];
                if (newProfileInfo[`linkName${ index }`])
                    delete newProfileInfo[`linkName${ index }`];
            }
            newProfileInfo.ageGated = ageGated;
            if (newProfileInfo.ageGated === `1` && currentUserInfo.ageGated === `1`)
                delete newProfileInfo.ageGated;
            if (newProfileInfo.ageGated === `0` && currentUserInfo.ageGated === `0`)
                delete newProfileInfo.ageGated;
            delete newProfileInfo.adultContent;

            if (Object.keys(newProfileInfo).length > 0)
            {
                newProfileInfo = JSON.stringify(newProfileInfo, undefined, 4);
                sendAuditLog(`|| ${ username } // ${ userEmail } || updated their profile with: \`\`\`json\n${ newProfileInfo }\n\`\`\``, discordWebhookURL);
            }

            response.redirect(`/edit`);
        }
        catch
        {
            response.redirect(`/edit?message=An error occurred.&type=error`);
        }
    });

    app.post(`/edit/*`, checkAuthenticated, async (request, response, next) =>
    {
        const usersCurrentEmail = request.user;
        let userUsername = sql.prepare(`SELECT * FROM userAuth WHERE email = ?`).get(usersCurrentEmail);
        if (!userUsername)
        {
            logoutUser(request, response, next);
            return response.redirect(`/login?message=An error occurred.&type=error`);
        }
        userUsername = userUsername.username;
        const actionToTake = request.params[0];

        switch (actionToTake)
        {
            case `changeEmail`: {
                const oldEmailInput = request.body.oldEmail.toLowerCase().trim();
                const newEmail = request.body.newEmail.toLowerCase().trim();
                const password = request.body.password.trim();
                const usersHashedPassword = sql.prepare(`SELECT * FROM userAuth WHERE username = ?`).get(userUsername).password;
                const isCorrectPassword = await bcrypt.compare(password, usersHashedPassword);

                if ((oldEmailInput === usersCurrentEmail)
                    && isCorrectPassword && newEmail && newEmail.length > 0 && newEmail.length <= 512
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
                const oldPassword = request.body.oldPassword.trim();
                const newPassword = request.body.newPassword.trim();
                const usersHashedPassword = sql.prepare(`SELECT * FROM userAuth WHERE username = ?`).get(userUsername).password;
                const isCorrectPassword = await bcrypt.compare(oldPassword, usersHashedPassword);

                if (isCorrectPassword && newPassword && newPassword.length > 0 && newPassword.length < 1024)
                {
                    const hashedPassword = await bcrypt.hash(newPassword, 10);
                    sql.prepare(`UPDATE userAuth SET password = ? WHERE username = ?`).run(hashedPassword, userUsername);
                    sendAuditLog(`|| ${ userUsername } // ${ usersCurrentEmail } || changed their password.`, discordWebhookURL);
                }
                response.redirect(`/edit`);
                break;
            }
            case `changeUsername`: {
                const newUsername = request.body.username.trim().toLowerCase().slice(0, 60);
                const password = request.body.password.trim();
                const usersHashedPassword = sql.prepare(`SELECT * FROM userAuth WHERE username = ?`).get(userUsername).password;
                const isCorrectPassword = await bcrypt.compare(password, usersHashedPassword);

                if (isCorrectPassword
                    && newUsername && newUsername.length > 0 && newUsername.length < 60
                    && usernameRegex.test(newUsername))
                {
                    const usernameExists = sql.prepare(`SELECT * FROM userAuth WHERE username = ?`).get(newUsername);
                    if (!usernameExists)
                    {
                        let lastChangeDate = sql.prepare(`SELECT * FROM users WHERE username = ?`).get(userUsername).lastUsernameChange;
                        const isPaidUser = Boolean(sql.prepare(`SELECT * FROM users WHERE username = ?`).get(userUsername).paid);
                        if (!lastChangeDate || lastChangeDate === null || lastChangeDate === ``)
                            lastChangeDate = 0;
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
    });

    app.get(`/staff`, checkAuthenticatedStaff, (request, response, next) =>
    {
        const ourImage = `${ https }://${ request.get(`host`) }/img/logo.png`;
        let myUsername = request.user;
        myUsername = sql.prepare(`SELECT * FROM userAuth WHERE email = ?`).get(myUsername);
        if (!myUsername)
        {
            logoutUser(request, response, next);
            return response.redirect(`/login`);
        }
        myUsername = myUsername.username;
        if (!request.query.page && !request.query.search)
            return response.redirect(`/staff?page=1`);
        const pageNumber = request.query.page || 1;
        const usersPerPage = 100;
        // select users from database that are in the page number*100
        let allUsers = sql.prepare(`SELECT * FROM users LIMIT ? OFFSET ?`).all(usersPerPage, (pageNumber - 1) * usersPerPage);
        let allUserAuth = sql.prepare(`SELECT * FROM userAuth LIMIT ? OFFSET ?`).all(usersPerPage, (pageNumber - 1) * usersPerPage);

        let userCountTotal = sql.prepare(`SELECT COUNT(*) FROM users`).get()[`COUNT(*)`];
        const verifiedCount = sql.prepare(`SELECT COUNT(*) FROM users WHERE verified = 1`).get()[`COUNT(*)`];
        let paidCount = sql.prepare(`SELECT COUNT(*) FROM users WHERE paid = 1`).get()[`COUNT(*)`];
        const suspendedCount = sql.prepare(`SELECT COUNT(*) FROM users WHERE verified = -1`).get()[`COUNT(*)`];
        const staffCount = sql.prepare(`SELECT COUNT(*) FROM users WHERE verified = 2`).get()[`COUNT(*)`];
        const shadowUserCount = sql.prepare(`SELECT COUNT(*) FROM users WHERE verified = -2`).get()[`COUNT(*)`];
        const awaitingEmailUserCount = sql.prepare(`SELECT COUNT(*) FROM users WHERE verified = -3`).get()[`COUNT(*)`];

        let freeCount = userCountTotal - paidCount - staffCount - shadowUserCount;
        if (freeCount < 0)
            freeCount = 0;

        userCountTotal -= shadowUserCount;
        paidCount -= staffCount;

        const search = request.query.search || ``;
        if (search)
        {
            allUsers = sql.prepare(`SELECT * FROM users WHERE username LIKE ?`).all(`%${ search }%`);
            allUserAuth = sql.prepare(`SELECT * FROM userAuth WHERE username LIKE ?`).all(`%${ search }%`);
        }

        if (allUsers.length === 0)
            return response.redirect(`/staff?page=1`);

        const userCount = allUsers.length;
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

        for (const [index, allUser] of allUsers.entries())
        {
            usernames.push(allUser.username);
            emails.push(allUserAuth[index].email);
            verified.push(allUser.verified);
            paid.push(allUser.paid);
            let subExpire = allUser.subExpires;
            if (subExpire === ``)
                subExpire = `n/a`;
            subExpires.push(subExpire);
            displayNames.push(allUser.displayName);
            bios.push(allUser.bio);
            images.push(allUser.image);
            let linkData = JSON.stringify(allUser.links);
            linkData = Buffer.from(linkData).toString(`base64`);
            links.push(linkData);
            let linkNameData = JSON.stringify(allUser.linkNames);
            linkNameData = Buffer.from(linkNameData).toString(`base64`);
            linkNames.push(linkNameData);
            ageGated.push(allUser.ageGated);
        }
        const numberOfUsers = userCount;

        response.render(`staff.ejs`, {
            numberOfUsers,
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
            ageGated,
            userCountTotal,
            verifiedCount,
            paidCount,
            suspendedCount,
            staffCount,
            freeCount,
            shadowUserCount,
            awaitingEmailUserCount,
            projectName,
            ourImage
        });
    });

    app.post(`/staff/*`, checkAuthenticatedStaff, async (request, response, next) =>
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
        const usernameToTakeActionOn = request.body.username;

        if (usernameToTakeActionOn === staffUsername)
            return response.redirect(`/staff`);

        switch (actionToTake)
        {
            case `editUser`: {
                const userToEdit = request.body.username;

                const currentUserInfo = sql.prepare(`SELECT * FROM users WHERE username = ?`).get(usernameToTakeActionOn);
                for (const [key, value] of Object.entries(request.body))
                {
                    if (key === `username`)
                        continue;
                    else if (key === `newUsername`)
                    {
                        if (value === ``)
                            continue;
                        const newUsername = value.trim().toLowerCase().slice(0, 60);
                        const usernameExists = sql.prepare(`SELECT * FROM userAuth WHERE username = ?`).get(newUsername);
                        if (!usernameExists && !bannedUsernames.has(newUsername))
                        {
                            sql.prepare(`UPDATE users SET username = ? WHERE username = ?`).run(newUsername, userToEdit);
                            sql.prepare(`UPDATE userAuth SET username = ? WHERE username = ?`).run(newUsername, userToEdit);
                        }
                    }
                    else if (key === `bio` && value === ``)
                        sql.prepare(`UPDATE users SET bio = ? WHERE username = ?`).run(`No bio yet.`, userToEdit);
                    else if (key === `image` && value === ``)
                        sql.prepare(`UPDATE users SET image = ? WHERE username = ?`).run(`${ https }://${ request.get(`host`) }/img/person.png`, userToEdit);
                    else if (key === `displayName` && value === ``)
                        continue;
                    else if ((key === `links` && value === ``) || (key === `linkNames` && value === ``))
                    {
                        sql.prepare(`UPDATE users SET links = ? WHERE username = ?`).run(`[]`, userToEdit);
                        sql.prepare(`UPDATE users SET linkNames = ? WHERE username = ?`).run(`[]`, userToEdit);
                    }
                    else if (key === `email`)
                    {
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
                    }
                    else if (key === `ageGated`)
                    {
                        if (value === true)
                            sql.prepare(`UPDATE users SET ageGated = ? WHERE username = ?`).run(`1`, userToEdit);
                        else if (value === false)
                            sql.prepare(`UPDATE users SET ageGated = ? WHERE username = ?`).run(`0`, userToEdit);
                    }
                    else
                        sql.prepare(`UPDATE users SET ${ key } = ? WHERE username = ?`).run(value, userToEdit);
                }
                const oldData = request.body;
                let auditEntry = oldData;
                delete auditEntry.username;

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
                if (verifiedLevel === 0)
                {
                    sql.prepare(`UPDATE users SET verified = 1 WHERE username = ?`).run(usernameToTakeActionOn);
                    sendAuditLog(`|| ${ staffUsername } // ${ staffEmail } || verified || ${ usernameToTakeActionOn } ||.`, discordWebhookURL);
                }
                else if (verifiedLevel === -3)
                {
                    sql.prepare(`DELETE FROM emailActivations WHERE username = ?`).run(usernameToTakeActionOn);
                    sql.prepare(`UPDATE users SET verified = 0 WHERE username = ?`).run(usernameToTakeActionOn);
                    sendAuditLog(`|| ${ staffUsername } // ${ staffEmail } || skipped email activation for || ${ usernameToTakeActionOn } ||.`, discordWebhookURL);
                }
                response.redirect(`/staff`);
                break;
            }
            case `unverifyUser`: {
                sql.prepare(`UPDATE users SET verified = 0 WHERE username = ?`).run(usernameToTakeActionOn);
                sendAuditLog(`|| ${ staffUsername } // ${ staffEmail } || unverified || ${ usernameToTakeActionOn } ||.`, discordWebhookURL);
                response.redirect(`/staff`);
                break;
            }
            case `promoteUser`: {
                sql.prepare(`UPDATE users SET verified = 2 WHERE username = ?`).run(usernameToTakeActionOn);
                sql.prepare(`UPDATE users SET paid = 1 WHERE username = ?`).run(usernameToTakeActionOn);
                sql.prepare(`UPDATE users SET subExpires = ? WHERE username = ?`).run(`9999-01-01`, usernameToTakeActionOn);
                sendAuditLog(`|| ${ staffUsername } // ${ staffEmail } || promoted || ${ usernameToTakeActionOn } || to Staff.`, discordWebhookURL);
                response.redirect(`/staff`);
                break;
            }
            case `demoteUser`: {
                sql.prepare(`UPDATE users SET verified = 0 WHERE username = ?`).run(usernameToTakeActionOn);
                sql.prepare(`UPDATE users SET paid = 0 WHERE username = ?`).run(usernameToTakeActionOn);
                sql.prepare(`UPDATE users SET subExpires = ? WHERE username = ?`).run(``, usernameToTakeActionOn);
                sendAuditLog(`|| ${ staffUsername } // ${ staffEmail } || demoted || ${ usernameToTakeActionOn } || from Staff.`, discordWebhookURL);
                response.redirect(`/staff`);
                break;
            }
            case `suspendUser`: {
                sql.prepare(`UPDATE users SET verified = -1 WHERE username = ?`).run(usernameToTakeActionOn);
                sendAuditLog(`|| ${ staffUsername } // ${ staffEmail } || suspended || ${ usernameToTakeActionOn } ||.`, discordWebhookURL);
                response.redirect(`/staff`);
                break;
            }
            case `unsuspendUser`: {
                sql.prepare(`UPDATE users SET verified = 0 WHERE username = ?`).run(usernameToTakeActionOn);
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
                const timeToExtendInMonths = request.body.months;
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
                const username = request.body.username;
                const redirectTo = request.body.redirect;

                if (!username || !redirectTo)
                    return response.redirect(`/staff`);

                const user = sql.prepare(`SELECT * FROM users WHERE username = ?`).get(username);
                if (user)
                    return response.redirect(`/staff`);

                sql.prepare(`INSERT INTO users (username, displayName, bio, image, links, linkNames, verified, paid, subExpires, theme, advancedTheme, ageGated) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(username, redirectTo, ``, ``, `[]`, `[]`, `-2`, `0`, ``, ``, ``, `0`);
                sql.prepare(`INSERT INTO userAuth (username, password, email, stripeCID) VALUES (?, ?, ?, ?)`).run(username, ``, ``, ``);
                sendAuditLog(`|| ${ staffUsername } // ${ staffEmail } || created a new shadow user || ${ username } || which redirects to || ${ redirectTo } ||.`, discordWebhookURL);

                response.redirect(`/staff`);
                break;
            }
            default: {
                response.redirect(`/staff`);
                break;
            }
        }
    });

    app.delete(`/logout`, (request, response, next) =>
    {
        logoutUser(request, response, next);
        return response.redirect(`/login`);
    });

    app.post(`/delete`, async (request, response, next) =>
    {
        const userEmail = request.user;
        if (!userEmail)
            return response.redirect(`/login`);
        let username = sql.prepare(`SELECT * FROM userAuth WHERE email = ?`).get(userEmail);
        if (!username)
            return response.redirect(`/login`);
        username = username.username;

        const password = request.body.password.trim();
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
            projectName, projectDescription, ourImage: `${ https }://${ request.get(`host`) }/img/logo.png`
        });
    });

    app.get(`/privacy`, (request, response) =>
    {
        response.render(`privacy.ejs`, {
            projectName, projectDescription, ourImage: `${ https }://${ request.get(`host`) }/img/logo.png`
        });
    });

    app.post(`/img`, uploadImage, checkAuthenticated, (request, response) =>
    {
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
            const linkNames = JSON.parse(user.linkNames);
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
                username, displayName, bio, image, links, linkNames, paid, verified, ourImage: `${ https }://${ request.get(`host`) }/img/logo.png`, themeContent, ageGated, projectName
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

    app.post(`*`, (request, response) =>
    {
        response.status(404);
        return response.redirect(`/`);
    });

    app.delete(`*`, (request, response) =>
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
