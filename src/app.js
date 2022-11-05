import express from 'express';
import SQLite from 'better-sqlite3';
import { createRequire } from "node:module";
import helmet from "helmet";
import bodyParser from "body-parser";
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// const __filename = fileURLToPath(import.meta.url);
// eslint-disable-next-line no-underscore-dangle
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const require = createRequire(import.meta.url);
const sql = new SQLite(`./db.sqlite`);

/**
 * initial setup process and token validation
 */
async function run()
{
    const {
        port, secret, linkWhitelist, freeLinks
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
        (email) => sql.prepare(`SELECT * FROM userAuth WHERE email = ?`).get(email),
        (id) => sql.prepare(`SELECT * FROM userAuth WHERE uid = ?`).get(id)
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
    // hotload jquery & bootstrap
    const projectRoot = path.join(__dirname, `..`);
    app.use(`/css`, express.static(path.join(projectRoot, `node_modules/bootstrap/dist/css`)));
    app.use(`/js`, express.static(path.join(projectRoot, `node_modules/bootstrap/dist/js`)));
    app.use(`/js`, express.static(path.join(projectRoot, `node_modules/jquery/dist`)));
    app.set(`views`, `./views`);
    app.set(`view engine`, `ejs`);

    // index.ejs
    app.get(`/`, (request, response) =>
    {
        // TODO show staff portal on homepage nav if staff
        response.render(`index.ejs`);
    });

    // login.ejs
    app.get(`/login`, checkNotAuthenticated, (request, response) => response.render(`login.ejs`, {}));

    app.post(`/login`, checkNotAuthenticated, passport.authenticate(`local`, {
        successRedirect: `/edit`,
        failureRedirect: `/login`,
        failureFlash: true
    }));

    // register.ejs
    app.get(`/register`, checkNotAuthenticated, (request, response) =>
    {
        response.render(`register.ejs`);
    });

    app.post(`/register`, checkNotAuthenticated, async (request, response) =>
    {
        try
        {
            // See if username exists already
            const username = request.body.username.toLowerCase().trim().slice(0, 30);
            const bannedUsernames = [
                `login`,
                `register`,
                `edit`,
                `delete`,
                `staff`,
                `logout`,
                `css`,
                `js`,
                `img`,
            ];
            if (bannedUsernames.includes(username))
                return response.redirect(`/register`);

            // if username is not A-Z, a-z, 0-9, bail.
            const regex = /^[\dA-Za-z]+$/;
            if (!regex.test(username))
                return response.redirect(`/register`);

            // If email is not valid, bail.
            const email = request.body.email.toLowerCase().trim();
            const regexEmail = /[^\t\n\r @]+@[^\t\n\r @]+\.[^\t\n\r @]+/gm;
            if (!regexEmail.test(email))
                return response.redirect(`/register`);

            const user = sql.prepare(`SELECT * FROM userAuth WHERE username = ?`).get(username);
            const emailExists = sql.prepare(`SELECT * FROM userAuth WHERE email = ?`).get(email);
            if (user || emailExists) // Prevent duplicate usernames/emails
                return response.redirect(`/register`);
            const hashedPassword = await bcrypt.hash(request.body.password.trim().slice(0, 128), 10);
            sql.prepare(`INSERT INTO userAuth (username, email, password) VALUES (?, ?, ?)`).run(username, email, hashedPassword);
            sql.prepare(`INSERT INTO users (username, verified, paid, subExpires, displayName, bio, image, links, linkNames) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(username, 0, 0, ``, username, `No bio yet.`, `${ request.protocol }://${ request.get(`host`) }/img/person.png`, `[]`, `[]`);
            response.redirect(`/edit`);
        }
        catch
        {
            response.redirect(`/register`);
        }
    });

    // edit.ejs
    app.get(`/edit`, checkAuthenticated, (request, response, next) =>
    {
        const userEmail = request.user;
        let username = sql.prepare(`SELECT * FROM userAuth WHERE email = ?`).get(userEmail);
        if (!username)
        {
            logoutUser(request, response, next);
            return response.redirect(`/login`);
        }
        username = username.username;
        const user = sql.prepare(`SELECT * FROM users WHERE username = ?`).get(username);
        const displayName = user.displayName;
        const bio = user.bio;
        const image = user.image;
        const links = JSON.parse(user.links);
        const linkNames = JSON.parse(user.linkNames);
        const paid = Boolean(user.paid);
        const subExpires = user.subExpires;
        let verified = user.verified;

        if (verified === -1)
        {
            // Suspended
            return response.redirect(`/`);
        }
        verified = Boolean(verified);

        response.render(`edit.ejs`, {
            username, displayName, bio, image, links, linkNames, paid, subExpires, verified
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
                return response.redirect(`/login`);
            }
            username = username.username;
            const isPaidUser = Boolean(sql.prepare(`SELECT * FROM users WHERE username = ?`).get(username).paid);
            const isStaffMember = Boolean(sql.prepare(`SELECT * FROM users WHERE username = ?`).get(username).verified === 2);
            const isSuspended = Boolean(sql.prepare(`SELECT * FROM users WHERE username = ?`).get(username).verified === -1);

            if (isSuspended)
                return response.redirect(`/`);

            const updatedDisplayName = request.body.displayName.trim().slice(0, 30);
            const updatedBio = request.body.bio.trim().slice(0, 140);
            const updatedImage = request.body.image.trim();

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

                    if (link && linkName && !updatedLinks.includes(link))
                    {
                        let allowed = false;
                        if (linkWhitelist)
                        {
                            // if end of domain in link is in the whitelist freeLinks, then allow it.
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
            sql.prepare(`UPDATE users SET displayName = ?, bio = ?, image = ?, links = ?, linkNames = ? WHERE username = ?`).run(updatedDisplayName, updatedBio, updatedImage, updatedLinks, updatedLinkNames, username);

            response.redirect(`/edit`);
        }
        catch
        {
            response.redirect(`/edit`);
        }
    });

    // staff.ejs
    app.get(`/staff`, checkAuthenticatedStaff, (request, response, next) =>
    {
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

        const userCountTotal = sql.prepare(`SELECT COUNT(*) FROM users`).get()[`COUNT(*)`];
        const verifiedCount = sql.prepare(`SELECT COUNT(*) FROM users WHERE verified = 1`).get()[`COUNT(*)`];
        const paidCount = sql.prepare(`SELECT COUNT(*) FROM users WHERE paid = 1`).get()[`COUNT(*)`];
        const suspendedCount = sql.prepare(`SELECT COUNT(*) FROM users WHERE verified = -1`).get()[`COUNT(*)`];
        const staffCount = sql.prepare(`SELECT COUNT(*) FROM users WHERE verified = 2`).get()[`COUNT(*)`];
        const freeCount = userCountTotal - paidCount - staffCount;

        const search = request.query.search || ``;
        if (search)
        {
            allUsers = sql.prepare(`SELECT * FROM users WHERE username LIKE ?`).all(`%${ search }%`);
            allUserAuth = sql.prepare(`SELECT * FROM userAuth WHERE username LIKE ?`).all(`%${ search }%`);
        }

        if (allUsers.length === 0)
            return response.redirect(`/staff?page=1`);

        // const allUsers = sql.prepare(`SELECT * FROM users`).all();
        // const allUserAuth = sql.prepare(`SELECT * FROM userAuth`).all();
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
            userCountTotal,
            verifiedCount,
            paidCount,
            suspendedCount,
            staffCount,
            freeCount
        });
    });

    app.get(`/staff/*`, checkAuthenticatedStaff, (request, response, next) =>
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
        const usernameToTakeActionOn = request.query.username;

        if (usernameToTakeActionOn === staffUsername) // If staff member is trying to take action on themselves, redirect.
            return response.redirect(`/staff`);

        switch (actionToTake)
        {
            case `editUser`: {
                const urlParameters = new URLSearchParams(request.query);
                const userToEdit = urlParameters.get(`username`);

                for (const [key, value] of urlParameters)
                {
                    if (key === `username`)
                        continue;

                    if (key === `newUsername`)
                    {
                        if (value === ``)
                            continue;
                        const newUsername = value;
                        // ensure new username is not already taken
                        const usernameExists = sql.prepare(`SELECT * FROM userAuth WHERE username = ?`).get(newUsername);
                        if (!usernameExists)
                        {
                            sql.prepare(`UPDATE users SET username = ? WHERE username = ?`).run(newUsername, userToEdit);
                            sql.prepare(`UPDATE userAuth SET username = ? WHERE username = ?`).run(newUsername, userToEdit);
                        }
                    }

                    if (key === `bio` && value === ``)
                        sql.prepare(`UPDATE users SET bio = ? WHERE username = ?`).run(`No bio yet.`, userToEdit);

                    if (key === `image` && value === ``)
                        sql.prepare(`UPDATE users SET image = ? WHERE username = ?`).run(`${ request.protocol }://${ request.get(`host`) }/img/person.png`, userToEdit);

                    if (key === `displayName` && value === ``)
                        continue;

                    if ((key === `links` && value === ``) || (key === `linkNames` && value === ``))
                    {
                        sql.prepare(`UPDATE users SET links = ? WHERE username = ?`).run(`[]`, userToEdit);
                        sql.prepare(`UPDATE users SET linkNames = ? WHERE username = ?`).run(`[]`, userToEdit);
                    }

                    if (key === `email`)
                    {
                        if (value === ``)
                            continue;
                        const newEmail = value;
                        // ensure new email is not already taken
                        const emailExists = sql.prepare(`SELECT * FROM userAuth WHERE email = ?`).get(newEmail);
                        if (!emailExists)
                            sql.prepare(`UPDATE userAuth SET email = ? WHERE username = ?`).run(newEmail, userToEdit);
                    }

                    else
                        sql.prepare(`UPDATE users SET ${ key } = ? WHERE username = ?`).run(value, userToEdit);
                }

                response.redirect(`/staff`);
                break;
            }
            case `verifyUser`: {
                sql.prepare(`UPDATE users SET verified = 1 WHERE username = ?`).run(usernameToTakeActionOn);
                response.redirect(`/staff`);
                break;
            }
            case `unverifyUser`: {
                sql.prepare(`UPDATE users SET verified = 0 WHERE username = ?`).run(usernameToTakeActionOn);
                response.redirect(`/staff`);
                break;
            }
            case `promoteUser`: {
                sql.prepare(`UPDATE users SET verified = 2 WHERE username = ?`).run(usernameToTakeActionOn);
                sql.prepare(`UPDATE users SET paid = 1 WHERE username = ?`).run(usernameToTakeActionOn);
                sql.prepare(`UPDATE users SET subExpires = ? WHERE username = ?`).run(`9999-01-01`, usernameToTakeActionOn);
                response.redirect(`/staff`);
                break;
            }
            case `demoteUser`: {
                sql.prepare(`UPDATE users SET verified = 0 WHERE username = ?`).run(usernameToTakeActionOn);
                sql.prepare(`UPDATE users SET paid = 0 WHERE username = ?`).run(usernameToTakeActionOn);
                sql.prepare(`UPDATE users SET subExpires = ? WHERE username = ?`).run(``, usernameToTakeActionOn);
                response.redirect(`/staff`);
                break;
            }
            case `suspendUser`: {
                sql.prepare(`UPDATE users SET verified = -1 WHERE username = ?`).run(usernameToTakeActionOn);
                response.redirect(`/staff`);
                break;
            }
            case `unsuspendUser`: {
                sql.prepare(`UPDATE users SET verified = 0 WHERE username = ?`).run(usernameToTakeActionOn);
                response.redirect(`/staff`);
                break;
            }
            case `deleteUser`: {
                sql.prepare(`DELETE FROM users WHERE username = ?`).run(usernameToTakeActionOn);
                sql.prepare(`DELETE FROM userAuth WHERE username = ?`).run(usernameToTakeActionOn);
                response.redirect(`/staff`);
                break;
            }
            case `extendUser`: {
                const timeToExtendInMonths = request.query.months;
                const user = sql.prepare(`SELECT * FROM users WHERE username = ?`).get(usernameToTakeActionOn);
                const subExpires = user.subExpires;
                if (subExpires.startsWith(`9999`))
                    return response.redirect(`/staff`);
                let newSubExpires;
                newSubExpires = subExpires === `` ? new Date() : new Date(subExpires);
                newSubExpires.setMonth(newSubExpires.getMonth() + Number.parseInt(timeToExtendInMonths, 10));
                newSubExpires = newSubExpires.toISOString().split(`T`)[0];
                sql.prepare(`UPDATE users SET paid = 1 WHERE username = ?`).run(usernameToTakeActionOn);
                sql.prepare(`UPDATE users SET subExpires = ? WHERE username = ?`).run(newSubExpires, usernameToTakeActionOn);
                response.redirect(`/staff`);
                break;
            }
            default: {
                response.redirect(`/staff`);
                break;
            }
        }
    });

    // logout
    app.delete(`/logout`, (request, response, next) =>
    {
        logoutUser(request, response, next);
        return response.redirect(`/login`);
    });

    app.delete(`/delete`, (request, response, next) =>
    {
        const userEmail = request.user;
        if (!userEmail)
            return response.redirect(`/login`);
        const username = sql.prepare(`SELECT * FROM userAuth WHERE email = ?`).get(userEmail).username;
        if (!username)
            return response.redirect(`/login`);
        sql.prepare(`DELETE FROM users WHERE username = ?`).run(username);
        sql.prepare(`DELETE FROM userAuth WHERE username = ?`).run(username);
        logoutUser(request, response, next);
        // TODO: Cancel Payments?
        return response.redirect(`/login`);
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
            `/img/`,
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
            let verified = user.verified;

            if (verified === -1)
            { // Suspended
                response.status(404);
                return response.redirect(`/`);
            }
            verified = Boolean(verified);

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
        checkExpiredSubscriptions();
    });

    setInterval(() =>
    {
        checkExpiredSubscriptions();
    }, 14_400_000); // every 4~ hours
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
        let username = sql.prepare(`SELECT * FROM userAuth WHERE email = ?`).get(userEmail);
        if (!username)
        {
            logoutUser(request, response, next);
            return response.redirect(`/login`);
        }
        username = username.username;
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
        return response.redirect(`/edit`);
    next();
}

/**
 * @name checkExpiredSubscriptions
 * @description Checks all paying users to see if their sub expired, and if so to reset them to free.
 */
function checkExpiredSubscriptions()
{
    // look in the DB for every user that is paid
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
        // return response.redirect(`/login`);
    });
}
