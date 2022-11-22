import express from "express";
import SQLite from "better-sqlite3";
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
    VER_STATUS,
    sendAuditLog,
} from "../functions.js";

const sql = new SQLite(`./src/db.sqlite`);

const router = new express.Router();

router.post(`/`, async (request, response) =>
{
    if (stripeSecretKey && stripeProductID && stripeCustomerPortalURL && stripeWebhookSigningSecret)
    {
        let event;

        try
        {
            event = Stripe.webhooks.constructEvent(request.body, request.headers[`stripe-signature`], stripeWebhookSigningSecret);
        }
        catch
        {
            return response.sendStatus(400);
        }

        const data = event.data.object;
        if (event.type === `invoice.paid`)
        {
            const subscription = await Stripe.subscriptions.retrieve(data.subscription);
            if (subscription.status === `active`)
            {
                const userAuthData = sql.prepare(`SELECT * FROM userAuth WHERE stripeCID = ?`).get(data.customer);
                if (!userAuthData)
                    return response.sendStatus(400);
                const userData = sql.prepare(`SELECT * FROM users WHERE username = ?`).get(userAuthData.username);
                if (!userData)
                    return response.sendStatus(400);
                const timeNow = new Date(Date.now());
                const timeNextYear = new Date(timeNow.setFullYear(timeNow.getFullYear() + 1));
                sql.prepare(`UPDATE users SET paid = ?, subExpires = ? WHERE username = ?`).run(`1`, `${ timeNextYear.toISOString().slice(0, 10) }`, userData.username);

                if (discordWebhookURL)
                {
                    let paidCount = sql.prepare(`SELECT COUNT(*) FROM users WHERE paid = 1`).get()[`COUNT(*)`];
                    const staffCount = sql.prepare(`SELECT COUNT(*) FROM users WHERE verified = ?`).get(`${ VER_STATUS.STAFF_MEMBER }`)[`COUNT(*)`];
                    paidCount -= staffCount;
                    let content = ``;
                    content += `|| ${ userData.username } // ${ userData.email } || has upgraded their account!\nWe now have **${ paidCount }** paid users.`;
                    await sendAuditLog(content, discordWebhookURL);
                }
            }
        }
        else if (event.type === `customer.subscription.updated`)
        {
            const userAuthData = sql.prepare(`SELECT * FROM userAuth WHERE stripeCID = ?`).get(data.customer);
            if (data.cancel_at_period_end === true)
                sendAuditLog(`|| ${ userAuthData.username } // ${ userAuthData.email } || has cancelled their subscription.\nThey will lose pro perks on/around <t:${ data.current_period_end }>`, discordWebhookURL);

            else if (data.status === `unpaid`)
            {
                const userAuthData = sql.prepare(`SELECT * FROM userAuth WHERE stripeCID = ?`).get(data.customer);
                if (!userAuthData)
                    return response.sendStatus(400);
                const userData = sql.prepare(`SELECT * FROM users WHERE username = ?`).get(userAuthData.username);
                if (!userData)
                    return response.sendStatus(400);
                sql.prepare(`UPDATE users SET paid = ?, subExpires = ? WHERE username = ?`).run(`0`, ``, userData.username);
                sendAuditLog(`|| ${ userAuthData.username } // ${ userAuthData.email } || has failed to pay their subscription.`, discordWebhookURL);
            }
        }

        response.sendStatus(200);
    }
    else
        response.sendStatus(400);
});

export default router;
