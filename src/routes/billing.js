import express from 'express';
import SQLite from 'better-sqlite3';
import
{
    stripeCustomerPortalURL,
    stripeProductID,
    stripeSecretKey,
    stripeWebhookSigningSecret,
} from '../app.js';
import
{
    checkAuthenticated,
    logoutUser,
} from '../functions.js';

const sql = new SQLite(`./src/db.sqlite`);

const router = new express.Router();

router.get(`/`, checkAuthenticated, async (request, response, next) =>
{
    const userData = sql.prepare(`SELECT * FROM userAuth WHERE email = ?`).get(request.user);
    if (!userData)
    {
        logoutUser(request, response, next);
        return response.redirect(`/login`);
    }

    const paidStatus = sql.prepare(`SELECT * FROM users WHERE username = ?`).get(userData.username).paid;
    if (paidStatus === 0)
        return response.redirect(`/edit?message=You must be a pro member to access this page.&type=error`);

    if (stripeSecretKey && stripeProductID && stripeCustomerPortalURL && stripeWebhookSigningSecret)
    {
        const stripeCID = userData.stripeCID;
        if (stripeCID)
            return response.redirect(`${ stripeCustomerPortalURL }`);
    }
    response.redirect(`/edit`);
});

export default router;
