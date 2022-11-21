import express from 'express';
import { verify } from 'hcaptcha';
import bcrypt from 'bcrypt';
import SQLite from 'better-sqlite3';
import
{
    Stripe,
    bannedUsernames,
    discordWebhookURL,
    emailFromDisplayName,
    emailRegex,
    emailSMTPHost,
    emailSMTPPass,
    emailSMTPPort,
    emailSMTPUser,
    hcaptchaSecret,
    hcaptchaSiteKey,
    https,
    passwordPolicy,
    projectDescription,
    projectName,
    stripeCustomerPortalURL,
    stripeProductID,
    stripeSecretKey,
    stripeWebhookSigningSecret,
    transporter,
    usernameRegex,
} from '../app.js';
import
{
    VER_STATUS,
    checkNotAuthenticated,
    sendAuditLog,
} from '../functions.js';

const sql = new SQLite(`./src/db.sqlite`);

const router = new express.Router();

router.get(`/`, checkNotAuthenticated, (request, response) =>
{
    const csrfToken = request.csrfToken();
    response.render(`register.ejs`, {
        projectName,
        projectDescription,
        image: `${ https }://${ request.get(`host`) }/img/logo.png`,
        hcaptchaSiteKey,
        csrfToken,
    });
});

router.post(`/`, checkNotAuthenticated, async (request, response) =>
{
    try
    {
        const verifyResults = await verify(hcaptchaSecret, request.body[`h-captcha-response`]);
        if (!verifyResults.success)
        {
            request.flash(`error`, `Please fill out the captcha.`);
            return response.redirect(`/register?message=Please fill out the captcha.&type=error`);
        }
        const username = request.body.username;
        if (bannedUsernames.has(username))
            return response.redirect(`/register?message=That username is not available.&type=error`);

        if (!usernameRegex.test(username))
            return response.redirect(`/register?message=That username is not available.&type=error`);

        const email = request.body.email;
        if (!emailRegex.test(email))
            return response.redirect(`/register?message=That email is not valid.&type=error`);

        const user = sql.prepare(`SELECT * FROM userAuth WHERE username = ?`).get(username);
        const emailExists = sql.prepare(`SELECT * FROM userAuth WHERE email = ?`).get(email);
        if (user || emailExists)
            return response.redirect(`/register?message=That username/email is already in use.&type=error`);
        if (passwordPolicy.validate(request.body.password) === false)
            return response.redirect(`/register?message=Your password does not meet the requirements.&type=error`);
        const hashedPassword = await bcrypt.hash(request.body.password, 10);

        const availableChars = `ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789`;
        let token = ``;
        for (let index = 0; index < 32; index++)
            token += availableChars.charAt(Math.floor(Math.random() * availableChars.length));

        const tokenExists = sql.prepare(`SELECT * FROM emailActivations WHERE token = ?`).get(token);
        if (tokenExists) // too lazy to gen them another one so just force them to do it again
            return response.redirect(`/register?message=An error occurred. Please try again.&type=error`);
        sql.prepare(`INSERT INTO emailActivations (email, username, token, expires) VALUES (?, ?, ?, ?)`).run(email, username, `${ token }`, `${ new Date(Date.now() + (86_400_000 * 2)).toISOString().slice(0, 10) }`);

        let stripeCID = ``;
        if (stripeSecretKey && stripeProductID && stripeCustomerPortalURL && stripeWebhookSigningSecret)
        {
            const customer = await Stripe.customers.create({
                email,
                description: `New Customer`
            });
            stripeCID = customer.id;
        }
        sql.prepare(`INSERT INTO userAuth (username, email, password, stripeCID) VALUES (?, ?, ?, ?)`).run(username, email, hashedPassword, stripeCID);
        sql.prepare(`INSERT INTO users (username, verified, paid, subExpires, lastUsernameChange, displayName, bio, image, links, linkNames, featuredContent, theme, advancedTheme, ageGated) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(username, `${ VER_STATUS.AWAITING_VERIFICATION }`, `0`, ``, `${ new Date(Date.now()).toISOString().slice(0, 10) }`, username, `No bio yet.`, `${ https }://${ request.get(`host`) }/img/person.png`, `[]`, `[]`, ``, `Light`, ``, `0`);

        // If this is the first user, make them staff.
        const userCount = sql.prepare(`SELECT COUNT(*) FROM userAuth`).get();
        if (userCount[`COUNT(*)`] === 1)
            sql.prepare(`UPDATE users SET paid = ?, subExpires = ?, verified = ? WHERE username = ?`).run(`1`, `9999-01-01`, `${ VER_STATUS.STAFF_MEMBER }`, username);
        else
        {
            if (emailSMTPHost && emailSMTPPort && emailSMTPUser && emailSMTPPass && emailFromDisplayName)
            {
                await transporter.sendMail({
                    from: `"${ emailFromDisplayName }" <${ emailSMTPUser }>`,
                    to: `${ email }`,
                    subject: `Please verify your email`,
                    text: `Please verify your email by clicking the link below:\n\n${ https }://${ request.get(`host`) }/verifyemail?token=${ token }\n\nIf you did not sign up for an account, please ignore this email.\n\nThanks,\n${ emailFromDisplayName }`,
                    html: `<p>Please verify your email by clicking the link below:</p><p><a href="${ https }://${ request.get(`host`) }/verifyemail?token=${ token }">${ https }://${ request.get(`host`) }/verifyemail?token=${ token }</a></p><p>If you did not sign up for an account, please ignore this email.</p><p>Thanks,<br>${ emailFromDisplayName }</p>`
                });
            }
            sendAuditLog(`|| ${ username } // ${ email } || registered for an account.`, discordWebhookURL);
            return response.redirect(`/login?message=Account created. Please verify your email address, if you do not verify within 24 hours we will delete your account.&type=success`);
        }
        response.redirect(`/edit`);
    }
    catch
    {
        response.redirect(`/register?message=An error occurred.&type=error`);
    }
});

export default router;
