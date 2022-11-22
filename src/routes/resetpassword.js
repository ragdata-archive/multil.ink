import express from "express";
import { verify } from "hcaptcha";
import SQLite from "better-sqlite3";
import bcrypt from "bcrypt";
import
{
    discordWebhookURL,
    hcaptchaSecret,
    hcaptchaSiteKey,
    https,
    passwordPolicy,
    projectDescription,
    projectName,
} from "../app.js";
import { sendAuditLog } from "../functions.js";

const sql = new SQLite(`./src/db.sqlite`);

const router = new express.Router();

router.get(`/`, (request, response) =>
{
    const queries = request.query;
    if (!queries.token)
        return response.redirect(`/forgotpassword?message=Invalid token.&type=error`);
    const token = queries.token;
    const tokenData = sql.prepare(`SELECT * FROM passwordResets WHERE token = ?`).get(token);
    if (!tokenData)
        return response.redirect(`/forgotpassword?message=Invalid token.&type=error`);
    if (tokenData.expires < new Date(Date.now()).toISOString())
    {
        sql.prepare(`DELETE FROM passwordResets WHERE token = ?`).run(token);
        return response.redirect(`/forgotpassword?message=Token expired.&type=error`);
    }
    const csrfToken = request.csrfToken();
    response.render(`resetpassword.ejs`, {
        projectName,
        projectDescription,
        image: `${ https }://${ request.get(`host`) }/img/logo.png`,
        hcaptchaSiteKey,
        token,
        csrfToken,
    });
});

router.post(`/`, async (request, response) =>
{
    try
    {
        const token = request.body.token;
        if (!token)
            return response.redirect(`/forgotpassword?message=Invalid token.&type=error`);
        const verifyResults = await verify(hcaptchaSecret, request.body[`h-captcha-response`]);
        if (!verifyResults.success)
        {
            request.flash(`error`, `Please fill out the captcha.`);
            return response.redirect(`/resetpassword?token=${ token }&message=Please fill out the captcha.&type=error`);
        }
        const tokenData = sql.prepare(`SELECT * FROM passwordResets WHERE token = ?`).get(token);
        if (!tokenData)
            return response.redirect(`/forgotpassword?message=Invalid token.&type=error`);
        if (tokenData.expires < new Date(Date.now()).toISOString())
        {
            sql.prepare(`DELETE FROM passwordResets WHERE token = ?`).run(token);
            return response.redirect(`/forgotpassword?message=Token expired.&type=error`);
        }
        const password = request.body.password;
        const confirmPassword = request.body.password2;
        if (!password || !confirmPassword)
            return response.redirect(`/resetpassword?token=${ token }&message=Please enter a password.&type=error`);
        if (password !== confirmPassword)
            return response.redirect(`/resetpassword?token=${ token }&message=Passwords do not match.&type=error`);
        if (passwordPolicy.validate(password) === false)
            return response.redirect(`/resetpassword?token=${ token }&message=Your password does not meet the requirements.&type=error`);
        const hash = await bcrypt.hash(password, 10);
        sql.prepare(`UPDATE userAuth SET password = ? WHERE email = ?`).run(hash, tokenData.email);
        sql.prepare(`DELETE FROM passwordResets WHERE token = ?`).run(token);
        sendAuditLog(`|| ${ tokenData.username } // ${ tokenData.email } || reset their password.`, discordWebhookURL);
        return response.redirect(`/login?message=Password reset.&type=success`);
    }
    catch
    {
        response.redirect(`/forgotpassword?message=An error occurred.&type=error`);
    }
});

export default router;
