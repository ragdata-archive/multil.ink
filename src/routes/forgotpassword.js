import express from 'express';
import SQLite from 'better-sqlite3';
import { verify } from 'hcaptcha';
import
{
    discordWebhookURL,
    emailFromDisplayName,
    emailSMTPHost,
    emailSMTPPass,
    emailSMTPPort,
    emailSMTPUser,
    hcaptchaSecret,
    hcaptchaSiteKey,
    https,
    projectDescription,
    projectName,
    transporter,
} from '../app.js';
import { sendAuditLog } from '../functions.js';

const sql = new SQLite(`./src/db.sqlite`);

const router = new express.Router();

router.get(`/`, (request, response) =>
{
    const csrfToken = request.csrfToken();
    response.render(`forgotpassword.ejs`, {
        projectName,
        projectDescription,
        image: `${ https }://${ request.get(`host`) }/img/logo.png`,
        hcaptchaSiteKey,
        csrfToken,
    });
});

router.post(`/`, async (request, response) =>
{
    try
    {
        const verifyResults = await verify(hcaptchaSecret, request.body[`h-captcha-response`]);
        if (!verifyResults.success)
        {
            request.flash(`error`, `Please fill out the captcha.`);
            return response.redirect(`/login?message=Please fill out the captcha.&type=error`);
        }
        const email = request.body.email;
        if (!email)
            return response.redirect(`/forgotpassword?message=Please enter an email.&type=error`);
        const userData = sql.prepare(`SELECT * FROM userAuth WHERE email = ?`).get(email);
        if (!userData)
            return response.redirect(`/forgotpassword?message=An error occurred.&type=error`);

        const availableChars = `ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789`;
        let token = ``;
        for (let index = 0; index < 32; index++)
            token += availableChars.charAt(Math.floor(Math.random() * availableChars.length));
        sql.prepare(`DELETE FROM passwordResets WHERE email = ?`).run(email);
        const tokenExists = sql.prepare(`SELECT * FROM passwordResets WHERE token = ?`).get(token);
        if (tokenExists) // too lazy to gen them another one so just force them to do it again
            return response.redirect(`/forgotpassword?message=An error occurred. Please try again.&type=error`);
        sql.prepare(`INSERT INTO passwordResets (email, username, token, expires) VALUES (?, ?, ?, ?)`).run(email, userData.username, `${ token }`, `${ new Date(Date.now() + (86_400_000 * 2)).toISOString().slice(0, 10) }`);
        if (emailSMTPHost && emailSMTPPort && emailSMTPUser && emailSMTPPass && emailFromDisplayName)
        {
            await transporter.sendMail({
                from: `"${ emailFromDisplayName }" <${ emailSMTPUser }>`,
                to: `${ email }`,
                subject: `Password Reset`,
                text: `Please reset your password by clicking the link below:\n\n${ https }://${ request.get(`host`) }/resetpassword?token=${ token }\n\nIf you did not request a password reset, please ignore this email.\n\nThanks,\n${ emailFromDisplayName }`,
                html: `<p>Please reset your password by clicking the link below:</p><p><a href="${ https }://${ request.get(`host`) }/resetpassword?token=${ token }">${ https }://${ request.get(`host`) }/resetpassword?token=${ token }</a></p><p>If you did not request a password reset, please ignore this email.</p><p>Thanks,<br>${ emailFromDisplayName }</p>`
            });
        }

        sendAuditLog(`|| ${ userData.username } // ${ email } || requested a password reset.`, discordWebhookURL);
        return response.redirect(`/forgotpassword?message=Password reset email sent.&type=success`);
    }
    catch
    {
        response.redirect(`/forgotpassword?message=An error occurred.&type=error`);
    }
});

export default router;
