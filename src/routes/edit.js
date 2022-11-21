import express from 'express';
import SQLite from 'better-sqlite3';
import bcrypt from 'bcrypt';
import
{
    Stripe,
    bannedUsernames,
    discordWebhookURL,
    https,
    linkRegex,
    passwordPolicy,
    projectName,
    stripeCustomerPortalURL,
    stripeProductID,
    stripeSecretKey,
    stripeWebhookSigningSecret,
    supportedFeaturedContentUrls,
    themes,
    usernameRegex,
} from '../app.js';
import
{
    VER_STATUS,
    checkAuthenticated,
    escapeRegex,
    logoutUser,
    sendAuditLog,
} from '../functions.js';

const sql = new SQLite(`./src/db.sqlite`);

const router = new express.Router();

router.get(`/`, checkAuthenticated, (request, response, next) =>
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
        featuredContent: user.featuredContent,
        supportedFeaturedContentUrls: [...supportedFeaturedContentUrls].join(`,`),
        csrfToken,
    });
});

router.post(`/`, checkAuthenticated, async (request, response, next) =>
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

        const updatedDisplayName = request.body.displayName;
        const updatedBio = request.body.bio;
        let updatedImage = request.body.image;
        let featuredContent = request.body.featuredContent;
        let theme = request.body.theme;
        let backgroundColor = request.body.backgroundColor;
        let textColor = request.body.textColor;
        let borderColor = request.body.borderColor;
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
        for (let index = 0; index < 50; index++)
        {
            if (request.body[`link${ index }`] && request.body[`linkName${ index }`])
            {
                let link = request.body[`link${ index }`];
                const linkName = request.body[`linkName${ index }`];
                if (!link.startsWith(`http://`) && !link.startsWith(`https://`))
                    link = `https://${ link }`;
                link = link.replace(`www.`, ``);

                if (linkRegex.test(link) && linkName && !updatedLinks.includes(link))
                {
                    updatedLinks.push(link);
                    updatedLinkNames.push(linkName);
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
        response.redirect(`/edit`);
    }
    catch
    {
        response.redirect(`/edit?message=An error occurred.&type=error`);
    }
});

router.post(`/*`, checkAuthenticated, async (request, response, next) =>
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
                const oldEmailInput = request.body.oldEmail;
                const newEmail = request.body.newEmail;
                const password = request.body.password;
                const usersHashedPassword = sql.prepare(`SELECT * FROM userAuth WHERE username = ?`).get(userUsername).password;
                const isCorrectPassword = await bcrypt.compare(password, usersHashedPassword);

                if ((oldEmailInput === usersCurrentEmail) && isCorrectPassword)
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
                const oldPassword = request.body.oldPassword;
                const newPassword = request.body.newPassword;
                const usersHashedPassword = sql.prepare(`SELECT * FROM userAuth WHERE username = ?`).get(userUsername).password;
                const isCorrectPassword = await bcrypt.compare(oldPassword, usersHashedPassword);
                const meetsRequirements = passwordPolicy.validate(newPassword);

                if (isCorrectPassword && newPassword && meetsRequirements)
                {
                    const hashedPassword = await bcrypt.hash(newPassword, 10);
                    sql.prepare(`UPDATE userAuth SET password = ? WHERE username = ?`).run(hashedPassword, userUsername);
                    sendAuditLog(`|| ${ userUsername } // ${ usersCurrentEmail } || changed their password.`, discordWebhookURL);
                    logoutUser(request, response, next);
                }
                else
                {
                    if (!isCorrectPassword)
                        return response.redirect(`/edit?message=The old password you entered is incorrect.&type=error`);
                    if (!newPassword)
                        return response.redirect(`/edit?message=You must enter a new password.&type=error`);
                    if (!meetsRequirements)
                        return response.redirect(`/edit?message=The new password you entered does not meet the requirements.&type=error`);
                }
                response.redirect(`/edit`);
                break;
            }
            case `changeUsername`: {
                const newUsername = request.body.username;
                const password = request.body.password;
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

export default router;
