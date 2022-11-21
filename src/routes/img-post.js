import express from 'express';
import SQLite from 'better-sqlite3';
import multer from 'multer';
import path from 'node:path';
import { https } from '../app.js';
import
{
    VER_STATUS,
    checkAuthenticated
} from '../functions.js';

const sql = new SQLite(`./src/db.sqlite`);

const router = new express.Router();

const storage = multer.diskStorage(
    {
        destination: `./src/public/img/ugc/`,
        filename: (request, file, callback) =>
        {
            const fileName = `${ Date.now() }${ path.extname(file.originalname) }`;
            callback(undefined, fileName);
        }
    }
);
const uploadImage = multer({ storage }).single(`photo`);

router.post(`/`, uploadImage, checkAuthenticated, (request, response) =>
{
    const userEmail = request.user;
    const userUsername = sql.prepare(`SELECT * FROM userAuth WHERE email = ?`).get(userEmail).username;
    const isEmailVerified = sql.prepare(`SELECT * FROM users WHERE username = ?`).get(userUsername).verified;
    if (isEmailVerified === VER_STATUS.AWAITING_VERIFICATION)
        return response.redirect(`/edit?message=Please verify your email address before uploading an image.&type=error`);
    if (request.file)
        return response.json({ url: `${ https }://${ request.get(`host`) }/img/ugc/${ request.file.filename }` });
    return response.send(`Image upload failed.`);
});

export default router;
