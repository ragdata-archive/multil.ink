import express from 'express';
import SQLite from 'better-sqlite3';
import
{
    https,
    projectName,
} from '../app.js';
import { VER_STATUS } from '../functions.js';

const sql = new SQLite(`./src/db.sqlite`);

const router = new express.Router();

// for every other route, get the URL and check if user exists
router.get(`/`, (request, response) =>
{
    request.url = request.originalUrl;
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

export default router;
