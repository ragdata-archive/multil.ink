import express from "express";
import SQLite from "better-sqlite3";
import
{
    Stripe,
    bannedUsernames,
    discordWebhookURL,
    emailRegex,
    https,
    projectName,
    stripeCustomerPortalURL,
    stripeProductID,
    stripeSecretKey,
    stripeWebhookSigningSecret,
} from "../app.js";
import
{
    VER_STATUS,
    checkAuthenticatedStaff,
    logoutUser,
    sendAuditLog,
} from "../functions.js";

const sql = new SQLite(`./src/db.sqlite`);

const router = new express.Router();

router.get(`/`, checkAuthenticatedStaff, (request, response, next) =>
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
    const pageNumber = Number.parseInt(request.query.page, 10);
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

    const search = request.query.search;
    if (search)
    {
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

router.post(`/*`, checkAuthenticatedStaff, async (request, response, next) =>
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
        const usernameToTakeActionOn = request.body.username;

        if (usernameToTakeActionOn === staffUsername)
            return response.redirect(`/staff`);

        switch (actionToTake)
        {
            case `editUser`: {
                const userToEdit = request.body.username;

                const currentUserInfo = sql.prepare(`SELECT * FROM users WHERE username = ?`).get(usernameToTakeActionOn);
                let object = Object.entries(request.body);
                object = object.filter(([key]) => key !== `username` && key !== `csrfToken`);
                object = object.filter(([key]) => key !== `newUsername`);
                // ! Ensure we check newUsername last. (So all the other changes go through)
                if (request.body.newUsername) object.push([`newUsername`, request.body.newUsername]);
                for (const [key, value] of object)
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
                            else
                                sql.prepare(`UPDATE users SET image = ? WHERE username = ?`).run(`${ value }`, userToEdit);
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
                            if (!emailExists && emailRegex.test(newEmail) && newEmail.length <= 512)
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

                if (!username || !redirectTo || username === redirectTo)
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

export default router;
