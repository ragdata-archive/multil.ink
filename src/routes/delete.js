import express from "express";
import SQLite from "better-sqlite3";
import bcrypt from "bcrypt";
import
{
    Stripe,
    discordWebhookURL,
    stripeCustomerPortalURL,
    stripeProductID,
    stripeSecretKey,
    stripeWebhookSigningSecret,
} from "../app.js";
import
{
    logoutUser,
    sendAuditLog,
} from "../functions.js";

const sql = new SQLite(`./src/db.sqlite`);

const router = new express.Router();

router.post(`/`, async (request, response, next) =>
{
    const userEmail = request.user;
    if (!userEmail)
        return response.redirect(`/login`);
    let username = sql.prepare(`SELECT * FROM userAuth WHERE email = ?`).get(userEmail);
    if (!username)
        return response.redirect(`/login`);
    username = username.username;

    const password = request.body.password;
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

export default router;
