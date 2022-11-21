import express from 'express';
import { execSync } from 'node:child_process';
import
{
    bannedUsernames,
    dev as development,
    discordWebhookURL,
    emailSMTPHost,
    emailSMTPPass,
    emailSMTPUser,
    hcaptchaSecret,
    https,
    projectName,
    stripeCustomerPortalURL,
    stripeProductID,
    stripeSecretKey,
    stripeWebhookSigningSecret,
    supportedFeaturedContentUrls,
    themes,
} from '../app.js';
import { checkAuthenticatedStaff } from '../functions.js';

const router = new express.Router();

router.get(`/`, checkAuthenticatedStaff, (request, response) =>
{
    const gitMessage = execSync(`git show -s --format="Commit: %s (%h)"`).toString();
    const isStripeEnabled = Boolean(stripeSecretKey && stripeProductID && stripeCustomerPortalURL && stripeWebhookSigningSecret);
    const isEmailEnabled = Boolean(emailSMTPHost && emailSMTPUser && emailSMTPPass);
    const isDiscordEnabled = Boolean(discordWebhookURL);
    let hcaptchaMode = ``;
    hcaptchaMode = hcaptchaSecret === `0x0000000000000000000000000000000000000000` ? `Developer Mode` : `Production Mode`;
    response.render(`debug.ejs`, {
        projectName,
        ourImage: `${ https }://${ request.get(`host`) }/img/logo.png`,
        gitMessage,
        bannedUsernames: [...bannedUsernames],
        supportedFeaturedContentUrls: [...supportedFeaturedContentUrls],
        themes: [...themes],
        isStripeEnabled,
        isEmailEnabled,
        dev: development,
        https,
        isDiscordEnabled,
        hcaptchaMode,
    });
});

export default router;
