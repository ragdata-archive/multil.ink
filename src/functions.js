import SQLite from 'better-sqlite3';
import bcrypt from 'bcrypt';
import { createRequire } from "node:module";
import fs from 'node:fs';
import { Strategy as LocalStrategy } from 'passport-local';

const require = createRequire(import.meta.url);
const sql = new SQLite(`./src/db.sqlite`);

export const VER_STATUS = {
    STAFF_MEMBER: 2,
    VERIFIED_MEMBER: 1,
    MEMBER: 0,
    SUSPENDED: -1,
    SHADOW_USER: -2,
    AWAITING_VERIFICATION: -3
};

/**
 * @name initializePassport
 * @description Initialize passport
 * @param {*} passport Passport.js Object
 * @param {string} getUserByEmail Email of the user
 */
export function initializePassport(passport, getUserByEmail)
{
    const authenticateUser = async (email, password, done) =>
    {
        let user = getUserByEmail(email);
        if (user === undefined)
            return done(undefined, false, { message: `Email/Password incorrect.` });

        try
        {
            user = user.email;
            const userPassword = await sql.prepare(`SELECT * FROM userAuth WHERE email = ?`).get(email).password;
            if (await bcrypt.compare(password, userPassword))
                return done(undefined, user);
            return done(undefined, false, { message: `Email/Password incorrect.` });
        }
        catch (error)
        {
            return done(error);
        }
    };

    passport.use(new LocalStrategy({ usernameField: `email` }, authenticateUser));

    passport.serializeUser((user, done) =>
    {
        done(undefined, user);
    });

    passport.deserializeUser((user, done) =>
    {
        done(undefined, user);
    });
}

/**
 * @name initSetup
 * @description Sets up config.json.
 */
export async function initSetup()
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
export function checkAuthenticated(request, response, next)
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
export function checkAuthenticatedStaff(request, response, next)
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
export function checkNotAuthenticated(request, response, next)
{
    if (request.isAuthenticated())
        return response.redirect(`/edit`);
    next();
}

/**
 * @name checkExpiredSubscriptions
 * @description Checks all paying users to see if their sub expired, and if so to reset them to free.
 */
export function checkExpiredSubscriptions()
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
export function logoutUser(request, response, next)
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
export function cleanUGC()
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
export async function deleteExpiredTokens(Stripe)
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
export async function sendAuditLog(message, discordWebhookURL)
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
export function escapeRegex(string)
{
    // eslint-disable-next-line unicorn/better-regex
    return string.replace(/[/\-\\^$*+?.()|[\]{}]/g, `\\$&`);
}
