import express from "express";
import SQLite from "better-sqlite3";
import
{
    Stripe,
    https,
    stripeCustomerPortalURL,
    stripeProductID,
    stripeSecretKey,
    stripeWebhookSigningSecret,
} from "../app.js";
import
{
    VER_STATUS,
    checkAuthenticated,
    logoutUser,
} from "../functions.js";

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

    const verificationStatus = sql.prepare(`SELECT * FROM users WHERE username = ?`).get(userData.username).verified;
    if (verificationStatus === VER_STATUS.AWAITING_VERIFICATION)
        return response.redirect(`/edit?message=Please verify your email address before upgrading.&type=error`);

    try
    {
        if (stripeSecretKey && stripeProductID && stripeCustomerPortalURL && stripeWebhookSigningSecret)
        {
            // if we have a query string, it's a stripe redirect
            if (request.query && request.query.session_id)
            {
                // verify the session
                const session = await Stripe.checkout.sessions.retrieve(request.query.session_id);
                if (session.customer !== userData.stripeCID)
                    return response.redirect(`/edit?message=An error occurred.&type=error`);

                if (session.payment_status === `paid`)
                {
                    // We handle the actual subscription update in the webhook.
                    return response.redirect(`/edit?message=You have successfully upgraded your account.&type=success`);
                }
            }
            else
            {
                const stripeCID = userData.stripeCID;
                if (stripeCID)
                {
                    const customer = await Stripe.customers.retrieve(stripeCID);
                    /* eslint-disable camelcase */
                    const session = await Stripe.checkout.sessions.create({
                        mode: `subscription`,
                        payment_method_types: [`card`],
                        customer: customer.id,
                        line_items: [
                            {
                                price: stripeProductID,
                                quantity: 1
                            },
                        ],
                        success_url: `${ https }://${ request.get(`host`) }/upgrade?session_id={CHECKOUT_SESSION_ID}`,
                        cancel_url: `${ https }://${ request.get(`host`) }/edit`
                    });
                    /* eslint-enable camelcase */
                    return response.redirect(session.url);
                }
            }
        }
    }
    catch
    {
        response.redirect(`/edit`);
    }
    response.redirect(`/edit`);
});

export default router;
