import express from "express";
import { verify } from "hcaptcha";
import passport from "passport";
import
{
    hcaptchaSecret,
    hcaptchaSiteKey,
    https,
    projectDescription,
    projectName,
} from "../app.js";
import { checkNotAuthenticated } from "../functions.js";

const router = new express.Router();

router.get(`/`, checkNotAuthenticated, (request, response) =>
{
    const csrfToken = request.csrfToken();
    response.render(`login.ejs`, {
        projectName,
        projectDescription,
        image: `${ https }://${ request.get(`host`) }/img/logo.png`,
        hcaptchaSiteKey,
        csrfToken,
    });
});

router.post(`/`, checkNotAuthenticated, async (request, response, next) =>
{
    try
    {
        const verifyResults = await verify(hcaptchaSecret, request.body[`h-captcha-response`]);
        if (!verifyResults.success)
        {
            request.flash(`error`, `Please fill out the captcha.`);
            return response.redirect(`/login?message=Please fill out the captcha.&type=error`);
        }
        passport.authenticate(`local`, {
            successRedirect: `/edit`,
            failureRedirect: `/login?message=Email/Password incorrect.&type=error`,
            failureFlash: true
        })(request, response, next);
    }
    catch
    {
        response.redirect(`/login?message=An error occurred.&type=error`);
    }
});

export default router;
