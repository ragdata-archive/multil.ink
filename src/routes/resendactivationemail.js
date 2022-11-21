import express from 'express';
import SQLite from 'better-sqlite3';
import
{
    discordWebhookURL,
    emailFromDisplayName,
    emailSMTPHost,
    emailSMTPPass,
    emailSMTPPort,
    emailSMTPUser,
    https,
    transporter,
} from '../app.js';
import
{
    VER_STATUS,
    checkAuthenticated,
    logoutUser,
    sendAuditLog,
} from '../functions.js';

const sql = new SQLite(`./src/db.sqlite`);

const router = new express.Router();

router.get(`/`, checkAuthenticated, async (request, response, next) =>
{
    try
    {
        const userEmail = request.user;
        const userData = sql.prepare(`SELECT * FROM userAuth WHERE email = ?`).get(userEmail);
        if (!userData)
        {
            logoutUser(request, response, next);
            return response.redirect(`/login`);
        }
        const user = sql.prepare(`SELECT * FROM users WHERE username = ?`).get(userData.username);
        if (user.verified !== `${ VER_STATUS.AWAITING_VERIFICATION }`)
            return response.redirect(`/edit?message=Email already verified.&type=error`);
        const availableChars = `ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789`;
        let token = ``;
        for (let index = 0; index < 32; index++)
            token += availableChars.charAt(Math.floor(Math.random() * availableChars.length));
        sql.prepare(`DELETE FROM emailActivations WHERE email = ?`).run(userEmail);

        const tokenExists = sql.prepare(`SELECT * FROM emailActivations WHERE token = ?`).get(token);
        if (tokenExists) // too lazy to gen them another one so just force them to do it again
            return response.redirect(`/edit?message=An error occurred. Please try again.&type=error`);
        sql.prepare(`INSERT INTO emailActivations (email, username, token, expires) VALUES (?, ?, ?, ?)`).run(userEmail, userData.username, `${ token }`, `${ new Date(Date.now() + (86_400_000 * 2)).toISOString().slice(0, 10) }`);
        if (emailSMTPHost && emailSMTPPort && emailSMTPUser && emailSMTPPass && emailFromDisplayName)
        {
            await transporter.sendMail({
                from: `"${ emailFromDisplayName }" <${ emailSMTPUser }>`,
                to: `${ userEmail }`,
                subject: `Please verify your email`,
                text: `Please verify your email by clicking the link below:\n\n${ https }://${ request.get(`host`) }/verifyemail?token=${ token }\n\nIf you did not sign up for an account, please ignore this email.\n\nThanks,\n${ emailFromDisplayName }`,
                html: `<p>Please verify your email by clicking the link below:</p><p><a href="${ https }://${ request.get(`host`) }/verifyemail?token=${ token }">${ https }://${ request.get(`host`) }/verifyemail?token=${ token }</a></p><p>If you did not sign up for an account, please ignore this email.</p><p>Thanks,<br>${ emailFromDisplayName }</p>`
            });
        }

        sendAuditLog(`|| ${ userData.username } // ${ userEmail } || requested a new email activation.`, discordWebhookURL);
        return response.redirect(`/edit?message=Email resent.&type=success`);
    }
    catch
    {
        response.redirect(`/edit?message=An error occurred.&type=error`);
    }
});

export default router;
