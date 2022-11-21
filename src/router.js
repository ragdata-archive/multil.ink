import csurf from '@dr.pogodin/csurf';
import express from 'express';
import { createRequire } from "node:module";
import billing from './routes/billing.js';
import debug from './routes/debug.js';
import deleteAccount from './routes/delete.js';
import edit from './routes/edit.js';
import forgotpassword from './routes/forgotpassword.js';
import home from './routes/home.js';
import imgPost from './routes/img-post.js';
import login from './routes/login.js';
import logout from './routes/logout.js';
import privacy from './routes/privacy.js';
import profile from './routes/profile.js';
import register from './routes/register.js';
import report from './routes/report.js';
import resendactivationemail from './routes/resendactivationemail.js';
import resetpassword from './routes/resetpassword.js';
import staff from './routes/staff.js';
import tos from './routes/tos.js';
import upgrade from './routes/upgrade.js';
import verifyemail from './routes/verifyemail.js';
import webhook from './routes/webhook.js';

const require = createRequire(import.meta.url);

const { dev } = require(`./config.json`);

let {
    https,
} = require(`./config.json`);

if (dev)
    https = false;

https = https ? `https` : `http`;

const csrfProtection = csurf({
    cookie: {
        httpOnly: true,
        secure: https === `https`,
        sameSite: `strict`,
        maxAge: 1000 * 60 * 60 * 24 * 7, // 7d
    },
});
const router = new express.Router();

// Routes that need to be above everything else
router.use(`/webhook`, webhook);
router.use(`/img`, imgPost);
router.use(`/`, csrfProtection, home);
// Account Related
router.use(`/edit`, csrfProtection, edit);
router.use(`/login`, csrfProtection, login);
router.use(`/register`, csrfProtection, register);
router.use(`/logout`, csrfProtection, logout);
router.use(`/delete`, csrfProtection, deleteAccount);
router.use(`/upgrade`, csrfProtection, upgrade);
router.use(`/billing`, csrfProtection, billing);
router.use(`/verifyemail`, csrfProtection, verifyemail);
router.use(`/resendactivationemail`, csrfProtection, resendactivationemail);
router.use(`/forgotpassword`, csrfProtection, forgotpassword);
router.use(`/resetpassword`, csrfProtection, resetpassword);
// Staff Routes
router.use(`/staff`, csrfProtection, staff);
router.use(`/debug`, csrfProtection, debug);
// General Routes
router.use(`/report`, csrfProtection, report);
router.use(`/privacy`, privacy);
router.use(`/tos`, tos);
router.use(`/*`, profile);

export default router;
