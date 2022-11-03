import express from 'express';
import SQLite from 'better-sqlite3';
import { createRequire } from "node:module";
import helmet from "helmet";
import bodyParser from "body-parser";

const require = createRequire(import.meta.url);
const sql = new SQLite(`./db.sqlite`);

/**
 * initial setup process and token validation
 */
async function run()
{
    const {
        port, secret
    } = require(`./config.json`);

    sql.prepare(`CREATE TABLE IF NOT EXISTS users (username TEXT PRIMARY KEY, verified INTEGER, paid INTEGER, subExpires TEXT, displayName TEXT, bio TEXT, image TEXT, links TEXT, linkNames TEXT)`).run();
    sql.prepare(`CREATE TABLE IF NOT EXISTS userAuth (uid INTEGER PRIMARY KEY, username TEXT, email TEXT, password TEXT)`).run();

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

    const initializePassport = require(`../passport-config.cjs`);
    initializePassport(
        passport,
        (email) => sql.prepare(`SELECT * FROM userAuth WHERE email = ?`).get(email).email,
        (id) => sql.prepare(`SELECT * FROM userAuth WHERE uid = ?`).get(id).uid
    );

    app.use(bodyParser.json());
    app.use(express.urlencoded({ extended: false }));
    app.use(flash());
    app.use(session({
        secret,
        resave: false,
        saveUninitialized: false
    }));
    app.use(passport.initialize());
    app.use(passport.session());
    app.use(methodOverride(`_method`));
    app.use(express.static(`./public`));
    app.use(express.static(`./views`));
    app.set(`views`, `./views`);
    app.set(`view engine`, `ejs`);

    // index.ejs
    app.get(`/`, (request, response) => response.render(`index.ejs`, {}));

    // login.ejs
    app.get(`/login`, checkNotAuthenticated, (request, response) => response.render(`login.ejs`, {}));

    app.post(`/login`, checkNotAuthenticated, passport.authenticate(`local`, {
        successRedirect: `/edit`,
        failureRedirect: `/login`,
        failureFlash: true
    }));

    // register.ejs
    app.get(`/register`, checkNotAuthenticated, (request, response) => response.render(`register.ejs`, {}));

    app.post(`/register`, checkNotAuthenticated, async (request, response) =>
    {
        try
        {
            // See if username exists already
            const username = request.body.username;
            const bannedUsernames = [
                `login`,
                `register`,
                `edit`,
                `staff`,
                `logout`,
                `css`,
                `js`,
            ];
            if (bannedUsernames.includes(username))
                return response.redirect(`/register`);

            // if username is not A-Z, a-z, 0-9, bail.
            const regex = /^[\dA-Za-z]+$/;
            if (!regex.test(username))
                return response.redirect(`/register`);

            const user = sql.prepare(`SELECT * FROM userAuth WHERE username = ?`).get(username);
            const email = request.body.email;
            const emailExists = sql.prepare(`SELECT * FROM userAuth WHERE email = ?`).get(email);
            if (user || emailExists) // Prevent duplicate usernames/emails
                return response.redirect(`/register`);
            const hashedPassword = await bcrypt.hash(request.body.password, 10);
            sql.prepare(`INSERT INTO userAuth (username, email, password) VALUES (?, ?, ?)`).run(request.body.username, request.body.email, hashedPassword);
            response.redirect(`/edit`);
        }
        catch
        {
            response.redirect(`/register`);
        }
    });

    // edit.ejs
    app.get(`/edit`, checkAuthenticated, (request, response) =>
    {
        const userEmail = request.user;
        const username = sql.prepare(`SELECT * FROM userAuth WHERE email = ?`).get(userEmail).username;

        response.render(`edit.ejs`, {
            username
        });
    });

    // staff.ejs
    app.get(`/staff`, checkAuthenticatedStaff, (request, response) => response.render(`staff.ejs`, {}));

    // logout
    app.delete(`/logout`, (request, response, next) =>
    {
        request.logout((error) =>
        {
            if (error)
                return next(error);
            response.redirect(`/login`);
        });
    });

    // for every other route, get the URL and check if user exists
    app.get(`/*`, (request, response) =>
    {
        const potentialUser = request.url.replace(`/`, ``);
        // If the URL is static content, serve it.
        const allowed = [
            `/favicon.ico`,
            `/css/`,
            `/js/`,
        ];
        if (allowed.includes(request.url)) return;

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
            const verified = Boolean(user.verified);

            response.render(`profile.ejs`, {
                username, displayName, bio, image, links, linkNames, paid, verified
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
        console.log(`ready on port ${ port }`);
    });
}

await run();

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
        const username = sql.prepare(`SELECT * FROM userAuth WHERE email = ?`).get(userEmail).username;
        const userProfile = sql.prepare(`SELECT * FROM users WHERE username = ?`).get(username);
        if (request.isAuthenticated() && userProfile.verified === 2)
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
        return response.redirect(`/`);
    next();
}
