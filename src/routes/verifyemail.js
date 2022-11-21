import express from 'express';
import SQLite from 'better-sqlite3';
import { discordWebhookURL } from '../app.js';
import
{
    VER_STATUS,
    sendAuditLog,
} from '../functions.js';

const sql = new SQLite(`./src/db.sqlite`);

const router = new express.Router();

router.get(`/`, (request, response) =>
{
    try
    {
        const queries = request.query;
        if (!queries.token)
            return response.redirect(`/edit?message=Invalid token.&type=error`);
        const token = queries.token;
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

export default router;
