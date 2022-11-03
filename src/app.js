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
        port
    } = require(`./config.json`);

    sql.prepare(`CREATE TABLE IF NOT EXISTS users (username TEXT PRIMARY KEY, paid INTEGER, subExpires TEXT, displayName TEXT, bio TEXT, image TEXT, links TEXT)`).run();

    const app = express();

    app.use(helmet(
        {
            crossOriginEmbedderPolicy: false,
            crossOriginResourcePolicy: false,
            contentSecurityPolicy: false,
        }
    ));

    app.use(bodyParser.json()); // required by express-hcaptcha
    app.use(express.static(`./public`));
    app.use(express.static(`./views`));
    app.set(`views`, `./views`);
    app.set(`view engine`, `ejs`);

    // index.ejs
    app.get(`/`, (request, response) => response.render(`index.ejs`, {}));

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
            const paid = Boolean(user.paid);

            response.render(`profile.ejs`, {
                username, displayName, bio, image, links, paid
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
