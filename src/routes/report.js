import express from "express";
import { verify } from "hcaptcha";
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
    reportEmail,
    transporter,
} from "../app.js";
import { sendAuditLog } from "../functions.js";

const router = new express.Router();

router.get(`/`, (request, response) =>
{
    const csrfToken = request.csrfToken();
    response.render(`report.ejs`, {
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
            return response.redirect(`/report?message=Please fill out the captcha.&type=error`);
        }
        const email = request.body.email;
        const fullName = request.body.fullName;
        const message = request.body.message;
        if (!email || !fullName || !message)
            return response.redirect(`/report?message=Please complete the form.&type=error`);

        if (emailSMTPHost && emailSMTPPort && emailSMTPUser && emailSMTPPass && emailFromDisplayName && reportEmail)
        {
            await transporter.sendMail({
                from: `"${ emailFromDisplayName }" <${ emailSMTPUser }>`,
                to: `${ reportEmail }`,
                subject: `New Report Form Submission`,
                text: `New report form submission:\n\nEmail: ${ email }\nFull Name: ${ fullName }\nMessage: ${ message }`,
                html: `<p>New report form submission:</p><p>Email: ${ email }</p><p>Full Name: ${ fullName }</p><p>Message: ${ message }</p>`
            });
            sendAuditLog(`New report form submission. Please have the report administrator check their email.`, discordWebhookURL);
            return response.redirect(`/report?message=Your report has been received.&type=success`);
        }
        return response.redirect(`/report?message=An error occurred.&type=error`);
    }
    catch
    {
        response.redirect(`/report?message=An error occurred.&type=error`);
    }
});

export default router;
