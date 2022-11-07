import express from 'express';
import SQLite from 'better-sqlite3';
import { createRequire } from "node:module";
import helmet from "helmet";
import bodyParser from "body-parser";
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from "node:fs";
import { verify } from 'hcaptcha';

// eslint-disable-next-line no-underscore-dangle
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const require = createRequire(import.meta.url);
const sql = new SQLite(`./src/db.sqlite`);

/**
 * initial setup process and token validation
 */
async function run()
{
    await initSetup();

    const {
        port, secret, linkWhitelist, freeLinks, projectName, projectDescription, dev
    } = require(`./config.json`);

    let {
        hcaptchaSiteKey, hcaptchaSecret
    } = require(`./config.json`);

    if (dev)
    {
        hcaptchaSiteKey = `10000000-ffff-ffff-ffff-000000000001`;
        hcaptchaSecret = `0x0000000000000000000000000000000000000000`;
    }

    sql.prepare(`CREATE TABLE IF NOT EXISTS users (username TEXT PRIMARY KEY, verified INTEGER, paid INTEGER, subExpires TEXT, lastUsernameChange TEXT, displayName TEXT, bio TEXT, image TEXT, links TEXT, linkNames TEXT)`).run();
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

    const initializePassport = require(`./passport-config.cjs`);
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
    app.use(express.static(`./src/public`));
    app.use(express.static(`./src/views`));
    // hotload jquery & bootstrap
    const projectRoot = path.join(__dirname, `..`);
    app.use(`/css`, express.static(path.join(projectRoot, `node_modules/bootstrap/dist/css`)));
    app.use(`/js`, express.static(path.join(projectRoot, `node_modules/bootstrap/dist/js`)));
    app.use(`/js`, express.static(path.join(projectRoot, `node_modules/jquery/dist`)));
    app.set(`views`, `./src/views`);
    app.set(`view engine`, `ejs`);

    app.get(`/`, (request, response) =>
    {
        const image = `${ request.protocol }://${ request.get(`host`) }/img/logo.png`;
        response.render(`index.ejs`, {
            projectName, projectDescription, image
        });
    });

    app.get(`/login`, checkNotAuthenticated, (request, response) =>
    {
        const image = `${ request.protocol }://${ request.get(`host`) }/img/logo.png`;
        response.render(`login.ejs`, {
            projectName, projectDescription, image, hcaptchaSiteKey
        });
    });

    app.post(`/login`, checkNotAuthenticated, async (request, response, next) =>
    {
        const captchaToken = request.body[`h-captcha-response`];
        const verifyResults = await verify(hcaptchaSecret, captchaToken);
        if (!verifyResults.success)
        {
            request.flash(`error`, `Invalid captcha`);
            return response.redirect(`/login`);
        }
        passport.authenticate(`local`, {
            successRedirect: `/edit`,
            failureRedirect: `/login`,
            failureFlash: true
        })(request, response, next);
    });

    app.get(`/register`, checkNotAuthenticated, (request, response) =>
    {
        const image = `${ request.protocol }://${ request.get(`host`) }/img/logo.png`;
        response.render(`register.ejs`, {
            projectName, projectDescription, image, hcaptchaSiteKey
        });
    });

    app.post(`/register`, checkNotAuthenticated, async (request, response) =>
    {
        try
        {
            const captchaToken = request.body[`h-captcha-response`];
            const verifyResults = await verify(hcaptchaSecret, captchaToken);
            if (!verifyResults.success)
            {
                request.flash(`error`, `Invalid captcha`);
                return response.redirect(`/register`);
            }
            const username = request.body.username.toLowerCase().trim().slice(0, 60);
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
                `tos`,
                `privacy`
            ];
            if (bannedUsernames.includes(username))
                return response.redirect(`/register`);

            // if username is not A-Z, a-z, 0-9, bail.
            const regex = /^[\dA-Za-z]+$/;
            if (!regex.test(username))
                return response.redirect(`/register`);

            // If email is not valid, bail.
            const email = request.body.email.toLowerCase().trim().slice(0, 1024);
            const regexEmail = /[^\t\n\r @]+@[^\t\n\r @]+\.[^\t\n\r @]+/gm;
            if (!regexEmail.test(email))
                return response.redirect(`/register`);

            const user = sql.prepare(`SELECT * FROM userAuth WHERE username = ?`).get(username);
            const emailExists = sql.prepare(`SELECT * FROM userAuth WHERE email = ?`).get(email);
            if (user || emailExists) // Prevent duplicate usernames/emails
                return response.redirect(`/register`);
            const hashedPassword = await bcrypt.hash(request.body.password.trim().slice(0, 1024), 10);
            sql.prepare(`INSERT INTO userAuth (username, email, password) VALUES (?, ?, ?)`).run(username, email, hashedPassword);
            sql.prepare(`INSERT INTO users (username, verified, paid, subExpires, lastUsernameChange, displayName, bio, image, links, linkNames) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(username, 0, 0, ``, `${ new Date(Date.now()).toISOString().slice(0, 10) }`, username, `No bio yet.`, `${ request.protocol }://${ request.get(`host`) }/img/person.png`, `[]`, `[]`);
            // If this is the first user, make them staff.
            const userCount = sql.prepare(`SELECT COUNT(*) FROM userAuth`).get();
            if (userCount[`COUNT(*)`] === 1)
                sql.prepare(`UPDATE users SET paid = ?, subExpires = ?, verified = ? WHERE username = ?`).run(1, `9999-01-01`, `2`, username);

            response.redirect(`/edit`);
        }
        catch
        {
            response.redirect(`/register`);
        }
    });

    app.get(`/edit`, checkAuthenticated, (request, response, next) =>
    {
        const ourImage = `${ request.protocol }://${ request.get(`host`) }/img/logo.png`;
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
        const verified = user.verified;

        if (verified === -1)
            return response.redirect(`/`);

        response.render(`edit.ejs`, {
            username, displayName, bio, image, links, linkNames, paid, subExpires, verified, ourImage
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

            const updatedDisplayName = request.body.displayName.trim().slice(0, 60);
            const updatedBio = request.body.bio.trim().slice(0, 280);
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

                    const linkRegex = /https?:\/\/(www\.)?[\w#%+.:=@~-]{1,256}\.[\d()A-Za-z]{1,6}\b([\w!#%&()+./:=?@~-]*)/gm;
                    if (linkRegex.test(link) && link && linkName && !updatedLinks.includes(link))
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

    app.post(`/edit/*`, checkAuthenticated, async (request, response, next) =>
    {
        const usersCurrentEmail = request.user;
        let userUsername = sql.prepare(`SELECT * FROM userAuth WHERE email = ?`).get(usersCurrentEmail);
        if (!userUsername)
        {
            logoutUser(request, response, next);
            return response.redirect(`/login`);
        }
        userUsername = userUsername.username;
        const actionToTake = request.params[0];

        switch (actionToTake)
        {
            case `changeEmail`: {
                const urlParameters = new URLSearchParams(request.query);
                const oldEmailInput = urlParameters.get(`oldEmail`).toLowerCase().trim();
                const newEmail = urlParameters.get(`newEmail`).toLowerCase().trim();
                const password = urlParameters.get(`password`).trim();
                const usersHashedPassword = sql.prepare(`SELECT * FROM userAuth WHERE username = ?`).get(userUsername).password;
                const isCorrectPassword = await bcrypt.compare(password, usersHashedPassword);

                if ((oldEmailInput === usersCurrentEmail) && isCorrectPassword && newEmail && newEmail.length > 0 && newEmail.length < 1024)
                {
                    const regexEmail = /[^\t\n\r @]+@[^\t\n\r @]+\.[^\t\n\r @]+/gm;
                    if (regexEmail.test(newEmail))
                    {
                        // ensure new email is not already taken
                        const emailExists = sql.prepare(`SELECT * FROM userAuth WHERE email = ?`).get(newEmail);
                        if (!emailExists)
                            sql.prepare(`UPDATE userAuth SET email = ? WHERE username = ?`).run(newEmail, userUsername);
                    }
                }

                response.redirect(`/edit`);
                break;
            }
            case `changePassword`: {
                const urlParameters = new URLSearchParams(request.query);
                const oldPassword = urlParameters.get(`oldPassword`).trim();
                const newPassword = urlParameters.get(`newPassword`).trim();
                const usersHashedPassword = sql.prepare(`SELECT * FROM userAuth WHERE username = ?`).get(userUsername).password;
                const isCorrectPassword = await bcrypt.compare(oldPassword, usersHashedPassword);

                if (isCorrectPassword && newPassword && newPassword.length > 0 && newPassword.length < 1024)
                {
                    const hashedPassword = await bcrypt.hash(newPassword, 10);
                    sql.prepare(`UPDATE userAuth SET password = ? WHERE username = ?`).run(hashedPassword, userUsername);
                }
                response.redirect(`/edit`);
                break;
            }
            case `changeUsername`: {
                const urlParameters = new URLSearchParams(request.query);
                const newUsername = urlParameters.get(`username`).trim();
                const password = urlParameters.get(`password`).trim();
                const usersHashedPassword = sql.prepare(`SELECT * FROM userAuth WHERE username = ?`).get(userUsername).password;
                const isCorrectPassword = await bcrypt.compare(password, usersHashedPassword);

                if (isCorrectPassword && newUsername && newUsername.length > 0 && newUsername.length < 60)
                {
                    const regex = /^[\dA-Za-z]+$/;
                    if (regex.test(newUsername))
                    {
                        // ensure new username is not already taken
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
                            if (timeSinceLastChange > 7_776_000_000 || isPaidUser) // 3 months
                            {
                                sql.prepare(`UPDATE userAuth SET username = ? WHERE username = ?`).run(newUsername, userUsername);
                                sql.prepare(`UPDATE users SET username = ?, lastUsernameChange = ? WHERE username = ?`).run(newUsername, currentDate, userUsername);
                            }
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
        const ourImage = `${ request.protocol }://${ request.get(`host`) }/img/logo.png`;
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
        let freeCount = userCountTotal - paidCount - staffCount;
        if (freeCount < 0)
            freeCount = 0;

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
            freeCount,
            projectName,
            ourImage
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
                if (timeToExtendInMonths === `-1`)
                    sql.prepare(`UPDATE users SET subExpires = ? WHERE username = ?`).run(`9999-01-01`, usernameToTakeActionOn);
                else
                {
                    let newSubExpires;
                    newSubExpires = subExpires === `` ? new Date() : new Date(subExpires);
                    newSubExpires.setMonth(newSubExpires.getMonth() + Number.parseInt(timeToExtendInMonths, 10));
                    newSubExpires = newSubExpires.toISOString().split(`T`)[0];
                    sql.prepare(`UPDATE users SET subExpires = ? WHERE username = ?`).run(newSubExpires, usernameToTakeActionOn);
                }
                sql.prepare(`UPDATE users SET paid = 1 WHERE username = ?`).run(usernameToTakeActionOn);
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

        const urlParameters = new URLSearchParams(request.query);
        const password = urlParameters.get(`password`).trim();
        const usersHashedPassword = sql.prepare(`SELECT * FROM userAuth WHERE username = ?`).get(username).password;
        const isCorrectPassword = await bcrypt.compare(password, usersHashedPassword);
        if (isCorrectPassword)
        {
            sql.prepare(`DELETE FROM users WHERE username = ?`).run(username);
            sql.prepare(`DELETE FROM userAuth WHERE username = ?`).run(username);
            logoutUser(request, response, next);
        }

        return response.redirect(`/login`);
    });

    app.get(`/tos`, (request, response) =>
    {
        const ourImage = `${ request.protocol }://${ request.get(`host`) }/img/logo.png`;
        response.render(`tos.ejs`, {
            projectName, projectDescription, ourImage
        });
    });

    app.get(`/privacy`, (request, response) =>
    {
        const ourImage = `${ request.protocol }://${ request.get(`host`) }/img/logo.png`;
        response.render(`privacy.ejs`, {
            projectName, projectDescription, ourImage
        });
    });

    // for every other route, get the URL and check if user exists
    app.get(`/*`, (request, response) =>
    {
        const ourImage = `${ request.protocol }://${ request.get(`host`) }/img/logo.png`;
        const potentialUser = request.url.replaceAll(`/`, ``).replaceAll(`@`, ``).replaceAll(`~`, ``);
        // If the URL is static content, serve it.
        const allowed = [
            `css`,
            `js`,
            `img`
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

            if (verified === -1)
            {
                response.status(404);
                return response.redirect(`/`);
            }

            response.render(`profile.ejs`, {
                username, displayName, bio, image, links, linkNames, paid, verified, ourImage
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
    const config = require(`./src/config.json`);

    let sessionSecret = ``;
    const possible = `ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789`;
    for (let index = 0; index < 50; index++)
        sessionSecret += possible.charAt(Math.floor(Math.random() * possible.length));

    config.secret = sessionSecret;
    fs.writeFileSync(`./src/config.json`, JSON.stringify(config, undefined, 4)); // save settings to config
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
